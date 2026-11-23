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
 * 单块智能扩块的判型（2026-11-22 陆杰反馈，bear 拍板「智能扩块」；制卡与摘抄共用）：
 * 光标放块里/单选单块时只有该块进产物，「下方内容」（DOM 是后续兄弟）不跟着走——
 * 制卡=超级块卡答案位只有垫的空段，摘抄=摘抄文档里只剩问题标题。
 * 光标落在列表项里时选区拿到的块是 li 内部块（如 li 内段落）而非列表项本身
 * （3.8.11 e2e 实证：getBlockBreadcrumb 拿到段落 id）——先上提到最近列表项再判型，
 * 否则永远走不到列表扩块。
 * 非标题/列表项返回 null。
 */
interface BlockExpansion {
    /** 扩块头块：标题块，或上提后的列表项 */
    head: HTMLElement;
    isHeading: boolean;
    /** 同级后续块：标题=到下一个任意级标题（新章节，不分级）前的全部内容块（标题下
     *  内容数据层是标题子块、DOM 是标题后续兄弟）；列表项=同列表后续项（li 的 DOM
     *  兄弟必是同列表项）。收集沿兄弟链走到无 data-type 的节点（非内容块）或链尾 */
    siblings: HTMLElement[];
    /** 列表项的嵌套子列表（li 的直接子块 NodeList）；标题/无子项=空 */
    kidLists: HTMLElement[];
}

function judgeExpansion(block: HTMLElement): BlockExpansion | null {
    const head = block.closest(`[${DATA_TYPE}=${BlockNodeEnum.NODE_LIST_ITEM}]`) as HTMLElement | null ?? block;
    const headType = head.getAttribute(DATA_TYPE);
    const isHeading = headType === BlockNodeEnum.NODE_HEADING;
    if (!isHeading && headType !== BlockNodeEnum.NODE_LIST_ITEM) return null;
    const siblings: HTMLElement[] = [];
    for (let el = head.nextElementSibling; el; el = el.nextElementSibling) {
        const t = el.getAttribute(DATA_TYPE);
        if (!t) break; // 无 data-type=非内容块
        // 标题：任意级标题=新章节停；列表项：只收同列表后续项，遇非列表项停
        if (isHeading ? t === BlockNodeEnum.NODE_HEADING : t !== BlockNodeEnum.NODE_LIST_ITEM) break;
        siblings.push(el as HTMLElement);
    }
    const kidLists: HTMLElement[] = [];
    if (!isHeading) {
        for (const c of Array.from(head.children)) {
            if (c.getAttribute(DATA_TYPE) === BlockNodeEnum.NODE_LIST) kidLists.push(c as HTMLElement);
        }
    }
    return { head, isHeading, siblings, kidLists };
}

/** li 的自身内容块（有 data-type 且非子列表）——「带子项的列表项」拆正面用的文字块 */
function ownContentBlocks(li: HTMLElement): Element[] {
    return Array.from(li.children).filter(c => {
        const t = c.getAttribute(DATA_TYPE);
        return !!t && t !== BlockNodeEnum.NODE_LIST;
    });
}

/** 「去掉子列表的列表项」克隆（脱离文档）：自身文字块与列表点/属性行等辅助节点照留，
 *  只摘掉嵌套子列表 */
function ownTextListItem(li: HTMLElement): HTMLElement {
    const own = li.cloneNode(false) as HTMLElement;
    Array.from(li.children)
        .filter(c => c.getAttribute(DATA_TYPE) !== BlockNodeEnum.NODE_LIST)
        .forEach(c => own.appendChild(c.cloneNode(true)));
    return own;
}

/**
 * 制卡智能扩块：光标放块里/单选单块制卡时只有该块进 sb，下方内容不进卡 → sb 答案位
 * 只有垫的空段，复习翻面永远空白。判型见 BlockExpansion，两种单块取料：
 * - 标题块：标题 + 到下一个任意级标题前的全部内容（标题=问题，下方内容=答案）。
 * - 列表项：带子项的列表项（2026-11-23 陆杰追评，bear 拍板「只收子项」）拆成「去掉
 *   子列表的 li」+ 各子列表克隆——首子块=本行文字（正面）、第 2 子块=子列表（翻面
 *   答案），同级后续项不收；不带子项的列表项=该项 + 同列表后续项（后续项当答案）。
 * 非「恰好 1 块且上述类型」原样返回（多块=用户已圈定范围，不越权扩）；无可收内容
 * 也原样返回；null 返回 []。
 */
export function expandCardSelection(blocks: HTMLElement[] | null): HTMLElement[] {
    if (!blocks) return [];
    if (blocks.length !== 1) return blocks;
    const e = judgeExpansion(blocks[0]);
    if (!e) return blocks;
    if (e.kidLists.length > 0 && ownContentBlocks(e.head).length > 0) {
        return [ownTextListItem(e.head), ...e.kidLists.map(k => k.cloneNode(true) as HTMLElement)];
    }
    return e.siblings.length > 0 ? [e.head, ...e.siblings] : blocks;
}

/**
 * 摘抄智能扩块（2026-11-23 陆杰追评）：判型与制卡同源，取料不同——摘抄文档是文档级
 * 卡、整篇一起显示不翻面，所以只负责把下方内容带进摘抄文档：标题带下方内容到下一个
 * 任意级标题；列表项带同列表后续项；带子项的列表项整项带走（子列表随 li，不拆）。
 * 返回值语义同 expandCardSelection：非单块/非上述类型/无可收内容=原样返回。
 */
export function expandDigestSelection(blocks: HTMLElement[] | null): HTMLElement[] {
    if (!blocks) return [];
    if (blocks.length !== 1) return blocks;
    const e = judgeExpansion(blocks[0]);
    if (!e) return blocks;
    if (e.kidLists.length > 0) return [e.head];
    return e.siblings.length > 0 ? [e.head, ...e.siblings] : blocks;
}
