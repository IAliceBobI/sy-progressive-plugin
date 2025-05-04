import { MarkKey, PROG_ORIGIN_TEXT, PROG_PIECE_PREVIOUS, TEMP_CONTENT } from "../../sy-tomato-plugin/src/libs/gconst";
import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import * as utils from "../../sy-tomato-plugin/src/libs/utils";
import { IProtyle } from "siyuan";

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
    const row = await siyuan.sqlOne(`select id, path, box from blocks where type='d' and 
        ial like '%${MarkKey}="${func(bookID)}"%'`);
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

export async function createNote(boxID: string, bookID: string, piece: string[], point: number) {
    const attr = {} as AttrType;
    const row = await siyuan.sqlOne(`select hpath,content from blocks where type='d' and id='${bookID}'`);
    let dir = row?.hpath ?? "";
    const bookName = row?.content ?? "";
    if (!dir || !bookName) return "";

    let content: string;
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

    attr["custom-card-priority"] = "60";
    if (content) {
        attr["alias"] = bookName + "," + content;
        content = `[${String(point).padStart(5, "0")}]${content}`;
    } else {
        attr["alias"] = bookName;
        content = `[${String(point).padStart(5, "0")}]${bookName}`;
    }

    dir = dir + `/pieces-${bookName}/` + content;
    const docID = await siyuan.createDocWithMd(boxID, dir, "");
    attr[MarkKey] = getDocIalPieces(bookID, point);
    await siyuan.setBlockAttrs(docID, attr);
    return docID;
}

// export function appendChild(parent: HTMLElement, type: string, textContent: string, classList: string[], click?: any) {
//     const elem = document.createElement(type);
//     elem.textContent = textContent;
//     parent.appendChild(elem);
//     for (const cls of classList) if (cls) elem.classList.add(cls);
//     if (click) elem.addEventListener("click", click);
//     return elem;
// }

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

// export function splitByBlockCount(groups: WordCountType[][], blockNumber: number) {
//     if (blockNumber <= 0) return groups;
//     const tmp: WordCountType[][] = [];
//     for (const group of groups) {
//         const headings: WordCountType[] = [];
//         const rest: WordCountType[] = [];
//         for (const i of group) {
//             if (i.type == "h" && rest.length == 0) headings.push(i);
//             else rest.push(i);
//         }
//         const newPieces = utils.chunks(rest, blockNumber);
//         if (newPieces.length > 0) newPieces[0].splice(0, 0, ...headings);
//         tmp.push(...newPieces);
//     }
//     return tmp;
// }
