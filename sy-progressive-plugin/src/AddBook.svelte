<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { prog } from "./Progressive";
    import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
    import { buildContentBlocks, buildContentBlocksVols, computePieceIndex, computePieceIndexVols, listVolIDs } from "./Split2Pieces";
    import type { VolsContent } from "./Split2Pieces";
    import { volsFromCounts } from "./volIndex";
    import {
        applyBoldMarks,
        countHeadingLevels,
        levelsToHeadings,
        loadBoldIds,
        summarizePieces,
    } from "./piecePreview";
    import type { PiecePreview } from "./piecePreview";
    import { MarkBookKey, MarkKey } from "../../sy-tomato-plugin/src/libs/gconst";
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
    import { DestroyManager } from "../../sy-tomato-plugin/src/libs/destroyer";
    import { createAllPieces, deleteAllPieces, hasPieces } from "./helper";
    import * as constants from "./constants";
    import { lockWithLease } from "./lockLease";
    import { blockCountDivergent } from "./addBookGuard";
    import { progStorage, ProgressiveStorage } from "./ProgressiveStorage";
    import { notifyFleetChanged } from "./fleetNotify";
    import { verifyKeyProgressive } from "../../sy-tomato-plugin/src/libs/user";

    interface Props {
        bookID: string;
        bookName: string;
        dm: DestroyManager;
        /** □2 物理分卷链拉起时预选目录成书（切完的卷即文章池） */
        preselectDir?: boolean;
    }

    let { bookID, bookName, dm, preselectDir = false }: Props = $props();
    export function destroy() {
        dm.destroyBy();
    }
    onDestroy(destroy);

    let wordCount = $state(0);
    let textLen = $state(0);
    let showLastBlock = $state(false);
    let createPiecesNow = $state(false);
    let addIndex = $state(false);
    let splitType: AsList = $state("no" as any);
    // 期3 手动分片书：勾上后走 addManualBook 独立注册分支（切分配置整体置灰失效）
    let manualSplit = $state(false);
    let disabled = $state(true);
    let contentBlocks: WordCountType[] = $state([]);
    // ===== □1 目录成书：书=文档集选法（单篇默认=现状零感知；父文档有子文档才出现选法区） =====
    // □2 物理分卷链拉起时 preselectDir 预选目录（卷即文章池，省一步手选）。
    // 刻意只取初值快照：mode 此后归用户交互，preselectDir 变化不应劫持选择
    // svelte-ignore state_referenced_locally
    let mode = $state<"single" | "dir">(preselectDir ? "dir" : "single");
    let childDocCount = $state(0);
    let volsContent = $state<VolsContent | null>(null);
    let loadingVols = $state(false);
    let volIDs: string[] = []; // 非响应式：仅逻辑用（枚举/守卫/落库）
    // □7 滤空块后的滤前行数：□3 守卫对照 SQL 计数须同口径（SQL 含空块），用滤后
    // blocks.length 会造成系统性差值=空块数，空段占比高的书被永久误拦（review P1-2）
    let rawBlockCount = $state(0);
    // □1 目录成书两态统一数据源：目录态=全书逐卷拼接，单篇态=现状缓存（零变化）
    let activeBlocks = $derived(mode === "dir" ? (volsContent?.blocks ?? []) : contentBlocks);
    let activeRawCount = $derived(mode === "dir" ? (volsContent?.rawCount ?? 0) : rawBlockCount);
    let activeTextLen = $derived(mode === "dir" ? (volsContent?.textLen ?? 0) : textLen);
    // 纯标题数（vision P1-1：与 chips 计数同屏一致）；「平均每标题块数」除数在模板 +1 兜底
    let headCount = $derived(activeBlocks.filter(b => b.type == "h").length);
    let contentBlockLen = $derived(
        activeBlocks.length === 0 ? 1 : activeBlocks.length,
    );
    // □14 断句整体 Pro：p/t/i 三档未激活锁死（no 免费），口径与 Settings 货架一致。
    // 初始 false（fail-closed）：onMount verify 后才翻真，disabled 骨架期不可见但语义同向
    let paid = $state(false);
    // □18 知情警告文案（onMount 检测填充；空串=全新文档不渲染）
    let warnText = $state("");
    // 巨块知情警告（空串=无超大块不渲染）。阈值 5000 字符=中文一块 5000 字已远超正常
    // 段落（数百字），Word/PDF 导入未断段的典型形态。□1 起两态统一派生（目录态随
    // 全书拼接数据源自动覆盖）
    let bigBlockWarn = $derived(activeBlocks.some(b => b.count > 5000) ? tomatoI18n.加书警告超大块 : "");
    // □2 巨书建议条：单篇态超 50 万字引导先物理分卷（已是目录=childDocCount>0 不提示，
    // 直接目录成书即可）。阈值与 SplitVolsDialog 的 MAX_TIERS 默认档对齐
    let bigVolWarn = $derived(
        mode === "single" && activeTextLen > 500_000 && childDocCount === 0
            ? tomatoI18n.巨书建议分卷 : "");
    // slotmerge □1 写作书硬拦：表单照常显示（警示须可见，骨架屏开关 disabled 复用不得）
    // 但提交钮锁死——与 □18 知情警告（可继续）分层的禁止态
    let writingBlocked = $state(false);

    // ===== □4 统计步骤增强：chips + 字数滑块 + 即时预览（方案=docs/prog-addbook-split-preview.md） =====
    // 切窗离散档：0=「不限」（splitWordNum 0，现有语义保留）。默认 500（2026-08-30 用户
    // 实测拍板：8000/片太大，短读节奏 500 合身）。
    const SPLIT_TIERS: number[] = [0, 500, 1000, 2000, 3000, 5000, 8000];
    const DEFAULT_SPLIT_IDX = SPLIT_TIERS.indexOf(500);
    // chips 多选值（"1"~"6"/"b"），computePieceIndex 的 headings 参数由此派生。
    // □2 分片默认值改造（2026-09-01 拍板）：默认=实际存在的标题级全勾（h1~h6、B 不勾），
    // 即「先按大小标题拆，超大节再切窗」；智能默认（pickSmartDefault 单级试算）退役，
    // 函数与单测留存 piecePreview.ts 备将来复用
    let selectedLevels: string[] = $state([]);
    let splitIdx: number = $state(DEFAULT_SPLIT_IDX);
    // b 通道 bold id 缓存：弹窗生命周期 SQL 一次（方案 §2.2）。只整体换引用保持响应式。
    let boldIds: ReadonlySet<string> = $state(new Set<string>());
    let preview: PiecePreview | null = $state(null);
    let recalcing = $state(false);

    let levelStats = $derived(countHeadingLevels(activeBlocks));
    let hasLevels = $derived(levelStats.length > 0 || boldIds.size > 0);
    let splitWordNum = $derived(SPLIT_TIERS[splitIdx]);

    /** 锁 chip 的统一点击口（鼠标点 label 转发与键盘回车同源）：preventDefault 硬拦
        radio 选中 + pushMsg 引导——不用原生 disabled（键盘 Tab 不可达，vision review P1） */
    function onLockedSplitClick(e: Event) {
        e.preventDefault();
        void siyuan.pushMsg(tomatoI18n.断句Pro提示, 2500);
    }

    /** 方向键导航不触发 click（vision 复评 P2）：radio 组内箭头把 checked 落到锁档时
        change 兜底回滚 no + 引导，防「半透明选中」怪态与锁档写入配置 */
    function onLockedSplitChange() {
        splitType = "no" as AsList;
        void siyuan.pushMsg(tomatoI18n.断句Pro提示, 2500);
    }

    /** □6 全选：勾上所有可选级——实存标题级 + B chip（粗体懒查就绪后才可见，未就绪不勾）。
        已知窗口：boldIds 单发 SQL 到场前点全选会漏 B（chip 尚不可见，用户可到场后手点补勾，
        可接受）；勿改成「boldIds 到场自动补勾 B」——会覆盖用户在等待期内的手动收窄/清空，
        且未选 "b" 时正式分片与预览共用 calcGroups、boldIds 完全不参与，无正确性影响 */
    function selectAllLevels() {
        selectedLevels = [
            ...levelStats.map((s) => s.level),
            ...(boldIds.size > 0 ? ["b"] : []),
        ];
    }

    onMount(async () => {
        disabled = true;
        paid = (await verifyKeyProgressive()) === true;
        // □18 知情警告（reasoning review P1）：目标文档已是注册书 → 确认=重置进度+
        // 按本次设置重分片；已是某书的分片 → 加书=脱离母书独立成书。管理页「重新分片」
        // 走同一弹窗，同样获警告。仅提示不拦截（重加书是合法路径，知情即可）
        try {
            // slotmerge □1 写作书硬拦置链首（写作书必然已注册，放 isRegisteredBook 之后
            // 永远走不到）：确认加阅读会按阅读语义重分片摧毁槽结构，属禁止而非知情——
            // 警示条置顶 + 提交钮禁用。管理页「重新分片」走同一弹窗，同守卫自动覆盖
            if (progStorage.peekBookInfo(bookID)?.writing) {
                warnText = tomatoI18n.加书硬拦写作书;
                writingBlocked = true;
            } else if (progStorage.isRegisteredBook(bookID)) {
                warnText = tomatoI18n.加书警告已注册;
            } else {
                const attrs = await siyuan.getBlockAttrs(bookID);
                if (attrs?.[MarkKey] && attrs[MarkKey] !== MarkBookKey) {
                    warnText = tomatoI18n.加书警告已分片;
                } else if (await hasPieces(bookID)) {
                    // 删记录（removeIndex）后重加书：书未注册但旧片还在，确认会照删——
                    // 新增删除行为后的知情面补齐（review P1-1），复用同款警告文案
                    warnText = tomatoI18n.加书警告已注册;
                }
            }
        } catch { /* 检测失败不阻断加书主流程，警告层缺席不误导 */ }
        try {
            await doCount();
            // □2 默认全勾：doCount 后 contentBlocks 就绪、levelStats 同步可读（$derived
            // 惰性求值读取即算）。失败走 catch 保持骨架屏，selectedLevels 维持 [] 不误勾
            selectedLevels = levelStats.map(s => s.level);
            disabled = false;
            void loadBold(); // B chip「有才显示」：不阻塞首帧，SQL 完成后浮现（方案 §4.8）
            // □1 目录成书：检测直接子文档（文件树序）。检测失败不阻断单篇加书（选法区不出现）
            try {
                volIDs = await listVolIDs(bookID);
                childDocCount = volIDs.length;
            } catch (e) {
                console.error("listVolIDs failed", e);
                childDocCount = 0;
            }
        } catch (e) {
            // 统计失败保持骨架屏（可见失败，可关窗重试）：吞错放行会显示全 0
            // 统计卡且能一路注册出空索引书（heal 不覆盖该态）
            console.error("AddBook doCount failed", e);
            siyuan.pushMsg(tomatoI18n.加书失败请重试);
        }
    });

    async function doCount() {
        siyuan.getBlocksWordCount([bookID]).then((c) => {
            wordCount = c.stat.wordCount;
        }).catch(() => { /* 独立展示通道失败不阻断统计，wordCount 保持 0 */ });
        // 统计走 getChildBlocks 单发（巨书秒级），textLen = sum(content) 随行返回
        const { blocks, textLen: totalLen, rawCount } = await buildContentBlocks(bookID);
        contentBlocks = blocks;
        rawBlockCount = rawCount;
        // headCount/bigBlockWarn 已改 $derived(activeBlocks)（□1 两态统一数据源）——
        // 纯标题数展示与「平均每标题块数」除数兜底均在派生/模板层
        textLen = totalLen;
    }

    // ===== □1 目录成书：目录态枚举（惰性一次+缓存；统计/预览/守卫/落库共用） =====
    let volsDefaulted = false; // 首次到场重置默认全勾（与 onMount 同款语义；此后用户收窄不覆盖）
    async function ensureVolsContent() {
        if (volsContent || loadingVols) return;
        // volIDs 未就绪（onMount listVolIDs 进行中）时空手：空枚举结果会把 volsContent
        // 钉成空缓存（非 null 不再重跑）——preselectDir 链（mode 初始即 dir）必踩；
        // 等下方 effect 依赖 childDocCount 到场后再触发
        if (volIDs.length === 0) return;
        loadingVols = true;
        try {
            volsContent = await buildContentBlocksVols(volIDs);
            if (!volsDefaulted) {
                volsDefaulted = true;
                selectedLevels = levelStats.map(s => s.level);
            }
            // wordCount 目录口径=各卷合计（独立展示通道，失败不阻断）
            siyuan.getBlocksWordCount(volIDs).then((c) => {
                wordCount = c.stat.wordCount;
            }).catch(() => { });
            void loadBold(); // B chip 逐卷并集（独立通道，不阻塞枚举）
        } catch (e) {
            // review P2-1：枚举失败（getChildBlocks 两态吞错族）可见化——统计全 0 无提示
            // 曾是 unhandled rejection 静默态；提交侧另有 activeBlocks=0 硬拦不落脏数据
            console.error("ensureVolsContent failed", e);
            siyuan.pushMsg(tomatoI18n.加书失败请重试);
        } finally {
            loadingVols = false;
        }
    }

    // childDocCount 必须进依赖：preselectDir 链 mode 初始即 dir，effect 首跑早于
    // onMount 的 listVolIDs——依赖 childDocCount（onMount 赋值）到场后才真正枚举
    $effect(() => {
        if (mode === "dir" && childDocCount > 0) void ensureVolsContent();
    });

    // 目录书依赖自动切分（卷表+逐卷切窗），与手动分片互斥：切目录即解除
    $effect(() => {
        if (mode === "dir" && manualSplit) manualSplit = false;
    });

    /** 唯一计算口：预览防抖重算与 process 正式分片共用（同参数必同结果，方案 §2.2）。
        headings 永不含 "b"（已换 "7"）→ HeadingGroup.init 的 SQL+就地改写分支永不触发，
        contentBlocks 缓存不被污染（split2pieces.test.ts 锁定的坑）；含 "7" 时用
        boldIds 缓存做纯函数预标记视图（applyBoldMarks 拷贝，不改缓存），无 SQL。
        □1 目录态：逐卷独立切窗再拼接（片不跨文章），perVol 随行返回供落卷表（防三算漂移） */
    async function calcGroups(
        levels: string[],
        wordNum: number,
        m: "single" | "dir" = mode,
        vc: VolsContent | null = volsContent,
    ): Promise<{ groups: WordCountType[][]; perVol?: number[] }> {
        const headings = levelsToHeadings(levels);
        if (m === "dir" && vc) {
            const view = headings.includes("7")
                ? applyBoldMarks(vc.blocks, boldIds)
                : vc.blocks;
            const volsView = { ...vc, blocks: view }; // spans 不变（预标记不改序）
            const r = await computePieceIndexVols(volsView, headings, wordNum);
            return { groups: r.groups, perVol: r.perVol };
        }
        const view = headings.includes("7")
            ? applyBoldMarks(contentBlocks, boldIds)
            : contentBlocks; // 不含 "7"：computePieceIndex 零 SQL 零改写，可直接传缓存
        return { groups: await computePieceIndex(view, headings, bookID, wordNum) };
    }

    let calcToken = 0;
    /** 防抖到期后的实际重算：token 丢弃过期结果（拖动滑块连发）。m/vc = □1 选法态
        与目录枚举缓存（effect 依赖显式读入，setTimeout 闭包内的读取不进依赖集）；
        lv=枚举进行中——跳过本轮（枚举完 volsContent 到场会再触发，勿在半数据上闪算）。 */
    async function recompute(levels: string[], wordNum: number, m: "single" | "dir", vc: VolsContent | null, lv: boolean) {
        const token = ++calcToken;
        try {
            if (lv) {
                if (token === calcToken) recalcing = false;
                return;
            }
            const r = await calcGroups(levels, wordNum, m, vc);
            if (token !== calcToken) return;
            preview = summarizePieces(r.groups, wordNum);
        } catch (e) {
            console.error("piece preview failed", e);
        } finally {
            if (token === calcToken) recalcing = false;
        }
    }

    // 选级/滑块变化 → 150ms 防抖 → 即时预览。contentBlocks/boldIds 在表单显示前已就绪
    // 且此后不变（doCount 单发 / loadBold 单发），刻意在 setTimeout 回调内读取使其
    // 不进本 effect 依赖（boldIds 后到不重算——它只影响 B chip 渲染与下次 calcGroups）。
    // □1：mode/volsContent/loadingVols 须进依赖（选法切换/目录枚举到场重算预览）。
    $effect(() => {
        // 期3 手动分片：切分参数整体失效，预览不重算（省无效计算；旧预览值随置灰隐藏）
        if (manualSplit) {
            recalcing = false;
            return;
        }
        const levels = [...selectedLevels];
        const wordNum = SPLIT_TIERS[splitIdx];
        const m = mode;
        const vc = volsContent;
        const lv = loadingVols;
        recalcing = true;
        const t = window.setTimeout(() => void recompute(levels, wordNum, m, vc, lv), 150);
        return () => window.clearTimeout(t);
    });

    /** 粗体 id 集合：SQL 一次缓存（loadBoldIds 内查询与 HeadingGroup.init 逐字一致）。
        失败置空集 = 无 B chip，统计与预览照常（fail-quiet，同 wordCount 通道）。
        □1 目录态：逐卷并集（root_id 逐卷口径，与逐卷切窗数据源对齐）。 */
    async function loadBold() {
        try {
            if (mode === "dir" && volIDs.length > 0) {
                const merged = new Set<string>();
                for (const v of volIDs) {
                    for (const id of await loadBoldIds(v)) merged.add(id);
                }
                boldIds = merged;
            } else {
                boldIds = await loadBoldIds(bookID);
            }
        } catch (e) {
            console.error("loadBoldIds failed", e);
            boldIds = new Set<string>();
        }
    }

    /** □2 巨书建议条按钮：关本弹窗→拉物理分卷 Dialog（切完自动回来） */
    async function goSplitVols() {
        destroy();
        await prog.splitVolsDialog(bookID);
    }

    async function process() {
        // slotmerge □1 硬拦兜底：提交钮 disabled 外的第二道防线（状态异常时误触不落盘）
        if (writingBlocked) return;        // 空文档兜底拦截：空索引书（books.json 有键、索引文件空）不在 heal 自愈范围。
        // □7 滤空块后新增可达形态：全空段落文档（修复前会一路注册出全空片索引=□7 温床）
        // □1 目录态=全书拼接口径（卷全空=目录书无内容）
        if (activeBlocks.length === 0) {
            if (activeRawCount > 0) {
                siyuan.pushMsg(tomatoI18n.该文档没有可分片的内容);
            } else {
                siyuan.pushMsg(tomatoI18n.加书失败请重试);
            }
            return;
        }
        // 期3 手动分片书：独立注册分支（身份照注册、索引恒空、片由摘抄产生）
        if (manualSplit) {
            await addManualBook();
            return;
        }
        // 正式分片与预览同一计算口（方案 §2.2）：同参数必同结果，不另写一条逻辑
        const { groups, perVol } = await calcGroups(selectedLevels, splitWordNum);
        if (groups.length === 0) return;
        // □1 目录书守卫口径=Σ各卷（root_id=书壳 的 count 不含卷内容块——树通道
        // 数据源也是逐卷的，两口径对齐才不误拦）
        let sqlCount = NaN;
        if (mode === "dir" && volIDs.length > 0) {
            const inList = volIDs.map(id => `'${id}'`).join(",");
            const sqlRowV = await siyuan.sqlOne(`select count(*) as c from blocks where root_id in (${inList})`);
            sqlCount = Number((sqlRowV as { c?: number | string } | null | undefined)?.c ?? NaN);
        } else {
            // □3 块数悬殊警告：树通道（getChildBlocks，分片数据源）与 SQL 计数大幅背离
            // =书处在编辑/索引窗口，拦下防静默生成坏索引（2026-09-09 事故家族）。
            // 查询失败（NaN）不拦——fail-open，别让一条对照查询断掉加书
            const sqlRow = await siyuan.sqlOne(`select count(*) as c from blocks where root_id='${bookID}'`);
            sqlCount = Number((sqlRow as { c?: number | string } | null | undefined)?.c ?? NaN);
        }
        if (!Number.isNaN(sqlCount) && blockCountDivergent(activeRawCount, sqlCount)) {
            await siyuan.pushMsg(tomatoI18n.内容还在索引请稍后再分片, 4000);
            return;
        }
        {
            const attrs = {} as AttrType;
            attrs["custom-sy-readonly"] = "true";
            attrs["custom-progmark"] = MarkBookKey;
            await siyuan.setBlockAttrs(bookID, attrs);
        }
        try {
            // □1 目录书：卷表旁挂（前缀和材料，与索引同点写）+ dirMode 标记
            // （缺省=单篇书现状路径，存量零迁移）。review P1-1：先卷表后索引——
            // 中断态=新表+老索引（ensure sameOrder Σ 守卫可检测）；原序（先索引）
            // 的反向中断=老表切新索引=错位重组持久化且 sameOrder 恒真永不自愈
            if (mode === "dir" && perVol) {
                await progStorage.saveVolTable(bookID, volsFromCounts(volIDs, perVol));
            } else {
                // 复审观察项：dir 书重加为 single 清残留卷表——防书键意外丢失时 heal 按
                // vols 文件误补 dirMode；全新 single 书无表，removeData 落空无害
                await progStorage.clearVolTable(bookID);
            }
            // 保存大索引（目录书=逐卷切窗拼接后的一维全书索引，point 全局连续——
            // 下游滚筒/舰队/kernel 消费面零改动）
            await progStorage.saveIndex(bookID, groups);

            // 保存 bookinfo。boxID 查不到留空（SQL 索引延迟窗口getRowByID 会空）：
            // booksInfo 惰性补齐链兜底，别让索引延迟把加书断成半注册态（□1）
            const block = await siyuan.getRowByID(bookID);
            const info = ProgressiveStorage.defaultBookInfo();
            info.time = await siyuan.currentTimeMs();
            info.boxID = block?.box ?? "";
            info.bookID = bookID;
            info.showLastBlock = showLastBlock;
            info.addIndex2paragraph = addIndex;
            info.bookName = bookName;
            info.dirMode = mode === "dir";
            await progStorage.resetBookInfo(bookID, info);

            // 注册落定才关弹窗（□1）：此前任何失败弹窗保留 + toast，不再静默断链
            destroy();
            notifyFleetChanged(); // Dock 即时见新书，不等 30s 定时器

            // 重划分先清旧片（2026-08-31 跳转错位根因）：旧片 IAL 标记与新方案同名会被
            // createPiece 复用，须在按新索引建片前整批删除（□18 警告文案对应的实质动作；
            // 全新加书查到空集零删除）。放关弹窗后：删除耗时（巨书残留上百片）不该卡在
            // 弹窗上。与阅读链共用 StartToLearnLock 排队串行（review P1-2）：无锁窗口内
            // 点开始学习/跳到分片会复用旧片（原 bug 短窗复发），锁住让它们排队等清理完成。
            if (await hasPieces(bookID)) {
                await siyuan.pushMsg(tomatoI18n.正在重建分片);
                // review P1-1：排队锁同样要租约（hang 会永久占住 StartToLearnLock，与
                // 阅读链共锁=四入口全堵）。清片=巨书残留数百片×每片 2 次 HTTP，租约放宽 600s
                await lockWithLease(constants.StartToLearnLock, () => deleteAllPieces(bookID), { queued: true, leaseMs: 600_000 });
            }

            // 断句
            if (splitType == "i" || splitType == "p" || splitType == "t") {
                await progStorage.setAutoSplitSentence(bookID, true, splitType);
            }

            // 实际执行拆分书籍
            if (createPiecesNow) {
                await createAllPieces(bookID);
            }
            await prog.startToLearnWithLock(bookID);
        } catch (e) {
            // 注册段失败=弹窗还在可原样重点；注册后失败=书已在管理页可见可重试
            console.error("AddBook process failed", e);
            siyuan.pushMsg(tomatoI18n.加书失败请重试);
        }
    }

    /** 期3 手动分片书：照常注册书身份（IAL+books.json）但索引恒空——片由摘抄产生
     *  （DigestBuilder 书态兜底：ctime=bookID#ct 聚合书卡 ✒、落点 digest-书名 夹，
     *  digestUtils 零改动）。转书场景（自动→手动）清旧索引+旧片；手动→自动=重开
     *  本弹窗走 process 原路径。无片可开：加完直接打开原书 */
    async function addManualBook() {
        {
            const attrs = {} as AttrType;
            attrs["custom-sy-readonly"] = "true";
            attrs["custom-progmark"] = MarkBookKey;
            await siyuan.setBlockAttrs(bookID, attrs);
        }
        try {
            // 自动书转手动：旧索引文件+内存缓存清空（全新书 removeData 落空无害）
            await progStorage.clearBookIndex(bookID);

            const block = await siyuan.getRowByID(bookID);
            const info = ProgressiveStorage.defaultBookInfo();
            info.time = await siyuan.currentTimeMs();
            info.boxID = block?.box ?? "";
            info.bookID = bookID;
            info.manualMode = true;
            info.bookName = bookName;
            await progStorage.resetBookInfo(bookID, info);

            // 注册落定才关弹窗（与 process 同款：此前失败弹窗保留可重点）
            destroy();
            notifyFleetChanged(); // Dock 即时见新书手动态

            // 旧片清理：与阅读链共用 StartToLearnLock 排队串行（process 同款防复用窗口
            // + review P1-1 同款租约治理）
            if (await hasPieces(bookID)) {
                await siyuan.pushMsg(tomatoI18n.正在清理旧分片);
                await lockWithLease(constants.StartToLearnLock, () => deleteAllPieces(bookID), { queued: true, leaseMs: 600_000 });
            }
            await prog.openOriginBook(bookID);
        } catch (e) {
            console.error("AddBook addManualBook failed", e);
            siyuan.pushMsg(tomatoI18n.加书失败请重试);
        }
    }
