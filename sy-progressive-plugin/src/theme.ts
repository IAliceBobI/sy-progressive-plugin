// v5 □8 皮肤系统（docs/prog-v5-visual-design.md §4，QQ 秀三维正交「穿搭」模型）：
// - 维度A 配色主题 body[data-prog-theme]  → index.scss 各主题 token 组整组覆盖
// - 维度B 火苗形态 body[data-prog-flame]  → FleetFlame 按注册表 path 换 SVG 外轮廓
// - 维度C 容器材质 body[data-prog-panel]  → 面板容器风格（毛玻璃/宣纸）
// 三维互不依赖可任意混搭；Pro=整个皮肤系统买断（含三维混搭+参数微调+未来新皮）。
// 照抄 recite theme.ts 手法：slug = body 属性值 + settingCfg 存储值（勿改——改名=老用户
// 存量值失配回落默认）；index.scss 的 $prog-skins 覆盖块与本表 slug 一一对齐，两头同步加。
// 默认款 = 无属性直用 :root token 组（recite 同款设计，未知/缺省 slug 一律回落默认）。
import { writable } from "svelte/store";

export interface ProgThemeSkin {
    slug: string;
    /** tomatoI18n.皮肤名() 的映射键（中文名）；color = 设置货架样机主色 */
    zhName: string;
    color: string;
    pro: boolean;
    /** accent/strong 明暗两轨基色（§5.3 皮肤映射表同源；参数微调的计算基准） */
    la: string;
    ls: string;
    da: string;
    ds: string;
    /** 装配该主题时的火苗壳色（与 index.scss 冷焰覆盖同源）；缺省 = 暖琥珀 #b06e1e */
    flame?: string;
}

export const PROG_THEMES: ProgThemeSkin[] = [
    { slug: "ink-azure", zhName: "青瓷黛蓝", color: "#35606e", pro: false, la: "#35606e", ls: "#2b4d58", da: "#85b3bd", ds: "#6b9aa5" },
    { slug: "amber", zhName: "琉璃琥珀", color: "#8a5a20", pro: true, la: "#8a5a20", ls: "#7a4c15", da: "#d4a960", ds: "#b98a43" },
    { slug: "plum", zhName: "松烟黛紫", color: "#6a5a99", pro: true, la: "#6a5a99", ls: "#55477d", da: "#9d8cc4", ds: "#8071ae", flame: "#8d7ec4" },
    { slug: "sakura", zhName: "绯樱落霞", color: "#a34a62", pro: true, la: "#a34a62", ls: "#873b50", da: "#d98a9c", ds: "#b96f82" },
    { slug: "mist", zhName: "苍山雾雪", color: "#44739c", pro: true, la: "#44739c", ls: "#365c7e", da: "#8fb6d9", ds: "#7199bd" },
    { slug: "ink-mist", zhName: "墨玉轻雾", color: "#3a3a42", pro: true, la: "#3a3a42", ls: "#2c2c33", da: "#8a8a92", ds: "#6f6f77", flame: "#8e95a3" },
];

export const DEFAULT_THEME_SLUG = "ink-azure";

export interface ProgFlameSkin {
    slug: string;
    zhName: string;
    pro: boolean;
    /** 外轮廓 path（viewBox 0 0 24 32，可含多子路径：灯笼=盖+体+穗、双焰=两泪滴） */
    d: string;
    /** 芯焰 path（状态色渲染区）；缺省用 classic 芯焰（形态换壳不换状态逻辑） */
    coreD?: string;
}

const CLASSIC_CORE = "M12 10 C 14 14, 16.5 17, 16 21 C 15.6 24.5, 14 27, 12 27 C 10 27, 8.4 24.5, 8 21 C 7.5 17, 10 14, 12 10 Z";

