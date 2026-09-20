<script lang="ts">
    // graphbox 期2（2026-09-04）：GraphBox 自定义节点——折叠角标与 ¶×N 段落链大节点。
    // 期3：视觉按 docs/graphbox-visual-spec.md 定稿（§2 普通/§4 折叠/§5 角标/§6 ¶卡/
    // §8 跨文档图标/§9 块类型图标），全部走 --b3 主题变量。
    // 期7：①布局形态四态——vlr/vtb 时节点文字竖排（writing-mode: vertical-rl，CJK 直立
    // 拉丁旋转 90°），窄 dock 纵向叠多层子节点；②¶×N 重设计=链内全文合并展示
    // （2000 字首尾截断+max-height 400px 内滚动），无展开概念——footer/角标/菜单项全退役。
    // 角标 pointerdown/click 双 stopPropagation：防触发节点拖拽与 nodeclick（Alt 跳转）。
    import { Handle, Position, type NodeProps } from "@xyflow/svelte";
    import { tomatoI18n } from "./tomatoI18n";
    import { showPanelTip, hidePanelTip } from "./libs/panelTip";
    import { formatCharsVolume } from "./libs/graphSkeleton";
    import { stripMarkSyntax } from "./libs/graphMarks";

    let { data, targetPosition, sourcePosition }: NodeProps = $props();
    // data: { label, paraText?, collapsed, isParaMerged, hiddenCount, hasChildren, toggle,
    //         blockType?, docName?, isDoc?, form?, paraExpand?, onParaToggle? }

    function onToggle(e: MouseEvent) {
        e.stopPropagation();
        (data as any).toggle?.();
    }
    // □2 结构态徽标（「N 段 · X 字」pill）：点按=展开/收起该容器直属叶子
    function onBadgeToggle(e: MouseEvent) {
        e.stopPropagation();
        (data as any).toggleBadge?.();
    }
    // 期3 ●N 标记角标：点按=摊开/收起本容器标记叶卡
    function onMarkToggle(e: MouseEvent) {
        e.stopPropagation();
        (data as any).onMarkToggle?.();
    }
    function stopDrag(e: PointerEvent) {
        e.stopPropagation();
    }
    // 期4 双击=滚动到块（Svelte Flow 无 nodedoubleclick 事件，组件原生 dblclick 承载）；
    // ¶ 大节点双击=滚动到链头段（spec 期7）；角标双击只 stopPropagation 防误触
    function onDblClick(e: MouseEvent) {
        e.stopPropagation();
        (data as any).dblclick?.();
    }
    function stopDbl(e: MouseEvent) {
        e.stopPropagation();
    }
    // graphmind □3（共识#4）：¶ 合并框双态——收起=首尾各一段+「⋯ N 块 ⋯」省略标记
    // （块计数并入标记承载，¶×N 徽标退役不重复报数）；展开=原文序全段+序号前缀。
    // 数据层链合并（graphParaMerge）不动，此处纯显示层
    const paraOpen = $derived(!!(data as any).paraExpand);
    // vision 终审补：行文本剥 ==..== 裸划线记法——与标记叶卡（structMark）口径一致，
    // 图内纯文本展示无渲染语义，直出=噪音；收起态首尾段同走此 derived 一并剥
    const paras = $derived(((data as any).paraText ?? "").split("\n").filter(s => s.length > 0).map(stripMarkSyntax));
    // 中间省略块数：链总块数=hiddenCount+1（链头+链内成员），首尾各显一块
    const paraOmitted = $derived(Math.max(((data as any).hiddenCount ?? 0) - 1, 0));
    function onParaToggle(e: MouseEvent) {
        e.stopPropagation();
        (data as any).onParaToggle?.();
    }

    // 块类型 → 内置图标（spec §9；三期 □2：补 tb=iconLine、iframe 原 iconEmbed 无 symbol 改
    // iconGlobe、widget 自 iconHTML5 改 iconPlugin 消与 html 同形——全席位经 sprite 实测存在）
    const TYPE_ICON: Record<string, string> = {
        c: "iconCode", m: "iconMath", t: "iconTable",
        widget: "iconPlugin", html: "iconHTML5", iframe: "iconGlobe",
        query_embed: "iconSQL", av: "iconDatabase",
        video: "iconVideo", audio: "iconRecord", tb: "iconLine",
        l: "iconList", i: "iconListItem", b: "iconQuote", s: "iconSuper",
    };
    const blockType = $derived((data as any).blockType as string | undefined);
    const typeIcon = $derived(blockType ? TYPE_ICON[blockType] ?? null : null);
    // □4 MarginNote 式内容卡片（结构态展开叶子）：两段式=标题栏（类型图标+首行）+多行正文
    const structLeaf = $derived(!!(data as any).structLeaf);
    // graphmind □5（共识#6）标记叶改造：标题栏文字行退役（首行与正文重复），色相由
    // 左缘色条独扛（--gn-mark，卡体 .gn-card--mark）；正文完整显示不限行数（行数钳
    // structClamp 随 □5 全组退役）。graphmark 期3：markDot=子树标记角标（●N 量级
    // 不做色块——共识「视觉减噪」）{n 子树计数, color 首标记色}；点击 onMarkToggle=
    // 摊开/收起该容器标记叶卡（无自身标记=展开本节点）
    const structMark = $derived((data as any).structMark as string | undefined);
    const markDot = $derived((data as any).markDot as { n: number; color: string } | undefined);
    // □4 章节编号独立字段（弱化浅灰前缀——双编号场景两段语义可分）
    const number = $derived((data as any).number as string | undefined);
    // □2 徽标：{leaves, chars, expanded}——文本「N 段 · X 字」本体即信息，aria 同源
    const badge = $derived((data as any).structBadge as { leaves: number; chars: number; expanded: boolean } | undefined);
    const badgeLabel = $derived(badge
        ? (badge.expanded ? tomatoI18n.徽标已展开点击收起 : tomatoI18n.徽标段字)
            .replace("%1", `${badge.leaves}`).replace("%2", `${badge.chars}`)
        : "");
    const docName = $derived((data as any).docName as string | undefined);
    const isDoc = $derived(!!(data as any).isDoc);
    // 期7 竖排分支（form 由 relayout commit 写进 data；形态切换不重建节点，只刷 form）
    const textV = $derived((data as any).form === "vlr" || (data as any).form === "vtb");
    // 竖排列档（spec §16）：label >8 字升 2 列档（118px 高钳单列容 8.8 字；前缀不计入）
    const v2col = $derived(((data as any).label ?? "").length > 8);
    // ¶ tooltip 巨幕防御（spec §17 P2）：合并全文截 300 字进 panelTip（卡片内已有全文+滚动）
    const paraTip = $derived(((data as any).fullText ?? "").slice(0, 300));
