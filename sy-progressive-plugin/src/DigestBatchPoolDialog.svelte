<script lang="ts">
    import { onMount } from "svelte";
    import { confirm } from "siyuan";
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
    import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
    import { queryDigestTree } from "./digestUtils";
    import {
        batchOverflowCount, poolRetryKind, POOL_BATCH_CAP,
        type PoolBatchMode, type PoolBatchOutcome,
    } from "./digestBatchPool";

    // progfeatpool 件4 批量整理摘抄选择器（书卡右键/浮条子排两入口 → Progressive.openBatchPoolDialog）：
    // 交互形态全抄 DigestAllDialog 期D manage 模式——行首勾选（selected 数组态，$state(Set)
    // 响应语义不赌）+搜索过滤+全选 toggle+底部动作条；move 破坏性须 confirm。差异面：
    // 清单=来源书的摘抄（queryDigestTree.flat），目标=写作书素材池（onRun 闭包内一级
    // 书菜单），引擎=writeBook.copyDigestsToPool/moveDigestsToPool 批量壳零改动复用。
    let {
        bookID,
        onClose,
        onRun,
    }: {
        bookID: string;
        /** 关 Dialog（Progressive 侧闭包持 dialog 引用） */
        onClose: () => void;
        /** 跑批：选择集+模式 → 一级书菜单选目标书 → 引擎串行壳 → 归一回执。
         *  null=无写作书/用户关菜单未选（选择集保持）。okIds=成功篇 id 集（引擎回执
         *  只有计数；move 剔行要明细，onRun 侧从 ✓ log 行收集）。anchor=菜单弹锚
         *  （动作条下方，openBatchSlotMenu 期D 同款）。onTick=引擎 log 行驱动逐项进度。 */
        onRun: (
            ids: string[], mode: PoolBatchMode, anchor: HTMLElement,
            onTick: (done: number, total: number) => void,
        ) => Promise<(PoolBatchOutcome & { okIds: string[] }) | null>;
    } = $props();

    let rootEl = $state<HTMLDivElement>();
    let actionbarEl = $state<HTMLDivElement>();
    let loading = $state(true);
    let bookName = $state("");
    // {id,title,ctime,done}——DigestTreeNode 形状子集（badge 不采：批量选择语境弱相关，
    // 省一次全清单胶囊 SQL 链）
    let flat = $state<{ id: string; title: string; ctime: string; done: boolean }[]>([]);
    let kw = $state("");
    // 选择集用数组重赋值（DigestAllDialog :49 同款，项目无 $state(Set) 先例）
    let selected = $state<string[]>([]);
    let busy = $state(false);
    let progress = $state({ done: 0, total: 0 });
    // 跑批回执（null=无）；lastIds=本次整批输入（move 幂等重跑装回用）
    let receipt = $state<{ mode: PoolBatchMode; outcome: PoolBatchOutcome; lastIds: string[] } | null>(null);

    // 搜索过滤（DigestAllDialog :54 同款）；清单数据合成层按 id 去重（keyed each 重复
    // key 同批打死兄弟 each 前科防线——queryDigestTree 环提升后 roots/children 理论
    // 不重叠，防线不赌数据）
    let list = $derived.by(() => {
        const seen = new Set<string>();
        const uniq = flat.filter(n => (seen.has(n.id) ? false : (seen.add(n.id), true)));
        const k = kw.trim().toLowerCase();
        return k ? uniq.filter(n => n.title.toLowerCase().includes(k)) : uniq;
    });
    let allSelected = $derived(list.length > 0 && list.every(n => selected.includes(n.id)));
    // 回执重试动作分流（copy=只装失败篇 / move=整批装回，幂等重跑安全；failed=0 不给行）
    let retryKind = $derived(receipt ? poolRetryKind(receipt.mode, receipt.outcome.failed.length) : null);
    let titleOf = $derived.by(() => {
        const m = new Map(flat.map(n => [n.id, n.title]));
        return (id: string) => m.get(id) ?? id;
    });

    onMount(() => {
        // 挂载点撑满 .b3-dialog__content（DigestAllDialog :66 同款），清单内部滚动
        const p = rootEl?.parentElement;
        if (p) {
            p.style.height = "100%";
            p.style.minHeight = "0";
        }
        queryDigestTree(bookID)
            .then(t => {
                bookName = t.bookName;
                flat = t.flat;
            })
            .catch(e => { console.error("digest batch pool load failed", e); })
            .finally(() => { loading = false; });
    });

    /** ctime 值 `${bookID}#${毫秒}` → 本地短日期（DigestAllDialog fmtDate 同款） */
    function fmtDate(ctime: string) {
        const ct = Number(ctime.split("#").pop());
        if (!Number.isFinite(ct) || ct <= 0) return "";
        const d = new Date(ct);
        const p = (n: number) => String(n).padStart(2, "0");
        return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    }

    function toggle(id: string) {
        selected = selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id];
    }

    /** 全选/清选 toggle：勾选当前过滤视图全量（搜索态=选中可见的；全已选中再点=清空） */
    function toggleSelectAll() {
        if (busy || list.length === 0) return;
        const allIds = list.map(n => n.id);
        selected = allIds.every(id => selected.includes(id)) ? [] : allIds;
    }

    function send(mode: PoolBatchMode) {
        if (busy || selected.length === 0) return;
        // >100 UI 侧先拦提示分批（引擎壳 :494/:545 抛错兜底仍在；同口径按去重后计数）
        const overflow = batchOverflowCount(selected);
        if (overflow > 0) {
            void siyuan.pushMsg(tomatoI18n.批量超上限提示(new Set(selected).size, POOL_BATCH_CAP), 3500);
            return;
        }
        if (mode === "move") {
            // 换籍=源摘抄文档迁出本书清单，confirm 后再跑；confirm 悬窗期占住 busy
            // （DigestAllDialog P2-3：防复制钮趁窗抢 busy 吞掉已确认的破坏性操作）
            busy = true;
            confirm("⚠️", tomatoI18n.换籍摘抄确认(selected.length), () => void doSend(mode), () => { busy = false; });
            return;
        }
        void doSend(mode);
    }

    async function doSend(mode: PoolBatchMode) {
        // 不查 busy 早退：move 路径从 confirmCB 进来时 send 已置 busy 占位（P2-3 同款），
        // 重入防护由 send 入口承担
        const ids = [...selected];
        busy = true;
        progress = { done: 0, total: new Set(ids).size };
        try {
            const outcome = await onRun(ids, mode, actionbarEl ?? rootEl, (done, total) => {
                progress = { done, total };
            });
            if (outcome) {
                if (mode === "move") {
                    // 仅剔成功篇（skipped/failed 源还在清单里=与真态一致；不重查——
                    // removeDocs 后立即 SQL 重查撞索引延迟闪回幽灵行，DigestAllDialog
                    // doSend 同纪律；清单生命周期短，重开 Dialog 自然拿真态）
                    const doneSet = new Set(outcome.okIds);
                    flat = flat.filter(n => !doneSet.has(n.id));
                }
                receipt = { mode, outcome, lastIds: ids };
                selected = [];
            }
        } catch (e) {
            // onRun 闭包（引擎壳抛错=超上限兜底/菜单链异常）兜底 toast
            console.error("digest batch pool run failed", e);
            await siyuan.pushMsg(tomatoI18n.操作失败请重试, 2500);
        } finally {
            busy = false;
        }
    }

    /** 回执重试：把重试集装回选择集（不自动跑——目标书菜单重选，给换书重试机会；
     *  用户再点对应动作钮走正常链） */
    function retryLoad() {
        if (!receipt || busy) return;
        selected = retryKind === "failed-only"
            ? receipt.outcome.failed.map(f => f.id)
            : [...receipt.lastIds];
    }
