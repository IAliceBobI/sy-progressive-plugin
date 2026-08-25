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
import { add2digBtn2lockIcon, add2piecesBtn2lockIcon, btnCleanOriginText, btnDelCard, btnDeleteBack, btnDeleteExit, btnDeleteNext, btnFullfilContent, btnIgnoreBook, btnNext, btnNextBook, btnOpenFlashcardTab, btnPrevious, btnSaveCard, btnSplitByPunctuations, btnSplitByPunctuationsList, btnSplitByPunctuationsListCheck, mobileTopBar, btnStop, btnViewContents, cardAppendTime, cardUnderPiece, digest2dailycard, digest2Trace, digestAddReadingpoint, digestGlobalSigle, digestmenu, digestNoBacktraceLink, doubleClick2DigestDesktop, doubleClick2DigestMobile, finishPieceCreateAt, flashcardAddRefs, flashcardMultipleLnks, flashcardNotebook, flashcardUseLink, getAllPieceNotesEnable, hideBtnsInFlashCard, initProgFloatBtnsDisable, makeCardEnable, makeCardHereEnable, markOriginText, markOriginTextBG, merg2newBookEnable, multilineMarkEnable, openCardsOnOpenPiece, PieceMovingDown, PieceMovingUp, pieceNoBacktraceLink, piecesmenu, PieceSummaryBoxmenu, ProgressiveJumpMenu, ProgressiveStart2learn, ProgressiveViewAllMenu, send2compareNoteEnable, send2dailyCardEnable, send2dailyCardNoRefEnable, send2exctract2bottomEnable, send2exctractNoteEnable, send2removeNoteColor, summary2dailynote, userID, userToken, licenseCloudSynced, windowOpenStyle, words2dailycard } from "../../sy-tomato-plugin/src/libs/stores";
import { STORAGE_Prog_SETTINGS } from "../../sy-tomato-plugin/src/constants";
import { BaseTomatoPlugin } from "../../sy-tomato-plugin/src/libs/BaseTomatoPlugin";
import { DestroyManager } from "../../sy-tomato-plugin/src/libs/destroyer";
import SettingsSvelte from "./Settings.svelte"
import { resetKey, verifyKeyProgressive } from "../../sy-tomato-plugin/src/libs/user";
import { newID } from "stonev5-utils";
import { ProgressivePluginConfig, ProgressivePluginInstance } from "../../sy-tomato-plugin/src/libs/gconst";
import { setGlobal } from "stonev5-utils";
import { mount } from "svelte";
import { startTaskLoop } from "./ProgressiveTask";
import { progStorage } from "./ProgressiveStorage";
import { siyuan, timeUtil } from "../../sy-tomato-plugin/src/libs/utils";
import { initProgFloatBtns } from "./ProgressiveBtn";
import { buildContentBlocks, computePieceIndex, runSplit } from "./Split2Pieces";
import { createPiece, fullfilContent } from "./helper";

