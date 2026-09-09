import { Dialog, Setting } from "siyuan";
import { openChangelogDialog } from "../../sy-tomato-plugin/src/libs/changelogDialog";
import changelog2025 from "./changelog/2025.json";
import changelog2026 from "./changelog/2026.json";
import { openHelpDialog } from "../../sy-tomato-plugin/src/libs/helpDialog";
import helpDocs from "./help.json";
import { openHelpMenu } from "../../sy-tomato-plugin/src/libs/helpMenu";
import { buildSettingsHeader } from "../../sy-tomato-plugin/src/libs/settingsHeader";
import { migrateLegacyHotkeys } from "../../sy-tomato-plugin/src/libs/hotkeyCap";
import { ICONS } from "./icons";
import { prog, progSettingsOpenHK } from "./Progressive";
import { EventType, events } from "../../sy-tomato-plugin/src/libs/Events";
import { flashBox } from "./FlashBox";
import { pieceMovingBox } from "./PieceMovingBox";
import { pieceSummaryBox } from "./PieceSummaryBox";
import { writingCompareBox } from "./WritingCompareBox";
import { digestProgressiveBox } from "./DigestProgressiveBox";
import { openBuyDialog } from "../../sy-tomato-plugin/src/BuyDialog";
import { getPluginSpec, isObject, Siyuan, tryFixCfg } from "../../sy-tomato-plugin/src/libs/utils";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import { blockIconMenu, card2dailycard, cardLanding, digSubrankOpen, floatbarExpandPref, floatbarMainBtns, floatbarFreeMainBtns, floatbarFlatCollapsed, mobileSelectBtns, mobileTopBar, cardAppendTime, cardUnderPiece, dailyQuota, digest2dailycard, digestLanding, digestAddReadingpoint, digestGlobalSigle, digestmenu, wholeDigestMenu, cardContextMenu, reviewSchedMenu, revisitRhythmMenu, digestNoBacktraceLink, flashcardAddRefs, flashcardMultipleLnks, flashcardNotebook, hideBtnsInFlashCard, pieceTailCard, initProgFloatBtnsDisable, markOriginTextBG, revTraceEnabled, revTraceScope, revTraceScopeFromLegacy, openCardsOnOpenPiece, pieceNoBacktraceLink, piecesmenu, ProgressiveJumpMenu, ProgressiveStart2learn, userID, userToken, licenseCloudSynced, windowOpenStyle } from "../../sy-tomato-plugin/src/libs/stores";
import { STORAGE_Prog_SETTINGS } from "../../sy-tomato-plugin/src/constants";
import { STORAGE_BOOKS, STORAGE_PROGDATA, STORAGE_READING_ORDER } from "./constants";
import { BaseTomatoPlugin } from "../../sy-tomato-plugin/src/libs/BaseTomatoPlugin";
import { DestroyManager } from "../../sy-tomato-plugin/src/libs/destroyer";
import SettingsSvelte from "./Settings.svelte"
import ReviewPlanDialog from "./ReviewPlanDialog.svelte"
import { resetKey, verifyKeyProgressive, lastVerifyResult } from "../../sy-tomato-plugin/src/libs/user";
import { neighborCode } from "../../sy-tomato-plugin/src/libs/neighbor";
import { applyProgSkins, refreshProgGate } from "./theme";
import { newID } from "stonev5-utils";
import { ProgressivePluginConfig, ProgressivePluginInstance } from "../../sy-tomato-plugin/src/libs/gconst";
import { setGlobal } from "stonev5-utils";
import { mount, unmount } from "svelte";
import { progStorage } from "./ProgressiveStorage";
import { siyuan, timeUtil } from "../../sy-tomato-plugin/src/libs/utils";
import { initProgFloatBtns, toggleFloatBarSystem, toggleFreeFloat } from "./ProgressiveBtn";
import { PROG_FLOAT_ICONS } from "./progIcons";
import { initDigestMarker } from "./digestMarker";
import { initMaterialMarker } from "./materialMarker";
import { applyRevTraceEnabled, lastRevTraceScope, rememberRevTraceScope } from "./revTrace";
import { initFleet, onunloadFleet, type FleetActions } from "./fleet";
import { reloadSelfPlugin } from "../../sy-tomato-plugin/src/libs/pluginReload";
import { syncSettingsFromDisk } from "../../sy-tomato-plugin/src/libs/storageHotReload";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
import { notifyFleetChanged } from "./fleetNotify";
import { closeFloatPopover } from "./overlays";
import { openDueReviewList } from "./reviewMenu";
import { buildContentBlocks, computePieceIndex, runSplit } from "./Split2Pieces";
import { createPiece, deleteAllPieces, fullfilContent } from "./helper";
import { invalidateBookStatusCache } from "./bookStatus";
import { registerTailCardRender } from "./tailCardRender";

