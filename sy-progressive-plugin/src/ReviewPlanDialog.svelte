<script lang="ts">
    // 可见性期3 □3：复习计划面板（本轮最大件，handoff 拍板：书分组列表+独立 Dialog+入口常驻）。
    // 数据=双源调度全量（scheduleSQLFor think/pdigest）+ 按 PDIGEST_CTIME 归书（bookOfDocFrom
    // 同款）+ 未归书组收尾；组装纯函数在 reviewPlan.ts（单测覆盖）。
    // 行交互：点击跳摘抄文档；到期行直放完成/推迟（applyReviewAction 复用，think/pdigest 键分流，
    // 动作后重载）；行尾 … 子菜单=复访节奏/移除（schedSubmenuItems 复用）。
    // 三待拍板自定（期3 结论记档）：行内动作直放两钮+其余收子菜单 / 桌面 min(760px,92vw)×640 /
    // 不做折叠、到期书置顶。
    import { onMount } from "svelte";
    import { Menu } from "siyuan";
    import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
    import { OpenSyFile2 } from "../../sy-tomato-plugin/src/libs/docUtils";
    import { PDIGEST_CTIME } from "../../sy-tomato-plugin/src/libs/gconst";
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
    import { scheduleSQLFor, mergeDueRows, parseReview, ReviewKey, PdigestReviewKey } from "./reviewQueue";
    import { schedSubmenuItems, applyReviewAction } from "./reviewMenu";
    import { bookOfDocFrom } from "./fleetData";
    import { reviewPlanGroups } from "./reviewPlan";
    import type { PlanGroup, PlanRow } from "./reviewPlan";

    let { plugin }: { plugin: any } = $props();

    let loading = $state(true);
    let groups = $state<PlanGroup[]>([]);

    function rowKey(r: PlanRow): string {
        return r.src === "think" ? ReviewKey : PdigestReviewKey;
    }

    async function load() {
        loading = true;
        try {
            const now = Date.now();
            const [thinkRows, pdigestRows, ctimeRows] = await Promise.all([
                siyuan.sql(scheduleSQLFor(ReviewKey)) as Promise<any[]>,
                siyuan.sql(scheduleSQLFor(PdigestReviewKey)) as Promise<any[]>,
                siyuan.sql(`select block_id, value from attributes where name='${PDIGEST_CTIME}' limit 10000000`) as Promise<any[]>,
            ]);
            const bookOfDoc = bookOfDocFrom(ctimeRows ?? []);
            const bookIDs = [...new Set([...bookOfDoc.values()])];
            const nameRows = bookIDs.length
                ? (await siyuan.sql(`select id, content from blocks where id in (${bookIDs.map(i => `"${i}"`).join(",")}) limit 1000`)) as any[]
                : [];
            const names = new Map((nameRows ?? []).map(r => [r.id, r.content]));
            groups = reviewPlanGroups(mergeDueRows(thinkRows ?? [], pdigestRows ?? []), bookOfDoc, names, now);
        } catch { /* 装饰层静默：查询失败维持空态 */ }
        loading = false;
    }

    function jump(r: PlanRow) {
        if (plugin) OpenSyFile2(plugin, r.root_id);
    }

    async function act(r: PlanRow, action: "complete" | "defer") {
        await applyReviewAction([r.id], action, r.v, rowKey(r));
        // 内核 attributes 索引异步落盘（setBlockAttrs 返回≠SQL 可查），稍候重查免「点了没动」困惑
        await new Promise(res => setTimeout(res, 400));
        await load();
    }

    function openRowMenu(e: MouseEvent, r: PlanRow) {
        const menu = new (Menu as any)("progPlanRowMenu", undefined, true) as Menu;
        for (const it of schedSubmenuItems([r.id], parseReview(r.v), r.v, rowKey(r))) menu.addItem(it);
        setTimeout(() => menu.open({ x: e.clientX, y: e.clientY }), 0);
    }

    onMount(() => { void load(); });
</script>

<div class="prog-plan">
    {#if loading}
        <div class="plan-empty"><span class="empty-sub">…</span></div>
    {:else if groups.length === 0}
        <div class="plan-empty">
            <div class="empty-icon">✧</div>
            <div class="empty-title">{tomatoI18n.计划空态标题}</div>
            <div class="empty-sub">{tomatoI18n.计划空态说明}</div>
        </div>
    {:else}
        {#each groups as g (g.bookID)}
            <div class="plan-group">
                <div class="plan-group-head">
                    <span class="book">{g.bookName}</span>
                    {#if g.dueCount > 0}<span class="due-pill">{tomatoI18n.计划到期N条(g.dueCount)}</span>{/if}
                </div>
                {#each g.rows as r (r.id + r.src)}
                    <div class="plan-row" role="button" tabindex="0"
                        onclick={() => jump(r)}
                        onkeydown={(e) => e.key === "Enter" && jump(r)}>
                        <svg class="row-icon" aria-hidden="true"><use xlink:href="#{r.icon}" /></svg>
                        <span class="row-content" title={r.content}>{r.content || r.root_id}</span>
                        <span class="row-mode">{r.mode}</span>
                        <span class="row-date" class:overdue={r.due}>{r.date} · {r.rel}</span>
                        {#if r.due}
                            <button class="row-act" onclick={(e) => { e.stopPropagation(); void act(r, "complete"); }}>{tomatoI18n.计划完成}</button>
                            <button class="row-act" onclick={(e) => { e.stopPropagation(); void act(r, "defer"); }}>{tomatoI18n.计划推迟}</button>
                        {/if}
                        <button class="row-more" aria-label={tomatoI18n.复访节奏}
                            onclick={(e) => { e.stopPropagation(); openRowMenu(e, r); }}>…</button>
                    </div>
                {/each}
            </div>
        {/each}
    {/if}
</div>

<style lang="scss">
.prog-plan {
    height: 100%;
    overflow: auto;
    padding: 12px 16px 16px;
    box-sizing: border-box;
}
.plan-empty {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    text-align: center;

    .empty-icon { font-size: 34px; opacity: 0.5; }
    .empty-title { font-size: 15px; font-weight: 600; }
    .empty-sub { font-size: 12px; opacity: 0.62; max-width: 300px; line-height: 1.6; }
}
.plan-group { margin-bottom: 14px; }
.plan-group-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 2px;
    font-size: 13px;
    font-weight: 600;
    opacity: 0.85;

    .due-pill {
        font-size: 11px;
        font-weight: 400;
        padding: 0 6px;
        border-radius: 8px;
        background: var(--b3-theme-primary-lighter);
        color: var(--b3-theme-primary);
    }
}
.plan-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 4px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;

    &:hover { background: var(--b3-list-hover); }

    .row-icon { flex-shrink: 0; width: 14px; height: 14px; color: var(--b3-theme-primary); }
    .row-content {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .row-mode { flex-shrink: 0; font-size: 11px; opacity: 0.62; }
    .row-date {
        flex-shrink: 0;
        font-size: 11px;
        opacity: 0.72;
        font-variant-numeric: tabular-nums;

        &.overdue { color: var(--b3-theme-error); opacity: 1; }
    }
    .row-act, .row-more {
        flex-shrink: 0;
        border: none;
        background: transparent;
        color: var(--b3-theme-primary);
        cursor: pointer;
        font-size: 11px;
        padding: 2px 6px;
        border-radius: 3px;

        &:hover { background: var(--b3-theme-primary-lightest); }
    }
    .row-more { color: inherit; opacity: 0.5; }
}
</style>
