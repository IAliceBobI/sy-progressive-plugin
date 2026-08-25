// 英文句号谓词切分：供 splitLines 管道末尾追加，补齐英文句号（". "）句界检测。
// 对没有 ". " 的行（纯中文）天然 no-op，中文断句行为零变化。
// 分层规则（设计原则「宁可漏切、不可误切」——渐进阅读里句子长点无妨，切坏一句伤理解）：
//   1. 句点后随小写字母/数字 → 不切（UAX #29 SB8 复刻，天然挡 e.g./i.e./etc. 等小写缩写）
//   2. 句点前 token 命中缩写黑名单（dr/u.s/p.m/et al. 等）→ 不切
//   3. 句点前是单大写字母（J. K. / Albert I. 这类缩写链）→ 后随词是常见句首词才切
//   4. 行首有序列表标记（1. / 23.）的句点 → 不切
// 规则分层参考 wikimedia/sentencex（MIT）的设计，按本插件场景精简。

const ABBREVIATIONS = new Set([
    // 人名称谓
    "mr", "mrs", "ms", "dr", "prof", "rev", "hon", "pres", "gov", "sen", "rep",
    "st", "jr", "sr",
    // 国家/组织（含内点形态）
    "u.s", "u.s.a", "u.k", "u.n", "e.u",
    // 时间
    "a.m", "p.m",
    // 学术/文献/商业
    "fig", "figs", "eq", "eqs", "no", "nos", "vs", "etc", "e.g", "i.e", "cf",
    "ca", "approx", "dept", "univ", "inc", "ltd", "co", "corp", "vol", "pp",
    "ph.d", "m.d", "b.a", "m.a",
]);

// 单字母缩写（J. K. / Note I.）后随这些常见句首词时，才认定是真句界
const STARTER_WORDS = new Set([
    "the", "he", "she", "it", "they", "we", "i", "you", "but", "and", "or",
    "so", "then", "this", "that", "there", "when", "what", "where", "which",
    "who", "how", "why", "in", "on", "at", "for", "with", "as", "by", "from",
    "later", "after", "before", "now", "however", "meanwhile",
]);

export function splitBySentencePeriod(content: string[]): string[] {
    const out: string[] = [];
    for (const line of content) {
        out.push(...splitLine(line));
    }
    return out.filter(s => s.trim().length > 0);
}

function splitLine(line: string): string[] {
    const cuts: number[] = [];
    for (let i = 0; i < line.length - 1; i++) {
        if (line[i] !== "." || line[i + 1] !== " ") continue;
        if (isSentenceBoundary(line, i)) cuts.push(i);
    }
    if (cuts.length === 0) return [line];
    const parts: string[] = [];
    let start = 0;
    for (const c of cuts) {
        parts.push(line.slice(start, c + 1));
        start = c + 2;
    }
    parts.push(line.slice(start));
    return parts.map(p => p.trim()).filter(p => p.length > 0);
}

function isSentenceBoundary(line: string, i: number): boolean {
    const prefix = line.slice(0, i);
    const rest = line.slice(i + 1).replace(/^\s+/, "");

    // 行首有序列表标记：1. / 23.
    if (/^\s*\d{1,3}$/.test(prefix)) return false;

    // SB8：句点后随小写字母/数字 → 续句
    const next = rest[0];
    if (!next) return false;
    if (/[a-z0-9]/.test(next)) return false;

    // 缩写黑名单：句点前的 token（可含内点，如 U.S / p.m / Ph.D），整词匹配
    const tail = (prefix.match(/[\w.]+$/) || [""])[0].toLowerCase();
    if (ABBREVIATIONS.has(tail)) return false;
    if (/et al$/.test(prefix.toLowerCase())) return false;

    // 单大写字母结尾（J. K. / Albert I.）：后随词是句首词才切
    if (/(?:^|[\s.])([A-Z])$/.test(prefix)) {
        const nextWord = (rest.match(/^[A-Za-z]+/) || [""])[0];
        return STARTER_WORDS.has(nextWord.toLowerCase());
    }

    return true;
}
