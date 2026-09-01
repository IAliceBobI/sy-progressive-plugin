// □1（2026-09-01）目录跳转/高亮纯函数：readThisPiece 候选匹配 + 片态目录当前位置高亮。
// 纯逻辑无 siyuan 依赖，行为锁定单测在 tests/unit/contentsJump.test.ts。
import type { OutlineRow } from "./contentsOutline";

/**
 * 候选链就近匹配分片索引：candidates 按就近优先（块自身 → 逐级祖先），第一个在
 * 索引里出现的候选即命中，返回其片号与 id。
 *
 * 为什么不再一律爬到顶层祖先（□21 旧逻辑）：□21 修复的前置假设是「索引只收顶层块、
 * 嵌套标题没有自己的 progref」——对超块/列表容器成立；但思源 heading 容器化书
 * （h2 挂 h1 下的 parent_id 链）getChildBlocks 平铺连嵌套 h2 一起进索引、副本也
 * 各有自己的 progref。一律上爬会把大纲 h2 章标题匹配成 h1 卷祖先的分片——片内目录
 * 点章节「跳不过去/错跳卷片」的根因（2026-09-01 dev 复现）。先试自身再逐级上爬，
 * 两类嵌套的语义都成立。
 */
export function findPieceByCandidates(
    index: string[][],
    candidates: string[],
): { point: number; id: string } | null {
    for (const id of candidates) {
        if (!id) continue;
        for (let p = 0; p < index.length; p++) {
            if (index[p]?.includes(id)) return { point: p, id };
        }
    }
    return null;
}

/**
 * 片态目录当前位置高亮行：当前片（index[point]）包含的大纲标题全部高亮；片内无
 * 大纲标题（纯内容片）时回落「起点之前最近的大纲标题」（大纲序=文档序，取最后一
 * 个位于更早分片的标题行）。point 无效（越界/NaN——书编辑后索引漂移）返回空集不亮。
 */
export function outlineHighlightRows(
    rows: OutlineRow[],
    index: string[][],
    point: number,
): Set<string> {
    const out = new Set<string>();
    if (!Number.isInteger(point) || point < 0 || point >= index.length) return out;
    const pieceOf = new Map<string, number>(); // 大纲标题 id → 所在片号（只看 ≤point）
    for (let p = 0; p <= point; p++) {
        for (const id of index[p] ?? []) {
            if (!pieceOf.has(id)) pieceOf.set(id, p);
        }
    }
    for (const r of rows) {
        if (pieceOf.get(r.id) === point) out.add(r.id);
    }
    if (out.size > 0) return out;
    let last = "";
    for (const r of rows) {
        const p = pieceOf.get(r.id);
        if (p != null && p < point) last = r.id;
    }
    if (last) out.add(last);
    return out;
}
