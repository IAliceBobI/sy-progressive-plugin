// □8 知识地图导出 PNG——html2canvas + ImgBox.ts 三坑修法精简版（只参考照抄）：
// ①浅色强制（--b3 背景系变量覆盖+文字 #333，暗色主题混色不可读根治）
// ②固有 ~1s 主线程冻结消不掉，toast「正在导出」先上屏再进截图段（nextPaint 同款）
// ③svg use 序列化断源——本图节点图标用 DOM 色点/文字天然规避，无 sprite 引用；
//   SvelteFlow 画布含 svg 连线（无 use），html2canvas 可直渲。
// 产物=PNG dataURL → a[download] 下载（图片遮挡联动=帮助文档指引，V1 不自动插卡）。
import html2canvas from "html2canvas";
import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";

/** 浅色强制变量表（ImgBox LIGHT_THEME_VARS 精简——地图卡面用到的面） */
const LIGHT_VARS: Record<string, string> = {
    "--b3-theme-background": "#F5F5F5",
    "--b3-theme-surface": "#FFFFFF",
    "--b3-theme-on-background": "#333333",
    "--b3-theme-on-surface": "#333333",
    "--b3-theme-primary": "#3575F0",
    "--b3-theme-success": "#0F9D58",
    "--b3-theme-warning": "#D97706",
    "--b3-theme-error": "#D93025",
    "--b3-theme-secondary": "#7A5AF8",
    "--b3-border-color": "#DCDCDC",
};

/** color(srgb r g b [/ a]) → rgba(...)：html2canvas 1.4.1 不认 CSS Color 4 的
 *  color() 函数，而 color-mix() 的 computed 值恰是该形态（getComputedStyle 规范
 *  行为）——烘焙成 rgb inline（inline 优先，克隆体直接吃实色）。e2e 实锤 09-13。 */
function colorFnToRgb(v: string): string {
    const m = /color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?:\s*\/\s*([\d.%]+))?\)/.exec(v.trim());
    if (!m) return v;
    const num = (s: string | undefined, scale = 255) => {
        if (!s) return 1;
        if (s.endsWith("%")) return Math.round(parseFloat(s) / 100 * scale);
        return Math.round(parseFloat(s) * scale);
    };
    const [r, g, b] = [num(m[1]), num(m[2]), num(m[3])];
    const a = m[4]?.endsWith("%") ? parseFloat(m[4]) / 100 : (m[4] ? parseFloat(m[4]) : 1);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
}

const COLOR_PROPS = [
    "color", "background-color", "border-color", "border",
    "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
    "fill", "stroke", "box-shadow",
];

/** 遍历容器烘焙 color() 形态 computed 色为 inline 实色（值内所有 color(srgb …)
 *  子串替换——box-shadow/border 等复合值里也嵌色段）；返回恢复函数 */
function bakeColorFunctions(container: HTMLElement): Array<() => void> {
    const restores: Array<() => void> = [];
    const els: HTMLElement[] = [container, ...container.querySelectorAll<HTMLElement>("*")];
    for (const el of els) {
        const cs = getComputedStyle(el);
        for (const prop of COLOR_PROPS) {
            const v = cs.getPropertyValue(prop);
            if (!v.includes("color(")) continue;
            const prev = el.style.getPropertyValue(prop);
            const baked = v.replace(/color\(srgb[^)]*\)/g, m => colorFnToRgb(m));
            el.style.setProperty(prop, baked, "important");
            const p = prop;
            restores.push(() => {
                if (prev) el.style.setProperty(p, prev);
                else el.style.removeProperty(p);
            });
        }
    }
    return restores;
}

/** 导出地图容器为 PNG（retina 2x）。返回 true=已触发下载 */
export async function exportMapPng(container: HTMLElement, filename: string): Promise<boolean> {
    // 冻结缓解：toast 先上屏（rAF+setTimeout 双跳——ImgBox nextPaint 同款）
    try { await siyuan.pushMsg(tomatoI18n.正在导出图片(), 2500); } catch { /* noop */ }
    await new Promise<void>(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));

    const restores: Array<() => void> = [];
    for (const [k, v] of Object.entries(LIGHT_VARS)) {
        const prev = container.style.getPropertyValue(k);
        container.style.setProperty(k, v);
        restores.push(() => {
            if (prev) container.style.setProperty(k, prev);
            else container.style.removeProperty(k);
        });
    }
    // 前景文字钉深色（容器继承的 on-surface 已被变量覆盖，双保险给内联色元素）
    const prevColor = container.style.color;
    container.style.setProperty("color", "#333333", "important");
    restores.push(() => { container.style.color = prevColor; });
    // color() 函数烘焙（color-mix computed 形态 html2canvas 不认，钉成 rgb inline）
    restores.push(...bakeColorFunctions(container));

    try {
        const canvas = await html2canvas(container, {
            backgroundColor: "#F5F5F5",
            scale: 2,
            logging: false,
            useCORS: false,
        });
        const url = canvas.toDataURL("image/png");
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        debugLog("prog.bookmap", `export png ${filename} ${canvas.width}x${canvas.height}`, "progressive");
        try { await siyuan.pushMsg(tomatoI18n.已导出地图图片(), 2500); } catch { /* noop */ }
        return true;
    } catch (e) {
        console.error("exportMapPng failed", e);
        debugLog("prog.bookmap", `export png failed: ${String(e)}`, "progressive");
        return false;
    } finally {
        for (const r of restores) r();
    }
}
