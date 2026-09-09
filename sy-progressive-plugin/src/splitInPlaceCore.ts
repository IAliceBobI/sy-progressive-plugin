// 就地断句纯函数层（2026-09-09 立项）：把任意文档里选中的巨段落块按句原地拆成 N 个
// 段落块——不摘抄、不产回链、不挂渐进属性，产物是干净的纯文本句子块走 markdown 通道
// 插回原位。与摘抄断句（getDigestMd split 分支）同引擎（splitLines）不同产物语义：
// 摘抄产物带 * 回链+IAL，就地断句产物零属性（用户整理自己文档，渐进元数据反成污染）。
// 句首转义复用 escapeLead（□13 反斜杠转义全链路稳定结论）：markdown 通道插入时句首
// 命中块级标记会被 Lute 解析成标题/列表，就地拆块比摘抄更不可容忍（改的是原文档）。
// 零插件依赖（只 import splitPipeline/escapeLead 两个纯文件），单测直测。
import { splitLines } from "./splitPipeline";
import { escapeLead, mergeMathLead } from "./escapeLead";

/** 可断性：只有段落块（DOM data-type=NodeParagraph，内核 Node* 命名——非 SQL 的 "p"，
 *  2026-09-09 e2e 实弹纠错）可就地断句。标题/列表/代码块/引述/表格等结构块整体跳过
 *  ——它们要么本就是多行结构，要么拆开会破坏语义。 */
export function isSplittableInPlace(dataType: string | null): boolean {
    return dataType === "NodeParagraph";
}

/** 断句产物：splitLines 盲切 → $$ 前导片回粘 → 摘抄管线同款噪音过滤（@/* 单字符）→
 *  句首块级标记转义。单句输入返回单元素数组，调用方据此跳过该块。 */
export function splitInPlaceSentences(text: string): string[] {
    const ps = mergeMathLead(splitLines([text]));
    return ps
        .map(p => p.trim())
        .filter(p => p.length > 0)
        .filter(p => p != "@" && p != "*" && p != "@*" && p != "*@")
        .map(escapeLead);
}

/** 行内样式预警：断句产物是纯文本句子（textContent 通道），原文里的加粗/高亮/删除线/
 *  行内代码/链接/行内公式会以字面量保留。用于执行前 confirm 提醒，保守误报可接受。 */
export function hasInlineStyles(text: string): boolean {
    return /\*\*|==|~~|`|\[[^\]]+\]\(|\$[^$\n]+\$|\$\$/.test(text);
}