// 更新日志按年拆分存储（src/changelog/<年>.json，当年文件追加、往年冻结），此处组装倒序全集
const changelog = [...changelog2026, ...changelog2025];

function loadStore(plugin: BaseTomatoPlugin) {
    userToken.load(plugin);
    userID.load(plugin);
    licenseCloudSynced.load(plugin);
    dailyQuota.load(plugin);
    digestAddReadingpoint.load(plugin);
    digestGlobalSigle.load(plugin);
    ProgressiveJumpMenu.load(plugin);
    piecesmenu.load(plugin);
    ProgressiveStart2learn.load(plugin);
    mobileSelectBtns.load(plugin);
    digestmenu.load(plugin);
    wholeDigestMenu.load(plugin);
    cardContextMenu.load(plugin);
    reviewSchedMenu.load(plugin);
    revisitRhythmMenu.load(plugin);
    blockIconMenu.load(plugin);
    // 期1 □2 摘抄落点迁移：digestLanding 无存量值时，老开关 digest2dailycard=true → "daily"
    // （保持原行为），否则默认 "central"；.set 只写内存——即便未持久化，每次启动重跑也幂等
    const hasLanding = (plugin.settingCfg as any)?.digestLanding != null;
    digest2dailycard.load(plugin);
    digestLanding.load(plugin);
    if (!hasLanding && digest2dailycard.get() === true) {
        digestLanding.set("daily");
    }
    card2dailycard.load(plugin);
    // 制卡落点三档迁移（同上款幂等）：cardLanding 无存量时 card2dailycard=false → "cards"
    // （true 与默认 dailycard 同值无需动）；.set 只写内存，每次启动重跑幂等
    const hasCardLanding = (plugin.settingCfg as any)?.cardLanding != null;
    cardLanding.load(plugin);
    if (!hasCardLanding && card2dailycard.get() === false) {
        cardLanding.set("cards");
    }
    flashcardAddRefs.load(plugin);
    flashcardMultipleLnks.load(plugin);
    windowOpenStyle.load(plugin);
    flashcardNotebook.load(plugin);
    digestNoBacktraceLink.load(plugin);
    pieceNoBacktraceLink.load(plugin);
    markOriginTextBG.load(plugin);
    // □12 摘抄背景渲染态总开关：body 类即 CSS 总闸（index.scss div:has(> .prog-digest-mark)），
    // 订阅在 load 后挂——subscribe 立即同步一次，之后设置面板改值实时生效
    markOriginTextBG.subscribe(v => document.body.classList.toggle("prog-digest-bg-on", !!v));
    // revtrace-scope 范围三档迁移（digestLanding 同款幂等）：revTraceScope 无存量值时
    // 老开关 revTraceEnabled=true → "all"（旧开关开着=全局染，保持原行为），否则默认
    // "off"；.set 只写内存——即便未持久化，每次启动重跑也幂等。旧键留盘仅作迁移读源
    const hasRevTraceScope = (plugin.settingCfg as any)?.revTraceScope != null;
    revTraceEnabled.load(plugin);
    revTraceScope.load(plugin);
    const migratedScope = revTraceScopeFromLegacy(hasRevTraceScope, revTraceEnabled.get() === true);
    if (migratedScope) revTraceScope.set(migratedScope);
    // 订阅实时清/挂（命令 toggle 与设置面板同源；初始同步一次无害——非 off 时无编辑器
    // 则 no-op，off 时清零残留）；非 off 档顺带喂给命令 toggle 的「上次范围档」记忆
    rememberRevTraceScope(revTraceScope.get());
    revTraceScope.subscribe((v) => {
        rememberRevTraceScope(v);
        applyRevTraceEnabled(v);
    });
    hideBtnsInFlashCard.load(plugin);
    pieceTailCard.load(plugin);
    openCardsOnOpenPiece.load(plugin);
    cardUnderPiece.load(plugin);
    cardAppendTime.load(plugin);
    mobileTopBar.load(plugin);
    initProgFloatBtnsDisable.load(plugin);
    floatbarMainBtns.load(plugin);
    floatbarFreeMainBtns.load(plugin);
    floatbarFlatCollapsed.load(plugin);
    digSubrankOpen.load(plugin);
    floatbarExpandPref.load(plugin);
}

