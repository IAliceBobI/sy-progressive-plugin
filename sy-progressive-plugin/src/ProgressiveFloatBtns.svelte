<script lang="ts">
    import FloatBar from "../../sy-tomato-plugin/src/libs/FloatBar.svelte";
    import PieceTopBar from "./PieceTopBar.svelte";
    import FloatBall from "./FloatBall.svelte";
    import type { Writable } from "svelte/store";
    import { get } from "svelte/store";
    import { confirm, getFrontend, getAllEditor, type IProtyle } from "siyuan";
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
    import { getProgressivePluginConfig, icon, siyuan } from "../../sy-tomato-plugin/src/libs/utils";
    import { events } from "../../sy-tomato-plugin/src/libs/Events";
    import {
        prog, Progressive上一页, Progressive下一页,
        Progressive跳到分片或回到原文, Progressive添加当前文档到渐进阅读分片模式,
    } from "./Progressive";
    import { HtmlCBType } from "./constants";
    import { CARD_RECITE } from "./digestCardMode";
    import { buildFloatButtons, buildFlatCells, digestSubrankIds, reorderMainIds, type DigSubrankId, PIECE_MAIN_POOL, PIECE_TRAY_POOL, PIECE_ALL_MAIN_IDS, FREE_ALL_MAIN_IDS, DIGEST_ALL_MAIN_IDS, BOOK_ALL_MAIN_IDS, type FloatDocKind } from "./progFloatState";
    import { progStorage } from "./ProgressiveStorage";
    import { listWritingSlotTargets, insertDigestIntoPiece, insertBlocksIntoPiece, setPieceDoneState, fetchWritingPieces, mergePieceIntoNeighbor, feedBlocksToPool, moveDigestToPool } from "./writeBook";
    import { PROG_DONE_KEY } from "../../sy-tomato-plugin/src/libs/gconst";
    import { notifyFleetChanged } from "./fleetNotify";
    import { digSubrankOpen, floatbarFlatCollapsed, floatbarFreeMainBtns, floatbarDigestMainBtns, floatbarBookMainBtns, floatbarMainBtns } from "../../sy-tomato-plugin/src/libs/stores";
    import { progPaid } from "./theme";
    import { collapseFloatBar, expandFloatBar, floatSwapBook, freeFloatOff } from "./ProgressiveBtn";
    import { digestProgressiveBox, initDi, digestWholeDoc } from "./DigestProgressiveBox";
    import { queryDigestTree } from "./digestUtils";
    import { openFloatPopover, closeFloatPopover } from "./overlays";
    import { showDialog } from "../../sy-tomato-plugin/src/libs/DialogText";
    import { mount, onMount } from "svelte";
    import { showFloatTip, hideFloatTip, destroyFloatTip } from "./floatTip";
    import DigestTreePopover from "./DigestTreePopover.svelte";
    import ContentsPopover from "./ContentsPopover.svelte";
    import RouteGuidePopover from "./RouteGuidePopover.svelte";
    import OriginDigestPopover from "./OriginDigestPopover.svelte";
    import DigestAllDialog from "./DigestAllDialog.svelte";
    import { WordBuilder } from "./wordsUtils";
    import {
        flashBox, flashBox制卡, flashBox原地制卡,
        flashBox制卡并发到dailycard无引用, flashBox多行标记, CardType,
    } from "./FlashBox";
    import { pieceMovingBox, PieceMovingBox移动到上一分片内, PieceMovingBox移动到下一分片内 } from "./PieceMovingBox";
    import { pieceSummaryBox, PieceSummaryBox收集内容到文件 } from "./PieceSummaryBox";
    import {
        writingCompareBox, WC提取所有分片的笔记, WC提取笔记到底部, WC提取笔记,
        WC去除笔记颜色, WC恢复笔记颜色, WC合并所有分片到新文件,
    } from "./WritingCompareBox";
    import { isProtylePiece } from "./helper";
    import { openReviewSchedMenu, openDigestReviewMenu, removeRevisitBySource } from "./reviewMenu";
    import { PdigestReviewKey, ReviewKey, parseReview, isDue } from "./reviewQueue";
    import { openRefillMenu } from "./refillMenu";
    import { splitInPlaceRun } from "./splitInPlace";

    // v5 □5 浮条三态（docs/prog-v5-floatbar-design.md）：球（收起）↔ 浮条（展开）同屏只显示一个；
    // 片态出场直接展开，书/摘抄态收起成球。移动端保持顶栏（不做球）。
    interface PropsType {
        zIndexPlus: Writable<boolean>;
        show: Writable<boolean>;
        expanded: Writable<boolean>;
        kind: Writable<FloatDocKind | null>;
        title: Writable<string>;
        point: Writable<number>;
        noteID: Writable<string>;
        bookID: Writable<string>;
        dueText: Writable<string>;
        digOpen: Writable<boolean>;
    }
    let { zIndexPlus, show, expanded, kind, title, point, noteID, bookID, dueText, digOpen }: PropsType =
        $props();

    // 与 events.isMobile 同源（getFrontend 的移动分支）；app 会话内不变，顶层求一次即可。
    // 不 import events 单例判分叉——progressive 组件多引入 tomato 内部模块会扰动 bundle 模块序
    // （2026-08-25 实测：经 events 判分叉后移动端浮条不渲染），siyuan 官方导出无此问题。
    const isMobile = getFrontend() === "mobile" || getFrontend() === "browser-mobile";

    // 移动端形态开关（默认 true 顶部固定；false 回退可拖拽浮条）
    const useTopBar = isMobile && getProgressivePluginConfig().mobileTopBar !== false;

    // □10 方案 B：平铺区常驻铺开（无 [+]、无二级），moreOpen/advOpen 开合态消亡；
    // digOpen 是持久 store（□2 起开合随 digSubrankOpen 跨分片/跨会话记忆，未存过值=开；
    // 出场链不再强制展开，只归 ✂ 与 ⌥Z 显式命令管，见 ProgressiveBtn.ts）。

    // □14c 片态首行有序清单（全量 28 项任意可入，顺序即渲染序）：组件 $state 镜像 +
    // settingFactory 持久化——拖拽落子即时生效（set+write 落盘），设置面板保存 reload
    // 后重读。未进清单的钮不消失——buildFlatCells/advVisible 落回平铺区固有段位。
    // 载入即滤未知 id（未来退役动作的存量配置）：显示序≡数据序，拖拽 dropIndex 直插不偏移。
    // free/digest/book 态同机制接入（650189 两轮反馈：2026-09-09 自由态、2026-09-10 书/
    // 摘抄态）：各态独立 store 独立池，kind 切换（⌘数字 切页签）时镜像换源重载——浮条是
    // 单例复用，不换源会拿片态清单渲染别态
    function mainStoreOf(kind: FloatDocKind | null) {
        if (kind === "free") return floatbarFreeMainBtns;
        if (kind === "digest") return floatbarDigestMainBtns;
        if (kind === "book") return floatbarBookMainBtns;
        return floatbarMainBtns;
    }
    function mainPoolOf(kind: FloatDocKind | null): Set<string> {
        if (kind === "free") return FREE_ALL_MAIN_IDS;
        if (kind === "digest") return DIGEST_ALL_MAIN_IDS;
        if (kind === "book") return BOOK_ALL_MAIN_IDS;
        return PIECE_ALL_MAIN_IDS;
    }
    function loadMainIds(kind: FloatDocKind | null): string[] {
        return [...mainStoreOf(kind).get()].filter(id => mainPoolOf(kind).has(id));
    }
    let mainIds = $state<string[]>(loadMainIds($kind));
    function commitMainIds(next: string[]) {
        mainIds = [...next];
        const store = mainStoreOf($kind);
        store.set(mainIds);
        void store.write();
    }
    $effect(() => {
        void $kind;
        mainIds = loadMainIds($kind);
    });

    const buttons = $derived(
        $kind == null ? [] : buildFloatButtons($kind, { reciteInstalled: prog.isReciteInstalled(), mainIds }),
    );

    // 期3 素材入槽双入口（渲染层条件钮，不进 □14c 配置池——写作书专用动作无跨态配置语义）：
    // 拉式=写作书片态「插入素材」（开选择器）；推式=摘抄态「入槽」（两级菜单书→槽）。
    // writing 片判定同步查 booksInfos（出场链已加载完成，无 I/O）
    const isWritingPiece = $derived(
        $kind === "piece" && !!$bookID && !!(progStorage.peekBookInfo($bookID)?.writing),
    );
    // matfeed □2 写作书系文档判定（原书 book/槽片/片副本 piece——isManage 的放宽版）：
    // 驱动平铺区「管理素材池」一级格与 OriginDigestPopover 底部旧入口（片态同出，
    // 两面判定同源；free/digest 不在其列——free 无书、digest=被管理的素材本体）
    const isWritingDoc = $derived(
        ($kind === "book" || $kind === "piece") && !!$bookID && !!(progStorage.peekBookInfo($bookID)?.writing),
    );
    // □2 一级格拼接：managePool 挂「本书摘抄」（traceUp）之后——同区并列、语义相邻
    // （原四层链=traceUp→浮层→底部入口，新格=旧链终点的直通电梯）。不进 PIECE_LOW_POOL
    // 配置池（设置面板复用池=跨态通用动作，写作书专用同「插入素材」条件钮先例）；
    // piece 态 traceUp 被拖上首行时落尾部（buildFlatCells 滤除后 indexOf 落空兜底）
    function withManagePool(cells: string[]): string[] {
        const i = cells.indexOf("traceUp");
        return i >= 0 ? [...cells.slice(0, i + 1), "managePool", ...cells.slice(i + 1)] : [...cells, "managePool"];
    }
    const flatCells = $derived(
        $kind == null ? [] : isWritingDoc
            ? withManagePool(buildFlatCells($kind, { mainIds, reciteInstalled: prog.isReciteInstalled() }))
            : buildFlatCells($kind, { mainIds, reciteInstalled: prog.isReciteInstalled() }),
    );
    // □3 子排 id 序收单一事实源（digestSubrankIds）：whole（整摘）限片+自由态，自由态
    // 是右键退役后任意文档的整摘兜底；kind 空窗视同 digest 不渲染
    const digIds = $derived($kind == null ? [] : digestSubrankIds($kind));

    // □14b 平铺区折叠态（持久化偏好）：折叠=平铺区整个不渲染（浮条回落首行高度），
    // 与摘抄子排正交（临时动作层照常弹）；首行尾 chevron 钮切换，移动端顶栏同款
    let flatCollapsed = $state(floatbarFlatCollapsed.get());
    function toggleFlat() {
        flatCollapsed = !flatCollapsed;
        floatbarFlatCollapsed.set(flatCollapsed);
        void floatbarFlatCollapsed.write(); // set 先写内存 settingCfg，write 落盘
    }

    // ---- □14c 首行拖拽换位（HTML5 dnd，桌面四态全开；移动端不挂 draggable。
    // free 态接入=650189 反馈「自由态无法拖动排序」（2026-09-09）；digest/book 态
    // 接入=同用户第二轮「片摘处的浮窗也无法拖动排序」v3.6.1（2026-09-10）——旧注释
    // 「书/摘抄态 4 键固定编排无精简空间」是 □2/□7/□11 加钮前的过时认知（digest 态
    // 首行已 9 键、book 态 8 键），四态全可拖=行为一致性）----
    const canDrag = $derived(!isMobile);
    let dragId = $state<string | null>(null);    // 拖拽中的动作 id
    let dropIndex = $state<number | null>(null); // 首行插入位（显示序；null=不在首行上）

    function onDragStart(id: string, ev: DragEvent) {
        dragId = id;
        ev.dataTransfer.effectAllowed = "move";
        // 自定义 MIME：裸 text/plain 拖出浮条语义脏（思源编辑器只认自有 MIME 不误收，
        // 但自定义类型更干净）；Firefox 不 setData 不启动拖拽
        ev.dataTransfer.setData("application/x-prog-fb", id);
    }
    function onDragEnd() {
        dragId = null;
        dropIndex = null;
    }
    // 拖拽中翻片/切 kind（⌘数字 切页签）：canDrag 已失效但原生拖拽流不中断，残留态会让
    // 书态行显示幽灵拖拽/指示线、甚至把片态 id drop 进持久化清单——kind 一变即清（review P2）
    $effect(() => {
        void $kind;
        onDragEnd();
    });
    /** 首行 dragover：放行 drop + 钮中点二分算插入位（显示序） */
    function onRowDragOver(ev: DragEvent) {
        if (dragId == null) return;
        ev.preventDefault();
        ev.dataTransfer.dropEffect = "move";
        const btns = [...(ev.currentTarget as HTMLElement).querySelectorAll<HTMLElement>("button[data-fb-id]")];
        let idx = btns.length;
        for (let i = 0; i < btns.length; i++) {
            const r = btns[i].getBoundingClientRect();
            if (ev.clientX < r.left + r.width / 2) { idx = i; break; }
        }
        dropIndex = idx;
    }
    function onRowDrop(ev: DragEvent) {
        ev.preventDefault();
        ev.stopPropagation();
        if (dragId == null || dropIndex == null) return;
        // □2 P2-1 池成员守卫：managePool（写作书专属格）不在首行全量池——不拦会写垃圾值
        // 落盘且 drop 被接受却无渲染变化（载入时被 loadMainIds 过滤自愈，但当场体验静默无效）
        const pool = mainPoolOf($kind);
        if (!pool.has(dragId)) { onDragEnd(); return; }
        // 重排以渲染序为事实源（reasoning review P0-1）：digest 态 recite 未装时清单含
        // recite 但被滤除不渲染，「显示序≡数据序」破缺——数据序 splice 会系统性 off-by-one；
        // 按渲染序重排附带把隐藏 id 清出清单（渲染无感知，装上后平铺区兜底找回）
        commitMainIds(reorderMainIds(buttons.map(b => b.id), dragId, dropIndex));
        onDragEnd();
    }
    /** 平铺区 dragover/drop：拖入即移出首行（落回固有段位由 buildFlatCells/advVisible 过滤天然达成） */
    function onFlatDragOver(ev: DragEvent) {
        if (dragId == null) return;
        ev.preventDefault();
        ev.dataTransfer.dropEffect = "move";
        dropIndex = null;
    }
    function onFlatDrop(ev: DragEvent) {
        ev.preventDefault();
        ev.stopPropagation();
        if (dragId == null) return;
        commitMainIds(mainIds.filter(id => id !== dragId));
        onDragEnd();
    }

    // □11 三行制 tooltip（docs/prog-floatbar-ux-redesign.md □11.2）：按钮名\n用法一句话\n快捷键（如有）。
    // 用法句 = tomatoI18n.tip* getter（□11.3 清单）；多行由 .tooltip 类的 break-spaces 换行（floatTip.ts 单例）。
    const tip3 = (name: string, usage: string, w?: string) =>
        w ? `${name}\n${usage}\n${w}` : `${name}\n${usage}`;

    // □4 快捷键行（与高级组同款 .w() 通道）：钮↔命令行为链同款才挂——toPiece/origin(片态)
    // ≡跳到分片或回到原文、prev/nextPure≡上一页/下一页（同链 gotoBlock±1 纯翻页不删）、
    // addBook≡添加文档；next(下片删)≠下一页（删片语义不同）、continue≠开始学习（按钮=本书
    // 断点，命令无参走滚筒优先下一本书，多书必分叉）——均不硬挂（review P1-1）。
    // .w() 读 keymap 当前值跟随改键，aria-label 渲染期求值；刷新粒度=$show/$expanded 翻转、
    // $kind 切换、mainIds 变化——同态翻片不重渲染，改键后旧浮条停留旧键到下次收展/切态
    // （改键低频+恢复路径多，接受；PairBar 先例同款）。
    const TIPS: Record<string, () => string> = {
        digest: () => tip3(tomatoI18n.摘抄, tomatoI18n.tip摘抄),
        cards: () => tip3(tomatoI18n.附属卡, tomatoI18n.tip本书附属卡), // 名用无占位 getter（本书附属卡带「·到期 {N}」尾巴）
        swap: () => tip3(tomatoI18n.换书, tomatoI18n.tip换书),
        next: () => tip3($kind === "digest" ? tomatoI18n.下一条摘抄 : tomatoI18n.下片删,
            $kind === "digest" ? tomatoI18n.tip下一条摘抄 : tomatoI18n.tip下片删),
        prev: () => tip3($kind === "digest" ? tomatoI18n.上一条摘抄 : tomatoI18n.回看,
            $kind === "digest" ? tomatoI18n.tip上一条摘抄 : tomatoI18n.tip回看,
            $kind === "digest" ? undefined : Progressive上一页.w()),
        // origin 主排只有片/摘抄两态在用：片态=回原书带块级定位（2026-08-31 升级），
        // 摘抄态文案（回原书·定位摘抄原文）在渲染处特判覆盖
        origin: () => tip3(tomatoI18n.回原书, tomatoI18n.tip片回原书, $kind === "piece" ? Progressive跳到分片或回到原文.w() : undefined), // 摘抄态文案在渲染处特判
        nextPure: () => tip3(tomatoI18n.下一个分片, tomatoI18n.tip下一个分片, Progressive下一页.w()), // 托盘动作勾上主排后主排也要有文案
        delBack: () => tip3(tomatoI18n.上片删, tomatoI18n.tip上片删),
        quit: () => tip3(tomatoI18n.关闭分片, tomatoI18n.tip关闭分片),
        continue: () => tip3(tomatoI18n.继续读, tomatoI18n.tip继续读), // ⌥- 命令=滚筒全局轮转≠本书断点，不挂键
        toPiece: () => tip3(tomatoI18n.跳到分片, tomatoI18n.tip跳到分片, Progressive跳到分片或回到原文.w()), // □2 书态就地跳片
        summary: () => tip3(tomatoI18n.摘抄汇总, tomatoI18n.tip摘抄汇总),
        archive: () => tip3(tomatoI18n.归档本书, tomatoI18n.tip归档本书),
        recite: () => tip3(tomatoI18n.送进仿写, tomatoI18n.tip送进仿写),
        // □7 ✧复访动作组（digest 态）：无键=加入复访（□8 后补入口），有键=完成一轮/改节奏/退出
        revisit: () => tip3(tomatoI18n.复访, tomatoI18n.tip复访管理),
        // □11：tree=路线图浮层（digest 态）；addBook=📥 加书（□18 起 free/book/piece 三态常驻）
        tree: () => tip3(tomatoI18n.路线图, tomatoI18n.tip路线图),
        addBook: () => tip3(tomatoI18n.加书, tomatoI18n.tip加书, Progressive添加当前文档到渐进阅读分片模式.w()),
    };
    // 平铺区按钮全量 spec：池按钮落回平铺区时的渲染（图标+三行 tooltip+短标签同首行语义）
    // + 片态恒低频项。四态池钮都可能落平铺区（拖出首行兜底，2026-09-10 四态拖拽后
    // digest 态 next/prev/origin 与书态场景钮也要有落位文案——跨态异义按 $kind 特判，
    // 与 TIPS 表同口径）。名与格内短标签（FLAT_LABELS）同源
    const FLAT_TIPS: Record<string, () => string> = {
        digest: () => tip3(tomatoI18n.摘抄, tomatoI18n.tip摘抄), // 「…」暗示弹子排的旧单行态退役，三行制统一
        cards: () => tip3(tomatoI18n.附属卡, tomatoI18n.tip本书附属卡),
        swap: () => tip3(tomatoI18n.换书, tomatoI18n.tip换书),
        next: () => tip3($kind === "digest" ? tomatoI18n.下一条摘抄 : tomatoI18n.下片删,
            $kind === "digest" ? tomatoI18n.tip下一条摘抄 : tomatoI18n.tip下片删),
        prev: () => tip3($kind === "digest" ? tomatoI18n.上一条摘抄 : tomatoI18n.回看,
            $kind === "digest" ? tomatoI18n.tip上一条摘抄 : tomatoI18n.tip回看,
            $kind === "digest" ? undefined : Progressive上一页.w()),
        // digest 态 origin=回分片（定位摘抄原文，与首行 aria-label 特判同口径）；片态带快捷键行
        origin: () => $kind === "digest" ? tip3(tomatoI18n.回分片, tomatoI18n.tip回分片)
            : tip3(tomatoI18n.回原书, tomatoI18n.tip片回原书, $kind === "piece" ? Progressive跳到分片或回到原文.w() : undefined),
        addBook: () => tip3(tomatoI18n.加书, tomatoI18n.tip加书, Progressive添加当前文档到渐进阅读分片模式.w()), // □18：存量 mainIds 未含时平铺区兜底
        revisit: () => tip3(tomatoI18n.复访, tomatoI18n.tip复访管理), // digest 态池钮（✧ 复访动作组）落平铺区兜底
        tree: () => tip3(tomatoI18n.路线图, tomatoI18n.tip路线图), // digest 态池钮（□11 路线图浮层）
        summary: () => tip3(tomatoI18n.摘抄汇总, tomatoI18n.tip摘抄汇总), // digest/book 态池钮
        continue: () => tip3(tomatoI18n.继续读, tomatoI18n.tip继续读), // book 态池钮（▶ 本书断点）
        toPiece: () => tip3(tomatoI18n.跳到分片, tomatoI18n.tip跳到分片, Progressive跳到分片或回到原文.w()), // book 态池钮（□2 就地跳片）
        archive: () => tip3(tomatoI18n.归档本书, tomatoI18n.tip归档本书), // book 态池钮
        contents: () => tip3(tomatoI18n.打开目录, tomatoI18n.tip打开目录),
        refill: () => tip3(tomatoI18n.重插, tomatoI18n.tip重插),
        clean: () => tip3(tomatoI18n.删原文, tomatoI18n.tip删原文),
        nextPure: () => tip3(tomatoI18n.下一个分片, tomatoI18n.tip下一个分片, Progressive下一页.w()),
        delBack: () => tip3(tomatoI18n.上片删, tomatoI18n.tip上片删),
        delExit: () => tip3(tomatoI18n.删片退出, tomatoI18n.tip删片退出),
        quit: () => tip3(tomatoI18n.关闭分片, tomatoI18n.tip关闭分片),
        ignore: () => tip3(tomatoI18n.不再推送,
            $kind === "free" ? tomatoI18n.tip不再推送复访 : tomatoI18n.tip不再推送),
        // □11 浮层族：map=路线指引浮层、traceUp=原文侧追溯（书态；free 态 650189=关联摘抄，跨态异义）
        map: () => tip3(tomatoI18n.路线指引, tomatoI18n.tip路线指引),
        traceUp: () => tip3($kind === "free" ? tomatoI18n.关联摘抄 : tomatoI18n.本书摘抄,
            $kind === "free" ? tomatoI18n.tip关联摘抄 : tomatoI18n.tip本书摘抄),
        // □27 仿写本片（片态副本练习）；recite 在 digest 态是「把摘抄送进仿写」（文案在 TIPS，跨态同 id 异义）
        recite: () => tip3($kind === "digest" ? tomatoI18n.送进仿写 : tomatoI18n.仿写本片,
            $kind === "digest" ? tomatoI18n.tip送进仿写 : tomatoI18n.tip仿写本片),
        // □2 写作书系文档专属（isWritingDoc 一级格；大界面=批量复制/移动入槽）
        managePool: () => tip3(tomatoI18n.管理素材池, tomatoI18n.tip管理素材池),
    };
    const FLAT_ICONS: Record<string, string> = {
        digest: "iconProgScissors",
        cards: "iconProgCard",
        swap: "iconProgSwap",
        next: "iconProgNext",
        prev: "iconProgPrev",
        origin: "iconProgBook",
        addBook: "iconProgAddBook",
        revisit: "iconProgSched",
        tree: "iconProgTree",
        summary: "iconProgQuill",
        continue: "iconProgPlay",
        toPiece: "iconProgPiece",
        archive: "iconProgArchive",
        contents: "iconProgContents",
        refill: "iconProgRefill",
        clean: "iconProgClean",
        nextPure: "iconProgFFast",
        delBack: "iconProgDelBack",
        delExit: "iconProgDelExit",
        quit: "iconProgQuit",
        ignore: "iconProgIgnore",
        map: "iconProgMap",
        traceUp: "iconProgTraceUp",
        recite: "iconProgSend",
        managePool: "iconProgPoolManage",
    };
    // 平铺区图标取值（reasoning review P1-1）：next 跨态异义——digest=纯浏览下一条
    //（iconProgFFast，SCENE.digest 同款；iconProgNext 是「删后前进」形会误导「会删」）
    const flatIcon = (id: string) => id === "next" && $kind === "digest" ? "iconProgFFast"
        : (FLAT_ICONS[id] ?? "iconProgPiece");

    // □10 格内短标签（2-6 字，i18n 清单见 docs/prog-floatbar-ux-redesign.md □10 视觉规格；
    // 全名 tooltip 走 FLAT_TIPS，两层互不挤占；移动端无 hover 靠它兜底）
    const FLAT_LABELS: Record<string, () => string> = {
        digest: () => tomatoI18n.摘抄,
        cards: () => tomatoI18n.附属卡,
        swap: () => tomatoI18n.换书,
        next: () => $kind === "digest" ? tomatoI18n.下一条摘抄 : tomatoI18n.下片删,
        prev: () => $kind === "digest" ? tomatoI18n.上一条摘抄 : tomatoI18n.回看,
        origin: () => $kind === "digest" ? tomatoI18n.回分片 : tomatoI18n.回原书,
        addBook: () => tomatoI18n.加书,
        revisit: () => tomatoI18n.复访,
        tree: () => tomatoI18n.路线图,
        summary: () => tomatoI18n.摘抄汇总,
        continue: () => tomatoI18n.继续读,
        toPiece: () => tomatoI18n.跳到分片,
        archive: () => tomatoI18n.归档本书,
        nextPure: () => tomatoI18n.下一个分片,
        delBack: () => tomatoI18n.上片删,
        quit: () => tomatoI18n.关闭分片,
        contents: () => tomatoI18n.打开目录,
        refill: () => tomatoI18n.重插,
        clean: () => tomatoI18n.删原文,
        delExit: () => tomatoI18n.删片退出,
        ignore: () => tomatoI18n.不再推送,
        map: () => tomatoI18n.路线指引,
        traceUp: () => $kind === "free" ? tomatoI18n.关联摘抄 : tomatoI18n.本书摘抄,
        recite: () => $kind === "digest" ? tomatoI18n.送进仿写 : tomatoI18n.仿写本片,
        managePool: () => tomatoI18n.管理素材池,
    };
    // □11 三行制：子排名沿用单字短名，用法句补齐（card 与高级组同 id 不同义，各自 getter；
    // multi/dialog 随三 tab Dialog 退役摘除）。key 走 DigSubrankId 精确匹配（□3 review
    // P2-1：与 digestSubrankIds 漂移=编译错，防 icon undefined 渲染期崩）
    const DIG_TIPS: Record<DigSubrankId, () => string> = {
        inbox: () => tip3(tomatoI18n.留档, tomatoI18n.tip留档),
        // □4 落点变体（去向级覆盖，不落盘不改 digestLanding 全局档）：书/片态挂所属书下、
        // free 态挂源文档下（source 档原生语义）｜总夹/札记匣按是否在书（central 原生语义）
        tobook: () => tip3(tomatoI18n.摘抄挂书侧, tomatoI18n.tip摘抄挂书侧),
        tohub: () => tip3(tomatoI18n.摘抄归总夹, tomatoI18n.tip摘抄归总夹),
        // 就地断句（2026-09-09）：Pro 标随钮名走（子排钮无锁角标，执行层兜底门禁+toast 引导）
        splitinplace: () => tip3(tomatoI18n.就地断句 + " Pro", tomatoI18n.tip就地断句),
        think: () => tip3(tomatoI18n.思考, tomatoI18n.tip思考),
        card: () => tip3(tomatoI18n.背诵, tomatoI18n.tip背诵),
        review: () => tip3(tomatoI18n.复访, tomatoI18n.tip复访),
        word: () => tip3(tomatoI18n.单词, tomatoI18n.tip单词),
        wordai: () => tip3(tomatoI18n.生词AI, tomatoI18n.tip生词AI),
        write: () => tip3(tomatoI18n.仿写, tomatoI18n.tip仿写),
        sched: () => tip3(tomatoI18n.重访调度, tomatoI18n.tip重访调度),
        whole: () => tip3(tomatoI18n.整篇摘抄, tomatoI18n.tip整篇摘抄),
    };
    const DIG_ICONS: Record<DigSubrankId, string> = {
        inbox: "iconProgInbox",
        tobook: "iconProgDigestToBook",  // □4 落点变体：书+页内两行（裸 iconProgBook 撞主排 origin，vision P1-1）
        tohub: "iconProgDigestToHub",    // □4 落点变体：folder 线稿（iconProgContents 撞低频区打开目录）
        splitinplace: "iconSplitTB",    // 就地断句：⇧⌥X「摘抄并断句」命令同款现成 sprite
        think: "iconProgThink",
        card: "iconProgRecite",
        review: "iconHistory", // 期2 复访档：内核内置历史图标（滚动复习语义）
        word: "iconProgWord",
        wordai: "iconProgWordAI",
        write: "iconProgWrite",
        sched: "iconProgSched",
        whole: "iconProgPiece",
    };

    // ---- 期3 素材入槽双入口动作 ----
    /** 拉式：写作书片态「插入素材」→ MaterialPicker 选择器 */
    function openMaterialPickerForPiece() {
        if ($noteID && $bookID) prog.openMaterialPicker($noteID, $bookID);
    }

    /** 推式：摘抄态「入槽」→ 两级菜单（书→未定稿槽/素材池）；入槽=整条摘抄转实尾插。
     *  菜单构建/视觉对齐/遮挡让路统一在 prog.openSlotMenuCommon（□1 与直送钮/命令共用）。
     *  digestID 开菜单前捕获（P1-2）：$noteID 在点槽项时才求值，菜单开着切页签会漂到
     *  新文档把错文档整篇复制进槽——与直送钮 sourceID 捕获同款纪律。
     *  □1 整篇搬运：同菜单池动作=「移入素材池」（moveDocs 保 id 胶囊血缘不断），源书
     *  不列池项（excludeBookID；槽项照常——同书素材入自己书的槽是正当操作） */
    async function openSlotMenuForDigest(ev: MouseEvent) {
        const digestID = $noteID;
        const fromBookID = $bookID;
        const targets = await listWritingSlotTargets();
        if (targets.length === 0) {
            void siyuan.pushMsg(tomatoI18n.还没有可入槽的写作书, 2500);
            return;
        }
        prog.openSlotMenuCommon(ev.clientX, ev.clientY, targets,
            (s, t) => insertDigestIntoPiece(s.docID, t.bookID, digestID),
            {
                label: tomatoI18n.移入素材池,
                done: book => tomatoI18n.已移入素材池书名(book),
                excludeBookID: fromBookID ?? undefined,
                run: t => moveDigestToPool(t.bookID, digestID),
            });
    }

    /** 直送：任意阅读文档选中块不经摘抄池转实进槽（不建摘抄本体——素材即普通文本
     *  无卡语义，血缘=源doc#块ID 徽标跳回原文出处）。选中块在开菜单前捕获（菜单/焦点
     *  转移后选区不可靠——拆分同款）；cursorOnly 光标兜底块算数（对齐摘抄的宽松语义，
     *  直送可逆宁顺勿拦——与拆分的宁严勿错相反）。身份守卫不吃 events.prototype 兜底
     *  （块引浮窗同文档劫持窗口，toPiece 注释 P1-1 同源） */
    async function openDirectSlotMenu(ev: MouseEvent) {
        const protyle = getAllEditor().find(p => p?.protyle?.block?.rootID === $noteID)?.protyle ?? null;
        if (!protyle || protyle.block?.rootID !== $noteID) {
            void siyuan.pushMsg(tomatoI18n.分片编辑器未就绪, 2500);
            return;
        }
        const { ids } = await events.selectedDivs(protyle);
        if (!ids || ids.length === 0) {
            void siyuan.pushMsg(tomatoI18n.请先选中要入槽的内容, 2500);
            return;
        }
        const captured = [...ids];
        const sourceID = $noteID as string;
        const targets = await listWritingSlotTargets();
        if (targets.length === 0) {
            void siyuan.pushMsg(tomatoI18n.还没有可入槽的写作书, 2500);
            return;
        }
        prog.openSlotMenuCommon(ev.clientX, ev.clientY, targets,
            (s, t) => insertBlocksIntoPiece(s.docID, t.bookID, sourceID, captured),
            // □1 划词直喂：同菜单每本书首项「→ 收进素材池」（选中块建新素材文档进目标书池，
            // 无槽空书唯一目标——素材来源=在读的所有书，写作书只是目的地）
            {
                label: tomatoI18n.收进素材池,
                done: book => tomatoI18n.已收进素材池书名(book),
                run: t => feedBlocksToPool(t.bookID, sourceID, captured).then(id => id ? 1 : 0),
            });
    }

    // ---- 期4 片管理动作（写作书片态条件钮，与插入素材同区） ----
    /** 当前片定稿位：出场/翻片时异步拉一次（getBlockAttrs HTTP 直查无索引延迟）；
     *  翻片竞态守卫：晚到的旧片响应不覆盖新片图标（crumbs/probeRevisitDue 同款 house style） */
    let pieceDone = $state(false);
    $effect(() => {
        const nid = $noteID;
        void $kind;
        pieceDone = false;
        if (nid && $bookID && progStorage.peekBookInfo($bookID)?.writing) {
            void siyuan.getBlockAttrs(nid)
                .then(a => { if (get(noteID) === nid) pieceDone = a?.[PROG_DONE_KEY] === "1"; })
                .catch(() => { /* 拉不到按未定稿渲染，点击时再落 IAL */ });
        }
    });

    /** 定稿/解除（可逆）：乐观翻转+失败回滚；进度占比变化即时通知舰队 */
    async function togglePieceDone() {
        if (!$noteID || !$bookID) return;
        const next = !pieceDone;
        pieceDone = next;
        try {
            await setPieceDoneState($noteID, next);
            notifyFleetChanged();
            await siyuan.pushMsg(next ? tomatoI18n.已定稿该片 : tomatoI18n.已解除定稿, 2500);
        } catch (e) {
            pieceDone = !next;
            console.error("togglePieceDone failed", e);
            await siyuan.pushMsg(tomatoI18n.定稿失败请重试, 2500);
        }
    }

    /** 拆为新片：选中块在弹窗前捕获（Dialog 聚焦后编辑器选区不可靠）。
     *  cursorOnly（光标兜底块）不算选中——拆分是搬块重构，宁严勿错；
     *  不吃 events.protyle 兜底（□3 已知错位窗口，摘错可逆、拆错是重构事故） */
    function openSplitPieceFromBar() {
        const protyle = resolveFloatDocProtyle();
        if (!protyle || protyle.block?.rootID !== $noteID) {
            void siyuan.pushMsg(tomatoI18n.分片编辑器未就绪, 2500);
            return;
        }
        void (async () => {
            const { ids, cursorOnly } = await events.selectedDivs(protyle);
            if (!ids || ids.length === 0 || cursorOnly) {
                await siyuan.pushMsg(tomatoI18n.请先选中要拆分的块, 2500);
                return;
            }
            prog.openSplitPieceDialog($noteID, $bookID, ids);
        })();
    }

    /** 与邻槽合并（slotmerge）：dir=-1 当前槽并入上一槽（视点所在槽被删 → 成功后
     *  视点跳保留槽）、dir=+1 吸收下一槽内容（视点不动）。无邻槽边界 toast；定稿
     *  双向拦映射现成移块两键；无 confirm 直接执行+toast（对齐移块/定稿轻交互，
     *  误删可从思源历史恢复——实机走查若觉风险高再议） */
    async function mergePieceFromBar(dir: -1 | 1) {
        if (!$noteID || !$bookID) return;
        const protyle = resolveFloatDocProtyle();
        if (!protyle || protyle.block?.rootID !== $noteID) {
            void siyuan.pushMsg(tomatoI18n.分片编辑器未就绪, 2500);
            return;
        }
        const pieces = await fetchWritingPieces($bookID);
        const cur = pieces.find(p => p.docID === $noteID);
        if (!cur) {
            void siyuan.pushMsg(tomatoI18n.合并失败请重试, 2500);
            return;
        }
        if (!pieces.some(p => p.point === cur.point + dir)) {
            await siyuan.pushMsg(dir < 0 ? tomatoI18n.没有上一槽 : tomatoI18n.没有下一槽, 2500);
            return;
        }
        try {
            const r = await mergePieceIntoNeighbor($bookID, $noteID, dir);
            notifyFleetChanged(); // 片数-1 → 舰队进度分母即时刷新
            await siyuan.pushMsg(dir < 0 ? tomatoI18n.已合并到上一槽 : tomatoI18n.已合并到下一槽, 2500);
            // 向上并=视点所在槽被删，跳保留槽（splitPiece 拆完 jumpTo 的对应物）；向下并视点不动
            if (dir < 0) await prog.jumpTo(r.keptDocID);
        } catch (e) {
            console.error("mergePieceFromBar failed", e);
            const msg = String((e as Error)?.message ?? "");
            if (msg.includes("kept piece done")) {
                await siyuan.pushMsg(tomatoI18n.该片已定稿不可移入, 2500);
            } else if (msg.includes("removed piece done")) {
                await siyuan.pushMsg(tomatoI18n.该片已定稿不可移出, 2500);
            } else {
                await siyuan.pushMsg(tomatoI18n.合并失败请重试, 2500);
            }
        }
    }

    /** 期5 汇编成稿（Pro）：书级入口（管理页同款签名）；Pro 验证+购买引导在 Box 内 */
    function compileWritingFromBar() {
        if (!$bookID) return;
        const box = progStorage.peekBookInfo($bookID)?.boxID;
        if (!box) return;
        void writingCompareBox.compileWritingBook($bookID, box);
    }

    // ---- □11 浮层族锚点：dispatch 透传最近一次点击坐标（按钮/浮条内均可作锚） ----
    let lastXY = { x: innerWidth / 2, y: innerHeight / 2 };
    function anchorXY(ev?: MouseEvent) {
        if (ev) lastXY = { x: ev.clientX, y: ev.clientY };
        return lastXY;
    }

    /** □11 路线图浮层（digest 态 tree 钮）：全摘抄树+本书批注 */
    /** □6 摘抄顺序遍历（digest 态 prev/next，bear 拍板双向纯浏览不删）：同书摘抄
     *  ctime 序线性走，与「全摘抄树」（tree 钮=跳转）互补=池内逐条走。flat 为
     *  ctime 降序（flat[0]=最新，startToLearn 同源）：next=更新的相邻 i-1、
     *  prev=更早的相邻 i+1；边界 toast 不弹跳。跳转同树钮 jumpTo 通道。 */
    async function jumpDigestNeighbor(step: 1 | -1) {
        const tree = await queryDigestTree($bookID);
        const i = tree.flat.findIndex(n => n.id === $noteID);
        if (i < 0) {
            await siyuan.pushMsg(tomatoI18n.未找到本条摘抄);
            return;
        }
        const target = tree.flat[i - step];
        if (!target) {
            await siyuan.pushMsg(step > 0 ? tomatoI18n.已是最新一条摘抄 : tomatoI18n.已是最早一条摘抄);
            return;
        }
        void prog.jumpTo(target.id);
    }

    function openTreePopover(ev?: MouseEvent) {
        openFloatPopover({
            title: tomatoI18n.路线图,
            x: anchorXY(ev).x, y: anchorXY(ev).y,
            component: DigestTreePopover,
            props: {
                bookID: $bookID,
                onJump: (id: string) => {
                    closeFloatPopover();
                    void prog.jumpTo(id);
                },
            },
        });
    }

    /** □11 目录浮层（contents 钮改道）：书大纲标题列表。□1（2026-09-01）按态分语义：
     *  片态=跳原文标题位置（openOriginBook 定位原标题块；回程靠原文上的书态浮条
     *  「跳到分片」）+ 高亮当前位置；书态=跳对应分片（现状不动，readThisPiece）；
     *  free 态（650189）=跳本文档标题位置（自指 $noteID，同片态 openOriginBook 链路）。 */
    function openContentsPopover(ev?: MouseEvent) {
        // 态/书/片号同一时刻快照（review P2-2：onJump 闭包不混「打开时快照+点击时活读」，
        // 浮层开着时键盘切页签换态，旧浮层点击仍按打开时的语义走，自洽不串台）
        const isPiece = $kind === "piece";
        const isFree = $kind === "free"; // free 无书：大纲直查本文档，bid 自指
        const bid = isFree ? $noteID : $bookID;
        const pt = isPiece ? $point : null;
        openFloatPopover({
            title: tomatoI18n.打开目录,
            x: anchorXY(ev).x, y: anchorXY(ev).y,
            component: ContentsPopover,
            props: {
                bookID: bid,
                point: pt,
                onJump: (blockID: string) => {
                    closeFloatPopover();
                    if (isPiece || isFree) void prog.openOriginBook(bid, blockID);
                    else void prog.readThisPiece(blockID);
                },
            },
        });
    }

    /** □11 🗺 路线指引浮层（四态 map 钮）：「你在这里，能去哪」当前态出边列表；
     * 书态附仿写联动页脚——开浮层前 IAL 惰性探测本书是否已在仿写模式
     * （custom-recite-start，被动读属性非 import recite 状态），决定按钮进/删语义 */
    async function openRouteGuidePopover(ev?: MouseEvent) {
        let reciteOn = false;
        let onSendRecite: (() => void) | undefined;
        if ($kind === "book" && $bookID) {
            // 属性名 = recite constants.ts RECITE_START（"custom-recite-start"，recite 侧注明
            // 勿改名=稳定契约）；读失败与未入模式同形收敛 false——标签最坏失真，动作侧
            // togglePractice 会重读真实属性自主定向，破坏方向另有 confirm 保护（review P2）
            const attrs = await siyuan.getBlockAttrs($bookID).catch(() => null);
            reciteOn = !!attrs?.["custom-recite-start"];
            onSendRecite = () => {
                closeFloatPopover();
                void sendBookToRecite();
            };
        }
        openFloatPopover({
            title: tomatoI18n.路线指引,
            x: anchorXY(ev).x, y: anchorXY(ev).y,
            component: RouteGuidePopover,
            props: { kind: $kind, reciteOn, onSendRecite },
        });
    }

    /** 仿写联动动作：未装仿写 toast 引导；已装转发 reciteTogglePractice（togglePractice
     * 作用于最近交互文档——书态浮条出场文档=本书；已入模式时 recite 侧自带 confirm 保护） */
    async function sendBookToRecite() {
        if (!prog.isReciteInstalled()) {
            await siyuan.pushMsg(tomatoI18n.未安装仿写提示, 2500);
            return;
        }
        await prog.sendToRecite();
    }

    /**
     * □27 仿写本片（副本练习，拍板 2026-08-30）：整片走整摘链路成永久副本（digestWholeDoc
     * 已 otab.open 自动打开）→ 对副本直接进仿写模式。片=读完即删（next primary）/重插清空
     * （含手写笔记），直接 on 片练习产物（批注+抽取/对比子文档挂片下）会陪葬，故走副本
     * （合摘抄永久留存哲学）。未装仿写恒可见 toast 引导（导流语义，同 □26 书态页脚）。
     */
    let pieceReciteInFlight = false; // 双击防抖：建副本+开练习约 1-2s，窗口内重入会双副本（review P2-4）
    async function runPieceRecite() {
        if (pieceReciteInFlight) return;
        if (!prog.isReciteInstalled()) {
            await siyuan.pushMsg(tomatoI18n.未安装仿写提示, 2500);
            return;
        }
        const protyle = resolveFloatDocProtyle();
        if (!protyle) {
            await siyuan.pushMsg(tomatoI18n.分片编辑器未就绪);
            return;
        }
        // 闪卡预览 protyle 只含单块，整摘副本会静默缺内容（照 ProgressiveBtn 判据拦截，review P2-1）
        if (protyle.element?.classList?.contains("card__block")) {
            await siyuan.pushMsg(tomatoI18n.分片编辑器未就绪);
            return;
        }
        pieceReciteInFlight = true;
        try {
            // forRecite（□28）：「仿写」前缀 + 副本前台打开（用户须被带到练习现场，不受
            // windowOpenStyle back/nop 档劫持——后台打开会让人留在原片+recite 背景错铺）
            const digestID = await digestWholeDoc(protyle, true);
            if (!digestID) return; // 空内容/目录未就绪已在链内 toast，不再叠加
            await prog.enterRecitePractice(digestID);
        } finally {
            pieceReciteInFlight = false;
        }
    }

    /** □29 摘抄清单大界面：浮层超量（>30 条）升级——搜索+全量，ShowAllBooks 同款 showDialog 挂载。
     *  freeDoc（群反馈 650189）：free 态传 $noteID 查本文档关联摘抄，标题/空态换「本文档」口径。
     *  期D manage 支路随 matfeed □2 收编进 prog.openManagePoolDialog（manage 态挂载
     *  单一事实源，浮条格/右键/旧浮层底入口三面共用），此处只服务清单态 */
    function openDigestAllDialog(freeDoc = false) {
        showDialog((target, dm) => {
            return mount(DigestAllDialog, {
                target,
                props: {
                    dm,
                    bookID: freeDoc ? $noteID : $bookID,
                    freeDoc,
                    onJumpDoc: (id: string) => {
                        dm.destroyBy();
                        void prog.jumpTo(id);
                    },
                },
            });
        }, {
            title: freeDoc ? tomatoI18n.本文档摘抄清单 : tomatoI18n.本书摘抄清单,
            width: events.isMobile ? "90vw" : undefined,
            // min() 钳矮视口：固定 700px 在 <700px 窗口把标题栏/关闭钮裁出屏（vision P1-3；
            // ShowAllBooks 同病属既有缺陷不扩修，新组件不继承）
            height: events.isMobile ? "180vw" : "min(700px, 90vh)",
        });
    }

    /** □11 原文侧追溯浮层（书态 traceUp 钮；□29 片态复用；free 态 650189）：本文档摘抄清单+当前块所属分片 */
    function openOriginDigestPopover(ev?: MouseEvent) {
        const s = events.selectedDivsSync(events.protyle?.protyle);
        // □29 片态定位直供浮条出场时解析的 $point（前端内存 ial 无属性窗口，选中笔记块/
        // 嵌套块/搬家块通吃——reasoning P1-1：按块反查会误报「不在分片索引中」）；
        // 书态选中块=书原文块，块 id 本身即索引键。free 无分片概念，locator 段传空不渲染
        const isPiece = $kind === "piece";
        // free 复用清单浮层：摘抄 ctime 自指 docID（resolveDigestOrigin self 支路），
        // bookID 传 $noteID 即查本文档关联摘抄（含摘抄上再摘抄的支路树）
        const isFree = $kind === "free";
        // 期D 写作书书态：清单=素材池，底部出「管理素材池」入口（批量发送大界面）；
        // matfeed □2 放宽到片态（isWritingDoc 两面同判定）并切 prog 直开通道。
        // 书身份快照（reasoning P1-1）：onManage/onJumpPiece 点击时活读 $bookID 会随
        // 键盘切页签漂移开错书——浮层列的是哪本书的清单，动作就跟哪本书
        const poolBookID = $bookID;
        openFloatPopover({
            title: isFree ? tomatoI18n.关联摘抄 : tomatoI18n.本书摘抄,
            x: anchorXY(ev).x, y: anchorXY(ev).y,
            component: OriginDigestPopover,
            props: {
                bookID: isFree ? $noteID : $bookID,
                blockID: isPiece || isFree ? "" : (s?.ids?.at(0) ?? ""),
                point: isPiece ? $point : undefined,
                freeDoc: isFree,
                manage: isWritingDoc,
                onShowAll: () => {
                    closeFloatPopover();
                    openDigestAllDialog(isFree);
                },
                onManage: () => {
                    closeFloatPopover();
                    // 浮层开着键盘切页签不触发浮层外点关闭（openContentsPopover 同款快照纪律）：
                    // $bookID 点击时活读会开错书的池——开浮层前快照（reasoning P1-1）
                    void prog.openManagePoolDialog(poolBookID);
                },
                onJumpDoc: (id: string) => {
                    closeFloatPopover();
                    void prog.jumpTo(id);
                },
                onJumpPiece: (point: number) => {
                    closeFloatPopover();
                    // 同 P1-1：jumpToPiece 目标书跟浮层快照走（活读漂移=跳错书的片）
                    void prog.jumpToPiece(poolBookID, point);
                },
            },
        });
    }

    /** 主按钮 dispatch（公共组+场景组；id 对应 progFloatState.buildFloatButtons） */
    async function onBtn(id: string, ev?: MouseEvent) {
        switch (id) {
            case "digest":
                digOpen.set(!$digOpen);
                void digSubrankOpen.write(); // □2 持久记忆：set 只写内存，write 落盘（跨分片/跨会话记住）
                break;
            case "cards":
                await prog.openBookCards($bookID);
                break;
            case "swap":
                await floatSwapBook();
                break;
            case "next":
                if ($kind === "digest") {
                    await jumpDigestNeighbor(1);
                    break;
                }
                await prog.htmlBlockReadNextPeice($bookID, $noteID, HtmlCBType.deleteAndNext, $point);
                break;
            case "prev":
                if ($kind === "digest") {
                    await jumpDigestNeighbor(-1);
                    break;
                }
                await prog.htmlBlockReadNextPeice($bookID, $noteID, HtmlCBType.previous, $point);
                break;
            case "origin":
                if ($kind === "digest") {
                    await openOriginFromDigest();
                } else if ($kind === "piece") {
                    // 2026-08-31 升级：片态回原书带块级定位（原=仅打开原书文档）
                    await prog.returnToOriginFromPiece($noteID, $bookID);
                } else {
                    await prog.openOriginBook($bookID);
                }
                break;
            case "tree": // □11 路线图浮层（digest 态）：全摘抄树+本书批注，点击跳转
                openTreePopover(ev);
                break;
            case "addBook": // 📥 加书（□18 起三态常驻）：传 $noteID 锁定出场文档——无参走
                // getActiveDocID 会被闪卡预览/移动端漂到别的文档（reasoning review P1）
                await prog.addProgressiveReadingWithLock($noteID);
                break;
            case "continue":
                await prog.startToLearnWithLock($bookID);
                break;
            case "toPiece": {
                // □2 书态就地跳片：打开选中/光标块所在分片（≠continue=全局断点）。
                // 目标块双校验（reasoning review P1-1）：events.protyle 会被块引浮窗/搜索
                // 预览等非编辑器宿主劫持（setReadingPointMap 对一切带 .event 的 loaded 事件
                // 都写），光标兜底又是全局 selection——不校验会拿别文档的块去跳片、甚至
                // 改写别书的断点。解析按 $noteID 过滤，取块后 element.contains 再验一道。
                // □10：own 分支补「宿主是编辑器页签」过滤但不要求激活——按钮链身份源=浮条
                // 宿主 $noteID（分屏下可挂非激活页签），与命令链 getActiveProtyle 恒取激活
                // 页签语义不同构故不共用；块引浮窗预览恰为同文档时 own 只比 rootID 会劫持
                // 成功，element.contains 把主编辑器的合法选择误拒成 toast。判定=element
                // 自身带 data-id（编辑器页签的 protyle.element 即 tab.panelElement，唯一
                // 自带者；与出场链 isEditor 同构，不 import domUtils 避循环依赖）——勿改用
                // closest 上溯：搜索/反链/自定义页签的 protyle 是 panel 后代，closest 会把
                // 同型劫持误放行（review P1-1）。被滤后回落 find 兜底（页签编辑器在
                // getAllEditor editor 组恒先命中，依赖 app/src/layout/getAll.ts 组序）；移动端
                // 无页签 DOM 恒走 find 兜底，mobile.editor 在列行为等价。
                const own = events.protyle?.protyle;
                const protyle = own?.block?.rootID === $noteID && own?.element?.getAttribute("data-id") != null
                    ? own
                    : getAllEditor().find(p => p?.protyle?.block?.rootID === $noteID)?.protyle ?? null;
                const info = events.selectedDivsSync(protyle);
                const sel0 = info?.selected?.[0];
                const blockID = sel0 && info.element?.contains(sel0) ? info.ids.at(0) : undefined;
                if (!blockID) {
                    await siyuan.pushMsg(tomatoI18n.请选择段落块进行跳转);
                    break;
                }
                await prog.readThisPiece(blockID);
                break;
            }
            case "summary":
                await prog.openDigestSummary($bookID);
                break;
            case "archive":
                await prog.archiveBookWithConfirm($bookID);
                break;
            case "recite":
                // □27 跨态异义：片态=仿写本片（副本练习，本片易逝不直接 on 片）；摘抄态=把摘抄送进仿写
                if ($kind === "piece") {
                    await runPieceRecite();
                } else {
                    await prog.sendToRecite();
                }
                break;
            case "revisit": // □7 ✧ 复访动作组（digest 态）：两态菜单；动作落盘后复查红点
                // 期2 □2 A：bookID 传 ✧ 菜单四态标题（卡组判定按书夹查）
                await openDigestReviewMenu($noteID, ev ?? { clientX: 0, clientY: 0 }, () => probeRevisitDue(), $bookID);
                break;
            case "nextPure": // 托盘动作勾上首行后走首行入口，同平铺区低频通道
            case "delBack":
            case "quit":
                await onLowFreq(id);
                break;
            default: {
                // □14c：低频/高级钮拖上首行后的点击路由（与上两组 id 集不相交；
                // ev 透传给浮层族当锚点——review P2：contents/map 拖上首行不丢坐标）
                const adv = ADV_ITEM_MAP.get(id);
                if (adv) await runAdv(adv);
                else await onLowFreq(id, ev);
            }
        }
    }

    /** □14c 首行钮 tooltip 分派：池钮走 TIPS、低频走 FLAT_TIPS、高级走三行制（含快捷键行）；
     *  □30 高级 Pro 钮未激活追加尾注行（前三分支的 id 不在 ADV_ITEM_MAP，无需尾注） */
    const mainTip = (id: string): string => {
        // □27 recite 跨态异义：片态=仿写本片（FLAT_TIPS），digest 态=把摘抄送进仿写（TIPS）
        if (id === "recite" && $kind === "piece") return FLAT_TIPS[id]();
        if (TIPS[id]) return TIPS[id]();
        if (FLAT_TIPS[id]) return FLAT_TIPS[id]();
        const it = ADV_ITEM_MAP.get(id);
        if (it) return tip3(it.label(), ADV_USAGE[id]?.() ?? it.label(), it.spec.w()) + proNote(isAdvPro(id));
        return id;
    };

    /** 摘抄态回原书：□16 智能链（progref→片/文档→序号重切→书），逻辑在 Progressive.openOriginFromDigest */
    async function openOriginFromDigest() {
        const ids = events.selectedDivsSync(events.protyle?.protyle)?.ids ?? [];
        await prog.openOriginFromDigest($noteID, ids);
    }

    // ---- □11 digest 态路径胶囊：显示降级后实际可达目标（书名 / 父摘抄），点击走四级链 ----
    let crumbs = $state("");
    $effect(() => {
        const id = $noteID;
        void $kind;            // 态换代重求值
        crumbs = "";
        if ($kind !== "digest" || !id) return;
        void prog.digestCrumbs(id).then(t => {
            if (get(noteID) === id) crumbs = t; // 竞态守卫：翻页后不回写旧值
        }).catch(() => { }); // API 异常静默——胶囊是装饰层不报错打扰（review P2）
    });

    // ---- □7 复访到期红点（digest 态 revisit 钮角）：读文档 IAL 解析 due。不走出场链
    //      attrs 快照——□8 后补入口刚打的键巨书实测 24s+ 才反映进快照，直查内核真值
    //      （单文档 getBlockAttrs 轻查询）；菜单动作后 onApplied 复查，完成/推迟/移除即灭点。
    //      期2 □2 B 双源化：文档内 think 块级到期也点亮红点（SQL 直查真值，不走快照）----
    let revisitDue = $state(false);
    function probeRevisitDue(id = $noteID) {
        if (!id) return;
        const now = Date.now();
        void siyuan.getBlockAttrs(id).then(attrs => {
            if (get(noteID) !== id) return; // 竞态守卫：翻页后不回写旧值（crumbs 同款）
            const s = parseReview(attrs?.[PdigestReviewKey]);
            revisitDue = !!s && isDue(s, now);
        }).catch(() => { }); // 装饰层不报错打扰
        void siyuan.sql(
            `select a.value as v from attributes as a where a.name="${ReviewKey}" and a.root_id="${id}" limit 100`,
        ).then((rows: any[]) => {
            if (get(noteID) !== id) return;
            // think 多块任一到期即亮；done/垃圾值 parseReview 过滤（与 digestStateOf 口径一致）
            const thinkDue = (rows ?? []).some(r => {
                const s = parseReview(r?.v);
                return !!s && s.mode !== "done" && isDue(s, now);
            });
            if (thinkDue) revisitDue = true; // 只置亮不置灭——pdigest 分支是唯一灭点，竞态下宁误亮勿漏
        }).catch(() => { });
    }
    $effect(() => {
        const id = $noteID;
        void $kind;            // 态换代重求值
        revisitDue = false;
        if ($kind === "digest" && id) probeRevisitDue(id);
    });

    /** 平铺区低频段旧动作（HtmlCBType 单入口）+ □11 浮层族改道 */
    async function onLowFreq(id: string, ev?: MouseEvent) {
        switch (id) {
            case "contents": // □11：contents 文档机制退役，改弹目录浮层
                openContentsPopover(ev);
                break;
            case "map": // □11 路线指引浮层（四态通用）；书态附仿写联动页脚
                await openRouteGuidePopover(ev);
                break;
            case "traceUp": // □11 原文侧追溯浮层（书态）
                openOriginDigestPopover(ev);
                break;
            case "managePool": // □2 入口前移：写作书系文档（原书/槽片/片副本）一级直开素材池管理大界面
                void prog.openManagePoolDialog($bookID);
                break;
            case "refill": // □22 重插翻新：断句选档菜单 → confirm 清空警告 → refillPiece
                openRefillMenu(ev ?? { clientX: 0, clientY: 0 },
                    stype => prog.refillPiece($bookID, $noteID, $point, stype));
                break;
            case "clean":
                await prog.htmlBlockReadNextPeice($bookID, $noteID, HtmlCBType.cleanOriginText, $point);
                break;
            case "nextPure": // 纯前进不删（旧浮条「下一个分片」，v5 曾丢入口、平铺区找回）
                await prog.htmlBlockReadNextPeice($bookID, $noteID, HtmlCBType.next, $point);
                break;
            case "delBack":
                await prog.htmlBlockReadNextPeice($bookID, $noteID, HtmlCBType.deleteAndBack, $point);
                break;
            case "delExit":
                await prog.htmlBlockReadNextPeice($bookID, $noteID, HtmlCBType.deleteAndExit, $point);
                break;
            case "quit": // 关闭分片（退出分片模式，不删）
                await prog.htmlBlockReadNextPeice($bookID, $noteID, HtmlCBType.quit, $point);
                break;
            case "ignore":
                if ($kind === "free") {
                    // 期2「不再推送」：该源文档全部摘抄的复访批量移除（confirm 后执行；
                    // 书忽略与复访正交——free 态不走 ignoreBook）
                    confirm("", tomatoI18n.不再推送复访确认, async () => {
                        const n = await removeRevisitBySource($noteID);
                        await siyuan.pushMsg(n > 0 ? tomatoI18n.已移除N条复访(n) : tomatoI18n.暂无复访摘抄);
                    });
                } else {
                    await prog.htmlBlockReadNextPeice($bookID, $noteID, HtmlCBType.ignoreBook, $point);
                }
                break;
        }
    }

    /** 平铺区分发：池钮（未勾落平铺区）走首行动作同款，其余走低频通道。
     *  recite（□27）在 EXTRA_MAIN 池但不在 PIECE_MAIN_POOL——不并入则落进
     *  onLowFreq 的 switch 静默吞掉（e2e 实锤：无 toast 无副本零报错），须并入池分流。
     *  revisit/tree/summary/continue/toPiece/archive（2026-09-10 digest/book 态池钮）
     *  同理并入——池钮落平铺区一律走首行动作（onBtn 有全量 case） */
    const FLAT_POOL_IDS = new Set([...PIECE_MAIN_POOL, ...PIECE_TRAY_POOL, "recite",
        "revisit", "tree", "summary", "continue", "toPiece", "archive"]);
    function onFlat(id: string, ev?: MouseEvent) {
        if (FLAT_POOL_IDS.has(id)) {
            void onBtn(id, ev);
            return;
        }
        void onLowFreq(id, ev);
    }

    // ============ 高级功能四组（v5 □7 制卡/收集/提取整理族收编 + □10 收进平铺区常驻铺开；
    // □30 起 VIP 项未激活也渲染：prog-fb-pro 灰档（body.prog-unpaid 控显隐）+ tooltip 尾注
    // + 点击引导 toast——灰掉的功能本身就是广告位；菜单/命令通道门禁仍在 winHotkey.menu/cmd） ============

    /** 平铺区高级项：spec=winHotkey 返回（VIP 门禁/平台快捷键；langText 退役出 tooltip——□11 名行用格内短标签），label=格内短标签，run 点击时执行 */
    interface AdvItem {
        id: string;
        icon: string;
        label: () => string;
        spec: { menu: () => boolean; w: () => string; vip?: boolean };
        run: (protyle: IProtyle, ctx: { markKey: string }) => void | Promise<void>;
    }

    // 分组即渲染顺序（制卡 | 收集 | 移动 | 提取整理），组界沿 .prog-fb-adv-group 容器；
    // icon 一律 progIcons 线稿（spec.icon 是 emoji/思源原生名，不再使用），语义映射：
    // 多行标记→iconProgMulti、收集→iconProgInbox、去色→iconProgClean（橡皮）复用低频家族
    // □11 三行制第三行快捷键只有高级组有（spec.w() 平台化值）；card/multi 与子排同 id 不同义
    const ADV_USAGE: Record<string, () => string> = {
        card: () => tomatoI18n.tip制卡,
        cardHere: () => tomatoI18n.tip原地制卡,
        cardDailyN: () => tomatoI18n.tip制卡无引用,
        multi: () => tomatoI18n.tip多行,
        collect: () => tomatoI18n.tip收集,
        movePrev: () => tomatoI18n.tip移上一片,
        moveNext: () => tomatoI18n.tip移下一片,
        extractAll: () => tomatoI18n.tip提取全部,
        extractEnd: () => tomatoI18n.tip提取到底,
        extract: () => tomatoI18n.tip提取笔记,
        noColor: () => tomatoI18n.tip去色,
        reColor: () => tomatoI18n.tip恢复颜色,
        merge: () => tomatoI18n.tip合并,
    };
    const ADV_GROUPS: AdvItem[][] = [
        [
            { id: "card", icon: "iconProgCardAdd", label: () => tomatoI18n.制卡, spec: flashBox制卡, run: p => flashBox.makeCard(p, CardType.None) },
            { id: "cardHere", icon: "iconProgCardHere", label: () => tomatoI18n.原地制卡短, spec: flashBox原地制卡, run: p => flashBox.makeCard(p, CardType.Here) },
            { id: "cardDailyN", icon: "iconProgCardDailyN", label: () => tomatoI18n.制卡无引用, spec: flashBox制卡并发到dailycard无引用, run: p => flashBox.makeCard(p, CardType.None, undefined, true) },
            { id: "multi", icon: "iconProgMulti", label: () => tomatoI18n.多行, spec: flashBox多行标记, run: p => flashBox.multilineMark(p) },
        ],
        [
            { id: "collect", icon: "iconProgInbox", label: () => tomatoI18n.收集, spec: PieceSummaryBox收集内容到文件, run: p => pieceSummaryBox.copyBlocks(p) },
        ],
        [
            { id: "movePrev", icon: "iconProgMoveUp", label: () => tomatoI18n.移上一片, spec: PieceMovingBox移动到上一分片内, run: p => pieceMovingBox.move(p, -1) },
            { id: "moveNext", icon: "iconProgMoveDown", label: () => tomatoI18n.移下一片, spec: PieceMovingBox移动到下一分片内, run: p => pieceMovingBox.move(p, 1) },
        ],
        [
            { id: "extractAll", icon: "iconProgExtractAll", label: () => tomatoI18n.提取全部, spec: WC提取所有分片的笔记, run: (p, c) => writingCompareBox.extractAllNotes(p, c.markKey) },
            { id: "extractEnd", icon: "iconProgExtractEnd", label: () => tomatoI18n.提取到底, spec: WC提取笔记到底部, run: p => writingCompareBox.extractNotes2bottom(p) },
            { id: "extract", icon: "iconProgExtract", label: () => tomatoI18n.提取笔记, spec: WC提取笔记, run: (p, c) => writingCompareBox.extractNotes(p.block?.rootID ?? "", p.notebookId, c.markKey) },
            { id: "noColor", icon: "iconProgClean", label: () => tomatoI18n.去色, spec: WC去除笔记颜色, run: p => writingCompareBox.noColor(p) },
            { id: "reColor", icon: "iconProgRecolor", label: () => tomatoI18n.恢复颜色, spec: WC恢复笔记颜色, run: p => writingCompareBox.noColor(p, false) },
            { id: "merge", icon: "iconProgMerge", label: () => tomatoI18n.合并, spec: WC合并所有分片到新文件, run: (p, c) => writingCompareBox.extractAsBook(p.notebookId, p.block?.rootID ?? "", p.notebookId, c.markKey) },
            // 「对比原文」已退役（□9）：仿写对比归 recite，组 7→6
        ],
    ];

    /** □14c 高级项 id → AdvItem（拖上首行后的 tooltip/点击路由复用） */
    const ADV_ITEM_MAP = new Map(ADV_GROUPS.flat().map(it => [it.id, it]));

    // ---- □30 门禁可视化：Pro 判定 + tooltip 尾注 ----
    // vip 单一事实源=winHotkey 第五参（spec.vip）；progPaid null（verify 未回）按付费态
    // 渲染不闪灰（FleetFlame 先例），verify 失败后 $progPaid=false 灰档/尾注/引导齐活
    const isAdvPro = (id: string) => ADV_ITEM_MAP.get(id)?.spec.vip === true;
    const proNote = (pro: boolean) => (pro && $progPaid === false) ? `\n${tomatoI18n.Pro功能尾注}` : "";

    /** 浮条身份文档的 protyle 解析（whole/adv/仿写本片族：操作对象=浮条所示文档）：
     *  $noteID 直查优先——出场链 300ms debounce 窗口内 events.protyle 已指向新文档而
     *  浮条仍显示旧文档，events 优先会静默操作错对象（□3 review P1-1）。不 import
     *  docUtils（circular dep 破坏构建） */
    function resolveFloatDocProtyle(): IProtyle | null {
        return getAllEditor().find(p => p?.protyle?.block?.rootID === $noteID)?.protyle
            ?? events.protyle?.protyle
            ?? null;
    }

    async function runAdv(it: AdvItem) {
        // □30 未激活点击引导（灰但可点，歧义由点击反馈消解）；快捷键通道门禁另在 winHotkey.cmd
        if (it.spec.vip && $progPaid === false) {
            await siyuan.pushMsg(tomatoI18n.Pro功能尾注, 2500);
            return;
        }
        const protyle = resolveFloatDocProtyle();
        if (!protyle) {
            // □10 常驻化后失去旧 toggleAdv 的「解析不出编辑器不展开」守卫——格可见但点了
            // 没反应违反直觉，toast 兜底（reasoning review P2）
            await siyuan.pushMsg(tomatoI18n.分片编辑器未就绪);
            return;
        }
        const { markKey } = isProtylePiece(protyle);
        await it.run(protyle, { markKey });
    }

    /** 常驻求值（□10 平铺区无开合态）：□30 起 VIP 项未激活也渲染（灰档+点击引导），
     * 菜单/命令通道的门禁仍在 winHotkey.menu/cmd 生效；store 门（menu 的另一半）只对
     * 非 vip 项照旧过滤——七个 vip 项目前均无 store 参数，未来给 vip 项挂 store 开关时
     * 须改此条件（否则 store 关闭仍渲染，review P2 备案）。空组连带段界一起消失；
     * 高级四组只在片态渲染（片态门）。menu() 内的门是普通模块读取（非响应式）追踪
     * 不到——借 $noteID 做换代信号：翻片必换 noteID，至少保证每片重求值一次（如今
     * 激活主路径必 reload + $progPaid 响应式即生效，换代信号只服务 store 门项显隐）。
     * □14c：已进首行清单的高级项从组里滤除（拖上首行的钮不在平铺区重复出现） */
    const advVisible = $derived.by(() => {
        void $noteID;
        if ($kind !== "piece") return [];
        const inMain = new Set(mainIds);
        return ADV_GROUPS.map(g => g.filter(it => (it.spec.menu() || it.spec.vip) && !inMain.has(it.id))).filter(g => g.length > 0);
    });

    // ============ 摘抄子排（✂ inline 展开的去向分诊，docs/prog-v5-floatbar-design.md §4） ============

    /** 子排选中类动作的 protyle 解析兜底（runDigest/runWord 共用）：语义=跟随用户当前
     *  操作现场，events.protyle（点过编辑器才有值，?id= 冷启动不算）优先——用户刚在
     *  别的文档选中块时摘的是现场选中块；解析不出按浮条出场文档 ID 直查兜底，再不出
     *  toast（与 runAdv 同口径，review P2：静默 return=点了没反应违反直觉）。whole/
     *  adv/仿写本片族走 resolveFloatDocProtyle（浮条身份），勿混用 */
    function resolveSubrankProtyle(): IProtyle | null {
        return events.protyle?.protyle
            ?? getAllEditor().find(p => p?.protyle?.block?.rootID === $noteID)?.protyle
            ?? null;
    }

    async function runDigest(split = false, question = false, cardMode?: string, review = false, landingOverride?: "source" | "central") {
        const protyle = resolveSubrankProtyle();
        if (!protyle) {
            await siyuan.pushMsg(tomatoI18n.分片编辑器未就绪);
            return;
        }
        const s = await events.selectedDivs(protyle);
        if (!s || s.ids.length === 0) {
            await siyuan.pushMsg(tomatoI18n.请先选择要摘抄的块);
            return;
        }
        const di = await initDi(s, protyle, digestProgressiveBox.settings);
        if (cardMode) di.cardMode = cardMode; // 去向级覆盖，不 saveCardMode 不改书全局
        if (landingOverride) di.landingOverride = landingOverride; // □4 落点同款覆盖语义
        await di.digest(split, question, review);
    }

    async function runWord(ai = false) {
        const protyle = resolveSubrankProtyle();
        if (!protyle) {
            await siyuan.pushMsg(tomatoI18n.分片编辑器未就绪);
            return;
        }
        const s = await events.selectedDivs(protyle);
        if (!s?.rangeText) {
            await siyuan.pushMsg(tomatoI18n.请先选中文本);
            return;
        }
        const di = await initDi(s, protyle, digestProgressiveBox.settings);
        const word = new WordBuilder(digestProgressiveBox.settings);
        word.plugin = digestProgressiveBox.plugin;
        word.anchorID = di.anchorID;
        word.docID = s.docID;
        word.boxID = s.boxID;
        word.docName = s.docName;
        word.rangeText = s.rangeText;
        word.bookID = di.bookID;
        word.allText = di.allText;
        await word.digest(false, ai); // □19：ai=true 走 AI 翻译造句（Pro 门禁在 wordsUtils 层，unpaid 引导）
    }

    async function onDig(id: DigSubrankId, ev?: MouseEvent) {
        switch (id) {
            case "inbox":
                await runDigest();
                break;
            case "tobook": // □4 落点变体：显式挂书/源侧（覆盖全局档，一次性）
                await runDigest(false, false, undefined, false, "source");
                break;
            case "tohub": // □4 落点变体：显式归总夹/札记匣（覆盖全局档，一次性）
                await runDigest(false, false, undefined, false, "central");
                break;
            case "splitinplace": { // 就地断句（2026-09-09）：选中段落块原位拆句，改的是原文档（Pro）
                const protyle = resolveSubrankProtyle();
                if (!protyle) {
                    await siyuan.pushMsg(tomatoI18n.分片编辑器未就绪);
                    break;
                }
                await splitInPlaceRun(protyle);
                break;
            }
            case "think":
                await runDigest(false, true);
                break;
            case "card":
                await runDigest(false, false, CARD_RECITE); // 每个摘抄都加入闪卡（cardMode 档位，与「执行摘抄(背诵)」命令同源）
                break;
            case "review": // 期2 复访档：摘抄+文档级滚动复习入队（cardMode 跟随书设置，不覆盖）
                await runDigest(false, false, undefined, true);
                break;
            case "word":
                await runWord();
                break;
            case "wordai": // □19 生词 AI：入口可见，收费点见 wordsUtils 门禁
                await runWord(true);
                break;
            case "write":
                // □27 片态同口径分流：仿写 write 钮在片态=副本练习（与首行 recite 钮语义统一，
                // 原直接 on 片行为与删片/重插冲突）；摘抄/自由态=原语义直接开练
                if ($kind === "piece") {
                    await runPieceRecite();
                } else {
                    await prog.sendToRecite();
                }
                break;
            case "sched": // v5 □12：选中块附加/调整重访调度（独立菜单，见 reviewMenu.ts）
                {
                    const ids = events.selectedDivsSync(events.protyle?.protyle)?.ids ?? [];
                    if (ids.length === 0) {
                        await siyuan.pushMsg(tomatoI18n.请先选择要摘抄的块);
                        return;
                    }
                    await openReviewSchedMenu(ids, ev ?? { clientX: innerWidth / 2, clientY: innerHeight / 2 });
                }
                break;
                case "whole": // □16 整摘：整片/整文 → digest 副本上散吧散吧（无需选中）；
                    // 浮条身份解析（□3 review P1-1：错位窗口内 events 优先会摘错文档）
                    {
                        const protyle = resolveFloatDocProtyle();
                        if (protyle) {
                            await digestWholeDoc(protyle);
                        } else {
                            // 反馈口径与 runPieceRecite 一致（□28 review P2-4：静默吞点击易误判按钮失灵）
                            await siyuan.pushMsg(tomatoI18n.分片编辑器未就绪);
                        }
                    }
                    break;
            default: {
                // 穷尽断言（review P2 备案）：联合加新 id 漏写 case = 编译错而非点击静默
                const _exhaustive: never = id;
                void _exhaustive;
            }
        }
    }

    function closeOverlays(_ev: MouseEvent) {
        // 摘抄子排 2026-08-31 起常驻（展开浮条即出现）：编辑器内点选/划选不再收起子排——
        // 收起只走首行 ✂ 切换（旧行为「点外面即收」逼用户每轮重开，正是要治的摩擦）。
        // .prog-topbar/.prog-popover 历史豁免随收起语义一并失效，仅留 tooltip 交互即隐。
        hideTip(); // 交互即隐：拖浮条/点按钮时锚要动，fixed 气泡不跟随
    }

    // ---- 浮条 tooltip：自建单例（□1 根治版，协议在 floatTip.ts 头注释）----
    // □10 曾改写思源 #tooltip 共享单例（b3-tooltips 纯 CSS 气泡被 .floatbar-body 裁切
    // 的防溢方案），但思源 block/popover.ts 的 document 级 mouseover 监听对一切非候选
    // 元素 hover 都会 hideTooltip() 该单例（含按钮内 svg/间隙/padding），叠加本组件
    // `btn === tipTarget` 早退形成「藏后同钮不重弹」锁死——真机 hover 大多不弹的根因
    // （2026-08-31 真实轨迹 e2e 实锤）。自建元素对思源隐藏生态隐身，pointer-events:none。
    // 委托挂 window 不依赖 FloatBar 内部结构；标记类 prog-fbtip 圈定退役 CSS 气泡的
    // 按钮——FloatBar 自带 ✕ 钮在 head（body 外无裁切）保留原生 CSS 气泡不受此管。
    let tipTarget: HTMLElement | null = null;
    function hideTip() {
        tipTarget = null;
        hideFloatTip();
    }
    function onFloatOver(ev: MouseEvent) {
        if (dragId != null) return; // 拖拽换位中 tip 不跟闪
        const t = ev.target as HTMLElement;
        const btn = t.closest?.(".prog-fb .prog-fbtip") as HTMLElement | null;
        if (!btn || btn === tipTarget) return; // 按钮内子元素间移动不重弹
        tipTarget = btn;
        showFloatTip(btn);
    }
    function onFloatOut(ev: MouseEvent) {
        if (!tipTarget) return;
        const to = ev.relatedTarget as HTMLElement | null;
        // 判据用 .floatbar-body 而非 .prog-fb（reasoning review P2-1）：head 标题区在
        // body 外且自带 b3-tooltips ✕ 钮——按根判会双气泡并存（我们的 tip 不隐 + ✕ 的
        // CSS 气泡起）；按钮区（主排/平铺/子排）全在 body 内，行内互移不隐。
        if (!to?.closest?.(".floatbar-body")) hideTip();
    }
    onMount(() => {
        // 条内滚动（.floatbar-body ov:auto）时按钮动而 fixed 气泡不动——capture 级滚动即隐。
        // 守卫 tipTarget：只收拾自己的气泡，别把思源原生 tooltip（无全局 scroll 隐藏协议）
        // 一并误杀（review P1-1）
        const onScroll = () => { if (tipTarget) hideTip(); };
        window.addEventListener("scroll", onScroll, true);
        return () => {
            window.removeEventListener("scroll", onScroll, true);
            tipTarget = null;
            destroyFloatTip(); // unmount（浮条销毁）不留悬空气泡
        };
    });
    $effect(() => {
        // 按钮 DOM 消失/换位的状态不止 show/expanded——kind 切换（⌘数字）、子排收起、
        // 平铺区折叠、拖拽换位都可能由键盘/异步驱动且无 mousedown 前置、浏览器不补发
        // mouseout，tip 会失联挂死（review P1-2）；依赖全挂 + isConnected 判定一次兜住
        void $kind; void $digOpen; void flatCollapsed; void mainIds;
        if (!$show || !$expanded || (tipTarget && !tipTarget.isConnected)) hideTip();
    });
