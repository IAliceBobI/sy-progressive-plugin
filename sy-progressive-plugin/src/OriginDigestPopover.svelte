<script lang="ts">
    import { onMount } from "svelte";
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
    import { queryDigestTree, type DigestTreeNode } from "./digestUtils";
    import { progStorage } from "./ProgressiveStorage";

    // □11 原文侧追溯浮层（书态 traceUp 钮，□8 用户点名；□29 片态复用）：与路线图浮层
    // 互为镜像——那边 digest 态看全书摘抄树，这边书/片态看本文档摘抄清单（ctime 倒序
    // 平铺）+ 当前块所属分片（saveIndex 区间定位，点击跳片）。
    // □29 量级治理：浮层只列前 PREVIEW_N 条快览，超出给「查看全部 N 条」升级大 Dialog
    // （搜索+全量，onShowAll 由浮条层接线）——此前无上限全量平铺，千条也挤在 70% 高
    // 滚动区里浏览体验差（用户痛点）。
    const PREVIEW_N = 30;
    let {
        bookID,
        blockID,
        point,
        freeDoc = false,
        onJumpDoc,
        onJumpPiece,
        onShowAll,
    }: {
        bookID: string;
        /** 光标/选中块（书态=书原文块 id，块 id 本身即索引键；可空） */
        blockID?: string;
        /** □29 片态直供分片真值（浮条出场时从 mark 解析的 $point）——有值时优先，
         *  免扫索引也免「选中笔记块/嵌套块反查落空」误报（reasoning P1-1） */
        point?: number;
        /** free 态复用（群反馈 650189）：普通文档无书，清单文案「本书摘抄」→「关联摘抄」；
         *  bookID 由浮条层传 $noteID（free 摘抄 ctime 自指 docID，queryDigestTree 直查） */
        freeDoc?: boolean;
        onJumpDoc: (id: string) => void;
        onJumpPiece: (point: number) => void;
        /** □29 清单超 PREVIEW_N 条时的升级入口（开大 Dialog） */
        onShowAll?: () => void;
    } = $props();

    let loading = $state(true);
    let flat = $state<DigestTreeNode[]>([]);
    let piecePoint = $state<number | null>(null);
    let preview = $derived(flat.slice(0, PREVIEW_N));
    const showLocator = $derived(point != null || !!blockID);
    const listLabel = $derived(freeDoc ? tomatoI18n.本文档的关联摘抄 : tomatoI18n.本书摘抄清单);
    const emptyHint = $derived(freeDoc ? tomatoI18n.本文档还没有摘抄 : tomatoI18n.本书还没有摘抄);

    onMount(async () => {
        try {
            const treeP = queryDigestTree(bookID);
            if (point != null) {
                piecePoint = point;
            } else if (blockID) {
                const idx = await progStorage.loadBookIndexIfNeeded(bookID);
                outer: for (let i = 0; i < idx.length; i++) {
                    for (const id of idx[i]) {
                        if (id === blockID) {
                            piecePoint = i;
                            break outer;
                        }
                    }
                }
            }
            flat = (await treeP).flat;
        } catch (e) {
            console.error("origin digest popover failed", e);
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
{:else}
    {#if showLocator}
        <div class="prog-popover-group">{tomatoI18n.当前块所在分片}</div>
        {#if piecePoint != null}
            <div class="prog-popover-list">
                <button class="prog-popover-item" onclick={() => onJumpPiece(piecePoint!)}>
                    <span class="prog-popover-chip">{tomatoI18n.第N片((piecePoint ?? 0) + 1)}</span>
                    <span class="prog-popover-item-text">{tomatoI18n.跳到该分片}</span>
                </button>
            </div>
        {:else}
            <div class="prog-popover-hint">{tomatoI18n.该块不在分片索引中}</div>
        {/if}
    {/if}

    <div class="prog-popover-group">{listLabel}</div>
    {#if flat.length > 0}
        <div class="prog-popover-list">
            {#each preview as n (n.id)}
                <button class="prog-popover-item" title={n.title} onclick={() => onJumpDoc(n.id)}>
                    <span class="prog-popover-item-text">{cut(n.title)}</span>
                </button>
            {/each}
        </div>
        {#if flat.length > PREVIEW_N && onShowAll}
            <div class="prog-popover-list prog-popover-more-wrap">
                <button class="prog-popover-item" onclick={() => onShowAll()}>
                    <span class="prog-popover-item-text">{tomatoI18n.查看全部N条(flat.length)}</span>
                </button>
            </div>
        {/if}
    {:else}
        <div class="prog-popover-hint">{emptyHint}</div>
    {/if}
{/if}
