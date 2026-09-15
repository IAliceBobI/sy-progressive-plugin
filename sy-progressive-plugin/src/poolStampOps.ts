// 池宽松化（loosemat □6）：住进池夹=素材——ws 监听文档级 moveDocs/create，
// 落点父=池夹（custom-progmark 五锚）即自动盖章 custom-pdigest-ctime=<归属键>#now。
// 上半区纯函数（TDD 见 tests/unit/poolStampOps.test.ts），下半区 IO 接线（池夹
// 缓存/幂等盖章），行为由 dev 实例 e2e 覆盖——与 matManualOps.ts 同款纪律。
// 语义边界：盖章幂等（已有 ctime 含 🔨 不覆写）；拖出池夹零动作（位置无关=
// 现状语义保持）；直接父判定（池内更深子树不递归）；摘要总夹/札记匣本体=容器不认。
import { TEMP_CONTENT } from "../../sy-tomato-plugin/src/libs/gconst";
import { parentIDFromDocPath } from "./progData";

/** 池夹锚的五种 kind（digestdir 主力/digestdiru 书下/digestdirh 总夹/
 *  digestdirfree 源下自由/notedir 札记匣内源夹）——归属键自带于锚值（多书消歧） */
const POOL_ANCHOR_KINDS = new Set(["digestdir", "digestdiru", "digestdirh", "digestdirfree", "notedir"]);

/** 池夹锚值 → 归属键（书=bookID/自由态=源 docID）；非池夹锚返 ""。
 *  三段强校验（kind/TEMP_CONTENT/键）防同族非池锚与伪装值 */
export function poolAnchorKey(ialValue: string): string {
    const seg = (ialValue ?? "").split("#");
    if (seg.length !== 3 || !POOL_ANCHOR_KINDS.has(seg[0]) || seg[1] !== TEMP_CONTENT) return "";
    return seg[2] || "";
}

/** 文档 .sy 路径 → 自身 id（末段剥 .sy） */
export function docIDOfPath(p: string): string {
    const segs = (p ?? "").replace(/\.sy$/, "").split("/").filter(Boolean);
    return segs[segs.length - 1] ?? "";
}

export interface PoolStampTarget {
    docID: string;
    /** 归属键：书池=bookID、自由态=源 docID（盖章值 `<key>#now`，末段 13 位毫秒=
     *  digestUtils/writeBook 两写点同格式） */
    key: string;
}

/** moveDocs 广播（data.moves[].newPath）→ 盖章计划：直接父∈池夹才入计划
 *  （父解析复用 progData.parentIDFromDocPath——根层 ""=无父零动作） */
export function stampPlanFromMoves(
    moves: { newPath?: string }[] | null | undefined,
    poolOf: (folderID: string) => string,
): PoolStampTarget[] {
    const out: PoolStampTarget[] = [];
    for (const m of moves ?? []) {
        if (!m?.newPath) continue;
        const key = poolOf(parentIDFromDocPath(m.newPath));
        const docID = docIDOfPath(m.newPath);
        if (key && docID) out.push({ docID, key });
    }
    return out;
}

/** create 广播（data.path）→ 盖章计划 */
export function stampPlanFromCreate(
    path: string,
    poolOf: (folderID: string) => string,
): PoolStampTarget[] {
    const key = poolOf(parentIDFromDocPath(path));
    const docID = docIDOfPath(path);
    return key && docID ? [{ docID, key }] : [];
}

// ============ IO 段（ws 分派/池夹缓存/盖章；行为由 dev 实例 e2e 覆盖） ============

import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
import { PDIGEST_CTIME, MarkKey } from "../../sy-tomato-plugin/src/libs/gconst";

/** 池夹缓存（folderID → 归属键；10s TTL）。锚自带归属键——SQL 按 5 前缀扫
 *  attributes 表一次成型（TEMP_CONTENT 校验在 poolAnchorKey，CJK 不进 SQL）；
 *  空集照常缓存（本库无池=常态）。强刷走 in-flight 共享+300ms 节流（review P1-2：
 *  create 每文档独立广播，导入洪峰并发 miss 不得各打一发全表 like 扫） */
let poolCache: { at: number; map: Map<string, string> } | null = null;
const POOL_CACHE_TTL_MS = 10_000;
let poolRefreshInFlight: Promise<Map<string, string>> | null = null;
let poolLastForceAt = 0;

async function poolFolders(force = false): Promise<Map<string, string>> {
    if (!force && poolCache && Date.now() - poolCache.at < POOL_CACHE_TTL_MS) return poolCache.map;
    if (force) {
        if (poolRefreshInFlight) return poolRefreshInFlight;
        if (Date.now() - poolLastForceAt < 300) return poolCache?.map ?? new Map();
        poolLastForceAt = Date.now();
        poolRefreshInFlight = (async () => {
            const rows = (await siyuan.sql(
                `select block_id as id, value from attributes where name='${MarkKey}' and (` +
                `value like 'digestdir#%' or value like 'digestdiru#%' or value like 'digestdirh#%' or ` +
                `value like 'digestdirfree#%' or value like 'notedir#%') limit 100000`,
            ).catch(() => null)) as any[] | null;
            const map = new Map<string, string>();
            for (const r of rows ?? []) {
                const key = poolAnchorKey(String(r.value ?? ""));
                if (key) map.set(String(r.id), key);
            }
            poolCache = { at: Date.now(), map };
            return map;
        })();
        try {
            return await poolRefreshInFlight;
        } finally {
            poolRefreshInFlight = null;
        }
    }
    return poolFolders(true);
}