</script>

<div class="prog-digest-batch" data-busy={busy ? "true" : undefined} bind:this={rootEl}>
    <div class="bp-desc">{tomatoI18n.批量整理摘抄说明(POOL_BATCH_CAP)}{bookName ? ` · ${bookName}` : ""}</div>
    <div class="bp-bar">
        <input class="b3-text-field" type="search" placeholder={tomatoI18n.搜索摘抄} bind:value={kw} />
        <span class="bp-count">{kw.trim() ? `${list.length} / ${flat.length}` : flat.length}</span>
    </div>
    {#if loading}
        <div class="bp-hint">{tomatoI18n.加载中}</div>
    {:else if list.length === 0}
        <div class="bp-hint">{flat.length === 0 ? tomatoI18n.本书还没有摘抄 : tomatoI18n.没有匹配的摘抄}</div>
    {:else}
        <div class="bp-list">
            {#each list as n (n.id)}
                <button
                    class="da-item"
                    class:da-done={n.done}
                    class:da-checked={selected.includes(n.id)}
                    title={n.title}
                    onclick={() => toggle(n.id)}
                >
                    <span class="da-check" class:da-on={selected.includes(n.id)}
                        ><svg><use xlink:href="#iconSelect"></use></svg></span
                    >
                    <span class="da-title">{n.title}</span>
                    <span class="da-date">{fmtDate(n.ctime)}</span>
                </button>
            {/each}
        </div>
    {/if}
    {#if receipt}
        <!-- 跑批明细回执（skipped/failed 平铺不藏 hover）：headline+差异化重试行+逐项明细 -->
        <div class="bp-receipt">
            <div class="bp-receipt-head">{receipt.mode === "copy"
                ? tomatoI18n.批量复制入池汇总(receipt.outcome.ok, receipt.outcome.skipped.length, receipt.outcome.failed.length)
                : tomatoI18n.批量换籍汇总(receipt.outcome.ok, receipt.outcome.skipped.length, receipt.outcome.failed.length)}</div>
            {#if retryKind}
                <div class="bp-retry">
                    <span class="bp-retry-hint">{retryKind === "failed-only" ? tomatoI18n.重试只传失败篇提示 : tomatoI18n.换籍整批重跑安全提示}</span>
                    <button class="b3-button b3-button--outline tomato-button bp-btn" onclick={retryLoad}
                        >{retryKind === "failed-only" ? tomatoI18n.重试失败篇 : tomatoI18n.整批重跑}</button>
                </div>
            {/if}
            {#each [...receipt.outcome.skipped, ...receipt.outcome.failed] as it, i (it.id + "-" + i)}
                <div class="bp-receipt-row">{titleOf(it.id)} · {"reason" in it ? it.reason : it.error}</div>
            {/each}
        </div>
    {/if}
    <div class="bp-actionbar" bind:this={actionbarEl}>
        <span class="bp-selected">{busy
            ? tomatoI18n.批量整理进度(progress.done, progress.total)
            : (selected.length > 0 ? tomatoI18n.已选N篇(selected.length) : "")}</span>
        <button
            class="b3-button b3-button--outline tomato-button bp-btn"
            disabled={busy || list.length === 0}
            onclick={toggleSelectAll}
        >{allSelected ? tomatoI18n.取消全选 : tomatoI18n.全选}</button>
        <button
            class="b3-button b3-button--outline tomato-button bp-btn"
            disabled={busy || selected.length === 0}
            onclick={() => send("copy")}
        >{tomatoI18n.批量复制入池}</button>
        <button
            class="b3-button b3-button--outline tomato-button bp-btn"
            disabled={busy || selected.length === 0}
            onclick={() => send("move")}
        >{tomatoI18n.批量换籍}</button>
        <button class="b3-button b3-button--text bp-btn" disabled={busy} onclick={onClose}>{tomatoI18n.关闭}</button>
    </div>
</div>

<style lang="scss">
    // 明暗双轨走 --prog-* token；行样式类名沿用 DigestAllDialog 的 da-*（形态抄先例，
    // scoped 互不冲突）
    .prog-digest-batch {
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-height: min(700px, 70vh);
        min-height: 240px;
        color: var(--prog-title);
        word-break: normal; // 抵消 .b3-dialog__content 的 break-all 继承
    }
    .bp-desc {
        flex: none;
        font-size: 12px;
        color: var(--prog-muted);
    }
    .bp-bar {
        display: flex;
        flex: none;
        align-items: center;
        gap: 8px;
        input {
            flex: 1;
            min-width: 0;
        }
    }
    .bp-count {
        flex: none;
        margin: 0 10px 0 8px;
        font-size: 12px;
        color: var(--prog-muted);
    }
    .bp-hint {
        display: flex;
        flex: 1;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        color: var(--prog-muted);
    }
    .bp-list {
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
            opacity: 0.5; // 🔨 完成态弱化（读侧保留同款口径）
        }
        &.da-checked {
            // 选中行底色常驻（DigestAllDialog da-manage 同款：主色 color-mix 自持，
            // 不用 --b3-list-select——宿主主题该 token 透明度过低暗色不可辨）
            background: color-mix(in srgb, var(--b3-dialog-primary-color, var(--b3-theme-primary)) 14%, transparent);
        }
    }
    // busy（跑批中）冻结行交互（DigestAllDialog 同款：ids 已捕获无害，但可再勾体验怪）
    .prog-digest-batch[data-busy="true"] .da-item {
        pointer-events: none;
    }
    .da-check {
        flex: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 14px;
        height: 14px;
        border: 1px solid var(--b3-border-color);
        border-radius: var(--b3-border-radius);
        svg {
            // 思源 svg use 无显式尺寸默认 0——须给 px（图标族惯例）
            width: 12px;
            height: 12px;
            color: var(--b3-dialog-primary-color, var(--b3-theme-primary));
            opacity: 0;
        }
        &.da-on svg {
            opacity: 1;
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
    .bp-actionbar {
        flex: none;
        display: flex;
        flex-wrap: wrap; /* 窄弹窗折行防溢出（DigestAllDialog 同款） */
        align-items: center;
        gap: 8px;
        padding: 8px 0 2px;
        border-top: 1px solid var(--b3-border-color);
    }
    /* 动作钮圆角对小号 token（b3-button 基础大圆角在矮钮上读成胶囊，tailbatch □9 同款） */
    .bp-actionbar .bp-btn {
        border-radius: var(--b3-border-radius-b);
    }
    .bp-selected {
        flex: 1;
        min-width: 0;
        font-size: 12px;
        color: var(--prog-muted);
    }
    .bp-receipt {
        flex: none;
        display: flex;
        flex-direction: column;
        gap: 2px;
        max-height: 30%;
        overflow: auto;
        padding: 6px 10px;
        border: 1px solid var(--b3-border-color);
        border-radius: var(--b3-border-radius);
        font-size: 12px;
    }
    .bp-receipt-head {
        font-weight: 600;
    }
    .bp-retry {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        color: var(--prog-muted);
    }
    .bp-retry-hint {
        flex: 1;
        min-width: 0;
    }
    .bp-receipt-row {
        color: var(--prog-muted);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
</style>
