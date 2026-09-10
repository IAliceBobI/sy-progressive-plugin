<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { confirm } from "siyuan";
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
    import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
    import { queryDigestTree, type DigestTreeNode } from "./digestUtils";
    import { writingPoolUnderBook } from "../../sy-tomato-plugin/src/libs/stores";
    import { poolDirPlacement, movePoolDir } from "./writeBook";
    import type { DestroyManager } from "../../sy-tomato-plugin/src/libs/destroyer";

    // □29 摘抄清单大界面：浮层超量（>30 条）时的升级浏览（用户拍板「浮层截断+查看全部」）
    // ——搜索框 + 全量清单（ctime 倒序平铺，与浮层同序同源 queryDigestTree）+ 点击跳
    // 摘抄文档。🔨 完成态弱化显示（读侧保留，与路线图树同口径）。
    // 期D manage 模式（写作书书态浮层「管理素材池」入口）：行首勾选框+底部动作条
    // 「复制入槽/移动入槽」——批量发送数据面在 prog.openBatchSlotMenu（两级书→槽
    // 菜单），本组件只管选择集与刷新；移动=删源素材文档，须 confirm（调用方确认
    // 后再弹槽菜单）。非 manage 行为与 □29 完全一致（点击跳转）。
    let {
        dm,
        bookID,
        freeDoc = false,
        manage = false,
        onJumpDoc,
        onSend,
    }: {
        dm: DestroyManager;
        bookID: string;
        /** free 态复用（群反馈 650189）：空态文案「本书还没有摘抄」→「本文档还没有摘抄」 */
        freeDoc?: boolean;
        /** 期D 池管理模式（写作书）：true 时行点击=勾选、底部动作条出现 */
        manage?: boolean;
        onJumpDoc: (id: string) => void;
        /** 期D 批量发送：digestIDs+模式+锚点（槽菜单弹锚下方）；null=无可入槽目标/
         *  用户关菜单未选（选择集保持）；summary.movedIds=move 模式已删源的篇目 */
        onSend?: (ids: string[], mode: "copy" | "move", anchor: HTMLElement) => Promise<{ ok: number; skipped: number; failed: number; movedIds: string[] } | null>;
    } = $props();

    export function destroy() {
        dm.destroyBy();
    }

    let rootEl = $state<HTMLDivElement>();
    let actionbarEl = $state<HTMLDivElement>();
    let loading = $state(true);
    let flat = $state<DigestTreeNode[]>([]);
    let kw = $state("");
    // 选择集用数组（$state 数组重赋值触发更新——项目无 $state(Set) 先例，响应语义不赌）
    let selected = $state<string[]>([]);
    let busy = $state(false);
    // matfeed □4 池夹位置态（""=无夹不显示搬迁钮）；与设置档不一致才亮钮
    let placement = $state<"" | "book" | "hub">("");
    let list = $derived(
        kw.trim() ? flat.filter(n => n.title.toLowerCase().includes(kw.trim().toLowerCase())) : flat,
    );
    // 搬迁方向：设置=书下且夹在别处 → 搬书下；设置=总夹且夹在书下 → 搬总夹（同构对称）
    let moveUnder = $derived($writingPoolUnderBook);
    let showMoveDir = $derived(manage && ((moveUnder && placement === "hub") || (!moveUnder && placement === "book")));

    // 挂载点是 showDialog 生成的空 div（height:auto），撑满 .b3-dialog__content 定高，
    // 清单才能内部滚动、搜索框不随滚走（ShowAllBooks 同款）
    onMount(() => {
        const p = rootEl?.parentElement;
        if (p) {
            p.style.height = "100%";
            p.style.minHeight = "0";
        }
        reload();
    });
    onDestroy(destroy);

    function reload() {
        queryDigestTree(bookID)
            .then(t => { flat = t.flat; })
            .catch(e => { console.error("digest all dialog failed", e); })
            .finally(() => { loading = false; });
        // □4 池夹位置态并行拉（不阻塞清单渲染）；非 manage 态白拉一次无害（fetch 轻查询）
        if (manage) {
            poolDirPlacement(bookID)
                .then(p => { placement = p; })
                .catch(() => { placement = ""; });
        }
    }

    /** □4 池夹显式搬迁：confirm 后 movePoolDir（保 id 整树搬、IAL 认回链不断）；
     *  幂等（已在目标位置）toast 交代即止。busy 占位同 move 路径（防搬迁与批量
     *  发送并发——两链都动池夹/池文档，串行化最稳） */
    function moveDir() {
        if (busy || !showMoveDir) return;
        // 方向开菜单前快照（reasoning P2-2）：confirm 挂起期改设置，$derived 惰性求值
        // 会读到新档——文案说搬 A 实际搬 B；快照闭包对齐
        const under = moveUnder;
        busy = true;
        confirm("⚠️", tomatoI18n.素材池搬迁确认(under), () => void (async () => {
            try {
                const n = await movePoolDir(bookID, under);
                await siyuan.pushMsg(n > 0 ? tomatoI18n.素材池已搬迁 : tomatoI18n.素材池无需搬迁, 2500);
                placement = under ? "book" : "hub";
            } catch (e) {
                console.error("move pool dir failed", e);
                await siyuan.pushMsg(tomatoI18n.插入素材失败请重试, 2500);
            } finally {
                busy = false;
            }
        })(), () => { busy = false; });
    }

    /** ctime 值 `${bookID}#${毫秒}` → 本地短日期（MM-DD HH:mm，清单行右侧弱化显示） */
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

    function send(mode: "copy" | "move") {
        if (busy || selected.length === 0 || !onSend) return;
        if (mode === "move") {
            // 移动=源素材文档删除（removeDocByID 一发即删），先确认再弹槽菜单；
            // confirm 悬窗期占住 busy（reasoning P2-3：防「复制入槽」趁窗抢 busy，
            // 用户点确定时 doSend 被早退=静默吞掉已确认的破坏性操作）
            busy = true;
            confirm("⚠️", tomatoI18n.移动素材确认(selected.length), () => void doSend(mode), () => { busy = false; });
            return;
        }
        void doSend(mode);
    }

    async function doSend(mode: "copy" | "move") {
        // 不查 busy 早退：move 路径从 confirmCB 进来时 send 已置 busy 占位（P2-3），
        // 重入防护由 send 入口的 busy 检查承担（busy 期间复制/移动/全选钮全 disabled）
        busy = true;
        try {
            const ids = selected;
            const summary = await onSend(ids, mode, actionbarEl ?? rootEl);
            if (summary) {
                if (mode === "move") {
                    // 仅剔已删源的 movedIds（reasoning P1-1：skipped/failed 篇源还在
                    // 池里，全剔=界面与真态背离）。不重查：removeDocByID 后立即重查
                    // queryDigestTree 撞 SQL 索引延迟会闪回幽灵行（「写后立读」坑）；
                    // 列表生命周期短，重开 Dialog 自然重查拿真态
                    flat = flat.filter(n => !summary.movedIds.includes(n.id));
                }
                selected = [];
            }
        } catch (e) {
            // onSend 闭包（listWritingSlotTargets 等）抛错时兜底 toast（reasoning P2-2）
            console.error("digest all send failed", e);
            await siyuan.pushMsg(tomatoI18n.插入素材失败请重试, 2500);
        } finally {
            busy = false;
        }
    }
