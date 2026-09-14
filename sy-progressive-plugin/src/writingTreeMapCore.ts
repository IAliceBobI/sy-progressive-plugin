// progtree □3 写作投影纯函数核：树槽平铺（含素材文档，□1 调度视角）→ 剔素材折算
// 父槽计数 → 嵌套投影树 + tidy 树布局。消费方=BookMapDialog 写作分派（只读图形
// 投影，结构读口仍走 writeTree.fetchWritingTreeSlots 唯一通道）。
// 就绪度口径（□3 定案）：materialCount=槽直属 ctime 素材篇数（🔨 锤行同计——锤=
// 素材还在只是推过）、done=PROG_DONE_KEY、gap=空槽（无直属素材且无子槽且非 done——
// done 已定稿不再算缺口，kernel plan gaps 同语义 structureIo.ts）；sacred 不进前端
// （kernel plan 口径）。
import type { WritingTreeSlot } from "./writeTree";

export const WMAP_COL_W = 216; // 列宽=节点 140 + 间距 76
export const WMAP_ROW_H = 64;  // 行高=槽卡实高 ~51 + 间隙（vision P1：52 时相邻
                               // 叶卡间隙仅 1~2px 近乎贴边）

export interface ProjectionSlot {
    docID: string;
    title: string;
    depth: number;             // 树深（0=书直属槽）
    materialCount: number;     // 直属素材篇数（ctime 文档）
    subtreeSlots: number;      // 子树槽总数（含自身）
    subtreeMaterials: number;  // 子树素材总数（含直属）
    subtreeGaps: number;       // 子树缺口槽数（含自身）
    childSlots: ProjectionSlot[];
    done: boolean;
    gap: boolean;
}

export interface WritingProjection {
    roots: ProjectionSlot[];   // 顶层槽（parentID=bookID 的非素材行）
    poolCount: number;         // 书根直属素材数（箱内待归位，不折算进槽）
}

/** 平铺 → 投影树：素材行剔除、计数折算父槽；素材的子文档行与 parentID 非法行
 *  =孤儿丢弃（素材下有结构=极边缘，宁可少做）；从 bookID 出发只保留可达行 */
export function buildWritingProjection(
    slots: WritingTreeSlot[], materials: Set<string>, done: Set<string>, bookID: string,
): WritingProjection {
    const byParent = new Map<string, WritingTreeSlot[]>();
    const matCount = new Map<string, number>();
    for (const s of slots) {
        if (materials.has(s.docID)) {
            matCount.set(s.parentID, (matCount.get(s.parentID) ?? 0) + 1);
            continue;
        }
        const list = byParent.get(s.parentID);
        if (list) list.push(s);
        else byParent.set(s.parentID, [s]);
    }
    const build = (s: WritingTreeSlot): ProjectionSlot => {
        const childSlots = (byParent.get(s.docID) ?? []).map(build);
        const materialCount = matCount.get(s.docID) ?? 0;
        const gap = materialCount === 0 && childSlots.length === 0 && !done.has(s.docID);
        return {
            docID: s.docID,
            title: s.title,
            depth: s.depth,
            materialCount,
            subtreeSlots: 1 + childSlots.reduce((a, c) => a + c.subtreeSlots, 0),
            subtreeMaterials: materialCount + childSlots.reduce((a, c) => a + c.subtreeMaterials, 0),
            subtreeGaps: (gap ? 1 : 0) + childSlots.reduce((a, c) => a + c.subtreeGaps, 0),
            childSlots,
            done: done.has(s.docID),
            gap,
        };
    };
    return {
        roots: (byParent.get(bookID) ?? []).map(build),
        poolCount: matCount.get(bookID) ?? 0,
    };
}

/** tidy 树布局：x=depth*WMAP_COL_W；y=叶子按先序累计 WMAP_ROW_H、父=首末子中点。
 *  height=布局总高（调用方可判画布规模） */
export function layoutWritingTree(roots: ProjectionSlot[]): {
    positions: Map<string, { x: number; y: number }>;
    height: number;
} {
    const positions = new Map<string, { x: number; y: number }>();
    let cursor = 0;
    const place = (n: ProjectionSlot) => {
        if (n.childSlots.length === 0) {
            positions.set(n.docID, { x: n.depth * WMAP_COL_W, y: cursor });
            cursor += WMAP_ROW_H;
            return;
        }
        for (const c of n.childSlots) place(c);
        const first = positions.get(n.childSlots[0].docID)!.y;
        const last = positions.get(n.childSlots[n.childSlots.length - 1].docID)!.y;
        positions.set(n.docID, { x: n.depth * WMAP_COL_W, y: (first + last) / 2 });
    };
    for (const r of roots) place(r);
    return { positions, height: cursor };
}
