<script lang="ts">
    // □8 知识地图自定义节点：类型色点+名字+一句话摘要+片进度点条（进度点亮）+
    // 当前阅读位置高亮环。簇形态=大胶囊显示「类型 · N」（点开=该 type 展开视图）。
    // 信息平铺纪律：summary 直接显示不藏 hover；title 仅截断兜底。
    import { Handle, Position, type NodeProps } from "@xyflow/svelte";
    import type { NodeProgress } from "./bookMapLayout";

    let { data, selected }: NodeProps = $props();
    // data: { kind: "node"|"cluster", name, typeLabel, summary, progress, core, clusterCount }

    const kind = $derived((data as any).kind as "node" | "cluster");
    const name = $derived(String((data as any).name ?? ""));
    const typeLabel = $derived(String((data as any).typeLabel ?? ""));
    const summary = $derived(String((data as any).summary ?? ""));
    const progress = $derived((data as any).progress as NodeProgress | undefined);
    const core = $derived(!!(data as any).core);
    const clusterCount = $derived(Number((data as any).clusterCount ?? 0));
    const isCurrent = $derived(!!progress?.isCurrent);

    // 进度点条分桶（顺序：毕业→已读→在读→未读；在读脉动蓝、当前命中另加高亮环）
    const DOT_CAP = 60; // 主角级节点锚并集可数百，点条撑爆卡片（review P2-2）
    const dots = $derived(progress && progress.total > 0
        ? [
            ...Array<null>(progress.graduated).fill(null).map(() => "g"),
            ...Array<null>(progress.read).fill(null).map(() => "r"),
            ...Array<null>(progress.reading).fill(null).map(() => "w"),
            ...Array<null>(progress.unread).fill(null).map(() => "u"),
        ].slice(0, DOT_CAP)
        : []);

    // 码位截断防代理对劈裂（ContentsPopover cut 同款）
    function cut(s: string, n: number) {
        const chars = [...s];
        return chars.length > n ? chars.slice(0, n).join("") + "…" : s;
    }
    // 双击=跳第一证据锚片（Svelte Flow 无 nodedoubleclick，节点原生 dblclick 承载——
    // GraphNode 同款；stopPropagation 防误触画布缩放）
    function onDblClick(e: MouseEvent) {
        e.stopPropagation();
        (data as any).cancelClick?.(); // 取消待发的单击钻取（review P1-2 双击几何互斥）
        (data as any).dblclick?.();
    }
</script>

