import { Menu, Plugin, openTab, confirm, IProtyle, Protyle } from "siyuan";
import "./index.scss";
import { EventType, events } from "../../sy-tomato-plugin/src/libs/Events";
import { closeTabByTitle, siyuan, } from "../../sy-tomato-plugin/src/libs/utils";
import * as utils from "../../sy-tomato-plugin/src/libs/utils";
import * as help from "./helper";
import { winHotkey } from "../../sy-tomato-plugin/src/libs/winHotkey";
import * as constants from "./constants";
import {
    BlockNodeEnum, DATA_NODE_ID, DATA_TYPE, IN_BOOK_INDEX, MarkKey,
    PARAGRAPH_INDEX, RefIDKey
} from "../../sy-tomato-plugin/src/libs/gconst";
import AddBookSvelte from "./AddBook.svelte";
import ShowAllBooksSvelte from "./ShowAllBooks.svelte";
import { progStorage } from "./ProgressiveStorage";
import { HtmlCBType } from "./constants";
import { getDocBlocks, OpenSyFile2 } from "../../sy-tomato-plugin/src/libs/docUtils";
import { addClickEvent, btn, getContentPrefix, progressiveBtnFloating } from "./ProgressiveBtn";
import { piecesmenu, ProgressiveJumpMenu, ProgressiveStart2learn, ProgressiveViewAllMenu, windowOpenStyle } from "../../sy-tomato-plugin/src/libs/stores";
import { getBookID } from "../../sy-tomato-plugin/src/libs/progressive";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import { mount, } from "svelte";
import { fullfilContent } from "./helper";
import { showDialog } from "../../sy-tomato-plugin/src/libs/DialogText";
import { pressSkip, showCardAnswer } from "../../sy-tomato-plugin/src/libs/cardUtils";

export const progSettingsOpenHK = winHotkey("alt+shift+,", "progSettingsOpenHK 2025-5-12 21:37:37", "⚙️", () => tomatoI18n.渐进学习的设置)
export const Progressive开始学习 = winHotkey("⌥-", "Progressive startToLearn 2025-5-13 13:32:20", "📖", () => tomatoI18n.开始学习)
export const Progressive开始随机学习 = winHotkey("⌥⇧-", "Progressive startToLearnRand 2025-5-13 13:32:21", "🔀📖", () => tomatoI18n.开始随机学习)
export const Progressive查看所有渐进学习文档 = winHotkey("⌥=", "查看所有渐进学习文档 2025-5-13 13:32:21", "👁️📚", () => tomatoI18n.查看所有渐进学习文档)
export const Progressive上一页 = winHotkey("ctrl+left", "上一页 2025-5-13 13:32:21", "⏫", () => tomatoI18n.上一页)
export const Progressive下一页 = winHotkey("ctrl+right", "下一页 2025-5-13 13:32:21", "⏬", () => tomatoI18n.下一页)
export const Progressive跳到分片或回到原文 = winHotkey("⇧⌥w", "跳到分片或回到原文 2025-5-13 13:32:21", "🎯📖", () => tomatoI18n.跳到分片或回到原文)
export const Progressive添加当前文档到渐进阅读分片模式 = winHotkey("⇧⌥m", "添加当前文档到渐进阅读(分片模式) 2025-5-13 13:32:21", "＋📗", () => tomatoI18n.添加当前文档到渐进阅读分片模式)

class Progressive {
    plugin: Plugin;
    settings: TomatoSettings;
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
        this.settings = settings;

