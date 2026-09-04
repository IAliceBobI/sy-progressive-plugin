<script lang="ts">
    // v5 □6 左 Dock 舰队总览（docs/prog-v5-visual-design.md §3）：今日状态区（已读大字+
    // 档位胶囊=□3 归 □6 的档位设置 UI）+ 近14天热力横条 + 书卡列表（进度/今日点/三徽章，
    // 点击断点续读）+ 主按钮 + 底部副操作。空状态诚实：热力全空淡格、主按钮变加书。
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
    import type { FleetSummary, FleetBook } from "./fleetData";
    import type { FleetActions } from "./fleet";
    import type { Writable } from "svelte/store";

    let {
        panel,
        actions,
        onQuota,
        onRefresh,
    }: {
        panel: Writable<FleetSummary | null>;
        actions: FleetActions;
        onQuota: (n: number) => any;
        onRefresh: () => any;
    } = $props();

    const QUOTAS = [1, 3, 5];

    const p = $derived($panel);
    const empty = $derived(p != null && p.books.length === 0);
    const quota = $derived(p?.quota ?? 3);
    const state = $derived(p?.debt.state ?? "ok");

    function bookPercent(b: FleetBook): number {
        if (b.total <= 0) return 0;
        return Math.min(100, Math.round((b.point / b.total) * 100));
    }
</script>

