<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
    import { queryDigestTree, type DigestTreeNode } from "./digestUtils";
    import type { DestroyManager } from "../../sy-tomato-plugin/src/libs/destroyer";

    // □29 摘抄清单大界面：浮层超量（>30 条）时的升级浏览（用户拍板「浮层截断+查看全部」）
    // ——搜索框 + 全量清单（ctime 倒序平铺，与浮层同序同源 queryDigestTree）+ 点击跳
    // 摘抄文档。🔨 完成态弱化显示（读侧保留，与路线图树同口径）。
    let {
        dm,
        bookID,
        freeDoc = false,
        onJumpDoc,
    }: {
        dm: DestroyManager;
        bookID: string;
        /** free 态复用（群反馈 650189）：空态文案「本书还没有摘抄」→「本文档还没有摘抄」 */
        freeDoc?: boolean;
        onJumpDoc: (id: string) => void;
    } = $props();

    export function destroy() {
        dm.destroyBy();
    }

    let rootEl = $state<HTMLDivElement>();
    let loading = $state(true);
    let flat = $state<DigestTreeNode[]>([]);
    let kw = $state("");
    let list = $derived(
        kw.trim() ? flat.filter(n => n.title.toLowerCase().includes(kw.trim().toLowerCase())) : flat,
    );

    // 挂载点是 showDialog 生成的空 div（height:auto），撑满 .b3-dialog__content 定高，
    // 清单才能内部滚动、搜索框不随滚走（ShowAllBooks 同款）
    onMount(() => {
        const p = rootEl?.parentElement;
        if (p) {
            p.style.height = "100%";
            p.style.minHeight = "0";
        }
        queryDigestTree(bookID)
            .then(t => { flat = t.flat; })
            .catch(e => { console.error("digest all dialog failed", e); })
            .finally(() => { loading = false; });
    });
    onDestroy(destroy);

    /** ctime 值 `${bookID}#${毫秒}` → 本地短日期（MM-DD HH:mm，清单行右侧弱化显示） */
    function fmtDate(ctime: string) {
        const ct = Number(ctime.split("#").pop());
        if (!Number.isFinite(ct) || ct <= 0) return "";
        const d = new Date(ct);
        const p = (n: number) => String(n).padStart(2, "0");
        return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    }
</script>

<div class="prog-digest-all" bind:this={rootEl}>
    <div class="da-bar">
        <input class="b3-text-field" type="search" placeholder={tomatoI18n.搜索摘抄} bind:value={kw} />
        <span class="da-count">{kw.trim() ? `${list.length} / ${flat.length}` : flat.length}</span>
    </div>
    {#if loading}
        <div class="da-hint">{tomatoI18n.加载中}</div>
    {:else if list.length === 0}
        <div class="da-hint">{flat.length === 0 ? (freeDoc ? tomatoI18n.本文档还没有摘抄 : tomatoI18n.本书还没有摘抄) : tomatoI18n.没有匹配的摘抄}</div>
    {:else}
        <div class="da-list">
            {#each list as n (n.id)}
                <button class="da-item" class:da-done={n.done} title={n.title} onclick={() => onJumpDoc(n.id)}>
                    <span class="da-title">{n.title}</span>
                    <span class="da-date">{fmtDate(n.ctime)}</span>
                </button>
            {/each}
        </div>
    {/if}
</div>

<style lang="scss">
    // 明暗双轨走 --prog-* token（ShowAllBooks 同约定），交互色借 b3 列表层
    .prog-digest-all {
        display: flex;
        flex-direction: column;
        gap: 8px;
        height: 100%;
        min-height: 0;
        color: var(--prog-title);
        word-break: normal; // 抵消 .b3-dialog__content 的 break-all 继承
    }
    .da-bar {
        display: flex;
        flex: none;
        align-items: center;
        gap: 8px;
        input {
            flex: 1;
            min-width: 0;
        }
    }
    .da-count {
        font-size: 12px;
        color: var(--prog-muted);
        flex: none;
        // 右缘对齐列表时间戳的 10px 家族边距（vision 终审 P2：裸贴容器右边线仅 2-4px）
        margin: 0 10px 0 8px;
    }
    .da-hint {
        display: flex;
        flex: 1;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        color: var(--prog-muted);
    }
    .da-list {
        flex: 1;
        min-height: 0;
        overflow: auto;
        display: flex;
        flex-direction: column;
        gap: 2px;
    }
    .da-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 6px 10px;
        border: none;
        background: transparent;
        border-radius: var(--b3-border-radius);
        cursor: pointer;
        text-align: left;
        color: var(--prog-title);
        &:hover {
            background: var(--b3-list-hover);
        }
        &.da-done {
            opacity: 0.5; // 🔨 完成态弱化（数据在，仅视觉弱显）
        }
    }
    .da-title {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .da-date {
        flex: none;
        font-size: 12px;
        color: var(--prog-muted);
        font-variant-numeric: tabular-nums;
    }
</style>
