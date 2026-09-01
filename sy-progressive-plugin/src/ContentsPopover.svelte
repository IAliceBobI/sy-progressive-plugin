<script lang="ts">
    import { onMount, tick } from "svelte";
    import { fetchBookOutline, type OutlineRow } from "./contentsOutline";
    import { outlineHighlightRows } from "./contentsJump";
    import { progStorage } from "./ProgressiveStorage";
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";

    // □11 目录浮层（contents 钮改道，contents 文档机制退役）：按需拉书大纲标题列表，
    // 点标题跳目标——书态=跳对应分片 / 片态=跳原文标题位置（分派在 openContentsPopover）。
    // □21 数据源换 getDocOutline（整树 DOM 巨书 25~39s → 0.2s 量级）+ 会话级 TTL 缓存。
    // □1（2026-09-01）片态目录当前位置高亮：point 非空时按分片索引算高亮行（当前片含
    // 的大纲标题全亮，纯内容片回落起点前最近标题——outlineHighlightRows）并滚入视野。
    let {
        bookID,
        onJump,
        point = null,
    }: { bookID: string; onJump: (blockID: string) => void; point?: number | null } = $props();

    let loading = $state(true);
    let rows = $state<OutlineRow[]>([]);
    let currentIds = $state<Set<string>>(new Set());
    let listEl = $state<HTMLElement>();

    onMount(async () => {
        try {
            rows = await fetchBookOutline(bookID);
            // 列表先上屏（review P1-1：scrollIntoView 必须在列表渲染之后——loading 先行
            // 置 false，索引往返不阻塞浏览；finally 兜底 catch 路径）
            loading = false;
            if (point != null) {
                const idx = await progStorage.loadBookIndexIfNeeded(bookID);
                currentIds = outlineHighlightRows(rows, idx ?? [], point);
                if (currentIds.size > 0) {
                    await tick();
                    // 长大纲（巨书 394 行）当前位置多在视窗外，滚入视野才算「标记出来」
                    listEl?.querySelector(".prog-popover-item-current")
                        ?.scrollIntoView({ block: "nearest" });
                }
            }
        } catch (e) {
            console.error("contents popover failed", e);
        } finally {
            loading = false;
        }
    });

    function cut(s: string, n = 40) {
        // 按码位迭代防劈代理对（标题含 emoji 时 UTF-16 截断会产生乱码，vision review P2）
        const chars = [...s];
        return chars.length > n ? chars.slice(0, n).join("") + "…" : s;
    }
</script>

{#if loading}
    <div class="prog-popover-hint">{tomatoI18n.加载中}</div>
{:else if rows.length === 0}
    <div class="prog-popover-hint">{tomatoI18n.本书没有大纲标题}</div>
{:else}
    <div class="prog-popover-list" bind:this={listEl}>
        {#each rows as r (r.id)}
            <button
                class="prog-popover-item b3-tooltips b3-tooltips__n"
                class:prog-popover-item-current={currentIds.has(r.id)}
                style="padding-left:{8 + (r.level - 1) * 14}px"
                aria-label={r.text}
                aria-current={currentIds.has(r.id) ? "true" : undefined}
                onclick={() => onJump(r.id)}
            >
                <span class="prog-popover-item-text">{cut(r.text)}</span>
            </button>
        {/each}
    </div>
{/if}
