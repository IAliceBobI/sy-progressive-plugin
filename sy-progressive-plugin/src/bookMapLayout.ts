// □8 知识地图视图层伴生纯函数：片进度点亮/tier 度量/确定性布局/全景收簇。
// 零 siyuan/window 依赖（dagre 纯 JS 无 DOM，可进本层）；数据形态以 bookMapCore
// 为单一事实源。「片挂枝干+进度点亮」的落地形态=证据锚聚合成节点进度徽标
// （bear 原话「分片挂树的枝干上」字面=逐片挂叶，几百片逐叶渲染违反「大图须虑
// 收簇」+噪声；语义不丢——「挂」=anchors、「点亮」=片读态着色聚合）。
import dagre from "@dagrejs/dagre";
import type { BookMap, MapNodeType } from "./bookMapCore";

// ============ 片读态（进度点亮） ============

export type PieceReadState = "unread" | "reading" | "read" | "graduated";

/**
 * 片读态判定：point > curPoint=未读（未出场）；=curPoint=在读；出场且片文档
 * readcard 键值为毕业档案（g#N 形态，readCurveCore formatReadCard 产物）=毕业；
 * 其余=已读。curPoint 无效（-1/NaN/超大）时一切片都是未读——书刚加/断点异常
 * 的保守态。毕业优先于在读（curPoint 恰好落在已毕业片上的边角）。
 */
export function pieceReadState(point: number, curPoint: number, readcard: string | undefined): PieceReadState {
    if (!Number.isFinite(curPoint) || curPoint < 0 || point > curPoint) return "unread";
    if (typeof readcard === "string" && /^g#/.test(readcard)) return "graduated";
    if (point === curPoint) return "reading";
    return "read";
}

/** 节点进度聚合：anchors 分桶计数 + isCurrent=证据锚命中当前阅读位置（高亮环） */
export interface NodeProgress {
    read: number; graduated: number; reading: number; unread: number;
    total: number;
    isCurrent: boolean;
}

export function nodeProgress(
    anchors: number[],
    curPoint: number,
    readcardOf: (point: number) => string | undefined,
): NodeProgress {
    const out: NodeProgress = { read: 0, graduated: 0, reading: 0, unread: 0, total: 0, isCurrent: false };
    const seen = new Set<number>();
    for (const a of anchors) {
        if (!Number.isInteger(a) || seen.has(a)) continue;
        seen.add(a);
        out.total++;
        if (a === curPoint) out.isCurrent = true;
        const st = pieceReadState(a, curPoint, readcardOf(a));
        out[st]++;
    }
    return out;
}

// ============ tier 度量（骨架分层的「核心节点」判据） ============

/** 度 = 边端点计数 ×2 + min(anchors 数, 10)：连接多/证据多的节点是核心（hub）。
 *  锚数封顶防超大锚集（主角挂全书片）碾压连接维度——两者同为「证据多=核心」
 *  但量纲不同，各取所长。 */
export const CORE_DEGREE = 4;

export function nodeDegrees(pool: BookMap): Map<string, number> {
    const d = new Map<string, number>();
    const bump = (id: string, n: number) => d.set(id, (d.get(id) ?? 0) + n);
    for (const n of pool.nodes) bump(n.id, Math.min(n.anchors.length, 10));
    for (const e of pool.edges) { bump(e.from, 2); bump(e.to, 2); }
    return d;
}

// ============ 确定性 dagre 布局 ============

/** 边关系标签显示文案（码位截断防代理对劈裂，BookMapNode cut 同款纪律） */
export function edgeLabelOf(relation: string): string {
    return [...relation].length > 12 ? [...relation].slice(0, 12).join("") + "…" : relation;
}

/** 标签胶囊占位估算（对齐 CSS：11px/1.4 + padding 1×5 + border 1 → 文本宽 CJK≈11/ASCII≈6 + 12）。
 *  交给 dagre 做标签虚拟节点预留——布局给标签留带留位，渲染面标签永不算进卡片 */
function labelSize(relation: string): { w: number; h: number } {
    const w = [...edgeLabelOf(relation)].reduce((s, c) => s + (c.charCodeAt(0) > 0x2e7f ? 11 : 6), 0);
    return { w: Math.ceil(w + 12), h: 20 };
}

/** dagre 布局产物：节点左上角坐标（SvelteFlow position 语义）+ 边标签钉位
 *  （键=池内边序号，与 pool.edges 下标对齐；坐标同空间=直接喂 xyflow） */
export interface PoolLayout {
    nodes: Map<string, { x: number; y: number }>;
    edgeLabels: Map<number, { x: number; y: number }>;
}

/** dagre 布局（同输入同输出）：度 ≥ CORE_DEGREE 的核心节点放大（视觉分层）。
 *  打磨批（09-13 拥挤修复）：nodesep 52→76/ranksep 60→72 + 边标签入 dagre 预留
 *  （multigraph 逐边命名——同节点对多条关系各占各位）。onlyIDs=视图/钻取子集，
 *  边只收两端都在集内的（bookMapCore neighborhood 子图同纪律）。 */
export function layoutPool(pool: BookMap, onlyIDs?: string[]): PoolLayout {
    const out: PoolLayout = { nodes: new Map(), edgeLabels: new Map() };
    const ids = onlyIDs ? new Set(pool.nodes.map(n => n.id).filter(id => onlyIDs.includes(id))) : null;
    const nodes = pool.nodes.filter(n => !ids || ids.has(n.id));
    if (!nodes.length) return out;
    const degrees = nodeDegrees(pool);
    const g = new dagre.graphlib.Graph({ multigraph: true });
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: "TB", nodesep: 76, ranksep: 72, edgesep: 28 });
    for (const n of nodes) {
        const core = (degrees.get(n.id) ?? 0) >= CORE_DEGREE;
        // 高度槽=钉宽后两行摘要+点条的实际上限（宽 156/176 与 CSS .prog-map-node 钉宽一字不差）
        g.setNode(n.id, { width: core ? 176 : 156, height: core ? 80 : 64 } as never); // bookmap P2①（tailbatch □10）：非核槽 140→156——6 字名+徽章后名区仅 ~5 字
    }
    pool.edges.forEach((e, i) => {
        if (ids && (!ids.has(e.from) || !ids.has(e.to))) return;
        const sz = labelSize(e.relation);
        g.setEdge(e.from, e.to, { width: sz.w, height: sz.h } as never, `e${i}`);
    });
    dagre.layout(g, { ranker: "network-simplex" });
    const rankOf = new Map<string, number>();
    for (const n of nodes) {
        const p = g.node(n.id);
        out.nodes.set(n.id, { x: p.x - p.width / 2, y: p.y - p.height / 2 });
        rankOf.set(n.id, Math.round(p.y * 10)); // 同排中心 y 同值（dagre 排内按中心对齐）
    }
    // 同排顶对齐：混合卡高（core 64/普通 48）按中心对齐会产生 8px 纵向错口——相邻卡
    // 边界错口放大贴脸感（09-13 vision P1 龙石岛/潘托斯实锚）。排内统一顶边=名字行
    // 横向齐平；同排水平净空不变（仍=nodesep），标签带净空不受影响（紧对皆为远距对角）
    const tops = new Map<number, number>();
    for (const n of nodes) {
        const key = rankOf.get(n.id)!;
        const top = out.nodes.get(n.id)!.y;
        tops.set(key, Math.min(tops.get(key) ?? Infinity, top));
    }
    for (const n of nodes) out.nodes.get(n.id)!.y = tops.get(rankOf.get(n.id)!)!;
    pool.edges.forEach((e, i) => {
        if (ids && (!ids.has(e.from) || !ids.has(e.to))) return;
        const p = g.edge(e.from, e.to, `e${i}`);
        if (p) out.edgeLabels.set(i, { x: p.x, y: p.y });
    });
    return out;
}

