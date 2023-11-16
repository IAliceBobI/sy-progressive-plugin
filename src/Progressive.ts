import { Dialog, Menu, Plugin, openTab } from "siyuan";
import "./index.scss";
import { events } from "./Events";
import { siyuan, timeUtil } from "./utils";
import * as utils from "./utils";

type WordCountType = { id: string; count: number; type: string; };
type BookInfo = { time?: number, boxID?: string, point?: number, bookID?: string };
type BookInfos = { [key: string]: BookInfo };

const STORAGE_BOOKS = "books.json";
const ViewAllProgressiveBookLock = "ViewAllProgressiveBookLock";
const AddProgressiveReadingLock = "AddProgressiveReadingLock";
const StartToLearnLock = "StartToLearnLock";
const TEMP_CONTENT = "插件管理勿改managedByPluginDoNotModify";

enum HtmlCBType {
    previous,
    skip,
    docCard,
    saveDoc,
    quit,
    nextBook,
}

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
            console.log("cannot find the box of doc " + bookID);
            return;
        }
        const boxID = row["box"];
        const wordCount = await getDocWordCount(bookID);
        let groups = new HeadingGroup(wordCount, 300).split();
        groups = new ContentLenGroup(groups, 600).split();
        await this.plugin.saveData(bookID, { data: preSave(groups) });
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

    private async createNote(boxID: string, bookID: string, firstBlockID: string, point: number) {
        let { content } = await siyuan.getBlockMarkdownAndContent(firstBlockID);
        content = content.slice(0, 15).replace(/\//g, "");
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
        const bookIndex = afterLoad(await this.plugin.loadData(bookInfo.bookID));
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
            noteID = await this.createNote(bookInfo.boxID, bookInfo.bookID, piece[0], point);
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
        await siyuan.insertBlockAsChildOf(this.tempContent(getBtns(bookID, noteID, startID, endID, point)), noteID);
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
        dialog.element.querySelector("#" + id).innerHTML = JSON.stringify(this.booksInfos(), null, "<br>");
    }

    onLayoutReady() {
        this.plugin.loadData(STORAGE_BOOKS);
    }
}

function getBtns(bookID: string, noteID: string, startID: string, endID: string, point: number) {
    const btnStopID = utils.newID();
    const btnNextBookID = utils.newID();
    const btnSkipID = utils.newID();
    const btnPreviousID = utils.newID();
    const btnSaveID = utils.newID();
    const btnSaveCardID = utils.newID();
    return `{{{col
当前第${point}段

<div>
    <div>
        <button onclick="${btnPreviousID}()">保留，回退</button>
    </div>
    <script>
        function ${btnPreviousID}() {
            globalThis.progressive_zZmqus5PtYRi.progressive.htmlBlockReadNextPeice("${bookID}","${noteID}",${HtmlCBType.previous},"${startID}","${endID}",${point})
        }
    </script>
</div>

<div>
    <div>
        <button onclick="${btnSkipID}()">删除，继续</button>
    </div>
    <script>
        function ${btnSkipID}() {
            globalThis.progressive_zZmqus5PtYRi.progressive.htmlBlockReadNextPeice("${bookID}","${noteID}",${HtmlCBType.skip},"${startID}","${endID}",${point})
        }
    </script>
</div>

<div>
    <div>
        <button onclick="${btnSaveCardID}()">制卡，继续</button>
    </div>
    <script>
        function ${btnSaveCardID}() {
            globalThis.progressive_zZmqus5PtYRi.progressive.htmlBlockReadNextPeice("${bookID}","${noteID}",${HtmlCBType.docCard},"${startID}","${endID}",${point})
        }
    </script>
</div>

<div>
    <div>
        <button onclick="${btnSaveID}()">保留，继续</button>
    </div>
    <script>
        function ${btnSaveID}() {
            globalThis.progressive_zZmqus5PtYRi.progressive.htmlBlockReadNextPeice("${bookID}","${noteID}",${HtmlCBType.saveDoc},"${startID}","${endID}",${point})
        }
    </script>
</div>

<div>
    <div>
        <button onclick="${btnStopID}()">删除，退出</button>
    </div>
    <script>
        function ${btnStopID}() {
            globalThis.progressive_zZmqus5PtYRi.progressive.htmlBlockReadNextPeice("${bookID}","${noteID}",${HtmlCBType.quit},"${startID}","${endID}",${point})
        }
    </script>
</div>

<div>
    <div>
        <button onclick="${btnNextBookID}()">删除，换书</button>
    </div>
    <script>
        function ${btnNextBookID}() {
            globalThis.progressive_zZmqus5PtYRi.progressive.htmlBlockReadNextPeice("${bookID}","${noteID}",${HtmlCBType.nextBook},"${startID}","${endID}",${point})
        }
    </script>
</div>
}}}`;
}

