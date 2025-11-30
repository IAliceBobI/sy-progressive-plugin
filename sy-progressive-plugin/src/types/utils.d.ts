// https://app.quicktype.io/?l=ts

declare module "*.scss";

type AsList = "p" | "i" | "t";

type WordCountType = { id: string; count: number; type: string; subType: string, div: HTMLElement };

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
};

type BookInfos = { [key: string]: BookInfo };


