// 断句管线（□14 从 SplitSentence.ts 迁出为纯函数文件，沿 splitEn.ts/escapeLead.ts 先例
// 保单测可直测）。公式跨度保护（□14，□13 评审 P2-4 正交既有问题）：断句符集
// （。！？；：……/英文句点族）对全文盲切，行内公式 $f(a)。b$ 内的标点会被当句界
// 腰斩成「$f(a)。」「b$」两片——公式渲染坏 + 片语义碎。修法=断句前把公式 span 替换
// 成 NUL 占位符（断句符 split/trim/移标点/英文句点扫描均不碰 NUL），断句完按索引还原。
// span 判定是 Lute InlineMath 的保守简化：$$..$$ 优先（可跨行，罩住段落内软换行的
// 公式块形态）、$..$ 不跨行、中间无 $；不成对 $（shell 提示符/孤立货币）零影响。
// 保守误锁可接受（splitEn「宁可漏切、不可误切」同族）：成对货币 $5 和 $10 会被当
// span 锁住——只导致该区间少切，文本还原零损失。
// 主实例实测（2026-09-04）：113 个含 $ 段落块 0 命中公式内断句标点——本项为防御性
// 修复（数学书用户面），与 □13 mergeMathLead（治「$$ 前导片段」症状）构成根因闭环。
import { splitBySentencePeriod } from "./splitEn";

const MATH_SPAN_RE = /\$\$[\s\S]*?\$\$|\$[^$\n]+?\$/g;
const LINK_IMG_RE = /!?\[[^\]\n]*\]\([^)\n]*\)/g;
const PLACEHOLDER_RE = /\u0000(\d+)\u0000/g;

function mathGuard(ps: string[]): { guarded: string[]; restore: (out: string[]) => string[] } {
    const vault: string[] = [];
    const stash = (m: string) => `\u0000${vault.push(m) - 1}\u0000`;
    // 公式先锁（链接 text/url 里的 $ 可靠锁公式），链接/图片后锁（占位符无 [] 不二次命中）
    const guarded = ps.map(s => s.replace(MATH_SPAN_RE, stash).replace(LINK_IMG_RE, stash));
    const restore = (out: string[]) => out.map(s => s.replace(PLACEHOLDER_RE, (_, i) => vault[i]));
    return { guarded, restore };
}

export function splitLines(ps: string[]) {
    const { guarded, restore } = mathGuard(ps);
    ps = guarded;
    for (const s of "\n。！？；：") ps = splitBy(ps, s);
    ps = splitBy(ps, "……");
    ps = splitBy(ps, "! ");
    ps = splitBy(ps, "? ");
    ps = splitBy(ps, "; ");
    ps = splitBySentencePeriod(ps);
    ps = closeInlineMarks(ps);
    return restore(ps);
}

function shouldMove(s: string) {
    return s.startsWith("”")
        || s.startsWith("’")
        || s.startsWith("\"")
        || s.startsWith("'")
        || s.startsWith("】")
        || s.startsWith("]")
        || s.startsWith("}")
        || s.startsWith(")")
        || s.startsWith("）")
        || s.startsWith("』") //『』
        || s.startsWith("」") //「」
        || s.startsWith("!")
        || s.startsWith("！")
        || s.startsWith("。")
        || s.startsWith(". ")
        || s.startsWith("?")
        || s.startsWith("？")
        || s.startsWith(";")
        || s.startsWith("；")
        || s.startsWith(":")
        || s.startsWith("：")
        || s.startsWith(">")
        || s.startsWith("》")
        || s.startsWith("…");
}

function movePunctuations(a: string, b: string) {
    while (shouldMove(b)) {
        a += b[0];
        b = b.slice(1);
    }
    return [a, b];
}

export function splitBy(content: string[], s: string) {
    const sentences: string[] = [];
    for (const c of content.filter(i => i.length > 0)) {
        const parts = c.split(s);
        for (let i = 0; i < parts.length; i++) {
            if (i < parts.length - 1) {
                parts[i] += s;
            }
            let j = i;
            while (j > 0) {
                const [a, b] = movePunctuations(parts[j - 1], parts[j]);
                parts[j - 1] = a;
                parts[j] = b;
                j--;
            }
        }
        sentences.push(...parts.map(i => i.trim())
            .filter(i => i.length > 0)
            .filter(i => i != "*"));
    }
    return sentences;
}