function loadStore(plugin: BaseTomatoPlugin) {
    userToken.load(plugin);
    userID.load(plugin);
    licenseCloudSynced.load(plugin);
    finishPieceCreateAt.load(plugin);
    add2digBtn2lockIcon.load(plugin);
    add2piecesBtn2lockIcon.load(plugin);
    digestAddReadingpoint.load(plugin);
    digestGlobalSigle.load(plugin);
    ProgressiveViewAllMenu.load(plugin);
    ProgressiveJumpMenu.load(plugin);
    piecesmenu.load(plugin);
    ProgressiveStart2learn.load(plugin);
    send2compareNoteEnable.load(plugin);
    send2removeNoteColor.load(plugin);
    send2exctractNoteEnable.load(plugin);
    send2exctract2bottomEnable.load(plugin);
    PieceMovingUp.load(plugin);
    PieceMovingDown.load(plugin);
    digestmenu.load(plugin);
    PieceSummaryBoxmenu.load(plugin);
    digest2Trace.load(plugin);
    digest2dailycard.load(plugin);
    words2dailycard.load(plugin);
    doubleClick2DigestDesktop.load(plugin);
    doubleClick2DigestMobile.load(plugin);
    merg2newBookEnable.load(plugin);
    getAllPieceNotesEnable.load(plugin);
    makeCardEnable.load(plugin);
    multilineMarkEnable.load(plugin);
    send2dailyCardNoRefEnable.load(plugin);
    send2dailyCardEnable.load(plugin);
    makeCardHereEnable.load(plugin);
    flashcardAddRefs.load(plugin);
    flashcardMultipleLnks.load(plugin);
    windowOpenStyle.load(plugin);
    flashcardNotebook.load(plugin);
    flashcardUseLink.load(plugin);
    digestNoBacktraceLink.load(plugin);
    pieceNoBacktraceLink.load(plugin);
    summary2dailynote.load(plugin);
    markOriginText.load(plugin);
    markOriginTextBG.load(plugin);
    hideBtnsInFlashCard.load(plugin);
    openCardsOnOpenPiece.load(plugin);
    cardUnderPiece.load(plugin);
    cardAppendTime.load(plugin);
    btnViewContents.load(plugin);
    btnPrevious.load(plugin);
    btnNext.load(plugin);
    btnCleanOriginText.load(plugin);
    btnFullfilContent.load(plugin);
    btnStop.load(plugin);
    btnNextBook.load(plugin);
    btnOpenFlashcardTab.load(plugin);
    btnDeleteBack.load(plugin);
    btnDeleteNext.load(plugin);
    btnSaveCard.load(plugin);
    btnDelCard.load(plugin);
    btnDeleteExit.load(plugin);
    btnIgnoreBook.load(plugin);
    btnSplitByPunctuations.load(plugin);
    mobileTopBar.load(plugin);
    btnSplitByPunctuationsListCheck.load(plugin);
    btnSplitByPunctuationsList.load(plugin);
    initProgFloatBtnsDisable.load(plugin);
}

export default class ThePlugin extends BaseTomatoPlugin {
    private blockIconEventBindThis = this.blockIconEvent.bind(this);

    private blockIconEvent({ detail }: any) {
        prog.blockIconEvent(detail);
        flashBox.blockIconEvent(detail);
        pieceMovingBox.blockIconEvent(detail);
        digestProgressiveBox.blockIconEvent(detail);
        pieceSummaryBox.blockIconEvent(detail);
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

    async onLayoutReady() {
        await this.taskCfg;

        clearInterval(setGlobal("prog index", setInterval(() => {
            const id = Siyuan?.user?.userId;
            if (id && userID.get() !== id) {
                userID.write(id);
            }
        }, 2000)));

        if (userID.get()) {
            resetKey();
            await verifyKeyProgressive();
        }

        await flashBox.onload(this, this.settingCfg);
        await pieceMovingBox.onload(this, this.settingCfg);
        await pieceSummaryBox.onload(this, this.settingCfg);
        await writingCompareBox.onload(this, this.settingCfg);
        await digestProgressiveBox.onload(this, this.settingCfg);
        await progStorage.onLayoutReady(this);
        await prog.onload(this, this.settingCfg);
        startTaskLoop();
        initProgFloatBtns();
    }

    onunload(): void {
        prog.onunload();
    }

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
        events.onload(this);
        tomatoI18n.init();

        this.setting = new Setting({
            confirmCallback: () => {
                this.saveData(STORAGE_Prog_SETTINGS, this.settingCfg);
                window.location.reload();
            }
        });

        this.setting.addItem({
            title: progSettingsOpenHK.langText(),
            createActionElement: () => {
                const btnaElement = document.createElement("button");
                btnaElement.className = "b3-button b3-button--outline fn__flex-center fn__size200";
                btnaElement.textContent = "open";
                btnaElement.addEventListener("click", () => {
                    this.openSettings();
                });
                return btnaElement;
            },
        });

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