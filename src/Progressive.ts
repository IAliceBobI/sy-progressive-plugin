import { Dialog, Menu, Plugin, openTab } from "siyuan";
import "./index.scss";
import { events } from "./Events";
import { siyuan, timeUtil } from "./utils";
import { HtmlCBType } from "./help";
import * as utils from "./utils";
import * as help from "./help";

type BookInfo = { time?: number, boxID?: string, point?: number, bookID?: string };
type BookInfos = { [key: string]: BookInfo };

const STORAGE_BOOKS = "books.json";
const ViewAllProgressiveBookLock = "ViewAllProgressiveBookLock";
const AddProgressiveReadingLock = "AddProgressiveReadingLock";
const StartToLearnLock = "StartToLearnLock";
const TEMP_CONTENT = "插件管理勿改managedByPluginDoNotModify";

class Progressive {
    private static readonly GLOBAL_THIS: Record<string, any> = globalThis;
    private plugin: Plugin;

    onload(plugin: Plugin) {
        Progressive.GLOBAL_THIS["progressive_zZmqus5PtYRi"] = { progressive: this, utils, siyuan, timeUtil, events };
        this.plugin = plugin;
        this.plugin.data[STORAGE_BOOKS] = {};
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
    }

    private async addProgressiveReading() {
        const bookID = events.docID;
        if (!bookID) {
            siyuan.pushMsg(this.plugin.i18n.openAdocFirst);
            return;
        }
        const row = await siyuan.sqlOne(`select box from blocks where id="${bookID}"`);
        if (!row) {
            siyuan.pushMsg(this.plugin.i18n.cannotFindTheBoxs + bookID);
            return;
        }
        const boxID = row["box"];
        const wordCount = await help.getDocWordCount(bookID);
        let groups = new help.HeadingGroup(wordCount, 200).split();
        groups = new help.ContentLenGroup(groups, 300).split();
        await this.plugin.saveData(bookID, { data: help.preSave(groups) });
        await this.updateBookInfo(bookID, { boxID, bookID });
        await this.saveBooksInfos();
        await this.viewAllProgressiveBooks();
    }

    private getBookReadPoint(docID: string) {
        return this.booksInfo(docID)?.point ?? 0;
    }

    private async updateBookInfo(docID: string, opt: BookInfo) {
        const info = this.booksInfo(docID);
        info["time"] = await siyuan.currentTimeMs();
        if (opt.boxID) info["boxID"] = opt.boxID;
        if (opt.bookID) info["bookID"] = opt.bookID;
        if (opt.point) info["point"] = opt.point;
        if (opt.point === 0) info["point"] = opt.point;
        this.booksInfos()[docID] = info;
    }

    private async saveBooksInfos() {
        return this.plugin.saveData(STORAGE_BOOKS, this.booksInfos());
    }

    private booksInfo(docID: string): BookInfo {
        return this.booksInfos()[docID] ?? {};
    }

    private booksInfos(): BookInfos {
        return this.plugin.data[STORAGE_BOOKS];
    }

