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
const PLACEHOLDER_RE = /\u0000(\d+)\u0000/g;

function mathGuard(ps: string[]): { guarded: string[]; restore: (out: string[]) => string[] } {
    const vault: string[] = [];
    const guarded = ps.map(s => s.replace(MATH_SPAN_RE, m => `\u0000${vault.push(m) - 1}\u0000`));
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
            .map(i => i.trim().replace(/\*+$/g, ""))
            .filter(i => i.length > 0)
            .filter(i => i != "*"));
    }
    return sentences;
}
