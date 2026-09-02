// □1 渲染层地基几何纯函数（spec docs/tomato-mindwire-visual-spec.md §2/§4.1/§5.3）。
// 内容坐标系（D1）：所有坐标相对滚动容器内容原点（rect 差值一次换算），层挂容器内
// 随滚动走，滚动期零重算。块级出线点为现役 getEdgePoint 行为原样迁移（块级现状不动）。

export interface Pt {
    x: number;
    y: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** 视口 rect → 内容坐标锚信息：cx=横向中心，top/bottom=内容坐标纵向，w=宽度 */
export function toContentRect(elRect: { left: number; top: number; bottom: number; width: number }, contentRect: { left: number; top: number }) {
    return {
        cx: elRect.left + elRect.width / 2 - contentRect.left,
        top: elRect.top - contentRect.top,
        bottom: elRect.bottom - contentRect.top,
        w: elRect.width,
    };
}

/** 视口 rect 四边平移到内容坐标（块级出线点入参；与 toContentRect 同族，供需要 left/right 的消费方） */
export function shiftRect(rect: { left: number; right: number; top: number; bottom: number }, origin: { left: number; top: number }) {
    return {
        left: rect.left - origin.left,
        right: rect.right - origin.left,
        top: rect.top - origin.top,
        bottom: rect.bottom - origin.top,
    };
}

/** 块级出线点：近水平取贴目标一侧的侧缘中点，近垂直取朝向目标的顶/底缘中点（现役逻辑迁移） */
export function getEdgePoint(source: { left: number; right: number; top: number; bottom: number }, target: { left: number; right: number; top: number; bottom: number }): Pt {
    const scx = (source.left + source.right) / 2;
    const scy = (source.top + source.bottom) / 2;
    const tcx = (target.left + target.right) / 2;
    const tcy = (target.top + target.bottom) / 2;

    const THRESHOLD = 20;
    const dx = Math.abs(scx - tcx);
    const dy = Math.abs(scy - tcy);

    if (dx > THRESHOLD && dx > dy) {
        return scx < tcx ? { x: source.right, y: scy } : { x: source.left, y: scy };
    }

    if (scy < tcy) {
        return { x: scx, y: source.bottom };
    } else if (scy > tcy) {
        return { x: scx, y: source.top };
    }

    return scx < tcx ? { x: source.right, y: scy } : { x: source.left, y: scy };
}

/** 块级直线 path（块级行为现状不动：直线、无端点装饰） */
export function blockWirePath(p1: Pt, p2: Pt): string {
    return `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;
}

/** 词级贝塞尔 path（spec §4.1.2）：同行=下垂弧 quadratic，跨行=垂直控制臂 S 形 cubic */
export function wordWirePath(p1: Pt, p2: Pt, w1: number, w2: number): string {
    return wordWireGeometry(p1, p2, w1, w2).d;
}

export interface WordWireGeometry {
    d: string;
    /** t=0.5 中点（de Casteljau；□3 迷你条定位消费） */
    mid: Pt;
}

/** 词级贝塞尔完整几何（path d + 线中点）。迷你条悬在中点上方 8px（spec §4.5），
 *  中点=quadratic 0.25P1+0.5C+0.25P2 / cubic 0.125P1+0.375C1+0.375C2+0.125P2 */
export function wordWireGeometry(p1: Pt, p2: Pt, w1: number, w2: number): WordWireGeometry {
    if (Math.abs(p2.y - p1.y) <= 24) {
        let sag = clamp(Math.abs(p2.x - p1.x) * 0.2 + 12, 12, 40);
        if (Math.abs(p2.x - p1.x) < (w1 + w2) / 2) sag *= 1.5;
        const cx = (p1.x + p2.x) / 2;
        const cy = Math.max(p1.y, p2.y) + sag;
        return {
            d: `M ${p1.x} ${p1.y} Q ${cx} ${cy} ${p2.x} ${p2.y}`,
            mid: { x: (p1.x + 2 * cx + p2.x) / 4, y: (p1.y + 2 * cy + p2.y) / 4 },
        };
    }
    const s = p2.y >= p1.y ? 1 : -1;
    const d = clamp(Math.abs(p2.y - p1.y) * 0.45 + 16, 16, 96);
    const c1y = p1.y + d * s;
    const c2y = p2.y - d * s;
    return {
        d: `M ${p1.x} ${p1.y} C ${p1.x} ${c1y} ${p2.x} ${c2y} ${p2.x} ${p2.y}`,
        // C1.x=p1.x、C2.x=p2.x → 中点 x 即两端均值
        mid: {
            x: (p1.x + p2.x) / 2,
            y: (p1.y + 3 * c1y + 3 * c2y + p2.y) / 8,
        },
    };
}

/** 线中点迷你条锚位（spec §4.5）：left/top=中点（上浮 8px 由 CSS transform 承担）；
 *  距层顶 <40px 翻到线下方（below 变体 translateY(+8px)，防被滚动容器顶裁） */
export function toolbarPos(mid: Pt): { left: number; top: number; below: boolean } {
    return { left: mid.x, top: mid.y, below: mid.y < 40 };
}

// ---------------------------------------------------------------------------
// 滚动三态 + 线头残端（□4 · spec §4.1.4/§4.2）。双端离屏不画由容器 overflow 裁剪
// 自然涌现（零代码）；本组纯函数锁滚动期 chip 显隐判定与残端锚位/钳制/方向。
// 双 chip 预建：chip 挂层内锚词旁随内容走（位置/方向重画时由内容序定死），
// 滚动事件只剩 rAF 切显隐——线本体与 chip 几何零滚动重算（D1 不破）。
// ---------------------------------------------------------------------------

export type WireViewState =
    | { state: "both" }
    | { state: "none" }
    | { state: "stub"; visibleEnd: 0 | 1; dir: "down" | "up" };

/** 三态判定（spec §4.1.4）：端与视口相交即可见（贴缘/跨缘半截不算离屏——
 *  锚词还有像素在屏上，用户看得见它，不需要 chip 指路）；单端离屏时
 *  dir=离屏端相对可见端的方向（chevron 朝向），两端对称 */
export function wireViewState(
    end1: { top: number; bottom: number },
    end2: { top: number; bottom: number },
    view: { top: number; bottom: number },
): WireViewState {
    const vis = (e: { top: number; bottom: number }) => e.bottom >= view.top && e.top <= view.bottom;
    const v1 = vis(end1);
    const v2 = vis(end2);
    if (v1 && v2) return { state: "both" };
    if (!v1 && !v2) return { state: "none" };
    if (v1) return { state: "stub", visibleEnd: 0, dir: end2.top > view.bottom ? "down" : "up" };
    return { state: "stub", visibleEnd: 1, dir: end1.top > view.bottom ? "down" : "up" };
}

/** 残端 chip 锚位（spec §4.2）：下离屏=锚词底缘+14px；上离屏=顶缘−38px（chip 高~24 含
 *  chevron）；left=锚词中心 x（CSS translateX(-50%) 居中锚定）。
 *  □5 拍板：availAbove=锚词上方可用空间（到上邻块底/层顶），上态且空间 <38px 时
 *  下置到词底+14（与 down 态同位、chevron 仍朝上）——防 chip 越块顶与上一块底边框
 *  贴碰；块级锚不传（骑块顶是块级既有形态，下置会盖块内首行文字） */
export function stubPos(anchor: { cx: number; top: number; bottom: number }, dir: "down" | "up", availAbove = Infinity): { left: number; top: number } {
    if (dir === "up" && availAbove < 38) return { left: anchor.cx, top: anchor.bottom + 14 };
    return dir === "down"
        ? { left: anchor.cx, top: anchor.bottom + 14 }
        : { left: anchor.cx, top: anchor.top - 38 };
}

/** 残端 chip 视口缘让位（□5 拍板）：chip 挂内容坐标随滚动走，锚词恰在视口顶/底缘时
 *  chip 被裁半个——滚动 rAF 里按视口算 marginTop 精确推回缘内（顶越推正/底越推负，
 *  各留 4px 余量；缘内零让位）。chip 高按 ~24 计（视觉 22+热区皮） */
export function stubEdgeShift(chipTop: number, view: { top: number; bottom: number }): number {
    const CHIP_H = 24;
    if (chipTop < view.top) return view.top - chipTop + 4;
    if (chipTop + CHIP_H > view.bottom) return view.bottom - chipTop - CHIP_H - 4;
    return 0;
}

/** 残端 chip 水平钳制：中心 x 限制在 [8+半宽, 层宽−8−半宽]，左右留 8px 边距；
 *  层比 chip 还窄（lo≥hi）时贴左——左缘 8px 边距优先，右半溢出由层 overflow 裁 */
export function clampStubX(left: number, halfWidth: number, layerWidth: number): number {
    const lo = 8 + halfWidth;
    const hi = layerWidth - 8 - halfWidth;
    return lo >= hi ? lo : clamp(left, lo, hi);
}

/** chip 方向（内容序定死，与滚动无关）：对端纵向中点在本端下方 → down。
 *  挂「较上端」旁的 chip 显示时必然是下端离屏（下端在视口上方则上端更不可见），
 *  故方向在重画时即可判定；中点相等（同行）兜底 down */
export function stubDir(self: { top: number; bottom: number }, other: { top: number; bottom: number }): "down" | "up" {
    return (other.top + other.bottom) / 2 >= (self.top + self.bottom) / 2 ? "down" : "up";
}
