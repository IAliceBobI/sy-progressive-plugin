import { siyuan } from "./utils";
import * as utils from "./utils";
import * as constants from "./constants";
import { Plugin } from "siyuan";

export type WordCountType = { id: string; count: number; type: string; };
export type BookInfo = { time?: number, boxID?: string, point?: number, bookID?: string, ignored?: string };
export type BookInfos = { [key: string]: BookInfo };

export enum HtmlCBType {
    previous,
    skip,
    docCard,
    saveDoc,
    quit,
    nextBook,
    next,
    ignoreBook,
    fullfilContent,
    cleanUnchanged,
}

export class Storage {
    private plugin: Plugin;

    constructor(plugin: Plugin) {
        this.plugin = plugin;
    }

    onLayoutReady() {
        // load only need once, save many
        this.plugin.loadData(constants.STORAGE_BOOKS);
    }

    async updateBookInfoTime(docID: string) {
        this.updateBookInfo(docID, {});
    }

    async resetBookReadingPoint(docID: string) {
        this.updateBookInfo(docID, { point: 0 });
    }

    async ignoreBook(bookID: string, i = true) {
        if (i)
            this.updateBookInfo(bookID, { ignored: "yes" });
        else
            this.updateBookInfo(bookID, { ignored: "no" });
    }

    private async updateBookInfo(docID: string, opt: BookInfo) {
        const info = await this.booksInfo(docID);
        info.time = await siyuan.currentTimeMs();
        if (opt.ignored) info.ignored = opt.ignored;
        if (opt.bookID) info.bookID = opt.bookID;
        if (utils.isValidNumber(opt.point)) info.point = opt.point;
        this.booksInfos()[docID] = info;
        return this.saveBookInfos();
    }

    async booksInfo(docID: string) {
        let info = this.booksInfos()[docID];
        if (!info) {
            info = { point: 0, bookID: docID, time: await siyuan.currentTimeMs(), ignored: "no" };
            this.booksInfos()[docID] = info;
        }
        if (!info.boxID) {
            const row = await siyuan.sqlOne(`select box from blocks where id="${docID}"`);
            if (!row) {
                siyuan.pushMsg(this.plugin.i18n.cannotFindTheBoxs + docID); // maybe the index is building
                info.boxID = "";
            } else {
                info.boxID = row["box"];
            }
            this.booksInfos()[docID] = info;
        }
        return info;
    }

    booksInfos(): BookInfos {
        if (!this.plugin.data[constants.STORAGE_BOOKS])
            this.plugin.data[constants.STORAGE_BOOKS] = {};
        return this.plugin.data[constants.STORAGE_BOOKS];
    }

    async gotoBlock(bookID: string, point: number) {
        if (point >= 0) {
            await this.updateBookInfo(bookID, { point });
        }
    }

    async saveIndex(bookID: string, groups: WordCountType[][]) {
        const [ng, data] = preSave(groups);
        await this.plugin.saveData(bookID, { data });
        this.plugin.data[bookCacheKey(bookID)] = ng;
    }

    private async saveBookInfos() {
        return this.plugin.saveData(constants.STORAGE_BOOKS, this.booksInfos());
    }

    async removeIndex(bookID: string) {
        delete this.booksInfos()[bookID];
        delete this.booksInfos()[bookCacheKey(bookID)];
        await this.saveBookInfos();
        return this.plugin.removeData(bookID);
    }

    async loadBookIndexIfNeeded(bookID: string): Promise<string[][]> {
        let idx = this.plugin.data[bookCacheKey(bookID)];
        if (!idx) {
            idx = afterLoad(await this.plugin.loadData(bookID));
            this.plugin.data[bookCacheKey(bookID)] = idx;
        }
        return idx;
    }
}

export function bookCacheKey(bookID: string) {
    return bookID + "_cache";
}

export function tempContent(content: string) {
    return content + `\n{: memo="${constants.TEMP_CONTENT}"}`;
}

export function getDocMemo(bookID: string, point: number) {
    return `${constants.TEMP_CONTENT}#${bookID},${point}`;
}

function styleColor(bgcolor: string, color: string) {
    return `<style>button{display: inline-block; padding: 10px 20px; background-color: ${bgcolor}; color: ${color}; text-align: center; text-decoration: none; font-size: 16px; border: none; border-radius: 4px; cursor: pointer;}button.large { padding: 12px 24px; font-size: 24px; }button.small { padding: 8px 16px; font-size: 14px; }</style>`;
}

function btnFullfilContent(bookID: string, noteID: string, point: number) {
    const btnFullfilContentID = utils.newID().slice(0, constants.IDLen);
    return `<div>
            ${styleColor("rgb(95, 99, 102)", "#000000")}
            <div>
                <button onclick="${btnFullfilContentID}()" id="btn${btnFullfilContentID}">插入原文</button>
            </div>
            <script>
                function ${btnFullfilContentID}() {
                    globalThis.progressive_zZmqus5PtYRi.progressive.htmlBlockReadNextPeice("${bookID}","${noteID}",${HtmlCBType.fullfilContent},${point})
                }
            </script>
        </div>`;
}

