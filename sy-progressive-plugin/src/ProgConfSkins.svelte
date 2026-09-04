<script lang="ts">
    // 渐进设置页域组件（2026-09-03 双栏改造）：自 Settings.svelte 整块搬运，卡片内部一行不动；
    // 本组件=「皮肤外观」域的卡片（v5 □8 三维正交货架 + 参数微调，选中即落盘即时换肤——
    // 单域渲染切域卸载再回不丢选中：pick 即写 settingCfg 持久，重挂载从其恢复）
    import { BaseTomatoPlugin } from "../../sy-tomato-plugin/src/libs/BaseTomatoPlugin";
    import { STORAGE_Prog_SETTINGS } from "../../sy-tomato-plugin/src/constants";
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
    import { openUnlockDialog } from "../../sy-tomato-plugin/src/unlockDialog";
    import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
    import { devProPreview } from "../../sy-tomato-plugin/src/libs/devProPreview";
    // v5 □8 皮肤系统：三维正交货架 + 参数微调（Pro=整个皮肤系统买断，锁绑激活态）
    import {
        PROG_THEMES, PROG_FLAMES, PROG_PANELS,
        DEFAULT_THEME_SLUG, DEFAULT_FLAME_SLUG, DEFAULT_PANEL_SLUG,
        THEME_SETTING_KEY, FLAME_SETTING_KEY, PANEL_SETTING_KEY, TUNE_SETTING_KEY,
        applyProgSkins, PROG_GATE_OPEN, clampTune, type ProgTune,
    } from "./theme";

    interface Props {
        plugin: BaseTomatoPlugin;
        /** 激活态（壳持有并绑 UpgradeBar；货架/微调锁随它） */
        codeValid: boolean;
    }
    let { plugin, codeValid }: Props = $props();

    // ===== v5 □8 皮肤货架：locked 绑激活态——免费默认款永久可选，Pro 款未激活锁死
    // （功能层锁：aria-disabled + 点击弹解锁框，不用 disabled 属性否则收不到点击没法
    // 引导）；已激活全解锁。点击已解锁卡：选中 + 写 settingCfg 对应键 + applyProgSkins
    // 即时换肤（免重载，recite 先例）。锁卡在 unpaid 下另有 CSS 门禁兜底（挂属性不生效）。
    const themes = $derived(PROG_THEMES.map(s => ({
        ...s,
        name: tomatoI18n.皮肤名(s.zhName),
        locked: !codeValid && s.pro && !PROG_GATE_OPEN, // □14a 拆门：货架锁恒开
    })));
    const flames = $derived(PROG_FLAMES.map(s => ({
        ...s,
        name: tomatoI18n.皮肤名(s.zhName),
        locked: !codeValid && s.pro && !PROG_GATE_OPEN, // □14a 拆门：货架锁恒开
    })));
    const panels = $derived(PROG_PANELS.map(s => ({
        ...s,
        name: tomatoI18n.皮肤名(s.zhName),
        locked: !codeValid && s.pro && !PROG_GATE_OPEN, // □14a 拆门：货架锁恒开
        // 材质样机示意色：glass 半透明蓝灰 / paper 纸棕 / surface 描边灰
        mock: s.slug === "glass" ? "rgba(140, 160, 175, 0.35)" : s.slug === "paper" ? "#d9c8a5" : "var(--b3-border-color)",
    })));

    // svelte-ignore state_referenced_locally
    let selectedTheme = $state(plugin.settingCfg?.[THEME_SETTING_KEY] || DEFAULT_THEME_SLUG);
    // svelte-ignore state_referenced_locally
    let selectedFlame = $state(plugin.settingCfg?.[FLAME_SETTING_KEY] || DEFAULT_FLAME_SLUG);
    // svelte-ignore state_referenced_locally
    let selectedPanel = $state(plugin.settingCfg?.[PANEL_SETTING_KEY] || DEFAULT_PANEL_SLUG);

    function pickSkin(key: string, slug: string, locked: boolean, setter: (s: string) => void) {
        if (locked) {
            // □1 灰档统一：锁卡点击弹统一解锁框（替代原 pushMsg 提示）
            openUnlockDialog({
                product: "progressive",
                onActivated: () => plugin.saveData(STORAGE_Prog_SETTINGS, plugin.settingCfg),
            });
            return;
        }
        setter(slug);
        plugin.settingCfg[key] = slug;
        applyProgSkins(plugin.settingCfg);
        plugin.saveData(STORAGE_Prog_SETTINGS, plugin.settingCfg);
    }
    const pickTheme = (slug: string, locked: boolean) => pickSkin(THEME_SETTING_KEY, slug, locked, s => selectedTheme = s);
    const pickFlame = (slug: string, locked: boolean) => pickSkin(FLAME_SETTING_KEY, slug, locked, s => selectedFlame = s);
    const pickPanel = (slug: string, locked: boolean) => pickSkin(PANEL_SETTING_KEY, slug, locked, s => selectedPanel = s);

    // ===== 参数微调（Pro）：滑杆即拖即生效，400ms 防抖落盘；重置清 hue/bri 留命名
    // （□14a 拆门：tune 锁与货架同口径吃 PROG_GATE_OPEN——reasoning review P1 补漏）
    const tuneLocked = $derived(!codeValid && !PROG_GATE_OPEN);
    // svelte-ignore state_referenced_locally
    let tune = $state<ProgTune>(clampTune(plugin.settingCfg?.[TUNE_SETTING_KEY]));
    let tuneSaveTimer: ReturnType<typeof setTimeout> | null = null;

    function onTuneInput() {
        if (tuneLocked) {
            siyuan.pushMsg(tomatoI18n.微调Pro提示, 2500);
            return;
        }
        tune = clampTune(tune);
        plugin.settingCfg[TUNE_SETTING_KEY] = tune;
        applyProgSkins(plugin.settingCfg);
        if (tuneSaveTimer) clearTimeout(tuneSaveTimer);
        tuneSaveTimer = setTimeout(() => {
            plugin.saveData(STORAGE_Prog_SETTINGS, plugin.settingCfg);
            tuneSaveTimer = null;
        }, 400);
    }

    function resetTune() {
        tune = { hue: 0, bri: 0, name: tune.name };
        plugin.settingCfg[TUNE_SETTING_KEY] = tune;
        applyProgSkins(plugin.settingCfg);
        plugin.saveData(STORAGE_Prog_SETTINGS, plugin.settingCfg);
    }
