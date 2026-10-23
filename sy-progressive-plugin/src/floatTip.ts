// 浮条 tooltip 自建单例（2026-08-31 □1 根治版，取代 □10 的共享 #tooltip 改写方案）。
// 根因（真实轨迹 e2e 实锤，合成 mouseover 是假阴性通道勿作验证）：思源 block/popover.ts
// 有一条 document 级 mouseover 监听（块引/ariaLabel 等候选项的 tip 服务），hover 落到
// 非候选元素——浮条按钮内的 svg、按钮间隙、浮条 padding——都会 hideTooltip() 把共享
// #tooltip 单例藏掉；叠加组件 onFloatOver 的 `btn === tipTarget` 早退与「间隙 mouseout
// 的 relatedTarget 在 .prog-fb 内不清 tipTarget」，被藏后同一按钮再 hover 永不重弹
// （真机「hover 大多不弹、反复移到右下边缘才偶现」的完整链条）。
// 对策：自建元素对思源隐藏生态隐身（hideTooltip 只认 #tooltip id）；复用思源 .tooltip
// 全局类（fixed/max-width 320px 折行/zoomIn 300ms，与原生观感一致）；pointer-events
// 容器恒 none（index.scss 的 #prog-float-tip 规则，纯提示勿拦指针——原生单例因同步
// 悬浮要点链接而刻意可拦，我们无此需求），detail 详情模式也仅解锁「详细说明」行
// 本身（south 翻转时整盒可拦会压住下方 UI 吞 hover，收窄到行；「移入 tip 不隐」的
// 豁免配套在组件 onFloatOut），且 show 里 removeAttribute("style") 清定位不误伤。
// northTipPos 母本= tomato libs/panelTip.ts（□6 收敛双份拷贝：progressive→tomato 取件方向
// 合法（roller 等先例），tomato 不反向依赖 progressive；防单边修 bug 漂移）。
import { northTipPos } from "../../sy-tomato-plugin/src/libs/panelTip";

const TIP_ID = "prog-float-tip";

// 当前占着单例的宿主（show 记账/hide·destroy 销账，配对维护）。B2 守卫协议：详情行
// 模式下指针从按钮走向 tip 的路径会穿过 tip 覆盖区（容器 pointer-events:none 事件
// 穿透命中被盖元素），materialTrace/digestMarker/tailCardRender/revTrace/materialMarker
// 等共享本单例的 hover 源若照常 enter/leave 会偷换/偷藏浮条 tip。2026-10-22 收口：
// 守卫下沉进单例本身——showFloatTip 顶部拒他源 show、hideFloatTip(owner) 拒他源
// leave（一处管全部现存+未来源，无前置守卫的 DockPanel 书卡/火苗同受保护；各源
// 既有 tipOwnedByOther 前置守卫留作双保险）。
let tipHost: HTMLElement | null = null;

/** 幂等建/取浮条 tip 元素（挂 body 尾；z 序随 .tooltip 类与原生 tip 同档） */
function ensureTipEl(): HTMLElement | null {
    let el = document.getElementById(TIP_ID);
    if (!el) {
        el = document.createElement("div");
        el.id = TIP_ID;
        el.className = "tooltip";
        document.body.appendChild(el);
    }
    return el;
}

/** 显示/移位：textContent 纯文本（三行制 \n 交给 .tooltip 的 break-spaces 换行）。
 *  override（revperf2 revTrace 块级染色通道用，既有调用方零改动）：text=文案不读宿主
 *  aria-label（块 div 不落本族属性防进思源 tip 生态）；anchorRect=定位锚不取宿主矩形
 *  （块全宽矩形的居中锚会远离光标，合成条带窄锚贴住色条）。
 *  detail（B1 帮助详情行）：tip 末行追加可点行并解锁 pointer-events（--detail 类），
 *  纯提示模式（不传 detail 的全部既有调用方）行为与 pointer-events:none 照旧——主体
 *  文案仍走 textContent（break-spaces 依赖），详情行独立子元素接 click；须在测宽定位
 *  前追加，否则 northTipPos 按不含详情行的高度摆位会压住按钮。 */
