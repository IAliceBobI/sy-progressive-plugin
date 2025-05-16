import { Dialog, Setting } from "siyuan";
import { ICONS } from "./icons";
import { prog, progSettingsOpenHK } from "./Progressive";
import { EventType, events } from "../../sy-tomato-plugin/src/libs/Events";
import { flashBox } from "./FlashBox";
import { pieceMovingBox } from "./PieceMovingBox";
import { pieceSummaryBox } from "./PieceSummaryBox";
import { writingCompareBox } from "./WritingCompareBox";
import { digestProgressiveBox } from "./DigestProgressiveBox";
import { getPluginSpec, isObject, newID, Siyuan, tryFixCfg } from "../../sy-tomato-plugin/src/libs/utils";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import { btnCleanOriginText, btnDelCard, btnDeleteBack, btnDeleteExit, btnDeleteNext, btnFullfilContent, btnIgnoreBook, btnNext, btnNextBook, btnOpenFlashcardTab, btnPrevious, btnSaveCard, btnSplitByPunctuations, btnSplitByPunctuationsList, btnSplitByPunctuationsListCheck, btnStop, btnViewContents, cardAppendTime, cardUnderPiece, digest2dailycard, digest2Trace, digestmenu, digestNoBacktraceLink, doubleClick2DigestDesktop, doubleClick2DigestMobile, flashcardAddRefs, flashcardMultipleLnks, flashcardNotebook, flashcardUseLink, getAllPieceNotesEnable, hideBtnsInFlashCard, makeCardEnable, makeCardHereEnable, markOriginText, markOriginTextBG, merg2newBookEnable, multilineMarkEnable, openCardsOnOpenPiece, PieceMovingDown, PieceMovingUp, pieceNoBacktraceLink, piecesmenu, PieceSummaryBoxmenu, ProgressiveJumpMenu, ProgressiveStart2learn, ProgressiveViewAllMenu, send2compareNoteEnable, send2dailyCardEnable, send2dailyCardNoRefEnable, send2exctract2bottomEnable, send2exctractNoteEnable, send2removeNoteColor, summary2dailynote, userID, userToken, windowOpenStyle, words2dailycard } from "../../sy-tomato-plugin/src/libs/stores";
import { STORAGE_Prog_SETTINGS } from "../../sy-tomato-plugin/src/constants";
import { BaseTomatoPlugin } from "../../sy-tomato-plugin/src/libs/BaseTomatoPlugin";
import { DestroyManager } from "../../sy-tomato-plugin/src/libs/destroyer";
import Settings from "./Settings.svelte"
import { resetKey, verifyKeyProgressive } from "../../sy-tomato-plugin/src/libs/user";

function loadStore(plugin: BaseTomatoPlugin) {
    userToken.load(plugin);
    userID.load(plugin);
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
    btnSplitByPunctuationsListCheck.load(plugin);
    btnSplitByPunctuationsList.load(plugin);
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

        if (this.global.prog_zZmqus5PtYRi == null)
            this.global.prog_zZmqus5PtYRi = {} as any

        this.taskCfg = this.loadData(STORAGE_Prog_SETTINGS).then(cfg => {
            this.settingCfg = cfg;
            if (!isObject(this.settingCfg)) {
                this.settingCfg = {} as TomatoSettings;
            }

            this.global.prog_zZmqus5PtYRi.pluginConfig = this.settingCfg;
            loadStore(this);
            return this.settingCfg;
        });
        tryFixCfg(this.name, STORAGE_Prog_SETTINGS);
    }

    async onLayoutReady() {
        await this.taskCfg;

        setInterval(() => {
            const id = Siyuan?.user?.userId;
            if (id && userID.get() !== id) {
                userID.write(id);
            }
        }, 2000);

        if (userID.get()) {
            resetKey();
            await verifyKeyProgressive();
        }

        await flashBox.onload(this, this.settingCfg);
        await pieceMovingBox.onload(this, this.settingCfg);
        await pieceSummaryBox.onload(this, this.settingCfg);
        await writingCompareBox.onload(this, this.settingCfg);
        await digestProgressiveBox.onload(this, this.settingCfg);
        await prog.onload(this, this.settingCfg);
    }

    onunload(): void {
        prog.onunload();
    }

    private openSettings() {
        const getTitle = (version: string) => {
            const help = document.createElement("button") as HTMLButtonElement;
            help.setAttribute('onclick', 'window.location.href = "https://awx9773btw.feishu.cn/docx/ZZr9dGoIno5pnVxn2vpch6BCn3f?from=from_copylink"')
            help.classList.add("b3-button")
            help.classList.add("b3-button--text")
            help.textContent = 'Help帮助'

            const log = document.createElement("button") as HTMLButtonElement;
            log.setAttribute('onclick', 'window.location.href = "https://awx9773btw.feishu.cn/docx/Cm7nd2G9KoJhOjxGACycvJU6nRg?from=from_copylink"')
            log.classList.add("b3-button")
            log.classList.add("b3-button--text")
            log.textContent = 'LOG日志'

            const save = document.createElement("button") as HTMLButtonElement;
            save.setAttribute('onclick', 'globalThis.tomato_zZmqus5PtYRi.save()')
            save.classList.add("b3-button")
            save.textContent = tomatoI18n.保存并退出;

            const div = document.createElement("div") as HTMLDivElement;
            div.appendChild(document.createTextNode("v" + version + "p"));
            div.appendChild(help);
            div.appendChild(log);
            div.appendChild(save);
            div.style.display = "flex"
            div.style.flexDirection = "row"
            div.style.justifyContent = "space-between"
            div.style.flexWrap = "nowrap"
            div.style.width = "100%"
            return div;
        }

        const dm = new DestroyManager();
        const id = newID();
        const dialog = new Dialog({
            title: getTitle(this.pluginSpec?.version).outerHTML,
            content: `<div id="${id}"></div>`,
            width: events.isMobile ? "90vw" : "700px",
            height: events.isMobile ? "180svw" : "700px",
            destroyCallback: () => {
                dm.destroyBy("1")
            },
            hideCloseIcon: true,
        });
        const d = new Settings({
            target: dialog.element.querySelector("#" + id),
            props: {
                plugin: this,
                dm,
            }
        });
        dm.add("1", () => { dialog.destroy() })
        dm.add("2", () => { d.$destroy() })
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
            title: tomatoI18n.渐进学习的设置,
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

        this.eventBus.on(EventType.click_blockicon, this.blockIconEventBindThis);
        getPluginSpec(this.name).then(sp => {
            this.pluginSpec = sp
        });

        this.addTopBar({
            icon: "iconSettingsProg",
            title: tomatoI18n.渐进学习的设置,
            position: "left",
            callback: () => {
                this.openSettings();
            },
        })
        prog.addTopbar(this, "left");
    }
}