</script>

<div class="container">
    {#if disabled}
        <!-- 等待态：骨架屏预告结构 + spinner（doCount 期间，行为同旧版整表替换） -->
        <div class="prog-loading" aria-live="polite">
            <div class="prog-skeleton-card" aria-hidden="true">
                <div class="prog-skeleton-title"></div>
                <div class="prog-skeleton-grid">
                    <div class="prog-skeleton-cell"></div>
                    <div class="prog-skeleton-cell"></div>
                    <div class="prog-skeleton-cell"></div>
                    <div class="prog-skeleton-cell"></div>
                </div>
                <div class="prog-skeleton-bar"></div>
            </div>
            <div class="prog-loading-row">
                <span class="prog-spinner" aria-hidden="true"></span>
                {tomatoI18n.请耐心等待}
            </div>
        </div>
    {:else}
        <!-- □18 身份知情警告：已注册书/已是分片时置顶提示（不拦截，重加书是合法路径）；
             slotmerge □1 写作书硬拦态换 error 红（禁止 ≠ 知情） -->
        {#if warnText}
            <div class="prog-addbook-warn" class:prog-addbook-blocked={writingBlocked} role="alert">{warnText}</div>
        {/if}
        <!-- 巨块知情警告（2026-09-12）：分片原子=块，单块超 5000 字符的书整本会集中在
             少数几片里（8 万字巨块实测=1 片）。知情不拦截：引导拆块/断句。manualSplit
             模式无分片概念，不显示 -->
        {#if bigBlockWarn && !manualSplit}
            <div class="prog-addbook-warn" role="alert">{bigBlockWarn}</div>
        {/if}
        <!-- □2 巨书建议条：先物理分卷再加书（关本弹窗→拉切分 Dialog；切完自动回本弹窗） -->
        {#if bigVolWarn && !manualSplit}
            <div class="prog-addbook-warn" role="alert">
                {bigVolWarn}
                <button type="button" class="prog-chips-op prog-warn-btn" onclick={goSplitVols}>
                    {tomatoI18n.物理分卷}
                </button>
            </div>
        {/if}
        <!-- □1 目录成书选法：父文档有直接子文档才出现（显式 radio，单篇=默认现状零感知——
             「父文档自己有正文也能单篇加书」的存量能力不被动劫持） -->
        {#if childDocCount > 0}
            <section class="prog-card">
                <div class="prog-card-title">{tomatoI18n.成书方式}</div>
                <div class="prog-radio-grid" role="radiogroup" aria-label={tomatoI18n.成书方式}>
                    <label class="prog-radio-chip">
                        <input type="radio" name="book-mode" value="single" bind:group={mode} />
                        <span>{tomatoI18n.单篇成书}</span>
                    </label>
                    <label class="prog-radio-chip">
                        <input type="radio" name="book-mode" value="dir" bind:group={mode} />
                        <span>{tomatoI18n.目录成书篇数.replace("{n}", String(childDocCount))}</span>
                    </label>
                </div>
                <div class="prog-field-hint prog-card-lede">
                    {mode === "dir" ? tomatoI18n.目录成书说明 : tomatoI18n.单篇成书说明}
                </div>
                {#if mode === "dir" && loadingVols}
                    <div class="prog-piece-row" aria-live="polite">
                        <span class="prog-piece-label">{tomatoI18n.请耐心等待}</span>
                    </div>
                {/if}
            </section>
        {/if}
        <!-- 卡1 文档统计 -->
        <section class="prog-card">
            <div class="prog-card-title">{tomatoI18n.文档统计}</div>
            <div class="prog-stat-grid">
                <div class="prog-stat">
                    <span class="prog-stat-value">{wordCount}</span>
                    <span class="prog-stat-label">{tomatoI18n.总字数}</span>
                </div>
                <div class="prog-stat">
                    <span class="prog-stat-value">{activeTextLen}</span>
                    <span class="prog-stat-label">{tomatoI18n.总文本长度}</span>
                </div>
                <div class="prog-stat">
                    <span class="prog-stat-value">{headCount}</span>
                    <span class="prog-stat-label">{tomatoI18n.各级标题数}</span>
                </div>
                <div class="prog-stat">
                    <span class="prog-stat-value">{contentBlockLen}</span>
                    <span class="prog-stat-label">{tomatoI18n.总内容块数}</span>
                </div>
                <div class="prog-stat">
                    <span class="prog-stat-value">{Math.ceil(contentBlockLen / Math.max(1, headCount))}</span>
                    <span class="prog-stat-label">{tomatoI18n.平均每标题块数}</span>
                </div>
                <div class="prog-stat">
                    <span class="prog-stat-value">{Math.ceil(wordCount / contentBlockLen)}</span>
                    <span class="prog-stat-label">{tomatoI18n.平均每块字数}</span>
                </div>
                <div class="prog-stat">
                    <span class="prog-stat-value">{Math.ceil(activeTextLen / contentBlockLen)}</span>
                    <span class="prog-stat-label">{tomatoI18n.平均每块文本长度}</span>
                </div>
            </div>
            <!-- 分片结果条：即时预览（□4）。按钮退役，片数+三数+sparkline 随参数防抖更新 -->
            <div class="prog-piece-bar" class:prog-recalcing={recalcing} class:prog-manual-dim={manualSplit}>
                <div class="prog-piece-row">
                    <span class="prog-piece-value">{manualSplit ? "–" : preview?.count ?? 1}</span>
                    <span class="prog-piece-label">{tomatoI18n.分片数量}</span>
                    <span class="prog-piece-stats">
                        <span class="prog-piece-stat">
                            <span class="prog-piece-stat-label">{tomatoI18n.最短}</span>
                            <span class="prog-piece-stat-value">{preview?.min ?? 0}</span>
                        </span>
                        <span class="prog-piece-stat">
                            <span class="prog-piece-stat-label">{tomatoI18n.中位}</span>
                            <span class="prog-piece-stat-value">{preview?.median ?? 0}</span>
                        </span>
                        <span class="prog-piece-stat">
                            <span class="prog-piece-stat-label">{tomatoI18n.最长}</span>
                            <span class="prog-piece-stat-value">{preview?.max ?? 0}</span>
                        </span>
                    </span>
                    {#if preview && preview.overCount > 0 && splitWordNum > 0}
                        <span class="prog-piece-over">{tomatoI18n.超长分片} {preview.overCount}</span>
                    {/if}
                </div>
                <!-- sparkline：每片一竖条、高度=片字数（切窗同口径，方案 §2.3）；超 2×目标=红 -->
                <div
                    class="prog-spark"
                    class:prog-spark-dense={(preview?.wordCounts.length ?? 0) > 150}
                    role="img"
                    aria-label={tomatoI18n.片长分布}
                >
                    {#if preview}
                        {#each preview.wordCounts as wc}
                            <span
                                class="prog-spark-bar"
                                class:prog-spark-over={splitWordNum > 0 && wc > splitWordNum * 2}
                                style="height:{preview.max > 0
                                    ? Math.round((wc / preview.max) * 100)
                                    : 0}%"
                            ></span>
                        {/each}
                    {/if}
                </div>
            </div>
        </section>

        <!-- 卡2 切分设置：标题级 chips + 字数滑块（即时预览的参数面，□4）。
             □1 引导文案：总纲立「级=在哪切、字数=切多碎」分工，hint/tooltip 分层释义；
             期3 手动分片勾上后整卡置灰失效 -->
        <section class="prog-card" class:prog-manual-dim={manualSplit}>
            <div class="prog-card-title">{tomatoI18n.切分设置}</div>
            <div class="prog-field-hint prog-card-lede">{tomatoI18n.切分总纲}</div>

            <div class="prog-chip-label">
                {tomatoI18n.标题级别}
                <!-- □6 全选/清空轻量钮：默认全勾后收窄到单级需逐个取消 5~6 次，两键一键到位。
                     位置钉在标签行尾（不随 chips 换行漂移）；无标题书（hasLevels=false）无 chips 不出 -->
                {#if hasLevels}
                    <span class="prog-chips-ops">
                        <button type="button" class="prog-chips-op" onclick={selectAllLevels}>
                            {tomatoI18n.全选}
                        </button>
                        <span class="prog-chips-op-sep" aria-hidden="true">·</span>
                        <button type="button" class="prog-chips-op" onclick={() => (selectedLevels = [])}>
                            {tomatoI18n.清空}
                        </button>
                    </span>
                {/if}
            </div>
            {#if !hasLevels}
                <!-- 无标题书：chips 区提示 + 纯切窗（滑块照常，方案 §4.7） -->
                <div class="prog-no-heading">{tomatoI18n.本书没有大纲标题}</div>
            {:else}
                <div class="prog-chips" role="group" aria-label={tomatoI18n.标题级别}>
                    {#each levelStats as s (s.level)}
                        <label
                            class="prog-chip b3-tooltips b3-tooltips__n"
                            aria-label={`H${s.level} ×${s.count}\n${tomatoI18n.勾选后以此为切分边界}`}
                        >
                            <input type="checkbox" value={s.level} bind:group={selectedLevels} />
                            <span class="prog-chip-token">H{s.level}</span>
                            <span class="prog-chip-count">×{s.count}</span>
                        </label>
                    {/each}
                    {#if boldIds.size > 0}
                        <!-- B 殿后（方案 §4.2）：boldIds 懒查就绪后浮现；计数≥10000 显 9999+（SQL limit） -->
                        <label
                            class="prog-chip b3-tooltips b3-tooltips__n"
                            aria-label={`${tomatoI18n.粗体} ×${boldIds.size >= 10000 ? "9999+" : boldIds.size}\n${tomatoI18n.勾选后以此为切分边界}`}
                        >
                            <input type="checkbox" value="b" bind:group={selectedLevels} />
                            <span class="prog-chip-token">B</span>
                            <span class="prog-chip-count">×{boldIds.size >= 10000 ? "9999+" : boldIds.size}</span>
                        </label>
                    {/if}
                </div>
                <div class="prog-field-hint">{tomatoI18n.切分级别提示}</div>
            {/if}

            <div class="prog-slider-row">
                <span class="prog-field-label">{tomatoI18n.每片字数}</span>
                <span class="prog-slider-val">
                    {splitWordNum === 0 ? tomatoI18n.不限 : splitWordNum}
                </span>
            </div>
            <input
                type="range"
                class="b3-slider prog-slider"
                min="0"
                max={SPLIT_TIERS.length - 1}
                step="1"
                bind:value={splitIdx}
                aria-label={tomatoI18n.每片字数}
            />
            <div class="prog-slider-scale">
                <span>{tomatoI18n.不限}</span>
                <span>{SPLIT_TIERS[SPLIT_TIERS.length - 1]}</span>
            </div>
            <!-- □1 两态 hint：不限=纯标题切分显级差，开档=切窗主导（用户拖滑块时对照即教学） -->
            <div class="prog-field-hint">
                {splitWordNum === 0 ? tomatoI18n.切分不限提示 : tomatoI18n.切分字数提示}
            </div>
        </section>

        <!-- 卡3 分片选项 -->
        <section class="prog-card">
            <div class="prog-card-title">{tomatoI18n.分片选项}</div>
            <!-- 期3 手动分片：勾上后下方切分/断句配置全部无效（置灰），注册走 addManualBook。
                 □1 目录书与手动分片互斥（目录书依赖自动切分）——radio 互斥解除 + 置灰锁 -->
            <label class="prog-switch-row" class:prog-manual-dim={mode === "dir"}>
                <input type="checkbox" class="b3-switch" bind:checked={manualSplit} disabled={mode === "dir"} />
                <span>{tomatoI18n.手动分片不自动切}</span>
            </label>
            <div class="prog-field-hint">
                {mode === "dir" && manualSplit === false && childDocCount > 0
                    ? tomatoI18n.目录书须自动分片
                    : manualSplit ? tomatoI18n.手动分片模式说明 : tomatoI18n.手动分片说明}
            </div>
            <div class="prog-manual-slave" class:prog-manual-dim={manualSplit}>
                <label class="prog-switch-row">
                    <input type="checkbox" class="b3-switch" bind:checked={createPiecesNow} />
                    <span>{tomatoI18n.立刻创建所有的分片}</span>
                </label>
                <label class="prog-switch-row">
                    <input type="checkbox" class="b3-switch" bind:checked={showLastBlock} />
                    <span>{tomatoI18n.显示上一个分片的最后一个块}</span>
                </label>
                <label class="prog-switch-row">
                    <input type="checkbox" class="b3-switch" bind:checked={addIndex} />
                    <span>{tomatoI18n.新建分片时给段落标上序号}</span>
                </label>

                <div class="prog-radio-label">{tomatoI18n.断句方式}</div>
                <div class="prog-radio-grid" role="radiogroup" aria-label={tomatoI18n.断句方式}>
                    {#each ["p", "t", "i", "no"] as t}
                        <!-- □14 断句整体 Pro：未激活 p/t/i 可见但锁死（prog-locked + 🔒 +
                             点击 pushMsg 引导，不静默不藏），no 免费恒可选。锁 chip 不用原生
                             disabled（键盘 Tab 不可达=键盘用户触发不了引导，vision review P1）：
                             radio 保持可聚焦，click preventDefault 硬拦选中（鼠标点 label 转发
                             与键盘回车同一入口），aria-disabled 承担语义；执行侧 splitAndInsert
                             另有同门禁兜底 -->
                        {@const name = t == "p"
                            ? tomatoI18n.断句为段落块
                            : t == "t"
                                ? tomatoI18n.断句为任务块
                                : t == "i"
                                    ? tomatoI18n.断句为无序表
                                    : tomatoI18n.不断句}
                        {@const locked = !paid && t !== "no"}
                        <label
                            class="prog-radio-chip b3-tooltips b3-tooltips__n"
                            class:prog-locked={locked}
                            aria-disabled={locked ? "true" : undefined}
                            aria-label={locked ? `${name}（Pro）` : name}
                        >
                            <input
                                type="radio"
                                name="scoops"
                                value={t}
                                bind:group={splitType}
                                aria-disabled={locked ? "true" : undefined}
                                onclick={locked ? onLockedSplitClick : undefined}
                                onchange={locked ? onLockedSplitChange : undefined}
                            />
                            <span>
                                {t == "no" ? tomatoI18n.不断句 : ""}
                                {t == "p" ? tomatoI18n.断句为段落块 : ""}
                                {t == "t" ? tomatoI18n.断句为任务块 : ""}
                                {t == "i" ? tomatoI18n.断句为无序表 : ""}
                            </span>
                            <!-- □30 🔒 emoji 换思源 sprite 小锁（iconLock，用户 emoji 装饰土口径收口） -->
                            {#if locked}<svg class="prog-radio-tag" aria-hidden="true"><use xlink:href="#iconLock"></use></svg>{/if}
                        </label>
                    {/each}
                </div>
            </div>
        </section>

        <!-- 底部操作栏：主操作实心 primary，sticky 恒在。slotmerge □1：写作书硬拦锁提交 -->
        <div class="prog-footer">
            <button class="b3-button prog-primary-btn" disabled={writingBlocked} onclick={process}
                >{tomatoI18n.添加文档到渐进阅读}</button
            >
            <button
                class="b3-button b3-button--outline tomato-button"
                onclick={destroy}>{tomatoI18n.退出}</button
            >
        </div>
    {/if}
</div>

<style>
    /* 只用 --b3-* 变量（明暗自适应）；prog- 前缀防撞。
       卡片壳/标题/hover 配方照抄 IndexConf.css 的 conf-group/section-title/settingBox，
       不借 .tomato-settings-dialog 壳（防设置页怪癖与未来改版联动）。□10 方案=docs/prog-config-ui-revamp.md；
       □4 统计步骤增强（结果条两行化+sparkline+多选 chips+字数滑块）方案=docs/prog-addbook-split-preview.md */
    .container {
        display: flex;
        flex: auto;
        flex-direction: column;
        gap: 10px;
        min-width: 0;
        padding: 12px 14px 0;
    }

    /* □18 身份知情警告条：warning 底+深字（非错误，确认仍是合法路径）。
       --b3-theme-warning 本仓库无使用先例（文档不全），带 hex fallback 降级无害 */
    .prog-addbook-warn {
        padding: 6px 10px;
        border-radius: var(--b3-border-radius, 4px); /* 卡片同配方（vision 复评 P2：勿硬编码） */
        font-size: 12px;
        line-height: 1.5;
        background-color: color-mix(in srgb, var(--b3-theme-warning, #d25f00) 12%, transparent);
        color: var(--b3-theme-on-surface);
        box-shadow: inset 2px 0 0 var(--b3-theme-warning, #d25f00);
    }
    /* slotmerge □1 硬拦态：error 家族与 ⚠ 知情警告分层（禁止强于知情）；
       --b3-theme-error 同属文档不全变量，带 hex fallback 降级无害 */
    .prog-addbook-warn.prog-addbook-blocked {
        background-color: color-mix(in srgb, var(--b3-theme-error, #d23f31) 12%, transparent);
        box-shadow: inset 2px 0 0 var(--b3-theme-error, #d23f31);
    }

    /* ---- 卡片壳（conf-group 配方） ---- */
    .prog-card {
        padding: 10px 12px 12px;
        background-color: var(--b3-theme-surface);
        border: 1px solid var(--b3-theme-surface-lighter);
        border-radius: var(--b3-border-radius);
    }
    .prog-card-title {
        margin: 0 0 8px;
        font-size: 15px;
        font-weight: 600;
        color: var(--b3-theme-on-surface); /* section-title 配方 */
    }

    /* ---- 卡1 统计 ---- */
    .prog-stat-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 8px;
    }
    .prog-stat {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
        padding: 6px 10px;
        background-color: var(--b3-theme-background);
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
    }
    .prog-stat-value {
        overflow: hidden;
        font-size: 17px;
        font-weight: 700;
        line-height: 1.2;
        color: var(--b3-theme-on-background);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
        text-overflow: ellipsis;
    }
    .prog-stat-label {
        overflow: hidden;
        font-size: 12px;
        line-height: 1.4;
        color: var(--b3-theme-on-surface);
        white-space: nowrap;
        text-overflow: ellipsis;
    }
    /* ---- 分片结果条：□4 两行化（行1 数字+三数，行2 sparkline）。淡底/边框/圆角
       维持 □10 原值；重算期间压暗反馈（方案 §4.9），运行时类走 :global（prog-locked 先例） */
    .prog-piece-bar {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 6px;
        margin-top: 8px;
        padding: 6px 12px;
        background-color: var(--b3-theme-primary-lightest);
        border: 1px solid var(--b3-theme-primary-light);
        border-radius: 6px;
        transition: opacity 0.15s;
    }
    .prog-piece-bar:global(.prog-recalcing) {
        opacity: 0.55;
    }
    .prog-piece-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 4px 12px;
    }
    .prog-piece-value {
        min-width: 34px;
        font-size: 28px;
        font-weight: 700;
        line-height: 1;
        color: var(--b3-theme-primary);
        text-align: center;
        font-variant-numeric: tabular-nums;
    }
    .prog-piece-label {
        flex: 1;
        font-size: 13px;
        font-weight: 500;
        color: var(--b3-theme-on-background);
    }
    .prog-piece-stats {
        display: flex;
        align-items: baseline;
        gap: 10px;
        margin-left: auto;
    }
    .prog-piece-stat {
        display: flex;
        align-items: baseline;
        gap: 3px;
    }
    .prog-piece-stat-label {
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        opacity: 0.64;
    }
    .prog-piece-stat-value {
        font-size: 13px;
        font-weight: 600;
        color: var(--b3-theme-on-background);
        font-variant-numeric: tabular-nums;
    }
    .prog-piece-over {
        font-size: 12px;
        color: var(--b3-theme-error);
        font-variant-numeric: tabular-nums;
    }

    /* sparkline：每片一竖条（高度=片字数%，切窗同口径）；>150 片去间隙成连续直方图；
       overflow-x 兜 >600 片极端书，不撑破弹窗（方案 §4.4） */
    .prog-spark {
        display: flex;
        align-items: flex-end;
        gap: 1px;
        height: 28px; /* vision P1：初始视口截断切分设置卡，统计区整体紧凑化 */
        overflow-x: auto;
    }
    .prog-spark:global(.prog-spark-dense) {
        gap: 0;
    }
    .prog-spark-bar {
        flex: 1 1 0;
        min-width: 1px;
        max-width: 14px;
        min-height: 2px;
        background-color: var(--b3-theme-primary-light);
        border-radius: 1px 1px 0 0;
    }
    .prog-spark-bar:global(.prog-spark-over) {
        background-color: var(--b3-theme-error);
    }

    /* ---- 卡2 多选 chips（prog-radio-chip 配方改 checkbox，方案 §4.2） ---- */
    .prog-chip-label {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        margin: 2px 0 6px;
        font-size: 13px;
        font-weight: 500;
        color: var(--b3-theme-on-surface);
    }
    /* □6 全选/清空轻量文字钮：无边框 primary 色小一号，与实体 chips 视觉分层（hover 下划线供可点感）。
       ops 用 inline-flex+gap 定距（不依赖模板空白折叠）；padding 2px 补命中区；focus-visible 对齐
       chips 的 2px outline 先例（vision/reasoning review P2） */
    .prog-chips-ops {
        display: inline-flex;
        align-items: baseline;
        gap: 4px;
    }
    /* □2 巨书建议条内嵌轻量钮：复用 chips-op 形态，左缘让位分隔点 */
    .prog-warn-btn {
        margin-left: 6px;
        white-space: nowrap;
    }
    .prog-chips-op {
        padding: 2px 2px;
        font-size: 12px;
        line-height: 1.4;
        color: var(--b3-theme-primary);
        background: none;
        border: none;
        cursor: pointer;
    }
    .prog-chips-op:hover {
        text-decoration: underline;
        text-underline-offset: 2px;
    }
    .prog-chips-op:focus-visible {
        outline: 2px solid var(--b3-theme-primary-light);
    }
    .prog-chips-op-sep {
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        opacity: 0.55;
    }
    .prog-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
    }
    .prog-chip {
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 6px 10px;
        font-size: 13px;
        color: var(--b3-theme-on-background);
        cursor: pointer;
        background-color: var(--b3-theme-background);
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        transition: var(--b3-transition);
    }
    .prog-chip:has(input:checked) {
        font-weight: 500;
        color: var(--b3-theme-primary);
        background-color: var(--b3-theme-primary-lightest);
        border-color: var(--b3-theme-primary);
    }
    .prog-chip:has(input:focus-visible) {
        outline: 2px solid var(--b3-theme-primary-light);
    }
    .prog-chip input {
        margin: 0;
        accent-color: var(--b3-theme-primary);
    }
    .prog-chip-token {
        font-weight: 600;
    }
    .prog-chip-count {
        font-size: 12px;
        color: inherit;
        opacity: 0.64;
        font-variant-numeric: tabular-nums;
    }
    .prog-no-heading {
        padding: 8px 10px;
        font-size: 13px;
        color: var(--b3-theme-on-surface);
        opacity: 0.64;
        border: 1px dashed var(--b3-border-color);
        border-radius: 6px;
    }

    /* ---- 卡2 字数滑块（Settings prog-tune-row 先例；方案 §4.3） ---- */
    .prog-slider-row {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        margin: 10px 0 6px;
    }
    .prog-field-label {
        font-size: 13px;
        font-weight: 500;
        color: var(--b3-theme-on-surface);
    }
    .prog-slider-val {
        min-width: 40px;
        font-size: 13px;
        font-weight: 600;
        color: var(--b3-theme-primary);
        text-align: right;
        font-variant-numeric: tabular-nums;
    }
    /* accent-color 勿写：会压过 b3-slider 官方 ::-webkit-slider-thumb 定制（vision P2-4） */
    .prog-slider {
        width: 100%;
        margin: 0;
    }
    .prog-slider-scale {
        display: flex;
        justify-content: space-between;
        margin-top: 2px;
        font-size: 11px;
        color: var(--b3-theme-on-surface);
        opacity: 0.64;
    }
    .prog-field-hint {
        font-size: 12px;
        line-height: 1.5;
        color: var(--b3-theme-on-surface);
        opacity: 0.64;
    }
    /* 期3 手动分片：勾上后切分/断句配置整体失效——置灰+禁交互（prog-locked 先例配方，
       静态 class 可被 scoped CSS 命中） */
    .prog-manual-dim {
        opacity: 0.45;
        pointer-events: none;
    }
    .prog-manual-slave {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }
    /* □1 切分总纲（卡2 导语）：hint 字阶提一档浓度，与下方两行操作性 hint 分层 */
    .prog-field-hint.prog-card-lede {
        opacity: 0.78;
    }

    /* ---- 卡3 开关行（settingBox hover 配方） ---- */
    .prog-switch-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 8px;
        margin: 0 -8px;
        font-size: 13px;
        color: var(--b3-theme-on-background);
        cursor: pointer;
        border-radius: 6px;
        transition: background-color 0.15s;
    }
    .prog-switch-row:hover {
        background-color: var(--b3-list-hover, var(--b3-theme-surface-lighter));
    }

    /* ---- 卡3 断句 chip（2×2，预留 □14 锁位） ---- */
    .prog-radio-label {
        margin: 10px 0 6px;
        font-size: 13px;
        font-weight: 500;
        color: var(--b3-theme-on-surface);
    }
    .prog-radio-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 8px;
    }
    .prog-radio-chip {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 7px 10px;
        font-size: 13px;
        color: var(--b3-theme-on-background);
        cursor: pointer;
        background-color: var(--b3-theme-background);
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        transition: var(--b3-transition);
    }
    .prog-radio-chip:has(input:checked) {
        font-weight: 500;
        color: var(--b3-theme-primary);
        background-color: var(--b3-theme-primary-lightest);
        border-color: var(--b3-theme-primary);
    }
    .prog-radio-chip:has(input:focus-visible) {
        outline: 2px solid var(--b3-theme-primary-light);
    }
    .prog-radio-chip input {
        margin: 0;
        accent-color: var(--b3-theme-primary);
    }
    /* □14 锁态（未激活 p/t/i）：运行时挂的类须 :global 组合选择器，否则 scoped CSS
       当 unused 剪掉（debugging/e2e/mobile.md「浏览器模拟思源移动端」先例）。弱化下沉到文字 span（vision 复评 P2：容器
       opacity 会连带压暗 b3-tooltips 伪元素=Pro 引导气泡只剩 60% 浓度）+ 虚线边框
       强化「不可选区」语义；🔒 保持全浓（暗底金锁=强信号） */
    .prog-radio-chip:global(.prog-locked) {
        cursor: not-allowed;
        border-style: dashed;
    }
    .prog-radio-chip:global(.prog-locked) > span:not(.prog-radio-tag) {
        opacity: 0.6;
    }
    .prog-radio-chip :global(.prog-radio-tag) {
        flex: none;
        margin-left: auto;
        width: 13px;
        height: 13px;
        fill: var(--b3-theme-on-surface); /* □30 sprite 锁保持全浓强信号（原 emoji 口径） */
    }

    /* ---- 底部操作栏 ---- */
    .prog-footer {
        position: sticky;
        bottom: 0;
        z-index: 2;
        display: flex;
        gap: 10px;
        align-items: center;
        padding: 10px 0 12px;
        background-color: var(--b3-theme-surface);
        border-top: 1px solid var(--b3-border-color);
    }
    .prog-footer button {
        margin: 0;
    }
    .prog-primary-btn {
        flex: 1;
        padding: 8px 18px;
        font-weight: 500;
        white-space: normal; /* en 长文案折行不溢出 */
    }

    /* ---- 等待态：骨架屏 + spinner ---- */
    .prog-loading {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }
    .prog-skeleton-card {
        padding: 12px;
        background-color: var(--b3-theme-surface);
        border: 1px solid var(--b3-theme-surface-lighter);
        border-radius: var(--b3-border-radius);
    }
    .prog-skeleton-title,
    .prog-skeleton-cell,
    .prog-skeleton-bar {
        border-radius: 4px;
        background: linear-gradient(
            90deg,
            var(--b3-theme-surface-lighter) 25%,
            var(--b3-theme-background-light) 37%,
            var(--b3-theme-surface-lighter) 63%
        );
        background-size: 400% 100%;
        animation: prog-shimmer 1.2s ease infinite;
    }
    .prog-skeleton-title {
        width: 30%;
        height: 14px;
        margin-bottom: 10px;
    }
    .prog-skeleton-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 8px;
        margin-bottom: 10px;
    }
    .prog-skeleton-cell {
        height: 52px;
    }
    .prog-skeleton-bar {
        height: 46px;
    }
    .prog-loading-row {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        font-size: 13px;
        color: var(--b3-theme-on-surface);
    }
    .prog-spinner {
        width: 14px;
        height: 14px;
        border: 2px solid var(--b3-theme-primary-light);
        border-top-color: var(--b3-theme-primary);
        border-radius: 50%;
        animation: prog-spin 0.8s linear infinite;
    }
    @keyframes prog-shimmer {
        0% {
            background-position: 100% 0;
        }
        100% {
            background-position: 0 0;
        }
    }
    @keyframes prog-spin {
        to {
            transform: rotate(360deg);
        }
    }

    /* ---- 移动端 90vw 窄宽（chips 流式换行、sparkline 均分天然适配，无需新增断点） ---- */
    @media (max-width: 640px) {
        .prog-stat-grid,
        .prog-skeleton-grid {
            grid-template-columns: repeat(2, 1fr);
        }
    }
</style>
