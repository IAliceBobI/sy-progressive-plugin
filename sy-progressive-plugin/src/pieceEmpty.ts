// □7 空段落片陷阱（2026-09-09 主实例实锤，dev 复现）：片的块全部存活但全无
// markdown（典型=整片只有一个空段落）时，createPiece→createNote 拒建返回 ""，与
// 「索引未就绪」在调用方眼里同形——重试 30 轮烧完弹「该分片内容已失效」，point
// 卡死在空片上，此后每次翻片都重复这套循环，书砖住。同族变体（review P1-4）：
// 片内块全数被删（书阅读中途被编辑，索引残留悬空 ID）症状完全同形。
// 判定口径与 createNote 的 hasContent、fullfilContent 的 filter(!!markdown) 同一
// 「markdown 判内容」（""/null/字段缺失三态皆空，空白串三处同为有内容）。

/** refill 守卫（review P1-3 口径）：存活行无一可插内容。混合悬空+空片时行数
 *  不足的「全数存活」判会漏放行——真正要防的不可逆终态是 clearAll 后插不回
 *  任何东西，故只看存活行有没有内容，不要求行数足额。 */
export function pieceRowsNoneInsertable(rows: { markdown?: string | null }[]): boolean {
    return rows.length > 0 && rows.every(r => !r.markdown);
}

/** 跳片判死（startToLearn □7 自愈）：存活行全无内容 且 缺行块全数经内核实时
 *  通道（checkBlockExist，不吃 SQL 索引延迟）确认已删 = 永久空片，跳点前进；
 *  缺行有活块（索引追赶窗口）→ false 交上层走原重试。rows=[] 全悬空时存活行
 *  空判定 vacuous true，结论全由死活旗标决定。 */
export function pieceUnbuildable(
    rows: { markdown?: string | null }[],
    missingDeadFlags: boolean[],
): boolean {
    return rows.every(r => !r.markdown) && missingDeadFlags.every(Boolean);
}
