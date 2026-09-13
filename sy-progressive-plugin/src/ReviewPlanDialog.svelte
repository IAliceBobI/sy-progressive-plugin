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
    import { reviewPlanGroups, weekStrip, stripDayIdx } from "./reviewPlan";
    import type { PlanGroup, PlanRow } from "./reviewPlan";
    import { getReadCurvePlanRows, applyReadCardAction } from "./readCurve";
    import type { ReadCurvePlanRow } from "./readCurve";
    import { openReadCardMenu } from "./readCardMenu";
    import { latestVisitNotePreviews } from "./visitNoteQuery";
    import { progStorage } from "./ProgressiveStorage";

    let { plugin }: { plugin: any } = $props();

    let loading = $state(true);
    let groups = $state<PlanGroup[]>([]);
    // □4 阅读曲线行（活跃+毕业档案）与搜索/毕业折叠态
    let rcActive = $state<ReadCurvePlanRow[]>([]);
    let rcGraduated = $state<ReadCurvePlanRow[]>([]);
    let query = $state("");
    let gradOpen = $state(false);
    // □4 回访留言前半句（对象文档→预览；整体重赋值触发更新——Svelte 5 Map 深代理忌讳）
    let notePrev = $state<Map<string, string>>(new Map());
    // □5 日历投影：条带与过滤共用 now 锚（load 时定格，格界不随渲染时刻漂移）
    let nowMs = $state(0);
    // 选中格（null=全部；再点同格取消）。0=今天格含逾期（「今日清单」口径）
    let stripDay = $state<number | null>(null);

    function rowKey(r: PlanRow): string {
        return r.src === "think" ? ReviewKey : PdigestReviewKey;
    }

    async function load() {
        loading = true;
        try {
            const now = Date.now();
            nowMs = now;
            const [thinkRows, pdigestRows, ctimeRows, rcRows] = await Promise.all([
                siyuan.sql(scheduleSQLFor(ReviewKey)) as Promise<any[]>,
                siyuan.sql(scheduleSQLFor(PdigestReviewKey)) as Promise<any[]>,
                siyuan.sql(`select block_id, value from attributes where name='${PDIGEST_CTIME}' limit 10000000`) as Promise<any[]>,
                getReadCurvePlanRows(),
            ]);
            const bookOfDoc = bookOfDocFrom(ctimeRows ?? []);
            const bookIDs = [...new Set([...bookOfDoc.values()])];
            const nameRows = bookIDs.length
                ? (await siyuan.sql(`select id, content from blocks where id in (${bookIDs.map(i => `"${i}"`).join(",")}) limit 1000`)) as any[]
                : [];
            const names = new Map((nameRows ?? []).map(r => [r.id, r.content]));
            groups = reviewPlanGroups(mergeDueRows(thinkRows ?? [], pdigestRows ?? []), bookOfDoc, names, now);
            rcActive = rcRows.active;
            rcGraduated = rcRows.graduated;
            // □4 留言前半句批查（sched 行按 root_id、阅读卡行按 blockID=宿主文档）
            const docIDs = [
                ...(groups ?? []).flatMap(g => g.rows.map(r => r.root_id)),
                ...rcActive.map(r => r.blockID),
                ...rcGraduated.map(r => r.blockID),
            ];
            notePrev = await latestVisitNotePreviews(docIDs);
        } catch { /* 装饰层静默：查询失败维持空态 */ }
        loading = false;
    }

    function jump(r: PlanRow) {
        if (plugin) OpenSyFile2(plugin, r.root_id);
    }

    function jumpRC(r: ReadCurvePlanRow) {
        if (plugin) OpenSyFile2(plugin, r.blockID);
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

    function openRCRowMenu(e: MouseEvent, r: ReadCurvePlanRow) {
        e.stopPropagation();
        void openReadCardMenu(r.blockID, { clientX: e.clientX, clientY: e.clientY }, () => void load());
    }

    /** 毕业档案批量恢复（□4：面板恢复三通道之一；静默批跑，末尾一次性 toast） */
    async function batchRevive() {
        const rows = gradFiltered;
        let done = 0;
        for (const r of rows) if (await applyReadCardAction(r.blockID, "again", 0, { silent: true })) done++;
        try { await siyuan.pushMsg(done > 1 ? tomatoI18n.已恢复N张阅读卡(done) : done === 1 ? tomatoI18n.已再来一轮 : tomatoI18n.操作未生效, 2500); } catch { /* noop */ }
        await load();
    }

    // 搜索过滤（跨全部段：复访/阅读推送/毕业）；□5 叠加条带选格过滤（同 stripDayIdx 口径=条带数字与列表一致）
    const q = $derived(query.trim().toLowerCase());
    const match = (content: string | undefined) => !q || String(content ?? "").toLowerCase().includes(q);
    const dueAtOf = (v: string): number | null => {
        const s = parseReview(v);
        return s && s.mode !== "done" ? s.next : null;
    };
    const dayMatch = (t: number | null | undefined) => stripDay == null || stripDayIdx(t, nowMs) === stripDay;
    const strip = $derived(nowMs ? weekStrip([
        ...groups.flatMap(g => g.rows.map(r => dueAtOf(r.v))),
        ...rcActive.map(r => r.dueMs),
    ], nowMs) : []);
    const shownGroups = $derived(groups
        .map(g => ({ ...g, rows: g.rows.filter(r => match(r.content) && dayMatch(dueAtOf(r.v))) }))
        .filter(g => g.rows.length > 0));
    const rcGroups = $derived.by(() => {
        const infos = progStorage.booksInfos();
        const map = new Map<string, ReadCurvePlanRow[]>();
        for (const r of rcActive.filter(r => match(r.content) && dayMatch(r.dueMs))) {
            const k = r.bookID || "";
            if (!map.has(k)) map.set(k, []);
            map.get(k)!.push(r);
        }
        return [...map.entries()].map(([bookID, rows]) => ({
            bookID,
            name: bookID ? (infos[bookID]?.bookName ?? bookID) : tomatoI18n.阅读点与文档卡,
            rows,
        }));
    });
    // 毕业档案无调度不落任何一格：选格期间隐藏（搜索态照常显示）
    const gradFiltered = $derived(stripDay == null ? rcGraduated.filter(r => match(r.content)) : []);
    const hasAny = $derived(shownGroups.length > 0 || rcGroups.length > 0 || gradFiltered.length > 0);

    onMount(() => { void load(); });
</script>

<div class="prog-plan">
    <div class="plan-toolbar">
        <svg class="toolbar-icon" aria-hidden="true"><use xlink:href="#iconSearch" /></svg>
        <input class="b3-text-field" type="text" placeholder={tomatoI18n.计划搜索占位} bind:value={query} />
    </div>
    {#if !loading && (groups.length > 0 || rcActive.length > 0)}
        <div class="plan-strip" role="group" aria-label={tomatoI18n.未来N天复习量(strip.length || 7)}>
            {#each strip as c, i}
                <button class="strip-cell ol{c.overload}" class:sel={stripDay === i}
                    aria-pressed={stripDay === i}
                    onclick={() => { stripDay = stripDay === i ? null : i; }}>
                    <span class="c-top"><span class="c-label">{c.label}</span><span class="c-sub">{c.sub}</span></span>
                    <span class="c-count">{c.count}</span>
                    <span class="c-min">{c.count ? tomatoI18n.约N分钟(c.minutes) : "—"}</span>
                </button>
            {/each}
        </div>
    {/if}
    {#if loading}
        <div class="plan-empty"><span class="empty-sub">…</span></div>
    {:else if !hasAny}
        <div class="plan-empty">
            {#if q}
                <div class="empty-icon">✧</div>
                <div class="empty-title">{tomatoI18n.没有匹配的条目(query.trim())}</div>
            {:else if stripDay != null}
                <!-- 选格后空≠没有计划（review P1-2）：点 0 计数格/当天行清空都到这——
                     明示该日无到期，勿走「还没有任何复习计划」事实错误文案 -->
                <div class="empty-icon">✧</div>
                <div class="empty-title">{tomatoI18n.该日无到期}</div>
            {:else}
                <div class="empty-icon">✧</div>
                <div class="empty-title">{tomatoI18n.计划空态标题}</div>
                <div class="empty-sub">{tomatoI18n.计划空态说明}</div>
            {/if}
        </div>
    {:else}
        {#each shownGroups as g (g.bookID)}
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
                        {#if notePrev.get(r.root_id)}<span class="row-note" title={notePrev.get(r.root_id)}>{tomatoI18n.留言()}·{notePrev.get(r.root_id)}</span>{/if}
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
        {#each rcGroups as g (g.bookID)}
            <div class="plan-group">
                <div class="plan-group-head">
                    <span class="book">{g.name}</span>
                </div>
                {#each g.rows as r (r.blockID)}
                    <div class="plan-row" role="button" tabindex="0"
                        onclick={() => jumpRC(r)}
                        onkeydown={(e) => e.key === "Enter" && jumpRC(r)}>
                        <svg class="row-icon" aria-hidden="true"><use xlink:href="#iconRiffCard" /></svg>
                        <span class="row-content" title={r.content}>{r.content || r.blockID}</span>
                        {#if notePrev.get(r.blockID)}<span class="row-note" title={notePrev.get(r.blockID)}>{tomatoI18n.留言()}·{notePrev.get(r.blockID)}</span>{/if}
                        <span class="row-mode">{r.status}</span>
                        <button class="row-more" aria-label="阅读推送"
                            onclick={(e) => openRCRowMenu(e, r)}>…</button>
                    </div>
                {/each}
            </div>
        {/each}
        {#if gradFiltered.length > 0}
            <div class="plan-group grad">
                <div class="plan-group-head">
                    <button class="grad-toggle" onclick={() => gradOpen = !gradOpen}
                        aria-label="毕业分组展开/折叠">{gradOpen ? "▾" : "▸"} {tomatoI18n.已毕业N(gradFiltered.length)}</button>
                    {#if gradOpen}
                        <button class="row-act" onclick={() => void batchRevive()}>{tomatoI18n.全部加入推送}</button>
                    {/if}
                </div>
                {#if gradOpen}
                    {#each gradFiltered as r (r.blockID)}
                        <div class="plan-row grad-row" role="button" tabindex="0"
                            onclick={() => jumpRC(r)}
                            onkeydown={(e) => e.key === "Enter" && jumpRC(r)}>
                            <svg class="row-icon" aria-hidden="true"><use xlink:href="#iconRiffCard" /></svg>
                            <span class="row-content" title={r.content}>{r.content || r.blockID}</span>
                            <span class="row-mode">{r.status}</span>
                            <button class="row-act" onclick={(e) => { e.stopPropagation(); void applyReadCardAction(r.blockID, "again").then(() => load()); }}>{tomatoI18n.加入推送}</button>
                        </div>
                    {/each}
                {/if}
            </div>
        {/if}
    {/if}
</div>

<style lang="scss">
.prog-plan {
    height: 100%;
    overflow: auto;
    padding: 12px 16px 16px;
    box-sizing: border-box;
}
.plan-toolbar {
    position: sticky;
    top: -12px;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 6px;
    margin: -12px -16px 10px;
    padding: 8px 16px;
    background: var(--b3-theme-background);
    border-bottom: 1px solid var(--b3-border-color, var(--b3-theme-surface-lighter));

    .toolbar-icon {
        flex: none;
        width: 14px;
        height: 14px;
        opacity: 0.55;
        color: var(--b3-theme-on-surface);
    }
    .b3-text-field {
        flex: 1;
        min-width: 0;
        height: 28px;
        font-size: 12px;
    }
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
/* □5 日历投影条带：7 格等宽平铺，超载三档标色（ol0 空/ol1 正常/ol2 轻/ol3 重）。
   warning 无官方文档保证（AddBook 同款先例）=带 hex fallback */
.plan-strip {
    display: flex;
    gap: 6px;
    margin-bottom: 10px;

    .strip-cell {
        flex: 1;
        min-width: 0;
        overflow: hidden; /* 窄面板 nowrap 文案渗格兜底（宽屏无副作用） */
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 3px;
        padding: 7px 2px 6px;
        border-radius: 6px;
        border: 1px solid var(--b3-border-color, rgba(128, 128, 128, 0.2));
        background: var(--b3-theme-background);
        cursor: pointer;
        font: inherit;
        color: inherit;

        &:hover { background: var(--b3-list-hover); }
        &:focus-visible { outline: 2px solid var(--b3-theme-primary); outline-offset: 1px; }
        &.sel {
            border-color: var(--b3-theme-primary);
            background: var(--b3-theme-primary-lightest);
            /* 轮廓加重：选中与 ol1 共用 primary 色系时靠边框+内描边双重编码（vision R1） */
            box-shadow: 0 0 0 1px var(--b3-theme-primary) inset;
        }

        .c-top {
            display: flex;
            gap: 4px;
            align-items: baseline;
            justify-content: center;
            min-width: 0;
            white-space: nowrap;
        }
        .c-label { font-size: 11px; font-weight: 600; opacity: 0.75; }
        .c-sub { font-size: 11px; opacity: 0.62; font-variant-numeric: tabular-nums; }
        .c-count { font-size: 18px; font-weight: 700; line-height: 1.1; font-variant-numeric: tabular-nums; }
        .c-min { font-size: 11px; opacity: 0.55; white-space: nowrap; }

        &.ol0 .c-count { opacity: 0.38; font-weight: 500; }
        &.ol1 .c-count { color: var(--b3-theme-primary); }
        &.ol2 .c-count { color: var(--b3-theme-warning, #d25f00); }
        &.ol3 .c-count { color: var(--b3-theme-error); }
    }
}
.plan-group { margin-bottom: 14px; }
.plan-group.grad {
    .grad-toggle {
        border: none;
        background: transparent;
        color: inherit;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        padding: 0;
        display: inline-flex;
        align-items: center;
        gap: 4px;
    }
    .grad-row .row-icon { color: var(--b3-theme-on-surface); opacity: 0.55; }
    .grad-row .row-mode { opacity: 0.55; }
}
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
    /* white-space:nowrap（□6 vision P2-4）：状态行尾句含空格软换行点，极窄容器内
       折行会撑高行——收缩继续由 row-content（flex:1+ellipsis）承担 */
    .row-mode { flex-shrink: 0; font-size: 11px; opacity: 0.62; white-space: nowrap; }
    /* □4 留言前半句：内容列后次级信息（青色弱化与 row-mode 区分层级）。
        max-width 防 P1（vision R1）：row-content 基份 0 不参与收缩，超长留言会把
        标题列挤到 0 宽——留言列封顶 40%，截断仍走 ellipsis+title 全文 */
    .row-note {
        flex-shrink: 1;
        max-width: 40%;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 11px;
        color: var(--b3-theme-primary);
        opacity: 0.78;
    }
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
