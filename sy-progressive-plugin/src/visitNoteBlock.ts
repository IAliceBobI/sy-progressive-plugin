// □4 回访留言块——纯函数层（tailCardBlock 同模式：渲染器在 visitNoteRender.ts、
// siyuan 落盘通道在 visitNoteAppend.ts——libs/utils 顶层连 globals.ts 的 Lute.New
// 模块级求值，vitest 链 import 即炸 suite，分层红线同 helper/tailCard 族）。
// 留言=对象文档（片/摘抄/素材）内的内容块：随文档同步、零新存储、永不进用户原书。
// 围栏头=插件名/类型（tail-card 同款命名族）；JSON 单行天然过内核
// isCustomBlockContentValid（content 含纯 ;;; 行拒写契约——tailCardBlock 头注释同源）。

export const VISIT_NOTE_BLOCK_TYPE = "visit-note";
export const VISIT_NOTE_FENCE = ";;;sy-progressive-plugin/visit-note";

export interface VisitNoteData { v: 1; text: string; ts: number; }

export function buildVisitNoteBlockMD(text: string, ts: number): string {
    return `${VISIT_NOTE_FENCE}\n${JSON.stringify({ v: 1, text, ts })}`;
}

/** 容错解析：坏 JSON/版本不符/字段类型缺失 → null（渲染层显占位）；ts 缺损洗 0 */
export function parseVisitNoteContent(content: string): VisitNoteData | null {
    let raw: unknown;
    try { raw = JSON.parse(content); } catch { return null; }
    if (typeof raw !== "object" || raw === null) return null;
    const o = raw as Record<string, unknown>;
    if (o.v !== 1 || typeof o.text !== "string") return null;
    return { v: 1, text: o.text, ts: typeof o.ts === "number" && Number.isFinite(o.ts) ? o.ts : 0 };
}

/** SQL markdown 列形态（围栏头+JSON 行+闭合 ;;;）→ 数据。查询通道（面板行/火苗
 *  tooltip 批查）吃 blocks.markdown 非渲染通道的纯 content——整段喂 parseVisitNoteContent
 *  会被尾部闭合 ;;; 炸 JSON.parse 恒 null（e2e 09-12 实锤=读入口永不显示），行级扫描
 *  同 isRPCardMarkdown 先例：跳空行/;;; 行取首个 JSON 行。 */
export function parseVisitNoteMarkdown(md: string): VisitNoteData | null {
    const lines = md.split("\n");
    // 首行 trim 后前缀匹配（isRPCardMarkdown 的 trim 写法对齐、比对=前缀非全等——
    // 与查询面 SQL like 'fence%' 前缀语义一致，两侧同面）
    if (!lines[0]?.trim().startsWith(VISIT_NOTE_FENCE)) return null;
    for (let i = 1; i < lines.length; i++) {
        const t = lines[i].trim();
        if (!t || t === ";;;") continue;
        return parseVisitNoteContent(t);
    }
    return null;
}

// ============ □12 倒排（最新在上，bear 09-13 点名） ============

/** 留言区序判定：ts 严格递减=feed 目标态（倒排）。空/单条平凡 true；正排（老→新，
 *  存量 append 形态）、混乱（迁移中断残骸/用户手排）、等 ts 都 false=需重排。
 *  判定取「非降序即重排」而非「仅正排才迁」：中断自愈（部分迁移态下轮继续）；
 *  手排不被保护——留言=feed 语义（产品定位原话「留言应该倒着排」） */
export function isDescendingNotes<T extends { ts: number }>(notes: T[]): boolean {
    for (let i = 1; i < notes.length; i++) {
        if (notes[i - 1].ts <= notes[i].ts) return false;
    }
    return true;
}

/** 迁移目标序：ts 降序稳定排序（等 ts 保持原相对序）。泛型带 id 供 IO 层直用 */
export function sortNotesDescending<T extends { ts: number }>(notes: T[]): T[] {
    return notes.map((n, i) => ({ n, i }))
        .sort((a, b) => b.n.ts - a.n.ts || a.i - b.i)
        .map(x => x.n);
}
