// 制卡选路（2026-09-13 跨块制卡修复，bear 拍板「直接使用这几个块」）：makeCard 依
// 统一三级链（libs/selection.ts）结果分通道。旧版 cloneSelectedLineMarkdowns 只查
// 块选类——思源 3.8 起拖蓝不再转块选（issue 8554），跨块拖蓝漏检后退到挖空分支，
// 该分支只抓 endContainer 末块=前块蒸发（只对末块局部挖空）。纯函数零单例耦合。
import type { SelectionResult } from "../../sy-tomato-plugin/src/libs/selection";
import { BlockNodeEnum, DATA_TYPE } from "../../sy-tomato-plugin/src/libs/gconst";

/**
 * 块级制卡取块：块多选（现状语义）与跨块拖蓝（2+ 块整块进卡、不挖空）返回 blocks；
 * 单块内划词（挖这段字）、光标/全空返回 null——调用方落回挖空/光标兜底通道。
 */
export function cardBlocksForMake(s: SelectionResult | null | undefined): HTMLElement[] | null {
    if (!s || s.blocks.length === 0) return null;
    if (s.level === "select") return s.blocks;
    if (s.level === "range" && s.blocks.length > 1) return s.blocks;
    return null;
}

/**
 * 制卡智能扩块（2026-11-22 陆杰反馈，bear 拍板「智能扩块」）：光标放块里/单选单块
 * 制卡时只有该块进 sb，「下方内容」不进卡 → sb 答案位只有垫的空段，复习翻面永远
 * 空白。两种单块沿兄弟链收集，直到无 data-type 的节点（非内容块）或链尾：
 * - 标题块：收一切非标题块，到下一个任意级标题（新章节，不分级）停——标题下内容
 *   （数据层是标题子块、DOM 是标题后续兄弟）进卡当答案。
 * - 列表项：只收同列表后续列表项（li 的 DOM 兄弟必是同列表项；列表尾项收集空），
 *   后续项进卡当答案（嵌套子列表随 li 克隆自动带上）。
 * 光标落在列表项里时，选区拿到的块是 li 内部块（如 li 内段落）而非列表项本身
 * （3.8.11 e2e 实证：getBlockBreadcrumb 拿到段落 id）——先上提到最近列表项再判型，
 * 否则永远走不到列表扩块、进卡的只有内部段落，翻面照样空白。
 * 非「恰好 1 块且上述类型」原样返回（多块=用户已圈定范围，不越权扩）；收集为空
 * 也原样返回；null 返回 []。
 */
export function expandCardSelection(blocks: HTMLElement[] | null): HTMLElement[] {
    if (!blocks) return [];
    if (blocks.length !== 1) return blocks;
    const liAncestor = blocks[0].closest(`[${DATA_TYPE}=${BlockNodeEnum.NODE_LIST_ITEM}]`) as HTMLElement | null;
    const head = liAncestor ?? blocks[0];
    const headType = head.getAttribute(DATA_TYPE);
    const isHeading = headType === BlockNodeEnum.NODE_HEADING;
    if (!isHeading && headType !== BlockNodeEnum.NODE_LIST_ITEM) return blocks;
    const collected: HTMLElement[] = [];
    for (let el = head.nextElementSibling; el; el = el.nextElementSibling) {
        const t = el.getAttribute(DATA_TYPE);
        if (!t) break; // 无 data-type=非内容块
        // 标题：任意级标题=新章节停；列表项：只收同列表后续项，遇非列表项停
        if (isHeading ? t === BlockNodeEnum.NODE_HEADING : t !== BlockNodeEnum.NODE_LIST_ITEM) break;
        collected.push(el as HTMLElement);
    }
    return collected.length > 0 ? [head, ...collected] : blocks;
}