export default class ThePlugin extends BaseTomatoPlugin {
    private blockIconEventBindThis = this.blockIconEvent.bind(this);

    // 开/关箱即时失效判定链缓存（否则 30s TTL 窗口内书卡状态陈旧：开箱后误报
    // 「笔记本已关闭」、关箱后书卡仍可点）并联动舰队面板刷新
    private notebookChangedEventBindThis = () => {
        invalidateBookStatusCache();
        notifyFleetChanged();
    };

    private blockIconEvent({ detail }: any) {
        // v5 □7：块图标菜单只留核心入口（跳转/摘抄）；制卡/收集/提取族收进浮条 [+] 高级功能
        prog.blockIconEvent(detail);
        digestProgressiveBox.blockIconEvent(detail);
    }

    constructor(options: any) {
        super(options)
        this.loadProgStore = loadStore;

        // □4 调试通道门禁：prog/split 含无确认破坏 API（deleteAllPieces/refillPiece 等），
        // 默认不挂；仅 localStorage PROG_DEBUG=1 显式开启（dev 实例调试用，设置后 reload 插件生效）。
        // localStorage 裸读须防抛：constructor 里抛=整个插件加载失败，与 fail-closed 意图相反
        let progDebug = false;
        try {
            progDebug = localStorage.getItem("PROG_DEBUG") === "1";
        } catch { /* 禁用环境同样视为关 */ }
        if (progDebug) {
            if (window.prog_zZmqus5PtYRi == null)
                window.prog_zZmqus5PtYRi = {} as any
        } else {
            delete window.prog_zZmqus5PtYRi // 清前次调试残留（window 跨插件 reload 存活，不清则关闸后旧通道仍带废引用常驻）
        }

        this.taskCfg = this.loadData(STORAGE_Prog_SETTINGS).then(cfg => {
            this.settingCfg = cfg;
            if (!isObject(this.settingCfg)) {
                this.settingCfg = {} as TomatoSettings;
            }

            if (window.prog_zZmqus5PtYRi) { // 门禁未开=整组调试挂载跳过
                window.prog_zZmqus5PtYRi.pluginConfig = this.settingCfg;
                window.prog_zZmqus5PtYRi.siyuan = siyuan
                window.prog_zZmqus5PtYRi.timeUtil = timeUtil
                window.prog_zZmqus5PtYRi.pluginInstance = this;
                window.prog_zZmqus5PtYRi.prog = prog; // agent 实验通道：refillPiece 等真链路（含锁/索引加载）
                window.prog_zZmqus5PtYRi.split = {
                    buildContentBlocks,
                    computePieceIndex,
                    saveIndex: (bookID: string, groups: WordCountType[][]) => progStorage.saveIndex(bookID, groups),
                    loadIndex: (bookID: string) => progStorage.loadBookIndexIfNeeded(bookID),
                    createPiece,
                    deleteAllPieces,
                    fullfilContent,
                    runSplit,
                };
            }
            loadStore(this);
            setGlobal(ProgressivePluginConfig, this.settingCfg)
            return this.settingCfg;
        });
        setGlobal(ProgressivePluginInstance, this)
        tryFixCfg(this.name, STORAGE_Prog_SETTINGS);
    }