export function showFloatTip(
    btn: HTMLElement,
    override?: { text?: string; anchorRect?: { left: number; top: number; bottom: number; width: number } },
    opts?: { detail?: { label: string; onClick: () => void } },
) {
    if (tipOwnedByOther(btn)) return; // 收口守卫（B2）：单例被他源占着不偷换；同宿主重弹/无人占恒放行
    const tip = ensureTipEl();
    const text = override?.text ?? btn.getAttribute("aria-label");
    if (!tip || !text) return; // aria-label 缺失静默无 tip，功能不受损
    tipHost = btn; // 占单例记账（守卫协议见 tipHost 声明处）
    const detail = opts?.detail;
    tip.className = "tooltip" + (detail ? " prog-float-tip--detail" : ""); // 清上轮 fn__none 即显示
    tip.textContent = text;
    if (detail) {
        const row = document.createElement("span");
        row.className = "prog-float-tip-detail";
        row.textContent = detail.label;
        // mousedown 先拦再等 click：宿主 window 级 closeOverlays「交互即隐」会在 click
        // 派发前把 tip 藏成 fn__none（display:none 后 click 目标失联），详情行点不动
        row.addEventListener("mousedown", (e) => e.stopPropagation());
        row.addEventListener("click", () => { hideFloatTip(); detail.onClick(); });
        tip.appendChild(row);
    }
    tip.removeAttribute("style"); // 清上轮定位再测宽（原生 showTooltip 同款）
    const r = override?.anchorRect ?? btn.getBoundingClientRect();
    const pos = northTipPos(
        { left: r.left, top: r.top, bottom: r.bottom, width: r.width },
        tip.clientWidth, tip.clientHeight, innerWidth, innerHeight,
    );
    // 火苗在底栏最左时居中锚定被钳到 x:0 贴死屏缘（vision P2）——下限留 4px 白
    tip.style.left = `${Math.max(pos.left, 4)}px`;
    tip.style.top = `${pos.top}px`;
}

/** 收摊：传 owner 且单例正被别的宿主占着时跳过（他源 leave 不偷藏——如非手动书卡
 *  enter 因无 aria-label 早退未记账，其 leave 不得藏浮条 tip）；无参=无条件收摊
 *  （浮条 hideTip、详情行 click、destroy 等自身语义）。注意：Svelte 模板勿
 *  `onmouseleave={hideFloatTip}` 直转——MouseEvent 会冒充 owner 令守卫恒跳过，
 *  须箭头包裹传 e.currentTarget。 */
export function hideFloatTip(owner?: HTMLElement) {
    if (owner && tipHost && tipHost !== owner) return; // 别人的单例不藏（守卫协议，见 tipHost 声明处）
    tipHost = null; // 销账
    document.getElementById(TIP_ID)?.classList.add("fn__none");
}

/** 指针点是否落在 tip 可视矩形内（B2 组件 onFloatOut 豁免：tip 容器 pointer-events
 *  none，指针从锚钮走向详情行必经 tip 盖住的 head/文档区——hit 目标不在
 *  .floatbar-body 内会触发 hideTip，不豁免则缓速移动永远到不了详情行）。
 *  传 anchor 时判定扩为 tip∪anchor 包围盒（桥区）：tip 与锚钮之间隔 gap 5px
 *  （panelTip northTipPos）且 body padding-top 只有 4px（index.scss），纯矩形
 *  豁免在 north 残 ~1px、south 翻转残整段 gap 的 tip 外缝隙，指针步长踩中即
 *  hideTip 前功尽弃；包围盒把缝隙并入豁免带，移出桥区才照旧收摊。
 *  与 tipCovers 同源取 #prog-float-tip 矩形、尊重 fn__none。 */
export function tipContainsPoint(x: number, y: number, anchor?: HTMLElement): boolean {
    const tip = document.getElementById(TIP_ID);
    if (!tip || tip.classList.contains("fn__none")) return false;
    const r = tip.getBoundingClientRect();
    let l = r.left, t = r.top, rt = r.right, b = r.bottom;
    if (anchor?.isConnected) {
        const a = anchor.getBoundingClientRect();
        l = Math.min(l, a.left); t = Math.min(t, a.top);
        rt = Math.max(rt, a.right); b = Math.max(b, a.bottom);
    }
    return x >= l && x <= rt && y >= t && y <= b;
}

/** 单例 tip 是否被 el 之外的宿主占着（B2 共享 hover 源守卫：materialTrace 等
 *  源的 enter/leave 据此在「别人的 tip 占着单例」时跳过 show/hide——穿透路径
 *  不偷换、leave 不偷藏；单例无人占或宿主是自己时恒 false，行为与现状一致） */
export function tipOwnedByOther(el: HTMLElement): boolean {
    const tip = document.getElementById(TIP_ID);
    if (!tip || tip.classList.contains("fn__none")) return false;
    return tipHost != null && tipHost !== el;
}

/** tip 可见且矩形盖住 el（组件 onFloatOver 据此忽略被盖按钮的 hover：tip 容器
 *  pointer-events:none，鼠标移向「详细说明」详情行的路径穿越 tip 覆盖区时事件
 *  穿透命中被盖住的背后按钮，不拦则 tip 换目标重弹、详情行永远点不到；被盖
 *  按钮视觉上不可见，忽略其 hover 与视觉一致，tip 收摊后自然恢复） */
export function tipCovers(el: HTMLElement): boolean {
    const tip = document.getElementById(TIP_ID);
    if (!tip || tip.classList.contains("fn__none")) return false;
    const ra = tip.getBoundingClientRect();
    const rb = el.getBoundingClientRect();
    return ra.left < rb.right && rb.left < ra.right && ra.top < rb.bottom && rb.top < ra.bottom;
}

/** 组件 unmount 收尾：整元素摘除不留尸体（下次 hover 自动重建） */
export function destroyFloatTip() {
    tipHost = null; // 销账防悬空引用阻 GC（守卫协议，见 tipHost 声明处）
    document.getElementById(TIP_ID)?.remove();
}
