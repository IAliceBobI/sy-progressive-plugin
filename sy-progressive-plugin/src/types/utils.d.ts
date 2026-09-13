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
    /** 期1 写作书：渐进阅读的姊妹形态（素材排列相位）；与 manualMode 分家——
     *  手动书不进滚筒、写作书进滚筒；索引恒空（运行时按 MarkKey SQL 拉片） */
    writing?: boolean,
    /** 期2 写作书：续转指针=最近活跃槽 point（开片/入槽/拆分时写；调度轮到优先开它） */
    activePoint?: number,
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
    /** □1 目录成书：书=文档集（卷=直接子文档，目录序=读序）；片挂来源卷下、
     *  卷表旁挂 petal <bookID>.vols.json。缺省=单篇书走现状路径（存量零迁移） */
    dirMode?: boolean,
};

type BookInfos = { [key: string]: BookInfo };