export const PROG_FLAMES: ProgFlameSkin[] = [
    {
        slug: "classic", zhName: "经典泪滴", pro: false,
        d: "M12 1 C 13.5 6, 22 10.5, 21 19 C 20.4 25, 16.6 29.5, 12 29.5 C 7.4 29.5, 3.6 25, 3 19 C 2 10.5, 10.5 6, 12 1 Z",
    },
    {
        // 鹅毛笔羽焰：整体瘦长（主体宽 ~14 vs classic ~19），右轮廓一撮羽尖向外上挑
        slug: "quill", zhName: "鹅毛笔羽焰", pro: true,
        d: "M11.5 0.5 C 12 4, 14.2 6.2, 16 8.5 L 20.5 6.2 L 17.6 11 C 18.8 13.6, 19.3 16.6, 18.8 19.6 C 18.2 24.4, 15.3 28.5, 11.8 28.5 C 8.2 28.5, 5.3 24.4, 4.7 19.6 C 4.1 15.2, 7 8, 11.5 0.5 Z",
        coreD: "M11.8 10 C 13.5 13.5, 15.5 16, 15.1 19.5 C 14.8 22.5, 13.5 24.5, 11.8 24.5 C 10.1 24.5, 8.8 22.5, 8.5 19.5 C 8.1 16, 10.1 13.5, 11.8 10 Z",
    },
    {
        // 纸灯笼焰：盖矩形 + 灯笼椭圆体 + 底穗三角三子路径；芯焰=笼内小泪滴（更透亮）
        slug: "lantern", zhName: "纸灯笼焰", pro: true,
        d: "M8.6 2.2 L15.4 2.2 L15.4 4.6 L8.6 4.6 Z M12 5 C 17.6 5, 20.6 9.6, 20.6 15.6 C 20.6 21.6, 17.6 26.2, 12 26.2 C 6.4 26.2, 3.4 21.6, 3.4 15.6 C 3.4 9.6, 6.4 5, 12 5 Z M10.6 26.4 L13.4 26.4 L13.4 28 L12 31.2 L10.6 28 Z",
        coreD: "M12 9.2 C 13.6 12.2, 15.4 14.2, 15.1 17.2 C 14.9 19.6, 13.6 21.6, 12 21.6 C 10.4 21.6, 9.1 19.6, 8.9 17.2 C 8.6 14.2, 10.4 12.2, 12 9.2 Z",
    },
    {
        // 双芯双焰：左大右小两根并列泪滴（读+摘双轨）；芯焰同为双子路径
        slug: "twin", zhName: "双芯双焰", pro: true,
        d: "M8.4 2 C 9.4 6, 13.9 10, 13.4 17 C 13.1 23, 11 28.4, 8.3 28.4 C 5.6 28.4, 3.8 23, 3.7 17 C 3.5 10, 7.4 6, 8.4 2 Z M16.4 3.6 C 17.1 7, 20.7 10.4, 20.3 15.8 C 20.1 20.8, 18.5 25.2, 16.4 25.2 C 14.3 25.2, 12.7 20.8, 12.8 15.8 C 12.9 10.4, 15.7 7, 16.4 3.6 Z",
        coreD: "M8.3 10 C 9.2 12.8, 10.9 15.2, 10.6 18.4 C 10.4 20.8, 9.5 22.8, 8.3 22.8 C 7.1 22.8, 6.2 20.8, 6 18.4 C 5.7 15.2, 7.4 12.8, 8.3 10 Z M16.3 11.4 C 16.9 13.4, 18.2 15.2, 18 17.6 C 17.9 19.4, 17.1 21, 16.3 21 C 15.5 21, 14.7 19.4, 14.6 17.6 C 14.4 15.2, 15.7 13.4, 16.3 11.4 Z",
    },
    {
        // 破浪焰：顶部浪头小钩卷曲（呼应舰队/滚筒），主体仍泪滴
        slug: "wave", zhName: "破浪焰", pro: true,
        d: "M12 2.4 C 12.5 1, 14.5 0.4, 15.5 1.7 C 16.4 2.9, 15.5 4.5, 14 4.2 C 13.1 4.05, 12.6 3.3, 12.9 2.4 C 13.8 5.6, 16.2 8, 18.1 11.1 C 20 14.2, 21.2 16.6, 20.8 19.6 C 20.2 25, 16.5 29.5, 12 29.5 C 7.5 29.5, 3.8 25, 3.2 19.6 C 2.4 12, 7.1 7.4, 10.8 3.4 C 11.3 3, 11.8 2.8, 12 2.4 Z",
    },
];

export const DEFAULT_FLAME_SLUG = "classic";
export const FLAME_CORE_D = CLASSIC_CORE;

export interface ProgPanelSkin {
    slug: string;
    zhName: string;
    pro: boolean;
}

