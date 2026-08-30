import { Menu, Plugin, openTab, confirm, IProtyle, Protyle } from "siyuan";
import "./index.scss";
import { EventType, events } from "../../sy-tomato-plugin/src/libs/Events";
import { closeTabByTitle, getActiveDocID, siyuan, } from "../../sy-tomato-plugin/src/libs/utils";
import * as utils from "../../sy-tomato-plugin/src/libs/utils";
import * as help from "./helper";
import { winHotkey } from "../../sy-tomato-plugin/src/libs/winHotkey";
import * as constants from "./constants";
import {
    BlockNodeEnum, DATA_NODE_ID, DATA_TYPE, IN_BOOK_INDEX, MarkKey,
    PARAGRAPH_INDEX, PDIGEST_CTIME, PDIGEST_PARENT_ID, RefIDKey
} from "../../sy-tomato-plugin/src/libs/gconst";
import AddBookSvelte from "./AddBook.svelte";
import ShowAllBooksSvelte from "./ShowAllBooks.svelte";
import { progStorage } from "./ProgressiveStorage";
import { rollerNextBook, rollerMarkRead, rollerArchiveBook } from "./roller";
import { notifyFleetChanged } from "./fleet";
import { HtmlCBType } from "./constants";
import { findDocByIal, getDocIalDigestDir, parseBookIDFromCtime } from "./progData";
import { PIECE_IDX_KEY, resolveOriginTarget } from "./originTrace";
import { OpenSyFile2 } from "../../sy-tomato-plugin/src/libs/docUtils";
import { addClickEvent, progressiveBtnFloating } from "./ProgressiveBtn";
import { piecesmenu, ProgressiveJumpMenu, ProgressiveStart2learn, windowOpenStyle } from "../../sy-tomato-plugin/src/libs/stores";
import { getBookID } from "../../sy-tomato-plugin/src/libs/progressive";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import { loadBookStatuses, invalidateBookStatusCache, type BookStatusInfo } from "./bookStatus";
import { mount, } from "svelte";
import { fullfilContent } from "./helper";
import { showDialog } from "../../sy-tomato-plugin/src/libs/DialogText";
import { pressSkip, showCardAnswer } from "../../sy-tomato-plugin/src/libs/cardUtils";

export const progSettingsOpenHK = winHotkey("alt+shift+,", "progSettingsOpenHK", "⚙️", () => tomatoI18n.渐进学习的设置)
export const Progressive开始学习 = winHotkey("⌥-", "Progressive startToLearn", "📖", () => tomatoI18n.开始今日阅读)
export const Progressive开始随机学习 = winHotkey("⌥⇧-", "Progressive startToLearnRand", "🔀📖", () => tomatoI18n.开始随机学习)
export const Progressive上一页 = winHotkey("ctrl+left", "上一页", "⏫", () => tomatoI18n.上一页)
export const Progressive下一页 = winHotkey("ctrl+right", "下一页", "⏬", () => tomatoI18n.下一页)
export const Progressive跳到分片或回到原文 = winHotkey("⇧⌥w", "跳到分片或回到原文", "🎯📖", () => tomatoI18n.跳到分片或回到原文)
export const Progressive添加当前文档到渐进阅读分片模式 = winHotkey("⇧⌥m", "添加当前文档到渐进阅读(分片模式)", "＋📗", () => tomatoI18n.添加当前文档到渐进阅读分片模式)

class Progressive {
    plugin: Plugin;
    settings: TomatoSettings;
    private docID: string;
    private observer: MutationObserver;
    private welement: any;

