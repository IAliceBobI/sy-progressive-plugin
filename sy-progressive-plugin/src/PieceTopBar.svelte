<script lang="ts">
    import { onMount } from "svelte";
    import type { Snippet } from "svelte";
    import { icon } from "../../sy-tomato-plugin/src/libs/utils";
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";

    // 移动端分片顶栏（2026-08-25 移动端浮条防遮挡）：钉在思源 toolbar 下、全宽做矮，
    // 无拖拽/无位置存储/无 clamp；挂载时给 body 挂类驱动 #editor 顶开（index.scss，
    // 高度同源 CSS 变量 --prog-topbar-h，展开候选区/摘抄子排折行长高时实测回写）。
    // 桌面端仍走 FloatBar 自由拖拽（分叉在 ProgressiveFloatBtns.svelte）。
    interface PropsType {
        onClose?: () => void;
        children: Snippet;
    }
    let { onClose, children }: PropsType = $props();

    let top = $state(0);
    let rootEl: HTMLDivElement;
    let btnsEl: HTMLDivElement;

    function measure() {
        // 贴思源标题栏下沿：实测量取（真机 safe-area 下 toolbar 更高、横竖屏会变，不硬编码）
        top = Math.round(document.querySelector(".toolbar")?.getBoundingClientRect().bottom ?? 0);
    }

    onMount(() => {
        measure();
        window.addEventListener("resize", measure);
        document.body.classList.add("prog-topbar-on");
        // 候选区/摘抄子排展开时按钮区折行撑高顶栏：实测高度回写 --prog-topbar-h（body 级，
        // 覆盖 :root 默认 44px）驱动 #editor 顶开量，收起自然回落。变量只喂 editor padding、
        // 不回灌 topbar（topbar 高度走内容自适应），ResizeObserver 无回环。
        const ro = new ResizeObserver(() => {
            document.body.style.setProperty("--prog-topbar-h",
                Math.ceil(rootEl.getBoundingClientRect().height) + "px");
            syncScrollHint();
        });
        ro.observe(rootEl);
        // 主排勾满时按钮超宽横滚且滚动条隐藏——右缘渐隐提示还有更多；滚到底/无溢出摘除，
        // 避免常态盖住最后一个按钮。横滚在 snippet 的 .prog-fb-row 上（容器已改纵排）
        // □5①：滚离起点后左缘同样挂渐隐（往回滚的内容同样有硬裁碎屑感；滚到底保留——
        // 三态=scroll-x 右缘（未到底）/scroll-l 左缘（已滚出）/双类同挂=两缘）
        const rowEl = btnsEl?.querySelector(".prog-fb-row");
        function syncScrollHint() {
            if (!rowEl) return;
            const overflow = rowEl.scrollWidth > rowEl.clientWidth + 1;
            const atEnd = rowEl.scrollLeft + rowEl.clientWidth >= rowEl.scrollWidth - 2;
            rowEl.classList.toggle("prog-topbar-scroll-x", overflow && !atEnd);
            rowEl.classList.toggle("prog-topbar-scroll-l", overflow && rowEl.scrollLeft > 2);
        }
        rowEl?.addEventListener("scroll", syncScrollHint, { passive: true });
        syncScrollHint();
        return () => {
            window.removeEventListener("resize", measure);
            ro.disconnect();
            rowEl?.removeEventListener("scroll", syncScrollHint);
            document.body.classList.remove("prog-topbar-on");
            document.body.style.removeProperty("--prog-topbar-h");
        };
    });
</script>

<div class="prog-topbar" role="toolbar" tabindex="-1" aria-label={tomatoI18n.渐进学习} style="top:{top}px" bind:this={rootEl}>
    <div class="prog-topbar-btns" bind:this={btnsEl}>
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
        /* 常驻做矮 44；候选区/摘抄子排展开时随内容长高（实测高度经 onMount 的
           ResizeObserver 回写 --prog-topbar-h 同步 editor 顶开量），收起自然回落 */
        min-height: 44px;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 8px;
        background: var(--b3-theme-surface);
        border-bottom: 1px solid var(--b3-border-color);
        box-shadow: var(--b3-point-shadow);
        /* 10 = 浮层安全档（恒低于内核弹层最小 z11，高于 protyle 常驻 ≤9） */
        z-index: 10;
    }
    .prog-topbar-btns {
        flex: 1;
        display: flex;
        /* 横滚挪进 row 后容器失去 overflow 带来的隐式 min-size 收缩，会被
           nowrap 主排行的 min-content 撑破顶栏——显式归零钉住 flex:1 分配宽 */
        min-width: 0;
        /* 纵排：主排行在上（自身横滚）、候选区/摘抄子排全宽折行在下——
           横向 flex 会把 dig 排到行右侧被滚出屏（2026-08-28 实测） */
        flex-direction: column;
        align-items: stretch;
        gap: 4px;
    }
    /* 横滚职责在主排行自身（snippet 元素，:global 组合）；滚动条同容器一样隐藏 */
    .prog-topbar-btns :global(.prog-fb-row) {
        overflow-x: auto;
        scrollbar-width: none;
    }
    .prog-topbar-btns :global(.prog-fb-row)::-webkit-scrollbar {
        display: none;
    }
    /* 横滚提示（onMount 按溢出/滚位动态挂摘到主排行上）：两缘 16px 表面色渐变示意
       「还有更多/前面还有」。row 是 snippet 元素且类为 JS 运行时挂，须 :global 组合
       选择器——裸类名会被 Svelte 当 unused 剪掉。
       □5②：渐隐从容器 mask 换表面色覆盖层（::before/::after）——mask 会连 sticky
       折叠钮一起糊掉，覆盖层则可被高 z-index 的折叠钮露出；顶栏背景恒实色
       （--b3-theme-surface），覆盖层与 mask 视觉等价 */
    .prog-topbar-btns :global(.prog-fb-row) {
        position: relative;
    }
    .prog-topbar-btns :global(.prog-fb-row.prog-topbar-scroll-x)::after,
    .prog-topbar-btns :global(.prog-fb-row.prog-topbar-scroll-l)::before {
        content: "";
        position: absolute;
        top: 0;
        bottom: 0;
        width: 16px;
        pointer-events: none;
        z-index: 1;
    }
    .prog-topbar-btns :global(.prog-fb-row.prog-topbar-scroll-x)::after {
        right: 0;
        background: linear-gradient(to right, transparent, var(--b3-theme-surface));
    }
    .prog-topbar-btns :global(.prog-fb-row.prog-topbar-scroll-l)::before {
        left: 0;
        background: linear-gradient(to left, transparent, var(--b3-theme-surface));
    }
    /* □5②：折叠钮 sticky 钉右缘——溢出初始态它不再被滚出视口（唯一找回工具区的
       入口，须可预知）；z-index 高于渐隐覆盖层，恒完整可见。实底已有（:global(button)
       color-mix），叠滚动钮上方不透底。仅顶栏生效（桌面浮条折叠钮照旧流内） */
    .prog-topbar-btns :global(.prog-fb-fold) {
        position: sticky;
        right: 0;
        z-index: 2;
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
        /* 平铺区常驻后顶栏变高（□10），纵向居中会让 ✕ 漂到顶栏中部——锚定首行行轴
           （窄 44px 态两种对齐视觉等价，不回归） */
        align-self: flex-start;
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
