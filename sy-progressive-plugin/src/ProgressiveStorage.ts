import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import * as constants from "./constants";
import { Plugin } from "siyuan";
import * as utils from "../../sy-tomato-plugin/src/libs/utils";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";

export class ProgressiveStorage {
    private plugin: Plugin;

    async onLayoutReady(plugin: Plugin) {
        this.plugin = plugin;
        // load only need once, save many
        await utils.tryFixCfg(this.plugin.name, constants.STORAGE_BOOKS);
        await this.plugin.loadData(constants.STORAGE_BOOKS);
        Object.entries(this.booksInfos()).forEach(([_k, v]) => {
            if (typeof v.autoCard === "string") {
                if (v.autoCard === "yes") v.autoCard = true;
                else v.autoCard = false;
            }
            if (typeof v.ignored === "string") {
                if (v.ignored === "yes") v.ignored = true;
                else v.ignored = false;
            }
        });
    }

    async updateBookInfoTime(docID: string) {
        this.updateBookInfo(docID, {} as any);
    }

    async resetBookReadingPoint(docID: string) {
        this.updateBookInfo(docID, { point: 0 } as any);
    }

    async setIgnoreBook(bookID: string, v?: boolean) {
        if (v === undefined) {
            const info = await this.booksInfo(bookID);
            if (!info.ignored) {
                await this.updateBookInfo(bookID, { ignored: true } as any);
                await siyuan.pushMsg(this.plugin.i18n.msgIgnoreBook);
            } else {
                await this.updateBookInfo(bookID, { ignored: false } as any);
                await siyuan.pushMsg(this.plugin.i18n.msgPushBook);
            }
        } else {
            await this.updateBookInfo(bookID, { ignored: v } as any);
            if (v) {
                await siyuan.pushMsg(this.plugin.i18n.msgIgnoreBook);
            } else {
                await siyuan.pushMsg(this.plugin.i18n.msgPushBook);
            }
        }
    }

    async setShowLastBlock(bookID: string, v: boolean) {
        await this.updateBookInfo(bookID, { showLastBlock: v } as any);
        if (v) {
            await siyuan.pushMsg(tomatoI18n.显示上一分片最后一个内容块);
        } else {
            await siyuan.pushMsg(tomatoI18n.cancel取消 + tomatoI18n.显示上一分片最后一个内容块);
        }
    }

    async disableAutoSplitSentence(bookID: string) {
        await this.updateBookInfo(bookID, { autoSplitSentenceP: false } as any);
        await this.updateBookInfo(bookID, { autoSplitSentenceT: false } as any);
        await this.updateBookInfo(bookID, { autoSplitSentenceI: false } as any);
    }

    async setAutoSplitSentence(bookID: string, v: boolean, t: AsList) {
        const info = await this.booksInfo(bookID);
        info.autoSplitSentenceP = false;
        info.autoSplitSentenceT = false;
        info.autoSplitSentenceI = false;
        if (t == "p") {
            await this.updateBookInfo(bookID, { autoSplitSentenceP: v } as any);
            if (v) {
                await siyuan.pushMsg(tomatoI18n.自动断句 + "P");
            } else {
                await siyuan.pushMsg(tomatoI18n.cancel取消 + tomatoI18n.自动断句 + "P");
            }
        } else if (t == "t") {
            await this.updateBookInfo(bookID, { autoSplitSentenceT: v } as any);
            if (v) {
                await siyuan.pushMsg(tomatoI18n.自动断句 + "T");
            } else {
                await siyuan.pushMsg(tomatoI18n.cancel取消 + tomatoI18n.自动断句 + "T");
            }
        } else if (t == "i") {
            await this.updateBookInfo(bookID, { autoSplitSentenceI: v } as any);
            if (v) {
                await siyuan.pushMsg(tomatoI18n.自动断句 + "I");
            } else {
                await siyuan.pushMsg(tomatoI18n.cancel取消 + tomatoI18n.自动断句 + "I");
            }
        }
    }