    addTopbar(plugin: Plugin, position: "left" | "right") {
        const tb = plugin.addTopBar({
            icon: "iconFilesRoot",
            title: tomatoI18n.渐进学习菜单,
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
            // □11 盘点整改 A 类：右键「开始学习」退役——火苗点击=startReading 全局出片 +
            // 书态 ▶ + 🔄 三重覆盖，右键不再重复占位
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
            iconHTML: Progressive跳到分片或回到原文.icon,
            label: Progressive跳到分片或回到原文.langText(),
            accelerator: Progressive跳到分片或回到原文.m,
            click: () => {
                this.readThisPiece();
            }
        });
        // □11 盘点整改 A 类：桌面顶栏菜单精简为「加书 + 跳到分片」两项（开始学习归火苗/
        // 书态 ▶/🔄）；移动端三项全留（无火苗 hover 生态，保留常驻入口）
        if (events.isMobile && ProgressiveStart2learn.get()) {
            menu.addItem({
                iconHTML: Progressive开始学习.icon,
                label: Progressive开始学习.langText(),
                accelerator: Progressive开始学习.m,
                click: () => {
                    this.startToLearnWithLock();
                }
            });
        }
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
                await siyuan.pushMsg(tomatoI18n.请等待索引建立 + " [1]");
            }
        });
    }

    private async addProgressiveReading(bookID: string = "") {
        if (!bookID) {
            // events.docID 只在点击编辑器内容后更新——从文档树点开文档还没点内容时
            // 取不到，先取当前激活页签的文档（用户眼前的文档）
            bookID = getActiveDocID() || events.docID;
        }
        if (!bookID) {
            await siyuan.pushMsg(tomatoI18n.请先打开一个文档);
            return;
        }
        const row = await siyuan.sqlOne(`select content from blocks where type='d' and id='${bookID}'`);
        if (!row) {
            siyuan.pushMsg(tomatoI18n.似乎书本已被删除.replace("{bookID}", bookID));
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
        // □21 目录浮层含容器内嵌套标题（超块/列表），分片索引只收顶层块 id（getChildBlocks
        // 平铺）；沿 parent_id 上爬到顶层祖先再匹配（顶层块 parent_id==root_id，一次即停），
        // 片内定位也用祖先 id——分片以顶层块为单位拷贝，嵌套标题没有自己的 progref。
        // 块菜单选嵌套块跳分片同享此修复（此前落「请选择段落块」死路）。
        let topID = blockID;
        let rootID = "";
        for (let i = 0; i < 20; i++) {
            const row = await siyuan.sqlOne(`select parent_id, root_id from blocks where id="${topID}"`);
            if (!row?.root_id) {
                rootID = "";
                break;
            }
            rootID = row.root_id;
            if (!row.parent_id || row.parent_id === row.root_id) break;
            topID = row.parent_id;
        }
        if (rootID) {
            const bookID = rootID;
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
                await siyuan.pushMsg(tomatoI18n.请先将此文档加入渐进学习列表);
            } else {
                for (let i = 0; i < idx.length; i++) {
                    for (let j = 0; j < idx[i].length; j++) {
                        if (topID === idx[i][j]) {
                            await progStorage.gotoBlock(bookID, i);
                            await this.startToLearnWithLock(bookID);//创建分片
                            setTimeout(async () => {
                                const pieceBlockID = await this.getPiecesByRefID(topID)
                                if (pieceBlockID) await OpenSyFile2(this.plugin, pieceBlockID);//跳到分片内的块
                            }, 1200);
                            return;
                        }
                    }
                }
                await siyuan.pushMsg(tomatoI18n.请选择段落块进行跳转);
            }
        } else {
            await siyuan.pushMsg(tomatoI18n.未找到文档请等待索引);
        }
    }

    private async getPiecesByRefID(oriID: string) {
        const rows = await siyuan.sqlAttr(`select * from attributes where name="${RefIDKey}" and value="${oriID}" limit 1`)
        return rows.at(0).block_id;
    }

    async startToLearnWithLock(bookID = "", isRand = false) {
        return navigator.locks.request(constants.StartToLearnLock, { ifAvailable: true }, async (lock) => {
            if (lock) {
                await siyuan.pushMsg(tomatoI18n.正在为您打开文档片段);
                let i = 0;
                while (await this.startToLearn(bookID, isRand) === false) {
                    if (i++ > 30) break;
                }
                await utils.sleep(constants.IndexTime2Wait);
            } else {
                await siyuan.pushMsg(tomatoI18n.请等待索引建立 + " [2]");
            }
        });
    }

    /** ⏸/⚠ 书的统一处理：闭笔记本=提示开箱恢复（书可能只是暂不可见，绝不清理）；
     * 丢失=confirm 引导清理（只清 books.json 记录+索引文件，prog-data 沉淀物不动） */
    private async handleUnreadableBook(bookID: string, st: BookStatusInfo) {
        if (st.status === "closed") {
            await siyuan.pushMsg(tomatoI18n.书在已关闭的笔记本中(st.name));
            return;
        }
        await siyuan.pushMsg(tomatoI18n.书原文档已不存在(st.name, st.fsUnavailable));
        // 无文件层兜底的前端（移动端/浏览器）误判概率高且无法二次确认，不提供清理出口
        if (st.fsUnavailable) return;
        const id = bookID || ([...(await loadBookStatuses())].find(([, s]) => s.status === "lost")?.[0] ?? "");
        if (!id) return;
        confirm("⚠️", tomatoI18n.清理该书渐进记录确认(st.name), async () => {
            await progStorage.removeIndex(id);
            invalidateBookStatusCache();
            notifyFleetChanged();
            await siyuan.pushMsg(tomatoI18n.已清理该书记录);
        });
    }

    private async startToLearn(bookID = "", isRand = false) {
        let noteID = "";
        if (!bookID) {
            // 滚筒出片：order 中 lastServed 之后第一个可读书（跳过忽略/归档/读完），出片即轮转
            bookID = await rollerNextBook();
        if (!bookID) {
            // 出不了片：真空书架 vs 有书但全被 ⏸/⚠ 挡住（全跳光给对症提示，不再误报「没添加文档」）
            const statuses = await loadBookStatuses();
            const blocked = [...statuses.values()].find(s => s.status !== "ok");
            if (blocked) {
                await this.handleUnreadableBook("", blocked);
            } else {
                siyuan.pushMsg(tomatoI18n.您还没添加任何文档);
            }
            return;
        }
        }
        // 书籍状态判定（2026-08-28 设计共识）：⏸ 闭笔记本/⚠ 文档丢失的书不出片——
        // 死书曾是「点了没反应」的根因（toast 一闪而过、无窗口打开）
        const statuses = await loadBookStatuses();
        const st = statuses.get(bookID);
        if (st && st.status !== "ok") {
            await this.handleUnreadableBook(bookID, st);
            return;
        }
        const bookInfo = await progStorage.booksInfo(bookID);
        const bookIndex = await progStorage.loadBookIndexIfNeeded(bookInfo.bookID);
        let point = (await progStorage.booksInfo(bookInfo.bookID)).point;
        if (isRand) point = utils.getRandInt0tox(bookIndex.length); // 随机创建书籍的某个分片，适用于单词集合。
        await progStorage.updateBookInfoTime(bookID);
        if (bookIndex.length === 0) {
            // 0 片 ≠ 最后一页（旧文案误导）：未分片的书引导去分片
            await siyuan.pushMsg(tomatoI18n.本书还未分片(st.name));
            confirm("", tomatoI18n.本书还未分片立即重新分片吗(st.name), async () => {
                await this.addProgressiveReadingWithLock(bookID);
            });
            return;
        }
        if (point >= bookIndex.length) {
            await siyuan.pushMsg(tomatoI18n.已经是最后一页了);
            return;
        } else if (point < 0) {
            await siyuan.pushMsg(tomatoI18n.已经是第一页了);
            return;
        }
        let openPiece = false;
        noteID = await help.createPiece(bookInfo, bookIndex, point)
        if (noteID) {
            events.setDocID(noteID);
            openPiece = true;
            await OpenSyFile2(this.plugin, noteID)
        } else {
            // 分片源块全部失效（索引残留的已删除块），明确提示而非停留在"正在为您打开"
            await siyuan.pushMsg(tomatoI18n.该分片内容已失效);
            return;
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
                await siyuan.pushMsg(tomatoI18n.请等待索引建立 + " [3]");
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
                confirm("⚠️", tomatoI18n.删除并返回, async () => {
                    await siyuan.removeRiffCards([noteID]);
                    await progStorage.gotoBlock(bookID, point - 1);
                    await this.startToLearnWithLock(bookID);
                    siyuan.removeDocByID(noteID);
                    this.closePeices(bookID);
                    showCardAnswer();
                    pressSkip()
                });
                break;
            case HtmlCBType.deleteAndNext: {
                // v5「读完即删」：分片是一次性餐具（原文档还在、误删可重分片），主循环高频动作不再 confirm
                await siyuan.removeRiffCards([noteID]);
                await progStorage.gotoBlock(bookID, point + 1);
                await this.markReadSafe(bookID); // 已读=删片前进那一刻（火苗/热力图唯一数据源）
                await this.startToLearnWithLock(bookID);
                siyuan.removeDocByID(noteID);
                this.closePeices(bookID);
                showCardAnswer();
                pressSkip()
                break;
            }
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
            case HtmlCBType.ignoreBook:
                await progStorage.setIgnoreBook(bookID);
                break;
            case HtmlCBType.cleanOriginText:
                await help.cleanNote(noteID);
                break;
            case HtmlCBType.openFlashcardTab:
                // v5：附属卡 deck 目标从原书改为 digest-书名 夹（摘抄产生的卡才是附属卡）
                if (bookID) await this.openBookCards(bookID);
                else openTab({ app: this.plugin.app, card: { type: "all" } });
                break;
            default:
                throw "Invalid HtmlCBType " + cbType;
        }
    }

    /** □22 重插翻新：清空片内全部子块（含手写笔记——refillMenu 的 confirm 已警告）后按
     * 所选断句方式重插原文。与 htmlBlockReadNextPeice 共锁防并发；先验源块存活再清空
     * （同 createPiece 口径），防索引悬空时「清了旧内容却插不进新内容」。 */
    async refillPiece(bookID: string, noteID: string, point: number, stype: AsList | "no" | null) {
        return navigator.locks.request("htmlBlockReadNextPeiceLock", { ifAvailable: true }, async (lock) => {
            if (!lock) {
                await siyuan.pushMsg(tomatoI18n.请等待索引建立 + " [3]");
                return;
            }
            const index = await progStorage.loadBookIndexIfNeeded(bookID);
            const piecePre = index[point - 1] ?? [];
            const piece = (await siyuan.getRows(index[point] ?? [], "id")).map(r => r.id);
            if (piece.length === 0) {
                await siyuan.pushMsg(tomatoI18n.该分片内容已失效);
                return;
            }
            await siyuan.clearAll(noteID);
            try {
                await fullfilContent(point, bookID, piecePre, piece, noteID, stype);
            } catch (e) {
                // clearAll 不可逆（笔记已删），重插中途失败必须让用户知道可重试自愈——
                // 静默的话最终态=确认过、清空了、什么都没插回（reasoning review P1-1）
                console.error("refillPiece fullfilContent failed", e);
                await siyuan.pushMsg(tomatoI18n.重插失败提示, 4000);
                return;
            }
            await utils.sleep(constants.IndexTime2Wait);
        });
    }

    /** 已读记账；附属动作失败只降级不阻断开片 */
    private async markReadSafe(bookID: string) {
        try {
            await rollerMarkRead(bookID);
            notifyFleetChanged(); // □6 火苗/面板即时联动（fleet.ts 不 import 本类，单向无环）
        } catch (e) {
            console.error("roller markRead failed", e);
        }
    }

    // ============ v5 □5 浮条三态动作（docs/prog-v5-floatbar-design.md §3） ============

    /** digest-书名 夹「查不建」：附属卡/摘抄汇总入口没摘过书时不建空夹 */
    private async findDigestDir(bookID: string): Promise<string> {
        return findDocByIal(getDocIalDigestDir(bookID));
    }

    /** 附属卡（三态公共组）：doc deck 挂 digest-书名 夹 */
    async openBookCards(bookID: string) {
        const dirID = await this.findDigestDir(bookID);
        if (!dirID) {
            await siyuan.pushMsg(tomatoI18n.本书还没有摘抄);
            return;
        }
        openTab({ app: this.plugin.app, card: { type: "doc", id: dirID } });
    }

    /** 摘抄汇总（书态/摘抄态）：打开 digest-书名 夹 */
    async openDigestSummary(bookID: string) {
        const dirID = await this.findDigestDir(bookID);
        if (!dirID) {
            await siyuan.pushMsg(tomatoI18n.本书还没有摘抄);
            return;
        }
        await OpenSyFile2(this.plugin, dirID);
    }

    /** 归档（书态 ghost，confirm）：原书退出一切推送，摘抄永久留存 */
    async archiveBookWithConfirm(bookID: string) {
        const name = await progStorage.bookName(bookID);
        confirm("📦", tomatoI18n.归档本书确认.replace("{name}", name ?? bookID), async () => {
            await rollerArchiveBook(bookID);
            await siyuan.pushMsg(tomatoI18n.已归档本书);
        });
    }

    /** 回原书（片态=打开原书；摘抄态传 focusBlockID 定位原文块） */
    async openOriginBook(bookID: string, focusBlockID?: string) {
        await OpenSyFile2(this.plugin, focusBlockID || bookID);
    }

    /**
     * □16 摘抄态回原书智能链（形态一：单动作不加新按钮）：块级 progref → 片/任意文档
     * parent → 片序号键重切同片（静默重建+toast，confirm 反而打断心流）→ 兜底跳书。
     * 决策逻辑纯函数在 originTrace.resolveOriginTarget（有单测）。
     */
    async openOriginFromDigest(digestDocID: string, selectedIDs: string[]) {
        let refID = "";
        for (const id of selectedIDs) {
            const attrs = await siyuan.getBlockAttrs(id);
            refID = attrs?.[RefIDKey] ?? "";
            if (refID) break;
        }
        const docAttrs = await siyuan.getBlockAttrs(digestDocID);
        const refExists = refID ? await siyuan.checkBlockExist(refID) : false;
        const parentID = docAttrs?.[PDIGEST_PARENT_ID] ?? "";
        const parentExists = parentID ? await siyuan.checkBlockExist(parentID) : false;
        const parentIsPiece = parentExists && !!((await siyuan.getBlockAttrs(parentID))?.[MarkKey]);
        const target = resolveOriginTarget({
            refID, refExists, parentID, parentExists, parentIsPiece,
            pieceIdx: docAttrs?.[PIECE_IDX_KEY] ?? "",
            bookID: parseBookIDFromCtime(docAttrs?.[PDIGEST_CTIME] ?? ""),
        });
        if (target.action === "rebuild") {
            const info = await progStorage.booksInfo(target.bookID);
            const index = await progStorage.loadBookIndexIfNeeded(target.bookID);
            const noteID = await help.createPiece(info, index, target.point);
            if (noteID) {
                await siyuan.pushMsg(tomatoI18n.分片已重建);
                await OpenSyFile2(this.plugin, noteID);
                return;
            }
            // 重建失败（书删了/索引空）落兜底跳书
            await OpenSyFile2(this.plugin, target.bookID);
            return;
        }
        if (target.action !== "none") await OpenSyFile2(this.plugin, target.id);
    }

    /** recite 安装检测（app.plugins，送仿写按钮显隐；□6 Dock 导流图标复用） */
    isReciteInstalled(): boolean {
        return (this.plugin?.app as any)?.plugins?.some((p: any) => p?.name === "sy-recite-plugin") ?? false;
    }

    /** □11 浮层族通用跳转：文档/块 ID → OpenSyFile2（块 ID 会聚焦定位） */
    async jumpTo(id: string) {
        if (id) await OpenSyFile2(this.plugin, id);
    }

    /** □11 原文侧追溯浮层跳片：gotoBlock 置断点 + 出片（与目录浮层 readThisPiece 同链路） */
    async jumpToPiece(bookID: string, point: number) {
        await progStorage.gotoBlock(bookID, point);
        await this.startToLearnWithLock(bookID);
    }

    /**
     * □11 digest 态路径胶囊文案：显示降级后实际可达目标（不显示死链）——
     * parent 存活且是另一个摘抄 → 「书名 / 父摘抄标题」；parent 是片/书发起或已删
     * → 只显书名（书永远在：ctime 含 bookID）。点击行为走 openOriginFromDigest
     * 完整四级链（含块级 progref 优先，胶囊文案不含该层——它随选中实时变）。
     */
    async digestCrumbs(digestDocID: string): Promise<string> {
        const docAttrs = await siyuan.getBlockAttrs(digestDocID);
        if (!docAttrs) return "";
        const bookID = parseBookIDFromCtime(docAttrs[PDIGEST_CTIME] ?? "");
        if (!bookID) return "";
        const bookName = (await siyuan.getBlockAttrs(bookID))?.title ?? bookID;
        const parentID = docAttrs[PDIGEST_PARENT_ID] ?? "";
        if (parentID && parentID !== bookID && await siyuan.checkBlockExist(parentID)) {
            const pAttrs = await siyuan.getBlockAttrs(parentID);
            // 父是另一个摘抄（再摘抄链）才显示父段；父是片/原文发起文档则书名已足够
            if (pAttrs?.[PDIGEST_CTIME]) {
                return `${bookName} / ${pAttrs.title ?? parentID}`;
            }
        }
        return bookName;
    }

    /** 送仿写（摘抄态 primary）：触发 recite 仿写练习开关命令 */
    async sendToRecite() {
        const recite = (this.plugin?.app as any)?.plugins?.find((p: any) => p?.name === "sy-recite-plugin");
        const cmd = recite?.commands?.find((c: any) => c.langKey === "reciteTogglePractice");
        if (cmd?.callback) {
            await cmd.callback();
        } else {
            await siyuan.pushMsg(tomatoI18n.未找到仿写插件功能);
        }
    }

    /** 定向送仿写（□27 仿写本片副本链路）：对指定文档直接进仿写模式。命令通道
     *  togglePractice 只认最近交互文档无法定向，故走 recite 实例方法 enterPracticeFor；
     *  旧版 recite 无此方法时降级提示（副本已建好仍有整摘价值，文案写明版本过旧而非
     *  未安装——review P2-3） */
    async enterRecitePractice(docID: string) {
        const recite = (this.plugin?.app as any)?.plugins?.find((p: any) => p?.name === "sy-recite-plugin");
        if (typeof recite?.enterPracticeFor === "function") {
            await recite.enterPracticeFor(docID);
        } else {
            await siyuan.pushMsg(tomatoI18n.仿写插件版本过旧);
        }
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
            title: tomatoI18n.管理书目,
            width: events.isMobile ? "90vw" : undefined,
            height: events.isMobile ? "180vw" : "800px",
        });
    }
}

export const prog = new Progressive();

