// □4 回访留言——落盘通道（visitNoteBlock 纯函数层的 siyuan 面拆出：libs/utils 顶层
// Lute.New 模块级求值，vitest 链 import 即炸 suite）。薄层一个函数。
// □12 倒排：新留言插留言区顶部（最新在上）；存量非降序态写入时幂等迁移为 ts 降序
// （单笔批量事务逐块 move 到前驱后——不删不重插零丢失，中断残骸下轮判定继续收敛）。
import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
// IOperation=全局声明（tomato types/siyuan.d.ts 非 module，裸用）
import {
    buildVisitNoteBlockMD, parseVisitNoteMarkdown, sortNotesDescending,
} from "./visitNoteBlock";

/** 事务响应取块 id（appendBlock/insertBlockBefore 同形态：siyuan.call 已解包 json.data
 *  → 事务数组 [{doOperations}]，e2e 09-12 实锤；兼容对象形态防内核差异——读错=id
 *  恒 null → 成功也走「失败留窗」分支+重按重复写块） */
function txBlockID(r: unknown): string | null {
    const tx = Array.isArray(r) ? r[0] : r;
    const id = (tx as any)?.doOperations?.[0]?.id ?? null;
    return id ? String(id) : null;
}

/** 文档现有留言块（getChildBlocks 直读，markdown 字段带围栏头——parseVisitNoteMarkdown
 *  首行锚定校验，防他插件/手造 custom 块 JSON 碰巧含 v:1+text 被卷入排序搬位） */
async function existingNotes(docID: string): Promise<{ id: string; ts: number }[]> {
    const children = await siyuan.getChildBlocks(docID).catch(() => []);
    const out: { id: string; ts: number }[] = [];
    for (const b of children ?? []) {
        if ((b as any)?.type !== "custom") continue;
        const d = parseVisitNoteMarkdown(String((b as any).markdown ?? ""));
        if (d) out.push({ id: String((b as any).id), ts: d.ts });
    }
    return out;
}

/** 写一条留言：无存量=文档尾（首条同旧形态）；有存量=插留言区顶部（第一条留言块之前）。
 *  存量非降序（正排/混乱）→ 先幂等迁移为 ts 降序再插顶——feed 式新在上老在下。
 *  渲染器未注册也落块（<pre> 降级内容仍在，注册后即渲染）——留言是用户写的数据本体，
 *  宁可降级展示也不丢。返回块 id，失败/空文本 null */
export async function appendVisitNote(docID: string, text: string, ts = Date.now()): Promise<string | null> {
    if (!docID || !text.trim()) return null;
    const md = buildVisitNoteBlockMD(text.trim(), ts);
    const notes = await existingNotes(docID);
    if (!notes.length) {
        return txBlockID(await siyuan.appendBlock(md, docID));
    }
    const ordered = sortNotesDescending(notes);
    // 幂等预检（review P1）：物理序已达稳定排序序（含等 ts 在位场景）跳过迁移——
    // 否则等 ts/坏 ts 洒 0 的非降序态每次写入都发 n-1 个 no-op move 事务（内核无在位
    // 检测：刷 updated+写盘+历史+广播+同步上传，永不收敛）
    if (ordered.map(n => n.id).join() !== notes.map(n => n.id).join()) {
        // 单笔批量事务逐块 move 到前驱后（i 从 1 起——逐块完成后整链成为连续降序段，
        // ordered[0] 即段首=留言区顶部；异锚不触发「同锚多块须 reverse」坑）
        const ops = [] as IOperation[];
        for (let i = 1; i < ordered.length; i++) {
            ops.push({ action: "move", id: ordered[i].id, previousID: ordered[i - 1].id });
        }
        // 打磨批（09-13 review 观察）：原 `.catch(()=>{})` 静默吞=迁移失败无痕，且事务
        // 假成功（code 0 回显≠落盘）catch 面根本拦不到——落 Loki 留痕+复核读物理序，
        // 未收敛时改插物理首块之前（新留言恒在顶，feed 语义保住；存量序下次写入自愈）
        let migrated = false;
        try {
            await siyuan.transactions(ops);
            const after = await existingNotes(docID);
            migrated = after.map(n => n.id).join() === ordered.map(n => n.id).join();
            if (!migrated) debugLog("visitnote", "migrate verify mismatch (tx 假成功?)", "progressive");
        } catch (e) {
            debugLog("visitnote", `migrate tx fail: ${String(e)}`, "progressive");
        }
        if (!migrated) {
            return txBlockID(await siyuan.insertBlockBefore(md, notes[0].id));
        }
    }
    return txBlockID(await siyuan.insertBlockBefore(md, ordered[0].id));
}
