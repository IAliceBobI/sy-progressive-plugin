export const STORAGE_BOOKS = "books.json";
// v5 prog-data 锚定：存 prog-data 根文档 ID（认回链第一优先级；失效走 IAL 全库搜兜底）
export const STORAGE_PROGDATA = "prog-data-root.json";
// v5 滚筒状态：书序数组 + 最后出片的书（plugin storage 独立键，books.json 不动结构）
export const STORAGE_READING_ORDER = "reading-order.json";
// v5 阅读日志：prog-data「阅读日志」文档内每日一子块，块 IAL 双键（date 锚查询 / data 存 JSON 真源）
export const PLOG_DATE = "custom-proglog-date";
export const PLOG_DATA = "custom-proglog-data";
// v5 归档：原书打 IAL 时间戳退出一切视图（books.json 条目保留，与 ignored 同款 filter 待遇）
export const BOOK_ARCHIVED_KEY = "custom-progarchived";
export const TryAddStarsLock = "TryAddStarsLock";
export const ProgressiveAddBtnListenersLock = "ProgressiveAddBtnListenersLock";
export const AddProgressiveReadingLock = "AddProgressiveReadingLock";
export const StartToLearnLock = "StartToLearnLock";
export const IndexTime2Wait = 400;

export enum HtmlCBType {
    previous = 0,
    deleteAndNext = 1,
    // saveDoc = 3,
    quit = 4,
    nextBook = 5,
    next = 6,
    ignoreBook = 7,
    // fullfilContent = 8（□22 重插改道 Progressive.refillPiece：清空+可选断句，值不复用）
    // cleanUnchanged = 9,
    // AddDocCard = 2 / DelDocCard = 10（v5 □7 分片入卡退役，值不复用）
    deleteAndExit = 11,
    openFlashcardTab = 12,
    deleteAndBack = 13,
    // viewContents = 14（□11 contents 文档机制退役→目录浮层，值不复用）
    // splitByPunctuations = 15 / List = 16 / ListCheck = 17（□22 三合一进重插菜单，值不复用）
    cleanOriginText = 18,
    readThisBlock = 19,
    nop = 20,
}