    /**
     * □14 激活互通暴露面：recite 设置面板惰性互问「渐进已激活？」的应答——验签已通过
     * （lastVerifyResult()===true）才返回激活码，未激活/未验证（含启动验证在路上）返回空串，
     * FREE_KEY 免费码语义上不是渐进激活码、绝不外流（门控纯函数 neighborCode 单测覆盖）。
     * 对方是 recite（progressiveCodeFromApp），鲁棒纪律见 src/neighbor.ts 头注。
     */
    getProgressiveCode(): string {
        return neighborCode(lastVerifyResult(), userToken.get());
    }

    async onLayoutReady() {
        // □5 时序统一：Box 注册已前移 async onload（框架保序 onload 完成后才
        // onLayoutReady）；此处再 await 一次为零成本防御，保住本簇的配置前提
        await this.taskCfg;

        // 思源登录态异步就绪轮询：启动时未登录/换账号的门禁在登录后补验刷新（照 recite
        // index.ts 先例）。resetKey 防 verify 懒缓存旧结果：晚到/换账号场景若不重验，
        // _isValid 会被空/旧 userID 的失败结果缓存死，门禁恢复后=付费用户整会话误拦
        //（review P1-1；□14 收费门恢复后该缺口从皮肤显示升级为功能拦截）
        clearInterval(setGlobal("prog index", setInterval(() => {            const id = Siyuan?.user?.userId;
            if (id && userID.get() !== id) {
                userID.write(id).then(async () => {
                    resetKey();
                    await verifyKeyProgressive();
                    refreshProgGate(lastVerifyResult() === true);
                });
            }
        }, 2000)));

        if (userID.get()) {
            resetKey();
            await verifyKeyProgressive();
        }
        // □14 收费门恢复（2026-08-30）：皮肤+断句+生词 AI+收集/写作对比族 Pro，摘抄/挪片/
        // 制卡核心流免费。老 VIP（included 标记不变）自然通过验证自动过门零操作。
        refreshProgGate(lastVerifyResult() === true);

        // 2026-09-06 撞键清理迁移：custom 仍是旧默认（用户从未改键）才写新默认，改过/删过的
        // 不动（幂等）；命令已在 onload 注册（框架保序晚于此），keymap 条目就绪可查。
        // 末条= v5 □7 挪键的存量尾巴：default 已 ⌥⌘F7，但当时未迁移——custom 残留 ⌥⌘F6
        // 的老用户仍与「恢复笔记颜色」双绑（dev/主实例实锤）
        await migrateLegacyHotkeys("sy-progressive-plugin", [
            ["执行摘抄留档", "⌥⇧P", "⌥⇧⌘P"],
            ["执行摘抄背诵", "⌥⌘Z", "⌥⌘8"],
            ["合并所有分片到新文件", "⌥⌘F6", "⌥⌘F7"],
        ]);

        // applyProgSkins 留 auth 簇后（保持现状顺序）：皮肤属性与 Pro 门禁 class 独立挂
        // body，但「verify 后恢复视觉」防未激活用户 Pro 皮肤闪现（v5 □8 三维皮肤恢复）
        applyProgSkins(this.settingCfg);

        // 浮条 DOM 直挂 document.body（tomato loadFloatingBall 先例：自挂 DOM 不进 onload 链）
        initProgFloatBtns();
    }

