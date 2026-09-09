export const STORAGE_BOOKS = "books.json";
// v5 prog-data 锚定：存 prog-data 根文档 ID（认回链第一优先级；失效走 IAL 全库搜兜底）
export const STORAGE_PROGDATA = "prog-data-root.json";
// v5 滚筒状态：书序数组 + 最后出片的书（plugin storage 独立键，books.json 不动结构）
export const STORAGE_READING_ORDER = "reading-order.json";
// revtrace 修订痕迹：enrollment 基线映射 {docID: 内核同构14位时间戳}——纯视图零档案的
// 唯一持久化（首次纳入时刻=无色基线防满屏；无桶无快照，色层=f(updated 距今天数)实时算）
export const STORAGE_REVTRACE = "revtrace.json";
// v5 阅读日志：prog-data「阅读日志」文档内每日一子块，块 IAL 双键（date 锚查询 / data 存 JSON 真源）
export const PLOG_DATE = "custom-proglog-date";
export const PLOG_DATA = "custom-proglog-data";
// v5 归档：原书打 IAL 时间戳退出一切视图（books.json 条目保留，与 ignored 同款 filter 待遇）
export const BOOK_ARCHIVED_KEY = "custom-progarchived";
export const TryAddStarsLock = "TryAddStarsLock";
export const ProgressiveAddBtnListenersLock = "ProgressiveAddBtnListenersLock";
export const AddProgressiveReadingLock = "AddProgressiveReadingLock";
export const StartToLearnLock = "StartToLearnLock";
export const HtmlBlockReadNextPeiceLock = "htmlBlockReadNextPeiceLock";
export const IndexTime2Wait = 400;
// □1 锁治理：持锁操作租约上限（ms）。锁内链路 hang 时 promise 永不落定=锁永久占用
// （插件 reload 不放、仅整页刷新可救）；race 到点即放锁。180s > 合法最慢链（重试循环
// 30×(500ms+SQL)≈2min + 巨片构建），详见 lockLease.ts 头注。
export const LockLeaseMs = 180_000;

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