<script lang="ts">
    // graphbox 期2（2026-09-04）：GraphBox 自定义节点——折叠角标与 ¶×N 段落链大节点。
    // 期3：视觉按 docs/graphbox-visual-spec.md 定稿（§2 普通/§4 折叠/§5 角标/§6 ¶卡/
    // §8 跨文档图标/§9 块类型图标），全部走 --b3 主题变量。
    // 角标 pointerdown/click 双 stopPropagation：防触发节点拖拽与 nodeclick（Alt 跳转）。
    import { Handle, Position, type NodeProps } from "@xyflow/svelte";
    import { tomatoI18n } from "./tomatoI18n";
    import { showPanelTip, hidePanelTip } from "./libs/panelTip";

    let { data, targetPosition, sourcePosition }: NodeProps = $props();
    // data: { label, paraText?, collapsed, isParaMerged, hiddenCount, hasChildren, toggle,
    //         blockType?, docName?, isDoc? }

    function onToggle(e: MouseEvent) {
        e.stopPropagation();
        (data as any).toggle?.();
    }
    function stopDrag(e: PointerEvent) {
        e.stopPropagation();
    }
    // 期4 双击=滚动到块（Svelte Flow 无 nodedoubleclick 事件，组件原生 dblclick 承载）；
    // 角标/footer 双击只 stopPropagation 防误触（click×2 已各自 toggle）
    function onDblClick(e: MouseEvent) {
        e.stopPropagation();
        (data as any).dblclick?.();
    }
    function stopDbl(e: MouseEvent) {
        e.stopPropagation();
    }

    // 块类型 → 内置图标（spec §9，13 席全命中内置库；未识别回退 [X] 文字）
    const TYPE_ICON: Record<string, string> = {
        c: "iconCode", m: "iconMath", t: "iconTable",
        widget: "iconHTML5", html: "iconHTML5", iframe: "iconEmbed",
        query_embed: "iconSQL", av: "iconDatabase",
        video: "iconVideo", audio: "iconRecord",
        l: "iconList", i: "iconListItem", b: "iconQuote", s: "iconSuper",
    };
    const blockType = $derived((data as any).blockType as string | undefined);
    const typeIcon = $derived(blockType ? TYPE_ICON[blockType] ?? null : null);
    const docName = $derived((data as any).docName as string | undefined);
    const isDoc = $derived(!!(data as any).isDoc);
</script>

