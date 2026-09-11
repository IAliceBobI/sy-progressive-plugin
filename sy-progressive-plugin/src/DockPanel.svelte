<script lang="ts">
    // v5 □6 左 Dock 舰队总览（docs/prog-v5-visual-design.md §3）：今日状态区（已读大字+
    // 档位胶囊=□3 归 □6 的档位设置 UI）+ 近14天热力横条 + 书卡列表（进度/今日点/三徽章，
    // 点击断点续读）+ 主按钮 + 底部副操作。空状态诚实：热力全空淡格、主按钮变加书。
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
    import { filterFleetBooks, type FleetSummary, type FleetBook } from "./fleetData";
    import { openBookMenu } from "./bookMenu";
    import { showFloatTip, hideFloatTip } from "./floatTip";
    import type { FleetActions } from "./fleet";
    import type { Writable } from "svelte/store";

    import { writingQuota } from "../../sy-tomato-plugin/src/libs/stores";

    let {
        panel,
        actions,
        onQuota,
        onRefresh,
        writing,
    }: {
        panel: Writable<FleetSummary | null>;
        actions: FleetActions;
        onQuota: (n: number) => any;
        onRefresh: () => any;
        /** 写作火苗信号（null=无写作书→写作胶囊行不渲染）；□9 方案 A */
        writing: Writable<{ today: number } | null>;
    } = $props();

    const QUOTAS = [1, 3, 5];
    // □9 写作档位 1/2/3（默认 1）：达标变绿督促动笔，不封顶无欠债（与阅读侧差异）
    const WQUOTAS = [1, 2, 3];

    const p = $derived($panel);
    const empty = $derived(p != null && p.books.length === 0);
    const quota = $derived(p?.quota ?? 3);
    // （debtState 勿改名 state：$state rune 会把同名变量解析成 store 订阅）
    const debtState = $derived(p?.debt.state ?? "ok");
    // 舰队管理 □1：书卡关键字搜索（纯视觉过滤，滚筒/调度零改动；空关键字=全量）
    let searchKw = $state("");
    const filteredBooks = $derived(filterFleetBooks(p?.books ?? [], searchKw));

    function bookPercent(b: FleetBook): number {
        if (b.total <= 0) return 0;
        return Math.min(100, Math.round((b.point / b.total) * 100));
    }

    // 手动书体验补课 □2：手动书 hover 书卡给行为说明（点击开原书、片=摘抄）。
    // 复用浮条自建 tip 单例（aria-label 驱动，非手动书无 label 自动无 tip）
    function onCardEnter(ev: MouseEvent) {
        showFloatTip(ev.currentTarget as HTMLElement);
    }

    // 舰队管理 □2：移动端长按开菜单（pointerType=mouse 走 contextmenu 不走此通道）。
    // review P1-1 修法：到点只亮旗不开菜单，开菜单挂到松手 click 里——independent 菜单
    // 构造时即注册 window capture click 监听（内核 plugin/Menu.ts closeEvent），任何与
    // 松手 click 的交叠都会闪现即逝或空转；click 是长按序列最后一个事件，此后构造零竞态。
    // 亮旗同时抑制书卡续读（长按后松手的 click 被吞掉改开菜单）。
    let lpTimer: ReturnType<typeof setTimeout> | undefined;
    let lpClickFallback: ReturnType<typeof setTimeout> | undefined;
    let lpArmed = false;
    let lpX = 0;
    let lpY = 0;

    function lpStart(e: PointerEvent) {
        lpArmed = false; // 先重置再早退：混合设备下 mouse 按下也须清旗，防残留吞掉鼠标点击
        if (e.pointerType === "mouse") return;
        lpCancel();
        lpX = e.clientX;
        lpY = e.clientY;
        lpTimer = setTimeout(() => {
            lpArmed = true;
        }, 500);
    }
    function lpCancel() {
        if (lpTimer) {
            clearTimeout(lpTimer);
            lpTimer = undefined;
        }
        if (lpClickFallback) {
            clearTimeout(lpClickFallback);
            lpClickFallback = undefined;
        }
        lpArmed = false;
    }
    /** click 派发完毕后构造菜单（零竞态点） */
    function lpOpen(book: FleetBook) {
        lpArmed = false;
        openBookMenu({ clientX: lpX, clientY: lpY }, book, actions);
    }
    /** 长按到点后的松手：click 若来（onclick 消费 lpArmed），否则 300ms 兜底开菜单 */
    function lpUp(book: FleetBook) {
        if (lpArmed && !lpClickFallback) {
            lpClickFallback = setTimeout(() => {
                lpClickFallback = undefined;
                lpOpen(book);
            }, 300);
        }
    }
    /** 书卡 click 统一闸：长按旗亮=吞掉续读就地开菜单；否则正常续读 */
    function cardClick(e: MouseEvent, book: FleetBook) {
        if (lpArmed) {
            e.preventDefault();
            e.stopPropagation();
            lpOpen(book);
            return;
        }
        actions.continueReading(book.bookID);
    }
</script>

