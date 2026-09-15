// 知识库同步引擎（knowledgebox 原型期，2026-09-14）：
// 把白名单文档（含子树）增量同步到外部知识库平台（□3 起通道走 knowledgeChannel 层，
// 首发=智谱；同步引擎/问答面板/设置卡/MCP 四口共用该 adapter）。
// 存储：petal knowledge-sync.json
//   { list:  [{docID, title, hpath, addedAt}]
//     state: {[docID]: {hash, syncedAt, ok, err, changed?}} }
// 增量判据：getDocTreeMarkdown 拼接全文 → djb2 hash（变更检测用途，非密码学）；
// 与 state.hash 不同（或无记录）才推——通道侧 uploadDoc 本身幂等（先删同名再建），
// 引擎层再加 hash 闸避免无谓外发。扫描（checkChanges）只算 hash 不打外网。
import type { ToolEnv } from "./agentTools";
import type { KbChannel } from "./knowledgeChannel";
import type { Plugin } from "siyuan";
import { getTomatoPluginInstance, siyuan } from "./utils";

const STORE_PATH = "knowledge-sync.json";

export interface KSyncItem {
    docID: string;
    title: string;
    hpath: string;
    addedAt: number;
}
export interface KSyncState {
    hash: number;
    syncedAt: number;
    ok: boolean;
    err?: string;
    /** checkChanges 扫描标记：本地内容已偏离上次成功同步（同步时清除） */
    changed?: boolean;
}
export interface KSyncData {
    list: KSyncItem[];
    state: Record<string, KSyncState>;
}

function emptyData(): KSyncData {
    return { list: [], state: {} };
}

export async function loadKS(): Promise<KSyncData> {
    const plugin = getTomatoPluginInstance() as unknown as Plugin;
    try {
        // loadData 契约（agentToolBridge 同款）：缺文件回 ""，.json 回已解析对象
        const raw = await plugin.loadData(STORE_PATH);
        if (raw && typeof raw === "object") {
            const d = raw as KSyncData;
            if (Array.isArray(d.list) && d.state && typeof d.state === "object") return d;
        }
    } catch { /* 坏文件当空库 */ }
    return emptyData();
}

export async function saveKS(data: KSyncData): Promise<void> {
    const plugin = getTomatoPluginInstance() as unknown as Plugin;
    await plugin.saveData(STORE_PATH, JSON.stringify(data));
}

/** djb2（变更检测够用；32 位回退防负数作 JSON 键不稳） */
function djb2(s: string): number {
    let h = 5381;
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    }
    return h >>> 0;
}

async function currentHash(env: ToolEnv, docID: string): Promise<{ hash: number | null; markdown: string }> {
    const rows = await env.getDocTreeMarkdown(docID);
    if (!rows?.length) return { hash: null, markdown: "" };
    const markdown = rows.map(r => r.markdown).join("\n\n");
    return { hash: djb2(markdown), markdown };
}

export async function addToSync(docID: string): Promise<KSyncData> {
    const data = await loadKS();
    if (data.list.some(i => i.docID === docID)) return data;
    const row = await siyuan.getRowByID(docID);
    data.list.push({
        docID,
        title: String(row?.content ?? docID),
        hpath: String(row?.hpath ?? ""),
        addedAt: Date.now(),
    });
    await saveKS(data);
    return data;
}

export async function removeFromSync(docIDs: string[]): Promise<KSyncData> {
    const data = await loadKS();
    const kill = new Set(docIDs);
    data.list = data.list.filter(i => !kill.has(i.docID));
    for (const id of docIDs) delete data.state[id];
    await saveKS(data);
    return data;
}

export async function inSync(docID: string): Promise<boolean> {
    const data = await loadKS();
    return data.list.some(i => i.docID === docID);
}

export interface SyncProgress {
    docID: string;
    title: string;
    done: number;
    total: number;
    ok: boolean;
    skipped?: boolean;
    err?: string;
}

/**
 * 单文档同步：hash 闸 + channel.uploadDoc（幂等重建）。返回 true=有实质推送（成功或失败都更新 state）。
 */
