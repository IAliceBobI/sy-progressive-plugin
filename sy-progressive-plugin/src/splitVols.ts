// □2 物理分卷：纯函数层——巨文档按标题层级切卷（段展开→贪心打包）+卷名+markdown 拼接。
// 切卷分段与分片分段同源（HeadingGroup 同一守卫）：用户在 AddBook 看到 h1 分片、在切卷
// 看到 h1 分卷，行为一致。不支持 B（粗体）级——HeadingGroup 含 "b" 时 init 触发 SQL，
// 物理分卷无此语义（SplitVolsDialog 的 chips 只给实存标题级）。
// 零 siyuan 依赖（HeadingGroup 无 "b" 分支零 SQL）——vitest 链不拖 .svelte/window。
import { HeadingGroup } from "./Split2Pieces";
import type { ChildBlockRow } from "./childBlocks";

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
    // VolBlock 是其超集，断言安全
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

/** 卷名=首标题块文本（截 24 字）；无标题段=首块 content 前缀；空序列=空串（调用方兜底） */
function planTitle(blocks: VolBlock[]): string {
    const first = blocks.find(b => b.type === "h") ?? blocks[0];
    const raw = first?.content?.trim() ?? "";
    return raw.length > 24 ? raw.slice(0, 24) + "…" : raw;
}

/** 主入口：blocks 全书块序列（childBlocksToVolBlocks 产物），levels=["1".."6"] 子集 */
export async function splitIntoVols(blocks: VolBlock[], levels: string[], maxChars: number): Promise<VolPlan[]> {
    if (blocks.length === 0) return [];
    if (levels.length === 0 || charCount(blocks) <= maxChars) {
        const cc = charCount(blocks);
        return [{ title: planTitle(blocks), blocks, charCount: cc, overLimit: false }];
    }
    const segs = await flattenSegments(blocks, levels, maxChars, 0);
    return packSegments(segs, maxChars).map(vol => ({
        title: planTitle(vol), blocks: vol,
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
