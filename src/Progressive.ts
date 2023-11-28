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
    private helper: help.Helper;

    onload(plugin: Plugin) {
        Progressive.GLOBAL_THIS["progressive_zZmqus5PtYRi"] = { progressive: this, utils, siyuan, timeUtil, events };
        this.plugin = plugin;
        this.storage = new help.Storage(plugin);
        this.helper = new help.Helper(plugin);
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
    }

    private addMenu(rect?: DOMRect) {
        const menu = new Menu("progressiveMenu");
        menu.addItem({
            icon: "iconAddingBook",
            label: this.plugin.i18n.addProgressiveReading,
            accelerator: "",
            click: async () => {
                this.addProgressiveReadingWithLock();
            }
        });
        menu.addItem({
            icon: "iconEye",
            label: this.plugin.i18n.viewAllProgressiveBooks,
            accelerator: "",
            click: async () => {
                await this.viewAllProgressiveBooks();
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

    private addProgressiveReadingWithLock(bookID?: string) {
        navigator.locks.request(constants.AddProgressiveReadingLock, { ifAvailable: true }, async (lock) => {
            if (lock) {
                await this.addProgressiveReading(bookID);
                await utils.sleep(constants.IndexTime2Wait);
            } else {
                siyuan.pushMsg(this.plugin.i18n.slowDownALittleBit);
            }
        });
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
            siyuan.pushMsg(this.plugin.i18n.maybeBookRemoved.replace("{bookID}", bookID));
            return;
        }
        if (await this.isPiece(bookID)) {
            siyuan.pushMsg(this.plugin.i18n.youFoundAPiece);
            return;
        }
        await this.addProgressiveReadingDialog(bookID, row["content"]);
    }

    private async addProgressiveReadingDialog(bookID: string, bookName: string) {
        const autoCardID = utils.newID();
        const titleSplitID = utils.newID();
        const BlockNumID = utils.newID();
        const LengthSplitID = utils.newID();
        const btnSplitID = utils.newID();
        const statisticDivID = utils.newID();
        const dialog = new Dialog({
            title: this.plugin.i18n.addProgressiveReading,
            content: `<div class="b3-dialog__content">
                <div class="fn__hr"></div>
                <div class="prog-style__id">《${bookName}》</div>
                <div class="fn__hr"></div>
                <div class="prog-style__id" id="${statisticDivID}"></div>
                <div class="fn__hr"></div>
                <span class="prog-style__id">1⃣${this.plugin.i18n.splitByHeadings}</span>
                <input type="checkbox" id="${titleSplitID}" class="prog-style__checkbox"/>
                <div class="fn__hr"></div>
                <div class="prog-style__id">2⃣${this.plugin.i18n.splitByBlockCount}</div>
                <input type="text" id="${BlockNumID}" class="prog-style__input"/>
                <div class="fn__hr"></div>
                <div class="prog-style__id">3⃣${this.plugin.i18n.splitByWordCount}</div>
                <input type="text" id="${LengthSplitID}" class="prog-style__input"/>
                <div class="fn__hr"></div>
                <span class="prog-style__id">${this.plugin.i18n.autoCard}</span>
                <input type="checkbox" id="${autoCardID}" class="prog-style__checkbox"/>
                <div class="fn__hr"></div>
                <button id="${btnSplitID}" class="prog-style__button">${this.plugin.i18n.addOrReaddDoc}</button>
                <div class="fn__hr"></div>
            </div>`,
            width: events.isMobile ? "92vw" : "560px",
            height: "640px",
        });

        const statisticDiv = dialog.element.querySelector("#" + statisticDivID) as HTMLDivElement;
        statisticDiv.innerHTML = "统计中……";
        let contentBlocks: help.WordCountType[] = await siyuan.getChildBlocks(bookID);
        const { wordCount } = await siyuan.getBlocksWordCount([bookID]);
        let headCount = 0;
        for (const block of contentBlocks) {
            if (block.type == "h") headCount++;
        }
        statisticDiv.innerHTML = `
            总字数：${wordCount}<br>
            各级标题数：${headCount}<br>
            总块数：${contentBlocks.length}<br>
            平均每个标题下有：${Math.ceil(contentBlocks.length / headCount)}块<br>
            平均每个块有：${Math.ceil(wordCount / contentBlocks.length)}字`;

        const titleCheckBox = dialog.element.querySelector("#" + titleSplitID) as HTMLInputElement;
        titleCheckBox.checked = true;
        titleCheckBox.addEventListener("change", () => {
            if (titleCheckBox.checked) {
                titleCheckBox.checked = true;
            } else {
                titleCheckBox.checked = false;
            }
        });

        const autoCardBox = dialog.element.querySelector("#" + autoCardID) as HTMLInputElement;
        autoCardBox.checked = true;
        autoCardBox.addEventListener("change", () => {
            if (autoCardBox.checked) {
                autoCardBox.checked = true;
            } else {
                autoCardBox.checked = false;
            }
        });

        const suggestBlockNum = `${Math.ceil(600 / (wordCount / contentBlocks.length))}`;
        const BlockNumInput = dialog.element.querySelector("#" + BlockNumID) as HTMLInputElement;
        BlockNumInput.value = suggestBlockNum;

        const LengthSplitInput = dialog.element.querySelector("#" + LengthSplitID) as HTMLInputElement;
        LengthSplitInput.value = "0";

        const btn = dialog.element.querySelector("#" + btnSplitID) as HTMLButtonElement;
        btn.addEventListener("click", async () => {
            const splitLen = Number(LengthSplitInput.value.trim());
            if (!utils.isValidNumber(splitLen)) {
                LengthSplitInput.value = "0";
                return;
            }

            const blockNumber = Number(BlockNumInput.value.trim());
            if (!utils.isValidNumber(blockNumber)) {
                BlockNumInput.value = suggestBlockNum;
                return;
            }

            dialog.destroy();
            await siyuan.setBlockAttrs(bookID, { "custom-sy-readonly": "true" });

            if (splitLen > 0) {
                contentBlocks = await this.helper.getDocWordCount(contentBlocks);
            }
            let groups: help.WordCountType[][];
            if (titleCheckBox.checked) {
                await siyuan.pushMsg(this.plugin.i18n.splitByHeadings);
                groups = new help.HeadingGroup(contentBlocks).split();
            } else {
                groups = [contentBlocks];
            }
            if (blockNumber > 0) {
                const tmp: help.WordCountType[][] = [];
                for (const group of groups) {
                    tmp.push(...utils.chunks(group, blockNumber));
                }
                groups = tmp;
            }
            if (splitLen > 0) {
                await siyuan.pushMsg(this.plugin.i18n.splitByWordCount + ":" + splitLen);
                groups = new help.ContentLenGroup(groups, splitLen).split();
            }
            await this.storage.saveIndex(bookID, groups);
            await this.storage.resetBookReadingPoint(bookID);
            if (!autoCardBox.checked) {
                await this.storage.toggleAutoCard(bookID, "no");
            } else {
                await this.storage.toggleAutoCard(bookID, "yes");
            }
            setTimeout(async () => {
                await this.viewAllProgressiveBooks();
            }, constants.IndexTime2Wait);
        });
    }

    private async readThisPiece(blockID?: string) {
        if (!blockID) {
            blockID = events.lastBlockID;
        }
        if (await this.isPiece(blockID)) {
            await siyuan.pushMsg(this.plugin.i18n.opsInOriDoc);
            return;
        }
        const row = await siyuan.sqlOne(`select root_id from blocks where id="${blockID}"`);
        if (row) {
            const bookID = row["root_id"];
            const idx = await this.storage.loadBookIndexIfNeeded(bookID);
            if (!idx.length) {
                await siyuan.pushMsg(this.plugin.i18n.addThisDocFirst);
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
                await siyuan.pushMsg(this.plugin.i18n.opsInOriDocOrAddIt);
            }
        } else {
            await siyuan.pushMsg(this.plugin.i18n.cannotFindDocWaitForIndex);
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

    private async isPiece(id: string) {
        const row = await siyuan.sqlOne(`select memo from blocks where id="${id}"`);
        const memo: string = row?.memo ?? "";
        return memo.startsWith(constants.TEMP_CONTENT);
    }

    private async createNote(boxID: string, bookID: string, piece: string[], point: number) {
        let content: string;
        for (const blockID of piece) {
            content = (await siyuan.getBlockMarkdownAndContent(blockID))?.content ?? "";
            content = content.slice(0, 15).replace(/[　\/ ​]+/g, "").trim();
            if (content) break;
        }
        if (!content) content = `[${point}]`;
        else content = `[${point}]` + content;
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
        const row = await siyuan.sqlOne(`select id, path, box from blocks where type='d' and memo='${help.getDocMemo(bookID, point)}'`);
        if (row?.id && row?.path) {
            const [dirStr, file] = utils.dir(row["path"]);
            const dir = await siyuan.readDir(`/data/${row["box"]}${dirStr}`);
            if (dir) {
                for (const f of dir) {
                    if (f.name === file) {
                        return row["id"];
                    }
                }
            }
        }
        return "";
    }

    private async startToLearn(bookID?: string) {
        let noteID = "";
        const bookInfo = await this.getBook2Learn(bookID);
        if (!bookInfo.bookID) {
            siyuan.pushMsg(this.plugin.i18n.AddADocFirst);
            return;
        }
        bookID = bookInfo.bookID;
        const bookIndex = await this.storage.loadBookIndexIfNeeded(bookInfo.bookID);
        const point = (await this.storage.booksInfo(bookInfo.bookID)).point;
        await this.storage.updateBookInfoTime(bookID);
        if (point >= bookIndex.length) {
            await siyuan.pushMsg(this.plugin.i18n.thisIsLastPage);
            return;
        } else if (point < 0) {
            await siyuan.pushMsg(this.plugin.i18n.thisIsFirstPage);
            return;
        }
        const piece = bookIndex[point];
        noteID = await this.findDoc(bookInfo.bookID, point);
        if (noteID) {
            openTab({ app: this.plugin.app, doc: { id: noteID } });
            return;
        }
        noteID = await this.createNote(bookInfo.boxID, bookInfo.bookID, piece, point);
        if (noteID) {
            await this.addReadingBtns(bookID, noteID, point);
            await siyuan.insertBlockAsChildOf(help.tempContent("---"), noteID);
            await this.fullfilContent(bookInfo.bookID, piece, noteID);
            openTab({
                app: this.plugin.app, doc: { id: noteID },
                afterOpen: () => {
                    if (bookInfo.autoCard == "yes") {
                        setTimeout(() => {
                            siyuan.addRiffCards([noteID]);
                        }, 500);
                    }
                }
            });
        } else {
            await siyuan.pushMsg(this.plugin.i18n.FailToNewDoc);
        }
    }

    async htmlBlockReadNextPeice(bookID: string, noteID: string, cbType: HtmlCBType, point: number) {
        navigator.locks.request(constants.StartToLearnLock, { ifAvailable: true }, async (lock) => {
            if (lock) {
                await this.htmlBlockReadNextPeiceInLock(bookID, noteID, cbType, point);
                await utils.sleep(constants.IndexTime2Wait);
            } else {
                siyuan.pushMsg(this.plugin.i18n.slowDownALittleBit);
            }
        });
    }

    private async htmlBlockReadNextPeiceInLock(bookID: string, noteID: string, cbType: HtmlCBType, point: number) {
        switch (cbType) {
            case HtmlCBType.previous:
                await this.storage.gotoBlock(bookID, point - 1);
                await this.startToLearn(bookID);
                this.helper.closeTab(noteID);
                break;
            case HtmlCBType.next:
                await this.storage.gotoBlock(bookID, point + 1);
                await this.startToLearn(bookID);
                this.helper.closeTab(noteID);
                break;
            case HtmlCBType.deleteAndExit:
                await siyuan.removeRiffCards([noteID]);
                await siyuan.removeDocByID(noteID);
                break;
            case HtmlCBType.deleteAndNext:
                await siyuan.removeRiffCards([noteID]);
                await this.storage.gotoBlock(bookID, point + 1);
                await this.startToLearn(bookID);
                await siyuan.removeDocByID(noteID);
                break;
            case HtmlCBType.nextBook:
                await this.startToLearn();
                this.helper.closeTab(noteID);
                break;
            case HtmlCBType.quit:
                this.helper.closeTab(noteID);
                break;
            case HtmlCBType.AddDocCard:
                await siyuan.addRiffCards([noteID]);
                break;
            case HtmlCBType.DelDocCard:
                await siyuan.removeRiffCards([noteID]);
                break;
            case HtmlCBType.ignoreBook:
                await this.storage.toggleIgnoreBook(bookID);
                break;
            case HtmlCBType.fullfilContent:
                {
                    const index = await this.storage.loadBookIndexIfNeeded(bookID);
                    const piece = index[point] ?? [];
                    await siyuan.insertBlockAsChildOf(help.tempContent("---"), noteID);
                    await this.fullfilContent(bookID, piece, noteID);
                }
                break;
            case HtmlCBType.cleanUnchanged:
                await this.cleanNote(noteID);
                await this.addReadingBtns(bookID, noteID, point);
                break;
            case HtmlCBType.openFlashcardTab:
                openTab({ app: this.plugin.app, card: { type: "all" } });
                break;
            default:
                throw "Invalid HtmlCBType " + cbType;
        }
    }

    private rmBadThings(s: string) {
        return s.replace(/[​]+/g, "").trim();
    }

    private async cleanNote(noteID: string) {
        const blocks = await siyuan.getChildBlocks(noteID) ?? [];
        for (const child of blocks) {
            const row = await siyuan.sqlOne(`select memo, ial, markdown from blocks where id="${child.id}"`);
            const memo: string = row?.memo ?? "";
            const ial: string = row?.ial ?? "";
            const markdown: string = row?.markdown ?? "";
            if (memo === constants.TEMP_CONTENT) {
                await siyuan.deleteBlock(child.id);
            } else if (ial.includes(constants.RefIDKey)) {
                for (const attr of ial.split(" ")) {
                    if (attr.includes(constants.RefIDKey)) {
                        const originalID = attr.split("\"")[1]; // custom-progref="20231119150726-2xxypwa"
                        const origin = await siyuan.sqlOne(`select markdown from blocks where id="${originalID}"`);
                        const oriMarkdown = origin?.markdown ?? "";
                        const markdownWithoutStar = markdown.replace(`((${originalID} "*"))`, "");
                        if (this.rmBadThings(oriMarkdown) == this.rmBadThings(markdownWithoutStar)) {
                            await siyuan.deleteBlock(child.id);
                        } else {
                            const attrs: { [key: string]: string } = {};
                            attrs[constants.RefIDKey] = "";
                            await siyuan.setBlockAttrs(child.id, attrs);
                        }
                        break;
                    }
                }
            }
        }
    }

    private addReadingBtns(bookID: string, noteID: string, point: number) {
        return siyuan.insertBlockAsChildOf(help.tempContent(this.helper.getReadingBtns(bookID, noteID, point)), noteID);
    }

    private async fullfilContent(bookID: string, piece: string[], noteID: string) {
        const lute = utils.NewLute();
        this.storage.updateBookInfoTime(bookID);
        for (const id of piece.slice().reverse()) {
            const { dom } = await siyuan.getBlockDOM(id);
            let md = lute.BlockDOM2Md(dom);
            md = help.tryRmIDAddLinkOne(md, id);
            md = `${md}\n{: ${constants.RefIDKey}="${id}"}`;
            await siyuan.insertBlockAsChildOf(md, noteID);
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
            const { time, ignored } = infos[id];
            if (ignored == "yes") continue;
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
            width: events.isMobile ? "92vw" : "860px",
            height: "660px",
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
            help.appendChild(subDiv, "button", this.plugin.i18n.Reading, ["prog-style__button"], () => {
                this.startToLearnWithLock(bookID);
                dialog.destroy();
            });
            help.appendChild(subDiv, "button", this.plugin.i18n.ignoreTxt + ` ${bookInfo.ignored}`, ["prog-style__button"], () => {
                this.storage.toggleIgnoreBook(bookID);
                dialog.destroy();
                this.viewAllProgressiveBooks();
            });
            help.appendChild(subDiv, "button", this.plugin.i18n.autoCard + ` ${bookInfo.autoCard}`, ["prog-style__button"], () => {
                this.storage.toggleAutoCard(bookID);
                dialog.destroy();
                this.viewAllProgressiveBooks();
            });
            help.appendChild(subDiv, "button", this.plugin.i18n.Repiece, ["prog-style__button"], () => {
                this.addProgressiveReadingWithLock(bookID);
                dialog.destroy();
            });
            help.appendChild(subDiv, "button", this.plugin.i18n.Delete, ["prog-style__button"], () => {
                confirm("⚠️", this.plugin.i18n.Delete + " : " + name, async () => {
                    await this.storage.removeIndex(bookID);
                    div.removeChild(subDiv);
                });
            });
        }
    }

    onLayoutReady() { this.storage.onLayoutReady(); }
}

export const prog = new Progressive();
