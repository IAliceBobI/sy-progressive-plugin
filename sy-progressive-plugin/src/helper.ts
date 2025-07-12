import { BlockNodeEnum, CONTENT_EDITABLE, DATA_NODE_ID, DATA_TYPE, IN_BOOK_INDEX, MarkKey, PARAGRAPH_INDEX, PROG_ORIGIN_TEXT, PROG_PIECE_PREVIOUS, RefIDKey, TEMP_CONTENT } from "../../sy-tomato-plugin/src/libs/gconst";
import { addCardSetDueTime, siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import * as utils from "../../sy-tomato-plugin/src/libs/utils";
import { IProtyle } from "siyuan";
import { progStorage } from "./ProgressiveStorage";
import { getReadingBtns1, getReadingBtns2, getReadingBtns3 } from "./ProgressiveBtn";
import { isMultiLineElement } from "../../sy-tomato-plugin/src/libs/docUtils";
import { lastVerifyResult } from "../../sy-tomato-plugin/src/libs/user";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import { SplitSentence } from "./SplitSentence";
import { prog } from "./Progressive";

export function tempContent(content: string, id?: string) { // for btns and split lines
    if (!id) return content + `\n{: ${MarkKey}="${TEMP_CONTENT}"}`;
    else return content + `\n{: id="${id}" ${MarkKey}="${TEMP_CONTENT}"}`;
}

export function getDocIalPieces(bookID: string, point: number) {
    return `${TEMP_CONTENT}#${bookID},${point}`;
}

export function getDocIalContents(bookID: string) {
    return `contents#${TEMP_CONTENT}#${bookID}`;
}

export function getDocIalCards(bookID: string) {
    return `cards#${TEMP_CONTENT}#${bookID}`;
}

export function getDocIalWords(bookID: string) {
    return `words#${TEMP_CONTENT}#${bookID}`;
}

export function getDocIalSummary(bookID: string) {
    return `summary#${TEMP_CONTENT}#${bookID}`;
}

export function getDocIalAllInOneKey(bookID: string) {
    return `allInOneKeysDoc#${TEMP_CONTENT}#${bookID}`;
}

export function getDocIalNewBookKey(bookID: string) {
    return `newBookDoc#${TEMP_CONTENT}#${bookID}`;
}

export function getDocIaltrace(bookID: string) {
    return `traceDoc#${TEMP_CONTENT}#${bookID}`;
}

export function getDocIalKeysDoc(bookID: string, point: number) {
    return `keysDoc#${TEMP_CONTENT}#${bookID},${point}`;
}

export function getDocIalCompareDoc(bookID: string, point: number) {
    return `compareDoc#${TEMP_CONTENT}#${bookID},${point}`;
}

export async function getHPathByDocID(docID: string, prefix: string) {
    const row = await siyuan.sqlOne(`select hpath from blocks where id = "${docID}"`);
    let path = row?.hpath ?? "";
    if (!path) return "";
    const parts = path.split("/");
    const docName = parts.pop();
    const cardDocName = prefix + "-" + docName;
    parts.push(docName);
    parts.push(cardDocName);
    path = parts.join("/");
    return path;
}

export async function getWordsDoc(bookID: string, boxID: string, hpath: string) {
    const id = await findWords(bookID);
    if (id) return id;
    const attr = {};
    attr[MarkKey] = getDocIalWords(bookID);
    const targetDocID = await utils.siyuanCache.createDocWithMdIfNotExists(5000, boxID, hpath, "", attr);
    return targetDocID;
}

export async function getCardsDoc(bookID: string, boxID: string, hpath: string) {
    const id = await findCards(bookID);
    if (id) return id;
    const attr = {};
    attr[MarkKey] = getDocIalCards(bookID);
    const targetDocID = await utils.siyuanCache.createDocWithMdIfNotExists(5000, boxID, hpath, "", attr);
    return targetDocID;
}

export async function getSummaryDoc(bookID: string, boxID: string, hpath: string) {
    const id = await findSummary(bookID);
    if (id) return id;
    const attr = {};
    attr[MarkKey] = getDocIalSummary(bookID);
    const targetDocID = await utils.siyuanCache.createDocWithMdIfNotExists(5000, boxID, hpath, "", attr);
    return targetDocID;
}

export async function getNewBookDoc(bookID: string, boxID: string, hpath: string) {
    const id = await findNewBookDoc(bookID);
    if (id) return id;
    const attr = {};
    attr[MarkKey] = getDocIalNewBookKey(bookID);
    const targetDocID = await utils.siyuanCache.createDocWithMdIfNotExists(5000, boxID, hpath, "", attr);
    return targetDocID;
}

export async function getAllInOneKeyDoc(bookID: string, boxID: string, hpath: string) {
    const id = await findAllInOneKeyDoc(bookID);
    if (id) return id;
    const attr = {};
    attr[MarkKey] = getDocIalAllInOneKey(bookID);
    const targetDocID = await utils.siyuanCache.createDocWithMdIfNotExists(5000, boxID, hpath, "", attr);
    return targetDocID;
}

export async function getTraceDoc(bookID: string, boxID: string, hpath: string) {
    const id = await findTraceDoc(bookID);
    if (id) return id;
    const attr = {};
    attr[MarkKey] = getDocIaltrace(bookID);
    const targetDocID = await utils.siyuanCache.createDocWithMdIfNotExists(5000, boxID, hpath, "", attr);
    return targetDocID;
}

export async function getKeysDoc(bookID: string, point: number, boxID: string, hpath: string) {
    const id = await findKeysDoc(bookID, point);
    if (id) return id;
    const attr = {};
    attr[MarkKey] = getDocIalKeysDoc(bookID, point);
    const targetDocID = await utils.siyuanCache.createDocWithMdIfNotExists(5000, boxID, hpath, "", attr);
    return targetDocID;
}

export async function getCompareDoc(bookID: string, point: number, boxID: string, hpath: string) {
    const id = await findCompareDoc(bookID, point);
    if (id) return id;
    const attr = {};
    attr[MarkKey] = getDocIalCompareDoc(bookID, point);
    const targetDocID = await utils.siyuanCache.createDocWithMdIfNotExists(5000, boxID, hpath, "", attr);
    return targetDocID;
}

export function rmBadThings(s: string) {
    return s.replace(/[​]+/g, "").trim();
}

export async function cleanNote(noteID: string) {
    siyuan.pushMsg("deleting text ...")
    const id2del = [];
    for (const row of await siyuan.sql(`select ial,markdown,id from blocks 
        where root_id="${noteID}" and (
            ial like '%${PROG_PIECE_PREVIOUS}%' 
            or ial like '%${PROG_ORIGIN_TEXT}%' 
            or (markdown='' and content='')
        ) limit 10000`)) {
        const ial: string = row?.ial ?? "";
        const markdown: string = row?.markdown ?? "";
        if (ial.includes(TEMP_CONTENT) || ial.includes(PROG_PIECE_PREVIOUS)) {
            id2del.push(row.id);
        } else if (markdown === "") {
            id2del.push(row.id);
        } else if (ial.includes(PROG_ORIGIN_TEXT)) {
            id2del.push(row.id);
        }
    }
    await siyuan.deleteBlocks(id2del);
}

export async function findPieceDoc(bookID: string, point: number) {
    return doFindDoc(bookID, getDocIalPieces, point);
}

export async function findContents(bookID: string) {
    return doFindDoc(bookID, getDocIalContents);
}

export async function findCards(bookID: string) {
    return doFindDoc(bookID, getDocIalCards);
}

export async function findWords(bookID: string) {
    return doFindDoc(bookID, getDocIalWords);
}

export async function findSummary(bookID: string) {
    return doFindDoc(bookID, getDocIalSummary);
}

export async function findAllInOneKeyDoc(bookID: string) {
    return doFindDoc(bookID, getDocIalAllInOneKey);
}

export async function findNewBookDoc(bookID: string) {
    return doFindDoc(bookID, getDocIalNewBookKey);
}

export async function findTraceDoc(bookID: string) {
    return doFindDoc(bookID, getDocIaltrace);
}

export async function findKeysDoc(bookID: string, point: number) {
    return doFindDoc(bookID, getDocIalKeysDoc, point);
}

export async function findCompareDoc(bookID: string, point: number) {
    return doFindDoc(bookID, getDocIalCompareDoc, point);
}

async function doFindDoc(bookID: string, func: Func, point?: number) {
    if (utils.isValidNumber(point)) {
        const tmp = func;
        func = (bookID: string) => { return tmp(bookID, point); };
    }
    const sql = `select id, path, box from blocks where type='d' and 
        ial like '%${MarkKey}="${func(bookID)}"%'`;
    const row = await siyuan.sqlOne(sql);

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

export async function createAllPieces(bookID: string) {
    const info = await progStorage.booksInfo(bookID)
    const index = await progStorage.loadBookIndexIfNeeded(bookID)
    for (let i = 0; i < index.length; i++) {
        await createPiece(info, index, i)
    }
}

export async function createPiece(bookInfo: BookInfo, index: string[][], point: number) {
    if (bookInfo == null || index == null || point == null) return "";
    if (point > index.length - 1) return ""
    if (point < 0) return ""

    let noteID = await findPieceDoc(bookInfo.bookID, point);
    if (noteID) return noteID;

    const piecePre = index.at(point - 1) ?? []
    const piece = index.at(point) ?? []
    noteID = await createNote(bookInfo.boxID, bookInfo.bookID, piece, point);
    if (!noteID) return "";

    await addReadingBtns(bookInfo.bookID, noteID, point);
    await fullfilContent(point, bookInfo.bookID, piecePre, piece, noteID, null);

    if (bookInfo.autoCard) {
        if (bookInfo.finishDays <= 0) {
            addCardSetDueTime(noteID, 1000); // 全加。
        } else {
            if (!bookInfo.finishPieceID) {
                addCardSetDueTime(noteID, 1000); // 只加一次，后续有插件安排。
            }
        }
    }

    if (!bookInfo.finishPieceID) { // 只维护一次，后续有插件安排。
        bookInfo.finishPieceID = noteID;
        await progStorage.resetBookInfo(bookInfo.bookID, bookInfo);
    }
    return noteID;
}

export async function fullfilContent(point: number, bookID: string, piecePre: string[], piece: string[], noteID: string, stype: AsList) {
    progStorage.updateBookInfoTime(bookID);
    const info = await progStorage.booksInfo(bookID);

    const allContent = [];
    if (piecePre && info.showLastBlock && piecePre.length > 0) {
        const lastID = piecePre[piecePre.length - 1];
        const { div } = await utils.getBlockDiv(lastID);
        allContent.push(await copyBlock(point - 1, info, lastID, div, [PROG_PIECE_PREVIOUS]));
    }

    let splited = false
    if (stype) {
        splited = await splitAndInsert(bookID, noteID, stype, piece);
    } else if (info.autoSplitSentenceP) {
        splited = await splitAndInsert(bookID, noteID, "p", piece);
    } else if (info.autoSplitSentenceI) {
        splited = await splitAndInsert(bookID, noteID, "i", piece);
    } else if (info.autoSplitSentenceT) {
        splited = await splitAndInsert(bookID, noteID, "t", piece);
    }

    if (!splited) {
        const idx: { i: number } = { i: 1 };
        const rows = (await siyuan.getRows(piece, "markdown,ial,type")).filter(row => !!row.markdown);
        for (const { id, markdown, ial, type } of rows) {
            const attrs = utils.parseIAL(ial);
            delete attrs.id;
            delete attrs.updated;
            attrs["custom-prog-origin-text"] = "1";
            allContent.push(await fastCopyBlock(point, info, id, markdown, type, attrs, idx));
        }
    }

    if (allContent.length > 0) {
        await siyuan.insertBlockAsChildOf(allContent.filter(i => !!i).join("\n\n"), noteID);
    }
}

export async function copyBlock(point: number, info: BookInfo, id: string, tempDiv: HTMLDivElement, mark: string[] = [], idx?: { i: number }) {
    if (!tempDiv) return "";
    if (tempDiv.getAttribute(MarkKey)) return "";
    const editableDiv = utils.getContenteditableElement(tempDiv);
    if (editableDiv) {
        if (!utils.getProgressivePluginConfig().pieceNoBacktraceLink) {
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
    const lute = utils.NewLute()
    const txt = lute.BlockDOM2StdMd(tempDiv.outerHTML).replace(/\u200B/g, "").trim();
    if (!txt || txt == "*") return "";
    utils.cleanDivOnly(tempDiv);
    tempDiv.setAttribute(RefIDKey, id);
    mark.forEach(m => tempDiv.setAttribute(m, "1"));
    const md = lute.BlockDOM2Md(tempDiv.outerHTML);
    return md.trim();
}

export async function splitAndInsert(bookID: string, noteID: string, t: AsList, ids: string[]) {
    if (lastVerifyResult()) {
        const s = new SplitSentence(bookID, utils.getProgressivePluginInstance(), noteID, t);
        if (ids?.length > 0) {
            await s.splitByIDs(ids);
            await s.insert(false);
        }
        return true
    } else {
        await siyuan.pushMsg(tomatoI18n.此功能需要激活VIP)
    }
    return false;
}

export async function fastCopyBlock(point: number, info: BookInfo, id: string, markdown: string, type: string, attrs: AttrType, idx?: { i: number }) {
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
        const lute = utils.NewLute()
        markdown = lute.BlockDOM2Md(div.outerHTML);
        markdown = utils.replaceRef2Lnk(markdown)
        const parts = markdown.trim().split("\n")
        parts.pop();
        markdown = parts.join("\n")
        markdown = `${markdown}\n${utils.ial2str(attrs)}`;
        return markdown;
    } else {
        markdown = utils.replaceRef2Lnk(markdown)
        return `${markdown}${utils.get_siyuan_lnk_md(id, "  *  ", utils.getProgressivePluginConfig().pieceNoBacktraceLink)} \n${utils.ial2str(attrs)}`;
    }
}

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

async function addReadingBtns(bookID: string, noteID: string, point: number) {
    const btns = [];
    btns.push(tempContent("---"));
    btns.push(tempContent(getReadingBtns1(bookID, noteID, point)));
    btns.push(tempContent(getReadingBtns2(bookID, noteID, point)));
    btns.push(tempContent(getReadingBtns3(bookID, noteID, point)));
    await siyuan.appendBlock(btns.join("\n"), noteID);
}

async function createNote(boxID: string, bookID: string, piece: string[], point: number) {
    const row = await siyuan.sqlOne(`select hpath,content from blocks where type='d' and id='${bookID}'`);
    let dir = row?.hpath ?? "";
    const bookName = row?.content ?? "";
    if (!dir || !bookName) return "";

    let content: string;
    // 读取第一行的内容用于创建文件名
    for (const blockID of piece) {
        const mc = await siyuan.getBlockMarkdownAndContent(blockID);
        if (mc?.markdown?.startsWith("<div>")) {
            content = utils.dom2div(content).textContent ?? "";
        } else {
            content = mc?.content ?? "";
            content = content.slice(0, 15).replace(/[　\/ ​]+/g, "").trim();
        }
        if (content) break;
    }

    const attr = {} as AttrType;
    attr["custom-card-priority"] = "50";
    if (content) {
        attr["alias"] = bookName + "," + content;
        content = `[${String(point).padStart(5, "0")}]${content}`;
    } else {
        attr["alias"] = bookName;
        content = `[${String(point).padStart(5, "0")}]${bookName}`;
    }
    attr[MarkKey] = getDocIalPieces(bookID, point);

    dir = dir + `/pieces-${bookName}/` + content;
    return siyuan.createDocWithMd(boxID, dir, "", "", attr);
}

export function isProtylePiece(protyle: IProtyle) {
    const div = protyle?.element?.querySelector(`[${MarkKey}]`) as HTMLDivElement;
    const attr = div?.getAttribute(MarkKey) ?? "";
    const pieceLen = getDocIalPieces("20231229160401-0lfc8qj", 0).length;
    return { isPiece: attr.startsWith(TEMP_CONTENT + "#") && attr.length >= pieceLen, markKey: attr };
}

export function isProtyleKeyDoc(protyle: IProtyle) {
    const div = protyle?.element?.querySelector(`[${MarkKey}]`) as HTMLDivElement;
    const attr = div?.getAttribute(MarkKey) ?? "";
    const fake = getDocIalKeysDoc("20231229160401-0lfc8qj", 0);
    return { isKeyDoc: attr.includes(fake.split("#", 1)[0] + "#" + TEMP_CONTENT + "#") && attr.length >= fake.length, keyDocAttr: attr };
}

export function findBack(e: Element) {
    for (let i = 0; i < 1000 && e; i++, e = e.previousElementSibling) {
        const ref = e.getAttribute(RefIDKey);
        const idx = e.getAttribute(PARAGRAPH_INDEX) ?? "";
        const bIdx = e.getAttribute(IN_BOOK_INDEX) ?? "";
        if (ref) return { ref, idx, bIdx };
    }
    return {};
}

export function findForward(e: Element) {
    for (let i = 0; i < 1000 && e; i++, e = e.nextElementSibling) {
        const ref = e.getAttribute(RefIDKey);
        const idx = e.getAttribute(PARAGRAPH_INDEX) ?? "";
        const bIdx = e.getAttribute(IN_BOOK_INDEX) ?? "";
        if (ref) return { ref, idx, bIdx };
    }
    return {};
}
