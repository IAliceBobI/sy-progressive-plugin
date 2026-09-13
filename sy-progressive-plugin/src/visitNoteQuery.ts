// □4 回访留言——查询面（读入口共用：复习计划行+写作火苗 tooltip）。SQL 检索按
// custom 块（type='custom'——computeTargets rpcard 底表同款实证）+围栏头前缀匹配，
// 取最新一块解析前半句。留言是建块后回访才读（非写后立读窗口），无索引延迟顾虑。
import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
import { PDIGEST_CTIME } from "../../sy-tomato-plugin/src/libs/gconst";
import { parseVisitNoteMarkdown, VISIT_NOTE_FENCE } from "./visitNoteBlock";

/** 最近一条留言前半句（≤40 字符，截断补 …）；无留言/查询失败 → null */
export async function latestVisitNotePreview(docID: string): Promise<string | null> {
    if (!docID) return null;
    const map = await latestVisitNotePreviews([docID]);
    return map.get(docID) ?? null;
}

/** markdown → 前半句（两查询面共用；解析=null 跳过）。40 字符按码点切（emoji 代理
 *  对在 code unit 边界撕裂成替换符——review P2） */
function previewOf(md: string): string | null {
    const d = parseVisitNoteMarkdown(md);
    if (!d || !d.text.trim()) return null;
    const t = d.text.trim().replace(/\s+/g, " ");
    const cps = Array.from(t);
    return cps.length > 40 ? cps.slice(0, 40).join("") + "…" : t;
}

/** 批量版（面板一次 load 用）：docID→前半句；每文档取最新一块。in 列表超长分批防
 *  SQL 上限（百级行=单批无虞，防御性 500 一切） */
export async function latestVisitNotePreviews(docIDs: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const ids = [...new Set(docIDs.filter(Boolean))];
    if (!ids.length) return out;
    try {
        const rowsAll: any[] = [];
        for (let i = 0; i < ids.length; i += 500) {
            const chunk = ids.slice(i, i + 500).map(id => `"${id}"`).join(",");
            rowsAll.push(...(await siyuan.sql(
                `select root_id, markdown, created from blocks where type='custom' and root_id in (${chunk}) and markdown like '${VISIT_NOTE_FENCE}%' order by created desc limit 10000000`)) as any[] ?? []);
        }
        const latest = new Map<string, string>(); // rootID→最新 markdown（created 降序首见即最新）
        for (const r of rowsAll ?? []) {
            const rid = String(r.root_id ?? "");
            if (rid && !latest.has(rid)) latest.set(rid, String(r.markdown ?? ""));
        }
        for (const [rid, md] of latest) {
            const t = previewOf(md);
            if (t != null) out.set(rid, t);
        }
    } catch (e) {
        debugLog("prog.vnote", `previews fail: ${e}`, "progressive");
    }
    return out;
}

/** 书级最新留言前半句（写作火苗 tooltip 用）：该书 ctime 锚文档面（素材+摘抄）内
 *  取最新一块。无留言/失败 → null（tooltip 不加行） */
export async function latestVisitNoteOfBook(bookID: string): Promise<string | null> {
    if (!bookID) return null;
    try {
        const anchorRows = (await siyuan.sql(
            `select block_id from attributes where name='${PDIGEST_CTIME}' and (value like '${bookID}#%' or value like '🔨#${bookID}#%') limit 10000000`)) as any[] ?? [];
        const ids = [...new Set((anchorRows ?? []).map(r => String(r.block_id ?? "")))].filter(Boolean);
        if (!ids.length) return null;
        // 防御性 500 上限：巨书锚面超此数，第 501+ 锚文档上的最新留言不进 tooltip
        // （SQL in 列表长度与查询成本权衡，□4 review P2 记档）
        const chunk = ids.slice(0, 500).map(id => `"${id}"`).join(",");
        const rows = (await siyuan.sql(
            `select markdown from blocks where type='custom' and root_id in (${chunk}) and markdown like '${VISIT_NOTE_FENCE}%' order by created desc limit 1`)) as any[] ?? [];
        const md = String(rows?.[0]?.markdown ?? "");
        const t = previewOf(md);
        return t;
    } catch (e) {
        debugLog("prog.vnote", `book preview fail ${bookID}: ${e}`, "progressive");
        return null;
    }
}