export const PROG_PANELS: ProgPanelSkin[] = [
    { slug: "surface", zhName: "素面", pro: false },
    { slug: "glass", zhName: "毛玻璃", pro: true },
    { slug: "paper", zhName: "宣纸", pro: true },
];

export const DEFAULT_PANEL_SLUG = "surface";

// settingCfg 里的三维存储键（与档位/浮条开关同落 STORAGE_Prog_SETTINGS 单文件）
export const THEME_SETTING_KEY = "progTheme";
export const FLAME_SETTING_KEY = "progFlame";
export const PANEL_SETTING_KEY = "progPanel";
export const TUNE_SETTING_KEY = "progTune";

// 当前生效火苗形态（FleetFlame 订阅换 path；body 属性只管 CSS 侧，SVG 换形走 store）
export const progFlameSkin = writable(DEFAULT_FLAME_SLUG);
// 付费门禁态（null=未知按已付费渲染，避免已激活用户冷启动闪退；refreshProgGate 回写）
export const progPaid = writable<boolean | null>(null);

/** 给 body 挂/摘 data-prog-theme：非默认且已注册才挂属性，否则摘掉（= 默认青瓷黛蓝） */
export function applyProgTheme(slug: string | undefined) {
    const hit = PROG_THEMES.find(s => s.slug === slug);
    if (hit && hit.slug !== DEFAULT_THEME_SLUG) {
        document.body.setAttribute("data-prog-theme", hit.slug);
    } else {
        document.body.removeAttribute("data-prog-theme");
    }
}

/** 给 body 挂/摘 data-prog-flame + 联动 FleetFlame 形态 store */
export function applyProgFlame(slug: string | undefined) {
    const hit = PROG_FLAMES.find(s => s.slug === slug);
    const use = hit ? hit.slug : DEFAULT_FLAME_SLUG;
    if (use !== DEFAULT_FLAME_SLUG) {
        document.body.setAttribute("data-prog-flame", use);
    } else {
        document.body.removeAttribute("data-prog-flame");
    }
    progFlameSkin.set(use);
}

/** 给 body 挂/摘 data-prog-panel：容器材质（Dock 面板/浮条经 token 与属性选择器生效） */
export function applyProgPanel(slug: string | undefined) {
    const hit = PROG_PANELS.find(s => s.slug === slug);
    if (hit && hit.slug !== DEFAULT_PANEL_SLUG) {
        document.body.setAttribute("data-prog-panel", hit.slug);
    } else {
        document.body.removeAttribute("data-prog-panel");
    }
}

// ========== 参数化微调（Pro 卖点：色相/亮度微调，非功能舒适项，不做自由编辑器） ==========
// 微调只作用于选中配色主题的 accent 三基色（accent/strong/soft）——card/进度/热力/徽章等
// color-mix 派生项引用 --prog-accent 变量会自动重算；yours/火苗壳是恒定情绪锚不参与。
// 生效方式：注入 <style> 覆盖块（明暗两轨各一条），皮肤/微调变化时重写。

export interface ProgTune {
    /** 色相偏移 -30~30（度） */
    hue: number;
    /** 亮度偏移 -20~20（%） */
    bri: number;
    /** 自定义命名（纯展示层，皮肤名旁显示） */
    name: string;
}

export const DEFAULT_TUNE: ProgTune = { hue: 0, bri: 0, name: "" };

export function tuneActive(t: ProgTune | undefined | null): boolean {
    return !!t && (t.hue !== 0 || t.bri !== 0);
}

export function clampTune(t: Partial<ProgTune> | undefined | null): ProgTune {
    const hue = Math.min(30, Math.max(-30, Math.round(Number(t?.hue) || 0)));
    const bri = Math.min(20, Math.max(-20, Math.round(Number(t?.bri) || 0)));
    return { hue, bri, name: String(t?.name ?? "").slice(0, 12) };
}

const TUNE_STYLE_ID = "prog-tune-style-zZmqus5PtYRi";

export function hexToHsl(hex: string): [number, number, number] {
    const m = hex.replace("#", "");
    const r = parseInt(m.slice(0, 2), 16) / 255;
    const g = parseInt(m.slice(2, 4), 16) / 255;
    const b = parseInt(m.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0, s = 0;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h *= 60;
    }
    return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}