        this.plugin.addCommand({
            langKey: Progressive开始学习.langKey,
            langText: Progressive开始学习.langText(),
            hotkey: Progressive开始学习.m,
            callback: async () => {
                await this.startToLearnWithLock();
            },
        });
        this.plugin.addCommand({
            langKey: Progressive开始随机学习.langKey,
            langText: Progressive开始随机学习.langText(),
            hotkey: Progressive开始随机学习.m,
            callback: async () => {
                await this.startToLearnWithLock("", true);
            },
        });
        this.plugin.addCommand({
            langKey: Progressive查看所有渐进学习文档.langKey,
            langText: Progressive查看所有渐进学习文档.langText(),
            hotkey: Progressive查看所有渐进学习文档.m,
            callback: async () => {
                await this.viewAllProgressiveBooks();
            },
        });
        this.plugin.addCommand({
            langKey: Progressive上一页.langKey,
            langText: Progressive上一页.langText(),
            hotkey: Progressive上一页.m,
            callback: () => this.gotoPage(-1),
        });
        this.plugin.addCommand({
            langKey: Progressive下一页.langKey,
            langText: Progressive下一页.langText(),
            hotkey: Progressive下一页.m,
            callback: () => this.gotoPage(1),
        });
        this.plugin.addCommand({
            langKey: Progressive跳到分片或回到原文.langKey,
            langText: Progressive跳到分片或回到原文.langText(),
            hotkey: Progressive跳到分片或回到原文.m,
            callback: () => {
                this.readThisPiece();
            }
        });
        this.plugin.addCommand({
            langKey: Progressive添加当前文档到渐进阅读分片模式.langKey,
            langText: Progressive添加当前文档到渐进阅读分片模式.langText(),
            hotkey: Progressive添加当前文档到渐进阅读分片模式.m,
            callback: () => {
                this.addProgressiveReadingWithLock();
            }
        });
        this.plugin.eventBus.on("open-menu-content", ({ detail }) => {
            const menu = detail.menu;
            if (piecesmenu.get()) {
                menu.addItem({
                    iconHTML: Progressive添加当前文档到渐进阅读分片模式.icon,
                    label: Progressive添加当前文档到渐进阅读分片模式.langText(),
                    accelerator: Progressive添加当前文档到渐进阅读分片模式.m,
                    click: async () => {
                        await this.addProgressiveReadingWithLock();
                    }
                });
            }
            if (ProgressiveViewAllMenu.get()) {
                menu.addItem({
                    iconHTML: Progressive查看所有渐进学习文档.icon,
                    label: Progressive查看所有渐进学习文档.langText(),
                    accelerator: Progressive查看所有渐进学习文档.m,
                    click: async () => {
                        await this.viewAllProgressiveBooks();
                    }
                });
            }
            if (ProgressiveJumpMenu.get()) {
                menu.addItem({
                    iconHTML: Progressive跳到分片或回到原文.icon,
                    label: Progressive跳到分片或回到原文.langText(),
                    accelerator: Progressive跳到分片或回到原文.m,
                    click: () => {
                        this.readThisPiece();
                    },
                });
            }
            if (ProgressiveStart2learn.get()) {
                menu.addItem({
                    iconHTML: Progressive开始学习.icon,
                    label: Progressive开始学习.langText(),
                    accelerator: Progressive开始学习.m,
                    click: () => {
                        this.startToLearnWithLock();
                    }
                });
            }
        });
        events.addListener("ProgressiveBox", (eventType, detail: Protyle) => {
            if (eventType == EventType.loaded_protyle_static || eventType == EventType.loaded_protyle_dynamic || eventType == EventType.click_editorcontent || eventType == EventType.switch_protyle) {
                navigator.locks.request(constants.TryAddStarsLock, { ifAvailable: true }, async (lock) => {
                    const protyle: IProtyle = detail.protyle;
                    const welement = protyle?.wysiwyg?.element as HTMLElement;
                    const element = protyle?.element as HTMLElement;
                    if (!protyle || !welement || !element) return;
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

        events.addListener("ProgressiveBox 2025-07-16 10:33:25", (eventType, detail: Protyle) => {
            if (eventType == EventType.loaded_protyle_static
                || eventType == EventType.loaded_protyle_dynamic
                || eventType == EventType.destroy_protyle
                || eventType == EventType.click_editorcontent || eventType == EventType.switch_protyle) {
                navigator.locks.request("ProgressiveBox 2025-07-16 10:33:20", { ifAvailable: true }, async (lock) => {
                    const protyle: IProtyle = detail.protyle;
                    if (!protyle) return;
                    const notebookId = protyle.notebookId;
                    const nextDocID = protyle?.block?.rootID;
                    const element = protyle?.wysiwyg?.element as HTMLElement;
                    if (lock && element && nextDocID && notebookId) {
                        await progressiveBtnFloating(protyle, eventType == EventType.destroy_protyle);
                    }
                });
            }
        });
    }

    private async gotoPage(step: number) {
        const docID = events.docID
        const { bookID, pieceNum } = await getBookID(docID)
        await progStorage.gotoBlock(bookID, pieceNum + step);
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
                        const { ref, idx, bIdx } = help.findBack(e) || help.findForward(e);
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
        if (ProgressiveJumpMenu.get()) {
            menu.addItem({
                iconHTML: Progressive跳到分片或回到原文.icon,
                label: Progressive跳到分片或回到原文.langText(),
                accelerator: Progressive跳到分片或回到原文.m,
                click: () => {
                    this.readThisPiece();
                }
            });
        }
    }

    private addMenu(rect?: DOMRect) {
        const menu = new Menu("progressiveMenu");
        menu.addItem({
            iconHTML: Progressive添加当前文档到渐进阅读分片模式.icon,
            label: Progressive添加当前文档到渐进阅读分片模式.langText(),
            accelerator: Progressive添加当前文档到渐进阅读分片模式.m,
            click: async () => {
                await this.addProgressiveReadingWithLock();
            }
        });
        menu.addItem({
            iconHTML: Progressive查看所有渐进学习文档.icon,
            label: Progressive查看所有渐进学习文档.langText(),
            accelerator: Progressive查看所有渐进学习文档.m,
            click: async () => {
                await this.viewAllProgressiveBooks();
            }
        });
        menu.addItem({
            iconHTML: Progressive跳到分片或回到原文.icon,
            label: Progressive跳到分片或回到原文.langText(),
            accelerator: Progressive跳到分片或回到原文.m,
            click: () => {
                this.readThisPiece();
            }
        });
        if (ProgressiveStart2learn.get()) {
            menu.addItem({
                iconHTML: Progressive开始学习.icon,
                label: Progressive开始学习.langText(),
                accelerator: Progressive开始学习.m,
                click: () => {
                    this.startToLearnWithLock();
                }
            });
        }
        menu.addItem({
            iconHTML: progSettingsOpenHK.icon,
            label: progSettingsOpenHK.langText(),
            accelerator: progSettingsOpenHK.m,
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
                await this.addProgressiveReading(bookID);
                await utils.sleep(constants.IndexTime2Wait);
            } else {
                await siyuan.pushMsg(this.plugin.i18n.slowDownALittleBit + " [1]");
            }
        });
    }

    private async addProgressiveReading(bookID: string = "") {
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
        await this.addProgressiveReadingDialog(bookID, row["content"]);
    }

    private async addProgressiveReadingDialog(bookID: string, bookName: string,) {
        showDialog((target, dm) => {
            return mount(AddBookSvelte, {
                target,
                props: {
                    bookID, bookName, dm,
                }
            });
        }, {
            title: bookName,
            width: events.isMobile ? "90vw" : undefined,
            height: events.isMobile ? "180vw" : undefined,
        });
    }

    async readThisPiece(blockID?: string) {
        if (!blockID) blockID = events.selectedDivsSync().ids.at(0);
        if (!blockID) return;
        const row = await siyuan.sqlOne(`select root_id from blocks where id="${blockID}"`);
        if (row) {
            const bookID = row["root_id"];
            const idx = await progStorage.loadBookIndexIfNeeded(bookID);
            if (idx?.length <= 0) {
                // not a book
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
                            await progStorage.gotoBlock(bookID, i);
                            await this.startToLearnWithLock(bookID);//创建分片
                            setTimeout(async () => {
                                const pieceBlockID = await this.getPiecesByRefID(blockID)
                                if (pieceBlockID) await OpenSyFile2(this.plugin, pieceBlockID);//跳到分片内的块
                            }, 1200);
                            return;
                        }
                    }
                }
                await siyuan.pushMsg(tomatoI18n.请选择段落块进行跳转);
            }
        } else {
            await siyuan.pushMsg(this.plugin.i18n.cannotFindDocWaitForIndex);
        }
    }

