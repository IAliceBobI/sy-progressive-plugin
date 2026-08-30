<script lang="ts">
    import { onMount } from "svelte";
    import { icon } from "../../sy-tomato-plugin/src/libs/utils";
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
    import { queryDigestTree, queryBookComments, type DigestTreeNode, type BookCommentItem } from "./digestUtils";

    // □11 路线图浮层（digest 态 tree 钮，trace 文档机制的「拉」版）：按需查属性表画
    // 书的全摘抄树（支路→主干缩进，ctime 倒序）+ ✅7 增量「本书批注」分组（选区/块
    // 批注块，渲染归 tomato 全局）。滚动流形态（□8 愿景「滚动看所有摘抄」）。
    let { bookID, onJump }: { bookID: string; onJump: (id: string) => void } = $props();

    let loading = $state(true);
    let roots = $state<DigestTreeNode[]>([]);
    let comments = $state<BookCommentItem[]>([]);

    // 树 DFS 扁平化（带深度）——渲染层只铺一层 each，缩进用 depth 计算
    let rows = $state<{ node: DigestTreeNode; depth: number }[]>([]);
    $effect(() => {
        const out: { node: DigestTreeNode; depth: number }[] = [];
        const walk = (list: DigestTreeNode[], depth: number) => {
            for (const n of list) {
                out.push({ node: n, depth });
                walk(n.children, depth + 1);
            }
        };
        walk(roots, 0);
        rows = out;
    });

    onMount(async () => {
        try {
            const [tree, cs] = await Promise.all([queryDigestTree(bookID), queryBookComments(bookID)]);
            roots = tree.roots;
            comments = cs;
        } catch (e) {
            console.error("digest tree popover failed", e);
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
{:else if rows.length === 0 && comments.length === 0}
    <div class="prog-popover-hint">{tomatoI18n.本书还没有摘抄}</div>
{/if}

{#if rows.length > 0}
    <div class="prog-popover-group">{tomatoI18n.摘抄树}</div>
    <div class="prog-popover-list">
        {#each rows as r (r.node.id)}
            <button
                class="prog-popover-item"
                class:prog-popover-item--done={r.node.done}
                style="padding-left:{8 + r.depth * 16}px"
                title={r.node.title}
                onclick={() => onJump(r.node.id)}
            >
                {#if r.depth > 0}<span class="prog-popover-branch">└</span>{/if}
                {#if r.node.done}<span class="prog-popover-donemark">🔨</span>{/if}
                <span class="prog-popover-item-text">{cut(r.node.title)}</span>
            </button>
        {/each}
    </div>
{/if}

{#if comments.length > 0}
    <div class="prog-popover-group">{tomatoI18n.本书批注}</div>
    <div class="prog-popover-list">
        {#each comments as c (c.blockID)}
            <button
                class="prog-popover-item"
                title={c.content}
                onclick={() => onJump(c.blockID)}
            >
                {@html icon(c.range ? "iconProgWord" : "iconProgThink", 12)}
                <span class="prog-popover-item-text">{cut(c.content)}</span>
            </button>
        {/each}
    </div>
{/if}
