<script lang="ts">
    // v5 □7 管理书目卡片化（docs/prog-manage-books-ui-design.md）：旧 13 列裸表格 → 活书卡列表，
    // 与 DockPanel 的 prog-fleet 家族同视觉语言（--prog-* token：12px 圆角卡 / track-fill 进度条 /
    // sub 行小字）。三种非正常状态卡（bookStatus 判定链判定，UI 不自行判定）：
    // ⏸ 闭笔记本=虚线灰卡无操作；⚠ 疑似失效=warn 色警示+清理记录；未分片=正常卡+引导文案。
    // 排序：活书按 reading-order 滚筒序在前，⚠→⏸ 沉底。
    import { onDestroy, onMount } from "svelte";
    import { confirm, Menu } from "siyuan";
    import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
    import { lastVerifyResult } from "../../sy-tomato-plugin/src/libs/user";
    import { prog } from "./Progressive";
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
    import { DestroyManager } from "../../sy-tomato-plugin/src/libs/destroyer";
    import { ProgressiveStorage, progStorage } from "./ProgressiveStorage";
    import { createAllPieces } from "./helper";
    import { objOverrideNull } from "stonev5-utils";
    import { loadBookStatuses, invalidateBookStatusCache, type BookStatusInfo } from "./bookStatus";
    import { notifyFleetChanged, onFleetChanged } from "./fleetNotify";
    import { fetchWritingPieces } from "./writeBook";
    import { writingCompareBox } from "./WritingCompareBox";
    import { AUTORELAX_KEY, parseStamp, VISITRATE_KEY, type VisitFreq } from "./readCurveCore";
    import { setBookVisitFreq } from "./readCurve";

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
        /** 期2 写作书：定稿片数（进度换源；非写作书恒 0） */
        doneOf: number;
        /** 期2 写作书：片总数（bookIndex 恒空时的 total 源；非写作书恒 0） */
        pieceLen: number;
    };

    let books: TaskType[] = $state([]);
    let statuses = $state(new Map<string, BookStatusInfo>());
    let orderIdx = $state(new Map<string, number>());
    /** □3 书回访频率档位（bookID→l/h；无行=中档零感知），批查一次全量 */
    let freqs = $state(new Map<string, string>());
    /** □6 自动放宽标记（bookID→放宽时刻 ms）：在场=当前 l 档来自巡查自动放宽，
     *  徽标+一键恢复的显示条件（与 freqs 同一次 attrs 顺手读） */
    let autoRelaxs = $state(new Map<string, number>());
    let loaded = $state(false);
    let loadGen = 0; // 代际计数（非渲染态）：并发 load 交错时旧完成者丢弃
    let expanded = $state<Record<string, boolean>>({});
    let rootEl = $state<HTMLDivElement>();

    // 挂载点是 showDialog 生成的空 div（height:auto），撑满 .b3-dialog__content（flex:1 定高）
    // 列表才能内部滚动、工具栏不随滚走；内容区自身 overflow:auto 是兜底（退化为 Dialog 级滚动）。
    // 期D 订阅 fleet 变化：外部写点（新建槽/定稿/归档）改片数后书卡即时刷新——此前
    // 挂载快照，Dialog 开着时数据错到重开（e2e 实锤新建槽后 ✍ 计数不动）
    onMount(() => {
        const p = rootEl?.parentElement;
        if (p) {
            p.style.height = "100%";
            p.style.minHeight = "0";
        }
        // 代际守卫（□13-1）：密集 notify 下多个 load 交错，慢的旧 load 后完成会盖掉
        // 新数据——load 自增计数，后完成者发现代际落后即丢弃
        const off = onFleetChanged(() => { void load(false); });
        void load(false);
        return off;
    });
    onDestroy(destroy);

    async function load(force: boolean) {
        const gen = ++loadGen;
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
            // 期2 写作书：片列表单发拉取（total=片数、doneOf=定稿数；进度=定稿占比）
            let doneOf = 0;
            let pieceLen = 0;
            let bookIndex: string[][] = [];
            if (bookInfo.writing) {
                const pieces = await fetchWritingPieces(bookID);
                doneOf = pieces.filter(p => p.done).length;
                pieceLen = pieces.length;
            } else {
                bookIndex = await progStorage.loadBookIndexIfNeeded(bookID);
            }
            const row = siyuan.sqlOne(
                `select content from blocks where type='d' and id="${bookID}"`,
            );
            // 书名实时兜底：SQL 实查 → books.json bookName 缓存 → bookID
            // （旧版 🚫 前缀退役：文档缺失由 ⚠ 状态卡承载，书名保持干净）
            const name = (await row)?.content || bookInfo.bookName || bookID;
            list.push({ bookID, bookInfo, bookIndex, name, doneOf, pieceLen });
        }
        if (gen !== loadGen) return; // 旧代际完成：丢弃防盖新数据（□13-1）
        statuses = st;
        orderIdx = oIdx;
        books = list;
        // □3 回访频率档位：逐书 getBlockAttrs 直读（勿走 SQL attributes——改档触发
        // fleetChanged→本 load 重查，SQL 吃索引延迟会把钮面打回旧档，getBlockAttrs
        // 直读无窗口；缺行/中档清键均不进 Map=显示中）。□6 同一次 attrs 顺手读
        // autorelax 标记（零新请求）
        const fmap = new Map<string, string>();
        const amap = new Map<string, number>();
        for (const b of list) {
            const a = ((await siyuan.getBlockAttrs(b.bookID)) ?? {}) as any;
            const v = String(a?.[VISITRATE_KEY] ?? "");
            if (v === "l" || v === "h") fmap.set(b.bookID, v);
            const ar = String(a?.[AUTORELAX_KEY] ?? "");
            if (/^\d{14}$/.test(ar)) amap.set(b.bookID, parseStamp(ar));
        }
        freqs = fmap;
        autoRelaxs = amap;
        loaded = true;
    }

    function stOf(id: string): BookStatusInfo["status"] {
        return statuses.get(id)?.status ?? "ok";
    }

    /** □6 放宽时刻 → MM-DD（同年级显示完整日期，与状态行毕业日期同款式） */
    function relaxDateOf(ms: number): string {
        const d = new Date(ms);
        const pad2 = (n: number) => String(n).padStart(2, "0");
        return d.getFullYear() === new Date().getFullYear()
            ? `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
            : `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    }

    /** □3 回访频率（书级，三入口之一=管理卡可见钮）：改档=书 IAL+在册卡批量跟随
     *  （setBookVisitFreq 内含 toast）；本地 Map 重赋值即时刷新钮面档位显示 */
    function openFreqMenu(e: MouseEvent, b: TaskType) {
        const cur: VisitFreq = (freqs.get(b.bookID) as VisitFreq) ?? "m";
        const menu = new (Menu as any)("progBookFreqMenu", undefined, true) as Menu;
        for (const f of ["l", "m", "h"] as const) {
            menu.addItem({
                icon: "iconClock",
                label: (cur === f ? "✓ " : "") + tomatoI18n.回访频率档名(f),
                click: () => void applyFreq(b, f),
            });
        }
        setTimeout(() => menu.open({ x: e.clientX, y: e.clientY }), 0);
    }

    async function applyFreq(b: TaskType, f: VisitFreq) {
        // review P2：失败（lost 书/写失败）勿乐观更新本地 Map——UI 停旧值与服务端一致
        if (!(await setBookVisitFreq(b.bookID, f))) return;
        const nm = new Map(freqs);
        if (f === "m") nm.delete(b.bookID);
        else nm.set(b.bookID, f);
        freqs = nm;
        // □6 手动改档（含恢复 m）=服务端清标记，本地 Map 同步消徽标
        const am = new Map(autoRelaxs);
        am.delete(b.bookID);
        autoRelaxs = am;
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
        // 期2 写作书：total=片数（定稿占比的分母）；阅读书=索引长
        if (b.bookInfo.writing) return b.pieceLen;
        return (b.bookIndex ?? []).length;
    }
    /** 与 DockPanel/fleetData 同口径：total<=0 → 0，读完 = 100%。
     *  期2 写作书：进度=定稿片占比（doneOf/片数）；阅读书=point/total */
    function percentOf(b: TaskType): number {
        const total = totalOf(b);
        if (total <= 0) return 0;
        const done = b.bookInfo.writing ? b.doneOf : (b.bookInfo.point ?? 0);
        return Math.min(100, Math.round((done / total) * 100));
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
    /** 舰队管理 □2：取消隐匿（管理页=隐匿书唯一找回出口；舰队面板同步刷新） */
    async function btnUnhide(b: TaskType) {
        b.bookInfo.hidden = false;
        await progStorage.setHiddenBook(b.bookID, false);
        await siyuan.pushMsg(tomatoI18n.已在总览显示);
        invalidateBookStatusCache();
        notifyFleetChanged();
        load(true);
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
            <!-- 期1 写作书：空态也露出入口（写作书=从零建骨架的第一形态）；□2 图标统一线稿家族 -->
            <button class="btn ghost empty-write" onclick={() => prog.openAddWritingBookDialog()}
                ><svg><use xlink:href="#iconProgWriteAdd"></use></svg> {tomatoI18n.新建写作书}</button
            >
        </div>
    {:else}
        <div class="manage-bar">
            <span class="manage-count"
                >{tomatoI18n.共N本书(sortedBooks.length)}</span
            >
            <span class="spacer"></span>
            <!-- 期1 写作书：管理页常驻入口；□2 图标统一线稿家族；accent=常驻主入口提示性（同 prog-fleet-plan） -->
            <button
                class="icon-btn write b3-tooltips b3-tooltips__n"
                aria-label={tomatoI18n.新建写作书}
                onclick={() => prog.openAddWritingBookDialog()}
            ><svg><use xlink:href="#iconProgWriteAdd"></use></svg></button>
            <button
                class="icon-btn b3-tooltips b3-tooltips__n"
                aria-label={tomatoI18n.刷新}
                onclick={() => load(true)}
            ><svg><use xlink:href="#iconProgRefresh"></use></svg></button>
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
                    <!-- 活书卡：书名行 / 进度条 / 动作行 / 折叠分片设置；□2 隐匿书灰态行（舰队不显示但管理页可见=找回出口） -->
                    <article class="card" class:hidden={!!b.bookInfo.hidden}>
                        <div class="row top">
                            <span class="name">{#if b.bookInfo.pinned}<span class="pin" aria-label={tomatoI18n.置顶本书}>📌</span>{/if}{b.name}</span>
                            {#if b.bookInfo.hidden}<span class="chip chip-hidden">{tomatoI18n.已隐匿此书}</span>{/if}
                            <span class="num"
                                >{totalOf(b) > 0
                                    ? b.bookInfo.writing
                                        ? `✍ ${b.doneOf}/${totalOf(b)} ${tomatoI18n.分片}`
                                        : `${b.bookInfo.point ?? 0}/${totalOf(b)} ${tomatoI18n.分片}`
                                    : b.bookInfo.writing
                                    ? `✍ ${tomatoI18n.写作中}`
                                    : b.bookInfo.manualMode
                                    ? `✎ ${tomatoI18n.手动分片}`
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
                                disabled={totalOf(b) === 0 && !b.bookInfo.manualMode && !b.bookInfo.writing}
                                aria-label={`${tomatoI18n.阅读}《${b.name}》`}
                                onclick={() => btnStartToLearn(b.bookID)}
                            >{tomatoI18n.阅读}</button
                            >
                            {#if b.bookInfo.writing}
                                <!-- 期5 汇编成稿（Pro，书级入口与浮条同款签名）：Pro 验证+购买引导在 Box 内 -->
                                <button
                                    class="btn ghost"
                                    aria-label={`${tomatoI18n.汇编成稿}《${b.name}》`}
                                    onclick={() =>
                                        writingCompareBox.compileWritingBook(b.bookID, b.bookInfo.boxID)}
                                >{tomatoI18n.汇编成稿}</button
                                >
                            {:else}
                                <button
                                    class="btn ghost"
                                    class:emph={totalOf(b) === 0}
                                    aria-label={`${tomatoI18n.重新分片}《${b.name}》`}
                                    onclick={() =>
                                        btnAddProgressiveReading(b.bookID)}
                                >{tomatoI18n.重新分片}</button
                                >
                            {/if}
                            <!-- □3 回访频率：当前档直显（信息平铺），点开三档菜单；vision P2-2：
                                 非默认档挂 emph 强调（用户主动偏离默认的信号，扫描多卡一眼可辨） -->
                            <button
                                class="btn ghost"
                                class:emph={(freqs.get(b.bookID) ?? "m") !== "m"}
                                aria-label={`${tomatoI18n.回访频率()}《${b.name}》`}
                                onclick={(e) => {
                                    e.stopPropagation();
                                    openFreqMenu(e, b);
                                }}
                            >{tomatoI18n.回访频率()}·{tomatoI18n.回访频率档名(freqs.get(b.bookID) ?? "m")}</button
                            >
                            {#if autoRelaxs.get(b.bookID)}
                                <!-- □6 透明面：自动放宽徽标（含放宽时刻）+一键恢复（信息平铺不藏 hover） -->
                                <span class="autorelax-badge">{tomatoI18n.已自动放宽()}·{relaxDateOf(autoRelaxs.get(b.bookID)!)}<button
                                    class="autorelax-restore"
                                    aria-label={`${tomatoI18n.恢复默认回访()}《${b.name}》`}
                                    onclick={(e) => {
                                        e.stopPropagation();
                                        void applyFreq(b, "m");
                                    }}
                                >{tomatoI18n.恢复默认()}</button></span>
                            {/if}
                            <button
                                class="switch"
                                role="switch"
                                aria-checked={!!b.bookInfo.ignored}
                                aria-label={`${tomatoI18n.忽略}《${b.name}》`}
                                onclick={() => toggleIgnore(b)}
                            >{tomatoI18n.忽略}</button
                            >
                            {#if b.bookInfo.hidden}
                                <button
                                    class="btn ghost"
                                    aria-label={`${tomatoI18n.取消隐匿}《${b.name}》`}
                                    onclick={() => btnUnhide(b)}
                                >{tomatoI18n.取消隐匿}</button
                                >
                            {/if}
                            <span class="spacer"></span>
                            <button
                                class="icon-btn danger b3-tooltips b3-tooltips__n"
                                aria-label={`${tomatoI18n.删除}《${b.name}》（${tomatoI18n.不删除已经产生的分片等文件}）`}
                                onclick={() => btnDelete(b)}
                            >🗑</button>
                        </div>
                        {#if totalOf(b) === 0}
                            <div class="status-line warn">
                                {b.bookInfo.writing
                                    ? tomatoI18n.写作书说明
                                    : b.bookInfo.manualMode
                                    ? tomatoI18n.手动书说明
                                    : tomatoI18n.未分片请先分片后再阅读}
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
                                {#if b.bookInfo.manualMode}
                                    <!-- 期3 手动分片书：无分片设置可用（空索引+无断句/建片语义），说明行替代 -->
                                    <div class="dig-row">{tomatoI18n.手动书设置说明}</div>
                                {:else if b.bookInfo.writing}
                                    <!-- 期1 写作书无切分语义说明行；期D 加「新建槽」（先建槽后放素材：
                                        纯收集书攒了素材后开槽，或写到中途加新章） -->
                                    <div class="dig-row">{tomatoI18n.写作书设置说明}</div>
                                    <div class="dig-row">
                                        <button
                                            class="btn ghost emph"
                                            aria-label={`${tomatoI18n.新建槽}《${b.name}》`}
                                            onclick={() => prog.openAppendSlotDialog(b.bookID)}
                                        >{tomatoI18n.新建槽}</button>
                                    </div>
                                {:else}
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
                                {/if}
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
        /* 期1 写作书空态入口：空态插画整体 opacity 0.55，钮单独回全浓保可点感；
           □2 线稿图标替换 ✍——svg 尺寸须覆盖容器插画级 .manage-empty svg（40×52） */
        .empty-write {
            margin-top: 10px;
            opacity: 1;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            svg {
                width: 14px;
                height: 14px;
            }
        }
    }

    /* 顶栏（书籍计数 + 刷新）+ 卡片列表 */
    .manage-bar {
        display: flex;
        flex: none;
        align-items: center;
        gap: 8px; /* vision P2-8：✍/♻ 两 icon 钮字形间净距过紧（4px 抬 8px） */
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
    /* □6 自动放宽徽标：温和提示底（非危险语义）+内嵌恢复钮（信息平铺不藏 hover）；
     *  文字 --prog-sub（vision P2-3：muted 叠 warn 轻底约 3:1 低于 12px AA 线） */
    .autorelax-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 12px;
        padding: 2px 8px;
        border-radius: 6px;
        background: color-mix(in srgb, var(--prog-status-warn) 12%, transparent);
        color: var(--prog-sub);
        .autorelax-restore {
            border: none;
            background: none;
            cursor: pointer;
            /* vision P2-1/P2-2：默认点状下划线（12px 小字在 warn 底内需独立可点暗示）+
             *  负 margin 扩命中区（视觉不变，命中区高约 17px→23px） */
            padding: 3px 4px;
            margin: -3px -2px;
            font-size: 12px;
            color: var(--prog-accent-strong);
            text-decoration: underline dotted;
            text-underline-offset: 2px;
            &:hover {
                text-decoration-style: solid;
            }
            &:focus-visible {
                outline: 1px solid var(--prog-accent);
                border-radius: 3px;
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
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: color 0.12s ease-out, box-shadow 0.12s ease-out;
        /* □2 线稿图标替换 ✍/♻ emoji：svg 需显式尺寸（默认塌成 0）；hover 反馈与
           ghost 钮语言对齐（vision P2-3，原先仅 .danger 有触发规则） */
        svg {
            width: 14px;
            height: 14px;
        }
        &:hover {
            color: var(--prog-accent);
        }
        &.write {
            color: var(--prog-accent);
        }
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
    /* □2 隐匿书：muted 灰调（与 ⏸ 区分——隐匿是用户主动视觉操作，非异常态） */
    .chip-hidden {
        color: var(--prog-sub);
        background: color-mix(in srgb, var(--prog-muted) 16%, transparent);
    }
    .card.hidden {
        opacity: 0.62;
    }
    .name .pin {
        font-size: 11px;
        margin-right: 2px;
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