{#if (data as any).isParaMerged}
    <div class="gn gn-para" role="group" ondblclick={onDblClick} aria-label={(data as any).fullText ?? (data as any).label} onmouseenter={(e) => showPanelTip(e.currentTarget as HTMLElement)} onmouseleave={hidePanelTip} >
        <div class="gn-para-head">
            <span class="gn-para-badge">¶×{(data as any).hiddenCount}</span>
        </div>
        <div class="gn-para-text">{(data as any).paraText}</div>
        <button
            class="gn-para-footer"
            aria-label={tomatoI18n.展开此节点}
            onclick={onToggle}
            onpointerdown={stopDrag}
            ondblclick={stopDbl}
        ><span>{tomatoI18n.展开段前缀}{(data as any).hiddenCount}{tomatoI18n.段后缀}</span><span>▾</span></button>
    </div>
{:else}
    <div class="gn" class:gn-collapsed={(data as any).collapsed} role="group" ondblclick={onDblClick} aria-label={(data as any).fullText ?? (data as any).label} onmouseenter={(e) => showPanelTip(e.currentTarget as HTMLElement)} onmouseleave={hidePanelTip} >
        {#if isDoc}
            <svg class="gn-typeicon"><use xlink:href="#iconDocTomato"></use></svg>
        {:else if typeIcon}
            <svg class="gn-typeicon"><use xlink:href="#{typeIcon}"></use></svg>
        {:else if blockType && blockType !== "p" && blockType !== "h" && blockType !== "d"}
            <!-- [X] 只兜真正未识别的类型（spec §9）；p/h/d 是正文类无需前缀（vision P1：[P] 噪声回归） -->
            <span class="gn-typeabbr">[{blockType.toUpperCase()}]</span>
        {/if}
        {#if docName}
            <span class="gn-docname">《{docName}》</span>
        {/if}
        <span class="gn-label">{(data as any).label}</span>
        {#if (data as any).collapsed && (data as any).hiddenCount > 0}
            <button
                class="gn-toggle gn-toggle--collapsed"
                aria-label={tomatoI18n.展开此节点}
                onclick={onToggle}
                onpointerdown={stopDrag}
                ondblclick={stopDbl}
            >+{(data as any).hiddenCount}</button>
        {:else if !(data as any).collapsed && (data as any).hasChildren}
            <button
                class="gn-toggle"
                aria-label={tomatoI18n.折叠此节点}
                onclick={onToggle}
                onpointerdown={stopDrag}
                ondblclick={stopDbl}
            >−</button>
        {/if}
    </div>
{/if}

<Handle type="target" position={targetPosition ?? Position.Left} />
<Handle type="source" position={sourcePosition ?? Position.Right} />

<style>
    .gn {
        box-sizing: border-box;
        position: relative;
        display: flex;
        align-items: baseline;
        flex-wrap: wrap;
        max-width: 172px; /* 与 dagre nodeWidth=172 常量一致，勿单方面改（spec §2）；
                             border-box 使总盒宽=172（padding+边框含内，vision 三轮 P1） */
        min-width: 64px;
        padding: 5px 10px;
        border: 1px solid var(--b3-border-color);
        border-radius: var(--b3-border-radius);
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        font-size: 12px;
        line-height: 1.4;
        word-break: break-all;
        transition: border-color 0.15s, box-shadow 0.15s;
    }
    .gn:hover {
        border-color: var(--b3-theme-primary-light);
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
    }
    :global(.svelte-flow__node.selected) .gn {
        border-color: var(--b3-theme-primary);
        box-shadow: 0 0 0 2px var(--b3-theme-primary-lightest), 0 1px 4px rgba(0, 0, 0, 0.1);
    }
    /* 折叠态（子树折叠）＝蓝系染主色：淡蓝底+粗虚线+实心角标三重信号（spec §4） */
    .gn-collapsed {
        background: var(--b3-theme-primary-lightest);
        border: 1.5px dashed var(--b3-theme-primary-light);
        color: var(--b3-theme-on-background);
    }
    .gn-label {
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        line-clamp: 2;
        overflow: hidden;
    }
    .gn-typeicon {
        width: 14px;
        height: 14px;
        margin-right: 4px;
        vertical-align: -2px;
        color: var(--b3-theme-on-surface-light);
        flex: none;
        align-self: center;
    }
    .gn-typeabbr {
        font-size: 10px;
        color: var(--b3-theme-on-surface-light);
        margin-right: 4px;
        flex: none;
    }
    .gn-docname {
        font-size: 11px;
        color: var(--b3-theme-on-surface-light);
        margin-right: 2px;
    }
    /* ⊕/⊖ 折叠角标：状态即颜色——折叠 +N=主色实心药丸，展开 −=灰描边（spec §5） */
    .gn-toggle {
        position: absolute;
        top: -7px;
        right: -7px;
        min-width: 16px;
        height: 16px;
        padding: 0 4px;
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-surface-light);
        font-size: 10px;
        line-height: 16px;
        text-align: center;
        cursor: pointer;
        box-shadow: none;
    }
    .gn-toggle--collapsed {
        border: none;
        background: var(--b3-theme-primary);
        color: var(--b3-theme-on-primary);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
    }
    .gn-toggle:hover {
        border-color: transparent;
        background: var(--b3-theme-primary);
        color: var(--b3-theme-on-primary);
    }
    /* ¶×N 段落链大节点＝「内容合并」：灰系实线+底部通栏展开 footer，与子树折叠的蓝系虚线
     * 语义互斥（spec §6）；宽 188 与 dagreW 同步 */
    .gn-para {
        box-sizing: border-box;
        display: block;
        width: 188px;
        max-width: 188px;
        padding: 7px 10px 0;
        background: var(--b3-theme-surface);
        border: 1px solid var(--b3-border-color);
    }
    .gn-para-head {
        display: flex;
        align-items: baseline;
        gap: 6px;
    }
    .gn-para-badge {
        flex: none;
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.2px;
        color: var(--b3-theme-primary);
    }
    .gn-para-text {
        margin-top: 3px;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        line-clamp: 2;
        display: -webkit-box;
        overflow: hidden;
        word-break: break-all;
        font-size: 11px;
        line-height: 1.5;
        color: var(--b3-theme-on-surface);
    }
    .gn-para-footer {
        margin: 5px -10px 0; /* 负外距通栏吃掉父 padding */
        height: 20px;
        padding: 0 10px;
        display: flex;
        align-items: center;
        justify-content: space-between; /* ▾ 推右端（vision P2） */
        gap: 2px;
        border: none;
        border-top: 1px dashed var(--b3-border-color);
        background: transparent;
        color: var(--b3-theme-primary);
        font-size: 10px;
        cursor: pointer;
        border-radius: 0 0 var(--b3-border-radius) var(--b3-border-radius);
    }
    .gn-para-footer:hover {
        background: var(--b3-theme-primary-lightest);
    }
</style>
