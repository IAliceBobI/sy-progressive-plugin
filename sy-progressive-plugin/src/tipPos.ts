/** □10 浮条 tooltip 防溢定位（纯函数，单测锁数学；语义对齐思源 showTooltip north 分支
 *  app/src/dialog/tooltip.ts：居中锚 → 右缘钳 → 左缘钳；北侧空间不足翻南侧）。
 *  背景：b3-tooltips 纯 CSS 气泡居中锚定按钮中心，被浮条 .floatbar-body(overflow:auto)
 *  裁切——平铺区两端按钮 tip 天然溢出（按钮还可拖拽换位，压文案治标追不上）；
 *  改写思源原生 #tooltip 单例（fixed 定位、max-width 320px 折行），本函数只管几何。
 *  与原生协议的两处有意差异：gap 默认 5 对齐旧 CSS 气泡 margin-bottom 观感（原生
 *  space=0.5）；不走 DOMPurify/innerHTML 而由调用方 textContent 写纯文本，也不 emit
 *  before-show/hide-tooltip 广播——插件复刻不仿冒原生事件面。 */

export interface TipAnchorRect {
    /** 锚元素视口坐标（getBoundingClientRect 子集；bottom 与 top 分开传，翻转判断用） */
    left: number;
    top: number;
    bottom: number;
    width: number;
}

export interface TipPos {
    left: number;
    top: number;
}

export function northTipPos(
    anchor: TipAnchorRect,
    tipW: number,
    tipH: number,
    vw: number,
    vh: number,
    gap = 5,
): TipPos {
    // 水平：气泡中心对齐锚中心，右溢钳右缘、左溢钳 0（顺序保证 tip 超视口宽时不出负值）
    let left = anchor.left - (tipW - anchor.width) / 2;
    if (left + tipW > vw) left = vw - tipW;
    left = Math.max(0, left);
    // 垂直：默认置锚上方；锚贴近视口顶（上方放不下）翻到锚下方，翻后底溢再钳底缘
    let top = anchor.top - tipH - gap;
    if (top < 0) top = anchor.bottom + gap;
    if (top + tipH > vh) top = Math.max(0, vh - tipH);
    return { left, top };
}
