<script lang="ts">
    // 块配对接力浮条（□2 V1 + □3 V2）：pick=6 图标+光标块预览；target=功能图标+源 chip
    // +键帽提示+✓/×。V2：chip 可拖到目标块定目标（HTML5 drag）；引导模式=步骤文案+点块推进
    // （文案态替换 title/hint，行为推进在 PairBarBox 的 click_editorcontent 监听）。
    // 纯 UI——状态与副作用全在 PairBarBox 控制器（pairState 是控制器传入的 store）。
    import { tomatoI18n } from "./tomatoI18n";
    import { PAIR_DRAG_MIME, PAIR_FUNCS, pairGateErr, type PairFuncSpec } from "./libs/pairBarState";
    import { cpBoxCheckbox, linkBoxCheckbox, linkBoxSyncBlock, pairBarGuideMode } from "./libs/stores";
    import { vipVerified } from "./libs/user";

    let {
        pairState,
        api,
        hotkeyText,
    }: {
        pairState: import("svelte/store").Writable<import("./libs/pairBarState").PairState>;
        api: { pick(id: string): void; confirm(): void; cancel(): void; toggleCopy(): void; dragStart(): void; dragEnd(): void };
        hotkeyText: string;
    } = $props();

    // 门禁上下文：图标亮灰跟随各功能总开关（开关正交）+ VIP（嵌入互链）。
    // vip 读 store（□2 评审转出③：模块变量读取非响应式，验证后灰态滞后到重挂）
    let gateCtx = $derived.by(() => ({
        gates: {
            linkBoxCheckbox: $linkBoxCheckbox,
            linkBoxSyncBlock: $linkBoxSyncBlock,
            cpBoxCheckbox: $cpBoxCheckbox,
        },
        vip: $vipVerified === true,
    }));

    const label = (k: string) => (tomatoI18n as any)[k] as string;
    let funcSpec: PairFuncSpec | undefined = $derived(
        $pairState.func ? PAIR_FUNCS.find(f => f.id === $pairState.func) : undefined);

    // 引导模式（□3 V2）：pick 态 title 步骤化（源空=①点源，源有=②点功能）；
    // target 态 hint 替换键帽提示为 ③（受众=不用快捷键的人）
    let guideTitle = $derived(
        $pairBarGuideMode
            ? ($pairState.srcIDs.length === 0 ? tomatoI18n.引导步骤1 : tomatoI18n.引导步骤2)
            : tomatoI18n.选择功能);

    function onChipDragStart(e: DragEvent) {
        e.dataTransfer?.setData(PAIR_DRAG_MIME, "1"); // Firefox 须 setData 才启动
        if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
        api.dragStart();
    }
</script>

