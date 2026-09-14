<script lang="ts">
    // progtree □3 写作结构投影节点：wroot=书名+汇总卡（N 槽 · M 素材 · K 待补）；
    // wslot=槽卡四态（done 绿/ready 主色/gap 警示虚线/容器中性）+素材·子槧行内计数。
    // 信息平铺纪律：计数与状态直接显示不藏 hover；title 仅截断兜底。宽度钉死=
    // BookMapNode 拥挤修复同款（border-box+ellipsis，防 content 撑宽吃掉列间距）。
    import { Handle, Position, type NodeProps } from "@xyflow/svelte";
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";

    let { data, selected }: NodeProps = $props();
    // data: { kind: "wroot"|"wslot", title, summary?, materialCount, childCount, done, gap }

    const kind = $derived((data as any).kind as "wroot" | "wslot");
    const title = $derived(String((data as any).title ?? ""));
    const summary = $derived(String((data as any).summary ?? ""));
    const materialCount = $derived(Number((data as any).materialCount ?? 0));
    const childCount = $derived(Number((data as any).childCount ?? 0));
    const done = $derived(!!(data as any).done);
    const gap = $derived(!!(data as any).gap);

    // 码位截断防代理对劈裂（BookMapNode cut 同款）
    function cut(s: string, n: number) {
        const chars = [...s];
        return chars.length > n ? chars.slice(0, n).join("") + "…" : s;
    }
</script>

{#if kind === "wroot"}
    <div class="wmap-root" class:wmap-selected={selected} title={title}>
        <Handle type="source" position={Position.Right} class="wmap-handle" />
        <div class="wmap-root-name">{cut(title, 13)}</div>
        {#if summary}
            <div class="wmap-root-sum">{summary}</div>
        {/if}
    </div>
{:else}
    <!-- 四态优先级（vision P2 固化）：done > gap > ready(素材>0) > 容器槽默认。
         即槽既有素材又有子槽时显 READY 蓝（素材就绪优先于容器身份） -->
    <div
        class="wmap-slot"
        class:wmap-slot-done={done}
        class:wmap-slot-gap={gap}
        class:wmap-slot-ready={!gap && !done && materialCount > 0}
        class:wmap-selected={selected}
        title={title}
        role="button"
        tabindex="-1"
    >
        <Handle type="target" position={Position.Left} class="wmap-handle" />
        <div class="wmap-head">
            {#if done}
                <span class="wmap-dot wmap-dot-done"></span>
            {:else if gap}
                <span class="wmap-dot wmap-dot-gap"></span>
            {:else if materialCount > 0}
                <span class="wmap-dot wmap-dot-ready"></span>
            {/if}
            <span class="wmap-name">{cut(title, 9)}</span>
        </div>
        <div class="wmap-meta">
            {#if gap}
                <span class="wmap-tag wmap-tag-gap">{tomatoI18n.结构缺口标记()}</span>
            {:else}
                {#if materialCount > 0}<span class="wmap-count">{materialCount} {tomatoI18n.结构素材标签()}</span>{/if}
                {#if childCount > 0}<span class="wmap-sub">{childCount} {tomatoI18n.结构子槽标签()}</span>{/if}
                {#if done}<span class="wmap-tag wmap-tag-done">{tomatoI18n.结构定稿标记()}</span>{/if}
            {/if}
        </div>
        <Handle type="source" position={Position.Right} class="wmap-handle" />
    </div>
{/if}

<style>
    .wmap-root {
        width: 176px;
        box-sizing: border-box;
        background: var(--b3-theme-surface);
        /* 中性加重边（vision P2：primary 蓝与 READY 态撞色——根卡不是槽，
           醒目靠字号+粗体+尺寸，边框不占状态语义） */
        border: 1.5px solid color-mix(in srgb, var(--b3-theme-on-surface) 30%, transparent);
        border-radius: 6px;
        padding: 8px 12px;
        font-size: 13px;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
    }
    .wmap-root-name {
        font-weight: 700;
        color: var(--b3-theme-on-surface);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .wmap-root-sum {
        margin-top: 3px;
        font-size: 11px;
        color: var(--b3-theme-on-surface);
        opacity: 0.78;
        line-height: 1.5;
    }

    .wmap-slot {
        width: 140px;
        box-sizing: border-box;
        background: var(--b3-theme-surface);
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        padding: 6px 10px;
        font-size: 12px;
        line-height: 1.4;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
        cursor: pointer;
    }
    /* 四态：done=成功色实边（白底对比度混黑，b3 变量纪律）；gap=警示虚线；
       ready=主色；容器槽=默认。selected=交互选中态（xyflow 点选高亮） */
    .wmap-slot-done {
        border-color: color-mix(in srgb, var(--b3-theme-success) 70%, black);
        border-width: 1.5px;
    }
    .wmap-slot-gap {
        border: 1.5px dashed color-mix(in srgb, var(--b3-theme-warning, #d97706) 85%, var(--b3-theme-on-surface));
        background: color-mix(in srgb, var(--b3-theme-warning, #d97706) 6%, var(--b3-theme-surface));
    }
    .wmap-slot-ready {
        border-color: var(--b3-theme-primary);
    }
    .wmap-selected {
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--b3-theme-primary) 45%, transparent);
    }
    .wmap-head {
        display: flex;
        align-items: center;
        gap: 6px;
    }
    .wmap-name {
        font-weight: 600;
        color: var(--b3-theme-on-surface);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .wmap-dot {
        flex-shrink: 0;
        width: 8px;
        height: 8px;
        border-radius: 50%;
    }
    .wmap-dot-done { background: color-mix(in srgb, var(--b3-theme-success) 80%, black); }
    .wmap-dot-gap { background: color-mix(in srgb, var(--b3-theme-warning, #d97706) 85%, var(--b3-theme-on-surface)); }
    .wmap-dot-ready { background: var(--b3-theme-primary); }

    .wmap-meta {
        display: flex;
        align-items: center;
        gap: 2px; /* 间距分工给各 span 的 padding（vision P2：gap 6+padding 4 混算=计数行节奏 10/14px 不均） */
        margin-top: 3px;
        min-height: 16px;
        font-size: 10px;
    }
    .wmap-count {
        color: var(--b3-theme-on-surface);
        /* 主题对称药丸底（vision P2：background 色在亮色下与卡面同色隐形、暗色显形） */
        background: color-mix(in srgb, var(--b3-theme-on-surface) 6%, transparent);
        border-radius: 3px;
        padding: 0 4px;
    }
    .wmap-sub {
        color: var(--b3-theme-on-surface);
        opacity: 0.7;
        padding: 0 4px;
    }
    .wmap-tag {
        border-radius: 3px;
        padding: 0 4px;
    }
    .wmap-tag-gap {
        color: color-mix(in srgb, var(--b3-theme-warning, #d97706) 85%, var(--b3-theme-on-surface));
        background: color-mix(in srgb, var(--b3-theme-warning, #d97706) 10%, transparent);
    }
    .wmap-tag-done {
        color: color-mix(in srgb, var(--b3-theme-success) 75%, black);
        background: color-mix(in srgb, var(--b3-theme-success) 10%, transparent);
    }
    /* Handle class 挂在 xyflow 组件内部 DOM——scoped 选择器会被剪（运行时挂类须
       :global，AGENTS 在案），全局唯一前缀 wmap- 无碰撞风险 */
    :global(.wmap-handle) {
        width: 6px;
        height: 6px;
        background: var(--b3-border-color);
        border: none;
    }
</style>
