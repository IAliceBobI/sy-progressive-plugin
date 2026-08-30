<script lang="ts">
    import type { Component } from "svelte";
    import { onMount } from "svelte";
    import { icon } from "../../sy-tomato-plugin/src/libs/utils";
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";

    // □11 浮层族共享容器（路线图/目录/路线指引/原文侧追溯）：锚点弹出的轻面板，
    // 点外关闭、✕ 关闭、视口内钳位；内容组件由 overlays.ts 动态挂载（component+props）。
    interface PropsType {
        title: string;
        x: number;
        y: number;
        component: Component<any>;
        props?: Record<string, any>;
        onClose: () => void;
    }
    let { title, x, y, component, props = {}, onClose }: PropsType = $props();

    // Svelte 5 runes 模式组件天然动态（svelte:component 已弃用）——别名走大写约定
    const Comp = $derived(component);

    // 定位：下方优先；视口 70% 高度也放不下时翻到锚点上方——翻转分支用 bottom 贴锚点
    // 上沿（按实际内容高度跟随，不按 maxH 估高——vision review P1：固定估高会让矮浮层
    // 飘离按钮）。宽度 max-content 自适应（240~340），短清单不显空（vision review P2）。
    // 高度份额 60%→70%（2026-08-30）：路线指引书态加仿写联动页脚后内容 ~371px，60% 在
    // <618px 矮视口会把动作按钮折进滚动区（vision review 实测 541px 折叠）——70% 覆盖到
    // ~530px 视口；其余浮层只多显示内容无副作用。
    // 视口尺寸响应式（review P2：$derived 里直读 window.innerWidth/Height 非响应式，
    // 浮层开着时改窗口/转屏不重算会悬出界）
    let vw = $state(window.innerWidth);
    let vh = $state(window.innerHeight);

    // 实测内容高度：branch-3 贴锚定位用（首帧 0 先走兜底，RO 回填后重算贴锚）
    let pop: HTMLElement = $state();
    let measuredH = $state(0);
    onMount(() => {
        const ro = new ResizeObserver(() => {
            measuredH = pop.offsetHeight;
        });
        ro.observe(pop);
        return () => ro.disconnect();
    });

    const pos = $derived.by(() => {
        const maxW = Math.min(340, vw - 16);
        // 左侧同钳 8px：无坐标事件（程序触发等）落 x=0 时浮层贴视口边（review 加固）
        const left = Math.min(Math.max(8, x), Math.max(8, vw - 8 - maxW));
        // maxH 封顶 vh-16：下方优先；上方也放不下时按实测高度贴锚上沿、顶边钳 8px——
        // 旧版此场景 bottom 锚按 maxH 估高会让浮层顶出视口顶、top=0 裁掉圆角（□25 vision P2）
        const maxH = Math.min(Math.round(vh * 0.7), vh - 16);
        const top = y + 8;
        let style: string;
        if (top + maxH <= vh - 8) {
            style = `left:${left}px;top:${top}px`;
        } else if (y - 8 >= maxH + 8) {
            // 翻到锚点上方——bottom 贴锚点上沿（按实际内容高度跟随，不按 maxH 估高）
            style = `left:${left}px;bottom:${vh - y + 8}px`;
        } else {
            // 上下都放不下（矮视口）：按实测内容高度贴锚上沿（bottom 离锚 8px），顶边
            // 钳 8px；首帧未量到高度（measuredH=0）时退化为 vh-8-maxH 纯钳位（内容在
            // maxH 内滚动可达），RO 回填后一帧内校正到贴锚位
            const top3 = measuredH > 0
                ? Math.max(8, y - 8 - measuredH)
                : Math.max(8, vh - 8 - maxH);
            style = `left:${left}px;top:${top3}px`;
        }
        return { left, style, maxW, maxH };
    });

    function onOutside(ev: MouseEvent) {
        if (!(ev.target as HTMLElement)?.closest?.(".prog-popover")) onClose();
    }
</script>

<svelte:window onmousedown={onOutside} onresize={() => { vw = window.innerWidth; vh = window.innerHeight; }} />

<div
    class="prog-popover"
    role="dialog"
    aria-label={title}
    bind:this={pop}
    style="{pos.style};max-width:{pos.maxW}px;max-height:{pos.maxH}px"
>
    <div class="prog-popover-head">
        <span class="prog-popover-title">{title}</span>
        <button
            class="prog-popover-close b3-tooltips b3-tooltips__n"
            aria-label={tomatoI18n.退出}
            onclick={(e) => {
                e.stopPropagation();
                onClose();
            }}
        >{@html icon("iconClose", 14)}</button>
    </div>
    <div class="prog-popover-body">
        <Comp {...props} />
    </div>
</div>