</script>

<!-- 皮肤系统：三维正交货架（配色/火苗形态/容器材质）+ 参数微调。
     Pro=¥72 一个价（□9 终稿：皮肤系统+断句+生词 AI+收集/写作对比），免费默认款不退化；锁卡点击弹统一解锁框 -->
<div class="settingBox">
    <div class="section-title">{tomatoI18n.皮肤外观}</div>

    <div class="prog-skins-sub">{tomatoI18n.配色主题}</div>
    <div class="prog-skins-row prog-skins-row--six">
        {#each themes as s (s.slug)}
            <button
                class="prog-skin-card"
                class:selected={s.slug === selectedTheme}
                class:locked={s.locked}
                aria-disabled={s.locked || undefined}
                data-slug={s.slug}
                style="--mock-accent:{s.color};--mock-flame:{s.flame ?? '#b06e1e'}"
                onclick={() => pickTheme(s.slug, s.locked)}
            >
                    <div class="skin-mock">
                        <div class="skin-chip a"></div>
                        <div class="skin-chip b"></div>
                        <div class="skin-name"
                            >{s.slug === selectedTheme && tune.name ? `${s.name} · ${tune.name}` : s.name}</div
                        >
                        <span class="skin-flame-dot" aria-hidden="true"></span>
                    </div>
                    <!-- □30：角标未激活锁定时渲染（变灰+引导），已激活退役；作者查看模式（devProPreview）
     开启时 Pro 款角标强制回归（只标注，locked 灰态不动） -->
                    {#if s.locked || (s.pro && $devProPreview)}<span class="skin-tag">Pro</span>{/if}
            </button>
        {/each}
    </div>

    <div class="prog-skins-sub">{tomatoI18n.火苗形态}</div>
    <div class="prog-skins-row">
        {#each flames as s (s.slug)}
            <button
                class="prog-skin-card prog-skin-card--flame"
                class:selected={s.slug === selectedFlame}
                class:locked={s.locked}
                aria-disabled={s.locked || undefined}
                data-slug={s.slug}
                onclick={() => pickFlame(s.slug, s.locked)}
            >
                <div class="skin-mock">
                    <svg viewBox="0 0 24 32" aria-hidden="true">
                        <path d={s.d} fill="var(--prog-flame-base)" />
                    </svg>
                    <div class="skin-name">{s.name}</div>
                </div>
                <!-- □30：角标未激活锁定时渲染（变灰+引导），已激活退役；作者查看模式（devProPreview）
     开启时 Pro 款角标强制回归（只标注，locked 灰态不动） -->
                {#if s.locked || (s.pro && $devProPreview)}<span class="skin-tag">Pro</span>{/if}
            </button>
        {/each}
    </div>

    <div class="prog-skins-sub">{tomatoI18n.容器材质}</div>
    <div class="prog-skins-row">
        {#each panels as s (s.slug)}
            <button
                class="prog-skin-card prog-skin-card--panel"
                class:selected={s.slug === selectedPanel}
                class:locked={s.locked}
                aria-disabled={s.locked || undefined}
                data-slug={s.slug}
                style="--mock-accent:{s.mock}"
                onclick={() => pickPanel(s.slug, s.locked)}
            >
                <div class="skin-mock">
                    <div class="skin-chip a"></div>
                    <div class="skin-chip b"></div>
                    <div class="skin-name">{s.name}</div>
                </div>
                <!-- □30：角标未激活锁定时渲染（变灰+引导），已激活退役；作者查看模式（devProPreview）
     开启时 Pro 款角标强制回归（只标注，locked 灰态不动） -->
                {#if s.locked || (s.pro && $devProPreview)}<span class="skin-tag">Pro</span>{/if}
            </button>
        {/each}
    </div>

    <div class="prog-skins-sub">{tomatoI18n.参数微调}{#if $devProPreview}<span class="prog-tune-pro">Pro</span>{/if}</div>
    <div class="prog-tune-row">
        <span>{tomatoI18n.色相}</span>
        <input
            type="range"
            min="-30"
            max="30"
            step="1"
            bind:value={tune.hue}
            oninput={onTuneInput}
            disabled={tuneLocked}
        />
        <span class="val">{tune.hue > 0 ? "+" : ""}{tune.hue}°</span>
    </div>
    <div class="prog-tune-row">
        <span>{tomatoI18n.亮度}</span>
        <input
            type="range"
            min="-20"
            max="20"
            step="1"
            bind:value={tune.bri}
            oninput={onTuneInput}
            disabled={tuneLocked}
        />
        <span class="val">{tune.bri > 0 ? "+" : ""}{tune.bri}%</span>
    </div>
    <div class="prog-tune-row">
        <input
            class="b3-text-field prog-tune-name"
            placeholder={tomatoI18n.自定义名称}
            maxlength="12"
            bind:value={tune.name}
            oninput={onTuneInput}
            disabled={tuneLocked}
        />
        <button
            class="b3-button b3-button--outline tomato-button prog-accent-btn"
            onclick={resetTune}
            disabled={tuneLocked}>{tomatoI18n.重置微调}</button
        >
    </div>
</div>

<style>
    /* 作者查看模式：微调整体是 Pro，未激活视觉里由锁+提示承担、无角标；预览时在子标题旁
       补行内角标把收费项标注齐。视觉抄 index.scss 的 .prog-skin-card .skin-tag，但走
       scoped——seller 经渐进链卷入共享样式时不会带上这枚 */
    .prog-tune-pro {
        display: inline-block;
        margin-left: 6px;
        padding: 0 5px;
        border-radius: 999px;
        font-size: 10px;
        font-weight: 700;
        line-height: 16px;
        color: #fff;
        background: var(--prog-accent-strong);
        vertical-align: middle;
    }
</style>
