<script lang="ts">
    import { onMount } from "svelte";
    import { icon } from "../../sy-tomato-plugin/src/libs/utils";
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
    import { fetchBookCardRows, sortCardRows, type CardRow } from "./cardList";

    // bookcards □2「本书卡清单」浮层（1141 档 □7a 方案 A'，bear 09-11 拍板）：归属跟
    // ctime 标记不跟物理位置——摘抄搬到任何地方清单照收（鸟 09-04 反馈根治）。行点击
    // =官方单文档复习（openTab card doc，单篇子树=它自己的卡）；顶部「整夹一键复习」
    // 兜底钮=原 openBookCards 行为平移（复习重度用户快道，bear 拍板留）。due 全量填完
    // 再渲染（loading 同 DigestTreePopover 形态；大书 ~2s，口径一致优先=拍板取舍）。
    let {
        bookID, onReview, onDeckReview,
    }: {
        bookID: string;
        onReview: (docID: string) => void;
        onDeckReview: () => void;
    } = $props();

    let loading = $state(true);
    let rows = $state<CardRow[]>([]);
    let failed = $state(false);

    onMount(async () => {
        try {
            rows = sortCardRows(await fetchBookCardRows(bookID));
        } catch (e) {
            failed = true;
            console.error("book cards popover failed", e);
        } finally {
            loading = false;
        }
    });

    function cut(s: string, n = 42) {
        return s.length > n ? s.slice(0, n) + "…" : s;
    }
</script>

{#if loading}
    <div class="prog-popover-hint">{tomatoI18n.加载中}</div>
{:else if failed}
    <div class="prog-popover-hint">{tomatoI18n.加载失败请重试}</div>
{:else if rows.length === 0}
    <div class="prog-popover-hint">{tomatoI18n.本书还没有卡片}</div>
{/if}

{#if !loading && !failed}
    {#if rows.length > 0}
        <div class="prog-popover-list">
            {#each rows as r (r.docID)}
                <button
                    class="prog-popover-item"
                    title={r.title}
                    onclick={() => onReview(r.docID)}
                >
                    {@html icon("iconProgScissors", 12)}
                    <span class="prog-popover-item-text">{cut(r.title)}</span>
                    {#if r.hammered}<span class="prog-bookcards-curve">{tomatoI18n.已进曲线}</span>{/if}
                    {#if r.due != null && r.due > 0}<span class="prog-bookcards-due">{r.due > 99 ? "99+" : r.due}</span>{/if}
                </button>
            {/each}
        </div>
    {/if}
    <!-- vision P2-1：长清单钉底——sticky 防兜底钮滚出视野（prog-popover-more-wrap 同款）；
         空态（rows=0）时它上面的 hint 与浮层头部 border 已构成分隔，重复 border-top 去掉
         （vision P2-3 双线） -->
    <div class="prog-popover-more-wrap prog-bookcards-deck-wrap">
        <button
            class="prog-popover-item prog-bookcards-deck"
            class:prog-bookcards-deck--empty={rows.length === 0}
            onclick={() => onDeckReview()}
        >{@html icon("iconProgCard", 12)}{tomatoI18n.整夹一键复习}</button>
    </div>
{/if}
