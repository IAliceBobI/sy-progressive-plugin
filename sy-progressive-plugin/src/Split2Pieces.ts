import { arrayRemove, siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import { MarkKey } from "../../sy-tomato-plugin/src/libs/gconst";

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

            const blocks = await siyuan.sql(`select id from blocks where root_id='${this.bookID}' and markdown like "**%**" limit 10000000`);
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

import { childBlocksToWordCount } from "./childBlocks";

// 步骤 1：取书的块 + 算 WordCountType —— 纯逻辑在 childBlocks.ts（口径注释与单测同在）。
// 从 AddBook.svelte 的 doCount() 提取。headCount 的副作用不在此处（留在组件）。
// 数据源 = getChildBlocks 单发（巨书秒级：45k 块书实测 0.55s；旧 getDocBlocks 通道同书
// 26~39s + 24MB 主线程 innerHTML 解析）。textLen = sum(count)，口径 ≈ 旧
// div.textContent.length（剥零宽后 99.5% 逐位一致，2026-08-30 实测拍板）。
export async function buildContentBlocks(bookID: string): Promise<{ blocks: WordCountType[], textLen: number, rawCount: number }> {
    return childBlocksToWordCount(await siyuan.getChildBlocks(bookID));
}

// 步骤 2：计算分片索引 —— 纯逻辑（行为锁定单测在 tests/unit/split2pieces.test.ts）。
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
// 供 window.prog_zZmqus5PtYRi.split.runSplit 调用，让 agent-browser 能逐步调试验证 bug
//（通道默认关闭，localStorage PROG_DEBUG=1 显式开启，门禁在 index.ts）。
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

// ============ □1 目录成书：多卷枚举 + 逐卷切窗 + 卷序通道 ============

/** 卷内块区间 [start,end)——blocks 全书拼接，spans 记每卷边界 */
export interface VolSpan { volID: string; start: number; end: number }

export interface VolsContent {
    blocks: WordCountType[];
    textLen: number;
    rawCount: number;
    spans: VolSpan[];
}

/** 书壳的直接子文档 id 序（文件树生效序=读序；一层目录语义，孙文档不进书）。
 *  listDocsByPath 走磁盘真相（未索引文档也在）；maxListCount:0=MaxInt 防 100+ 篇
 *  截断；sort:15=SortModeFileTree 文件树排序规则（用户拖动即调序，所见即所得）。
 *  path 形态=父 path 剥 .sy（子文档物理目录=父文档 id 不带 .sy——踩坑索引在案）。
 *  review P1-3：渐进内部子文档（cards-/digest- 夹、旧片）全带 MarkKey IAL——按
 *  「IAL 不含 MarkKey」过滤，不当卷（否则制卡后重分片=卡块混入读序索引/触发无谓
 *  重组/存量单篇书弹窗误现选法区）。ial not like 对 NULL 行恒假（无 IAL 的正常文章
 *  会被整行滤掉），须先放行 NULL；SQL 口径受索引延迟影响——新建未索引文章本轮
 *  缺席=新卷拾取推迟一轮（无损坏，索引追上下轮 sameOrder 失配触发重组补挂）；
 *  反向窗口同族：刚建的内部夹（cards-/digest-）ial 列索引未追上被放行误当卷一轮，
 *  下轮 sameOrder 失配重组剔除，自愈无实害（□29 实测 ial 进 SQL 有 24s+ 窗口）。 */
export async function listVolIDs(bookID: string): Promise<string[]> {
    const row = await siyuan.sqlOne(`select box,path from blocks where type='d' and id='${bookID}'`);
    if (!row?.box || !row?.path) return [];
    const dir = row.path.endsWith(".sy") ? row.path.slice(0, -3) : row.path;
    const r = await siyuan.call("/api/filetree/listDocsByPath", {
        notebook: row.box, path: dir, sort: 15, maxListCount: 0, ignoreMaxListHint: true,
    });
    const ids = (((r as any)?.files ?? []).map((f: any) => f?.id).filter(Boolean)) as string[];
    if (ids.length === 0) return [];
    const rows = await siyuan.getRows(ids, "id", false,
        [`(ial is null or ial = '' or ial not like '%${MarkKey}%')`]);
    const external = new Set(rows.map(r => r.id));
    return ids.filter(id => external.has(id));
}

/** 逐卷枚举块并拼接（每卷 getChildBlocks 单发——巨书 0.55s/卷级快通道复用；
 *  滤空块口径与 childBlocksToWordCount 一致：双空块不进索引） */
export async function buildContentBlocksVols(volIDs: string[]): Promise<VolsContent> {
    const blocks: WordCountType[] = [];
    const spans: VolSpan[] = [];
    let textLen = 0, rawCount = 0;
    for (const volID of volIDs) {
        const children = await siyuan.getChildBlocks(volID);
        // null/undefined=API 失败≠空文档（siyuan.call 两态吞错），抛错防静默空书
        if (children == null) throw new Error(`buildContentBlocksVols: getChildBlocks failed on vol ${volID}`);
        const start = blocks.length;
        for (const c of children) {
            if (!(c.markdown || c.content)) continue;
            blocks.push({
                id: c.id,
                count: (c.content ?? "").length,
                type: c.type ?? "",
                subType: c.subType ?? "",
            });
            textLen += (c.content ?? "").length;
        }
        rawCount += children.length;
        spans.push({ volID, start, end: blocks.length });
    }
    return { blocks, textLen, rawCount, spans };
}

/** 逐卷独立切窗再按卷序拼接：片不跨文章边界、[NNNNN] 全书连续（concat 天然连续）。
 *  headings 语义同 computePieceIndex（"1"~"6"/"7"，不含 "b"——B 标记由调用方预打）；
 *  复用 computePieceIndex（bookID 位传卷 id；"b"→"7" 换装后 init 的 SQL 分支不触发）。 */
export async function computePieceIndexVols(
    content: VolsContent, headings: string[], splitWordNum: number,
): Promise<{ groups: WordCountType[][]; perVol: number[] }> {
    const groups: WordCountType[][] = [];
    const perVol: number[] = [];
    for (const span of content.spans) {
        if (span.start === span.end) { perVol.push(0); continue; } // 空卷 0 片（防空片占槽）
        const g = await computePieceIndex(
            content.blocks.slice(span.start, span.end), headings, span.volID, splitWordNum);
        groups.push(...g);
        perVol.push(g.length);
    }
    return { groups, perVol };
}
