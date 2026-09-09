// □3 块数悬殊判定（AddBook process 拦截口）。
// 分片数据源 = getChildBlocks（内核树缓存、实时）；对照 = SQL root_id 计数（索引，
// 滞后于编辑）。两通道大幅背离 = 书处在编辑/索引重建窗口，此刻分片易产坏索引
// （2026-09-09 跳片事故家族：索引悬空块 → 出片重试 30 连败）。
// 判据：相对差 >20% 且绝对差 >5——绝对阈值防小书误报（SQL 计数含文档块自身，
// 先减 1 再比；tiny 书 ±2 块属正常抖动）。
export function blockCountDivergent(treeCount: number, sqlCount: number): boolean {
    const childSql = Math.max(0, sqlCount - 1); // root_id=书ID 的 SQL 行含文档块自身
    if (childSql === 0) return false; // 索引 0 行=未建全，由出片链/半注册自愈兜底，不在此拦
    const diff = Math.abs(treeCount - childSql);
    return diff > 5 && diff / childSql > 0.2;
}
