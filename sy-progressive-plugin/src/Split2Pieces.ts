import { arrayRemove, siyuan } from "../../sy-tomato-plugin/src/libs/utils";

export class ContentLenGroup {
    private groups: WordCountType[][];
    private accCount: number;
    private maxCount: number;
    private collect: WordCountType[][];
    private list: WordCountType[];
    constructor(groups: WordCountType[][], maxCount: number) {
        this.groups = groups;
        this.accCount = 0;
        this.collect = [];
        this.list = [];
        this.maxCount = maxCount;
    }
    private newList() {
        if (this.list.length > 0) {
            this.collect.push(this.list);
            this.list = [];
            this.accCount = 0;
        }
    }
    private add(wc: WordCountType) {
        this.list.push(wc);
        if (wc.type !== "h") this.accCount += wc.count;
        if (this.accCount >= this.maxCount) {
            this.newList();
        }
    }
    private splitPiece(wc: WordCountType[]): WordCountType[][] {
        this.collect = [];
        for (const line of wc) {
            this.add(line);
        }
        this.newList();
        return this.collect;
    }
    split() {
        const list = [];
        for (const piece of this.groups) {
            list.push(...this.splitPiece(piece));
        }
        return list;
    }
}

export class HeadingGroup {
    private wordCount: WordCountType[];
    private group: WordCountType[][];
    private list: WordCountType[];
    private lastType: string;
    private bookID: string;
    private headings: string[];
    constructor(wordCount: WordCountType[], headings: string[], bookID: string) {
        this.wordCount = wordCount;
        this.group = [];
        this.list = [];
        this.headings = headings;
        this.bookID = bookID;
    }
    public async init() {
        if (this.headings.includes("b")) {
            arrayRemove(this.headings, "b");
            this.headings.push("7");

            const blocks = await siyuan.sql(`select id from blocks where root_id='${this.bookID}' and markdown like "**%**" limit 10000`);
            const s = new Set(blocks.map(b => b.id));
            this.wordCount.forEach(e => {
                if (s.has(e.id)) {
                    e.type = "h";
                    e.subType = "h7";
                }
            });
        }
        this.headings = this.headings.map(i => `h${i}`);
        return this;
    }
    private add(wc: WordCountType) {
        this.getList(wc).push(wc);
        this.lastType = wc.type;
    }
    private next() {
        if (this.list.length > 0) {
            this.group.push(this.list);
            this.list = [];
        }
    }
    private shouldNext(wc: WordCountType) {
        if (wc.type === "h" && this.headings.includes(wc.subType) && this.lastType != "h") {
            return true;
        }
        return false;
    }
    private getList(wc: WordCountType) {
        if (this.shouldNext(wc)) {
            this.next();
        }
        return this.list;
    }
    split() {
        if (this.headings.length == 0) return [this.wordCount];
        for (const wc of this.wordCount) {
            this.add(wc);
        }
        this.next();
        return this.group;
    }
}

import { getDocBlocks } from "../../sy-tomato-plugin/src/libs/docUtils";

// 步骤 1：取书的块 + 算 WordCountType —— 纯逻辑 + siyuan 调用。
// 从 AddBook.svelte 的 doCount() 提取。headCount 的副作用不在此处（留在组件）。
export async function buildContentBlocks(bookID: string, bookName: string): Promise<WordCountType[]> {
    const { root } = await getDocBlocks(bookID, bookName, false, true, 1);
    return root.children.map((block) => ({
        id: block.id,
        count: block.div.textContent.length,
        type: block.type,
        subType: block.subtype,
        div: block.div,
    }));
}

// 步骤 2：计算分片索引 —— 纯逻辑（核心可测逻辑，这一轮先导出不写单测）。
// 从 AddBook.svelte 的 countPieces() 的分片编排部分提取。headings 校验由调用方负责。
export async function computePieceIndex(
    contentBlocks: WordCountType[],
    headings: string[],
    bookID: string,
    splitWordNum: number,
): Promise<WordCountType[][]> {
    let groups = (await new HeadingGroup(contentBlocks, headings, bookID).init()).split();
    if (splitWordNum > 0) {
        groups = new ContentLenGroup(groups, splitWordNum).split();
    }
    return groups;
}

import { progStorage } from "./ProgressiveStorage";
import { createPiece } from "./helper";

// 端到端编排：给定书 + point，跑完整分片流程，返回 noteID。
// 供 window.prog_zZmqus5PtYRi.split.runSplit 调用，让 agent-browser 能逐步调试验证 bug。
// 保守策略：只用已保存索引（loadBookIndexIfNeeded）；索引为空时抛错而非静默返回空，
// 让外部调用方能明确区分"索引未就绪"和"createPiece 失败"。
export async function runSplit(bookID: string, point: number, bookName?: string): Promise<string> {
    void bookName; // 预留参数（未来索引重算路径会用），当前保守路径只用已保存索引。
    const index = await progStorage.loadBookIndexIfNeeded(bookID);
    if (index.length === 0) {
        throw new Error(`runSplit: book ${bookID} index empty (not ready or not split yet)`);
    }
    const info = await progStorage.booksInfo(bookID);
    return createPiece(info, index, point);
}
