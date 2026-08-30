import { IProtyle, Plugin } from "siyuan";
import { add_href, attrNewLine, cloneCleanDiv, getAttribute, ial2str, isValidNumber, parseIAL, removeAttribute, siyuan, } from "../../sy-tomato-plugin/src/libs/utils";
import { findAllInOneKeyDoc, findKeysDoc, findNewBookDoc, getAllInOneKeyDoc, getHPathByDocID, getKeysDoc, getNewBookDoc, isProtylePiece } from "./helper";
import { MarkKey, PROG_ORIGIN_TEXT } from "../../sy-tomato-plugin/src/libs/gconst";
import { getDocBlocks, OpenSyFile2 } from "../../sy-tomato-plugin/src/libs/docUtils";
import { windowOpenStyle } from "../../sy-tomato-plugin/src/libs/stores";
import { events } from "../../sy-tomato-plugin/src/libs/Events";
import { DomSuperBlockBuilder } from "../../sy-tomato-plugin/src/libs/sydom";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import { winHotkey } from "../../sy-tomato-plugin/src/libs/winHotkey";
import { verifyKeyProgressive } from "../../sy-tomato-plugin/src/libs/user";
import { into } from "stonev5-utils";

type BlockContent = {
    ial?: AttrType, id?: string, markdown?: string, content?: string,
}

function b2c(row: Block): BlockContent {
    return { ial: parseIAL(row.ial), id: row.id, markdown: row.markdown, content: row.content };
}

export const WC提取所有分片的笔记 = winHotkey("⌘F4", "提取所有分片的笔记", "iconCopy", () => tomatoI18n.提取所有分片的笔记, true) // □14 收费门恢复（提取整理族，Pro）
export const WC提取笔记到底部 = winHotkey("shift+alt+r", "提取笔记到底部", "iconCopy", () => tomatoI18n.提取笔记到底部, true) // □14 收费门恢复（提取整理族，Pro）
export const WC提取笔记 = winHotkey("⌘F5", "提取笔记", "iconCopy", () => tomatoI18n.提取笔记, true) // □30 补漏：提取整理族 Pro（□14 恢复门禁时漏标第五参，浮条钮漏灰档+命令通道漏拦）
export const WC去除笔记颜色 = winHotkey("⌥⌘F5", "去除笔记颜色", "iconTheme", () => tomatoI18n.去除笔记颜色, true) // □14 收费门恢复（提取整理族，Pro）
export const WC恢复笔记颜色 = winHotkey("⌥⌘F6", "恢复笔记颜色", "iconTheme", () => tomatoI18n.恢复笔记颜色, true) // □14 收费门恢复（提取整理族，Pro）
// v5 □7 修撞键：原 ⌥⌘F6 与「恢复笔记颜色」双绑（winHotkey 重复检测当时被注释未报），挪至 ⌥⌘F7
export const WC合并所有分片到新文件 = winHotkey("⌥⌘F7", "合并所有分片到新文件", "iconCopy", () => tomatoI18n.合并所有分片到新文件, true) // □14 收费门恢复（合并导出型，Pro）
// 「对比原文」（⌘F6）已退役（2026-08-29 浮条 UX 重设计 □9）：仿写对比由 recite 接管，keys 精读文档仍是可读写笔记容器

class WritingCompareBox {
    private plugin: Plugin;
    settings: TomatoSettings;

    async onload(plugin: Plugin, settings: TomatoSettings) {
        this.plugin = plugin;
        this.settings = settings;
        await verifyKeyProgressive();
        this.plugin.addCommand({
            langKey: WC提取所有分片的笔记.langKey,
            langText: WC提取所有分片的笔记.langText(),
            hotkey: WC提取所有分片的笔记.m,
            editorCallback: async (protyle) => {
                if (WC提取所有分片的笔记.cmd()) {
                    const { isPiece, markKey } = isProtylePiece(protyle);
                    if (isPiece) {
                        await this.extractAllNotes(protyle, markKey);
                    }
                }
            },
        });
        this.plugin.addCommand({
            langKey: WC提取笔记到底部.langKey,
            langText: WC提取笔记到底部.langText(),
            hotkey: WC提取笔记到底部.m,
            editorCallback: async (protyle) => {
                if (WC提取笔记到底部.cmd()) {
                    const { isPiece } = isProtylePiece(protyle);
                    if (isPiece) {
                        await this.extractNotes2bottom(protyle);
                    }
                }
            }
        });
        this.plugin.addCommand({
            langKey: WC提取笔记.langKey,
            langText: WC提取笔记.langText(),
            hotkey: WC提取笔记.m,
            editorCallback: async (protyle) => {
                // □30 补漏：vip 补标时成对漏掉的 cmd() 守卫（未激活 ⌘F5 曾照跑全功能）
                if (WC提取笔记.cmd()) {
                    const { isPiece, markKey } = isProtylePiece(protyle);
                    if (isPiece) {
                        await this.extractNotes(protyle.block?.rootID, protyle.notebookId, markKey);
                    }
                }
            },
        });
        this.plugin.addCommand({
            langKey: WC合并所有分片到新文件.langKey,
            langText: WC合并所有分片到新文件.langText(),
            hotkey: WC合并所有分片到新文件.m,
            editorCallback: async (protyle) => {
                if (WC合并所有分片到新文件.cmd()) {
                    const { isPiece, markKey } = isProtylePiece(protyle);
                    if (isPiece) {
                        await this.extractAsBook(protyle.notebookId, protyle.block?.rootID, protyle.notebookId, markKey);
                    }
                }
            },
        });
        this.plugin.addCommand({
            langKey: WC去除笔记颜色.langKey,
            langText: WC去除笔记颜色.langText(),
            hotkey: WC去除笔记颜色.m,
            editorCallback: async (protyle) => {
                if (WC去除笔记颜色.cmd()) await this.noColor(protyle);
            },
        });
        this.plugin.addCommand({
            langKey: WC恢复笔记颜色.langKey,
            langText: WC恢复笔记颜色.langText(),
            hotkey: WC恢复笔记颜色.m,
            editorCallback: async (protyle) => {
                if (WC恢复笔记颜色.cmd()) await this.noColor(protyle, false);
            },
        });
    }

