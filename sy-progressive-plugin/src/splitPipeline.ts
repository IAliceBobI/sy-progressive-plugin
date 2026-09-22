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
// 块引用 kramdown 形态（09-22 □1 实测 3.8.4）：`((id "锚文本"))` / `((id "锚文本" "s"))`
// ——锚文本常带句号（引用目标即句子），盲切=断引信，回灌内核落字面文本泄漏进正文。
const BLOCK_REF_RE = /\(\([0-9]{14}-[a-z0-9]+\s+"[^"\n]*"(?:\s+"[a-z]{1,2}")?\)\)/g;
// 备注脱糖形态（09-22 □1 实测）：getBlockKramdown 把 inline-memo 剥成 `正文<sup>（内容）
// </sup>`（kramdown 通道不带备注 span 回灌），备注内容含句号时被腰斩=多条备注+sup 裸裂。
// sup 整体 vault（用户真上标通常短引用无句号，误锁=该区间少切，零损失）。
const SUP_RE = /<sup[^>]*>[\s\S]*?<\/sup>/g;
const PLACEHOLDER_RE = /\u0000(\d+)\u0000/g;

function mathGuard(ps: string[]): { guarded: string[]; restore: (out: string[]) => string[] } {
    const vault: string[] = [];
    const stash = (m: string) => `\u0000${vault.push(m) - 1}\u0000`;
    // 公式先锁（链接 text/url 里的 $ 可靠锁公式），链接/图片后锁（占位符无 [] 不二次命中）；
    // 块引用/sup 再后锁（占位符无 ((/ 字母 tag 不二次命中）
    const guarded = ps.map(s => s.replace(MATH_SPAN_RE, stash).replace(LINK_IMG_RE, stash)
        .replace(BLOCK_REF_RE, stash).replace(SUP_RE, stash));
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

function closeText(stack: MarkTok[], ialMap: Map<string, string>): string {
    // 09-22 □1：闭合补全按原 kramdown 的 IAL 映射带后缀（`</span>{: style=…}` / `=={:
    // style=…}` 存储形态）——行内 {: style} 与被切标记分离=除末片外外观丢失的修法②
    return stack.map(t => ("tag" in t)
        ? `</${t.tag}>${ialMap.get(t.open) ?? ""}`
        : `${t.char}${ialMap.get(t.char) ?? ""}`).reverse().join("");
}

// 行内 IAL 后缀（kramdown 存储形态，紧跟闭合标记：`</span>{: style=…}`、`==…=={: style=…}`）
const IAL_RE = /^\{:[^}]*\}/;

/** 预扫全批片序，收集「闭合标记→紧随 IAL」映射（09-22 □1 修法②）：IAL 在原 kramdown
 *  里只出现在被切标记真正闭合的那一片（末片），而补全发生在每一片——先扫后补。
 *  tag 形态栈式配对（开 tag 串=键，同开串同款 IAL 折叠取末次）；字符对形态按标记本身
 *  为键（同种标记同款样式，物理上 kramdown 不区分实例）。 */
function collectCloseIALs(ps: string[]): Map<string, string> {
    const map = new Map<string, string>();
    const stack: { tag: string; open: string }[] = [];
    for (const p of ps) {
        let i = 0;
        while (i < p.length) {
            if (p[i] === "<") {
                const m = HTML_TAG_RE.exec(p.slice(i));
                if (m) {
                    const [, slash, tag, attrs] = m;
                    if (slash) {
                        for (let k = stack.length - 1; k >= 0; k--) {
                            if (stack[k].tag === tag) {
                                const ial = IAL_RE.exec(p.slice(i + m[0].length));
                                if (ial) map.set(stack[k].open, ial[0]);
                                stack.length = k;
                                break;
                            }
                        }
                    } else {
                        stack.push({ tag, open: `<${tag}${attrs}>` });
                    }
                    i += m[0].length;
                    continue;
                }
            }
            i++;
        }
    }
    for (const t of CHAR_MARKS) {
        const re = new RegExp(`${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\{:[^}]*\\})`);
        for (const p of ps) {
            const m = re.exec(p);
            if (m) map.set(t, m[1]);
        }
    }
    return map;
}

/** 片首孤儿闭合标记与 carry 配对消耗（09-22 □1 修法①）：句界落在标记收尾时，闭合标记
 *  孤立在片首——canClose 的 i>0 前置（行内 flanking 简化）使它被误判新开标记，栈深
 *  超限触发整批放弃线→裸片。修=片首闭合标记与栈顶（carry）同种则配对：标记+紧随 IAL
 *  从正文剥除、栈顶弹出——该跨度的闭合已由上一片的补全闭合接管，本片不再头补其开
 *  形态（闭在上一片末尾的语义，正是原 kramdown 的真实切分点）。纯标记片/剥空片同
 *  通道消耗（不产出空残渣片）。 */
function pairHeadClosers(p: string, stack: MarkTok[]): string {
    let s = p;
    while (s.length) {
        const top = stack[stack.length - 1];
        if (!top) break;
        if ("tag" in top) {
            const m = new RegExp(`^</${top.tag}\\s*>`).exec(s);
            if (!m) break;
            s = s.slice(m[0].length);
        } else {
            if (!s.startsWith(top.char)) break;
            s = s.slice(top.char.length);
        }
        stack.pop();
        const ial = IAL_RE.exec(s);
        if (ial) s = s.slice(ial[0].length);
    }
    return s;
}

export function closeInlineMarks(ps: string[]): string[] {
    if (ps.length <= 1) return ps; // 单片批无切分发生，书源原样（补全只对切分产生的片界有意义）
    const ialMap = collectCloseIALs(ps);
    const carry: MarkTok[] = [];
    const out: string[] = [];
    for (const p of ps) {
        const stack = [...carry];
        const body = pairHeadClosers(p, stack);
        const reopened = openText(stack); // 配对后剩余 carry 的开形态头补
        const trimmed = body.trim();
        if (trimmed !== "" && !PURE_MARK_RE.test(trimmed)) {
            if (!scanInlineMarks(body, stack) || stack.length > 2) {
                return ps.map(i => i.replace(/\*+$/g, "")); // 放弃线：回退老清理
            }
            out.push(reopened + body + closeText(stack, ialMap));
        }
        // carry 恒推进到本片终态：纯标记片/剥空片只消耗不产出（老 filter i=="*" 语义扩展）
        carry.length = 0;
        carry.push(...stack);
    }
    return carry.length > 0
        ? ps.map(i => i.replace(/\*+$/g, "")) // 末片后仍悬空=书源本身不闭合 → 放弃
        : out;
}
