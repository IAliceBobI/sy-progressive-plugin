import { Dialog, Setting } from "siyuan";
import { openChangelogDialog } from "../../sy-tomato-plugin/src/libs/changelogDialog";
import changelog from "./changelog.json";
import { openHelpDialog } from "../../sy-tomato-plugin/src/libs/helpDialog";
import helpDocs from "./help.json";
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
import { floatbarMainBtns, floatbarFlatCollapsed, mobileTopBar, cardAppendTime, cardUnderPiece, dailyQuota, digest2dailycard, digestAddReadingpoint, digestGlobalSigle, digestmenu, digestNoBacktraceLink, flashcardAddRefs, flashcardMultipleLnks, flashcardNotebook, flashcardUseLink, hideBtnsInFlashCard, initProgFloatBtnsDisable, markOriginTextBG, openCardsOnOpenPiece, pieceNoBacktraceLink, piecesmenu, ProgressiveJumpMenu, ProgressiveStart2learn, userID, userToken, licenseCloudSynced, windowOpenStyle } from "../../sy-tomato-plugin/src/libs/stores";
import { STORAGE_Prog_SETTINGS } from "../../sy-tomato-plugin/src/constants";
import { BaseTomatoPlugin } from "../../sy-tomato-plugin/src/libs/BaseTomatoPlugin";
import { DestroyManager } from "../../sy-tomato-plugin/src/libs/destroyer";
import SettingsSvelte from "./Settings.svelte"
import { resetKey, verifyKeyProgressive, lastVerifyResult } from "../../sy-tomato-plugin/src/libs/user";
import { neighborCode } from "../../sy-tomato-plugin/src/libs/neighbor";
import { applyProgSkins, refreshProgGate } from "./theme";
import { newID } from "stonev5-utils";
import { ProgressivePluginConfig, ProgressivePluginInstance } from "../../sy-tomato-plugin/src/libs/gconst";
import { setGlobal } from "stonev5-utils";
import { mount } from "svelte";
import { progStorage } from "./ProgressiveStorage";
import { siyuan, timeUtil } from "../../sy-tomato-plugin/src/libs/utils";
import { initProgFloatBtns, toggleFloatBarSystem, toggleFreeFloat } from "./ProgressiveBtn";
import { PROG_FLOAT_ICONS } from "./progIcons";
import { initDigestMarker } from "./digestMarker";
import { initFleet, notifyFleetChanged, onunloadFleet, type FleetActions } from "./fleet";
import { closeFloatPopover } from "./overlays";
import { openDueReviewList } from "./reviewMenu";
import { buildContentBlocks, computePieceIndex, runSplit } from "./Split2Pieces";
import { createPiece, fullfilContent } from "./helper";
import { invalidateBookStatusCache } from "./bookStatus";

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
    digestmenu.load(plugin);
    digest2dailycard.load(plugin);
    flashcardAddRefs.load(plugin);
    flashcardMultipleLnks.load(plugin);
    windowOpenStyle.load(plugin);
    flashcardNotebook.load(plugin);
    flashcardUseLink.load(plugin);
    digestNoBacktraceLink.load(plugin);
    pieceNoBacktraceLink.load(plugin);
    markOriginTextBG.load(plugin);
    // □12 摘抄背景渲染态总开关：body 类即 CSS 总闸（index.scss div:has(> .prog-digest-mark)），
    // 订阅在 load 后挂——subscribe 立即同步一次，之后设置面板改值实时生效
    markOriginTextBG.subscribe(v => document.body.classList.toggle("prog-digest-bg-on", !!v));
    hideBtnsInFlashCard.load(plugin);
    openCardsOnOpenPiece.load(plugin);
    cardUnderPiece.load(plugin);
    cardAppendTime.load(plugin);
    mobileTopBar.load(plugin);
    initProgFloatBtnsDisable.load(plugin);
    floatbarMainBtns.load(plugin);
    floatbarFlatCollapsed.load(plugin);
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

        if (window.prog_zZmqus5PtYRi == null)
            window.prog_zZmqus5PtYRi = {} as any

        this.taskCfg = this.loadData(STORAGE_Prog_SETTINGS).then(cfg => {
            this.settingCfg = cfg;
            if (!isObject(this.settingCfg)) {
                this.settingCfg = {} as TomatoSettings;
            }

            window.prog_zZmqus5PtYRi.pluginConfig = this.settingCfg;
            window.prog_zZmqus5PtYRi.siyuan = siyuan
            window.prog_zZmqus5PtYRi.timeUtil = timeUtil
            window.prog_zZmqus5PtYRi.pluginInstance = this;
            window.prog_zZmqus5PtYRi.split = {
                buildContentBlocks,
                computePieceIndex,
                saveIndex: (bookID: string, groups: WordCountType[][]) => progStorage.saveIndex(bookID, groups),
                loadIndex: (bookID: string) => progStorage.loadBookIndexIfNeeded(bookID),
                createPiece,
                fullfilContent,
                runSplit,
            };
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

        // v5 □8：三维皮肤 + 参数微调按存储恢复（theme.ts 注册表与 index.scss slug 对齐）
        applyProgSkins(this.settingCfg);

        await flashBox.onload(this, this.settingCfg);
        await pieceMovingBox.onload(this, this.settingCfg);
        await pieceSummaryBox.onload(this, this.settingCfg);
        await writingCompareBox.onload(this, this.settingCfg);
        await digestProgressiveBox.onload(this, this.settingCfg);
        await progStorage.onLayoutReady(this);
        await prog.onload(this, this.settingCfg);
        initProgFloatBtns();

        // v5 □6：状态栏火苗 + 左 Dock 舰队总览（动作注入防循环依赖，见 fleet.ts 头注）
        const fleetActions: FleetActions = {
            startReading: () => prog.startToLearnWithLock(),
            freeDigest: () => toggleFreeFloat(),
            addFirstBook: () => prog.addProgressiveReadingWithLock(),
            continueReading: (bookID) => prog.startToLearnWithLock(bookID),
            manageBooks: () => prog.viewAllProgressiveBooks(),
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
        };
        initFleet(this, fleetActions);
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
        const getTitle = (version: string) => {
            const help = document.createElement("button") as HTMLButtonElement;
            help.addEventListener("click", () => {
                openHelpDialog("https://awx9773btw.feishu.cn/docx/ZZr9dGoIno5pnVxn2vpch6BCn3f?from=from_copylink", helpDocs);
            });
            help.classList.add("b3-button")
            help.classList.add("b3-button--text")
            help.textContent = 'Help帮助'

            const log = document.createElement("button") as HTMLButtonElement;
            log.addEventListener("click", () => openChangelogDialog(changelog));
            log.classList.add("b3-button")
            log.classList.add("b3-button--text")
            log.textContent = '更新日志'

            const save = document.createElement("button") as HTMLButtonElement;
            save.addEventListener("click", () => {
                (globalThis as any).tomato_zZmqus5PtYRi.save();
            });
            save.classList.add("b3-button")
            save.classList.add("b3-button--outline")
            save.textContent = tomatoI18n.保存并退出;

            const div = document.createElement("div") as HTMLDivElement;
            const name = document.createElement("span") as HTMLSpanElement;
            name.textContent = tomatoI18n.渐进学习 + " · " + tomatoI18n.设置;
            name.style.fontWeight = "600";
            name.style.whiteSpace = "nowrap";
            div.appendChild(name);
            const versionSpan = document.createElement("span") as HTMLSpanElement;
            versionSpan.textContent = "v" + version + "p";
            versionSpan.style.fontSize = "12px";
            versionSpan.style.alignSelf = "center";
            div.appendChild(versionSpan);
            // 按钮组整组不拆行；放得下时被 margin-left:auto 推到行右端，窄窗/手机放不下时整组换行并右对齐
            const btnRow = document.createElement("div") as HTMLDivElement;
            btnRow.style.display = "flex";
            btnRow.style.alignItems = "center";
            btnRow.style.flexWrap = "nowrap";
            btnRow.style.gap = "8px";
            btnRow.style.marginLeft = "auto";
            btnRow.appendChild(help);
            btnRow.appendChild(log);
            btnRow.appendChild(save);
            div.appendChild(btnRow);
            div.style.display = "flex"
            div.style.alignItems = "center"
            div.style.flexWrap = "wrap"
            div.style.rowGap = "6px"
            div.style.columnGap = "8px"
            div.style.width = "100%"
            return div;
        }

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
        dialog.element.querySelector(".b3-dialog__header")
            .replaceChildren(getTitle(this.pluginSpec?.version));
        const d = mount(SettingsSvelte, {
            target: dialog.element.querySelector("#" + id),
            props: {
                plugin: this,
                dm,
            }
        });
        dm.add("1", () => { dialog.destroy() })
        dm.add("2", () => { d.destroy() })
    }

    onload() {
        this.addIcons(ICONS);
        this.addIcons(PROG_FLOAT_ICONS);
        initDigestMarker(this);
        events.onload(this);
        tomatoI18n.init();

        // v5 □5：浮条系统总开关命令（与设置项 initProgFloatBtnsDisable 同一状态）
        this.addCommand({
            langKey: "progFloatBarToggle",
            langText: tomatoI18n.渐进学习浮条开关,
            callback: () => {
                toggleFloatBarSystem();
            },
        });

        this.setting = new Setting({
            confirmCallback: () => {
                this.saveData(STORAGE_Prog_SETTINGS, this.settingCfg);
                window.location.reload();
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

        this.addTopBar({
            icon: "iconSettingsProg",
            title: progSettingsOpenHK.langText() + progSettingsOpenHK.w(),
            position: "left",
            callback: () => {
                this.openSettings();
            },
        })
        prog.addTopbar(this, "left");
    }
}