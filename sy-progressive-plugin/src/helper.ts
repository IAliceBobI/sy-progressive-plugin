import { BlockNodeEnum, CONTENT_EDITABLE, DATA_NODE_ID, DATA_TYPE, IN_BOOK_INDEX, MarkKey, PARAGRAPH_INDEX, PROG_ORIGIN_TEXT, PROG_PIECE_PREVIOUS, RefIDKey, TEMP_CONTENT } from "../../sy-tomato-plugin/src/libs/gconst";
import { pieceFilterSQL } from "./originTrace";
import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import * as utils from "../../sy-tomato-plugin/src/libs/utils";
import { lastVerifyResult } from "../../sy-tomato-plugin/src/libs/user";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import { IProtyle } from "siyuan";
import { progStorage } from "./ProgressiveStorage";
import { isMultiLineElement } from "../../sy-tomato-plugin/src/libs/docUtils";
import { SplitSentence } from "./SplitSentence";
import { prog } from "./Progressive";
import { pieceDocName, pieceAlias, getDocIalWords, getDocIalPieces } from "./progData";

// getDocIalWords 定义已挪 progData.ts（v5 words 进 prog-data，ProgressiveStorage 也要用，避免循环 import）
export { getDocIalWords };

export function tempContent(content: string, id?: string) { // for btns and split lines
    if (!id) return content + `\n{: ${MarkKey}="${TEMP_CONTENT}"}`;
    else return content + `\n{: id="${id}" ${MarkKey}="${TEMP_CONTENT}"}`;
}

// getDocIalPieces 已搬 progData（期1 写作书纯函数依赖），此处 re-export 保旧路径
export { getDocIalPieces } from "./progData";