    async toggleAutoCard(bookID: string, opt?: boolean) {
        const info = await this.booksInfo(bookID);
        if (typeof opt === "boolean") {
            await this.updateBookInfo(bookID, { autoCard: opt } as any);
        } else {
            if (!info.autoCard) {
                await this.updateBookInfo(bookID, { autoCard: true } as any);
                await siyuan.pushMsg(this.plugin.i18n.msgAutoCard);
            } else {
                await this.updateBookInfo(bookID, { autoCard: false } as any);
                await siyuan.pushMsg(this.plugin.i18n.msgNotAutoCard);
            }
        }
    }

    async setAddingIndex2paragraph(bookID: string, opt: boolean) {
        await this.updateBookInfo(bookID, { addIndex2paragraph: opt } as BookInfo);
        await siyuan.pushMsg(`${tomatoI18n.给分片内段落标上序号}：${opt}`);
    }

    async setFinishDays(bookID: string, opt: number) {
        await this.updateBookInfo(bookID, { finishDays: opt } as BookInfo);
        await siyuan.pushMsg(`${tomatoI18n.计划读完本书的天数}：${opt}`);
    }

    static defaultBookInfo(): BookInfo {
        return {
            time: 0,
            boxID: "",
            point: 0,
            bookID: "",
            ignored: false,
            autoCard: false,
            showLastBlock: false,
            autoSplitSentenceP: false,
            autoSplitSentenceI: false,
            autoSplitSentenceT: false,
            addIndex2paragraph: false,
            finishDays: 0,
            finishTimeSecs: 0,
            finishShowInput: false,
            finishPieceID: "",
            finishIgnore: false,
        }
    }

    async resetBookInfo(docID: string, opt: BookInfo) {
        this.booksInfos()[docID] = opt;
        return this.saveBookInfos();
    }

    private async updateBookInfo(docID: string, opt: BookInfo) {
        if (docID?.length !== "20231218000645-9aaaltd".length) return;

        const info = await this.booksInfo(docID);
        if (typeof opt.addIndex2paragraph === "boolean") info.addIndex2paragraph = opt.addIndex2paragraph;
        if (typeof opt.autoCard === "boolean") info.autoCard = opt.autoCard;
        if (typeof opt.ignored === "boolean") info.ignored = opt.ignored;
        if (typeof opt.showLastBlock === "boolean") info.showLastBlock = opt.showLastBlock;
        if (typeof opt.autoSplitSentenceP === "boolean") info.autoSplitSentenceP = opt.autoSplitSentenceP;
        if (typeof opt.autoSplitSentenceT === "boolean") info.autoSplitSentenceT = opt.autoSplitSentenceT;
        if (typeof opt.autoSplitSentenceI === "boolean") info.autoSplitSentenceI = opt.autoSplitSentenceI;
        if (utils.isValidNumber(opt.point)) info.point = opt.point;
        if (utils.isValidNumber(opt.finishDays)) info.finishDays = opt.finishDays;

        info.time = await siyuan.currentTimeMs();
        this.booksInfos()[docID] = info;
        return this.saveBookInfos();
    }

    async booksInfo(docID: string): Promise<BookInfo> {
        if (!docID) return {} as BookInfo;
        let info = this.booksInfos()[docID];
        if (!info) {
            info = ProgressiveStorage.defaultBookInfo();
            info.bookID = docID;
            info.time = await siyuan.currentTimeMs();
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
        const data = this.plugin.data[constants.STORAGE_BOOKS];
        if (!data || typeof data == "string") {
            this.plugin.data[constants.STORAGE_BOOKS] = {};
        }
        return this.plugin.data[constants.STORAGE_BOOKS];
    }

    async gotoBlock(bookID: string, point: number) {
        if (point >= 0) {
            await this.updateBookInfo(bookID, { point } as any);
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
        let idx: string[][] = this.plugin.data[bookCacheKey(bookID)];
        if (!idx) {
            idx = afterLoad(await this.plugin.loadData(bookID));
            this.plugin.data[bookCacheKey(bookID)] = idx;
        }
        return idx.map(i => i.filter(j => j?.length > 0)).filter(i => i?.length > 0);
    }
}

export const progStorage = new ProgressiveStorage()

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

export function bookCacheKey(bookID: string) {
    return bookID + "_cache";
}