// ============ 全景收簇（大图渐进披露） ============

/** 节点总数超过阈值时，边缘节点（degree≤1）按 type 收成五簇，点簇展开该 type
 *  视图（渐进披露在图上的形态）；≤阈值全可见零簇。密集图首轮收簇后核心面仍超
 *  阈值 → 按 degree 升序继续收（打磨批「巨池递归收簇」），visible 恒 ≤ 阈值。 */
export const COLLAPSE_AT = 80;

export interface MapCluster { type: MapNodeType; ids: string[] }

export function panoramaSpec(pool: BookMap): { visibleIDs: string[]; clusters: MapCluster[] } {
    if (pool.nodes.length <= COLLAPSE_AT) {
        return { visibleIDs: pool.nodes.map(n => n.id), clusters: [] };
    }
    const degrees = nodeDegrees(pool);
    const byType = new Map<MapNodeType, string[]>();
    const visible: string[] = [];
    const collapse = (id: string, t: MapNodeType) => {
        const arr = byType.get(t) ?? [];
        arr.push(id);
        byType.set(t, arr);
    };
    for (const n of pool.nodes) {
        if ((degrees.get(n.id) ?? 0) <= 1) {
            collapse(n.id, n.type);
        } else {
            visible.push(n.id);
        }
    }
    // 打磨批（□8 P2「cluster 巨池递归收簇」）：密集图（degree≥2 占多数）首轮收簇后
    // visible 仍超阈值——按 degree 升序（同度按 id 序=确定性）把低连接节点继续并入同
    // type 簇至 ≤ 阈值。簇内 ids 同 type 归并=「再收一轮」的不动点形态（无需真分层）
    if (visible.length > COLLAPSE_AT) {
        const typeOf = new Map(pool.nodes.map(n => [n.id, n.type] as const));
        const sorted = [...visible].sort((a, b) =>
            (degrees.get(a) ?? 0) - (degrees.get(b) ?? 0) || (a < b ? -1 : a > b ? 1 : 0));
        const toCollapse = new Set(sorted.slice(0, sorted.length - COLLAPSE_AT));
        for (const id of toCollapse) collapse(id, typeOf.get(id) ?? "concept");
        visible.splice(0, visible.length, ...visible.filter(id => !toCollapse.has(id)));
    }
    const clusters: MapCluster[] = [];
    for (const [type, ids] of byType) {
        if (ids.length) clusters.push({ type, ids: [...ids].sort() });
    }
    return { visibleIDs: visible, clusters };
}
