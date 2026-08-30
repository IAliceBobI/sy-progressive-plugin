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
    finishDays?: number,
    finishTimeSecs?: number,
    finishPieceID?: string,
    finishIgnore?: boolean,
    finishShowInput?: boolean,
    archived?: string,
};

type BookInfos = { [key: string]: BookInfo };