    private addMenu(rect?: DOMRect) {
        const menu = new Menu("progressiveMenu");
        menu.addItem({
            icon: "iconAddingBook",
            label: this.plugin.i18n.addProgressiveReading,
            accelerator: "",
            click: async () => {
                navigator.locks.request(AddProgressiveReadingLock, { ifAvailable: true }, async (lock) => {
                    if (lock) {
                        await this.addProgressiveReading();
                        await utils.sleep(3000);
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
                navigator.locks.request(ViewAllProgressiveBookLock, { ifAvailable: true }, async (lock) => {
                    if (lock) {
                        await this.viewAllProgressiveBooks();
                        await utils.sleep(3000);
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
                await siyuan.pushMsg("还没开发此功能");
            }
        });
        menu.addItem({
            icon: "iconLearn",
            label: this.plugin.i18n.startToLearn,
            accelerator: "",
            click: async () => {
                navigator.locks.request(StartToLearnLock, { ifAvailable: true }, async (lock) => {
                    if (lock) {
                        await this.startToLearn();
                        await utils.sleep(3000);
                    } else {
                        siyuan.pushMsg(this.plugin.i18n.slowDownALittleBit);
                    }
                });
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

    private async createNote(boxID: string, bookID: string, piece: string[], point: number) {
        let content: string;
        for (const blockID of piece) {
            content = (await siyuan.getBlockMarkdownAndContent(blockID))?.content ?? "";
            content = content.slice(0, 15).replace(/[　\/ ​ ​]+/g, "").trim();
            if (content) break;
        }
        if (!content) content = `[${point}]`;
        const row = await siyuan.sqlOne(`select hpath from blocks where id='${bookID}'`);
        let dir = row?.hpath ?? "";
        if (dir) {
            dir = dir + "/" + content;
            const docID = await siyuan.createDocWithMd(boxID, dir, "");
            await siyuan.setBlockAttrs(docID, { memo: this.getDocMemo(bookID, point) });
            return docID;
        }
        return "";
    }

    private getDocMemo(bookID: string, point: number) {
        return `${TEMP_CONTENT}#${bookID},${point}`;
    }

    private async findDoc(bookID: string, point: number) {
        const row = await siyuan.sqlOne(`select id from blocks where type='d' and memo='${this.getDocMemo(bookID, point)}'`);
        if (row) {
            return row["id"];
        }
        return "";
    }

    private async startToLearn(bookID?: string) {
        let noteID = "";
        const bookInfo = await this.getBook2Learn(bookID);
        const bookIndex = help.afterLoad(await this.plugin.loadData(bookInfo.bookID));
        const point = this.getBookReadPoint(bookInfo.bookID);
        const piece = bookIndex[point];
        noteID = await this.findDoc(bookInfo.bookID, point);
        if (noteID) {
            await this.cleanNote(noteID);
            await this.fullfilContent(bookInfo.bookID, piece, noteID, point);
            openTab({ app: this.plugin.app, doc: { id: noteID } });
            return;
        }
        if (point < bookIndex.length) {
            noteID = await this.createNote(bookInfo.boxID, bookInfo.bookID, piece, point);
            if (noteID) {
                await this.fullfilContent(bookInfo.bookID, piece, noteID, point);
                openTab({ app: this.plugin.app, doc: { id: noteID } });
            } else {
                await siyuan.pushMsg("fail to create a new doc");
            }
        } else {
            await siyuan.pushMsg("已经是最后一页了！");
        }
    }

    private tempContent(content: string) {
        return content + `\n{: memo="${TEMP_CONTENT}"}`;
    }

    async htmlBlockReadNextPeice(bookID: string, noteID: string, cbType: HtmlCBType, startID: string, endID: string, point: number) {
        navigator.locks.request(StartToLearnLock, { ifAvailable: true }, async (lock) => {
            if (lock) {
                await this._htmlBlockReadNextPeice(bookID, noteID, cbType, startID, endID, point);
                await utils.sleep(3000);
            } else {
                siyuan.pushMsg(this.plugin.i18n.slowDownALittleBit);
            }
        });
    }

    private async _htmlBlockReadNextPeice(bookID: string, noteID: string, cbType: HtmlCBType, startID: string, endID: string, point: number) {
        switch (cbType) {
            case HtmlCBType.previous:
                if (point > 0) {
                    await this.gotoBlock(bookID, point - 1);
                    await this.startToLearn(bookID);
                }
                break;
            case HtmlCBType.skip:
                await siyuan.removeDocByID(noteID);
                await this.gotoBlock(bookID, point + 1);
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
                await this.gotoBlock(bookID, point + 1);
                await this.startToLearn(bookID);
                break;
            case HtmlCBType.saveDoc:
                await this.cleanNote(noteID);
                await this.AddRef(noteID, startID, endID);
                await this.gotoBlock(bookID, point + 1);
                await this.startToLearn(bookID);
                break;
            default:
                throw "Invalid HtmlCBType " + cbType;
        }
    }

    private async cleanNote(noteID: string) {
        const rows = await siyuan.sql(`select id from blocks where root_id='${noteID}' and memo='${TEMP_CONTENT}'`);
        for (const row of rows) {
            await siyuan.deleteBlock(row["id"]);
        }
    }
    private async AddRef(noteID: string, startID: string, endID: string) {
        // ((${startID} "[..]"))
        // \{\{select \* from blocks where id\='${startID}'\}\}
        await siyuan.insertBlockAsChildOf(this.tempContent(`{{{col
((${startID} "[..]"))

...

((${endID} "[..]"))
}}}`), noteID);
    }

    private async gotoBlock(bookID: string, point: number) {
        if (point >= 0) {
            await this.updateBookInfo(bookID, { point });
            await this.saveBooksInfos();
        }
    }

    private async fullfilContent(bookID: string, piece: string[], noteID: string, point: number) {
        const startID = piece[0];
        const endID = piece[piece.length - 1];
        this.updateBookInfo(bookID, {});
        piece.reverse();
        await siyuan.insertBlockAsChildOf(this.tempContent("================================="), noteID);
        await siyuan.insertBlockAsChildOf(this.tempContent(help.getBtns(bookID, noteID, startID, endID, point)), noteID);
        for (const id of piece) {
            const content = await siyuan.getBlockKramdownWithoutID(id, [`memo="${TEMP_CONTENT}"`]);
            await siyuan.insertBlockAsChildOf(content, noteID);
        }
    }

    private async getBook2Learn(bookID?: string): Promise<BookInfo> {
        if (bookID) {
            return this.booksInfo(bookID);
        }
        const infos = this.booksInfos();
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
            return this.booksInfo(miniID);
        }
        return {} as BookInfo;
    }

    // TODO: impl this dialog
    // list all books, remove it or read it, event or rebuild the index
    private async viewAllProgressiveBooks() {
        const id = utils.newID();
        const dialog = new Dialog({
            title: this.plugin.i18n.viewAllProgressiveBooks + "【开发中……】",
            content: `<div class="b3-dialog__content">
                <div id='${id}'></div>
            </div>`,
            width: events.isMobile ? "92vw" : "560px",
            height: "540px",
        });
        dialog.element.querySelector("#" + id).innerHTML = JSON.stringify(this.booksInfos(), null, "<br>");
    }

    onLayoutReady() {
        this.plugin.loadData(STORAGE_BOOKS);
    }
}

export const prog = new Progressive();