    /** siyuan383 □3 多端热更：覆盖即自管（未覆盖=内核对他端每条 petal 写入自动整重载）。
     *  渐进版=共享刷值（Prog_SETTINGS 同落共享 store 键）+ 全局配置/皮肤重应用 + 数据
     *  文件缓存刷新；保存方链路（Settings.svelte / 原生 Setting confirm）调同一方法。 */
    async onStorageHotReload(beforeCfg?: unknown) {
        const r = await syncSettingsFromDisk(this, STORAGE_Prog_SETTINGS, beforeCfg);
        if (r.changed.length) {
            if (window.prog_zZmqus5PtYRi) window.prog_zZmqus5PtYRi.pluginConfig = this.settingCfg;
            setGlobal(ProgressivePluginConfig, this.settingCfg);
            applyProgSkins(this.settingCfg);
        }
        // 数据文件缓存刷新：ProgressiveStorage 直读 plugin.data（books/阅读顺序/分片数据），
        // 整重载时代由重载兜底读新，自管后须显式 loadData 刷本端缓存
        await Promise.all([STORAGE_BOOKS, STORAGE_PROGDATA, STORAGE_READING_ORDER].map(f => this.loadData(f)));
        // 结构性重载放最后（review P2-1）：热更动作全跑完再整重载，防 teardown 410 掐断
        // 上面 loadData 落进钩子 catch 再重载一轮（双重重载多闪一次）
        if (r.structural.length) await reloadSelfPlugin(this.name);
    }

    async onDataChanged(reason?: string) {
        debugLog("onDataChanged", `${this.name} reason=${reason ?? "?"}`);
        try {
            await this.onStorageHotReload();
        } catch (e) {
            debugLog("onDataChanged", `${this.name} 热更失败回退整重载：${e}`);
            await reloadSelfPlugin(this.name);
        }
    }

    onunload(): void {
        prog.onunload();
        onunloadFleet();
        closeFloatPopover(); // □11 浮层命令式挂载在 body——卸载不清理会残留+同屏双浮层（review P1）
        document.body.classList.remove("prog-digest-bg-on"); // □12 摘抄背景总闸随卸载摘除（review P2）
    }

    // 设置面板去重（2026-08-26 e2e 发现）：面板开着再点齿轮/命令会叠两个 Dialog，
    // 重开语义=先关旧的再开新（destroyBy 触发 dialog + svelte 双清）
    private settingsDm: DestroyManager | null = null;

    private openSettings() {
        const dm = new DestroyManager();
        this.settingsDm?.destroyBy();
        this.settingsDm = dm;
        const id = newID();
        const dialog = new Dialog({
            title: " ", // 占位保住 header，真实标题按钮组创建后以节点形式挂入
            content: `<div id="${id}"></div>`,
            width: events.isMobile ? "90vw" : "min(700px, 92vw)",
            height: events.isMobile ? "180svw" : "700px",
            destroyCallback: () => {
                dm.destroyBy("1")
            },
            hideCloseIcon: true,
        });
        // □3 统一 header：名+版本+Pro 徽标｜帮助菜单单图标钮+关闭钮；Help帮助/更新日志/
        // outline 保存钮退役（帮助收进菜单，保存走 footer「保存并关闭」）
        const header = buildSettingsHeader({
            title: tomatoI18n.渐进学习 + " · " + tomatoI18n.设置,
            version: "v" + this.pluginSpec?.version + "p",
            pro: lastVerifyResult() === true,
            onHelp: (e) => openHelpMenu(e, {
                usage: () => openHelpDialog("https://my.feishu.cn/docx/ZZr9dGoIno5pnVxn2vpch6BCn3f?from=from_copylink", helpDocs),
                changelog: () => openChangelogDialog(changelog),
            }),
            onClose: () => dialog.destroy(),
        });
        dialog.element.querySelector(".b3-dialog__header")
            .replaceChildren(header.root);
        const d = mount(SettingsSvelte, {
            target: dialog.element.querySelector("#" + id),
            props: {
                plugin: this,
                dm,
                proBadge: header.badge,
            }
        });
        dm.add("1", () => { dialog.destroy() })
        dm.add("2", () => { unmount(d) })
    }

    // 可见性期3 □3 复习计划面板：独立 Dialog 去重重开（settings 同款 DestroyManager 范式；
    // 入口常驻=Dock 顶部钮 + 浮条 ✧ 菜单，不依赖 due>0——✧ 徽章条件渲染教训）
    private reviewPlanDm: DestroyManager | null = null;

