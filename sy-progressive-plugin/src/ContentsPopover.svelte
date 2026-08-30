<script lang="ts">
    import { onMount } from "svelte";
    import { fetchBookOutline, type OutlineRow } from "./contentsOutline";
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";

    // □11 目录浮层（contents 钮改道，contents 文档机制退役）：按需拉书大纲标题列表，
    // 点标题 readThisPiece 跳对应分片；不再产 contents-书名 维护型文档（存量不动）。
    // □21 数据源换 getDocOutline（整树 DOM 巨书 25~39s → 0.2s 量级）+ 会话级 TTL 缓存。
    let { bookID, onJump }: { bookID: string; onJump: (blockID: string) => void } = $props();

    let loading = $state(true);
    let rows = $state<OutlineRow[]>([]);

    onMount(async () => {
        try {
            rows = await fetchBookOutline(bookID);
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
    <div class="prog-popover-list">
        {#each rows as r (r.id)}
            <button
                class="prog-popover-item b3-tooltips b3-tooltips__n"
                style="padding-left:{8 + (r.level - 1) * 14}px"
                aria-label={r.text}
                onclick={() => onJump(r.id)}
            >
                <span class="prog-popover-item-text">{cut(r.text)}</span>
            </button>
        {/each}
    </div>
{/if}