function afterLoad(data: any) {
    data = data?.data ?? "";
    const group = [];
    for (const piece of data.split("#")) {
        const tp = [];
        for (const ti of piece.split(",")) {
            tp.push(ti);
        }
        group.push(tp);
    }
    return group;
}

function preSave(groups: WordCountType[][]) {
    const pieces = [];
    for (const group of groups) {
        const parts = [];
        for (const wc of group) {
            parts.push(wc.id);
        }
        pieces.push(parts.join(","));
    }
    return pieces.join("#");
}

class ContentLenGroup {
    private groups: WordCountType[][];
    private accCount: number;
    private maxCount: number;
    private collect: WordCountType[][];
    private list: WordCountType[];
    constructor(groups: WordCountType[][], maxCount: number) {
        this.groups = groups;
        this.accCount = 0;
        this.collect = [];
        this.list = [];
        this.maxCount = maxCount;
    }
    private newList() {
        if (this.list.length > 0) {
            this.collect.push(this.list);
            this.list = [];
        }
    }
    private add(wc: WordCountType) {
        this.list.push(wc);
        this.accCount += wc.count;
        if (this.accCount >= this.maxCount) {
            this.newList();
            this.accCount = 0;
        }
    }
    private splitPiece(wc: WordCountType[]): WordCountType[][] {
        this.collect = [];
        for (const line of wc) {
            this.add(line);
        }
        this.newList();
        return this.collect;
    }
    split() {
        const list = [];
        for (const piece of this.groups) {
            list.push(...this.splitPiece(piece));
        }
        return list;
    }
}

class HeadingGroup {
    private wordCount: WordCountType[];
    private group: WordCountType[][];
    private list: WordCountType[];
    private miniCount: number;
    private count: number;
    constructor(wordCount: WordCountType[], miniCount: number) {
        this.wordCount = wordCount;
        this.group = [];
        this.list = [];
        this.miniCount = miniCount;
        this.count = 0;
    }
    private add(wc: WordCountType) {
        this.getList(wc).push(wc);
        this.count += wc.count;
    }
    private next() {
        if (this.list.length > 0) {
            this.group.push(this.list);
            this.list = [];
            this.count = 0;
        }
    }
    private shouldNext(wc: WordCountType) {
        if (wc.type === "h" && this.count >= this.miniCount) {
            return true;
        }
        return false;
    }
    private getList(wc: WordCountType) {
        if (this.shouldNext(wc)) {
            this.next();
        }
        return this.list;
    }
    split() {
        for (const wc of this.wordCount) {
            this.add(wc);
        }
        this.next();
        return this.group;
    }
}

async function getDocWordCount(docID: string): Promise<WordCountType[]> {
    await siyuan.pushMsg("获取所有子块……");
    const allBlocks: any[] = await siyuan.getChildBlocks(docID);

    const size = 300
    const groups = [];
    while (allBlocks.length > 0) {
        groups.push(allBlocks.splice(0, size));
    }

    await siyuan.pushMsg("开始统计字数……");
    let iter = 0;
    const content = [];
    for (const group of groups) {
        const tasks = [];
        for (const { id } of group) {
            tasks.push(siyuan.getBlocksWordCount([id]));
        }
        const rets = await Promise.all(tasks);
        let i = 0;
        for (const { id, type } of group) {
            const { wordCount } = rets[i++];
            const count = wordCount;
            content.push({ id, count, type });
        }
        iter += size;
        await siyuan.pushMsg(`已经统计了${iter}个块……`, 3000);
    }
    await siyuan.pushMsg("统计字数结束……");
    return content;
}

export const prog = new Progressive();