</script>

{#if structLeaf}
    <!-- □4 MarginNote 式内容卡片：主色标题栏（类型图标+首行）+白底多行正文（pre-wrap 按行/keep 拉丁词整）。
         graphmind □5（共识#6）标记叶（structMark）：标题栏文字行退役——首行与正文重复；
         卡体=左缘色条（色相唯一载体）+正文完整显示（宽 300 封顶高自适应） -->
    <div
        class="gn-card"
        class:gn-card--mark={!!structMark}
        style={structMark ? `--gn-mark:${structMark}` : ""}
        role="group"
        ondblclick={onDblClick}
        aria-label={(data as any).fullText || (data as any).label}
        onmouseenter={(e) => showPanelTip(e.currentTarget as HTMLElement)}
        onmouseleave={hidePanelTip}
    >
        {#if !structMark}
            <div class="gn-card-head">
                {#if typeIcon}<svg class="gn-card-icon"><use xlink:href="#{typeIcon}"></use></svg>{/if}
                <span class="gn-card-title">{(data as any).label}</span>
            </div>
        {/if}
        <!-- 期4 vision P2：无正文时不渲染空 body（普通展开叶 bodyText 恒回退全文不受影响；
             graphmind □5 标记叶 bodyText 恒=全文非空）。行数钳全组退役（□2 高度不限，
             □5 标记叶 2 行钳同步放开——完整显示） -->
        {#if (data as any).bodyText}
            <div class="gn-card-body">{(data as any).bodyText}</div>
        {/if}
    </div>
{:else if (data as any).isParaMerged}
    <!-- graphmind □3：合并框双态（共识#4）——收起=首尾各一段（行数钳）+「⋯ N 块 ⋯」
         省略标记（点按=展开；计数并入标记，¶×N 徽标退役不重复报数）；展开=原文序
         全段+序号前缀，框头计数+收起钮（两态互斥出场，不重复报数）；框内保原文序 -->
    <div
        class="gn-para" class:gn-para-v={textV}
        role="group"
        ondblclick={onDblClick}
        aria-label={paraTip}
        onmouseenter={(e) => showPanelTip(e.currentTarget as HTMLElement)}
        onmouseleave={hidePanelTip}
    >
        {#if paraOpen}
            <div class="gn-para-head">
                <span class="gn-para-badge">¶×{(data as any).hiddenCount}</span>
                <button
                    class="gn-para-fold"
                    aria-label={tomatoI18n.段落链点击收起}
                    title={tomatoI18n.段落链点击收起}
                    onclick={onParaToggle}
                    onpointerdown={stopDrag}
                    ondblclick={stopDbl}
                >▾</button>
            </div>
            <div class="gn-para-text">
                {#each paras as p, i (i)}
                    <div class="gn-para-line"><span class="gn-para-idx">{i + 1}</span>{p}</div>
                {/each}
            </div>
        {:else}
            {#if paras.length}
                <div class="gn-para-clip">{paras[0]}</div>
            {/if}
            {#if paraOmitted > 0}
                <button
                    class="gn-para-omit"
                    aria-label={tomatoI18n.段落链点击展开.replace("%1", `${paraOmitted}`)}
                    title={tomatoI18n.段落链点击展开.replace("%1", `${paraOmitted}`)}
                    onclick={onParaToggle}
                    onpointerdown={stopDrag}
                    ondblclick={stopDbl}
                >{tomatoI18n.段落链省略块.replace("%1", `${paraOmitted}`)}</button>
            {/if}
            {#if paras.length > 1}
                <div class="gn-para-clip">{paras[paras.length - 1]}</div>
            {/if}
        {/if}
    </div>
{:else}
    <div
        class="gn" class:gn-v={textV} class:gn-v--2col={textV && v2col} class:gn-collapsed={(data as any).collapsed}
        role="group"
        ondblclick={onDblClick}
        aria-label={(data as any).fullText || (data as any).label}
        onmouseenter={(e) => showPanelTip(e.currentTarget as HTMLElement)}
        onmouseleave={hidePanelTip}
    >
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
        {#if number}<span class="gn-num">{number}</span>{/if}
        {#if markDot}
            <button
                class="gn-markpill"
                style="--gn-mark:{markDot.color}"
                aria-label={tomatoI18n.处标记.replace("%1", `${markDot.n}`)}
                title={tomatoI18n.处标记.replace("%1", `${markDot.n}`)}
                onclick={onMarkToggle}
                onpointerdown={stopDrag}
                ondblclick={stopDbl}
            ><span class="gn-markpill-dot"></span>{markDot.n}</button>
        {/if}
        <span class="gn-label">{(data as any).label}</span>
        {#if badge}
            <button
                class="gn-badge"
                class:gn-badge--open={badge.expanded}
                aria-label={badgeLabel}
                title={badgeLabel}
                onclick={onBadgeToggle}
                onpointerdown={stopDrag}
                ondblclick={stopDbl}
            >{badge.leaves} · {formatCharsVolume(badge.chars, tomatoI18n.lang)}{badge.expanded ? "▾" : "▸"}</button>
        {/if}
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
        /* graphmind □2 脑图卡片规格（学官方 _list-mindmap 视觉，代码不搬）：max-width 300
         * 封顶 + 高度不限不截断（label 放开行数钳自然换行）。与 dagre nodeWidth=300 首轮
         * 估算常量一致，勿单方面改；border-box 使总盒宽=300（padding+边框含内） */
        max-width: 300px;
        min-width: 64px;
        padding: 4px 12px;
        border: 1px solid var(--b3-border-color);
        border-radius: var(--b3-border-radius);
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        font-size: 12px;
        line-height: 1.5;
        /* □3 vision P2：拉丁词 break-all 腰斩（H1-INTRO→INTR/O）——anywhere 整词优先断 CJK 随断 */
        overflow-wrap: anywhere;
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
    /* graphmind □2：高度不限不截断——行数钳退役（宽 300 封顶内自然换行；脑图骨架标题完整可见） */
    .gn-label {
        overflow-wrap: anywhere;
        min-width: 0;
    }
    .gn-typeicon {
        width: 14px;
        height: 14px;
        margin-inline-end: 4px; /* 逻辑属性（spec §16）：横排=右侧距、竖排=列内向下次距，一处双态 */
        vertical-align: -2px;
        color: var(--b3-theme-on-surface-light);
        flex: none;
        align-self: center;
    }
    .gn-typeabbr {
        font-size: 10px;
        color: var(--b3-theme-on-surface-light);
        margin-inline-end: 4px;
        flex: none;
    }
    .gn-docname {
        font-size: 11px;
        color: var(--b3-theme-on-surface-light);
        margin-inline-end: 2px;
    }
    /* ⊕/⊖ 折叠角标：状态即颜色——折叠 +N=主色实心药丸，展开 −=灰描边（spec §5） */
    .gn-toggle {
        position: absolute;
        top: -7px;
        right: -7px;
        min-width: 16px;
        height: 16px;
        padding: 0 4px;
        /* □3 vision P2：白底细边可发现性差——border-color 提浓一档（on-surface 30% 混合） */
        border: 1px solid color-mix(in srgb, var(--b3-theme-on-surface) 30%, transparent);
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
    /* □2 结构态徽标 pill：直属叶子聚合量（挂节点底部中央，点击展开/收起）。
     * 展开态实心主色（与折叠角标形制呼应），默认弱化轻量 */
    .gn-badge {
        position: absolute;
        left: 50%;
        bottom: -11px;
        transform: translateX(-50%);
        height: 18px;
        padding: 0 8px;
        border: 1px solid var(--b3-border-color);
        border-radius: 9px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-surface-light);
        font-size: 11px;
        line-height: 16px;
        white-space: nowrap;
        cursor: pointer;
        box-shadow: none;
    }
    /* □4 MarginNote 式内容卡片：正文 pre-wrap 按行（代码语言行恢复）+break-word（拉丁词
     * 不腰斩）；暗态走主题变量自动换装。
     * graphmind □2：与标题节点统一脑图卡片规格——宽 max-content 封顶 300、高度不限
     * 不截断（行数钳 8 退役，完整显示；宽封顶高自适应） */
    .gn-card {
        box-sizing: border-box;
        width: max-content;
        min-width: 120px;
        max-width: 300px;
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        background: var(--b3-theme-background);
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        overflow: hidden;
        cursor: default;
    }
    .gn-card-head {
        display: flex;
        align-items: center;
        gap: 5px;
        height: 22px;
        padding: 0 7px;
        background: var(--b3-theme-primary);
        color: var(--b3-theme-on-primary);
        font-size: 11px;
        line-height: 22px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        flex: none;
    }
    .gn-card-icon {
        flex: none;
        width: 12px;
        height: 12px;
        fill: currentColor;
    }
    .gn-card-title {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .gn-card-body {
        padding: 6px 8px;
        font-size: 11px;
        line-height: 1.5;
        color: var(--b3-theme-on-surface);
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        /* graphmind □2：高度不限（line-clamp 8 退役——内容完整显示，宽 300 封顶内换行） */
    }
    /* graphmind □5（共识#6）标记叶：标题栏文字行退役（首行与正文重复），色相由左缘
       色条独扛——luji0918 □2 的 3px 提 4px 强化辨识（任意标记色实心条不涉文字可读性，
       无需旧 color-mix 浅衬兜底）；卡体=主题底+完整正文（宽 300 封顶高自适应） */
    .gn-card--mark {
        border-left: 4px solid var(--gn-mark, var(--b3-theme-primary));
    }
    /* graphmark 期3 ●N 标记角标：色点+计数小药丸（子树标记量；点按摊开标记叶卡）。
     * 弱化轻量形制与徽标 pill 呼应，色点承载标记色相（共识「小色点+数字不做色块」） */
    .gn-markpill {
        flex: none;
        display: inline-flex;
        align-items: center;
        gap: 3px;
        height: 16px;
        margin-inline-end: 4px;
        padding: 0 5px;
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-surface); /* 期4 vision P2：10px 数字亮色 3.0:1 不足提档（6.05:1）；暗色分支回 on-surface-light（8.6:1） */
        font-size: 10px;
        line-height: 14px;
        cursor: pointer;
        box-shadow: none;
    }
    .gn-markpill:hover {
        border-color: transparent;
        background: var(--b3-theme-primary-lightest);
        color: var(--b3-theme-on-surface);
    }
    /* 期4 vision P2：数字亮色 3.0:1（10px 小字）不足——提 --b3-theme-on-surface（6.05:1）；
       暗色 on-surface-light 本就 8.6:1，分支保持原值（暗色判据=html[data-theme-mode]，
       3.8.3 无 .dark class）。基础 color 在上方 .gn-markpill 主块 */
    :global(html[data-theme-mode="dark"]) .gn-markpill {
        color: var(--b3-theme-on-surface-light);
    }
    .gn-markpill-dot {
        flex: none;
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--gn-mark, var(--b3-theme-primary));
        box-shadow: 0 0 0 1px var(--b3-border-color);
    }
    /* □4 章节编号弱化前缀（浅灰常规字重——双编号场景自动编号段与标题自带序号段语义可分） */
    .gn-num {
        margin-right: 4px;
        color: var(--b3-theme-on-surface-light);
        font-weight: 400;
        font-size: 10px;
    }
    .gn-badge:hover,
    .gn-badge--open {
        border-color: transparent;
        background: var(--b3-theme-primary);
        color: var(--b3-theme-on-primary);
    }

    /* ===== 期7 竖排普通节点（spec §16）：窄高条定宽两档——V1 单列 40px / V2 双列 56px
     * （列厚=line-height 1.4×12px=16.8；左右 padding 10 与横排 .gn 物理同构）。
     * flex 主轴随 writing-mode 旋转（inline 轴=纵向）；图标（replaced element）不旋转立于首列顶部；
     * 《》由 CJK 字体 vert 特性自动转竖排形。角标保持右上角（方案 A，spec §16 拍板）。 */
    .gn-v {
        writing-mode: vertical-rl;
        text-orientation: mixed; /* 拉丁横躺 90°（spec §19 拍板），显式声明防继承污染 */
        align-items: flex-start; /* 竖排下 baseline 无意义，改起点对齐（spec §16） */
        align-content: start;
        width: 40px;
        min-width: 0;
        max-width: none;
        max-height: 118px; /* ≈8 字/列整字截断；2 列 clamp 对应横排 2 行预算（spec §2） */
        min-height: 64px;
        padding: 8px 10px;
        overflow: hidden;
    }
    /* 竖排 line-clamp 的「行」即「列」（spec §16）：声明组零改动生效，按档覆盖 1/2 */
    .gn-v .gn-label {
        -webkit-line-clamp: 1;
        line-clamp: 1;
        max-width: none;
    }
    .gn-v--2col {
        width: 56px;
    }
    .gn-v--2col .gn-label {
        -webkit-line-clamp: 2;
        line-clamp: 2;
    }

    /* ===== ¶×N 段落链合并框（graphmind □3 双态，共识#4）：收起=首尾各一段（3 行钳）
     * +「⋯ N 块 ⋯」省略标记（计数承载，¶×N 徽标收起态退役）；展开=原文序全段+序号。
     * 灰系实线延续（spec §6）；2000 字截断在数据侧（graphParaMerge 不动）；
     * 展开态视觉钳 max-height 400px 内滚动（防巨型节点把 fitView 缩爆，spec §17 延续） */
    .gn-para {
        box-sizing: border-box;
        display: block;
        width: 188px;
        max-width: 188px;
        padding: 7px 10px;
        background: var(--b3-theme-surface);
        border: 1px solid var(--b3-border-color);
        border-radius: var(--b3-border-radius);
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
    /* graphmind □3 P1（09-19 vision）：暗色下主题蓝徽标 2.2:1 不足 WCAG 3:1（浅色同色
       3.68:1 过线不动）——midnight 的 primary-light 族=同色透明度递减（.72 混框底更暗，
       实算 2.35:1）不可用；暗色分支 color-mix 掺白 35% 提亮（主蓝语义保留，实算 ~5.7:1）。
       暗色判据=html[data-theme-mode]（3.8.3 无 .dark class，gn-markpill 先例同款） */
    :global(html[data-theme-mode="dark"]) .gn-para-badge {
        color: color-mix(in srgb, var(--b3-theme-primary) 65%, white);
    }
    /* 展开态框头收起钮（与省略标记同为切换通道；轻量形制同 gn-badge 呼应）。
       graphmind □3 P1（09-19 vision 二轮）：色原 on-surface-light 浅色混底 2.89:1 不足
       （同 omit 病），提档 on-surface 实色 */
    .gn-para-fold {
        flex: none;
        min-width: 14px;
        height: 14px;
        padding: 0 2px;
        border: 1px solid var(--b3-border-color);
        border-radius: 7px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-surface);
        font-size: 9px;
        line-height: 12px;
        text-align: center;
        cursor: pointer;
        box-shadow: none;
    }
    .gn-para-fold:hover {
        border-color: transparent;
        background: var(--b3-theme-primary);
        color: var(--b3-theme-on-primary);
    }
    /* 收起态首尾段（3 行钳=「两小段」验收口径；展开态全文不限行归 .gn-para-line） */
    .gn-para-clip {
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 3;
        line-clamp: 3;
        overflow: hidden;
        word-break: break-all;
        white-space: pre-wrap;
        font-size: 11px;
        line-height: 1.5;
        color: var(--b3-theme-on-surface);
    }
    /* 收起态省略标记（点按=展开）：居中弱化药丸，块计数唯一载体 */
    .gn-para-omit {
        display: block;
        width: 100%;
        margin: 2px 0;
        padding: 1px 0;
        border: 1px dashed var(--b3-border-color);
        border-radius: 8px;
        background: transparent;
        /* graphmind □3 P1（09-19 vision 二轮）：原 on-surface-light 浅色=rgba 半透明混底
           2.89:1 不过组件线 3:1（交互件）；提档 on-surface 实色（浅 5.6 / 暗 5.3），
           弱化感由虚线描边+10px 字号承载 */
        color: var(--b3-theme-on-surface);
        font-size: 10px;
        line-height: 16px;
        text-align: center;
        white-space: nowrap;
        cursor: pointer;
        box-shadow: none;
    }
    .gn-para-omit:hover {
        border-color: var(--b3-theme-primary-light);
        background: var(--b3-theme-primary-lightest);
        color: var(--b3-theme-primary);
    }
    /* 展开态原文序逐段（序号浅灰前缀，段间距 3px 分行可辨） */
    .gn-para-text {
        margin-top: 3px;
        max-height: 400px;
        overflow: auto; /* 高钳内滚（spec §17）：横排滚 y、竖排块流向左自动滚 x，同一声明换轴零分叉 */
        scrollbar-width: thin;
        font-size: 11px;
        line-height: 1.5;
        color: var(--b3-theme-on-surface);
    }
    .gn-para-line {
        margin: 3px 0;
        padding-left: 16px;
        text-indent: -16px;
        word-break: break-all;
        white-space: pre-wrap;
        /* graphmind □3 P1（09-19 vision 二轮）：显式钉 on-surface 实色——原靠 .gn-para-text
           继承，评审环境实测拿到 154,160,166 淡一档（疑主题切换残留值/继承链污染）；
           显式声明后任何环境恒 rgb(95,99,104) 对框底 #f6f6f6=5.6:1 */
        color: var(--b3-theme-on-surface);
    }
    /* graphmind □3 P1（09-19 vision 二轮）：序号原用 on-surface-light=rgba(95,99,104,.68)
       半透明——混 #f6f6f6 框底实算 2.90:1 不过 3:1（dark 的 light 系=实色无此病）；提档
       on-surface 实色（浅 5.6 / 暗 5.3 两主题过线），层级弱化改靠 10px 字号承载 */
    .gn-para-idx {
        margin-right: 4px;
        color: var(--b3-theme-on-surface);
        font-size: 10px;
    }
    .gn-para-text::-webkit-scrollbar {
        width: 4px;
        height: 4px;
    }
    .gn-para-text::-webkit-scrollbar-thumb {
        background: var(--b3-border-color);
        border-radius: 2px;
    }
    .gn-para-text::-webkit-scrollbar-thumb:hover {
        background: var(--b3-theme-on-surface-light);
    }
    /* 竖排 ¶ 卡（spec §17）：文字竖排、宽钳 122；省略标记/框头行保持横排
     * （数字+× 记号竖排不可读——badge 行先例同款） */
    .gn-para-v {
        writing-mode: vertical-rl;
        width: auto;
        max-width: 122px;
        min-width: 64px;
        padding: 8px 7px;
    }
    .gn-para-v .gn-para-head,
    .gn-para-v .gn-para-omit {
        writing-mode: horizontal-tb;
    }
    .gn-para-v .gn-para-head {
        flex: none;
    }
    .gn-para-v .gn-para-omit {
        width: auto;
        max-width: none;
        margin: 0 3px; /* 竖排块流向左：标记占一列位 */
        align-self: center;
    }
    .gn-para-v .gn-para-text {
        margin-top: 0;
        margin-left: 3px; /* 竖排块流向左：badge 在首列右侧 */
        max-height: 400px;
    }
</style>
