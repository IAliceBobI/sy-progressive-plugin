// □13 p 档句首全角空格退役（2026-09-04 群反馈「拆分为段落块，不应当在段落块前增加空格」）。
// 历史上 p 档每句恒加 U+3000×2（中文首行缩进遗产，448baca6）。裸删不安全：句首命中 Lute
// 块级标记会被解析成标题/列表/引用/代码块。U+3000 前缀也不行：SQL markdown 渲染会剥掉
// 前导 U+3000，而重插翻新取的正是 SQL md——下一轮重分片变标题，环内自腐化。反斜杠转义
// 全链路稳定（dev 3.8.2 实测）：AST 存 NodeBackslash、markdown 保留转义、content 干净。
// 标记只认「后随空白或行尾」的形态（"-x"/"1.x" 本就是段落，Lute 实测与 CommonMark 一致；
// 行尾也算=裸标记独占片段，拼接反链后 "- x" 成列表，review P2-1 实测）；> 与围栏/HTML
// 开 tag 无需空白即成块，恒防；3+ 连续 -*_ 是分割线（裸片段+空反链时成块）。
// 顺序前提：两段 replace 靠「数字类与符号类首字符不相交」保证互不二次处理——LEAD 若
// 将来加入其他数字开头形态，须先重构此互斥约定（review P2-3）。
const LEAD_ESCAPE_RE = /^(?:>|#{1,6}(?:\s|$)|[*+-](?:\s|$)|\d{1,9}[.)](?:\s|$)|```|~~~|<[a-zA-Z!\/]|[-*_]{3,})/;

export function escapeLead(text: string): string {
    if (!LEAD_ESCAPE_RE.test(text)) return text;
    // 有序标记把转义打在标点上（1\. 而非 \1.，数字不可转义）；其余打在首字符上
    return text.replace(/^(\d{1,9})([.)])/, "$1\\$2").replace(/^([#*+>\-~`<[_])/, "\\$1");
}

/** $$ 前导片段回粘上一句（review P1-1）：行首 $$ = Lute 公式块，会吞掉拼接的反链与
 *  IAL；转义三路线全被实测否决（\$$ 毁行内公式渲染 / 前导 U+3000 被 SQL md 剥掉=重插
 *  自腐化 / \ 加空格不是合法转义会泄漏进 content）。回粘后片首是普通文字、行内 $$..$$
 *  语义保真、重插稳定；p 档专用（t/i 片文本落列表项内无行首语义）。首片段以 $$ 开头的
 *  情形上游 isMultiLineElement 已把整块拦进不拆分分支，回粘守卫 i>0 兜底即可。 */
export function mergeMathLead(ps: string[]): string[] {
    const out = [...ps];
    for (let i = out.length - 1; i > 0; i--) {
        if (out[i].startsWith("$$")) {
            out[i - 1] += out[i];
            out.splice(i, 1);
        }
    }
    return out;
}
