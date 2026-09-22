// 就地断句纯函数层（2026-09-09 立项）：把任意文档里选中的巨段落块按句原地拆成 N 个
// 段落块——不摘抄、不产回链、不挂渐进属性，句子块（含存储形态行内标记）走 markdown
// 通道插回原位。与摘抄断句（getDigestMd split 分支）同引擎（splitLines）不同产物语义：
// 摘抄产物带 * 回链+IAL，就地断句产物零属性（用户整理自己文档，渐进元数据反成污染）。
// 09-17 □1 起取文通道=块 kramdown（textContent 丢行内标记=样式静默丢失根因，飞书
// 09-17 用户录像实锤）：存储形态标记（**/<u>/<span data-type=…>+行内 {: style} 后缀）
// 原样过管线切开补全（closeInlineMarks/mathGuard/escapeLead 全在链上）。
// 句首转义复用 escapeLead（□13 反斜杠转义全链路稳定结论；09-17 起行内存储 tag 放行）。
// 零插件依赖（只 import splitPipeline/escapeLead 两个纯文件），单测直测。
import { splitLines } from "./splitPipeline";
import { escapeLead, mergeMathLead } from "./escapeLead";

/** 可断性：只有段落块（DOM data-type=NodeParagraph，内核 Node* 命名——非 SQL 的 "p"，
 *  2026-09-09 e2e 实弹纠错）可就地断句。标题/列表/代码块/引述/表格等结构块整体跳过
 *  ——它们要么本就是多行结构，要么拆开会破坏语义。 */
export function isSplittableInPlace(dataType: string | null): boolean {
    return dataType === "NodeParagraph";
}

/** 断句产物：splitLines 盲切 → $$ 前导片回粘 → 摘抄管线同款噪音过滤（@ 与星号单字符）→
 *  句首块级标记转义。单句输入返回单元素数组，调用方据此跳过该块。
 *  噪音过滤=「仅由 @、星号、空白构成」泛化（devbatch □1 收编 splitBy 尾星清理后，
 *  混合噪音片不再被上游预删星，此处模式兜底；kramdown 通道字面星以 \* 转义态到达，
 *  此模式不再命中=按原文保留，无害）。 */
export function splitInPlaceSentences(text: string): string[] {
    const ps = mergeMathLead(splitLines([text]));
    return ps
        .map(p => p.trim())
        .filter(p => p.length > 0)
        .filter(p => !/^[@*\s]+$/.test(p))
        .map(escapeLead);
}

/** 剥块尾 IAL 行（09-17 □1 kramdown 取文通道）：getBlockKramdown 产物末行恒为
 *  `{: id="…" updated="…" …}`（块级属性），就地断句零属性语义=插回不带 custom 与
 *  id 属性，喂引擎前剥掉。只剥「独占末行且以 {: 起头」的块级 IAL；行内标记尾缀
 *  （`</span>{: style=…}` 与正文同行）不碰——那是 getBlockKramdown 的行内输出
 *  形态，markdown 通道回灌实测无损（09-17 dev 6808 实验锚，被内核吸收不产字面
 *  残渣）。 */
export function stripBlockIAL(kramdown: string): string {
    const lines = kramdown.split("\n");
    if (lines.length > 1 && /^\{:/.test(lines[lines.length - 1])) lines.pop();
    return lines.join("\n");
}

/** 摘抄断句 kramdown 取文的正文容器收集（09-22 □1，摘抄管线 digestUtils 用）：结构判据
 *  与 getBlockOwnEditableText 同款（2026-09-15 鸟反馈规则——无 class 的 contenteditable
 *  直子=正文层；外来插件标注容器带 class、官方 protyle-attr 不混入），但取 HTML 而非
 *  textContent：调用方套段落壳过 BlockDOM2Md 得存储形态 kramdown 喂断句引擎（行内标记
 *  随句保留，textContent 通道=样式进引擎前全丢的旧根因）。判据失配（无正文直子，如
 *  代码块结构）返回 null，调用方回退旧 textContent 通道（宁丢样式不丢文本）。 */
export function ownEditableChildrenHTML(el: Element): string | null {
    let html: string | null = null;
    for (const child of Array.from(el.children)) {
        if (child.hasAttribute("contenteditable") && child.classList.length === 0) {
            html = (html ?? "") + child.outerHTML;
        }
    }
    return html;
}