function btnCleanUnchanged(bookID: string, noteID: string, point: number) {
    const btnCleanUnchangedID = utils.newID().slice(0, constants.IDLen);
    return `<div>
            ${styleColor("rbg(13, 101, 178)", "#000000")}
            <div>
                <button onclick="${btnCleanUnchangedID}()" id="btn${btnCleanUnchangedID}">清理未改原文</button>
            </div>
            <script>
                function ${btnCleanUnchangedID}() {
                    globalThis.progressive_zZmqus5PtYRi.progressive.htmlBlockReadNextPeice("${bookID}","${noteID}",${HtmlCBType.cleanUnchanged},${point})
                }
            </script>
        </div>`;
}

function btnPrevious(bookID: string, noteID: string, point: number) {
    const btnPreviousID = utils.newID().slice(0, constants.IDLen);
    return `<div>
            ${styleColor("#00FF00", "#000000")}
            <div>
                <button onclick="${btnPreviousID}()" id="btn${btnPreviousID}">上一分片</button>
            </div>
            <script>
                function ${btnPreviousID}() {
                    globalThis.progressive_zZmqus5PtYRi.progressive.htmlBlockReadNextPeice("${bookID}","${noteID}",${HtmlCBType.previous},${point})
                }
            </script>
        </div>`;
}

function btnSaveDoc(bookID: string, noteID: string, point: number) {
    const btnSaveID = utils.newID().slice(0, constants.IDLen);
    return `<div>
            ${styleColor("#0000FF", "#FFFFFF")}
            <div>
                <button onclick="${btnSaveID}()" id="btn${btnSaveID}">保存继续</button>
            </div>
            <script>
                function ${btnSaveID}() {
                    globalThis.progressive_zZmqus5PtYRi.progressive.htmlBlockReadNextPeice("${bookID}","${noteID}",${HtmlCBType.saveDoc},${point})
                }
            </script>
        </div>`;
}

function btnNext(bookID: string, noteID: string, point: number) {
    const btnNextID = utils.newID().slice(0, constants.IDLen);
    return `<div>
            ${styleColor("rgb(18, 59, 94)", "#FFFFFF")}
            <div>
                <button onclick="${btnNextID}()" id="btn${btnNextID}">下一分片</button>
            </div>
            <script>
                function ${btnNextID}() {
                    globalThis.progressive_zZmqus5PtYRi.progressive.htmlBlockReadNextPeice("${bookID}","${noteID}",${HtmlCBType.next},${point})
                }
            </script>
        </div>`;
}

export function getReviewBtns(bookID: string, noteID: string, point: number) {
    return `{{{col
[${point}]

${btnPrevious(bookID, noteID, point)}

${btnFullfilContent(bookID, noteID, point)}

${btnCleanUnchanged(bookID, noteID, point)}

${btnNext(bookID, noteID, point)}
}}}`;
}

export function getReadingBtns(bookID: string, noteID: string, point: number) {
    const btnSkipID = utils.newID().slice(0, constants.IDLen);
    const btnSaveCardID = utils.newID().slice(0, constants.IDLen);
    const btnStopID = utils.newID().slice(0, constants.IDLen);
    const btnNextBookID = utils.newID().slice(0, constants.IDLen);
    const btnIgnoreBookID = utils.newID().slice(0, constants.IDLen);
    return `{{{col
[${point}]

${btnPrevious(bookID, noteID, point)}

<div>
    ${styleColor("#FF0000", "#FFFFFF")}
    <div>
        <button onclick="${btnSkipID}()" id="btn${btnSkipID}">删除</button>
    </div>
    <script>
        function ${btnSkipID}() {
            globalThis.progressive_zZmqus5PtYRi.progressive.htmlBlockReadNextPeice("${bookID}","${noteID}",${HtmlCBType.skip},${point})
        }
    </script>
</div>

<div>
    ${styleColor("#FFFF00", "#000000")}
<div>
<button onclick="${btnSaveCardID}()" id="btn${btnSaveCardID}">文档制卡</button>
</div>
<script>
function ${btnSaveCardID}() {
    globalThis.progressive_zZmqus5PtYRi.progressive.htmlBlockReadNextPeice("${bookID}","${noteID}",${HtmlCBType.docCard},${point})
}
</script>
</div>

${btnSaveDoc(bookID, noteID, point)}

<div>
    ${styleColor("#FF00FF", "#FFFFFF")}
    <div>
        <button onclick="${btnStopID}()" id="btn${btnStopID}">退出</button>
    </div>
    <script>
        function ${btnStopID}() {
            globalThis.progressive_zZmqus5PtYRi.progressive.htmlBlockReadNextPeice("${bookID}","${noteID}",${HtmlCBType.quit},${point})
        }
    </script>
</div>

<div>
    ${styleColor("#00FFFF", "#000000")}
    <div>
        <button onclick="${btnNextBookID}()" id="btn${btnNextBookID}">换书</button>
    </div>
    <script>
        function ${btnNextBookID}() {
            globalThis.progressive_zZmqus5PtYRi.progressive.htmlBlockReadNextPeice("${bookID}","${noteID}",${HtmlCBType.nextBook},${point})
        }
    </script>
</div>

<div>
    ${styleColor("rgb(76, 108, 136)", "#FFFFFF")}
    <div>
        <button onclick="${btnIgnoreBookID}()" id="btn${btnIgnoreBookID}">忽略本书</button>
    </div>
    <script>
        function ${btnIgnoreBookID}() {
            globalThis.progressive_zZmqus5PtYRi.progressive.htmlBlockReadNextPeice("${bookID}","${noteID}",${HtmlCBType.ignoreBook},${point})
        }
    </script>
</div>
}}}`;
}

