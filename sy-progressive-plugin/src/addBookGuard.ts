// □3 块数悬殊判定（AddBook process 拦截口）。
// 分片数据源 = getChildBlocks（内核树缓存、实时，只返回文档顶层块）；对照 = SQL root_id
// 计数（索引，滞后于编辑，含全部嵌套块）。两通道天然不对齐：SQL 恒 ≥ 树——多出的
// 恒为嵌套块（列表项/超级块子块等，结构性多计、与索引进度无关）。因此只拦「SQL 少
// 于树缓存」的单向背离：那才是索引滞后（树缓存新增块未入 SQL → 分片索引引用悬空块
// → 出片重试 30 连败，2026-09-09 事故家族）。
// 「SQL 多」方向不拦（2026-09-12 有偈品事故：经文类列表书嵌套块占全树 30%，旧双向
// 对账将其永久误判为索引未建全，用户重试无门）：嵌套多计无害（分片只用顶层活块）；
// 删块残留也多计，但死块 id 不进分片索引，同样不影响出片。
// 判据：滞后量 >5 且 >20%（绝对阈值防小书误报；SQL 计数含文档块自身，先减 1 再比；
// tiny 书 ±2 块属正常抖动）。
export function blockCountDivergent(treeCount: number, sqlCount: number): boolean {
    const childSql = Math.max(0, sqlCount - 1); // root_id=书ID 的 SQL 行含文档块自身
    if (childSql === 0) return false; // 索引 0 行=未建全，由出片链/半注册自愈兜底，不在此拦
    const lag = treeCount - childSql; // SQL 少于树的量；负值=嵌套多计，恒放行
    return lag > 5 && lag / childSql > 0.2;
}