export async function syncDoc(env: ToolEnv, channel: KbChannel, data: KSyncData, docID: string, preList?: import("./knowledgeChannel").KbDocInfo[]): Promise<{ pushed: boolean; ok: boolean; err?: string }> {
    const item = data.list.find(i => i.docID === docID);
    if (!item) return { pushed: false, ok: false, err: "不在同步白名单" };
    let hash: number | null;
    let markdown = "";
    try {
        ({ hash, markdown } = await currentHash(env, docID));
    } catch (e: any) {
        data.state[docID] = { hash: 0, syncedAt: Date.now(), ok: false, err: `导出失败：${e?.message ?? e}` };
        return { pushed: true, ok: false, err: data.state[docID].err };
    }
    if (hash == null) {
        data.state[docID] = { hash: 0, syncedAt: Date.now(), ok: false, err: "文档不存在或无内容" };
        return { pushed: true, ok: false, err: data.state[docID].err };
    }
    const prev = data.state[docID];
    if (prev?.ok && prev.hash === hash) {
        prev.changed = false;
        return { pushed: false, ok: true };
    }
    try {
        await channel.uploadDoc(docID, item.title, markdown, preList);
        data.state[docID] = { hash, syncedAt: Date.now(), ok: true };
        return { pushed: true, ok: true };
    } catch (e: any) {
        const err = String(e?.message ?? e).slice(0, 200);
        data.state[docID] = { hash, syncedAt: Date.now(), ok: false, err };
        return { pushed: true, ok: false, err };
    }
}

/** in-flight 守卫（review P1-2）：autoTimer 到期与手动「立即同步」并发时两个 syncAll 实例
 *  各自 loadKS 迭代、同文档 uploadDoc 先删后传交错 → 平台侧留同名双份且之后 hash 闸
 *  永久 skip 无自愈——single-flight 让并发调用共享同一次执行 */
let syncAllInflight: Promise<{ ok: number; fail: number; skip: number }> | null = null;

/** 全量同步白名单（逐条串行——外部 API 打并发易限流），onProgress 每条回调；返回汇总 */
export async function syncAll(env: ToolEnv, channel: KbChannel, onProgress?: (p: SyncProgress) => void): Promise<{ ok: number; fail: number; skip: number }> {
    if (syncAllInflight) return syncAllInflight;
    syncAllInflight = doSyncAll(env, channel, onProgress).finally(() => { syncAllInflight = null; });
    return syncAllInflight;
}

async function doSyncAll(env: ToolEnv, channel: KbChannel, onProgress?: (p: SyncProgress) => void): Promise<{ ok: number; fail: number; skip: number }> {
    const data = await loadKS();
    let ok = 0, fail = 0, skip = 0;
    // 拉一次平台清单供幂等删除按名对齐（全部循环复用，免每文档全量翻页）；
    // 拉取失败留给 uploadDoc 单文档路径自兜。内容未变的文档 hash 闸在 syncDoc 内拦，
    // 是否真推无法预判（hash 现算），白名单非空即拉一次成本可忽略
    let preList: import("./knowledgeChannel").KbDocInfo[] | undefined;
    if (data.list.length) {
        try { preList = await channel.listDocs(); } catch { /* 单文档路径自兜 */ }
    }
    for (let i = 0; i < data.list.length; i++) {
        const item = data.list[i];
        const r = await syncDoc(env, channel, data, item.docID, preList);
        if (!r.pushed) {
            skip++;
            onProgress?.({ docID: item.docID, title: item.title, done: i + 1, total: data.list.length, ok: true, skipped: true });
            continue;
        }
        r.ok ? ok++ : fail++;
        onProgress?.({ docID: item.docID, title: item.title, done: i + 1, total: data.list.length, ok: r.ok, err: r.err });
        // 每条落一次盘：中断不丢已同步进度（通道重建是幂等的，重跑安全）
        await saveKS(data);
    }
    await saveKS(data);
    return { ok, fail, skip };
}

/** 只算 hash 标记 changed（不打外网）：面板「检查变更」/自动同步前的轻量预检 */
export async function checkChanges(env: ToolEnv): Promise<KSyncData> {
    const data = await loadKS();
    for (const item of data.list) {
        try {
            const { hash } = await currentHash(env, item.docID);
            const prev = data.state[item.docID];
            if (prev?.ok && hash != null && prev.hash !== hash) {
                prev.changed = true;
            } else if (prev) {
                prev.changed = false;
            }
        } catch { /* 单条导出失败不动 state，同步时自然暴露 */ }
    }
    await saveKS(data);
    return data;
}
