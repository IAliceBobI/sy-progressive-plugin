<script lang="ts">
    // v5 □7 管理书目卡片化（docs/prog-manage-books-ui-design.md）：旧 13 列裸表格 → 活书卡列表，
    // 与 DockPanel 的 prog-fleet 家族同视觉语言（--prog-* token：12px 圆角卡 / track-fill 进度条 /
    // sub 行小字）。三种非正常状态卡（bookStatus 判定链判定，UI 不自行判定）：
    // ⏸ 闭笔记本=虚线灰卡无操作；⚠ 疑似失效=warn 色警示+清理记录；未分片=正常卡+引导文案。
    // 排序：活书按 reading-order 滚筒序在前，⚠→⏸ 沉底。
    import { onDestroy, onMount } from "svelte";
    import { confirm } from "siyuan";
    import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
    import { lastVerifyResult } from "../../sy-tomato-plugin/src/libs/user";
    import { prog } from "./Progressive";
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
    import { DestroyManager } from "../../sy-tomato-plugin/src/libs/destroyer";
    import { ProgressiveStorage, progStorage } from "./ProgressiveStorage";
    import { createAllPieces } from "./helper";
    import { objOverrideNull } from "stonev5-utils";
    import { loadBookStatuses, invalidateBookStatusCache, type BookStatusInfo } from "./bookStatus";
    import { notifyFleetChanged } from "./fleet";

    interface Props {
        dm: DestroyManager;
    }

    let { dm }: Props = $props();

    export function destroy() {
        dm.destroyBy();
    }

    type TaskType = {
        bookID: string;
        bookInfo: BookInfo;
        bookIndex: string[][];
        name: string;
    };

    let books: TaskType[] = $state([]);
    let statuses = $state(new Map<string, BookStatusInfo>());
    let orderIdx = $state(new Map<string, number>());
    let loaded = $state(false);
    let expanded = $state<Record<string, boolean>>({});
    let rootEl = $state<HTMLDivElement>();

    // 挂载点是 showDialog 生成的空 div（height:auto），撑满 .b3-dialog__content（flex:1 定高）
    // 列表才能内部滚动、工具栏不随滚走；内容区自身 overflow:auto 是兜底（退化为 Dialog 级滚动）。
    onMount(() => {
        const p = rootEl?.parentElement;
        if (p) {
            p.style.height = "100%";
            p.style.minHeight = "0";
        }
        return load(false);
    });
    onDestroy(destroy);

    async function load(force: boolean) {
        await progStorage.healHalfRegistered(); // □1 半注册自愈：救回断链书后再列书
        const ids = Object.keys(progStorage.booksInfos()).filter(
            // 全库唯一谓词：非块 id 形状脏键（_cache 等）不渲染成幽灵行；
            // 块 id 形状的死书仍列出——⚠ 卡承载清理入口，别在这里挡
            (id) => progStorage.isRegisteredBook(id),
        );
        const st = await loadBookStatuses(force);
        const ro = await progStorage.loadReadingOrder();
        const oIdx = new Map<string, number>();
        ro.order.forEach((id, i) => oIdx.set(id, i));

        const list: TaskType[] = [];
        for (const bookID of ids) {
            const bookInfo = objOverrideNull(
                await progStorage.booksInfo(bookID),
                ProgressiveStorage.defaultBookInfo(),
            );
            const bookIndex = await progStorage.loadBookIndexIfNeeded(bookID);
            const row = siyuan.sqlOne(
                `select content from blocks where type='d' and id="${bookID}"`,
            );
            // 书名实时兜底：SQL 实查 → books.json bookName 缓存 → bookID
            // （旧版 🚫 前缀退役：文档缺失由 ⚠ 状态卡承载，书名保持干净）
            const name = (await row)?.content || bookInfo.bookName || bookID;
            list.push({ bookID, bookInfo, bookIndex, name });
        }
        statuses = st;
        orderIdx = oIdx;
        books = list;
        loaded = true;
    }

    function stOf(id: string): BookStatusInfo["status"] {
        return statuses.get(id)?.status ?? "ok";
    }

    /** 活书在前（滚筒序），⚠ → ⏸ 沉底；不在 order 的书排后，同 key 靠 sort 稳定性保原序 */
    const sortedBooks = $derived.by(() => {
        const rank = (id: string) =>
            stOf(id) === "ok" ? 0 : stOf(id) === "lost" ? 1 : 2;
        return [...books].sort(
            (a, b) =>
                rank(a.bookID) - rank(b.bookID) ||
                (orderIdx.get(a.bookID) ?? Infinity) -
                    (orderIdx.get(b.bookID) ?? Infinity),
        );
    });

    function totalOf(b: TaskType): number {
        return (b.bookIndex ?? []).length;
    }
    /** 与 DockPanel/fleetData 同口径：total<=0 → 0，读完 = 100% */
    function percentOf(b: TaskType): number {
        const total = totalOf(b);
        if (total <= 0) return 0;
        return Math.min(
            100,
            Math.round(((b.bookInfo.point ?? 0) / total) * 100),
        );
    }

    async function btnStartToLearn(bookID: string) {
        await prog.startToLearnWithLock(bookID);
        destroy();
    }
    function btnAddProgressiveReading(bookID: string) {
        prog.addProgressiveReadingWithLock(bookID);
        destroy();
    }
    function removeLocal(bookID: string) {
        books = books.filter((b) => b.bookID !== bookID);
    }
    async function afterRemove(bookID: string) {
        await progStorage.removeIndex(bookID);
        invalidateBookStatusCache();
        notifyFleetChanged(); // Dock 面板即时联动（Progressive.ts 同款）
        removeLocal(bookID);
    }
    function btnDelete(b: TaskType) {
        confirm(
            "⚠️",
            tomatoI18n.只删除记录与辅助数据不删除分片不删除闪卡等删除 + b.name,
            () => afterRemove(b.bookID),
        );
    }
    function btnClean(b: TaskType) {
        confirm("⚠️", tomatoI18n.清理该书渐进记录确认(b.name), async () => {
            await afterRemove(b.bookID);
            await siyuan.pushMsg(tomatoI18n.已清理该书记录);
        });
    }
    function btnCreateAll(b: TaskType) {
        confirm(tomatoI18n.立刻创建所有的分片, "⏳", () => {
            createAllPieces(b.bookID);
        });
    }

    // toggle 一律显式算好新值再写（不用 bind:checked + onclick，避开 change/click 时序竞态），
    // 本地 state 是 UI 唯一事实源，storage 写入 fire-and-forget（与旧表一致）。
    function toggleIgnore(b: TaskType) {
        const v = !b.bookInfo.ignored;
        b.bookInfo.ignored = v;
        progStorage.setIgnoreBook(b.bookID, v);
    }
    function toggleDeep(
        b: TaskType,
        field: "addIndex2paragraph" | "showLastBlock",
    ) {
        const v = !b.bookInfo[field];
        b.bookInfo[field] = v;
        if (field === "addIndex2paragraph") {
            progStorage.setAddingIndex2paragraph(b.bookID, v);
        } else {
            progStorage.setShowLastBlock(b.bookID, v);
        }
    }
    function toggleSplit(b: TaskType, t: AsList) {
        const v = !(
            t === "p"
                ? b.bookInfo.autoSplitSentenceP
                : t === "t"
                  ? b.bookInfo.autoSplitSentenceT
                  : b.bookInfo.autoSplitSentenceI
        );
        // □14 断句整体 Pro：管理页开新档时未激活即时拦+引导（不静默；执行侧 splitAndInsert
        // 另有兜底，避免批量建片时 toast 连环重播——review P2-1）
        if (v && !lastVerifyResult()) {
            void siyuan.pushMsg(tomatoI18n.断句Pro提示, 2500);
            return;
        }
        // 三互斥本地镜像（存储层 setAutoSplitSentence 先清三再设一，语义一致）
        b.bookInfo.autoSplitSentenceP = t === "p" && v;
        b.bookInfo.autoSplitSentenceT = t === "t" && v;
        b.bookInfo.autoSplitSentenceI = t === "i" && v;
        progStorage.setAutoSplitSentence(b.bookID, v, t);
    }
    function toggleExpand(id: string) {
        expanded[id] = !expanded[id];
    }