/** hex 基色按微调旋色相/压亮度，输出 hsl() 字符串 */
export function shiftHsl(hex: string, tune: ProgTune): string {
    const [h, s, l] = hexToHsl(hex);
    const hh = (h + tune.hue + 360) % 360;
    const ll = Math.min(96, Math.max(4, l + tune.bri));
    return `hsl(${hh}, ${s}%, ${ll}%)`;
}

function shiftHsla(hex: string, tune: ProgTune, alpha: number): string {
    const [h, s, l] = hexToHsl(hex);
    const hh = (h + tune.hue + 360) % 360;
    const ll = Math.min(96, Math.max(4, l + tune.bri));
    return `hsla(${hh}, ${s}%, ${ll}%, ${alpha})`;
}

/** 按选中主题基色 + 微调值重写注入样式；微调关闭时移除注入（回退皮肤/默认 token） */
export function applyProgTune(themeSlug: string | undefined, tune: ProgTune | undefined) {
    if (!tuneActive(tune)) {
        document.getElementById(TUNE_STYLE_ID)?.remove();
        document.body.removeAttribute("data-prog-tune");
        return;
    }
    const t = tune as ProgTune;
    const skin = PROG_THEMES.find(s => s.slug === (themeSlug || DEFAULT_THEME_SLUG)) ?? PROG_THEMES[0];
    const css = [
        `body:not(.prog-unpaid)[data-prog-tune]{--prog-accent:${shiftHsl(skin.la, t)};--prog-accent-strong:${shiftHsl(skin.ls, t)};--prog-accent-soft:${shiftHsla(skin.la, t, 0.12)}}`,
        `html[data-theme-mode="dark"] body:not(.prog-unpaid)[data-prog-tune]{--prog-accent:${shiftHsl(skin.da, t)};--prog-accent-strong:${shiftHsl(skin.ds, t)};--prog-accent-soft:${shiftHsla(skin.da, t, 0.14)}}`,
    ].join("\n");
    let el = document.getElementById(TUNE_STYLE_ID) as HTMLStyleElement | null;
    if (!el) {
        el = document.createElement("style");
        el.id = TUNE_STYLE_ID;
        document.head.appendChild(el);
    }
    el.textContent = css;
    document.body.setAttribute("data-prog-tune", "1");
}

/** 三维 + 微调一次全 apply（onload / 面板即选即存后共用）；settingCfg 是 TomatoSettings
    宽对象，皮肤四键可选存在（弱类型检测须留交叉索引签名） */
export function applyProgSkins(cfg: {
    progTheme?: string;
    progFlame?: string;
    progPanel?: string;
    progTune?: ProgTune;
} & Record<string, unknown>) {
    applyProgTheme(cfg?.progTheme);
    applyProgFlame(cfg?.progFlame);
    applyProgPanel(cfg?.progPanel);
    if (tuneActive(cfg?.progTune)) {
        applyProgTune(cfg?.progTheme, clampTune(cfg?.progTune));
    } else {
        document.getElementById(TUNE_STYLE_ID)?.remove();
        document.body.removeAttribute("data-prog-tune");
    }
}

// ========== 付费门禁（CSS 级兜底，防君子不防小人，同 recite 立场） ==========
// body.prog-unpaid：默认免费款不退化；仅当用户选了 Pro 款/Pro 形态/Pro 材质/微调时，
// index.scss 门禁选择器把付费视觉整体回落朴素态。功能层另有 locked 锁货架卡片。

export const PROG_UNPAID_CLASS = "prog-unpaid";

// □14 收费门恢复（2026-08-30，□9 方案落地）：v5 后未发过版、观察期零白嫖用户，
// 直接关门无善后负担。未激活挂 prog-unpaid（index.scss 兜底选择器族 + 货架 locked 卡
// + FleetFlame Pro 形态回落随之生效）；winHotkey vip 实参同步找回（收集/写作对比族 6 处，
// 见 PieceSummaryBox/WritingCompareBox）。挪片/制卡按 □9 拍板保持免费（核心流不设门）。
export const PROG_GATE_OPEN = false;

export function refreshProgGate(valid: boolean) {
    document.body.classList.toggle(PROG_UNPAID_CLASS, !valid && !PROG_GATE_OPEN);
    progPaid.set(valid);
}

export function isProgUnpaid(): boolean {
    return document.body.classList.contains(PROG_UNPAID_CLASS);
}