export function afterLoad(data: any): string[][] {
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

export function preSave(groups: WordCountType[][]) {
    const pieces = [];
    const newGroups = [];
    for (const group of groups) {
        const parts = [];
        for (const wc of group) {
            parts.push(wc.id);
        }
        pieces.push(parts.join(","));
        newGroups.push(parts);
    }
    return [newGroups, pieces.join("#")];
}

export class ContentLenGroup {
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
        if (wc.type !== "h") this.accCount += wc.count;
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

export class HeadingGroup {
    private wordCount: WordCountType[];
    private group: WordCountType[][];
    private list: WordCountType[];
    private lastType: string;
    constructor(wordCount: WordCountType[]) {
        this.wordCount = wordCount;
        this.group = [];
        this.list = [];
    }
    private add(wc: WordCountType) {
        this.getList(wc).push(wc);
        this.lastType = wc.type;
    }
    private next() {
        if (this.list.length > 0) {
            this.group.push(this.list);
            this.list = [];
        }
    }
    private shouldNext(wc: WordCountType) {
        if (wc.type === "h" && this.lastType != "h") {
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

export async function getDocWordCount(docID: string): Promise<WordCountType[]> {
    await siyuan.pushMsg("获取所有子块……", 3000);
    const allBlocks: any[] = await siyuan.getChildBlocks(docID);

    const size = 300;
    const groups = [];
    while (allBlocks.length > 0) {
        groups.push(allBlocks.splice(0, size));
    }

    await siyuan.pushMsg("开始统计字数……", 3000);
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
        iter += i;
        await siyuan.pushMsg(`已经统计了${iter}个块……`, 3000);
    }
    await siyuan.pushMsg("统计字数结束……", 3000);
    return content;
}

export function appendChild(parent: HTMLElement, type: string, textContent: string, classList: string[], click?: any) {
    const elem = document.createElement(type);
    elem.textContent = textContent;
    parent.appendChild(elem);
    for (const cls of classList) if (cls) elem.classList.add(cls);
    if (click) elem.addEventListener("click", click);
    return elem;
}

//-----------------------------------------------------------------------------------------

export async function AddRef(noteID: string, startID: string, endID: string) {
    // ((${startID} "[..]"))
    // \{\{select \* from blocks where id\='${startID}'\}\}
    await siyuan.insertBlockAsChildOf(tempContent(`{{{col
((${startID} "[..]"))

...

((${endID} "[..]"))
}}}`), noteID);
}

export function setBtnsSetStyleLoop() {
    const interval = setInterval(setBtnsSetStyle, 1000);
    setTimeout(() => {
        clearInterval(interval);
    }, 1000 * 30);
}

function setBtnsSetStyle() {
    for (const protyle of document.querySelectorAll("protyle-html")) {
        const button = protyle?.shadowRoot?.querySelector("button");
        if (button) {
            const id = button.id ?? "";
            if (id.length === constants.IDLen + 3 && id.startsWith("btnID")) {
                // Add the styles to the button
                button.style.display = "inline-block";
                button.style.padding = "10px 20px";
                button.style.backgroundColor = "#4CAF50";
                button.style.color = "white";
                button.style.textAlign = "center";
                button.style.textDecoration = "none";
                button.style.fontSize = "16px";
                button.style.border = "none";
                button.style.borderRadius = "4px";
                button.style.cursor = "pointer";

                // Add hover styles
                button.addEventListener("mouseover", function () {
                    button.style.backgroundColor = "#45a049";
                });

                // Add active styles
                button.addEventListener("mousedown", function () {
                    button.style.backgroundColor = "#3e8e41";
                });

                // Add the "large" class styles
                button.classList.add("large");
                button.style.padding = "12px 24px";
                button.style.fontSize = "24px";

                // Add the "small" class styles
                button.classList.add("small");
                button.style.padding = "8px 16px";
                button.style.fontSize = "14px";
            }
        }
    }
}