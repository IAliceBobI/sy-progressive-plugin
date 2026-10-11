// 句末引用编号组判定（飞书 2026-10-11 用户650189）：pdf 转文字的上标引用编号组
// （[21] / [21,22] / [21–23] / [21][22]）落在句末时，断句切口贴着左中括号把编号组
// 推到下一句开头。中文链 splitPipeline（movePunctuations 回粘）与英文链 splitEn
// （splitLine 切口后移）共享本判定；独立成文件避免 splitEn↔splitPipeline 环
// （splitPipeline 已 import splitEn）。seller 经 splitBy 自动继承回粘行为。

// 编号组=「[ + 数字串 + (分隔符+数字串)* + ]」，组内分隔符=半/全角逗号、顿号、
// 连字符族（- – — ~ ～）与空白；连续组整串匹配——含紧邻（[21][22]）与组间空白
// （[21] [22]，pdf 转文字常见形态，评审 P1-2）。组内出现字母或文字（[note]/[注]）
// 一律不命中——宁可漏粘、不可误粘（splitEn 同族哲学）。
const CITE_GROUP = String.raw`\[\d+(?:[\s,，、\-–—~～]+\d+)*\]`;
const CITE_HEAD_RE = new RegExp(`^(?:${CITE_GROUP})(?:\\s*(?:${CITE_GROUP}))*`);

/** s 头部若是纯数字引用编号组（含连续组 [21][22]）返回整串；否则 null。 */
export function matchCiteHead(s: string): string | null {
    return CITE_HEAD_RE.exec(s)?.[0] ?? null;
}

// 句末标点集（。！？；… 与英文 . ! ? ;）：导出供两条链「编号组后紧跟句末标点一并
// 粘入」共用（评审 P1-1：残根句点落在下片头会被英文链当句界切出孤立「.」残渣片）
export const SENTENCE_END_RE = /[。！？；….!?;]/;
// 句末标点后可跟的少量闭合引号/括号（”。[21] 也要粘；闭合族与 shouldMove 同源）
const CLOSERS_RE = /["'”’」』】）)\]}>》]/;

/** 前片（剥掉尾随空白/换行后）是否以句末标点收尾；句末标点后可跟少量闭合引号/
 * 括号。冒号（：/:）不在句末集、空串（片首无前片）不触发。 */
export function endsWithSentenceEnd(s: string): boolean {
    const t = s.replace(/\s+$/, "");
    let i = t.length;
    while (i > 0 && CLOSERS_RE.test(t[i - 1])) i--;
    return i > 0 && SENTENCE_END_RE.test(t[i - 1]);
}
