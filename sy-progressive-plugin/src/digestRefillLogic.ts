// 摘抄重插纯逻辑（群反馈 2026-10-18 用户650189）：整块原样摘抄后想改断句摘抄，按行块
// 血缘（custom-progref 指向源书原文块）清空后按所选断句方式重拉，免「删卡→进原文重选→
// 重摘」三步。纯函数无 DOM/SiYuan 依赖（originTrace.ts 先例）；SiYuan API 侧在
// Progressive.digestRefill 消费。
//
// 血缘事实源：行块 IAL custom-progref=源书原文块 id（digestUtils.getDigestMd 建行写入 /
// SplitSentence 断句产物同键），断句产物多行同源=同块切多行，收集须去重保序。截选文字
// 行的 progref 也指向源块——精确选区不可恢复（v1 静态提示按整段恢复），血缘仍可重插。

/** 摘抄行（SQL 侧最小面：ial 列即够——getChildBlocks 拿行序 + getRows 取 ial 的通道产物） */
export interface DigestLineRow {
    id?: string;
    ial?: string | null;
}

/** 源块存活行（getRows(progrefs, "id,markdown,...") 产物：已删块不返回；markdown 判内容
 *  ——""/null/缺失三态皆空，pieceEmpty.pieceRowsNoneInsertable 同口径） */
export interface SourceAliveRow {
    id?: string;
    markdown?: string | null;
}

export type DigestRefillPlan =
    | { ok: true; ids: string[] }
    | { ok: false; reason: "no-progref" | "source-all-dead" };

/** 行集合 → 保序去重 progref 列表（文档序即 getChildBlocks 序；正则形态沿
 *  SplitSentence.getIDFromIAL 先例，不 import tomato strUtils 保持零依赖） */
export function collectDigestProgrefs(rows: DigestLineRow[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of rows ?? []) {
        const ref = (r?.ial ?? "").match(/custom-progref="([^"]+)"/)?.[1] ?? "";
        if (!ref || seen.has(ref)) continue;
        seen.add(ref);
        out.push(ref);
    }
    return out;
}

/** 行集合+源块存活表 → 可插判定/中止原因。fail-closed（clearAll 不可逆，全灭即中止）；
 *  部分死=按幸存重插缺行不拦（与 refillPiece 对悬空 id 的容忍同向：清空可回填优先） */
export function planDigestRefill(rows: DigestLineRow[], sourceRows: SourceAliveRow[]): DigestRefillPlan {
    const progrefs = collectDigestProgrefs(rows);
    if (progrefs.length === 0) return { ok: false, reason: "no-progref" };
    const alive = new Set(
        (sourceRows ?? []).filter(r => !!r?.id && !!r.markdown).map(r => r.id as string));
    const ids = progrefs.filter(id => alive.has(id));
    if (ids.length === 0) return { ok: false, reason: "source-all-dead" };
    return { ok: true, ids };
}