</script>

<div class="prog-manage" bind:this={rootEl}>
    {#if !loaded}
        <div class="manage-loading">{tomatoI18n.加载中}</div>
    {:else if sortedBooks.length === 0}
        <!-- 空态：复用 DockPanel 空态构图与文案 -->
        <div class="manage-empty">
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
        <div class="manage-bar">
            <span class="manage-count"
                >{tomatoI18n.共N本书(sortedBooks.length)}</span
            >
            <span class="spacer"></span>
            <button
                class="icon-btn b3-tooltips b3-tooltips__n"
                aria-label={tomatoI18n.刷新}
                onclick={() => load(true)}
            >♻</button>
        </div>
        <div class="manage-list">
            {#each sortedBooks as b (b.bookID)}
                {#if stOf(b.bookID) === "closed"}
                    <!-- ⏸ 笔记本已关闭：整卡灰化，无任何操作（闭箱是暂态，不给清理） -->
                    <article class="card closed">
                        <div class="row top">
                            <span class="name">{b.name}</span>
                            <span class="chip chip-closed"
                                >⏸ {tomatoI18n.笔记本已关闭}</span
                            >
                        </div>
                        <div class="status-line">
                            {tomatoI18n.打开笔记本后自动恢复阅读}
                        </div>
                    </article>
                {:else if stOf(b.bookID) === "lost"}
                    <!-- ⚠ 疑似失效：warn 警示 + 唯一出口「清理记录」突出 -->
                    <article class="card lost">
                        <div class="row top">
                            <span class="name">{b.name}</span>
                            <span class="chip chip-lost"
                                >⚠ {tomatoI18n.疑似失效}</span
                            >
                        </div>
                        <div class="status-line warn">
                            {tomatoI18n.书原文档已不存在(
                                b.name,
                                statuses.get(b.bookID)?.fsUnavailable ?? false,
                            )}
                        </div>
                        <div class="row actions">
                            <button
                                class="btn clean"
                                aria-label={`${tomatoI18n.清理记录}《${b.name}》`}
                                onclick={() => btnClean(b)}
                            >{tomatoI18n.清理记录}</button>
                        </div>
                    </article>
                {:else}
                    <!-- 活书卡：书名行 / 进度条 / 动作行 / 折叠分片设置 -->
                    <article class="card">
                        <div class="row top">
                            <span class="name">{b.name}</span>
                            <span class="num"
                                >{totalOf(b) > 0
                                    ? `${b.bookInfo.point ?? 0}/${totalOf(b)} ${tomatoI18n.分片}`
                                    : tomatoI18n.未分片}</span
                            >
                        </div>
                        {#if totalOf(b) > 0}
                            <div
                                class="track"
                                role="progressbar"
                                aria-label={tomatoI18n.进度}
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-valuenow={percentOf(b)}
                            >
                                <div
                                    class="fill"
                                    style="width:{percentOf(b)}%"
                                ></div>
                            </div>
                        {/if}
                        <div class="row actions">
                            <button
                                class="btn primary"
                                disabled={totalOf(b) === 0}
                                aria-label={`${tomatoI18n.阅读}《${b.name}》`}
                                onclick={() => btnStartToLearn(b.bookID)}
                            >📖 {tomatoI18n.阅读}</button
                            >
                            <button
                                class="btn ghost"
                                class:emph={totalOf(b) === 0}
                                aria-label={`${tomatoI18n.重新分片}《${b.name}》`}
                                onclick={() =>
                                    btnAddProgressiveReading(b.bookID)}
                            >🍕 {tomatoI18n.重新分片}</button
                            >
                            <button
                                class="switch"
                                role="switch"
                                aria-checked={!!b.bookInfo.ignored}
                                aria-label={`${tomatoI18n.忽略}《${b.name}》`}
                                onclick={() => toggleIgnore(b)}
                            >{tomatoI18n.忽略}</button
                            >
                            <span class="spacer"></span>
                            <button
                                class="icon-btn danger b3-tooltips b3-tooltips__n"
                                aria-label={`${tomatoI18n.删除}《${b.name}》（${tomatoI18n.不删除已经产生的分片等文件}）`}
                                onclick={() => btnDelete(b)}
                            >🗑</button>
                        </div>
                        {#if totalOf(b) === 0}
                            <div class="status-line warn">
                                {tomatoI18n.未分片请先分片后再阅读}
                            </div>
                        {/if}
                        <button
                            class="fold"
                            aria-expanded={!!expanded[b.bookID]}
                            onclick={() => toggleExpand(b.bookID)}
                        ><span class="tri"
                                >{expanded[b.bookID] ? "▾" : "▸"}</span
                            >{tomatoI18n.分片设置}</button
                        >
                        {#if expanded[b.bookID]}
                            <div class="dig">
                                <label class="dig-row">
                                    <input
                                        type="checkbox"
                                        checked={!!b.bookInfo
                                            .addIndex2paragraph}
                                        onchange={() =>
                                            toggleDeep(
                                                b,
                                                "addIndex2paragraph",
                                            )}
                                    />
                                    <span
                                        >{tomatoI18n.给分片内段落标上序号}</span
                                    >
                                </label>
                                <label class="dig-row">
                                    <input
                                        type="checkbox"
                                        checked={!!b.bookInfo.showLastBlock}
                                        onchange={() =>
                                            toggleDeep(b, "showLastBlock")}
                                    />
                                    <span
                                        >{tomatoI18n.显示上一分片最后一个内容块}</span
                                    >
                                </label>
                                <div class="dig-row">
                                    <span class="dig-label"
                                        >{tomatoI18n.断句}</span
                                    >
                                    <div
                                        class="seg"
                                        role="group"
                                        aria-label={tomatoI18n.断句}
                                    >
                                        <button
                                            class="seg-pill"
                                            class:sel={
                                                !!b.bookInfo
                                                    .autoSplitSentenceP
                                            }
                                            aria-pressed={
                                                !!b.bookInfo
                                                    .autoSplitSentenceP
                                            }
                                            onclick={() =>
                                                toggleSplit(b, "p")}
                                        >{tomatoI18n.断句为段落块}</button
                                        >
                                        <button
                                            class="seg-pill"
                                            class:sel={
                                                !!b.bookInfo
                                                    .autoSplitSentenceT
                                            }
                                            aria-pressed={
                                                !!b.bookInfo
                                                    .autoSplitSentenceT
                                            }
                                            onclick={() =>
                                                toggleSplit(b, "t")}
                                        >{tomatoI18n.断句为任务块}</button
                                        >
                                        <button
                                            class="seg-pill"
                                            class:sel={
                                                !!b.bookInfo
                                                    .autoSplitSentenceI
                                            }
                                            aria-pressed={
                                                !!b.bookInfo
                                                    .autoSplitSentenceI
                                            }
                                            onclick={() =>
                                                toggleSplit(b, "i")}
                                        >{tomatoI18n.断句为无序表}</button
                                        >
                                    </div>
                                </div>
                                <div class="dig-row">
                                    <button
                                        class="btn ghost"
                                        aria-label={`${tomatoI18n.立刻创建所有的分片}《${b.name}》`}
                                        onclick={() => btnCreateAll(b)}
                                    >🧩 {tomatoI18n.立刻创建所有的分片}</button
                                    >
                                </div>
                            </div>
                        {/if}
                    </article>
                {/if}
            {/each}
        </div>
    {/if}
</div>

<style lang="scss">
    // 全部走 --prog-*（v5 token，明暗双轨）与 --b3-*，深浅色主题天然成立。
    .prog-manage {
        display: flex;
        flex-direction: column;
        gap: 8px;
        height: 100%;
        min-height: 0;
        color: var(--prog-title);
        word-break: normal; // 抵消 .b3-dialog__content 的 break-all 继承
    }
    .spacer {
        flex: 1;
    }

    /* 加载 / 空态（同 DockPanel 家族样式） */
    .manage-loading {
        display: flex;
        flex: 1;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        color: var(--prog-muted);
    }
    .manage-empty {
        display: flex;
        flex: 1;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        opacity: 0.55;
        text-align: center;
        svg {
            width: 40px;
            height: 52px;
            fill: none;
            stroke: var(--prog-muted);
            stroke-width: 1.4;
        }
        .empty-title {
            font-size: 14px;
            font-weight: 600;
            color: var(--prog-sub);
        }
        .empty-sub {
            font-size: 12px;
            color: var(--prog-muted);
        }
    }

    /* 顶栏（书籍计数 + 刷新）+ 卡片列表 */
    .manage-bar {
        display: flex;
        flex: none;
        align-items: center;
        gap: 4px;
        min-height: 28px;
    }
    .manage-count {
        font-size: 12px;
        color: var(--prog-muted);
        font-variant-numeric: tabular-nums;
    }
    .manage-list {
        display: flex;
        flex: 1;
        flex-direction: column;
        gap: 10px;
        min-height: 0;
        padding-bottom: 4px;
        overflow-y: auto;
    }
    .card {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 12px;
        border: 1px solid var(--prog-card-border);
        border-radius: 12px;
        background: var(--prog-card-bg);
        box-shadow: var(--prog-shadow);
    }
    .row {
        display: flex;
        align-items: center;
        gap: 8px;
        &.top {
            align-items: baseline;
        }
        &.actions {
            flex-wrap: wrap; // 移动端窄卡动作换行
        }
    }
    .name {
        flex: 1;
        min-width: 0;
        font-size: 14px;
        font-weight: 600;
        line-height: 1.45;
        color: var(--prog-title);
        white-space: normal; // 完整书名不截断
        overflow-wrap: anywhere;
    }
    .num {
        flex: none;
        font-size: 12px;
        color: var(--prog-muted);
        font-variant-numeric: tabular-nums;
    }
    .track {
        height: 4px;
        border-radius: 999px;
        background: var(--prog-progress-track);
        overflow: hidden;
        .fill {
            height: 100%;
            border-radius: 999px;
            background: var(--prog-progress-fill);
            transition: width 0.18s ease-out;
        }
    }

    /* 按钮体系：primary 填充 / ghost 描边 / icon-btn 弱化 / clean warn 色 */
    .btn {
        height: 28px;
        padding: 0 12px;
        border: none;
        border-radius: 6px;
        font-size: 12px;
        cursor: pointer;
        transition: all 0.12s ease-out;
        &.primary {
            font-weight: 600;
            background: var(--prog-accent-strong);
            color: var(--prog-badge-fg);
            &:hover {
                filter: brightness(1.1);
            }
            &:disabled {
                opacity: 0.4;
                cursor: not-allowed;
                filter: none;
            }
        }
        &.ghost {
            background: transparent;
            color: var(--prog-sub);
            box-shadow: inset 0 0 0 1px var(--prog-card-border);
            &:hover {
                color: var(--prog-accent);
            }
            &.emph {
                font-weight: 600;
                color: var(--prog-accent-strong);
                box-shadow: inset 0 0 0 1px
                    color-mix(in srgb, var(--prog-accent) 55%, var(--prog-card-border));
            }
        }
        &.clean {
            font-weight: 600;
            background: color-mix(in srgb, var(--prog-status-warn) 14%, transparent);
            color: var(--prog-status-warn);
            &:hover {
                background: color-mix(in srgb, var(--prog-status-warn) 24%, transparent);
            }
        }
    }
    .icon-btn {
        height: 28px;
        min-width: 28px;
        padding: 0 6px;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: var(--prog-muted);
        cursor: pointer;
        transition: color 0.12s ease-out, box-shadow 0.12s ease-out;
        &.danger:hover {
            color: var(--b3-theme-error);
            box-shadow: inset 0 0 0 1px
                color-mix(in srgb, var(--b3-theme-error) 45%, transparent);
        }
    }
    .switch {
        height: 22px;
        padding: 0 8px;
        border: none;
        border-radius: 999px;
        font-size: 11px;
        cursor: pointer;
        color: var(--prog-muted);
        background: transparent;
        box-shadow: inset 0 0 0 1px var(--prog-card-border);
        transition: all 0.12s ease-out;
        &[aria-checked="true"] {
            font-weight: 600;
            color: var(--prog-accent-strong);
            background: var(--prog-accent-soft);
            box-shadow: none;
        }
    }

    /* 状态卡：⏸ 虚线灰化 / ⚠ warn 混色 */
    .chip {
        flex: none;
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 600;
    }
    .chip-closed {
        color: var(--prog-muted);
        box-shadow: inset 0 0 0 1px var(--b3-border-color);
    }
    .chip-lost {
        color: var(--prog-status-warn);
        background: color-mix(in srgb, var(--prog-status-warn) 14%, transparent);
    }
    .status-line {
        font-size: 12px;
        color: var(--prog-muted);
        &.warn {
            color: var(--prog-status-warn);
        }
    }
    .card.closed {
        opacity: 0.62;
        border-style: dashed;
        box-shadow: none;
        .name {
            color: var(--prog-sub);
        }
    }
    .card.lost {
        border-color: color-mix(in srgb, var(--prog-status-warn) 38%, var(--prog-card-border));
        background: color-mix(in srgb, var(--prog-status-warn) 4%, var(--prog-card-bg));
    }

    /* 折叠行 + 分片设置凹槽（.prog-fb-dig 同手法） */
    .fold {
        align-self: flex-start;
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 2px 4px;
        border: none;
        border-radius: 4px;
        background: none;
        font-size: 12px;
        color: var(--prog-muted);
        cursor: pointer;
        transition: color 0.12s ease-out;
        &:hover {
            color: var(--prog-accent);
        }
        .tri {
            font-size: 10px;
        }
    }
    .dig {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 10px;
        border-radius: 8px;
        background: var(--prog-accent-soft);
        animation: pmb-dig-in 0.15s ease-out;
    }
    @keyframes pmb-dig-in {
        from {
            opacity: 0;
            transform: translateY(-4px);
        }
        to {
            opacity: 1;
            transform: none;
        }
    }
    .dig-row {
        display: flex;
        flex-wrap: wrap; // 移动端断句三胶囊可换行
        align-items: center;
        gap: 8px;
        font-size: 12px;
        color: var(--prog-sub);
        input[type="checkbox"] {
            width: 14px;
            height: 14px;
            margin: 0;
            cursor: pointer;
            accent-color: var(--prog-accent);
        }
    }
    .dig-label {
        flex: none;
    }
    .seg {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
    }
    .seg-pill {
        height: 22px;
        padding: 0 8px;
        border: none;
        border-radius: 999px;
        font-size: 11px;
        color: var(--prog-sub);
        background: transparent;
        cursor: pointer;
        box-shadow: inset 0 0 0 1px var(--prog-card-border);
        transition: all 0.12s ease-out;
        &:hover {
            color: var(--prog-accent);
        }
        &.sel {
            font-weight: 600;
            color: var(--prog-badge-fg);
            background: var(--prog-accent-strong);
            box-shadow: none;
        }
    }

    /* 触屏热区放大（Dialog 已由外层 90vw 单列适配） */
    @media (pointer: coarse) {
        .btn,
        .icon-btn {
            height: 32px;
        }
        .switch,
        .seg-pill {
            height: 26px;
        }
    }
</style>