    // v5 □7：提取/整理族入口收进浮条 [+] 高级功能 + 命令面板（右键菜单退役），方法转 public 供浮条调用

    async extractNotes2bottom(protyle: IProtyle) {
        siyuan.pushMsg(tomatoI18n.提取笔记到底部, 1000);
        const docInfo = events.getInfo(protyle);
        const { root } = await getDocBlocks(docInfo.docID, docInfo.name, true, false, 1);
        const lastID = await siyuan.getDocLastID(docInfo.docID)
        const su = new DomSuperBlockBuilder();
        root.children
            .filter(c => !getAttribute(c.div, "custom-prog-origin-text"))
            .filter(c => !getAttribute(c.div, "custom-progmark"))
            .filter(c => !getAttribute(c.div, "custom-doc-notes"))
            .forEach(c => {
                const d = cloneCleanDiv(c.div, true);
                removeAttribute(d.div, "custom-prog-key-note")
                removeAttribute(d.div, "custom-progref")
                add_href(d.div, d.new2old.get(d.newID), "* ", false)
                su.append(d.div);
            });
        su.setAttr("custom-doc-notes", "1");
        const ops = siyuan.transInsertBlocksBefore([su.build().outerHTML], lastID)
        root.children
            .filter(c => getAttribute(c.div, "custom-doc-notes"))
            .forEach(c => ops.push(...siyuan.transDeleteBlocks([c.id])));
        await siyuan.transactions(ops);
        OpenSyFile2(this.plugin, su.id);
    }

    async noColor(protyle: IProtyle, rm = true) {
        const { docID } = events.getInfo(protyle)
        const { root } = await getDocBlocks(docID, "", false, true, 1)
        const attrs: AttrType = into(() => {
            if (rm) {
                return { "custom-prog-key-no-color": "1" };
            } else {
                return { "custom-prog-key-no-color": "" };
            }
        });
        const param = root.children
            .filter(c => !getAttribute(c.div, "custom-prog-origin-text"))
            .map(c => {
                return { id: c.id, attrs }
            });
        await siyuan.batchSetBlockAttrs(param);
    }

    async extractAllNotes(protyle: IProtyle, markKey: string) {
        siyuan.pushMsg(tomatoI18n.提取所有分片的笔记)
        const docInfo = events.getInfo(protyle);

        const { pieceIDs, bookID } = await getAllPieces(markKey);
        const blocks = await getAllBlocks(pieceIDs, true, true, true);
        const sup = new DomSuperBlockBuilder();
        blocks.forEach(b => {
            removeAttribute(b.div, "custom-progmark");
            removeAttribute(b.div, "custom-in-book-index");
            removeAttribute(b.div, "custom-paragraph-index");
            removeAttribute(b.div, "custom-progref");
            sup.append(b.div);
        });
        const div = sup.build();

        let keysDocID = await findAllInOneKeyDoc(bookID);
        if (!keysDocID) {
            const hpath = await getHPathByDocID(bookID, "collection");
            if (hpath) {
                keysDocID = await getAllInOneKeyDoc(bookID, docInfo.notebookId, hpath);
            }
        }
        if (!keysDocID) return;
        await siyuan.clearAll(keysDocID);
        await siyuan.insertBlocksAsChildOf([div.outerHTML], keysDocID);
        OpenSyFile2(this.plugin, keysDocID, windowOpenStyle.get() as any);
    }

