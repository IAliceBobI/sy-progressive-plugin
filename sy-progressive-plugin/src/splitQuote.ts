// 引述块断句（飞书 2026-10-20 用户650189，截图实证普通段落一句一块、引述块原样不拆）：
// isMultiLineElement 把 "> " 开头的块拦进整块分支原样摘——纯文本引述同样可拆，剥壳断句
// 再逐句套回 "> " 壳。两路接入共用：A=getDigestMd（Lute BlockDOM2Md 产物，内层带
// "> {: …}" 子块 IAL 行 + 尾顶格自身 IAL 行）、B=splitByIDs（SQL blocks.markdown 列，
// > 行族零 IAL、段间裸 >）——输入兼容两种形态（6807 dev 3.8.6 实测钉死，见单测夹具）。
// 零插件依赖纯函数（splitInPlaceCore 同款先例），单测直测。
//
// 回落 null（调用方整块摘现状）的三条线：非 > 形态 / 壳内任一行是结构语法（截碎片毁
// 结构，isWholeBlockDigest 同哲学）/ 拆后 ≤1 句（无拆分收益，整块摘保 IAL 原样）。
// 属性行与回链由回调注入而非本函数拼：A 路恒等闭包回源块尾 IAL（须真 id——{: id=""}
// 空串字面量实测毒化引述句块整行 IAL：属性全丢 + 泄漏游离 p 块，p 档兜底占位符不可
// 沿用）；B 路 getAttrLineWithID 每句新 id，且 blocks.id 须与 attrLine 内嵌 id 同次
// 生成。trailingNewline：B 路 true——insert() 同 textArea 内 join("") 拼接，漏尾 \n
// = 下一块 "> " 行粘上 IAL 行破坏解析；A 路缺省 false——md 数组 join("\n") 分隔已够。
import { LEAD_ESCAPE_RE, escapeLead, mergeMathLead } from "./escapeLead";
import { splitLines } from "./splitPipeline";

// 结构行判据=LEAD_ESCAPE_RE（标题/列表/有序/围栏/嵌套引述/分割线/块级 HTML tag 名单——
// 行内 <span 存储形态落行首不构成块，勿宽判 <字母）+ 三个 LEAD 外块级形态：公式块 $$、
// 表格 |、超级块 {{{（isMultiLineElement 同款形态集）
const STRUCT_EXTRA_RE = /^(?:\$\$|\||\{\{\{)/;

function isStructLine(line: string): boolean {
    return LEAD_ESCAPE_RE.test(line) || STRUCT_EXTRA_RE.test(line);
}

export interface SplitQuoteOpts {
    /** 每句属性行（顶格 {: …}），逐句调用一次、按产物顺序对位 */
    attrLine: () => string;
    /** 回链后缀，紧贴句尾拼接（前导空格由调用方按各自现状决定）；关闭时返 "" */
    backtrace: () => string;
    /** 每块尾部补 \n（B 路 join("") 拼接约定），缺省 false */
    trailingNewline?: boolean;
}

/** 引述块 md → 每句一个独立引述块 md（`> 句${回链}\n${属性行}`），不可拆返 null */
export function splitQuoteMd(quoteMd: string, opts: SplitQuoteOpts): string[] | null {
    const lines = quoteMd.trim().split("\n");
    if (!lines[0].startsWith(">")) return null;
    const inner: string[] = [];
    for (const line of lines) {
        if (line.startsWith(">")) {
            // 剥一层壳（"> " 或裸 ">"）：剥后空=段间/尾部裸 > 行，{: 开头=内层子块 IAL 行
            const s = line.replace(/^> ?/, "").trim();
            if (!s || s.startsWith("{:")) continue;
            inner.push(s);
        } else if (line.startsWith("{:") || line.trim() === "") {
            continue; // 顶格块自身 IAL（调用方未预 pop 时兜底）/ 空行
        } else {
            return null; // 夹带非引述顶格行=形态异常，防误拆
        }
    }
    if (inner.some(isStructLine)) return null;
    // 与 p 档断句同链：splitLines（公式/标签 vault 全在内）→ $$ 前导回粘 → trim 滤空 → 句首转义
    let ps = splitLines([inner.join("\n")]);
    ps = mergeMathLead(ps).map(p => p.trim()).filter(p => p.length > 0);
    if (ps.length <= 1) return null;
    const tail = opts.trailingNewline ? "\n" : "";
    return ps.map(p => `> ${escapeLead(p)}${opts.backtrace()}\n${opts.attrLine()}${tail}`);
}