{#if $pairState.phase !== "idle"}
    <div class="tomato-pairbar" role="toolbar">
        {#if $pairState.phase === "pick"}
            <span class="pairbar-title">{guideTitle}</span>
            <span class="pairbar-src" class:empty={$pairState.srcIDs.length === 0}>
                {#if $pairState.srcIDs.length > 0}
                    {$pairState.srcSummary || "…"}{#if $pairState.srcIDs.length > 1}&nbsp;{tomatoI18n.已锁n块($pairState.srcIDs.length)}{/if}
                {:else}{tomatoI18n.未锁源}{/if}
            </span>
            <div class="pairbar-funcs">
                {#each PAIR_FUNCS as f (f.id)}
                    {@const err = pairGateErr(f, gateCtx)}
                    <button
                        class="pairbar-fn b3-tooltips b3-tooltips__s"
                        class:off={!!err}
                        aria-label={err === "vipGated"
                            ? tomatoI18n.需要Pro(label(f.labelKey))
                            : err === "funcGated"
                                ? tomatoI18n.功能未开启(label(f.labelKey))
                                : label(f.labelKey)}
                        onclick={() => api.pick(f.id)}
                    >
                        <svg><use xlink:href={"#" + f.icon}></use></svg>
                        <span class="pairbar-fn-name">{label(f.labelKey)}</span>
                        {#if f.vip}<span class="pairbar-vip">Pro</span>{/if}
                    </button>
                {/each}
            </div>
            <button class="pairbar-btn b3-tooltips b3-tooltips__s" aria-label="Esc" onclick={api.cancel}>
                <svg><use xlink:href="#iconClose"></use></svg>
            </button>
        {:else}
            {#if funcSpec}
                <svg class="pairbar-fn-icon"><use xlink:href={"#" + funcSpec.icon}></use></svg>
            {/if}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <!-- chip=拖拽手柄非按钮（role=button 会误导读屏器）；HTML5 DnD 无键盘替代，
                 键盘流有完整替代通道（快捷键/✓ 钮），拖拽是纯增强 -->
            <span
                class="pairbar-chip"
                aria-label={$pairState.srcSummary}
                title={$pairState.srcSummary}
                draggable="true"
                ondragstart={onChipDragStart}
                ondragend={() => api.dragEnd()}
            >
                {$pairState.srcSummary || "…"}
                {#if $pairState.srcIDs.length > 1}&nbsp;{tomatoI18n.已锁n块($pairState.srcIDs.length)}{/if}
            </span>
            {#if $pairState.func === "transport"}
                <button class="pairbar-toggle" onclick={api.toggleCopy}>
                    {$pairState.copyMode ? tomatoI18n.复制 : tomatoI18n.移动}
                </button>
            {/if}
            <span class="pairbar-hint">
                {#if $pairBarGuideMode}{tomatoI18n.引导步骤3}{:else}{tomatoI18n.等目标提示(hotkeyText)}{/if}
            </span>
            <button class="pairbar-btn pairbar-ok b3-tooltips b3-tooltips__s" aria-label="✓" onclick={api.confirm}>
                <svg><use xlink:href="#iconCheck"></use></svg>
            </button>
            <button class="pairbar-btn b3-tooltips b3-tooltips__s" aria-label="Esc" onclick={api.cancel}>
                <svg><use xlink:href="#iconClose"></use></svg>
            </button>
        {/if}
    </div>
{/if}

<style>
    /* 常驻浮层安全档 z-index=10（内核弹层计数器首弹窗即 11）；fixed 顶部居中不跟滚动 */
    .tomato-pairbar {
        position: fixed;
        top: 8px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 10;
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        justify-content: center;
        max-width: 92vw;
        padding: 6px 10px;
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        background: var(--b3-theme-surface);
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.18);
    }
    .pairbar-title {
        font-weight: 600;
    }
    .pairbar-src,
    .pairbar-chip {
        max-width: 180px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        padding: 2px 8px;
        border-radius: 4px;
        background: var(--b3-theme-primary-lightest);
    }
    .pairbar-src.empty {
        background: var(--b3-theme-surface-light);
        opacity: 0.75;
        border: 1px dashed var(--b3-border-color); /* 待填槽位语义（vision □3 P2-5） */
    }
    .pairbar-funcs {
        display: flex;
        align-items: stretch;
        gap: 2px;
    }
    .pairbar-fn {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        padding: 4px 6px;
        border: none;
        border-radius: 4px;
        background: transparent;
        color: inherit;
        font-size: 11px;
        cursor: pointer;
    }
    .pairbar-fn:hover {
        background: var(--b3-list-hover);
    }
    .pairbar-fn.off {
        opacity: 0.4;
        cursor: not-allowed;
    }
    .pairbar-fn svg,
    .pairbar-btn svg,
    .pairbar-fn-icon {
        width: 16px;
        height: 16px;
    }
    .pairbar-fn-icon {
        flex: none;
    }
    .pairbar-vip {
        position: absolute;
        top: 0;
        right: 2px;
        font-size: 9px;
        line-height: 1;
        color: var(--b3-theme-primary);
    }
    .pairbar-btn {
        display: flex;
        align-items: center;
        padding: 4px;
        border: none;
        border-radius: 4px;
        background: transparent;
        color: inherit;
        cursor: pointer;
    }
    .pairbar-btn:hover {
        background: var(--b3-list-hover);
    }
    .pairbar-ok {
        color: var(--b3-theme-primary);
    }
    .pairbar-toggle {
        padding: 2px 8px;
        border: 1px solid var(--b3-border-color);
        border-radius: 4px;
        background: var(--b3-theme-surface);
        color: inherit;
        font-size: 11px;
        cursor: pointer;
    }
    .pairbar-toggle:hover {
        background: var(--b3-list-hover);
    }
    .pairbar-hint {
        opacity: 0.7;
    }
    .pairbar-chip {
        cursor: grab;
    }
    .pairbar-chip:active {
        cursor: grabbing;
    }
    /* 拖 chip 悬停目标的接受高亮（目标块在 protyle 内，浮条组件外——:global 出圈）；
       底色 12%（vision □3 P2-4：8% 与同步块固有虚线框同屏时面感不足） */
    :global(.tomato-pairbar-droptarget) {
        outline: 2px dashed var(--b3-theme-primary);
        outline-offset: -2px;
        background: color-mix(in srgb, var(--b3-theme-primary) 12%, transparent);
    }
</style>
