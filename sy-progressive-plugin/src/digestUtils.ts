import { IProtyle, Lute, Plugin } from "siyuan";
import { BlockNodeEnum, DATA_NODE_ID, DATA_NODE_INDEX, DATA_TYPE, IN_BOOK_INDEX, PARAGRAPH_INDEX, PDIGEST_CTIME, PDIGEST_INDEX, PDIGEST_LAST_ID, PROG_ORIGIN_TEXT, RefIDKey, TEMP_CONTENT } from "../../sy-tomato-plugin/src/libs/gconst";
import { cleanDiv, get_siyuan_lnk_md, getContenteditableElement, NewNodeID, parseIAL, replaceAll, set_href, addCardSetDueTime, siyuan, getAllContentEditableText, getAllText } from "../../sy-tomato-plugin/src/libs/utils";
import { getHPathByDocID, getTraceDoc } from "./helper";
import { getBookID } from "../../sy-tomato-plugin/src/libs/progressive";
import { digestProgressiveBox } from "./DigestProgressiveBox";
import { spliyBy } from "./SplitSentence";
import { isMultiLineElement, SingleTab } from "../../sy-tomato-plugin/src/libs/docUtils";
import { events } from "../../sy-tomato-plugin/src/libs/Events";
import { digest2dailycard, digest2Trace, flashcardUseLink, windowOpenStyle } from "../../sy-tomato-plugin/src/libs/stores";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import { getDailyPath } from "./FlashBox";
import { lastVerifyResult } from "../../sy-tomato-plugin/src/libs/user";

async function addPlusLnk(selected: HTMLElement[], digestID: string, lute: Lute) {
    const div = selected[selected.length - 1];
    const edit = getContenteditableElement(div);
    if (edit) {
        const span = edit.appendChild(document.createElement("span")) as HTMLElement;
        set_href(span, digestID, "+");
        return siyuan.safeUpdateBlock(div.getAttribute(DATA_NODE_ID), lute.BlockDOM2Md(div.outerHTML));
    }
}

async function changeBG(div: HTMLElement) {
    div.style.backgroundColor = "var(--b3-font-background11)";
    const attrs = { "style": "background-color: var(--b3-font-background11);" } as AttrType;
    return siyuan.setBlockAttrs(div.getAttribute(DATA_NODE_ID), attrs);
}

function genSQL(bookID: string, name: string, and: string, order: string) {
    return `select root_id from attributes 
        where name="${name}" 
        and value like "${bookID}#%" 
        and ${and} order by value ${order} limit 1`;
}

export class DigestBuilder {
    protyle: IProtyle;
    element: HTMLElement;
    selected: HTMLElement[] = [];
    docID: string;
    docName: string;
    boxID: string;
    ids: string[];
    anchorID: string;
    plugin: Plugin;
    ctime: string;
    cardMode: string;
    bookID: string;
    allText: string;
    otab: SingleTab;
    attrs: AttrType;
    settings: TomatoSettings;

    async init() {
        this.allText = getAllText(this.selected);
        this.ctime = this.element.getAttribute(PDIGEST_CTIME);

        const fallbackID = this.element.getAttribute(PDIGEST_LAST_ID);
        if (fallbackID) this.anchorID = fallbackID;

        let { bookID } = await getBookID(this.docID);
        if (!bookID) bookID = this.docID;
        this.bookID = bookID;

        this.attrs = await siyuan.getBlockAttrs(this.bookID);
        this.cardMode = this.attrs["custom-book-single-card"] ?? "1";
    }

    async getDigest(bIdx: string, ctime: string, arrow: string, order: string) {
        if (bIdx) {
            const row = await siyuan.sqlAttr(genSQL(this.bookID, PDIGEST_INDEX, `value ${arrow} "${bIdx}"`, order));
            if (row.length > 0) return row[0]?.root_id;

        }
        if (ctime) {
            const row = await siyuan.sqlAttr(genSQL(this.bookID, PDIGEST_CTIME, `value ${arrow} "${ctime}"`, order));
            if (row.length > 0) return row[0]?.root_id;
        }
        const row = await siyuan.sqlAttr(`select root_id from attributes where name="${PDIGEST_CTIME}"
            and value like "${this.bookID}#%" order by value desc limit 1`);
        if (row.length > 0) return row[0]?.root_id;
    }