<div class="prog-fleet" data-state={state}>
    <!-- 顶栏：标题 + recite 导流（未装灰 opacity/装了亮 yours 色） -->
    <div class="prog-fleet-top">
        <span class="prog-fleet-title">{tomatoI18n.今日阅读}</span>
        <button
            class="prog-fleet-recite b3-tooltips b3-tooltips__w"
            aria-label={actions.isReciteInstalled()
                ? tomatoI18n.导流仿写已装
                : tomatoI18n.导流仿写未装}
            class:off={!actions.isReciteInstalled()}
            onclick={() => actions.reciteAction()}
        >
            <svg><use xlink:href="#iconProgRecite"></use></svg>
        </button>
    </div>

    {#if p != null}
        <!-- 今日状态区：已读大字（三态色）/ 点行 / 欠债 pill / 档位胶囊 -->
        <div class="prog-fleet-today">
            <div class="prog-fleet-today-num">
                <span class="big">{p.debt.readToday}</span>
                <span class="total">/ {quota}</span>
                {#if p.debt.debt > 0}
                    <span class="debt-pill" data-state={state}>{tomatoI18n.欠N片(p.debt.debt)}</span>
                {/if}
                {#if p.dueTotal > 0}
                    <!-- 期2 全局 ✧ 待办胶囊：think+pdigest 双源（含 free 源）——点击开全局清单 -->
                    <button
                        class="due-pill"
                        aria-label={tomatoI18n.重访到期待办}
                        onclick={(e) => actions.openDueList(e)}
                    >✧ {p.dueTotal}</button>
                {/if}
            </div>
            <div class="prog-fleet-dots">
                {#each Array(quota) as _, i}
                    <span class="dot" class:lit={i < p.debt.readToday}></span>
                {/each}
            </div>
            <div class="prog-fleet-quota" role="group" aria-label={tomatoI18n.每日目标}>
                {#each QUOTAS as q (q)}
                    <button
                        class="quota-pill"
                        class:selected={q === quota}
                        aria-label={tomatoI18n.每日目标N片(q)}
                        onclick={() => q !== quota && onQuota(q)}
                    >{tomatoI18n.档位标签(q)}·{q}</button
                    >
                {/each}
            </div>
        </div>

        <!-- 热力图：近14天横条，右端=今天 -->
        <div class="prog-fleet-heat" aria-label={tomatoI18n.近14天阅读}>
            {#each p.heat as cell (cell.date)}
                <span
                    class="heat-cell"
                    data-level={cell.level}
                    class:today={cell.date === p.heat.at(-1)?.date}
                    title={cell.date}
                ></span>
            {/each}
        </div>

        <!-- 书卡列表（空态不渲染，走下方插画） -->
        {#if empty}
            <div class="prog-fleet-empty">
                <svg viewBox="0 0 24 32" aria-hidden="true">
                    <path
                        d="M12 1 C 13.5 6, 22 10.5, 21 19 C 20.4 25, 16.6 29.5, 12 29.5 C 7.4 29.5, 3.6 25, 3 19 C 2 10.5, 10.5 6, 12 1 Z"
                    ></path>
                    <path
                        d="M6 30 C 6 26, 9 24, 12 24 C 15 24, 18 26, 18 30 Z"
                    ></path>
                </svg>
                <div class="empty-title">{tomatoI18n.书架空空}</div>
                <div class="empty-sub">{tomatoI18n.书架空空说明}</div>
            </div>
        {:else}
            <div class="prog-fleet-books">
                {#each p.books as book (book.bookID)}
                    {#if book.status === "closed" || book.status === "lost"}
                        <!-- ⏸/⚠ 状态卡（bookStatus 判定链）：灰化/warn 沉底；点击仍走续读，由 startToLearn 拦截给对症提示（lost 直接弹清理 confirm） -->
                        <button
                            class="prog-fleet-card"
                            class:closed={book.status === "closed"}
                            class:lost={book.status === "lost"}
                            onclick={() => actions.continueReading(book.bookID)}
                        >
                            <div class="row">
                                <span class="name">{book.name}</span>
                                <span class="st-chip" data-st={book.status}
                                    >{book.status === "closed" ? `⏸ ${tomatoI18n.笔记本已关闭}` : `⚠ ${tomatoI18n.疑似失效}`}</span
                                >
                            </div>
                            <div class="st-line"
                                >{book.status === "closed"
                                    ? tomatoI18n.打开笔记本后自动恢复阅读
                                    : tomatoI18n.文档已不存在可能已删除或移动}</div
                            >
                        </button>
                    {:else}
                        <button
                            class="prog-fleet-card"
                            class:finished={book.finished}
                            class:manual={book.manual}
                            onclick={() => actions.continueReading(book.bookID)}
                        >
                            <div class="row">
                                <span class="name">{book.name}</span>
                                <span class="num"
                                    >{book.finished
                                        ? tomatoI18n.已读完
                                        : book.manual
                                        ? `✎ ${tomatoI18n.手动分片}`
                                        : book.total > 0
                                        ? `${book.point}/${book.total}`
                                        : tomatoI18n.未分片}</span
                                >
                            </div>
                            <div class="track"><div class="fill" style="width:{bookPercent(book)}%"></div></div>
                            <div class="row sub">
                                <span class="dots">
                                    {#each Array(quota) as _, i}
                                        <span class="dot" class:lit={i < book.todayRead}></span>
                                    {/each}
                                </span>
                                <span class="badges">
                                    {#if book.badges.digest > 0}<span>✒ {book.badges.digest}</span>{/if}
                                    {#if book.badges.note > 0}<span>✱ {book.badges.note}</span>{/if}
                                    {#if book.badges.due > 0}
                                        <!-- v5 □12：✧ 点击=到期待办列表（完成/推迟/移除）；stopPropagation 防触发书卡续读 -->
                                        <span
                                            class="due"
                                            role="button"
                                            tabindex="0"
                                            aria-label={tomatoI18n.重访到期待办}
                                            onclick={(e) => { e.stopPropagation(); actions.openDueList(e, book.bookID); }}
                                            onkeydown={(e) => e.key === "Enter" && (e.stopPropagation(), actions.openDueList({ clientX: 0, clientY: 0 }, book.bookID))}
                                        >✧ {book.badges.due}</span>
                                    {/if}
                                </span>
                            </div>
                        </button>
                    {/if}
                {/each}
            </div>
        {/if}

        <!-- 主按钮：有书=滚筒开读；空态=把当前文档加为第一本书 -->
        <button class="prog-fleet-start" onclick={() => (empty ? actions.addFirstBook() : actions.startReading())}>
            {#if empty}＋ {tomatoI18n.加入第一本书}{:else}▶ {tomatoI18n.开始今日阅读}{/if}
        </button>

        <div class="prog-fleet-foot">
            <button class="ghost" onclick={() => actions.manageBooks()}>{tomatoI18n.管理书目}</button>
            <span class="fn__flex-1"></span>
            <button class="ghost icon b3-tooltips b3-tooltips__n" aria-label={tomatoI18n.刷新}
                onclick={() => onRefresh()}>♻</button
            >
            <button class="ghost" onclick={() => actions.openSettings()}>{tomatoI18n.设置}</button>
        </div>
    {:else}
        <div class="prog-fleet-loading">{tomatoI18n.加载中}</div>
    {/if}
</div>