    openReviewPlanDialog() {
        const dm = new DestroyManager();
        this.reviewPlanDm?.destroyBy();
        this.reviewPlanDm = dm;
        const id = newID();
        const dialog = new Dialog({
            title: tomatoI18n.复习计划,
            content: `<div id="${id}"></div>`,
            width: events.isMobile ? "92vw" : "min(760px, 92vw)",
            height: events.isMobile ? "120svw" : "640px",
            destroyCallback: () => dm.destroyBy("1"),
        });
        const app = mount(ReviewPlanDialog, {
            target: dialog.element.querySelector("#" + id),
            props: { plugin: this },
        });
        dm.add("1", () => { dialog.destroy() });
        dm.add("2", () => { unmount(app); });
    }

    async onload() {
        this.addIcons(ICONS);
        this.addIcons(PROG_FLOAT_ICONS);
        initDigestMarker(this);
        initMaterialMarker(this);
        events.onload(this);
        tomatoI18n.init();
        // □2 片尾收束卡渲染器（3.8.3+；旧内核 customBlockRenders 缺省=注册即无操作，
        // 建卡链 supportsTailCardBlock 同判 false 整体不触发）
        registerTailCardRender(this);

        // v5 □5：浮条系统总开关命令（与设置项 initProgFloatBtnsDisable 同一状态）
        this.addCommand({
            langKey: "progFloatBarToggle",
            langText: tomatoI18n.渐进学习浮条开关,
            callback: () => {
                toggleFloatBarSystem();
            },
        });

        // revtrace-scope：修订痕迹开关命令保持二态开/关（与设置项 revTraceScope 同源；
        // 无默认键位——命令面板可搜，免去 winHotkey 全仓比对；实时生效走 loadStore 订阅）。
        // 开=回到上次范围档（记忆喂点=loadStore/订阅的非 off 值；从未有过值时开到 "prog"）
        this.addCommand({
            langKey: "revTraceToggle",
            langText: tomatoI18n.修订痕迹开关,
            callback: () => {
                revTraceScope.set(revTraceScope.get() === "off" ? lastRevTraceScope() : "off");
                // set 只改内存（stores P1-1 教训），命令通道确定落盘紧跟 write——
                // 否则重启/插件 reload 后开关回旧值，与设置面板通道行为不对称
                revTraceScope.write().catch(() => { });
            },
        });

        this.setting = new Setting({
            confirmCallback: async () => {
                // await 落盘再热更：saveData 异步写被抢跑会掐断，文件保持旧值；
                // □3 与钩子共用 onStorageHotReload（常规键不再整重载，结构性键兜底在内）。
                // oldCfg 用 saveData 前落盘值——面板 bind 编辑保存前已进内存 cfg，快照内存
                // =diff 恒空结构性漏判（review P0-1）；盘上才是编辑前值
                const diskBefore = await this.loadData(STORAGE_Prog_SETTINGS);
                await this.saveData(STORAGE_Prog_SETTINGS, this.settingCfg);
                await this.onStorageHotReload(diskBefore);
            }
        });
        // v5 □7：原生 Setting 面板不再放条目（与自绘设置面板两套并存易不一致，统一走顶栏齿轮 openSettings）

        this.addCommand({
            langKey: progSettingsOpenHK.langKey,
            langText: progSettingsOpenHK.langText(),
            hotkey: progSettingsOpenHK.m,
            callback: () => {
                this.openSettings();
            },
        });

        // 购买弹框命令入口（阶段 1.5）：老用户/已激活用户可随时通过命令面板回顾购买页
        this.addCommand({
            langKey: "openProgressiveBuyDialog",
            langText: tomatoI18n.打开渐进学习购买页,
            callback: async () => {
                // 主动验证而非读懒缓存：冷启动后无人触发过验证时 lastVerifyResult()
                // 是 null，购买页会误按未激活态渲染（含 isMe 取消激活按钮丢失）
                openBuyDialog("progressive", tomatoI18n.购买页, (await verifyKeyProgressive()) === true);
            },
        });

        this.eventBus.on(EventType.click_blockicon, this.blockIconEventBindThis);
        this.eventBus.on(EventType.opened_notebook, this.notebookChangedEventBindThis);
        this.eventBus.on(EventType.closed_notebook, this.notebookChangedEventBindThis);
        getPluginSpec(this.name).then(sp => {
            this.pluginSpec = sp
        });

        // 顶栏设置火苗（topbar-logo 战役返工，与状态栏火苗同源=插件身份标识）：挂类着 --prog-topbar
        // 家族琥珀色（recite 顶栏 icon 挂 .recite-topbar-gear 同款机制——线稿 stroke:currentColor
        // 随 color，改 color 即改图标色）
        this.addTopBar({
            icon: "iconSettingsProg",
            title: progSettingsOpenHK.langText() + progSettingsOpenHK.w(),
            position: "left",
            callback: () => {
                this.openSettings();
            },
        }).classList.add("prog-topbar-settings")
        // 桌面顶栏菜单退役（2026-08-31 用户拍板）：加书/跳转在桌面走右键块菜单+浮条+命令
        // 面板；移动端保留顶栏——移动端无浮条 hover 生态，这里是唯一常驻入口
        if (events.isMobile) prog.addTopbar(this, "left");

        // □5 时序统一（照 tomato □4 模式）：官方框架 await plugin.onload()（2023 年起两代
        // 内核均如此，事实源 docs/siyuan-plugin-lifecycle-async-loading.md）——配置就绪收进
        // onload，Box 注册集中于此后顺序执行；onLayoutReady 只剩 auth 簇+视觉恢复+浮条
        // DOM 直挂。各 Box 内的 verifyKeyProgressive 验签保留（懒缓存整链只真跑一次，
        // 阻塞的仅命令注册——tomato onload 605 批先例）。progStorage 是 loadData 数据加载
        // （与 taskCfg 同性质，非 verify 类无谓穿插），必须先于 initFleet——fleet 首刷
        // refreshFleet 读 booksInfos，顺序反转=e2e 实锤 undefined.data TypeError。
        await this.taskCfg;
        await flashBox.onload(this, this.settingCfg);
        await pieceMovingBox.onload(this, this.settingCfg);
        await pieceSummaryBox.onload(this, this.settingCfg);
        await writingCompareBox.onload(this, this.settingCfg);
        await digestProgressiveBox.onload(this, this.settingCfg);
        await progStorage.onLayoutReady(this);
        await prog.onload(this, this.settingCfg);
        const fleetActions: FleetActions = {
            startReading: () => prog.startToLearnWithLock(),
            freeDigest: () => toggleFreeFloat(),
            addFirstBook: () => prog.addProgressiveReadingWithLock(),
            continueReading: (bookID) => prog.startToLearnWithLock(bookID),
            manageBooks: () => prog.viewAllProgressiveBooks(),
            addWritingBook: () => prog.openAddWritingBookDialog(),
            openSettings: () => this.openSettings(),
            reciteAction: async () => {
                if (prog.isReciteInstalled()) {
                    await prog.sendToRecite();
                } else {
                    await siyuan.pushMsg(tomatoI18n.导流仿写未装, 2500);
                }
            },
            isReciteInstalled: () => prog.isReciteInstalled(),
            openDueList: (ev, bookID) => openDueReviewList(ev, bookID),
            openReviewPlan: () => this.openReviewPlanDialog(),
            // 舰队管理 □2：书卡菜单动作（数据侧动作后 notifyFleetChanged 驱动面板即时刷新；
            // 归档走 confirm 确认链，书摘出调度后由 30s 刷新兜底，不抢 confirm 时序）
            togglePinBook: async (bookID, v) => {
                await progStorage.setPinnedBook(bookID, v);
                notifyFleetChanged();
            },
            toggleHideBook: async (bookID, v) => {
                await progStorage.setHiddenBook(bookID, v);
                notifyFleetChanged();
            },
            ignoreBook: async (bookID) => {
                await progStorage.setIgnoreBook(bookID, true);
                notifyFleetChanged();
            },
            archiveBook: (bookID) => prog.archiveBookWithConfirm(bookID),
        };
        initFleet(this, fleetActions);
    }
}