    async saveCardMode() {
        const newAttrs = {} as AttrType;
        newAttrs["custom-book-single-card"] = this.cardMode;
        if (this.cardMode == "0") {
            siyuan.pushMsg(tomatoI18n.摘抄不加入闪卡);
        } else if (this.cardMode == "1") {
            siyuan.pushMsg(tomatoI18n.只有最新的一个摘抄加入闪卡);
        } else {
            siyuan.pushMsg(tomatoI18n.每个摘抄都加入闪卡);
        }
        await siyuan.setBlockAttrs(this.bookID, newAttrs);
    }

    private async setDigestCard(digestID: string) {
        if (digest2dailycard.get() && lastVerifyResult()) {
            addCardSetDueTime(digestID)
        } else {
            if (this.cardMode == "0") {
                return;
            } else if (this.cardMode == "1") {
                const row = await siyuan.sqlOne(`SELECT a.id FROM blocks a
                    INNER JOIN (
                        SELECT hpath,content
                        FROM blocks
                        WHERE type='d'
                        AND id ='${this.bookID}'
                    ) b ON a.hpath = b.hpath || '/digest-' || b.content
                WHERE a.type='d' limit 1`);
                if (row?.id) {
                    const cards = await siyuan.getTreeRiffCardsAll(row.id);
                    await siyuan.removeRiffCards(cards.map(card => card.id));
                }
            }
            addCardSetDueTime(digestID)
        }
    }

    async finishDigest() {
        const digestID = this.docID;
        await siyuan.removeRiffCards([digestID]);
        await siyuan.setBlockAttrs(digestID, { "custom-pdigest-ctime": "🔨#" + this.ctime } as AttrType);
        await siyuan.renameDocByID(digestID, "🔨" + this.docName);
        const rows = await siyuan.sqlAttr(`select block_id from attributes where 
            name="${PDIGEST_CTIME}" 
            and value like "${this.bookID}#%"
            and value<"${this.ctime}" 
            and block_id!="${digestID}"
            order by value desc limit 1`);
        if (await this.tryOpen(rows)) return;
        const latestRows = await siyuan.sqlAttr(`select block_id from attributes where 
            name="${PDIGEST_CTIME}" 
            and value like "${this.bookID}#%"
            and block_id!="${digestID}"
            order by value desc limit 1`);
        if (await this.tryOpen(latestRows)) return;
        await this.otab.open(this.anchorID);
    }

    async cleanDigest() {
        const rows = await siyuan.sqlAttr(`select block_id from attributes where name="${PDIGEST_CTIME}" and value like "🔨#${this.bookID}#%" limit 1000000`);
        for (const row of rows) await siyuan.removeDocByID(row.block_id);
    }

    async gotoDigest(arrow: string, order: string) {
        const docAttrs = await siyuan.getBlockAttrs(this.docID);
        const bIdx = docAttrs["custom-pdigest-index"];
        const ctime = docAttrs["custom-pdigest-ctime"];
        const id = await this.getDigest(bIdx, ctime, arrow, order);
        await this.otab.open(id);
    }

