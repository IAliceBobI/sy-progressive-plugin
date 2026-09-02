<!-- 思维导线两步间状态芯片（□3，spec §4.4/§5.2）：toast 级非浮条，fixed 顶部落位，
     pending 生命周期=组件生命周期；Esc/移动端 × 取消；出场 is-in 类下一帧加（0.15s），
     退场 dismiss() 摘类等 transitionend（220ms 兜底防后台 tab 不派发）后回调 onclosed -->
<script lang="ts">
    import { tomatoI18n } from "./tomatoI18n";

    let {
        word,              // 起点词文本（12 字截断由调用方 wordClip 处理）
        accent,            // CSS 颜色串（当前关系色，默认 --b3-font-color5）
        isMobile,
        oncancel,
        onclosed,          // 退场动画放完（或兜底超时）——调用方此时 unmount
    }: {
        word: string;
        accent: string;
        isMobile: boolean;
        oncancel: () => void;
        onclosed: () => void;
    } = $props();

    let root: HTMLDivElement;
    let closing = false;

    $effect(() => {
        requestAnimationFrame(() => root?.classList.add("is-in"));
    });

    function onkeydown(e: KeyboardEvent) {
        if (e.key === "Escape" && !closing) oncancel();
    }
    $effect(() => {
        window.addEventListener("keydown", onkeydown);
        return () => window.removeEventListener("keydown", onkeydown);
    });

    let fired = false;
    export function dismiss() {
        if (closing || !root) return;
        closing = true;
        root.classList.remove("is-in");
        const done = () => {
            if (fired) return;
            fired = true;
            onclosed();
        };
        root.addEventListener("transitionend", done, { once: true });
        setTimeout(done, 220);
    }
</script>

<div class="tomato-mind-wire-pending" bind:this={root} style="--tomato-mind-wire-accent: {accent}" role="status">
    <span class="tomato-mind-wire-pending-dot"></span>
    <span class="tomato-mind-wire-pending-text">{tomatoI18n.已选}「{word}」 · {tomatoI18n.请选终点}</span>
    {#if isMobile}
        <button class="tomato-mind-wire-pending-x" aria-label={tomatoI18n.取消} onclick={() => { if (!closing) oncancel(); }}>
            <svg><use xlink:href="#iconClose"></use></svg>
        </button>
    {:else}
        <span class="tomato-mind-wire-pending-kbd">Esc</span>
        <span class="tomato-mind-wire-pending-tip">{tomatoI18n.取消}</span>
    {/if}
</div>

<style>
    .tomato-mind-wire-pending {
        position: fixed;
        top: 76px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 10; /* 插件浮层安全档（spec 硬约束） */
        display: flex;
        align-items: center;
        gap: 6px;
        max-width: 80vw;
        padding: 6px 12px;
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        background: var(--b3-theme-surface);
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        box-shadow: var(--b3-tooltips-shadow);
        opacity: 0;
        translate: 0 4px;
        transition: opacity 0.15s ease-out, translate 0.15s ease-out;
    }
    /* is-in 由 JS 逐帧动态挂（出场时序），scoped 须 :global 组合防剪（踩坑索引先例） */
    .tomato-mind-wire-pending:global(.is-in) {
        opacity: 1;
        translate: 0 0;
    }
    .tomato-mind-wire-pending-dot {
        flex: none;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--tomato-mind-wire-accent);
    }
    .tomato-mind-wire-pending-text {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .tomato-mind-wire-pending-kbd {
        padding: 1px 5px;
        font-family: Consolas, "Liberation Mono", Menlo, Courier, monospace;
        font-size: 11px;
        line-height: 1.4;
        color: var(--b3-theme-on-surface);
        background-color: var(--b3-theme-surface-lighter);
        border: solid 1px var(--b3-theme-surface-lighter);
        border-radius: 4px;
        box-shadow: inset 0 -1px 0 var(--b3-theme-surface-lighter);
    }
    .tomato-mind-wire-pending-x {
        width: 28px;
        height: 28px;
        padding: 0;
        border: none;
        background: transparent;
        cursor: pointer;
        display: grid;
        place-items: center;
        color: var(--b3-theme-on-surface);
    }
    .tomato-mind-wire-pending-x svg {
        width: 14px;
        height: 14px;
    }
</style>