export function getDocIalCards(bookID: string) {
    return `cards#${TEMP_CONTENT}#${bookID}`;
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

export function getDocIalKeysDoc(bookID: string, point: number) {
    return `keysDoc#${TEMP_CONTENT}#${bookID},${point}`;
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

export async function getKeysDoc(bookID: string, point: number, boxID: string, hpath: string) {
    const id = await findKeysDoc(bookID, point);
    if (id) return id;
    const attr = {};
    attr[MarkKey] = getDocIalKeysDoc(bookID, point);
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
        ) limit 10000000`)) {
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

/** 片文档过滤 SQL：originTrace 纯函数实现（digest 误删防线，TDD 见 tests/unit/pieceCleanupSQL.test.ts） */
export { pieceFilterSQL } from "./originTrace";

/** 重划分前删除本书全部旧片（2026-08-31 用户实测报回的根因）：旧片 IAL 标记与新方案
 *  同名（TEMP#bookID,point），findPieceDoc/createPiece 命中即复用旧边界内容的片——
 *  书→片副本 miss（轮询 10 轮报「请选择段落块」）、片→原文按旧边界错位。分片=一次性
 *  餐具（读完即删同语义），重划分=按新设置整批重建，旧片删进 history 可恢复。删除走
 *  pieceFilterSQL（mark 前缀+ctime 排除）——keysDoc（keysDoc#…前缀）/cards/words 等
 *  辅助文档不同前缀不会误伤；单片失败不阻断（残留片回 bug 态，重走重划分可自愈）。
 *  已知边界：片 IAL 是 createDocWithMd→setBlockAttrs 两步后补，巨书上入索引可滞后
 *  24s+——加书后极短窗内重划分会漏删刚建的片（此时片内容与新索引同源，实害有限）。 */
export async function deleteAllPieces(bookID: string) {
    // 显式 limit 防内核 64 截尾：片 >64 篇的书重分片会漏删尾部片（片残留=幽灵分片）
    const rows = await siyuan.sql(
        `select id from blocks where ${pieceFilterSQL(bookID)} limit 10000000`);
    const ids = (rows ?? []).map(r => r?.id).filter(Boolean);
    for (const id of ids) {
        try {
            // 闪卡先行清理（读完即删链 Progressive.ts 同款）：内核 removeDoc 不清 riff 卡
            await siyuan.removeRiffCards([id]);
            await siyuan.removeDocByIDSiyuan(id);
        } catch { /* 单片失败不阻断 */ }
    }
    return ids.length;
}

/** 本书是否存在片文档（同款过滤）：删记录（removeIndex）后重加书路径的知情
 *  警告用——此时书未注册但旧片还在，process() 会照删，须先警告（review P1-1）。 */
export async function hasPieces(bookID: string) {
    const row = await siyuan.sqlOne(
        `select count(*) as n from blocks where ${pieceFilterSQL(bookID)}`);
    return Number((row as any)?.n ?? 0) > 0;
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

export async function findKeysDoc(bookID: string, point: number) {
    return doFindDoc(bookID, getDocIalKeysDoc, point);
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
    const ids = [];
    for (let i = 0; i < index.length; i++) {
        const id = await createPiece(info, index, i)
        ids.push(id)
    }
    return ids;
}

export async function createPiece(bookInfo: BookInfo, index: string[][], point: number) {
    if (bookInfo == null || index == null || point == null) return "";
    if (point > index.length - 1) return ""
    if (point < 0) return ""

    let noteID = await findPieceDoc(bookInfo.bookID, point);
    if (noteID) return noteID;

    const piecePre = index.at(point - 1) ?? []
    // 修复根因 2：piece 为空说明索引未就绪（或 point 越界），不创建空文档，
    // 返回 "" 让 startToLearn 的重试循环（Progressive.ts:431）能感知失败并重试。
    // 块存在性校验：书被编辑后索引会残留已删除块的 ID（悬空 ID），
    // 过滤后全部悬空则跳过该 point，否则会创建只有标题没有内容的空分片。
    const piece = (await siyuan.getRows(index.at(point) ?? [], "id")).map(r => r.id);
    if (piece.length === 0) return "";
    noteID = await createNote(bookInfo.bookID, piece, point);
    if (!noteID) return "";

    await fullfilContent(point, bookInfo.bookID, piecePre, piece, noteID, null);
    return noteID;
}

export async function fullfilContent(point: number, bookID: string, piecePre: string[], piece: string[], noteID: string, stype: AsList | "no" | null) {
    progStorage.updateBookInfoTime(bookID);
    const info = await progStorage.booksInfo(bookID);

    const allContent = [];
    if (piecePre && info.showLastBlock && piecePre.length > 0) {
        const lastID = piecePre[piecePre.length - 1];
        const { div } = await utils.getBlockDiv(lastID);
        allContent.push(await copyBlock(point - 1, info, lastID, div, [PROG_PIECE_PREVIOUS]));
    }

    let splited = false
    if (stype === "no") {
        // □22 二轮增补：重插「不断句」档——直选与书级 auto 全跳过，强制整块复制
    } else if (stype) {
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

    const content = allContent.filter(i => !!i);
    if (content.length > 0) {
        await siyuan.insertBlockAsChildOf(content.join("\n\n"), noteID);
    }
    await removePieceEmptyBlocks(noteID);
}

/** □1 重插失真（2026-09-01）：clearAll 删光子块后内核按「文档不可零块」自动补一个空段落，
 * insertBlockAsChildOf(parentID) 是头插——新内容落在残留空块之前，产物尾部永久挂一个
 * 无 IAL 空块（首建同理：createNote 建空文档自带空块）。fullfilContent 收尾统一清掉：
 * 本轮插入块全带内容/IAL（上游 filter 过空 markdown），getChildBlocks 实时通道不吃 SQL
 * 索引延迟；文档此时已有内容，删空块不触发内核补块（dev 实验双验证 2026-09-01）。 */
async function removePieceEmptyBlocks(noteID: string) {
    try {
        const blocks = await siyuan.getChildBlocks(noteID);
        const empty = (blocks ?? []).filter(b => b.type === "p" && !(b.content ?? "").trim());
        if (empty.length > 0 && empty.length < (blocks ?? []).length) {
            await siyuan.deleteBlocks(empty.map(b => b.id));
        }
    } catch (e) {
        // 装饰性收尾：失败不阻断建片/重插主流程，但留观测面（产物会带空块，无日志无法归因）
        debugLog("refill", `removePieceEmptyBlocks failed: ${e}`, "progressive");
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
    if (!ids?.length) {
        // 如果没有内容需要断句，返回 false 让调用者执行默认逻辑
        return false;
    }
    // □14 断句整体 Pro（p/t/i 三档，□9 拍板）：执行侧兜底门禁——未激活拦 + pushMsg
    // 引导后返回 false，调用者走普通整块复制（分片照常生成，只少断句）。AddBook 弹窗
    // 的锁位 chip 是第一道门，这里兜 AddBook 之外的入口（ShowAllBooks 开关/旧书存量配置）
    if (!lastVerifyResult()) {
        void siyuan.pushMsg(tomatoI18n.断句Pro提示, 2500);
        return false;
    }
    const s = new SplitSentence(bookID, utils.getProgressivePluginInstance(), noteID, t);
    const success = await s.splitByIDs(ids);
    if (!success) {
        // 如果断句失败，返回 false 让调用者执行默认逻辑
        return false;
    }
    await s.insert(false);
    return true;
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
        // □4 progref 债（2026-09-04）：html 块（SQL markdown 列形态 `<div>...</div>`）此前
        // 裸 return 丢 IAL——custom-progref/origin-text/in-book-index 全落空，副本查询
        // （getPiecesByRefID 的 root_id 限定 SQL）永远查空=跳转失灵。IAL 行须**空行隔开**：
        // kramdown 对 HTML 块的终结以空行为界，紧贴的 `{: }` 被吞进 HTML 块内容成字面文本
        // （6808 双变体实测：紧贴=ial 列无/块 md 残留；空行=正确入 IAL 并进 attributes 表）。
        // 其他块类型（p/c/t 单 \n）实测解析正常不动。存量片不迁移，重分片即恢复。
        return `${markdown}\n\n${utils.ial2str(attrs)}`;
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
        const lastPart = parts.pop();
        // 只有当最后一行是属性行时才移除，否则恢复内容
        if (lastPart && !lastPart.startsWith("{:")) {
            parts.push(lastPart);
        }
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

async function createNote(bookID: string, piece: string[], point: number) {
    // boxID 实时取（不信任 BookInfo 缓存）：书移到别的笔记本后缓存会 stale，往旧 box 建片必错
    const row = await siyuan.sqlOne(`select box,hpath,content from blocks where type='d' and id='${bookID}'`);
    const boxID = row?.box ?? "";
    let dir = row?.hpath ?? "";
    const bookName = row?.content ?? "";
    if (!boxID || !dir || !bookName) return "";

    let content: string;
    let hasContent = false;
    // 读取第一行的内容用于创建文件名
    for (const blockID of piece) {
        const mc = await siyuan.getBlockMarkdownAndContent(blockID);
        // markdown 非空即块存在且有内容（含图片等 content 为空的块）
        if (mc?.markdown) hasContent = true;
        if (mc?.markdown?.startsWith("<div>")) {
            content = utils.dom2div(content).textContent ?? "";
        } else {
            content = mc?.content ?? "";
            content = content.slice(0, 15).replace(/[　\/ ​]+/g, "").trim();
        }
        if (content) break;
    }
    // piece 中所有块都查无 markdown（索引残留的已删除块或空段落），不创建空分片
    if (!hasContent) return "";

    const attr = {} as AttrType;
    attr["custom-card-priority"] = "50";
    let docTitle: string;
    if (content) {
        docTitle = pieceDocName(point, content);
        attr["alias"] = pieceAlias(bookName, content);
    } else {
        docTitle = pieceDocName(point, bookName);
        attr["alias"] = pieceAlias(bookName, "");
    }
    attr[MarkKey] = getDocIalPieces(bookID, point);
    // 片=自由工作台：读/改/摘抄皆可，不预设工作流；原书保持锁定（再生源头），片随便造。
    // v5 □16「片=只读原料」退役：不再写 custom-sy-readonly，旧片带锁不迁移、随删片重切
    // 换新（读完即删/序号重切重建片；refill 复用现有片文档不会带走旧锁）

    // v5：分片直挂书下（去 pieces- 夹层，breaking change）；老夹层里的旧分片靠 IAL 查找兼容、读完即删自然消亡
    dir = dir + `/` + docTitle;
    return siyuan.createDocWithMd(boxID, dir, "", "", attr);
}

export function isProtylePiece(protyle: IProtyle) {
    const div = protyle?.element?.querySelector(`[${MarkKey}]`) as HTMLDivElement;
    const attr = div?.getAttribute(MarkKey) ?? "";
    const pieceLen = getDocIalPieces("20231229160401-0lfc8qj", 0).length;
    return { isPiece: attr.startsWith(TEMP_CONTENT + "#") && attr.length >= pieceLen, markKey: attr };
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