    async getDigestLnk(open = true) {
        const taskContents = siyuan.getChildBlocks(this.bookID)
            .then(async rows => {
                const rs = await siyuan.getRows(rows.filter(i => i.type == 'h').map(i => i.id), "markdown", true);
                const map = new Map(rs.map(r => [r.id, r.markdown]))
                return rows.map(r => {
                    return { id: r.id, type: r.type, content: map.get(r.id) }
                })
            });

        const taskTraceID = getHPathByDocID(this.bookID, "trace")
            .then(hpath => getTraceDoc(this.bookID, this.boxID, hpath))
            .then(async traceID => {
                await siyuan.clearAll(traceID);
                return traceID
            });

        const rows = await siyuan.sql(`select ial,content,id from blocks where id = "${this.bookID}" or id in 
            (select block_id from attributes where name="${PDIGEST_CTIME}" and value like "${this.bookID}#%" limit 1000000)`);
        if (rows.length <= 1) return;

        const [attrMap, parents] = rows.map(r => {
            const a = parseIAL(r.ial);
            a.title = r.content;
            a.id = r.id;
            return a;
        }).reduce(([a, p], attr) => {
            a.set(attr.id, attr);
            p.add(attr["custom-pdigest-parent-id"]);
            return [a, p];
        }, [new Map<string, AttrType>(), new Set<string>()]);

        const bookName = attrMap.get(this.bookID).title;

        const leaves = [...attrMap.keys()].reduce((l, id) => {
            if (!parents.has(id) && id != this.bookID) l.push(attrMap.get(id));
            return l;
        }, [] as AttrType[]).sort((a, b) => -a["custom-pdigest-ctime"].localeCompare(b["custom-pdigest-ctime"]));

        const lines = leaves.map(leave => {
            const lnk: AttrType[] = [];
            lnk.push(leave);
            do {
                if (leave["custom-pdigest-parent-id"] == this.bookID) break;
                leave = attrMap.get(leave["custom-pdigest-parent-id"]);
                if (leave) lnk.push(leave);
            } while (leave);
            return lnk;
        }).map(list => {
            const line: string[] = [];
            for (const attr of list) line.push(get_siyuan_lnk_md(attr.id, attr.title));
            line.push(get_siyuan_lnk_md(this.bookID, bookName));
            const lnk = `${line.join(" -> ")}\n{: id="${NewNodeID()}"}\n{: id="${NewNodeID()}"}`;
            return { lnk, id: list[0]["custom-pdigest-last-id"] };
        });

        const extContents = (await taskContents).map(c => {
            const list = [];
            if (c.type == "h") list.push(`${c.content}${get_siyuan_lnk_md(c.id, "   .   ")}`);
            list.push(...lines.filter(i => i.id == c.id).map(l => l.lnk))
            return list;
        }).flat();
        const traceID = await taskTraceID;
        await siyuan.insertBlockAsChildOf(`{{{row\n${extContents.join("\n")}\n}}}`, traceID);
        if (open) await this.otab.open(traceID);
    }

    private async getDigestDocID() {
        if (digest2dailycard.get() && lastVerifyResult()) {
            return getDailyPath().split("/").slice(0, -1).join("/")
        } else {
            return getHPathByDocID(this.bookID, "digest");
        }
    }

    private async newDigestDoc(idx: string, md: string) {
        const hpath = await this.getDigestDocID();
        const attr = {} as AttrType;
        const ct = new Date().getTime();
        attr["custom-pdigest-index"] = `${this.bookID}#${idx.padStart(10, "0")}`;
        attr["custom-pdigest-parent-id"] = this.docID;
        attr["custom-pdigest-last-id"] = this.anchorID;
        attr["custom-pdigest-ctime"] = `${this.bookID}#${ct}`;
        attr["custom-card-priority"] = "60";
        attr["custom-off-tomatobacklink"] = "1";
        attr["custom-progmark"] = `${TEMP_CONTENT}#${this.bookID},${ct}`;
        const digestID = await siyuan.createDocWithMd(this.boxID, `${hpath}/[${idx}]${this.allText.slice(0, 10)}`, md, "", attr);
        return digestID;
    }

    async digest(split = false) {
        const { idx, md } = await getDigestMd(this.settings, this.selected, this.protyle, split, true, false, this.attrs);
        if (md.length == 0) return;
        const digestID = await this.newDigestDoc(idx, md.join("\n"));
        await this.otab.open(digestID, windowOpenStyle.get() as any);
        await this.setDigestCard(digestID);
        if (digestProgressiveBox.settings.markOriginText && !(await events.isDocReadonly(this.protyle, this.attrs))) {
            addPlusLnk(this.selected, digestID, digestProgressiveBox.lute);
        }
        if (digest2Trace.get() && lastVerifyResult()) {
            setTimeout(() => {
                this.getDigestLnk(false);
            }, 4000);
        }
    }

