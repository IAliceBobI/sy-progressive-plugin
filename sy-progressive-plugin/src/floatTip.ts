// 浮条 tooltip 自建单例（2026-08-31 □1 根治版，取代 □10 的共享 #tooltip 改写方案）。
// 根因（真实轨迹 e2e 实锤，合成 mouseover 是假阴性通道勿作验证）：思源 block/popover.ts
// 有一条 document 级 mouseover 监听（块引/ariaLabel 等候选项的 tip 服务），hover 落到
// 非候选元素——浮条按钮内的 svg、按钮间隙、浮条 padding——都会 hideTooltip() 把共享
// #tooltip 单例藏掉；叠加组件 onFloatOver 的 `btn === tipTarget` 早退与「间隙 mouseout
// 的 relatedTarget 在 .prog-fb 内不清 tipTarget」，被藏后同一按钮再 hover 永不重弹
// （真机「hover 大多不弹、反复移到右下边缘才偶现」的完整链条）。
// 对策：自建元素对思源隐藏生态隐身（hideTooltip 只认 #tooltip id）；复用思源 .tooltip
// 全局类（fixed/max-width 320px 折行/zoomIn 300ms，与原生观感一致）；pointer-events:none
// 由 index.scss 的 #prog-float-tip 规则常驻——纯提示勿拦指针（原生单例因同步悬浮要
// 点链接而刻意可拦，我们无此需求），且 show 里 removeAttribute("style") 清定位不误伤。
// northTipPos 母本= tomato libs/panelTip.ts（□6 收敛双份拷贝：progressive→tomato 取件方向
// 合法（roller 等先例），tomato 不反向依赖 progressive；防单边修 bug 漂移）。
import { northTipPos } from "../../sy-tomato-plugin/src/libs/panelTip";

const TIP_ID = "prog-float-tip";

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

/** 显示/移位：textContent 纯文本（三行制 \n 交给 .tooltip 的 break-spaces 换行） */
export function showFloatTip(btn: HTMLElement) {
    const tip = ensureTipEl();
    const text = btn.getAttribute("aria-label");
    if (!tip || !text) return; // aria-label 缺失静默无 tip，功能不受损
    tip.className = "tooltip"; // 清上轮 fn__none 即显示
    tip.textContent = text;
    tip.removeAttribute("style"); // 清上轮定位再测宽（原生 showTooltip 同款）
    const r = btn.getBoundingClientRect();
    const pos = northTipPos(
        { left: r.left, top: r.top, bottom: r.bottom, width: r.width },
        tip.clientWidth, tip.clientHeight, innerWidth, innerHeight,
    );
    tip.style.left = `${pos.left}px`;
    tip.style.top = `${pos.top}px`;
}

export function hideFloatTip() {
    document.getElementById(TIP_ID)?.classList.add("fn__none");
}

/** 组件 unmount 收尾：整元素摘除不留尸体（下次 hover 自动重建） */
export function destroyFloatTip() {
    document.getElementById(TIP_ID)?.remove();
}
