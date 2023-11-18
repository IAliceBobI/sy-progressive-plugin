import { Dialog, Menu, Plugin, openTab, confirm } from "siyuan";
import "./index.scss";
import { events } from "./Events";
import { siyuan, timeUtil } from "./utils";
import { HtmlCBType } from "./helper";
import * as utils from "./utils";
import * as help from "./helper";
import * as constants from "./constants";

class Progressive {
    private static readonly GLOBAL_THIS: Record<string, any> = globalThis;
    private plugin: Plugin;
    private storage: help.Storage;

    onload(plugin: Plugin) {
        Progressive.GLOBAL_THIS["progressive_zZmqus5PtYRi"] = { progressive: this, utils, siyuan, timeUtil, events };
        this.plugin = plugin;
        this.storage = new help.Storage(plugin);
        const topBarElement = this.plugin.addTopBar({
            icon: "iconABook",
            title: this.plugin.i18n.progressiveReadingMenu,
            position: "right",
            callback: () => {
                if (events.isMobile) {
                    this.addMenu();
                } else {
                    let rect = topBarElement.getBoundingClientRect();
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
        this.plugin.addCommand({
            langKey: "startToLearn",
            hotkey: "⌥-",
            globalCallback: () => {
                this.startToLearnWithLock();
            },
        });
        this.plugin.eventBus.on("open-menu-content", async ({ detail }) => {
            const menu = detail.menu;
            menu.addItem({
                label: this.plugin.i18n.readThisPiece,
                icon: "iconCursor",
                click: () => {
                    const blockID = detail?.element?.getAttribute("data-node-id") ?? "";
                    if (blockID) {
                        this.readThisPiece(blockID);
                    }
                },
            });
        });
        // TODO: only for dev
        this.plugin.addTopBar({
            icon: "iconSparkles",
            title: "reload",
            position: "right",
            callback: () => {
                window.location.reload();
            }
        });
    }

    private addMenu(rect?: DOMRect) {
        const menu = new Menu("progressiveMenu");
        menu.addItem({
            icon: "iconAddingBook",
            label: this.plugin.i18n.addProgressiveReading,
            accelerator: "",
            click: async () => {
                navigator.locks.request(constants.AddProgressiveReadingLock, { ifAvailable: true }, async (lock) => {
                    if (lock) {
                        await this.addProgressiveReading();
                        await utils.sleep(constants.IndexTime2Wait);
                    } else {
                        siyuan.pushMsg(this.plugin.i18n.slowDownALittleBit);
                    }
                });
            }
        });
        menu.addItem({
            icon: "iconEye",
            label: this.plugin.i18n.viewAllProgressiveBooks,
            accelerator: "",
            click: async () => {
                navigator.locks.request(constants.ViewAllProgressiveBookLock, { ifAvailable: true }, async (lock) => {
                    if (lock) {
                        await this.viewAllProgressiveBooks();
                        await utils.sleep(constants.IndexTime2Wait);
                    } else {
                        siyuan.pushMsg(this.plugin.i18n.slowDownALittleBit);
                    }
                });
            }
        });
        menu.addItem({
            icon: "iconCursor",
            label: this.plugin.i18n.readThisPiece,
            accelerator: "",
            click: async () => {
                await this.readThisPiece();
            }
        });
        menu.addItem({
            icon: "iconLearn",
            label: this.plugin.i18n.startToLearn,
            accelerator: "⌥-",
            click: () => {
                this.startToLearnWithLock();
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

    private async addProgressiveReading(bookID?: string) {
        if (!bookID) {
            bookID = events.docID;
        }
        if (!bookID) {
            await siyuan.pushMsg(this.plugin.i18n.openAdocFirst);
            return;
        }
        const row = await siyuan.sqlOne(`select content from blocks where type='d' and id='${bookID}'`);
        if (!row) {
            siyuan.pushMsg(`似乎${bookID}已经被删除`);
            return;
        }
        await this.addProgressiveReadingDialog(bookID, row["content"]);
    }

    private async addProgressiveReadingDialog(bookID: string, bookName: string) {
        const titleSplitID = utils.newID();
        const LengthSplitID = utils.newID();
        const btnSplitID = utils.newID();
        const dialog = new Dialog({
            title: this.plugin.i18n.addProgressiveReading,
            content: `<div class="b3-dialog__content">
                <div class="prog-style__id">${bookName}</div>
                <div class="fn__hr"></div>
                <span class="prog-style__id">是否根据标题拆分</span>
                <input type="checkbox" id="${titleSplitID}" class="prog-style__checkbox"/>
                <div class="fn__hr"></div>
                <div class="prog-style__id">根据字数拆分(0为不根据字数拆分)</div>
                <input type="text" id="${LengthSplitID}" class="prog-style__input"/>
                <div class="fn__hr"></div>
                <button id="${btnSplitID}" class="prog-style__button">添加文档/重新添加文档</button>
            </div>`,
            width: events.isMobile ? "92vw" : "560px",
            height: "540px",
        });

        const titleCheckBox = dialog.element.querySelector("#" + titleSplitID) as HTMLInputElement;
        titleCheckBox.checked = true;
        titleCheckBox.addEventListener("change", () => {
            if (titleCheckBox.checked) {
                titleCheckBox.checked = true;
            } else {
                titleCheckBox.checked = false;
            }
        });
        const LengthSplitInput = dialog.element.querySelector("#" + LengthSplitID) as HTMLInputElement;
        LengthSplitInput.value = String(constants.PieceLen);

        const btn = dialog.element.querySelector("#" + btnSplitID) as HTMLButtonElement;
        btn.addEventListener("click", async () => {
            const splitLen = Number(LengthSplitInput.value.trim());
            if (!LengthSplitInput.value.trim() || (!splitLen && splitLen !== 0)) {
                LengthSplitInput.value = String(constants.PieceLen);
            } else {
                dialog.destroy();
                const wordCount = await help.getDocWordCount(bookID);
                let groups: help.WordCountType[][];
                if (titleCheckBox.checked) {
                    await siyuan.pushMsg("根据标题拆分……");
                    groups = new help.HeadingGroup(wordCount, constants.MiniContentLen).split();
                } else {
                    groups = [wordCount];
                }
                if (splitLen > 0) {
                    await siyuan.pushMsg("根据内容长度拆分:" + splitLen);
                    groups = new help.ContentLenGroup(groups, splitLen).split();
                }
                await this.storage.saveIndex(bookID, groups);
                await this.storage.resetBookReadingPoint(bookID);
                setTimeout(async () => {
                    await this.viewAllProgressiveBooks();
                }, constants.IndexTime2Wait);
            }
        });
    }

    private async readThisPiece(blockID?: string) {
        if (!blockID) {
            blockID = events.lastBlockID;
        }
        const row = await siyuan.sqlOne(`select root_id from blocks where id="${blockID}"`);
        if (row) {
            const bookID = row["root_id"];
            const idx = await this.storage.loadBookIndexIfNeeded(bookID);
            if (!idx.length) {
                await siyuan.pushMsg("请先将此文档加入渐进学习列表");
            } else {
                for (let i = 0; i < idx.length; i++) {
                    for (let j = 0; j < idx[i].length; j++) {
                        if (blockID === idx[i][j]) {
                            await this.storage.gotoBlock(bookID, i);
                            this.startToLearnWithLock(bookID);
                            return;
                        }
                    }
                }
                await siyuan.pushMsg("找不到此块，可尝试重新对此文档进行分片");
            }
        } else {
            await siyuan.pushMsg("未找到文档，请重新建立索引或者等待索引建立完成");
        }
    }

    private startToLearnWithLock(bookID?: string) {
        navigator.locks.request(constants.StartToLearnLock, { ifAvailable: true }, async (lock) => {
            if (lock) {
                await siyuan.pushMsg(this.plugin.i18n.openingDocPieceForYou);
                await this.startToLearn(bookID);
                await utils.sleep(constants.IndexTime2Wait);
            } else {
                siyuan.pushMsg(this.plugin.i18n.slowDownALittleBit);
            }
        });
    }

    private async createNote(boxID: string, bookID: string, piece: string[], point: number) {
        let content: string;
        for (const blockID of piece) {
            content = (await siyuan.getBlockMarkdownAndContent(blockID))?.content ?? "";
            content = content.slice(0, 15).replace(/[　\/ ​]+/g, "").trim();
            if (content) break;
        }
        if (!content) content = `[${point}]`;
        const row = await siyuan.sqlOne(`select hpath from blocks where id='${bookID}'`);
        let dir = row?.hpath ?? "";
        if (dir) {
            dir = dir + "/" + content;
            const docID = await siyuan.createDocWithMd(boxID, dir, "");
            await siyuan.setBlockAttrs(docID, { memo: help.getDocMemo(bookID, point) });
            return docID;
        }
        return "";
    }

    private async findDoc(bookID: string, point: number) {
        const row = await siyuan.sqlOne(`select id from blocks where type='d' and memo='${help.getDocMemo(bookID, point)}'`);
        if (row) {
            return row["id"];
        }
        return "";
    }

    private async startToLearn(bookID?: string) {
        let noteID = "";
        const bookInfo = await this.getBook2Learn(bookID);
        const bookIndex = await this.storage.loadBookIndexIfNeeded(bookInfo.bookID);
        let point = (await this.storage.booksInfo(bookInfo.bookID)).point;
        if (point >= bookIndex.length) {
            await siyuan.pushMsg("已经是最后一页了！即将从头开始……");
            point = 0;
        }
        const piece = bookIndex[point];
        noteID = await this.findDoc(bookInfo.bookID, point);
        if (noteID) {
            await this.cleanNote(noteID);
            await this.fullfilContent(bookInfo.bookID, piece, noteID, point);
            openTab({ app: this.plugin.app, doc: { id: noteID } });
            return;
        }
        noteID = await this.createNote(bookInfo.boxID, bookInfo.bookID, piece, point);
        if (noteID) {
            await this.fullfilContent(bookInfo.bookID, piece, noteID, point);
            openTab({ app: this.plugin.app, doc: { id: noteID } });
        } else {
            await siyuan.pushMsg("fail to create a new doc");
        }
    }

    async htmlBlockReadNextPeice(bookID: string, noteID: string, cbType: HtmlCBType, startID: string, endID: string, point: number) {
        navigator.locks.request(constants.StartToLearnLock, { ifAvailable: true }, async (lock) => {
            if (lock) {
                await this.htmlBlockReadNextPeiceInLock(bookID, noteID, cbType, startID, endID, point);
                await utils.sleep(constants.IndexTime2Wait);
            } else {
                siyuan.pushMsg(this.plugin.i18n.slowDownALittleBit);
            }
        });
    }

    private async htmlBlockReadNextPeiceInLock(bookID: string, noteID: string, cbType: HtmlCBType, startID: string, endID: string, point: number) {
        switch (cbType) {
            case HtmlCBType.previous:
                if (point > 0) {
                    await this.storage.gotoBlock(bookID, point - 1);
                    await this.startToLearn(bookID);
                }
                break;
            case HtmlCBType.skip:
                await siyuan.removeDocByID(noteID);
                await this.storage.gotoBlock(bookID, point + 1);
                await this.startToLearn(bookID);
                break;
            case HtmlCBType.nextBook:
                await siyuan.removeDocByID(noteID);
                await this.startToLearn();
                break;
            case HtmlCBType.quit:
                await siyuan.removeDocByID(noteID);
                break;
            case HtmlCBType.docCard:
                await siyuan.addRiffCards([noteID]);
                await this.cleanNote(noteID);
                await this.AddRef(noteID, startID, endID);
                await this.storage.gotoBlock(bookID, point + 1);
                await this.startToLearn(bookID);
                break;
            case HtmlCBType.saveDoc:
                await this.cleanNote(noteID);
                await this.AddRef(noteID, startID, endID);
                await this.storage.gotoBlock(bookID, point + 1);
                await this.startToLearn(bookID);
                break;
            default:
                throw "Invalid HtmlCBType " + cbType;
        }
    }

    private async cleanNote(noteID: string) {
        const rows = await siyuan.sql(`select id from blocks where root_id='${noteID}' and memo='${constants.TEMP_CONTENT}'`);
        for (const row of rows) {
            await siyuan.deleteBlock(row["id"]);
        }
    }

    private async AddRef(noteID: string, startID: string, endID: string) {
        // ((${startID} "[..]"))
        // \{\{select \* from blocks where id\='${startID}'\}\}
        await siyuan.insertBlockAsChildOf(help.tempContent(`{{{col
((${startID} "[..]"))

...

((${endID} "[..]"))
}}}`), noteID);
    }

    private async fullfilContent(bookID: string, piece: string[], noteID: string, point: number) {
        const startID = piece[0];
        const endID = piece[piece.length - 1];
        this.storage.updateBookInfoTime(bookID);
        piece.reverse();
        await siyuan.insertBlockAsChildOf(help.tempContent("---"), noteID);
        await siyuan.insertBlockAsChildOf(help.tempContent(help.getBtns(bookID, noteID, startID, endID, point)), noteID);
        await this.AddRef(noteID, startID, endID);
        for (const id of piece) {
            const content = await siyuan.getBlockKramdownWithoutID(id, [`memo="${constants.TEMP_CONTENT}"`]);
            await siyuan.insertBlockAsChildOf(content, noteID);
        }
    }

    private async getBook2Learn(bookID?: string): Promise<help.BookInfo> {
        if (bookID) {
            return this.storage.booksInfo(bookID);
        }
        const infos = this.storage.booksInfos();
        let miniTime = Number.MAX_SAFE_INTEGER;
        let miniID = "";
        for (const id in infos) {
            const { time } = infos[id];
            if (time < miniTime) {
                miniTime = time;
                miniID = id;
            }
        }
        if (miniID) {
            return this.storage.booksInfo(miniID);
        }
        return {};
    }

    private async viewAllProgressiveBooks() {
        const id = utils.newID();
        const dialog = new Dialog({
            title: this.plugin.i18n.viewAllProgressiveBooks,
            content: `<div class="b3-dialog__content">
                <div id='${id}'></div>
            </div>`,
            width: events.isMobile ? "92vw" : "560px",
            height: "540px",
        });
        const div = dialog.element.querySelector("#" + id) as HTMLElement;
        for (const bookID in this.storage.booksInfos()) {
            const subDiv = help.appendChild(div, "div", "", ["prog-style__container_div"]);
            const bookInfo = await this.storage.booksInfo(bookID);
            const idx = await this.storage.loadBookIndexIfNeeded(bookID);
            const row = await siyuan.sqlOne(`select content from blocks where type='d' and id="${bookInfo.bookID}"`);
            let name = bookInfo.bookID;
            if (row) name = row["content"];
            const progress = `${Math.ceil(bookInfo.point / idx.length * 100)}%`;
            help.appendChild(subDiv, "p", name, ["prog-style__id"]);
            help.appendChild(subDiv, "p", progress, ["prog-style__id"]);
            help.appendChild(subDiv, "button", "阅读", ["prog-style__button"], () => {
                this.startToLearnWithLock(bookID);
                dialog.destroy();
            });
            help.appendChild(subDiv, "button", "重建索引", ["prog-style__button"], async () => {
                await this.addProgressiveReading(bookID);
                dialog.destroy();
            });
            help.appendChild(subDiv, "button", "删除", ["prog-style__button"], () => {
                confirm("⚠️", "删除", async () => {
                    await this.storage.removeIndex(bookID);
                    div.removeChild(subDiv);
                });
            });
        }
    }

    onLayoutReady() { this.storage.onLayoutReady(); }
}

export const prog = new Progressive();
