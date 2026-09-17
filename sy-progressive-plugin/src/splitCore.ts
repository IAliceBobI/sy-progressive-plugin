// 分片/切卷纯逻辑核（零 siyuan/window 依赖）：kernel（goja）与前端共用同一事实源。
// IO 一律注入（getChildBlocks/sqlAll/SplitVolsDeps）——前端壳在 Split2Pieces.ts /
// splitVols.ts / splitVolsRun.ts 包装注入并 re-export 保持旧 import 路径有效；
// kernel 侧在 kernel/bookConvertIo.ts 注入 HTTP 版。改动此处须同步核对两侧（改纯核
// 必跑 tests/unit/split2pieces+splitVolsRun 行为锁定）。
import type { ChildBlockRow } from "./childBlocks";

// ============ 词计数分组（迁自 Split2Pieces.ts，行为不变） ============

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

/** arrayRemove 内联（原依赖 tomato utils——桶 import 会拖 siyuanApi 链进 kernel bundle） */
function arrayRemove<T>(arr: T[], item: T): T[] {
    const i = arr.indexOf(item);
    if (i >= 0) arr.splice(i, 1);
    return arr;
}

export class HeadingGroup {
    private wordCount: WordCountType[];
    private group: WordCountType[][];
    private list: WordCountType[];
    private lastType: string;
    private bookID: string;
    private headings: string[];
    /** "b"（粗体标记）档的逐书 SQL——前端壳传 siyuan.sql、kernel 传 api.sql；不传而
     *  用到 "b" 时抛错（fail-loud，防静默漏标记产出错序分组） */
    private sqlAll?: (stmt: string) => Promise<any[]>;
    constructor(wordCount: WordCountType[], headings: string[], bookID: string, sqlAll?: (stmt: string) => Promise<any[]>) {
        this.wordCount = wordCount;
        this.group = [];
        this.list = [];
        this.headings = headings;
        this.bookID = bookID;
        this.lastType = "";
        this.sqlAll = sqlAll;
    }
    public async init() {
        if (this.headings.includes("b")) {
            if (!this.sqlAll) throw new Error("HeadingGroup: 'b' level requires sqlAll injection");
            arrayRemove(this.headings, "b");
            this.headings.push("7");

            const blocks = await this.sqlAll(`select id from blocks where root_id='${this.bookID}' and markdown like "**%**" limit 10000000`);
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
export async function buildContentFrom(
    bookID: string, getChildBlocks: (id: string) => Promise<ChildBlockRow[] | null>,
): Promise<{ blocks: WordCountType[], textLen: number, rawCount: number }> {
    return childBlocksToWordCount(await getChildBlocks(bookID));
}

// 步骤 2：计算分片索引 —— 纯逻辑（行为锁定单测在 tests/unit/split2pieces.test.ts）。
// 从 AddBook.svelte 的 countPieces() 的分片编排部分提取。headings 校验由调用方负责。
export async function computePieceIndexCore(
    contentBlocks: WordCountType[],
    headings: string[],
    bookID: string,
    splitWordNum: number,
    sqlAll?: (stmt: string) => Promise<any[]>,
): Promise<WordCountType[][]> {
    let groups = (await new HeadingGroup(contentBlocks, headings, bookID, sqlAll).init()).split();
    if (splitWordNum > 0) {
        groups = new ContentLenGroup(groups, splitWordNum).split();
    }
    return groups;
}

// ============ □1 目录成书：多卷枚举 + 逐卷切窗 + 卷序通道（迁自 Split2Pieces.ts） ============

/** 卷内块区间 [start,end)——blocks 全书拼接，spans 记每卷边界 */
export interface VolSpan { volID: string; start: number; end: number }

export interface VolsContent {
    blocks: WordCountType[];
    textLen: number;
    rawCount: number;
    spans: VolSpan[];
}

/** 逐卷枚举块并拼接（每卷 getChildBlocks 单发——巨书 0.55s/卷级快通道复用；
 *  滤空块口径与 childBlocksToWordCount 一致：双空块不进索引） */
export async function buildVolsContent(
    volIDs: string[], getChildBlocks: (id: string) => Promise<ChildBlockRow[] | null>,
): Promise<VolsContent> {
    const blocks: WordCountType[] = [];
    const spans: VolSpan[] = [];
    let textLen = 0, rawCount = 0;
    for (const volID of volIDs) {
        const children = await getChildBlocks(volID);
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
 *  复用 computePieceIndexCore（bookID 位传卷 id；"b"→"7" 换装后 init 的 SQL 分支不触发）。 */
export async function computePieceIndexVolsCore(
    content: VolsContent, headings: string[], splitWordNum: number,
    sqlAll?: (stmt: string) => Promise<any[]>,
): Promise<{ groups: WordCountType[][]; perVol: number[] }> {
    const groups: WordCountType[][] = [];
    const perVol: number[] = [];
    for (const span of content.spans) {
        if (span.start === span.end) { perVol.push(0); continue; } // 空卷 0 片（防空片占槽）
        const g = await computePieceIndexCore(
            content.blocks.slice(span.start, span.end), headings, span.volID, splitWordNum, sqlAll);
        groups.push(...g);
        perVol.push(g.length);
    }
    return { groups, perVol };
}

// ============ 物理分卷计划（迁自 splitVols.ts，行为不变） ============

/** 卷块=WordCountType + content/markdown（卷名与正文拼接的原料） */
export interface VolBlock { id: string; count: number; type: string; subType: string; content: string; markdown: string }

/** 切卷计划的一卷：title=首标题文本（截 24 字），overLimit=无更深级可下切的超限卷 */
export interface VolPlan { title: string; blocks: VolBlock[]; charCount: number; overLimit: boolean }

/** getChildBlocks 行 → 卷块（滤双空块，口径同 childBlocksToWordCount：空 alt 图片
 *  content 空但 markdown 有值须保留）。null 入参=API 失败抛错（≠真空文档的 []）。 */
export function childBlocksToVolBlocks(children: ChildBlockRow[]): VolBlock[] {
    if (children == null) throw new Error("childBlocksToVolBlocks: getChildBlocks failed (null/undefined)");
    return children
        .filter(c => c.markdown || c.content)
        .map(c => ({
            id: c.id,
            count: (c.content ?? "").length,
            type: c.type ?? "",
            subType: c.subType ?? "",
            content: c.content ?? "",
            markdown: c.markdown ?? "",
        }));
}

function charCount(blocks: VolBlock[]): number {
    return blocks.reduce((s, b) => s + b.count, 0);
}

/** 下切一级=在级集合追加「当前最深级+1」（至 6）；追加不替换——段内不存在更深标题时
 *  追加级不产生新切分点，无害 */
function deepen(levels: string[]): string[] | null {
    const nums = levels.map(Number).filter(n => !Number.isNaN(n));
    const max = nums.length > 0 ? Math.max(...nums) : 0;
    if (max >= 6) return null;
    return [...new Set([...levels, String(max + 1)])];
}

/** 段展开：递归直到每段 ≤maxChars；无更深级可下切（或深度守卫）=原样返回超限段。
 *  levels 形态=数字串（"1"~"6"）——HeadingGroup.init 内做 `h${i}` 前缀 map，此处
 *  预 map 会变 "hh1" 永不匹配（TDD 抓过）。 */
async function flattenSegments(blocks: VolBlock[], levels: string[], maxChars: number, depth: number): Promise<VolBlock[][]> {
    if (blocks.length === 0) return [];
    // HeadingGroup 声明为 WordCountType[][]，实际只透传块引用（不构造新对象）——
    // VolBlock 是其超集，断言安全；切卷 levels 恒数字串，sqlAll 永不触发
    const segs = (await new HeadingGroup(blocks, levels, "").init()).split() as VolBlock[][];
    if (segs.length <= 1) {
        const next = deepen(levels);
        if (next && depth < 5) return flattenSegments(blocks, next, maxChars, depth + 1);
        return [blocks]; // 不可再分：超限段原样（overLimit 由上层标记）
    }
    const out: VolBlock[][] = [];
    for (const seg of segs) {
        if (charCount(seg) > maxChars) {
            const next = deepen(levels);
            if (next && depth < 5) out.push(...await flattenSegments(seg, next, maxChars, depth + 1));
            else out.push(seg);
        } else {
            out.push(seg);
        }
    }
    return out;
}

/** 贪心打包：相邻段累加，再加下一段会超上限即封卷（单段超限独立成卷） */
function packSegments(segs: VolBlock[][], maxChars: number): VolBlock[][] {
    const vols: VolBlock[][] = [];
    let cur: VolBlock[] = [];
    let curChars = 0;
    for (const seg of segs) {
        const segChars = charCount(seg);
        if (cur.length > 0 && curChars + segChars > maxChars) {
            vols.push(cur);
            cur = [];
            curChars = 0;
        }
        cur.push(...seg);
        curChars += segChars;
    }
    if (cur.length > 0) vols.push(cur);
    return vols;
}

/** 卷名=卷内第一个**已勾选切分级**的标题（截 24 字；09-17 □2：前置目录/序言等更浅
 *  级标题被贪心并进首卷时不再抢名——「卷01·目 录」诱发用户「第一编未出现」误解）；
 *  整卷无勾选级标题（纯前置段打包/书尾段）=回退现状取卷内第一个标题；无标题段=首块
 *  content 前缀；空序列=空串（调用方兜底）。subType 形态=getChildBlocks 实测
 *  "h1".."h6"（h 前缀，HeadingGroup.init 同款 map）。 */
function planTitle(blocks: VolBlock[], levels: string[]): string {
    const heads = new Set(levels.map(l => `h${l}`));
    const first = blocks.find(b => b.type === "h" && heads.has(b.subType))
        ?? blocks.find(b => b.type === "h")
        ?? blocks[0];
    const raw = first?.content?.trim() ?? "";
    return raw.length > 24 ? raw.slice(0, 24) + "…" : raw;
}

/** 主入口：blocks 全书块序列（childBlocksToVolBlocks 产物），levels=["1".."6"] 子集 */
export async function splitIntoVols(blocks: VolBlock[], levels: string[], maxChars: number): Promise<VolPlan[]> {
    if (blocks.length === 0) return [];
    if (levels.length === 0 || charCount(blocks) <= maxChars) {
        const cc = charCount(blocks);
        return [{ title: planTitle(blocks, levels), blocks, charCount: cc, overLimit: false }];
    }
    const segs = await flattenSegments(blocks, levels, maxChars, 0);
    return packSegments(segs, maxChars).map(vol => ({
        title: planTitle(vol, levels), blocks: vol,
        charCount: charCount(vol), overLimit: charCount(vol) > maxChars,
    }));
}

/** 卷文档名：两位序号前缀保唯一+防重名；title 兜底截 24 字（落盘名的最终出口，
 *  planTitle 展示层已截，双截无害——防长标题从旁路进落盘名） */
export function volDocTitle(idx: number, plan: VolPlan): string {
    const raw = plan.title || "未命名";
    const t = raw.length > 24 ? raw.slice(0, 24) + "…" : raw;
    return `卷${String(idx + 1).padStart(2, "0")}·${t}`;
}

/** 卷文档正文：块 markdown 空行拼接。已知限制：块 IAL/custom 属性不随行（markdown
 *  通道不解析 IAL，块 id 由内核重生成——均为预期）；;;; 自定义块围栏经此通道有吞尾
 *  风险（createDocWithMd 围栏坑），Dialog 确认文案含「特殊块样式可能简化」提示 */
export function volDocMarkdown(plan: VolPlan): string {
    return plan.blocks.map(b => b.markdown).join("\n\n");
}

// ============ 切分执行（迁自 splitVolsRun.ts，deps 注入式不变） ============

/** 备份文档的书壳 IAL 标记键（值同 tomato gconst.MarkKey，本地声明防拖依赖链进
 *  kernel bundle——改源头须同步此处；kernel/progData.ts 同款模式） */
const MARK_KEY = "custom-progmark";

export interface SplitVolsDeps {
    getDocRow(id: string): Promise<{ box: string; path: string; hpath: string; content: string } | null>;
    createDocWithMd(notebook: string, hpath: string, md: string, attr?: Record<string, string>): Promise<string>;
    /** 文件树钉序（全量新序数组提交——新文档默认插顶，不钉则卷序颠倒） */
    sortDocs(notebook: string, paths: string[]): Promise<void>;
    removeDoc(id: string): Promise<void>;
    deleteBlocks(ids: string[]): Promise<void>;
    /** 复核读：清空后剩余**非空**子块数（删光后内核补一个空 p 块=自然形态不算残留）；
     *  API 失败返回 -1（调用方按未清空报错） */
    recheckChildBlocks(id: string): Promise<number>;
    log(msg: string): void;
}

/** 切分执行：plan=确认后的卷计划，blockIDs=枚举期原文档顶层块序（清空原料，markdown
 *  拼接的原料），blocksMd=原文全文（备份文档正文）。
 *  写序=先建卷后清空（中断窗口内容零丢失）；清空前先建「切分前备份」文档并删除——
 *  块删除事务的历史是 30 分钟批量生成的（generateHistoryInterval），且 API 事务不进
 *  前端 undo 栈；文档级删除历史即时生成——「原文可恢复」承诺由此即时成立。 */
export async function runSplitVols(bookID: string, plan: VolPlan[], blockIDs: string[], deps: SplitVolsDeps): Promise<string[]> {
    const row = await deps.getDocRow(bookID);
    if (!row?.box || !row?.hpath || !row?.path) throw new Error(`splitvols: doc row missing book=${bookID}`);
    const volIDs: string[] = [];
    for (let i = 0; i < plan.length; i++) {
        const name = volDocTitle(i, plan[i]);
        const id = await deps.createDocWithMd(row.box, `${row.hpath}/${name}`, volDocMarkdown(plan[i]));
        volIDs.push(id);
        deps.log(`vol created ${i + 1}/${plan.length} name=${name} id=${id}`);
    }
    // 新文档默认插顶部：按建卷序钉文件树序（读序=文件树序，颠倒=倒着读）
    const dir = row.path.endsWith(".sy") ? row.path.slice(0, -3) : row.path;
    await deps.sortDocs(row.box, volIDs.map(id => `${dir}/${id}.sy`));
    deps.log(`sort pinned vols=${volIDs.length}`);
    // 原文备份→立即删除=即时可恢复（-delete- 历史；备份带 MarkKey 挂书壳下不进卷枚举）
    const backupMd = plan.reduce((md, p) => md + (md ? "\n\n" : "") + volDocMarkdown(p), "");
    const backupID = await deps.createDocWithMd(
        row.box, `${row.hpath}/${row.content}·切分前备份`, backupMd, { [MARK_KEY]: "backup" });
    await deps.removeDoc(backupID);
    deps.log(`backup snapshotted+removed id=${backupID} chars=${backupMd.length}`);
    if (blockIDs.length > 0) {
        await deps.deleteBlocks(blockIDs);
        const remain = await deps.recheckChildBlocks(bookID);
        if (remain !== 0) throw new Error(`splitvols: recheck after delete failed, remain=${remain} book=${bookID}`);
    }
    deps.log(`done book=${bookID} vols=${plan.length} blocksCleared=${blockIDs.length}`);
    return volIDs;
}
