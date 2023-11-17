import { siyuan } from "./utils";

type WordCountType = { id: string; count: number; type: string; };

export function afterLoad(data: any) {
    data = data?.data ?? "";
    const group = [];
    for (const piece of data.split("#")) {
        const tp = [];
        for (const ti of piece.split(",")) {
            tp.push(ti);
        }
        group.push(tp);
    }
    return group;
}

export function preSave(groups: WordCountType[][]) {
    const pieces = [];
    for (const group of groups) {
        const parts = [];
        for (const wc of group) {
            parts.push(wc.id);
        }
        pieces.push(parts.join(","));
    }
    return pieces.join("#");
}

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
        }
    }
    private add(wc: WordCountType) {
        this.list.push(wc);
        this.accCount += wc.count;
        if (this.accCount >= this.maxCount) {
            this.newList();
            this.accCount = 0;
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
    private miniCount: number;
    private count: number;
    constructor(wordCount: WordCountType[], miniCount: number) {
        this.wordCount = wordCount;
        this.group = [];
        this.list = [];
        this.miniCount = miniCount;
        this.count = 0;
    }
    private add(wc: WordCountType) {
        this.getList(wc).push(wc);
        this.count += wc.count;
    }
    private next() {
        if (this.list.length > 0) {
            this.group.push(this.list);
            this.list = [];
            this.count = 0;
        }
    }
    private shouldNext(wc: WordCountType) {
        if (wc.type === "h" && this.count >= this.miniCount) {
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
        for (const wc of this.wordCount) {
            this.add(wc);
        }
        this.next();
        return this.group;
    }
}

export async function getDocWordCount(docID: string): Promise<WordCountType[]> {
    await siyuan.pushMsg("获取所有子块……");
    const allBlocks: any[] = await siyuan.getChildBlocks(docID);

    const size = 300
    const groups = [];
    while (allBlocks.length > 0) {
        groups.push(allBlocks.splice(0, size));
    }

    await siyuan.pushMsg("开始统计字数……");
    let iter = 0;
    const content = [];
    for (const group of groups) {
        const tasks = [];
        for (const { id } of group) {
            tasks.push(siyuan.getBlocksWordCount([id]));
        }
        const rets = await Promise.all(tasks);
        let i = 0;
        for (const { id, type } of group) {
            const { wordCount } = rets[i++];
            const count = wordCount;
            content.push({ id, count, type });
        }
        iter += size;
        await siyuan.pushMsg(`已经统计了${iter}个块……`, 3000);
    }
    await siyuan.pushMsg("统计字数结束……");
    return content;
}
