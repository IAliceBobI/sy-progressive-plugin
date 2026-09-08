// 期5 素材徽标（期3 移交）：写作书片内素材块（custom-prog-material=来源文档ID#锚块ID
// ——摘抄转实锚摘抄文档、直送锚原文档）渲染可点小图标跳回出处。digestMarker 同构配方，
// 硬约束继承：**span 永不加 textContent**（带文本 span 被编辑卷入 .sy）、**块 div 一律
// 零改动**（痕迹只由 span 承载）。幂等：出场链反复调用清旧重挂（protolyte 懒加载窗口
// 丢标补挂）。
import { OpenSyFile2 } from "../../sy-tomato-plugin/src/libs/docUtils";
import { showFloatTip, hideFloatTip } from "./floatTip";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import { MATERIAL_KEY } from "./writeBook";

const MARK_CLASS = "prog-material-mark";

// OpenSyFile2 需要 Plugin 实例，index.ts onload 时注入（digestMarker 同款）
let pluginRef: any = null;

export function initMaterialMarker(plugin: any) {
    pluginRef = plugin;
}

/** 对当前文档打素材徽标：块 div DOM 属性 custom-prog-material 命中即挂。
 *  零 SQL（块 div 属性渲染自 IAL，出场时已就绪）；清旧紧贴打标同一同步段 */
export function markMaterials(protyle: any) {
    const welement: HTMLElement = protyle?.wysiwyg?.element;
    if (!welement) return;
    welement.querySelectorAll(`.${MARK_CLASS}`).forEach(m => m.remove());
    welement.querySelectorAll<HTMLElement>(`div[data-node-id][${MATERIAL_KEY}]`).forEach((div) => {
        const value = div.getAttribute(MATERIAL_KEY) ?? "";
        const [sourceDocID, anchorID] = value.split("#");
        if (!sourceDocID || !anchorID) return;
        const span = document.createElement("span");
        span.className = MARK_CLASS;
        span.setAttribute("aria-label", tomatoI18n.跳回出处);
        span.setAttribute("contenteditable", "false");
        span.addEventListener("click", (ev) => {
            ev.stopPropagation();
            ev.preventDefault();
            if (pluginRef) void OpenSyFile2(pluginRef, anchorID);
        });
        span.addEventListener("mouseenter", () => showFloatTip(span));
        span.addEventListener("mouseleave", () => hideFloatTip());
        div.insertBefore(span, div.firstChild);
    });
}
// 清残留说明：markMaterials 首步按类名清旧即幂等（跨文档切换时旧 DOM 随 protyle
// 内容整体替换消亡），无需独立清场导出。