</script>

<div class="prog-digest-all" data-busy={busy ? "true" : undefined} bind:this={rootEl}>
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
                <button
                    class="da-item"
                    class:da-done={n.done}
                    class:da-checked={manage && selected.includes(n.id)}
                    class:da-manage={manage}
                    title={n.title}
                    onclick={() => (manage ? toggle(n.id) : onJumpDoc(n.id))}
                >
                    {#if manage}
                        <span class="da-check" class:da-on={selected.includes(n.id)}
                            ><svg><use xlink:href="#iconSelect"></use></svg></span
                        >
                    {/if}
                    <span class="da-title">{n.title}</span>
                    <span class="da-date">{fmtDate(n.ctime)}</span>
                </button>
            {/each}
        </div>
    {/if}
    {#if manage}
        <div class="da-actionbar" bind:this={actionbarEl}>
            <span class="da-selected">{busy ? tomatoI18n.发送中 : (selected.length > 0 ? tomatoI18n.已选N篇(selected.length) : "")}</span>
            <button
                class="b3-button b3-button--outline tomato-button"
                disabled={busy || selected.length === 0}
                onclick={() => send("copy")}
            >{tomatoI18n.复制入槽}</button>
            <button
                class="b3-button b3-button--outline tomato-button"
                disabled={busy || selected.length === 0}
                onclick={() => send("move")}
            >{tomatoI18n.移动入槽}</button>
            {#if selected.length > 0}
                <button class="b3-button b3-button--text" disabled={busy} onclick={() => (selected = [])}
                    >{tomatoI18n.取消全选}</button
                >
            {/if}
            <!-- □4 池夹位置与设置档不一致才亮（位置无关语义：改档不静默挪，显式搬） -->
            {#if showMoveDir}
                <button class="b3-button b3-button--text" disabled={busy} onclick={moveDir}
                    >{moveUnder ? tomatoI18n.搬到书下 : tomatoI18n.搬到总夹}</button
                >
            {/if}
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
        &.da-manage {
            // 管理态行点击=勾选，选中行底色常驻（不止 hover 瞬态）。不用
            // --b3-list-select：宿主主题该 token 透明度过低（vision P1-1，暗色
            // 下与未选行无可辨差异），改主色 color-mix 自持、跨主题稳定
            &.da-checked {
                background: color-mix(in srgb, var(--b3-dialog-primary-color, var(--b3-theme-primary)) 14%, transparent);
            }
        }
    }
    // busy（发送中）冻结行交互（□13-3：ids 已捕获无害，但可再勾体验怪）——
    // 根挂 data-busy，行级 pointer-events 收口（本 style 平铺结构，非嵌套）
    .prog-digest-all[data-busy="true"] .da-item {
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
            // 思源 svg use 无显式尺寸默认 0——须给 px（图标族惯例，2000 坑同源）
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
    .da-actionbar {
        flex: none;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 0 2px;
        border-top: 1px solid var(--b3-border-color);
    }
    .da-selected {
        flex: 1;
        min-width: 0;
        font-size: 12px;
        color: var(--prog-muted);
    }
</style>
