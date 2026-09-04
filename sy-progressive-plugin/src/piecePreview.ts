import { siyuan } from "../../sy-tomato-plugin/src/libs/siyuanApi";

// □4 加书弹窗统计步骤增强——预览纯函数集（方案=docs/prog-addbook-split-preview.md §7）。
// 全部无 IO（loadBoldIds 除外）、不改入参：b 通道改写由 applyBoldMarks 以「拷贝视图」
// 接管，contentBlocks 缓存保持原值可反复重算（规避 HeadingGroup.init 就地改写坑，
// split2pieces.test.ts 锁定的行为，方案 §2.2）。

// ---- 共享口径 ----
/** 片字数 = Σ count(type!=="h")：与 ContentLenGroup.add 切窗累计同源（方案 §2.3），
    标题块不计入——sparkline 高度与超标红条的分母若和实际切窗不同源，会出现
    「红条但没切 / 没红却切了」的自相矛盾。 */
const pieceWordCount = (piece: ReadonlyArray<WordCountType>): number =>
    piece.reduce((sum, w) => (w.type !== "h" ? sum + w.count : sum), 0);

// ---- chips 渲染数据源 ----
export type HeadingLevelStat = { level: string; count: number }; // level="1"~"6"（数字串）

/** 统计书中实际存在的标题级；只返回 count>0 的级，h1→h6 有序（chips 渲染顺序）。
    subType 逐块是 "h1"~"h6"（getChildBlocks 透传）；h7 只来自 b 通道改写，
    由 loadBoldIds 另行供给 B chip，不在此统计。 */
export function countHeadingLevels(blocks: ReadonlyArray<WordCountType>): HeadingLevelStat[] {
    const counts = new Map<string, number>();
    for (const b of blocks) {
        if (b.type !== "h") continue;
        const m = /^h([1-6])$/.exec(b.subType ?? "");
        if (!m) continue;
        counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
    }
    return [...counts.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([level, count]) => ({ level, count }));
}

// ---- b 通道缓存（弹窗生命周期 SQL 一次） ----
/** 查询与 Split2Pieces.HeadingGroup.init 内部 SQL 逐字一致（含 limit 10000000），两处必须
    同步维护（方案 §10 预留：让 init 复用本函数）。失败抛错，调用方兜底空集。 */
export async function loadBoldIds(bookID: string): Promise<Set<string>> {
    const blocks = await siyuan.sql(`select id from blocks where root_id='${bookID}' and markdown like "**%**" limit 10000000`);
    return new Set(blocks.map(b => b.id));
}

/** 复刻 HeadingGroup.init 的 b 改写语义：命中 id 无条件覆盖 {type:"h",subType:"h7"}
    （含真标题被粗体 SQL 命中后覆盖为 h7 的既有怪癖——保预览≡正式分片，不引入行为
    分叉）。纯函数：返回新数组，命中元素拷贝、未命中原引用；不改入参。 */
export function applyBoldMarks(
    blocks: ReadonlyArray<WordCountType>,
    boldIds: ReadonlySet<string>,
): WordCountType[] {
    return blocks.map(b => (boldIds.has(b.id) ? { ...b, type: "h", subType: "h7" } : b));
}

/** chips 值 → computePieceIndex headings 参数：["1","b"] → ["1","7"]，排序后返回新数组。
    "b" 在 UI 层换算成 "7"，HeadingGroup.init 的 b 分支（SQL+就地改写）永不触发。 */
export function levelsToHeadings(levels: ReadonlyArray<string>): string[] {
    return levels.map(l => (l === "b" ? "7" : l)).sort();
}

// ---- 智能默认（单级试算，方案 §4.6 拍板） ----
export type SmartDefaultMode = "level" | "fallback" | "window-only";
export type SmartDefault = { headings: string[]; splitWordNum: number; mode: SmartDefaultMode };

/** levels 粗→细逐级试算（headings=[单级]、splitWordNum=0），取第一个「最大片字数 ≤
    target」的级 → {headings:[级], splitWordNum:0, mode:"level"}；全不满足 →
    {headings:[最细级], splitWordNum:target, mode:"fallback"}；levels 空 →
    {headings:[], splitWordNum:target, mode:"window-only"}。
    calc 注入分片计算（生产=computePieceIndex 包装，单测=stub）。
    blocks 仅供未来内部直算预留，试算全部经 calc（调用方闭包已捕获数据）。
    □2 退役（2026-09-01）：生产零调用（AddBook 改默认实存级全勾），仅单测锁定
    行为，留作将来「恢复推荐」或复用的素材。 */
export async function pickSmartDefault(
    blocks: ReadonlyArray<WordCountType>,
    levels: ReadonlyArray<string>,
    target: number,
    calc: (headings: string[], splitWordNum: number) => Promise<WordCountType[][]>,
): Promise<SmartDefault> {
    void blocks;
    if (levels.length === 0) {
        return { headings: [], splitWordNum: target, mode: "window-only" };
    }
    const sorted = [...levels].sort(); // 数字串升序 = h1 最粗 → h6 最细
    for (const level of sorted) {
        const groups = await calc([level], 0);
        const max = groups.reduce((m, g) => Math.max(m, pieceWordCount(g)), 0);
        if (max <= target) {
            return { headings: [level], splitWordNum: 0, mode: "level" };
        }
    }
    return { headings: [sorted[sorted.length - 1]], splitWordNum: target, mode: "fallback" };
}

// ---- 分布统计（sparkline + 三数 + 超标） ----
export type PiecePreview = {
    count: number;        // 片数
    wordCounts: number[]; // 每片字数（sparkline 数据）
    min: number;
    median: number;
    max: number;
    overCount: number;    // target>0 且 片字数>2×target 的片数（红条/legend）
};

/** median：排序取中，偶数取中间两数平均（Math.round）。target=0（不限）时 overCount=0。 */
export function summarizePieces(
    groups: ReadonlyArray<ReadonlyArray<WordCountType>>,
    target: number,
): PiecePreview {
    const wordCounts = groups.map(pieceWordCount);
    const count = groups.length;
    if (count === 0) {
        return { count: 0, wordCounts: [], min: 0, median: 0, max: 0, overCount: 0 };
    }
    const sorted = [...wordCounts].sort((a, b) => a - b);
    const median = count % 2 === 1
        ? sorted[(count - 1) / 2]
        : Math.round((sorted[count / 2 - 1] + sorted[count / 2]) / 2);
    const overCount = target > 0 ? wordCounts.filter(wc => wc > target * 2).length : 0;
    return { count, wordCounts, min: sorted[0], median, max: sorted[count - 1], overCount };
}