{#if kind === "cluster"}
    <div class="prog-map-node prog-map-cluster" class:prog-map-selected={selected} role="button" tabindex="-1" ondblclick={onDblClick}>
        <span class="prog-map-cluster-count">{clusterCount}</span>
        <span class="prog-map-cluster-label">{name}</span>
    </div>
{:else}
    <div
        class="prog-map-node"
        class:prog-map-core={core}
        class:prog-map-current={isCurrent}
        class:prog-map-selected={selected}
        title={name}
        role="button"
        tabindex="-1"
        ondblclick={onDblClick}
    >
        <Handle type="target" position={Position.Top} class="prog-map-handle" />
        <div class="prog-map-head">
            <span class="prog-map-dot prog-map-dot-{(data as any).type}"></span>
            <span class="prog-map-name">{cut(name, core ? 11 : 9)}</span>
            <span class="prog-map-type">{typeLabel}</span>
        </div>
        {#if summary}
            <div class="prog-map-summary">{cut(summary, core ? 64 : 30)}</div>
        {/if}
        {#if dots.length}
            <div class="prog-map-dots" aria-label="{progress!.read + progress!.graduated}/{progress!.total}">
                {#each dots as d, i (i)}
                    <span class="prog-map-dotcell prog-map-dotcell-{d}"></span>
                {/each}
            </div>
        {/if}
        <Handle type="source" position={Position.Bottom} class="prog-map-handle" />
    </div>
{/if}

<style>
    .prog-map-node {
        background: var(--b3-theme-surface);
        border: 1px solid var(--b3-border-color);
        /* bookmap P2②：暗色普通卡描边提档白 alpha 0.16（--b3-border-color 暗值≈白 10%
           轮廓感弱；scoped CSS 挂 html 域须 :global——3.8.3 暗判据坑） */
        border-radius: 6px;
        padding: 6px 10px;
        font-size: 12px;
        line-height: 1.4;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
    }
    /* 打磨批（09-13 拥挤修复）：实体卡宽钉死=布局槽宽（dagre 140/176，border-box）——
       原 min/max 100~176/140~216 的 content 驱动变宽会吃掉 nodesep 净空（DOM 实测
       渲染 140~216px vs 槽 140/176，vision 抓到 6px 贴脸）。内部自适应：名字 ellipsis、
       摘要两行钳、点条容器内换行；簇胶囊不在此列（仍按内容收缩） */
    .prog-map-node:not(.prog-map-cluster) {
        width: 156px; /* bookmap P2①：140→156 同步 dagre 槽宽（6 字名+徽章后不再 5 字截断） */
        box-sizing: border-box;
    }
    /* 核心节点放大（骨架分层视觉档） */
    .prog-map-core {
        width: 176px;
        font-size: 13px;
        padding: 8px 12px;
    }
    /* 当前阅读位置高亮环（isCurrent=证据锚命中当前 point） */
    .prog-map-current {
        border-color: var(--b3-theme-primary);
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--b3-theme-primary) 45%, transparent);
    }
    .prog-map-selected {
        border-color: var(--b3-theme-primary);
    }
    .prog-map-head {
        display: flex;
        align-items: center;
        gap: 6px;
    }
    .prog-map-name {
        font-weight: 600;
        color: var(--b3-theme-on-surface);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .prog-map-type {
        flex-shrink: 0;
        font-size: 10px;
        color: var(--b3-theme-on-surface);
        opacity: 0.7;
        background: var(--b3-theme-background);
        border-radius: 3px;
        padding: 0 4px;
    }
    /* 类型五色点：语义色白底小面积用 color-mix 提对比（b3 变量参考纪律） */
    .prog-map-dot {
        flex-shrink: 0;
        width: 8px;
        height: 8px;
        border-radius: 50%;
    }
    .prog-map-dot-person { background: color-mix(in srgb, var(--b3-theme-primary) 80%, black); }
    .prog-map-dot-concept { background: color-mix(in srgb, var(--b3-theme-success) 75%, black); }
    /* 打磨批（vision P1 根因）：midnight 主题不定义 --b3-theme-warning（实测空，daylight
       亦无——仅 base 色卡部分主题带）→ color-mix 无兜底整条失效=色点恒透明（□8 起
       event 色点从未显过色）。修=字面兜底（SplitVols 警告条 #d25f00 先例口径）+混
       on-surface 双主题可见 */
    .prog-map-dot-event { background: color-mix(in srgb, var(--b3-theme-warning, #d97706) 85%, var(--b3-theme-on-surface)); }
    .prog-map-dot-place { background: color-mix(in srgb, var(--b3-theme-error) 80%, white); }
    .prog-map-dot-theme { background: color-mix(in srgb, var(--b3-theme-primary) 50%, var(--b3-theme-error)); }

    .prog-map-summary {
        margin-top: 3px;
        color: var(--b3-theme-on-surface);
        opacity: 0.72;
        font-size: 11px;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }
    /* 片进度点条：毕业=实绿 / 已读=淡绿 / 在读=蓝脉动 / 未读=灰空心 */
    .prog-map-dots {
        display: flex;
        flex-wrap: wrap;
        gap: 2px;
        margin-top: 5px;
        max-width: 100%;
        min-height: 7px;
    }
    .prog-map-dotcell {
        width: 7px;
        height: 7px;
        border-radius: 2px;
    }
    .prog-map-dotcell-g { background: color-mix(in srgb, var(--b3-theme-success) 80%, black); }
    .prog-map-dotcell-r { background: color-mix(in srgb, var(--b3-theme-success) 45%, var(--b3-theme-surface)); }
    .prog-map-dotcell-w {
        background: var(--b3-theme-primary);
        animation: prog-map-pulse 1.6s ease-in-out infinite;
    }
    .prog-map-dotcell-u {
        border: 1px solid var(--b3-border-color);
        box-sizing: border-box;
    }
    @keyframes prog-map-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.35; }
    }

    /* 簇形态：胶囊+计数徽标 */
    .prog-map-cluster {
        display: flex;
        align-items: center;
        gap: 8px;
        border-radius: 999px;
        padding: 8px 14px;
        cursor: pointer;
    }
    .prog-map-cluster-count {
        font-size: 12px;
        font-weight: 700;
        color: var(--b3-theme-on-surface);
        background: var(--b3-theme-background);
        border-radius: 999px;
        padding: 1px 8px;
    }
    .prog-map-cluster-label { font-size: 12px; color: var(--b3-theme-on-surface); }

    .prog-map-handle {
        width: 6px;
        height: 6px;
        background: var(--b3-border-color);
        border: none;
    }
    /* prefers-reduced-motion 降级：脉动改静态 */
    @media (prefers-reduced-motion: reduce) {
        .prog-map-dotcell-w { animation: none; }
    }
    /* bookmap P2②（tailbatch □10）：暗色描边提档（见上注释） */
    :global(html[data-theme-mode="dark"]) .prog-map-node:not(.prog-map-cluster) {
        border-color: rgba(255, 255, 255, 0.16);
    }
</style>