// —— 跨句行内标记补全（devbatch □1，2026-09-16 群反馈 om_x100b6593901fb4a8b49b36d662b23ce）——
//
// 症状：`这句**很关键。要记住**。` 按句切开后片1=`这句**很关键。`（开标记悬空）、
// 片2=`要记住**。`（闭标记孤立）——内核 markdown 解析失配丢弃=跨句样式丢/污染；
// 历史清理（splitBy 尾部 \*+$ 删除，2024-01 4d167e30 引入）把闭合星号当残渣删=帮凶，
// 已收编为本函数放弃线的兜底（补全失败才删尾星）。
//
// 策略=切开处补全标记对（两片各自闭合——保住句边界语义，样式视觉等价）：
// - 跨片栈传递：片 i 扫描终态未闭合栈非空 → 尾补闭合标记，栈传片 i+1 头补开标记
//   原文（HTML 开标签含 style/data-type 属性完整回填——用户变色=<span data-type="text"
//   style="color:…">、划线=<span data-type="mark" …>，思源存储形态，== 只是输入语法）；
//   片 i+1 内遇同种标记自然与栈配对（头补+片内闭标记=完整对）。
// - 标记族：字符对（**、__、==、~~、`）同形就近配对；HTML 对（span/u/mark/b/i/
//   strong/em/sub/sup/kbd…）按标签名栈配对。链接/图片已 vault 化（LINK_IMG_RE）
//   整体不切；公式占位符 \u0000N\u0000 扫描时整段跳过（closeInlineMarks 接在
//   restore 之前，公式/链接已全部占位）。
// - 单 * / 单 _ 不参与：歧义高（列表符/乘号/分隔线），字面星号误补=制造样式。
//   贴字性双检（CommonMark flanking 简化）：闭=前贴非空白且栈顶同种，开=后贴非空白；
//   都不满足=字面跳过（`** a**` 全字面不误补）。
// - 放弃线（宁可漏补、不可误补，splitEn 同族）：单片终态栈深>2 / 同种标记交错
//   （栈里同种不在栈顶）/ 孤立 HTML 闭标签无 carry 配对 / 末片后栈仍非空（书源
//   本身不闭合）→ 全批放弃回退老清理（尾部 \*+$ 删除）。
// - 纯标记片（trim 后整片仅标记字符/标签，切分把闭合标记单独成片）→ 丢弃。
type MarkTok = { char: string } | { tag: string; open: string };

const CHAR_MARKS = ["**", "__", "==", "~~", "`"];
const HTML_TAG_RE = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^"'>])*)>/;
const PURE_MARK_RE = /^(?:[*_~`]+|<\/?[a-zA-Z][^>]*>)+$/;

function scanInlineMarks(p: string, stack: MarkTok[]): boolean {
    let i = 0;
    while (i < p.length) {
        if (p[i] === "\u0000") { // vault 占位符整段跳过
            const next = p.indexOf("\u0000", i + 1);
            i = next < 0 ? p.length : next + 1;
            continue;
        }
        if (p[i] === "<") {
            const m = HTML_TAG_RE.exec(p.slice(i));
            if (m) {
                const [, slash, tag, attrs] = m;
                if (slash) {
                    const top = stack[stack.length - 1];
                    if (!top || !("tag" in top) || top.tag !== tag) return false; // 孤立闭标签/交错 → 放弃
                    stack.pop();
                } else {
                    stack.push({ tag, open: `<${tag}${attrs}>` });
                }
                i += m[0].length;
                continue;
            }
        }
        const tok = CHAR_MARKS.find(t => p.startsWith(t, i));
        if (tok) {
            const after = p[i + tok.length];
            const same = stack[stack.length - 1];
            const canClose = i > 0 && !/\s/.test(p[i - 1]) && same && !("tag" in same) && same.char === tok;
            const canOpen = after !== undefined && !/\s/.test(after);
            if (canClose) stack.pop();
            else if (canOpen) stack.push({ char: tok });
            // 双不满足=字面跳过
            i += tok.length;
            continue;
        }
        i++;
    }
    return true;
}

function openText(stack: MarkTok[]): string {
    return stack.map(t => ("tag" in t) ? t.open : t.char).join("");
}

function closeText(stack: MarkTok[]): string {
    return stack.map(t => ("tag" in t) ? `</${t.tag}>` : t.char).reverse().join("");
}

export function closeInlineMarks(ps: string[]): string[] {
    if (ps.length <= 1) return ps; // 单片批无切分发生，书源原样（补全只对切分产生的片界有意义）
    const carry: MarkTok[] = [];
    const out: string[] = [];
    for (const p of ps) {
        if (PURE_MARK_RE.test(p.trim())) continue; // 纯标记片丢弃（老 filter i=="*" 语义扩展）
        const stack = [...carry];
        if (!scanInlineMarks(p, stack) || stack.length > 2) {
            return ps.map(i => i.replace(/\*+$/g, "")); // 放弃线：回退老清理
        }
        out.push(openText(carry) + p + closeText(stack));
        carry.length = 0;
        carry.push(...stack);
    }
    return carry.length > 0
        ? ps.map(i => i.replace(/\*+$/g, "")) // 末片后仍悬空=书源本身不闭合 → 放弃
        : out;
}
