// 制卡选路（2026-09-13 跨块制卡修复，bear 拍板「直接使用这几个块」）：makeCard 依
// 统一三级链（libs/selection.ts）结果分通道。旧版 cloneSelectedLineMarkdowns 只查
// 块选类——思源 3.8 起拖蓝不再转块选（issue 8554），跨块拖蓝漏检后退到挖空分支，
// 该分支只抓 endContainer 末块=前块蒸发（只对末块局部挖空）。纯函数零单例耦合。
import type { SelectionResult } from "../../sy-tomato-plugin/src/libs/selection";

/**
 * 块级制卡取块：块多选（现状语义）与跨块拖蓝（2+ 块整块进卡、不挖空）返回 blocks；
 * 单块内划词（挖这段字）、光标/全空返回 null——调用方落回挖空/光标兜底通道。
 */
export function cardBlocksForMake(s: SelectionResult | null | undefined): HTMLElement[] | null {
    if (!s || s.blocks.length === 0) return null;
    if (s.level === "select") return s.blocks;
    if (s.level === "range" && s.blocks.length > 1) return s.blocks;
    return null;
}
