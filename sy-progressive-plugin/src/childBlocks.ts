// 思源 /api/block/getChildBlocks 返回行（既有全局类型 GetChildBlocks 的窄化：
// 只列本模块消费的字段 + 实测 null 语义）。实测（2026-08-30，《冰与火之歌》
// 45,173 块 + 超级块样例文档）：
// - 顶层块平铺有序（heading 容器化书也平铺），与 getBlockDOM 的 DOM 顶层逐位一致
// - content 是纯文本全文、无截断；空段落 content 为 null（markdown 键同缺）
// - subType 仅 h 块有值（"h1"~"h6"），其余 null
// □2 起供 splitVols.ts 复用（卷块映射同口径）
export type ChildBlockRow = {
    id: string;
    type?: string | null;
    subType?: string | null;
    content?: string | null;
    markdown?: string | null;
};

// 纯逻辑：getChildBlocks 行 → 分片输入（WordCountType 序列）+ textLen。
// 口径（替换 getDocBlocks 的 DOM textContent）：剥零宽后 99.5% 逐位一致；
// 图片段 content 含 alt 全文（DOM 口径≈0 字）；容器块 content≈子块文本拼接（±5%）。
// 顺序原样保持——ContentLenGroup 切窗依赖文档顺序。
// 入参 null/undefined（siyuan.call 两态吞错：code!=0 返 null、网络异常返 undefined）
// 视为 API 失败抛错，与真空文档的 []（正常返回 0 块）严格区分——
// 静默兜成空序列会让统计卡显示全 0 且可一路注册出空索引书。
// □7 空段落片陷阱（2026-09-09 主实例实锤）：空段落（markdown/content 双空）占片槽
// → createPiece 的 createNote 全片无 markdown 拒建 → startToLearn 重试烧完报「内容已
// 失效」→ point 卡死，书砖住。这里滤掉双空块治本（空段落不进索引）。双字段守卫：
// 空 alt 图片 content 空但 markdown 有值（createNote/fullfilContent 均按 markdown 判
// 有内容）必须保留；旧内核 getChildBlocks 无 markdown 字段时 content 有值同样保留。
// rawCount = 滤前行数：AddBook □3 块数悬殊守卫须与 SQL 计数同口径（SQL 含空块），
// 用滤后 blocks.length 会造成系统性差值=空块数，空段占比高的书（PDF/词表导入常见）
// 会被永久误拦在加书门外（review P1-2）。
export function childBlocksToWordCount(children: ChildBlockRow[]): { blocks: WordCountType[], textLen: number, rawCount: number } {
    if (children == null) throw new Error("childBlocksToWordCount: getChildBlocks failed (null/undefined)");
    const blocks = children
        .filter(c => c.markdown || c.content)
        .map((c) => ({
            id: c.id,
            count: (c.content ?? "").length,
            // type 缺失兜底空串：HeadingGroup 按非标题安全降级
            type: c.type ?? "",
            subType: c.subType ?? "",
        }));
    return { blocks, textLen: blocks.reduce((sum, b) => sum + b.count, 0), rawCount: children.length };
}