</script>

<svelte:window onmousedown={closeOverlays} onmouseover={onFloatOver} onmouseout={onFloatOut} />

{#snippet btns()}
    <!-- □11 digest 态路径胶囊：来自哪本书/父摘抄（降级后实际可达目标），点击走四级链 -->
    {#if $kind === "digest" && crumbs}
        <button
            class="prog-fb-crumbs prog-fbtip"
            aria-label={tomatoI18n.tip路径胶囊}
            onclick={() => openOriginFromDigest()}
        ><span class="prog-fb-crumbs-book">{@html icon("iconProgBook", 12)}</span><span class="prog-fb-crumbs-text">{crumbs}</span></button>
    {/if}
    <div class="prog-fb-row" role="group" ondragover={onRowDragOver} ondrop={onRowDrop}>
        {#each buttons as b, i (b.id)}
            {#if dropIndex === i}<span class="prog-fb-dropmark"></span>{/if}
            {#if i > 0 && buttons[i - 1].group === "common" && b.group === "scene"}
                <span class="prog-fb-sep"></span>
            {/if}
            <button
                draggable={canDrag}
                data-fb-id={b.id}
                class="prog-fb-btn prog-fb-btn--{b.kind === 'common' ? 'normal' : b.kind} prog-fbtip {$digOpen && b.id === "digest" ? "prog-fb-btn--on" : ""}"
                class:prog-fb-btn--dragging={dragId === b.id}
                class:prog-fb-pro={isAdvPro(b.id)}
                aria-label={(b.id === "digest" && $digOpen) ? tomatoI18n.收起
                    : (b.id === "origin" && $kind === "digest") ? tip3(tomatoI18n.回分片, tomatoI18n.tip回分片)
                    : mainTip(b.id)}
                onclick={(e) => onBtn(b.id, e)}
                ondragstart={(e) => onDragStart(b.id, e)}
                ondragend={onDragEnd}
            >
                {@html icon(b.icon, 16)}
                {#if b.id === "cards" && $dueText}<span class="prog-fb-cardbadge">{$dueText}</span>{/if}
                {#if b.id === "revisit" && revisitDue}<span class="prog-fb-revisitdot"></span>{/if}
            </button>
        {/each}
        {#if dropIndex === buttons.length}<span class="prog-fb-dropmark"></span>{/if}
        <!-- 期3 素材入槽双入口（条件钮，不进配置池）：拉式=写作书片态 / 推式=摘抄态；
             期4 写作书片态追加：拆为新片（块级）/ 定稿（片级，动态图标=当前态）；
             期5 追加：汇编成稿（书级，Pro——灰档视觉+点击引导与高级组同口径）；
             slotmerge 追加：与上一槽/下一槽合并（片级结构操作，向上并视点跳保留槽） -->
        {#if isWritingPiece}
            <button
                class="prog-fb-btn prog-fb-btn--normal prog-fbtip"
                aria-label={tip3(tomatoI18n.插入素材, tomatoI18n.tip插入素材)}
                onclick={() => openMaterialPickerForPiece()}
            >{@html icon("iconProgMaterial", 16)}</button>
            <button
                class="prog-fb-btn prog-fb-btn--normal prog-fbtip"
                aria-label={tip3(tomatoI18n.拆为新片, tomatoI18n.tip拆为新片)}
                onclick={() => openSplitPieceFromBar()}
            >{@html icon("iconProgSplit", 16)}</button>
            <!-- slotmerge 合槽两钮（片级结构操作，与拆分同区）：向上=当前槽并上一槽（视点跟随跳转）、
                 向下=吸收下一槽（视点不动）；快捷键不做（⌃⌥U/I 已被移块占用，用户点名再加） -->
            <button
                class="prog-fb-btn prog-fb-btn--normal prog-fbtip"
                aria-label={tip3(tomatoI18n.与上一槽合并, tomatoI18n.tip与上一槽合并)}
                onclick={() => mergePieceFromBar(-1)}
            >{@html icon("iconUp", 16)}</button>
            <button
                class="prog-fb-btn prog-fb-btn--normal prog-fbtip"
                aria-label={tip3(tomatoI18n.与下一槽合并, tomatoI18n.tip与下一槽合并)}
                onclick={() => mergePieceFromBar(1)}
            >{@html icon("iconDown", 16)}</button>
            <button
                class="prog-fb-btn prog-fb-btn--normal prog-fbtip"
                aria-label={tip3(pieceDone ? tomatoI18n.解除定稿 : tomatoI18n.定稿,
                    pieceDone ? tomatoI18n.tip解除定稿 : tomatoI18n.tip定稿)}
                onclick={() => togglePieceDone()}
            >{@html icon(pieceDone ? "iconUndo" : "iconCheck", 16)}</button>
            <button
                class="prog-fb-btn prog-fb-btn--normal prog-fbtip"
                class:prog-fb-pro={$progPaid === false}
                aria-label={tip3(tomatoI18n.汇编成稿, tomatoI18n.tip汇编成稿)}
                onclick={() => compileWritingFromBar()}
            >{@html icon("iconProgMerge", 16)}</button>
        {/if}
        {#if $kind === "digest"}
            <button
                class="prog-fb-btn prog-fb-btn--normal prog-fbtip"
                aria-label={tip3(tomatoI18n.入槽, tomatoI18n.tip入槽)}
                onclick={(e) => openSlotMenuForDigest(e)}
            >{@html icon("iconProgPiece", 16)}</button>
        {/if}
        <!-- 直送：一切阅读态（书/片/自由文档）选中块直接进槽——不经摘抄池不建摘抄本体；
             写作书片自身排除（片内搬运是移片/拆分领地）；摘抄态排除（已有整摘入槽） -->
        {#if ($kind === "piece" || $kind === "free" || $kind === "book") && !isWritingPiece}
            <button
                class="prog-fb-btn prog-fb-btn--normal prog-fbtip"
                aria-label={tip3(tomatoI18n.直接入槽, tomatoI18n.tip直接入槽)}
                onclick={(e) => openDirectSlotMenu(e)}
            >{@html icon("iconProgMaterial", 16)}</button>
        {/if}
        {#if flatCells.length > 0 || advVisible.length > 0}
            <!-- □14b 折叠钮：首行行尾，chevron 指向即动作方向（展开中显示⌃=收起） -->
            <button
                class="prog-fb-fold prog-fbtip"
                class:prog-fb-fold--closed={flatCollapsed}
                aria-label={flatCollapsed ? tomatoI18n.展开工具区 : tomatoI18n.收起工具区}
                onclick={toggleFlat}
            >{@html icon(flatCollapsed ? "iconProgFoldDown" : "iconProgFoldUp", 14)}</button>
        {/if}
    </div>
    {#if !flatCollapsed && (flatCells.length > 0 || advVisible.length > 0)}
        <!-- □10 方案 B 平铺区：一次展开常驻（无 [+] 无二级）。5 段 = 低频段（未勾池钮+低频，
             段内按格折行）+ 高级四组（.prog-fb-adv-group 组容器不折断，折行只断组边）；
             段界统一 .prog-fb-flat > * + *::before 段头线（见 index.scss 平铺区段） -->
        <div class="prog-fb-flat" role="group" class:prog-fb-flat--drop={dragId != null} ondragover={onFlatDragOver} ondrop={onFlatDrop}>
            <span class="prog-fb-flat-seg">
                {#each flatCells as id (id)}
                    <button
                        draggable={canDrag}
                        class="prog-fb-flat-btn prog-fbtip {$digOpen && id === "digest" ? "prog-fb-flat-btn--on" : ""}"
                        class:prog-fb-btn--dragging={dragId === id}
                        class:prog-fb-pro={isAdvPro(id)}
                        aria-label={(id === "digest" && $digOpen) ? tomatoI18n.收起 : (FLAT_TIPS[id]?.() ?? id) + proNote(isAdvPro(id))}
                        onclick={(e) => onFlat(id, e)}
                        ondragstart={(e) => onDragStart(id, e)}
                        ondragend={onDragEnd}
                    >{@html icon(flatIcon(id), 14)}<span class="prog-fb-flat-lbl">{FLAT_LABELS[id]?.() ?? id}</span></button>
                {/each}
            </span>
            {#each advVisible as group, gi (gi)}
                <span class="prog-fb-adv-group">
                    {#each group as it (it.id)}
                    <button
                        draggable={canDrag}
                        class="prog-fb-flat-btn prog-fbtip"
                        class:prog-fb-btn--dragging={dragId === it.id}
                        class:prog-fb-pro={it.spec.vip === true}
                        aria-label={tip3(it.label(), ADV_USAGE[it.id]?.() ?? it.label(), it.spec.w()) + proNote(it.spec.vip === true)}
                        onclick={() => runAdv(it)}
                        ondragstart={(e) => onDragStart(it.id, e)}
                        ondragend={onDragEnd}
                    >{@html icon(it.icon, 14)}<span class="prog-fb-flat-lbl">{it.label()}</span></button>
                    {/each}
                </span>
            {/each}
        </div>
    {/if}
    {#if $digOpen && digIds.length > 0}
        <!-- 子排开合（□2 持久记忆）：digOpen 随 digSubrankOpen 跨分片/跨会话记住用户选择，
             未存过值=开；□11 起 digest 态也开精简子排（再摘抄/单词族，✂ 钮随 common 组常驻
             可收起）——旧「摘抄态不渲染子排」退役 -->
        <div class="prog-fb-dig">
            {#each digIds as id (id)}
                <button
                    class="prog-fb-btn--sm prog-fbtip"
                    aria-label={DIG_TIPS[id]?.() ?? id}
                    onclick={(e) => onDig(id, e)}
                >{@html icon(DIG_ICONS[id], 14)}</button>
            {/each}
        </div>
    {/if}
{/snippet}

{#if $show}
    {#if isMobile}
        <!-- 移动端：顶栏形态（不做球），✕ 收起=本会话隐藏（free 态=自由态下班） -->
        {#if useTopBar}
            <PieceTopBar onClose={() => ($kind === "free" ? freeFloatOff() : show.set(false))} children={btns} />
        {:else if $expanded}
            <FloatBar
                posKey="prog-piece-floatbar-pos"
                title={$title}
                zIndex={$zIndexPlus ? 999 : 10}
                onClose={() => ($kind === "free" ? freeFloatOff() : show.set(false))}
                barClass="prog-fb"
                children={btns}
            />
        {/if}
    {:else if !$expanded}
        <FloatBall kind={$kind ?? "book"} title={$title} point={$point} onExpand={expandFloatBar} />
    {:else}
        <FloatBar
            posKey="prog-piece-floatbar-pos"
            title={$title}
            zIndex={$zIndexPlus ? 999 : 10}
            onClose={$kind === "free" ? freeFloatOff : collapseFloatBar}
            barClass="prog-fb"
            children={btns}
        />
    {/if}
{/if}

<style>
    .prog-fb-row {
        display: flex;
        align-items: center;
        gap: 4px;
    }
    .prog-fb-sep {
        flex: none;
        width: 1px;
        height: 18px;
        margin: 0 4px;
        background: color-mix(in srgb, var(--b3-theme-on-surface, #ccc) 14%, transparent);
    }
    /* □14b 折叠钮：首行行尾的轻量 chevron（布局控件非功能钮——窄一档+弱化透明度；
       选择器裸类无容器前缀，移动端顶栏（.prog-topbar 根）同命中，height 30 被顶栏
       :global(button) 的 min-height 36 盖过自动放大热区，同 flat-btn 先例） */
    .prog-fb-fold {
        flex: none;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 30px;
        padding: 0;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: var(--b3-theme-on-surface);
        opacity: 0.55;
        cursor: pointer;
        transition: background-color 0.12s ease-out;
    }
    .prog-fb-fold:hover {
        background: var(--b3-list-hover);
        opacity: 1;
    }
    /* □14c 拖拽反馈：源钮半透明（首行/平铺区通用）+ 首行插入指示 accent 竖条 +
       平铺区拖拽中的「移出目标」淡 accent 高亮（vision review P2） */
    .prog-fb-btn--dragging {
        opacity: 0.45;
    }
    .prog-fb-dropmark {
        flex: none;
        width: 2px;
        height: 22px;
        border-radius: 1px;
        background: var(--prog-accent, var(--b3-theme-primary));
    }
    .prog-fb-flat--drop {
        background: color-mix(in srgb, var(--prog-accent) 10%, var(--b3-theme-surface));
    }
    /* 折叠态 chevron 是找回工具区的唯一入口，提一档存在感（vision review P2） */
    .prog-fb-fold--closed {
        opacity: 0.7;
    }
</style>
