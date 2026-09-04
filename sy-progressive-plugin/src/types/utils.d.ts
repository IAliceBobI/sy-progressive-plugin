// https://app.quicktype.io/?l=ts

declare module "*.scss";

type AsList = "p" | "i" | "t";

// div 字段已随统计步骤 childBlocks 化退役（2026-08-30）：加书链路无人消费，
// 落盘 preSave 只存 id
type WordCountType = { id: string; count: number; type: string; subType: string };

type BookInfo = {
    time?: number,
    boxID?: string,
    point?: number,
    bookID?: string,
    bookName?: string,
    ignored?: boolean,
    autoCard?: boolean,
    showLastBlock?: boolean,
    autoSplitSentenceP?: boolean,
    autoSplitSentenceI?: boolean,
    autoSplitSentenceT?: boolean,
    addIndex2paragraph?: boolean,
    /** 期3 手动分片书：注册书身份+索引恒空，片由摘抄产生（ctime 聚合 ✒） */
    manualMode?: boolean,
    finishDays?: number,
    finishTimeSecs?: number,
    finishPieceID?: string,
    finishIgnore?: boolean,
    finishShowInput?: boolean,
    archived?: string,
    /** 舰队管理 □2：置顶（舰队面板置顶组最优先，组内保滚筒序；纯视觉不影响调度） */
    pinned?: boolean,
    /** 舰队管理 □2：从总览隐匿（纯视觉：舰队面板不显示，滚筒照常推送照常计数） */
    hidden?: boolean,
};

type BookInfos = { [key: string]: BookInfo };