    async tryOpen(rows: Attributes[]) {
        if (rows.length > 0) {
            await siyuan.addRiffCards([rows[0].block_id]);
            await this.otab.open(rows[0].block_id);
            return true;
        }
        return false;
    }
}

export async function getDigestMd(settings: TomatoSettings, selected: HTMLElement[], protyle: IProtyle, split: boolean, ref = true, checkbox = false, attrs?: AttrType) {
    const md: string[] = [];
    if (selected == null || selected.length == 0) return { idx: "0", md };
    let idx: string;
    let i = 0;
    for (const div of selected) {
        let inBookIdx = div.getAttribute(IN_BOOK_INDEX);
        if (!inBookIdx) inBookIdx = div.getAttribute(DATA_NODE_INDEX);

        let originID = div.getAttribute(RefIDKey);
        if (!originID) originID = div.getAttribute(DATA_NODE_ID);

        if (!idx) idx = inBookIdx;

        const cloned = div.cloneNode(true) as HTMLDivElement;
        // cloned.querySelectorAll(`div[${CONTENT_EDITABLE}="false"]`).forEach(e => e.setAttribute(CONTENT_EDITABLE, "true"));
        // const mOri = digestProgressiveBox.lute.BlockDOM2Md(cloned.outerHTML);

        if (digestProgressiveBox.settings.markOriginTextBG && !(await events.isDocReadonly(protyle, attrs))) changeBG(div);

        await cleanDiv(cloned,
            !digestProgressiveBox.settings.digestNoBacktraceLink, // ref
            !digestProgressiveBox.settings.digestNoBacktraceLink, // ori
            settings.flashcardMultipleLnks, // more
            true, // ctx
            flashcardUseLink.get(), // lnk
        );
        cloned.setAttribute(RefIDKey, originID);
        cloned.setAttribute(IN_BOOK_INDEX, inBookIdx);
        cloned.setAttribute(PARAGRAPH_INDEX, String(i));
        cloned.setAttribute(PROG_ORIGIN_TEXT, "1");
        cloned.style.backgroundColor = "";

        const m = digestProgressiveBox.lute.BlockDOM2Md(cloned.outerHTML).trim();
        if (!split || cloned.getAttribute(DATA_TYPE) === BlockNodeEnum.NODE_LIST || isMultiLineElement(m)) {
            md.push(m);
        } else {
            const parts = m.trim().split("\n");
            const attrLine = parts.pop();
            const edit = getAllContentEditableText(cloned, "\n");
            let ps = [edit];
            for (const s of "\n。！？；：") ps = spliyBy(ps, s);
            // ps = spliyBy(ps, ". ");
            // ps = spliyBy(ps, ": ");
            ps = spliyBy(ps, "……");
            ps = spliyBy(ps, "! ");
            ps = spliyBy(ps, "? ");
            ps = spliyBy(ps, "; ");
            ps.map(p => replaceAll(p, "\u200b", "").trim())
                .filter(p => !!p)
                .filter(p => p != "@")
                .filter(p => p != "*")
                .filter(p => p != "@*")
                .filter(p => p != "*@")
                .forEach(p => {
                    if (ref) {
                        md.push(`${p}${get_siyuan_lnk_md(originID, "  *  ", digestProgressiveBox.settings.digestNoBacktraceLink)}\n${attrLine}`);
                    } else {
                        if (checkbox) {
                            md.push(`* [ ] ${p}\n${attrLine}`);
                        } else {
                            md.push(`${p}\n${attrLine}`);
                        }
                    }
                });
        }
        i++;
    }
    if (!idx) idx = "0";
    return { idx, md };
}