    private async getPiecesByRefID(oriID: string) {
        const rows = await siyuan.sqlAttr(`select * from attributes where name="${RefIDKey}" and value="${oriID}" limit 1`)
        return rows.at(0).block_id;
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
        const bookIndex = await progStorage.loadBookIndexIfNeeded(bookInfo.bookID);
        let point = (await progStorage.booksInfo(bookInfo.bookID)).point;
        if (isRand) point = utils.getRandInt0tox(bookIndex.length); // 随机创建书籍的某个分片，适用于单词集合。
        await progStorage.updateBookInfoTime(bookID);
        if (point >= bookIndex.length) {
            await siyuan.pushMsg(this.plugin.i18n.thisIsLastPage);
            return;
        } else if (point < 0) {
            await siyuan.pushMsg(this.plugin.i18n.thisIsFirstPage);
            return;
        }
        let openPiece = false;
        noteID = await help.createPiece(bookInfo, bookIndex, point)
        if (noteID) {
            events.setDocID(noteID);
            openPiece = true;
            await OpenSyFile2(this.plugin, noteID)
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
            if (tab?.["custom-progmark"]?.includes(bookID)) {
                closeTabByTitle([tab], events.docID)
            }
        }
    }

    private async htmlBlockReadNextPeiceInLock(bookID: string, noteID: string, cbType: HtmlCBType, point: number) {
        switch (cbType) {
            case HtmlCBType.previous:
                await progStorage.gotoBlock(bookID, point - 1);
                await this.startToLearnWithLock(bookID);
                this.closePeices(bookID);
                showCardAnswer();
                pressSkip()
                break;
            case HtmlCBType.next:
                await progStorage.gotoBlock(bookID, point + 1);
                await this.startToLearnWithLock(bookID);
                this.closePeices(bookID);
                showCardAnswer();
                pressSkip()
                break;
            case HtmlCBType.deleteAndExit:
                confirm("⚠️", "🏃 🗑", async () => {
                    await siyuan.removeRiffCards([noteID]);
                    siyuan.removeDocByID(noteID);
                    showCardAnswer();
                    pressSkip()
                });
                break;
            case HtmlCBType.deleteAndBack:
                confirm("⚠️", this.plugin.i18n.DeleteAndBack, async () => {
                    await siyuan.removeRiffCards([noteID]);
                    await progStorage.gotoBlock(bookID, point - 1);
                    await this.startToLearnWithLock(bookID);
                    siyuan.removeDocByID(noteID);
                    this.closePeices(bookID);
                    showCardAnswer();
                    pressSkip()
                });
                break;
            case HtmlCBType.deleteAndNext:
                confirm("⚠️", this.plugin.i18n.DeleteAndNext, async () => {
                    await siyuan.removeRiffCards([noteID]);
                    await progStorage.gotoBlock(bookID, point + 1);
                    await this.startToLearnWithLock(bookID);
                    siyuan.removeDocByID(noteID);
                    this.closePeices(bookID);
                    showCardAnswer();
                    pressSkip()
                });
                break;
            case HtmlCBType.nextBook:
                await this.startToLearnWithLock();
                showCardAnswer();
                pressSkip()
                break;
            case HtmlCBType.quit: {
                const t = await OpenSyFile2(this.plugin, noteID);
                await utils.sleep(200);
                t?.close();
                showCardAnswer();
                pressSkip()
                break;
            }
            case HtmlCBType.AddDocCard:
                await siyuan.addRiffCards([noteID]);
                break;
            case HtmlCBType.DelDocCard:
                await siyuan.removeRiffCards([noteID]);
                showCardAnswer();
                pressSkip()
                break;
            case HtmlCBType.ignoreBook:
                await progStorage.setIgnoreBook(bookID);
                break;
            case HtmlCBType.fullfilContent: {
                const index = await progStorage.loadBookIndexIfNeeded(bookID);
                const piecePre = index[point - 1] ?? [];
                const piece = index[point] ?? [];
                await fullfilContent(point, bookID, piecePre, piece, noteID, null);
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
                const index = await progStorage.loadBookIndexIfNeeded(bookID);
                let piece = index[point] ?? [];
                let piecePre = index[point - 1] ?? [];

                // 如果 piece 为空（可能是因为 point 是时间戳而不是索引），从摘抄文档自身获取内容块
                // 注意：必须在 cleanNote 之前获取，否则内容会被删除
                if (piece.length === 0) {
                    const blocks = await siyuan.getChildBlocks(noteID);
                    piece = blocks
                        .filter((b: Block) => b.type !== "d" && b.content)
                        .map((b: Block) => b.id);
                }

                await help.cleanNote(noteID);
                await fullfilContent(point, bookID, piecePre, piece, noteID, "p");
                break;
            }
            case HtmlCBType.splitByPunctuationsList: {
                const index = await progStorage.loadBookIndexIfNeeded(bookID);
                let piece = index[point] ?? [];
                let piecePre = index[point - 1] ?? [];
                // 如果 piece 为空，从摘抄文档自身获取内容块（必须在 cleanNote 之前）
                if (piece.length === 0) {
                    const blocks = await siyuan.getChildBlocks(noteID);
                    piece = blocks
                        .filter((b: Block) => b.type !== "d" && b.content)
                        .map((b: Block) => b.id);
                }
                await help.cleanNote(noteID);
                await fullfilContent(point, bookID, piecePre, piece, noteID, "i");
                break;
            }
            case HtmlCBType.splitByPunctuationsListCheck: {
                const index = await progStorage.loadBookIndexIfNeeded(bookID);
                let piece = index[point] ?? [];
                let piecePre = index[point - 1] ?? [];
                // 如果 piece 为空，从摘抄文档自身获取内容块（必须在 cleanNote 之前）
                if (piece.length === 0) {
                    const blocks = await siyuan.getChildBlocks(noteID);
                    piece = blocks
                        .filter((b: Block) => b.type !== "d" && b.content)
                        .map((b: Block) => b.id);
                }
                await help.cleanNote(noteID);
                await fullfilContent(point, bookID, piecePre, piece, noteID, "t");
                break;
            }
            default:
                throw "Invalid HtmlCBType " + cbType;
        }
    }

    private async getBook2Learn(bookID?: string): Promise<BookInfo> {
        if (bookID) {
            return progStorage.booksInfo(bookID);
        }
        const infos = progStorage.booksInfos();
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
            return progStorage.booksInfo(miniID);
        }
        return {} as any;
    }

    async viewAllProgressiveBooks() {
        showDialog((target, dm) => {
            return mount(ShowAllBooksSvelte, {
                target,
                props: {
                    dm,
                }
            });
        }, {
            title: this.plugin.i18n.viewAllProgressiveBooks,
            width: events.isMobile ? "90vw" : undefined,
            height: events.isMobile ? "180vw" : "800px",
        });
    }
}

export const prog = new Progressive();