    async extractAsBook(boxID: string, pieceID: string, notebookId: string, markKey: string) {
        if (!pieceID || !notebookId || !markKey) return;
        siyuan.pushMsg(tomatoI18n.合并所有分片到新文件)

        const { pieceIDs, bookID } = await getAllPieces(markKey);
        const blocks = await getAllBlocks(pieceIDs, false, true, false);
        const sup = new DomSuperBlockBuilder();
        blocks.forEach(b => sup.append(b.div));
        const div = sup.build();

        let newBookID = await findNewBookDoc(bookID);
        if (!newBookID) {
            const hpath = await getHPathByDocID(bookID, "merged");
            if (hpath) {
                newBookID = await getNewBookDoc(bookID, boxID, hpath);
            }
        }
        if (!newBookID) return;

        await siyuan.clearAll(newBookID);
        await siyuan.insertBlocksAsChildOf([div.outerHTML], newBookID);
        OpenSyFile2(this.plugin, newBookID, windowOpenStyle.get() as any);
    }

    async extractNotes(pieceID: string, notebookId: string, markKey: string) {
        if (!pieceID || !notebookId || !markKey) return;
        siyuan.pushMsg("extract notes")

        const parts = markKey.split("#").pop()?.split(",");
        if (parts.length !== 2) return;

        const point = Number(parts[1]);
        if (!isValidNumber(point)) return;
        let keysDocID = await findKeysDoc(parts[0], point);
        if (!keysDocID) {
            const hpath = await getHPathByDocID(pieceID, "keys");
            if (hpath) {
                keysDocID = await getKeysDoc(parts[0], point, notebookId, hpath);
            }
        }
        if (!keysDocID) return;

        const taskMap = siyuan.getChildBlocks(keysDocID)
            .then(bs => bs.map(b => b.id))
            .then(ids => siyuan.getRows(ids, "content,ial", true))
            .then(rows => rows.map(b2c))
            .then(contents => {
                let idx: string;
                const m = new Map<string, BlockContent[]>();
                for (const c of contents) {
                    const pidx = c.ial["custom-paragraph-index"];
                    if (pidx) {
                        idx = pidx
                    }
                    if (idx && !pidx) {
                        const arr = m.get(idx) ?? []
                        arr.push(c)
                        m.set(idx, arr);
                    }
                }
                return m;
            })

        const { contents, noteMap } = await (async () => {
            const cs = await siyuan.getChildBlocks(pieceID);
            const ids = cs.map(b => b.id);
            const rows = await siyuan.getRows(ids,
                "content,ial,markdown", true, [
                `ial not like "%${PROG_ORIGIN_TEXT}%"`,
                `ial not like "%${MarkKey}%"`,
                "content IS NOT NULL",
                "LENGTH(content) > 0",
            ]);
            const contents = rows.map(b2c);
            return { contents, noteMap: await taskMap };
        })();

        const mdList: string[] = [];
        let lastIdx: string;
        for (const { ial, content, markdown } of contents) {
            if (!content) continue;
            delete ial.id;
            delete ial.updated;
            const thisIdx = ial["custom-paragraph-index"];
            if (thisIdx != lastIdx) {
                if (lastIdx != null) mdList.push(attrNewLine());
                lastIdx = thisIdx;
            }
            ial["custom-prog-key-note"] = "1";
            mdList.push(`${markdown}\n${ial2str(ial)}`);
            noteMap.get(thisIdx)?.forEach(note => {
                mdList.push(note.content);
            })
        }
        await siyuan.clearAll(keysDocID);
        await siyuan.insertBlockAsChildOf(mdList.join("\n"), keysDocID);
        OpenSyFile2(this.plugin, keysDocID, "front");
    }
}

export const writingCompareBox = new WritingCompareBox();

async function getAllPieces(markKey: string) {
    // 插件管理勿改managedByPluginDoNotModify#20240130152919-exlnqci,7
    const [pmPreffix, pieceIdx] = markKey.split(",")
    const [_T, bookID] = pmPreffix.split("#")
    const pieceIDs = await siyuan.sql(`select id,ial from blocks where type='d' and ial like '%${pmPreffix},%' limit 100000000`)
        .then(rows => {
            rows = rows
                .map(r => r.attrs = parseIAL(r.ial))
                .sort((a, b) => a["custom-progmark"].localeCompare(b["custom-progmark"]));
            return rows.map(r => r.id);
        });
    return { pieceIDs, pmPreffix, pieceIdx, bookID }
}

async function getAllBlocks(pieceIDs: string[], noteOnly = false, clone = true, addHref = false) {
    const docs = await Promise.all(pieceIDs.map(id => getDocBlocks(id, "", true, false, 1)))
    let blocks = docs.map(doc => doc?.root?.children ?? []).flat();
    blocks = blocks.filter(block => {
        const m1 = getAttribute(block.div, "custom-progmark");
        const m2 = getAttribute(block.div, "custom-doc-notes");
        const m3 = getAttribute(block.div, "custom-prog-piece-previous");
        return !m1 && !m2 && !m3;
    });
    if (noteOnly) {
        blocks = blocks.filter(block => {
            const o = getAttribute(block.div, "custom-prog-origin-text")
            return !o
        });
    }
    if (clone) {
        blocks.forEach(b => {
            const { id, div } = cloneCleanDiv(b.div);
            b.div = div;
            if (addHref) {
                add_href(div, id, "  *  ", true);
            }
        });
    }
    return blocks;
}

