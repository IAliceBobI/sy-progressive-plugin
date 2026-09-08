// 期1 写作书：粘贴大纲 → 槽名列表。纯函数零依赖（TDD 见 tests/unit/outline.test.ts）。
// 一行一槽名；空行/纯格式行跳过；用户自带序号前缀（1. / 一、/ (2) / ## 等）剥掉；
// 剥掉文档名非法字符（/ 会把 createDocWithMd 的路径分层、全角空格与零宽空格静默吞）。
import { MarkKey } from "../../sy-tomato-plugin/src/libs/gconst";
import { getDocIalPieces, pieceDocName, pieceAlias } from "./progData";

/** 行首序号前缀：阿拉伯/中文数字 + 分隔符，或括号包裹。序号与小数（3.14）靠
 *  「数字后紧跟数字不剥」区分（调用处特判，正则自身区分不了） */
const ARABIC_PREFIX = /^\d+\s*[.、．)）]/;
const ARABIC_PAREN = /^[（(]\s*\d+\s*[)）]/;
const CN_NUM = "零一二三四五六七八九十百千两";
const CN_PREFIX = new RegExp(`^[${CN_NUM}]+\\s*[、.．]`);
const CN_PAREN = new RegExp(`^[（(]\\s*[${CN_NUM}]+\\s*[)）]`);

function stripLinePrefix(line: string): string {
    let s = line.trim();
    s = s.replace(/^#+\s*/, ""); // markdown 标题
    s = s.replace(/^[-*•·]\s*/, ""); // 列表符号
    // 序号前缀剥一层；"数字.数字" 形（小数开头槽名）不剥
    if (/^\d+\.\d/.test(s)) {
        // keep
    } else if (ARABIC_PREFIX.test(s) || ARABIC_PAREN.test(s)
        || CN_PREFIX.test(s) || CN_PAREN.test(s)) {
        s = s.replace(ARABIC_PREFIX, "").replace(ARABIC_PAREN, "")
            .replace(CN_PREFIX, "").replace(CN_PAREN, "");
    }
    return s.trim();
}

/** 粘贴的大纲原文 → 槽名数组（保序）；全空输入返回 []，调用方自行建默认槽 */
export function parseOutlineLines(text: string): string[] {
    if (!text) return [];
    const out: string[] = [];
    for (const raw of text.split(/\r?\n/)) {
        const name = stripLinePrefix(raw)
            .replace(/[　/\u200B]+/g, "")
            .trim();
        if (name) out.push(name);
    }
    return out;
}

/** 写作书建片计划项：title=文档名（片名 [N]槽名），attrs=与阅读书 createNote 同款
 *  IAL（MarkKey 身份+card-priority+alias）；不写 origin-text/readonly（无原书） */
export interface WritingPiecePlan {
    point: number;
    title: string;
    attrs: AttrType;
}

/** 槽名列表 → 建片计划（point 0 起，与阅读书片同一身份体系）；槽名须非空
 *  （parseOutlineLines 已滤空，无大纲时调用方先兜底默认槽再进来） */
export function planWritingPieces(bookID: string, bookName: string, slots: string[]): WritingPiecePlan[] {
    return slots.map((slot, i) => ({
        point: i,
        title: pieceDocName(i, slot),
        attrs: {
            "custom-card-priority": "50",
            [MarkKey]: getDocIalPieces(bookID, i),
            alias: pieceAlias(bookName, slot),
        } as AttrType,
    }));
}
