// 可见性期2 □2 A（handoff 拍板方案 1 活状态图标）：摘抄四态判定与图标映射纯函数。
// 四态=留档（无任何标记）/背诵（入 riff 卡）/复访（文档级 PdigestReviewKey）/思考（块级 ReviewKey）。
// 状态是活的——列表/菜单每次打开现查实时 IAL，无缓存；判定结果供期3 复习计划面板复用。
// 无 DOM/SiYuan 依赖（digestList 同款纯函数约定），数据采集在 digestMarker/reviewMenu 消费层。

/** 摘抄四态 */
export type DigestState = "archive" | "recite" | "review" | "think";

/**
 * 调度有效性口径对齐 reviewQueue.parseReview：`q#…`/`s#…` 前缀=有调度（曲线/日程），
 * `done`/空/垃圾值=无。只判有无不解析数值，故轻量内联——两处口径须同步改。
 */
function hasSched(value?: string | null): boolean {
    return !!value && (value.startsWith("q#") || value.startsWith("s#"));
}

/**
 * 四态判定。优先级：复访（文档级显式调度）> 思考（块级曲线）> 背诵（riff 自动产物）> 留档。
 * @param pdigestReview 摘抄文档 IAL custom-pdigest-review 原始值
 * @param thinkReview   文档内任一思考块的 ReviewKey（custom-prog-think）原始值
 * @param cardInSet     该摘抄文档（卡挂文档块）是否已入卡组
 */
export function digestStateOf(pdigestReview: string, thinkReview: string, cardInSet: boolean): DigestState {
    if (hasSched(pdigestReview)) return "review";
    if (hasSched(thinkReview)) return "think";
    if (cardInSet) return "recite";
    return "archive";
}

/** 四态 → sprite 图标：留档=羽毛笔（摘抄本色）/ 背诵=卡 / 复访=时钟 / 思考=思考 */
export function digestStateIcon(state: DigestState): string {
    switch (state) {
        case "recite": return "iconProgCard";
        case "review": return "iconClock";
        case "think": return "iconProgThink";
        default: return "iconProgQuill";
    }
}
