<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
    import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
    import { queryMaterialPool, type MaterialPoolGroup } from "./digestUtils";
    import type { DestroyManager } from "../../sy-tomato-plugin/src/libs/destroyer";
    import { insertDigestIntoPiece } from "./writeBook";

    // 期3 拉式素材选择器（片态「插入素材」弹窗）：全库摘抄池按源书分组 + 搜索；
    // 点击条目=该摘抄全部块转实尾插进当前片（血缘 custom-prog-material 随块落）
    let {
        dm,
        pieceDocID,
        bookID,
    }: {
        dm: DestroyManager;
        pieceDocID: string;
        bookID: string;
    } = $props();

    export function destroy() {
        dm.destroyBy();
    }

    let rootEl = $state<HTMLDivElement>();
    let loading = $state(true);
    let busy = $state(false);
    let groups = $state<MaterialPoolGroup[]>([]);
    let kw = $state("");

    const filtered = $derived.by(() => {
        const k = kw.trim().toLowerCase();
        if (!k) return groups;
        return groups
            .map(g => ({
                ...g,
                items: g.items.filter(it =>
                    it.title.toLowerCase().includes(k) || g.name.toLowerCase().includes(k)),
            }))
            .filter(g => g.items.length > 0);
    });

    onMount(() => {
        const p = rootEl?.parentElement;
        if (p) {
            p.style.height = "100%";
            p.style.minHeight = "0";
        }
        queryMaterialPool()
            .then(g => { groups = g; })
            .catch(e => { console.error("MaterialPicker load failed", e); })
            .finally(() => { loading = false; });
    });
    onDestroy(destroy);

    function fmtDate(ctime: string) {
        const ct = Number(ctime);
        if (!Number.isFinite(ct) || ct <= 0) return "";
        const d = new Date(ct);
        const p = (n: number) => String(n).padStart(2, "0");
        return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    }

    async function pick(digestDocID: string) {
        if (busy) return;
        busy = true;
        try {
            const n = await insertDigestIntoPiece(pieceDocID, bookID, digestDocID);
            if (n > 0) {
                destroy();
                await siyuan.pushMsg(tomatoI18n.已插入N块素材(n), 2500);
            } else {
                await siyuan.pushMsg(tomatoI18n.该摘抄无内容块);
            }
        } catch (e) {
            console.error("MaterialPicker pick failed", e);
            await siyuan.pushMsg(tomatoI18n.插入素材失败请重试);
        } finally {
            busy = false;
        }
    }
</script>

<div class="prog-material-picker" bind:this={rootEl}>
    <div class="mp-bar">
        <input class="b3-text-field" type="search" placeholder={tomatoI18n.搜索摘抄或书名} bind:value={kw} />
        <span class="mp-count">{filtered.reduce((s, g) => s + g.items.length, 0)}</span>
    </div>
    {#if loading}
        <div class="mp-hint">{tomatoI18n.加载中}</div>
    {:else if filtered.length === 0}
        <div class="mp-hint">{groups.length === 0 ? tomatoI18n.还没有任何摘抄 : tomatoI18n.没有匹配的摘抄}</div>
    {:else}
        <div class="mp-list">
            {#each filtered as g (g.key)}
                <div class="mp-group">
                    <div class="mp-group-head" title={g.name}>
                        <span class="mp-group-name">{g.name}</span>
                        <span class="mp-group-count">{g.items.length}</span>
                    </div>
                    {#each g.items as it (it.id)}
                        <button
                            class="mp-item"
                            class:mp-done={it.done}
                            class:mp-busy={busy}
                            title={it.title}
                            onclick={() => pick(it.id)}
                        >
                            <span class="mp-title">{it.title}</span>
                            <span class="mp-date">{fmtDate(it.ctime)}</span>
                        </button>
                    {/each}
                </div>
            {/each}
        </div>
    {/if}
</div>

<style lang="scss">
    // 明暗双轨 --prog-* token（DigestAllDialog 同约定）
    .prog-material-picker {
        display: flex;
        flex-direction: column;
        gap: 8px;
        height: 100%;
        min-height: 0;
        color: var(--prog-title);
        word-break: normal;
    }
    .mp-bar {
        display: flex;
        flex: none;
        align-items: center;
        gap: 8px;
        input {
            flex: 1;
            min-width: 0;
        }
    }
    .mp-count {
        flex: none;
        margin: 0 10px 0 8px;
        font-size: 12px;
        color: var(--prog-muted);
    }
    .mp-hint {
        display: flex;
        flex: 1;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        color: var(--prog-muted);
    }
    .mp-list {
        flex: 1;
        min-height: 0;
        overflow: auto;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .mp-group {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }
    .mp-group-head {
        display: flex;
        align-items: baseline;
        gap: 6px;
        padding: 4px 10px 2px;
        font-size: 12px;
        font-weight: 600;
        color: var(--prog-sub);
    }
    .mp-group-name {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .mp-group-count {
        flex: none;
        color: var(--prog-muted);
        font-weight: 400;
        font-variant-numeric: tabular-nums;
    }
    .mp-item {
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
        &.mp-done {
            opacity: 0.5; // 🔨 完成态弱化（读侧保留同款口径）
        }
        &.mp-busy {
            pointer-events: none;
            opacity: 0.6;
        }
    }
    .mp-title {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .mp-date {
        flex: none;
        font-size: 12px;
        color: var(--prog-muted);
        font-variant-numeric: tabular-nums;
    }
</style>
