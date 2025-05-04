import { Dialog, Menu, Plugin, openTab, confirm, Lute, IProtyle, Protyle } from "siyuan";
import "./index.scss";
import { EventType, events } from "../../sy-tomato-plugin/src/libs/Events";
import { addCardSetDueTime, closeTabByTitle, siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import * as utils from "../../sy-tomato-plugin/src/libs/utils";
import * as help from "./helper";
import * as constants from "./constants";
import {
    BlockNodeEnum, CONTENT_EDITABLE, DATA_NODE_ID, DATA_TYPE, IN_BOOK_INDEX, MarkKey,
    PARAGRAPH_INDEX, PROG_ORIGIN_TEXT, PROG_PIECE_PREVIOUS, RefIDKey
} from "../../sy-tomato-plugin/src/libs/gconst";
import { SplitSentence } from "./SplitSentence";
import AddBook from "./AddBook.svelte";
import ShowAllBooks from "./ShowAllBooks.svelte";
import { Storage } from "./Storage";
import { HtmlCBType } from "./constants";
import { getDocBlocks, isMultiLineElement, OpenSyFile2 } from "../../sy-tomato-plugin/src/libs/docUtils";
import { addClickEvent, btn, getContentPrefix, getReadingBtns1, getReadingBtns2, getReadingBtns3 } from "./ProgressiveBtn";
import { windowOpenStyle } from "../../sy-tomato-plugin/src/libs/stores";
import { getBookID } from "../../sy-tomato-plugin/src/libs/progressive";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";

class Progressive {
    plugin: Plugin;
    storage: Storage;
    settings: TomatoSettings;
    private lute: Lute;
    private docID: string;
    private observer: MutationObserver;
    private welement: any;

    addTopbar(plugin: Plugin, position: "left" | "right") {
        const tb = plugin.addTopBar({
            icon: "iconFilesRoot",
            title: plugin.i18n.progressiveReadingMenu,
            position,
            callback: () => {
                if (events.isMobile) {
                    this.addMenu();
                } else {
                    let rect = tb.getBoundingClientRect();
                    if (rect.width === 0) {
                        rect = document.querySelector("#barMore").getBoundingClientRect();
                    }
                    if (rect.width === 0) {
                        rect = document.querySelector("#barPlugins").getBoundingClientRect();
                    }
                    this.addMenu(rect);
                }
            }
        });
        return tb;
    }

    onunload() {
        this.observer?.disconnect();
        this.observer = null;
    }

    async onload(plugin: Plugin, settings: TomatoSettings) {
        this.plugin = plugin;
        this.lute = utils.NewLute();
        this.settings = settings;
        this.storage = new Storage(plugin);

        await this.storage.onLayoutReady();
        this.plugin.addCommand({
            langKey: "startToLearn",
            hotkey: "⌥-",
            callback: async () => {
                await this.startToLearnWithLock();
            },
        });
        this.plugin.addCommand({
            langKey: "startToLearnRand",
            hotkey: "⌥⇧-",
            callback: async () => {
                await this.startToLearnWithLock("", true);
            },
        });
        this.plugin.addCommand({
            langKey: "viewAllProgressiveBooks",
            hotkey: "⌥=",
            callback: async () => {
                await this.viewAllProgressiveBooks();
            },
        });
        this.plugin.addCommand({
            langKey: "上一页2024-11-19 10:53:57",
            langText: tomatoI18n.上一页,
            hotkey: "⌘←", // "⇧↑", "⇧↓", "⇧→", "⇧←",
            callback: () => this.movePage(-1),
        });
        this.plugin.addCommand({
            langKey: "下一页2024-11-19 10:53:57",
            langText: tomatoI18n.下一页,
            hotkey: "⌘→",
            callback: () => this.movePage(1),
        });
        this.plugin.addCommand({
            langKey: "goto2024-12-31 11:09:00",
            langText: tomatoI18n.跳到分片或回到原文,
            hotkey: "⇧⌥O",
            callback: () => {
                this.readThisPiece();
            }
        });
        this.plugin.eventBus.on("open-menu-content", ({ detail }) => {
            const menu = detail.menu;
            menu.addItem({
                iconHTML: "＋📗",
                label: this.plugin.i18n.addProgressiveReading,
                accelerator: "",
                click: async () => {
                    await this.addProgressiveReadingWithLock();
                }
            });
            menu.addItem({
                iconHTML: "👁️📚",
                label: this.plugin.i18n.viewAllProgressiveBooks,
                accelerator: "⌥=",
                click: async () => {
                    await this.viewAllProgressiveBooks();
                }
            });
            menu.addItem({
                label: tomatoI18n.跳到分片或回到原文,
                iconHTML: "🎯📖",
                accelerator: "⇧⌥O",
                click: () => {
                    const blockID = detail?.element?.getAttribute("data-node-id") ?? "";
                    if (blockID) {
                        this.readThisPiece(blockID);
                    }
                },
            });
            menu.addItem({
                iconHTML: "🔀📖",
                label: this.plugin.i18n.startToLearn,
                accelerator: "⌥-",
                click: () => {
                    this.startToLearnWithLock();
                }
            });
        });
        events.addListener("ProgressiveBox", (eventType, detail: Protyle) => {
            if (eventType == EventType.loaded_protyle_static || eventType == EventType.loaded_protyle_dynamic || eventType == EventType.click_editorcontent || eventType == EventType.switch_protyle) {
                navigator.locks.request(constants.TryAddStarsLock, { ifAvailable: true }, async (lock) => {
                    const protyle: IProtyle = detail.protyle;
                    const welement = protyle?.wysiwyg?.element as HTMLElement;
                    const element = protyle?.element as HTMLElement;
                    if (!protyle || !welement || !element) return;
                    if (this.settings.hideBtnsInFlashCard && element.classList.contains("card__block")) {
                        element.querySelectorAll(`[${MarkKey}][${DATA_NODE_ID}]`).forEach((e: HTMLElement) => {
                            e.style.display = "none";
                        });
                    }
                    const nextDocID = protyle?.block?.rootID;
                    const { isPiece } = help.isProtylePiece(protyle);
                    if (lock && nextDocID && isPiece) {
                        if (this.docID != nextDocID || this.welement !== welement) {
                            this.docID = nextDocID;
                            this.welement = welement;
                            this.observer?.disconnect();
                            this.observer = new MutationObserver((mutationsList) => {
                                const es = mutationsList
                                    .map(i => [...i.addedNodes.values()]).flat();
                                this.tryAddRefAttr(es as any);
                            });
                            this.observer.observe(welement, { childList: true, subtree: true });
                        }
                    }
                });
                navigator.locks.request(constants.ProgressiveAddBtnListenersLock, { ifAvailable: true }, async (lock) => {
                    const protyle: IProtyle = detail.protyle;
                    if (!protyle) return;
                    const notebookId = protyle.notebookId;
                    const nextDocID = protyle?.block?.rootID;
                    const element = protyle?.wysiwyg?.element as HTMLElement;
                    if (lock && element && nextDocID && notebookId) {
                        addClickEvent(element);
                    }
                });
            }
        });
    }

    private async movePage(step: number) {
        const docID = events.docID
        const { bookID, pieceNum } = await getBookID(docID)
        await this.storage.gotoBlock(bookID, pieceNum + step);
        await this.startToLearnWithLock(bookID);
        this.closePeices(bookID);
    }

    private async tryAddRefAttr(elements: HTMLElement[]) {
        return navigator.locks.request(constants.TryAddStarsLock + "tryAddRefAttr", { mode: "exclusive" }, async (lock) => {
            if (lock) {
                elements
                    .filter(e => e.getAttribute && e.querySelectorAll)
                    .filter((e: HTMLElement) => !e.getAttribute(RefIDKey))
                    .filter((e: HTMLElement) => {
                        const a = e.getAttribute(DATA_TYPE);
                        return a == BlockNodeEnum.NODE_PARAGRAPH
                            || a == BlockNodeEnum.NODE_LIST
                            || a == BlockNodeEnum.NODE_LIST_ITEM
                            || a == BlockNodeEnum.NODE_HEADING
                            || a == BlockNodeEnum.NODE_BLOCKQUOTE
                            || a == BlockNodeEnum.NODE_CODE_BLOCK;
                    }).forEach(e => {
                        const { ref, idx, bIdx } = findBack(e) || findForward(e);
                        if (ref) {
                            const attr = {} as AttrType;
                            attr["custom-progref"] = ref;
                            if (idx) attr["custom-paragraph-index"] = idx;
                            if (bIdx) attr["custom-in-book-index"] = bIdx;
                            setTimeout(() => {
                                siyuan.setBlockAttrs(e.getAttribute(DATA_NODE_ID), attr);
                            }, 4000);
                            e.setAttribute(RefIDKey, ref);
                            if (bIdx) e.setAttribute(IN_BOOK_INDEX, bIdx);
                            if (idx) e.setAttribute(PARAGRAPH_INDEX, idx);
                            e.querySelectorAll(`div[${DATA_NODE_ID}]`).forEach(e => {
                                e.setAttribute(RefIDKey, ref);
                                if (bIdx) e.setAttribute(IN_BOOK_INDEX, bIdx);
                                if (idx) e.setAttribute(PARAGRAPH_INDEX, idx);
                            });
                        }
                    });
            }
        });
    }

    blockIconEvent(detail: any) {
        if (!this.plugin) return;
        const menu = detail.menu;
        menu.addItem({
            iconHTML: "＋📗",
            label: this.plugin.i18n.addProgressiveReading,
            accelerator: "",
            click: async () => {
                await this.addProgressiveReadingWithLock();
            }
        });
        menu.addItem({
            iconHTML: "🎯📖",
            label: tomatoI18n.跳到分片或回到原文,
            accelerator: "⇧⌥O",
            click: async () => {
                await this.readThisPiece();
            }
        });
    }

    private addMenu(rect?: DOMRect) {
        const menu = new Menu("progressiveMenu");
        menu.addItem({
            iconHTML: "＋📗",
            label: this.plugin.i18n.addProgressiveReading,
            accelerator: "",
            click: async () => {
                await this.addProgressiveReadingWithLock();
            }
        });
        menu.addItem({
            iconHTML: "👁️📚",
            label: this.plugin.i18n.viewAllProgressiveBooks,
            accelerator: "⌥=",
            click: async () => {
                await this.viewAllProgressiveBooks();
            }
        });
        menu.addItem({
            iconHTML: "🎯📖",
            label: tomatoI18n.跳到分片或回到原文,
            accelerator: "⇧⌥O",
            click: async () => {
                await this.readThisPiece();
            }
        });
        menu.addItem({
            iconHTML: "🔀📖",
            label: this.plugin.i18n.startToLearn,
            accelerator: "⌥-",
            click: () => {
                this.startToLearnWithLock();
            }
        });
        menu.addItem({
            iconHTML: "⚙️",
            label: tomatoI18n.渐进学习的设置,
            click: () => {
                this.plugin.setting.open(tomatoI18n.渐进学习)
            }
        });
        if (events.isMobile) {
            menu.fullscreen();
        } else {
            menu.open({
                x: rect.right,
                y: rect.bottom,
                isLeft: true,
            });
        }
    }

    async addProgressiveReadingWithLock(bookID?: string) {
        return navigator.locks.request(constants.AddProgressiveReadingLock, { ifAvailable: true }, async (lock) => {
            if (lock) {
                await this.addProgressiveReading(bookID, events.boxID);
                await utils.sleep(constants.IndexTime2Wait);
            } else {
                await siyuan.pushMsg(this.plugin.i18n.slowDownALittleBit + " [1]");
            }
        });
    }

    private async addProgressiveReading(bookID: string = "", boxID: string = "") {
        if (!bookID) {
            bookID = events.docID;
        }
        if (!bookID) {
            await siyuan.pushMsg(this.plugin.i18n.openAdocFirst);
            return;
        }
        const row = await siyuan.sqlOne(`select content from blocks where type='d' and id='${bookID}'`);
        if (!row) {
            siyuan.pushMsg(this.plugin.i18n.maybeBookRemoved.replace("{bookID}", bookID));
            return;
        }
        await this.addProgressiveReadingDialog(bookID, row["content"], boxID);
    }

    private async addProgressiveReadingDialog(bookID: string, bookName: string, boxID: string) {
        const id = utils.newID();
        let addBook: AddBook;
        const dialog = new Dialog({
            title: this.plugin.i18n.addProgressiveReading,
            content: `<div class="b3-dialog__content" id="${id}"></div>`,
            width: events.isMobile ? "90vw" : "700px",
            height: events.isMobile ? "180vw" : null,
            destroyCallback() {
                addBook?.$destroy();
                addBook = undefined;
            },
        });
        addBook = new AddBook({
            target: dialog.element.querySelector("#" + id),
            props: {
                bookID, bookName, boxID, dialog, plugin: this.plugin,
            }
        });
    }

    async readThisPiece(blockID?: string) {
        if (!blockID) {
            blockID = events.lastBlockID;
        }
        const row = await siyuan.sqlOne(`select root_id from blocks where id="${blockID}"`);
        if (row) {
            const bookID = row["root_id"];
            const idx = await this.storage.loadBookIndexIfNeeded(bookID);
            if (idx?.length <= 0) {
                for (const div of document.querySelectorAll(`div[${DATA_NODE_ID}="${blockID}"]`)) {
                    const refID = utils.getAttribute(div as any, RefIDKey)
                    if (refID) {
                        OpenSyFile2(this.plugin, refID, "front", ["cb-get-context", "cb-get-focus", "cb-get-hl"]);
                        return;
                    }
                }
                await siyuan.pushMsg(this.plugin.i18n.addThisDocFirst);
            } else {
                for (let i = 0; i < idx.length; i++) {
                    for (let j = 0; j < idx[i].length; j++) {
                        if (blockID === idx[i][j]) {
                            await this.storage.gotoBlock(bookID, i);
                            await this.startToLearnWithLock(bookID);
                            return;
                        }
                    }
                }
                await siyuan.pushMsg(this.plugin.i18n.opsInOriDocOrAddIt);
            }
        } else {
            await siyuan.pushMsg(this.plugin.i18n.cannotFindDocWaitForIndex);
        }
    }

    async startToLearnWithLock(bookID = "", isRand = false) {
        return navigator.locks.request(constants.StartToLearnLock, { ifAvailable: true }, async (lock) => {
            if (lock) {
                await siyuan.pushMsg(this.plugin.i18n.openingDocPieceForYou);
                let i = 0;
                while (await this.startToLearn(bookID, isRand) === false) {
                    if (i++ > 30) break;
                }
                await utils.sleep(constants.IndexTime2Wait);
            } else {
                await siyuan.pushMsg(this.plugin.i18n.slowDownALittleBit + " [2]");
            }
        });
    }

    private async openContentsLock(bookID: string) {
        return navigator.locks.request(constants.BuildContentsLock, { ifAvailable: true }, async (lock) => {
            if (lock) {
                await this.openContents(bookID);
            } else {
                await siyuan.pushMsg(tomatoI18n.构建打开目录中请稍后片刻);
            }
        });
    }

    private async openContents(bookID: string) {
        let contentID = await help.findContents(bookID);
        if (!contentID) {
            siyuan.pushMsg(tomatoI18n.首次构建目录请稍后片刻);
            const row = await siyuan.sqlOne(`select box,hpath,content from blocks where id='${bookID}' and type='d'`);
            const hpath = row.hpath;
            const boxID = row.box;
            const bookName = row.content;
            if (!boxID || !hpath) return;

            const { root } = await getDocBlocks(bookID, "", false, false, 1);
            const rows = root.children.filter(b => b.type === 'h').map(b => {
                b.content = b.div.textContent;
                return b;
            });

            if (rows.length == 0) return;
            const c = rows.reduce<string[]>((list, block) => {
                block.content = block.content.trim();
                let level = Number(block.subtype[1]);
                if (!utils.isValidNumber(level) || level < 1) level = 1;
                list.push(getContentPrefix(level) + btn(HtmlCBType.readThisBlock, block.content, "", block.id, block.id, 0, true));
                return list;
            }, []);
            const attr = {};
            attr[MarkKey] = help.getDocIalContents(bookID);
            attr["custom-sy-readonly"] = "true";
            contentID = await siyuan.createDocWithMdIfNotExists(boxID, `${hpath}/contents-${bookName}`, c.join("\n"), attr);
        }
        if (contentID) await OpenSyFile2(this.plugin, contentID);
    }

    private async startToLearn(bookID = "", isRand = false) {
        let noteID = "";
        const bookInfo = await this.getBook2Learn(bookID);
        if (!bookInfo.bookID) {
            siyuan.pushMsg(this.plugin.i18n.AddADocFirst);
            return;
        }
        bookID = bookInfo.bookID;
        const bookIndex = await this.storage.loadBookIndexIfNeeded(bookInfo.bookID);
        let point = (await this.storage.booksInfo(bookInfo.bookID)).point;
        if (isRand) point = utils.getRandInt0tox(bookIndex.length);
        await this.storage.updateBookInfoTime(bookID);
        if (point >= bookIndex.length) {
            await siyuan.pushMsg(this.plugin.i18n.thisIsLastPage);
            return;
        } else if (point < 0) {
            await siyuan.pushMsg(this.plugin.i18n.thisIsFirstPage);
            return;
        }
        const piecePre = bookIndex[point - 1] ?? [];
        const piece = bookIndex[point];
        noteID = await help.findPieceDoc(bookInfo.bookID, point);
        let openPiece = false;
        if (noteID) {
            await OpenSyFile2(this.plugin, noteID)
            events.setDocID(noteID);
            openPiece = true;
        } else {
            noteID = await help.createNote(bookInfo.boxID, bookInfo.bookID, piece, point);
            if (noteID) {
                await this.addReadingBtns(bookID, noteID, point);
                await this.fullfilContent(point, bookInfo.bookID, piecePre, piece, noteID, null);
                await OpenSyFile2(this.plugin, noteID, null, null, () => {
                    if (bookInfo.autoCard) {
                        addCardSetDueTime(noteID, 1000, 60 * 60 * 24)
                    }
                })
                events.setDocID(noteID);
                openPiece = true;
            } else {
                return false;
            }
        }
        if (openPiece && this.settings.openCardsOnOpenPiece) {
            let hpath = "";
            let docID: string;
            if (this.settings.cardUnderPiece) {
                hpath = await help.getHPathByDocID(noteID, "cards");
                docID = noteID;
            } else {
                hpath = await help.getHPathByDocID(bookID, "cards");
                docID = bookID;
            }
            if (hpath && docID) {
                const targetDocID = await help.getCardsDoc(docID, bookInfo.boxID, hpath);
                OpenSyFile2(this.plugin, targetDocID, windowOpenStyle.get() as any);
            }
        }
        return true;
    }

    async htmlBlockReadNextPeice(bookID: string, noteID: string, cbType: HtmlCBType, point: number) {
        return navigator.locks.request("htmlBlockReadNextPeiceLock", { ifAvailable: true }, async (lock) => {
            if (lock) {
                await this.htmlBlockReadNextPeiceInLock(bookID, noteID, cbType, point);
                await utils.sleep(constants.IndexTime2Wait);
            } else {
                await siyuan.pushMsg(this.plugin.i18n.slowDownALittleBit + " [3]");
            }
        });
    }

    private closePeices(bookID: string) {
        const tabs = utils.getOpenedEditors()
        for (const tab of tabs.map(t => t.ial)) {
            if (tab["custom-progmark"]?.includes(bookID)) {
                closeTabByTitle([tab], events.docID)
            }
        }
    }

    private async htmlBlockReadNextPeiceInLock(bookID: string, noteID: string, cbType: HtmlCBType, point: number) {
        switch (cbType) {
            case HtmlCBType.previous:
                await this.storage.gotoBlock(bookID, point - 1);
                await this.startToLearnWithLock(bookID);
                this.closePeices(bookID);
                break;
            case HtmlCBType.next:
                await this.storage.gotoBlock(bookID, point + 1);
                await this.startToLearnWithLock(bookID);
                this.closePeices(bookID);
                break;
            case HtmlCBType.deleteAndExit:
                confirm("⚠️", "🏃 🗑", async () => {
                    await siyuan.removeRiffCards([noteID]);
                    siyuan.removeDocByID(noteID);
                });
                break;
            case HtmlCBType.deleteAndBack:
                confirm("⚠️", this.plugin.i18n.DeleteAndBack, async () => {
                    await siyuan.removeRiffCards([noteID]);
                    await this.storage.gotoBlock(bookID, point - 1);
                    await this.startToLearnWithLock(bookID);
                    siyuan.removeDocByID(noteID);
                    this.closePeices(bookID);
                });
                break;
            case HtmlCBType.deleteAndNext:
                confirm("⚠️", this.plugin.i18n.DeleteAndNext, async () => {
                    await siyuan.removeRiffCards([noteID]);
                    await this.storage.gotoBlock(bookID, point + 1);
                    await this.startToLearnWithLock(bookID);
                    siyuan.removeDocByID(noteID);
                    this.closePeices(bookID);
                });
                break;
            case HtmlCBType.nextBook:
                await this.startToLearnWithLock();
                break;
            case HtmlCBType.quit: {
                const t = await OpenSyFile2(this.plugin, noteID);
                await utils.sleep(200);
                t?.close();
                break;
            }
            case HtmlCBType.AddDocCard:
                await siyuan.addRiffCards([noteID]);
                break;
            case HtmlCBType.DelDocCard:
                await siyuan.removeRiffCards([noteID]);
                break;
            case HtmlCBType.ignoreBook:
                await this.storage.setIgnoreBook(bookID);
                break;
            case HtmlCBType.fullfilContent: {
                const index = await this.storage.loadBookIndexIfNeeded(bookID);
                const piecePre = index[point - 1] ?? [];
                const piece = index[point] ?? [];
                await this.fullfilContent(point, bookID, piecePre, piece, noteID, null);
                break;
            }
            case HtmlCBType.cleanOriginText:
                await help.cleanNote(noteID);
                break;
            case HtmlCBType.openFlashcardTab:
                if (bookID) openTab({ app: this.plugin.app, card: { type: "doc", id: bookID } });
                else openTab({ app: this.plugin.app, card: { type: "all" } });
                break;
            case HtmlCBType.viewContents:
                await this.openContentsLock(bookID);
                break;
            case HtmlCBType.splitByPunctuations: {
                await help.cleanNote(noteID);
                const index = await this.storage.loadBookIndexIfNeeded(bookID);
                const piece = index[point] ?? [];
                const piecePre = index[point - 1] ?? [];
                await this.fullfilContent(point, bookID, piecePre, piece, noteID, "p");
                break;
            }
            case HtmlCBType.splitByPunctuationsList: {
                await help.cleanNote(noteID);
                const index = await this.storage.loadBookIndexIfNeeded(bookID);
                const piece = index[point] ?? [];
                const piecePre = index[point - 1] ?? [];
                await this.fullfilContent(point, bookID, piecePre, piece, noteID, "i");
                break;
            }
            case HtmlCBType.splitByPunctuationsListCheck: {
                await help.cleanNote(noteID);
                const index = await this.storage.loadBookIndexIfNeeded(bookID);
                const piece = index[point] ?? [];
                const piecePre = index[point - 1] ?? [];
                await this.fullfilContent(point, bookID, piecePre, piece, noteID, "t");
                break;
            }
            default:
                throw "Invalid HtmlCBType " + cbType;
        }
    }

    private async splitAndInsert(bookID: string, noteID: string, t: AsList, ids: string[]) {
        const s = new SplitSentence(bookID, this.plugin, noteID, t);
        if (ids?.length > 0) {
            await s.splitByIDs(ids);
            await s.insert(false);
        }
    }

    private async addReadingBtns(bookID: string, noteID: string, point: number) {
        const btns = [];
        btns.push(help.tempContent("---"));
        btns.push(help.tempContent(getReadingBtns1(bookID, noteID, point)));
        btns.push(help.tempContent(getReadingBtns2(bookID, noteID, point)));
        btns.push(help.tempContent(getReadingBtns3(bookID, noteID, point)));
        await siyuan.appendBlock(btns.join("\n"), noteID);
    }

    private async fullfilContent(point: number, bookID: string, piecePre: string[], piece: string[], noteID: string, stype: AsList) {
        this.storage.updateBookInfoTime(bookID);
        const info = await this.storage.booksInfo(bookID);

        const allContent = [];
        if (info.showLastBlock && piecePre.length > 0) {
            const lastID = piecePre[piecePre.length - 1];
            const { div } = await utils.getBlockDiv(lastID);
            allContent.push(await this.copyBlock(point - 1, info, lastID, div, [PROG_PIECE_PREVIOUS]));
        }

        if (stype) {
            await this.splitAndInsert(bookID, noteID, stype, piece);
        } else if (info.autoSplitSentenceP) {
            await this.splitAndInsert(bookID, noteID, "p", piece);
        } else if (info.autoSplitSentenceI) {
            await this.splitAndInsert(bookID, noteID, "i", piece);
        } else if (info.autoSplitSentenceT) {
            await this.splitAndInsert(bookID, noteID, "t", piece);
        } else {
            const idx: { i: number } = { i: 1 };
            const rows = (await siyuan.getRows(piece, "markdown,ial,type")).filter(row => !!row.markdown);
            for (const { id, markdown, ial, type } of rows) {
                const attrs = utils.parseIAL(ial);
                delete attrs.id;
                delete attrs.updated;
                attrs["custom-prog-origin-text"] = "1";
                allContent.push(await this.fastCopyBlock(point, info, id, markdown, type, attrs, idx));
            }
        }

        if (allContent.length > 0) {
            await siyuan.insertBlockAsChildOf(allContent.filter(i => !!i).join("\n\n"), noteID);
        }
    }

    private async fastCopyBlock(point: number, info: BookInfo, id: string, markdown: string, type: string, attrs: AttrType, idx?: { i: number }) {
        if (idx) {
            attrs["custom-in-book-index"] = `${point}#${idx.i}`;
            attrs["custom-paragraph-index"] = String(idx.i);
            if (info.addIndex2paragraph) {
                if (markdown.startsWith("#")
                    || markdown.startsWith("!")
                    || markdown.startsWith("[")
                    || markdown.startsWith("*")
                    || isMultiLineElement(markdown)
                ) {
                    //
                } else {
                    markdown = `[${idx.i}]` + markdown;
                }
            }
            idx.i++;
        }
        attrs["custom-progref"] = id;
        if (markdown.startsWith("<div>")) {
            return markdown;
        } else if (isMultiLineElement(markdown)) {
            markdown = utils.replaceRef2Lnk(markdown)
            return `${markdown}\n${utils.ial2str(attrs)}`;
        } else if (type === "l") {
            const { div } = await utils.getBlockDiv(id);
            allListItemlnk2self(div, attrs);
            utils.cleanDivOnly(div);
            markdown = this.lute.BlockDOM2Md(div.outerHTML);
            markdown = utils.replaceRef2Lnk(markdown)
            const parts = markdown.trim().split("\n")
            parts.pop();
            markdown = parts.join("\n")
            markdown = `${markdown}\n${utils.ial2str(attrs)}`;
            return markdown;
        } else {
            markdown = utils.replaceRef2Lnk(markdown)
            return `${markdown}${utils.get_siyuan_lnk_md(id, "  *  ", this.settings.pieceNoBacktraceLink)} \n${utils.ial2str(attrs)}`;
        }
    }

    private async copyBlock(point: number, info: BookInfo, id: string, tempDiv: HTMLDivElement, mark: string[] = [], idx?: { i: number }) {
        if (!tempDiv) return "";
        if (tempDiv.getAttribute(MarkKey)) return "";
        const editableDiv = utils.getContenteditableElement(tempDiv);
        if (editableDiv) {
            if (!this.settings.pieceNoBacktraceLink) {
                const spanStar = editableDiv.appendChild(document.createElement("span")) as HTMLSpanElement;
                utils.set_href(spanStar, id, "  *  ");
            }

            if (idx && tempDiv.getAttribute(DATA_TYPE) != BlockNodeEnum.NODE_HEADING) {
                tempDiv.setAttribute(PARAGRAPH_INDEX, String(idx.i));
                tempDiv.setAttribute(IN_BOOK_INDEX, `${point}#${idx.i}`);
                if (info.addIndex2paragraph) {
                    const idxSpan = editableDiv.insertBefore(document.createElement("span"), editableDiv.firstChild) as HTMLSpanElement;
                    if (idxSpan) {
                        idxSpan.setAttribute(DATA_TYPE, "text");
                        // idxSpan.style.backgroundColor = "var(--b3-font-background3)";
                        // idxSpan.style.color = "var(--b3-font-color7)";
                        idxSpan.textContent = `[${idx.i}]`;
                    }
                }
            }
            if (idx) idx.i++;
        }
        const txt = this.lute.BlockDOM2StdMd(tempDiv.outerHTML).replace(/\u200B/g, "").trim();
        if (!txt || txt == "*") return "";
        utils.cleanDivOnly(tempDiv);
        tempDiv.setAttribute(RefIDKey, id);
        mark.forEach(m => tempDiv.setAttribute(m, "1"));
        const md = this.lute.BlockDOM2Md(tempDiv.outerHTML);
        return md.trim();
    }

    private async getBook2Learn(bookID?: string): Promise<BookInfo> {
        if (bookID) {
            return this.storage.booksInfo(bookID);
        }
        const infos = this.storage.booksInfos();
        let miniTime = Number.MAX_SAFE_INTEGER;
        let miniID = "";
        for (const id in infos) {
            const { time, ignored } = infos[id];
            if (ignored) continue;
            if (time < miniTime) {
                miniTime = time;
                miniID = id;
            }
        }
        if (miniID) {
            return this.storage.booksInfo(miniID);
        }
        return {} as any;
    }

    async viewAllProgressiveBooks() {
        const id = utils.newID();
        let s: ShowAllBooks;
        const dialog = new Dialog({
            title: this.plugin.i18n.viewAllProgressiveBooks,
            content: `<div class="b3-dialog__content" id='${id}'></div>`,
            width: events.isMobile ? "90vw" : "700px",
            height: events.isMobile ? "180vw" : "800px",
            destroyCallback: () => {
                s?.$destroy();
                s = undefined;
            }
        });
        s = new ShowAllBooks({
            target: dialog.element.querySelector("#" + id),
            props: {
                dialog,
            }
        });
    }
}

export const prog = new Progressive();

function allListItemlnk2self(div: HTMLDivElement, attrs?: AttrType) {
    div.querySelectorAll(`div[${CONTENT_EDITABLE}]`).forEach((e: HTMLElement) => {
        const n = e.parentElement;
        if (n) {
            const id = n.getAttribute(DATA_NODE_ID);
            if (attrs) {
                for (const k in attrs) {
                    n.setAttribute(k, attrs[k]);
                }
            }
            if (id) {
                if (!prog.settings.pieceNoBacktraceLink) {
                    utils.add_href(e, id, "*");
                }
                n.setAttribute(PROG_ORIGIN_TEXT, "1");
                n.setAttribute(RefIDKey, id);
            }
        }
    });
}

function findBack(e: Element) {
    for (let i = 0; i < 1000 && e; i++, e = e.previousElementSibling) {
        const ref = e.getAttribute(RefIDKey);
        const idx = e.getAttribute(PARAGRAPH_INDEX) ?? "";
        const bIdx = e.getAttribute(IN_BOOK_INDEX) ?? "";
        if (ref) return { ref, idx, bIdx };
    }
    return {};
}

function findForward(e: Element) {
    for (let i = 0; i < 1000 && e; i++, e = e.nextElementSibling) {
        const ref = e.getAttribute(RefIDKey);
        const idx = e.getAttribute(PARAGRAPH_INDEX) ?? "";
        const bIdx = e.getAttribute(IN_BOOK_INDEX) ?? "";
        if (ref) return { ref, idx, bIdx };
    }
    return {};
}
