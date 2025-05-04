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