/** folderID → 归属键。**miss 即强刷**（e2e 实锤冷启动竞态：夹具连发 create 事件
 *  把缓存钉在锚落盘前的空态，10s TTL 命中+miss 刷新门=整窗零盖章；文档级事件
 *  人步频，miss 一次一发轻 SQL 可忍） */
async function poolKeyOf(folderID: string): Promise<string> {
    if (!folderID) return "";
    const hit = (await poolFolders()).get(folderID);
    if (hit) return hit;
    return (await poolFolders(true)).get(folderID) ?? "";
}

/** 盖章：幂等（已有 ctime 含 🔨 不覆写——位置无关身份保持，跨书拖入不改籍）。
 *  读闪烁重试 250ms 一次（applyPairs 先例）；create 模式重试仍空=照盖（新文档无
 *  历史可保护——插件自建摘抄的 create→setBlockAttrs 两步竞态为良性：同键同书、
 *  ts 毫秒差、250ms 重试窗大概率已见真值跳过），move 模式仍空=跳过（老文档误覆写
 *  既有身份 > 漏盖一次，下次移动自然补） */
async function stampOne(t: PoolStampTarget, mode: "move" | "create") {
    try {
        let attrs = await siyuan.getBlockAttrs(t.docID).catch(() => null);
        if (attrs == null || Object.keys(attrs).length === 0) {
            await new Promise(r => setTimeout(r, 250));
            attrs = await siyuan.getBlockAttrs(t.docID).catch(() => null);
        }
        if (attrs && attrs[PDIGEST_CTIME]) return;
        // move 保守跳过须含空 map 形态（review P1-1：读闪烁两连形态=null 或 {}，
        // 只判 null 会让 {} 绕过保护误覆写锤态/既有身份）
        if (mode === "move" && (attrs == null || Object.keys(attrs).length === 0)) {
            debugLog("matops", `池盖章跳过 doc=${t.docID}（读闪烁两连空+老文档保守不动，下次移动补）`, "progressive");
            return;
        }
        const value = `${t.key}#${Date.now()}`;
        await siyuan.setBlockAttrs(t.docID, { [PDIGEST_CTIME]: value } as any);
        debugLog("matops", `池盖章 doc=${t.docID} ctime=${value}（住进池夹=素材）`, "progressive");
    } catch (e) {
        debugLog("matops", `池盖章失败 doc=${t.docID}: ${e}`, "progressive");
    }
}

/** ws-main 入口（index.ts 既有 ws 绑定转发；cmd=moveDocs/create 外零动作——
 *  广播形态=内核 MoveDocs defer 推 moves[]、PushCreate 推 path，全 cmd 经前端
 *  index.ts emitToPlugins 转发）。全程吞错：记账员不打扰编辑主链 */
export async function onPoolStampWsMain(detail: any): Promise<void> {
    try {
        const plans: { list: PoolStampTarget[]; mode: "move" | "create" }[] = [];
        if (detail?.cmd === "moveDocs") {
            const moves = detail?.data?.moves;
            if (!Array.isArray(moves) || moves.length === 0) return;
            // 父 id 去重再逐个反查（批量移动同落点=一次池夹判定）
            const uniq = [...new Set(moves.map(m => parentIDFromDocPath(m?.newPath ?? "")).filter(Boolean))];
            const keyOf = new Map<string, string>();
            for (const fid of uniq) keyOf.set(fid, await poolKeyOf(fid));
            const poolOf = (id: string) => keyOf.get(id) ?? "";
            plans.push({ list: stampPlanFromMoves(moves, poolOf), mode: "move" });
        } else if (detail?.cmd === "create") {
            const p = detail?.data?.path;
            if (!p) return;
            const fid = parentIDFromDocPath(String(p));
            const key = fid ? await poolKeyOf(fid) : "";
            if (key) plans.push({ list: stampPlanFromCreate(String(p), () => key), mode: "create" });
        } else {
            return;
        }
        if (detail?.cmd === "moveDocs" && plans.every(p => p.list.length === 0)) {
            debugLog("matops", `moveDocs 零盖章（落点非池夹）：newPaths=[${(detail?.data?.moves ?? []).map((m: any) => m?.newPath ?? "").join(",")}]`, "progressive");
        }
        for (const { list, mode } of plans) for (const t of list) await stampOne(t, mode);
    } catch (e) {
        debugLog("matops", `池盖章处理异常（降级零动作）: ${e}`, "progressive");
    }
}
