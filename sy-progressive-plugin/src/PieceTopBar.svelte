<script lang="ts">
    import { onMount } from "svelte";
    import type { Snippet } from "svelte";
    import { icon } from "../../sy-tomato-plugin/src/libs/utils";
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";

    // 移动端分片顶栏（2026-08-25 移动端浮条防遮挡）：钉在思源 toolbar 下、全宽做矮，
    // 无拖拽/无位置存储/无 clamp；挂载时给 body 挂类驱动 #editor 顶开（index.scss，
    // 高度同源 CSS 变量 --prog-topbar-h）。桌面端仍走 FloatBar 自由拖拽（分叉在
    // ProgressiveFloatBtns.svelte）。
    interface PropsType {
        onClose?: () => void;
        children: Snippet;
    }
    let { onClose, children }: PropsType = $props();

    let top = $state(0);

    function measure() {
        // 贴思源标题栏下沿：实测量取（真机 safe-area 下 toolbar 更高、横竖屏会变，不硬编码）
        top = Math.round(document.querySelector(".toolbar")?.getBoundingClientRect().bottom ?? 0);
    }

    onMount(() => {
        measure();
        window.addEventListener("resize", measure);
        document.body.classList.add("prog-topbar-on");
        return () => {
            window.removeEventListener("resize", measure);
            document.body.classList.remove("prog-topbar-on");
        };
    });
</script>

<div class="prog-topbar" role="toolbar" tabindex="-1" aria-label={tomatoI18n.渐进学习} style="top:{top}px">
    <div class="prog-topbar-btns">
        {@render children()}
    </div>
    {#if onClose}
        <button
            class="b3-tooltips b3-tooltips__n prog-topbar-close"
            aria-label={tomatoI18n.退出}
            onclick={(e) => {
                e.stopPropagation();
                onClose();
            }}
        >{@html icon("iconClose", 14)}</button>
    {/if}
</div>

<style>
    .prog-topbar {
        position: fixed;
        left: 0;
        right: 0;
        height: var(--prog-topbar-h, 44px);
        box-sizing: border-box;
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 8px;
        background: var(--b3-theme-surface);
        border-bottom: 1px solid var(--b3-border-color);
        box-shadow: var(--b3-point-shadow);
        z-index: 12;
    }
    .prog-topbar-btns {
        flex: 1;
        display: flex;
        align-items: center;
        gap: 4px;
        overflow-x: auto;
        scrollbar-width: none;
    }
    .prog-topbar-btns::-webkit-scrollbar {
        display: none;
    }
    /* snippet 里的按钮（ProgressiveFloatBtns 编译 scope 外）：缩小热区 + 实底。
       b3-button--outline 透明底、--b3-list-hover 也是半透明 rgba（两主题实测）——
       color-mix 出实色，亮暗主题自适应（思源内核 Chromium 114+ 支持） */
    .prog-topbar-btns :global(button) {
        flex: none;
        min-width: 36px;
        min-height: 36px;
        padding: 2px 6px;
        background-color: color-mix(in srgb, var(--b3-theme-on-surface) 10%, var(--b3-theme-surface));
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
    }
    /* 桌面浮条 container 的最小尺寸约束在顶栏里解除（做矮承诺） */
    .prog-topbar-btns :global(.container) {
        min-height: 0;
        min-width: 0;
    }
    .prog-topbar-close {
        flex: none;
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 36px;
        height: 36px;
        padding: 0;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: var(--b3-theme-on-surface);
        cursor: pointer;
    }
    .prog-topbar-close:hover {
        background-color: var(--b3-list-hover);
    }
</style>