<div class="prog-fleet" data-state={debtState}>
    <!-- 顶栏：标题 + 复习计划常驻钮（期3 □3：不依赖 due>0——✧ 徽章条件渲染教训） + recite 导流 -->
    <div class="prog-fleet-top">
        <span class="prog-fleet-title">{tomatoI18n.今日阅读}</span>
        <!-- 图文胶囊（用户反馈 16px 图标钮太小）：文字常驻后 tooltip/aria-label 冗余，移除 -->
        <button class="prog-fleet-plan" onclick={() => actions.openReviewPlan()}>
            <svg><use xlink:href="#iconProgSched"></use></svg>
            <span>{tomatoI18n.复习计划}</span>
        </button>
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
                    <span class="debt-pill" data-state={debtState}>{tomatoI18n.欠N片(p.debt.debt)}</span>
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
                <span class="quota-row-tag">{tomatoI18n.阅读行标签}</span>
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
            {#if $writing != null}
                <!-- □9 写作档位胶囊（仅有写作书时显示）：直写 store 即时生效（火苗订阅同源；
                     无需刷新——写作档只影响展示层，不像阅读档牵动当日 q 重算） -->
                <div class="prog-fleet-quota prog-fleet-quota--writing" role="group" aria-label={tomatoI18n.每日写作目标}>
                    <span class="quota-row-tag">{tomatoI18n.写作行标签}</span>
                    {#each WQUOTAS as q (q)}
                        <button
                            class="quota-pill"
                            class:selected={q === $writingQuota}
                            aria-label={tomatoI18n.每日写作目标N片(q)}
                            onclick={() => q !== $writingQuota && writingQuota.write(q)}
                        >{tomatoI18n.档位标签(q, 3)}·{q}</button
                        >
                    {/each}
                </div>
            {/if}
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
            <!-- 舰队管理 □1 搜索框：书名包含匹配即过滤；空架子（empty 插画态）不出搜索框 -->
            <input
                class="prog-fleet-search b3-text-field"
                type="search"
                placeholder={tomatoI18n.搜索书名}
                aria-label={tomatoI18n.搜索书名}
                bind:value={searchKw}
            />
            {#if filteredBooks.length === 0}
                <!-- 搜索无匹配（区别于全书架空态；清空关键字即恢复全量） -->
                <div class="prog-fleet-nomatch">{tomatoI18n.无匹配书目}</div>
            {:else}
                <div class="prog-fleet-books">
                    {#each filteredBooks as book (book.bookID)}
                    {#if book.status === "closed" || book.status === "lost"}
                        <!-- ⏸/⚠ 状态卡（bookStatus 判定链）：灰化/warn 沉底；点击仍走续读，由 startToLearn 拦截给对症提示（lost 直接弹清理 confirm） -->
                        <button
                            class="prog-fleet-card"
                            class:closed={book.status === "closed"}
                            class:lost={book.status === "lost"}
                            onclick={(e) => cardClick(e, book)}
                            oncontextmenu={(e) => { e.preventDefault(); e.stopPropagation(); lpCancel(); openBookMenu(e, book, actions); }}
                            onpointerdown={(e) => lpStart(e)}
                            onpointerup={() => lpUp(book)}
                            onpointercancel={lpCancel}
                            onpointerleave={lpCancel}
                        >
                            <div class="row">
                                <span class="name">{#if book.pinned}<span class="pin" aria-label={tomatoI18n.置顶本书}>📌</span>{/if}{book.name}</span>
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
                            aria-label={book.manual ? tomatoI18n.手动书说明 : undefined}
                            onmouseenter={onCardEnter}
                            onmouseleave={hideFloatTip}
                            onclick={(e) => cardClick(e, book)}
                            oncontextmenu={(e) => { e.preventDefault(); e.stopPropagation(); lpCancel(); openBookMenu(e, book, actions); }}
                            onpointerdown={(e) => lpStart(e)}
                            onpointerup={() => lpUp(book)}
                            onpointercancel={lpCancel}
                            onpointerleave={lpCancel}
                        >
                            <div class="row">
                                <span class="name">{#if book.pinned}<span class="pin" aria-label={tomatoI18n.置顶本书}>📌</span>{/if}{book.name}</span>
                                <span class="num"
                                    >{book.finished
                                        ? tomatoI18n.已读完
                                        : book.writing
                                        ? `✍ ${book.point}/${book.total}`
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
        {/if}

        <!-- 主按钮：有书=滚筒开读；空态=把当前文档加为第一本书（empty=全书架空，不受搜索过滤影响） -->
        <button class="prog-fleet-start" onclick={() => (empty ? actions.addFirstBook() : actions.startReading())}>
            {#if empty}＋ {tomatoI18n.加入第一本书}{:else}▶ {tomatoI18n.开始今日阅读}{/if}
        </button>
        <!-- writebook-next □2：写作书入口升格全宽行（bear 反馈 footer ghost icon 小钮易看不见；
             与主按钮构成「读/写」双门——读写闭环的门面叙事。西语等长 label 在 274px footer
             行放不下，全宽行七语种皆容纳；文字常驻故不挂 tooltip） -->
        <button class="prog-fleet-write" onclick={() => actions.addWritingBook()}>
            <svg><use xlink:href="#iconProgWriteAdd"></use></svg>
            <span>{tomatoI18n.新建写作书}</span>
        </button>

        <div class="prog-fleet-foot">
            <button class="ghost" onclick={() => actions.manageBooks()}>{tomatoI18n.管理书目}</button>
            <span class="fn__flex-1"></span>
            <button class="ghost icon b3-tooltips b3-tooltips__n" aria-label={tomatoI18n.刷新}
                onclick={() => onRefresh()}><svg><use xlink:href="#iconProgRefresh"></use></svg></button
            >
            <button class="ghost" onclick={() => actions.openSettings()}>{tomatoI18n.设置}</button>
        </div>
    {:else}
        <div class="prog-fleet-loading">{tomatoI18n.加载中}</div>
    {/if}
</div>
