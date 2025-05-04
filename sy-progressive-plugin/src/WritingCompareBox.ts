import { IProtyle, Plugin } from "siyuan";
import { add_href, attrNewLine, cloneCleanDiv, getAttribute, ial2str, isValidNumber, parseIAL, removeAttribute, siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import { findAllInOneKeyDoc, findCompareDoc, findKeysDoc, findNewBookDoc, findPieceDoc, getAllInOneKeyDoc, getCompareDoc, getHPathByDocID, getKeysDoc, getNewBookDoc, isProtyleKeyDoc, isProtylePiece } from "./helper";
import { MarkKey, PROG_ORIGIN_TEXT } from "../../sy-tomato-plugin/src/libs/gconst";
import { getDocBlocks, OpenSyFile2 } from "../../sy-tomato-plugin/src/libs/docUtils";
import { getAllPieceNotesEnable, merg2newBookEnable, windowOpenStyle } from "../../sy-tomato-plugin/src/libs/stores";
import { events } from "../../sy-tomato-plugin/src/libs/Events";
import { DomSuperBlockBuilder } from "../../sy-tomato-plugin/src/libs/sydom";
import { lastVerifyResult, verifyKeyProgressive } from "../../sy-tomato-plugin/src/libs/user";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";

type BlockContent = {
    ial?: AttrType, id?: string, markdown?: string, content?: string,
}

function b2c(row: Block): BlockContent {
    return { ial: parseIAL(row.ial), id: row.id, markdown: row.markdown, content: row.content };
}

class WritingCompareBox {
    private plugin: Plugin;
    settings: TomatoSettings;

    async onload(plugin: Plugin, settings: TomatoSettings) {
        this.plugin = plugin;
        this.settings = settings;
        if (getAllPieceNotesEnable.get() && await verifyKeyProgressive()) {
            this.plugin.addCommand({
                langKey: "extractAllNotes2025-4-29 23:50:41",
                langText: tomatoI18n.提取所有分片的笔记,
                hotkey: "⌘F4",
                editorCallback: async (protyle) => {
                    const { isPiece, markKey } = isProtylePiece(protyle);
                    if (isPiece) {
                        await this.extractAllNotes(protyle, markKey);
                    }
                },
            });
        }
        this.plugin.addCommand({
            langKey: "extract to bottom 2024年12月31日14:19:49",
            langText: tomatoI18n.提取笔记到底部,
            hotkey: "⇧⌥N",
            editorCallback: async (protyle) => {
                const { isPiece } = isProtylePiece(protyle);
                if (isPiece) {
                    await this.extractNotes2bottom(protyle);
                }
            }
        });
        this.plugin.addCommand({
            langKey: "extractNotes",
            hotkey: "⌘F5",
            editorCallback: async (protyle) => {
                const { isPiece, markKey } = isProtylePiece(protyle);
                if (isPiece) {
                    await this.extractNotes(protyle.block?.rootID, protyle.notebookId, markKey);
                }
            },
        });
        if (merg2newBookEnable.get() && await verifyKeyProgressive()) {
            this.plugin.addCommand({
                langKey: "2024-08-09 15:10:45 extract book",
                langText: tomatoI18n.合并所有分片到新文件,
                hotkey: "",
                editorCallback: async (protyle) => {
                    const { isPiece, markKey } = isProtylePiece(protyle);
                    if (isPiece) {
                        await this.extractAsBook(protyle.notebookId, protyle.block?.rootID, protyle.notebookId, markKey);
                    }
                },
            });
        }
        this.plugin.addCommand({
            langKey: "compareNotes",
            hotkey: "⌘F6",
            editorCallback: async (protyle) => {
                const { isKeyDoc, keyDocAttr } = isProtyleKeyDoc(protyle);
                if (isKeyDoc) {
                    await this.compareNotes(protyle.block?.rootID, protyle.notebookId, keyDocAttr);
                }
            },
        });
        this.plugin.eventBus.on("open-menu-content", ({ detail }) => {
            const protyle: IProtyle = detail.protyle;
            const { isPiece, markKey } = isProtylePiece(protyle);
            if (isPiece) {
                const menu = detail.menu;
                if (getAllPieceNotesEnable.get() && lastVerifyResult()) {
                    menu.addItem({
                        label: tomatoI18n.提取所有分片的笔记,
                        icon: "iconCopy",
                        accelerator: "⌘F4",
                        click: async () => {
                            await this.extractAllNotes(protyle, markKey);
                        },
                    });
                }
                menu.addItem({
                    label: tomatoI18n.提取笔记到底部,
                    icon: "iconCopy",
                    accelerator: "⇧⌥N",
                    click: async () => {
                        const { isPiece } = isProtylePiece(protyle);
                        if (isPiece) {
                            await this.extractNotes2bottom(protyle);
                        }
                    },
                });
                menu.addItem({
                    label: this.plugin.i18n.extractNotes,
                    icon: "iconCopy",
                    accelerator: "⌘F5",
                    click: async () => {
                        await this.extractNotes(protyle.block?.rootID, protyle.notebookId, markKey);
                    },
                });
                if (merg2newBookEnable.get() && lastVerifyResult()) {
                    menu.addItem({
                        label: tomatoI18n.合并所有分片到新文件,
                        icon: "iconCopy",
                        accelerator: "",
                        click: async () => {
                            await this.extractAsBook(protyle.notebookId, protyle.block?.rootID, protyle.notebookId, markKey);
                        },
                    });
                }
            } else {
                const { isKeyDoc, keyDocAttr } = isProtyleKeyDoc(protyle);
                if (isKeyDoc) {
                    const menu = detail.menu;
                    menu.addItem({
                        label: this.plugin.i18n.compareNotes,
                        icon: "iconEye",
                        accelerator: "⌘F6",
                        click: async () => {
                            await this.compareNotes(protyle.block?.rootID, protyle.notebookId, keyDocAttr);
                        },
                    });
                }
            }
        });
    }

    private async extractNotes2bottom(protyle: IProtyle) {
        siyuan.pushMsg(tomatoI18n.提取笔记到底部, 1000);
        const docInfo = events.getInfo(protyle);
        const { root } = await getDocBlocks(docInfo.docID, docInfo.name, true, false, 1);
        let lastID: string = root.children.find(c => getAttribute(c.div, "custom-progmark"))?.id
        if (!lastID) lastID = await siyuan.getDocLastID(docInfo.docID)
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

    private async extractAllNotes(protyle: IProtyle, markKey: string) {
        siyuan.pushMsg(tomatoI18n.提取所有分片的笔记)
        const docInfo = events.getInfo(protyle);

        const { pieceIDs, bookID } = await getAllPieces(markKey);
        const blocks = await getAllBlocks(pieceIDs, true, true, true);
        const sup = new DomSuperBlockBuilder();
        blocks.forEach(b => sup.append(b.div));
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

    private async compareNotes(keyNoteID: string, notebookId: string, keyDocAttr: string) {
        if (!keyNoteID || !notebookId || !keyDocAttr) return;
        siyuan.pushMsg("compare notes")

        const parts = keyDocAttr.split("#").pop()?.split(",");
        if (parts.length == 2) {
            const point = Number(parts[1]);
            if (!isValidNumber(point)) return;
            const pieceID = await findPieceDoc(parts[0], point);
            if (!pieceID) return;
            let cmpDocID = await findCompareDoc(parts[0], point);
            if (!cmpDocID) {
                const hpath = await getHPathByDocID(pieceID, "compare");
                if (hpath) {
                    cmpDocID = await getCompareDoc(parts[0], point, notebookId, hpath);
                }
            }
            if (!cmpDocID) return;
            const taskClear = siyuan.clearAll(cmpDocID);
            const mdList: string[] = [];

            const keyNoteMap = siyuan.getChildBlocks(keyNoteID)
                .then(keyNoteChildren => siyuan.getRows(keyNoteChildren.map(b => b.id), "ial,markdown,content", true, [
                    "content is not null", 'content != ""'
                ]))
                .then(keyNoteData => keyNoteData.map(row => {
                    return { ial: parseIAL(row.ial), id: row.id, markdown: row.markdown, content: row.content } as BlockContent;
                }).reduce(({ lastRef, all }, row) => {
                    all.push(row);
                    const ref = row.ial["custom-progref"];
                    if (ref) {
                        lastRef = ref;
                    } else if (lastRef) {
                        row.ial["custom-progref"] = lastRef;
                    }
                    return { lastRef, all };
                }, { lastRef: "", all: [] as BlockContent[] }).all
                    .filter(b => !b.ial["custom-prog-key-note"])
                    .reduce((m, b) => {
                        const k = b.ial["custom-progref"];
                        if (!m.has(k)) m.set(k, []);
                        m.get(k).push(b);
                        return m;
                    }, new Map<string, BlockContent[]>()))

            const { ids, m: pieceMap } = await siyuan.getChildBlocks(pieceID)
                .then(pieceChildren => siyuan.getRows(pieceChildren.map(b => b.id), "ial,markdown", true, [`ial like "%${PROG_ORIGIN_TEXT}%"`]))
                .then(pieceData => pieceData.map(row => {
                    return { ial: parseIAL(row.ial), id: row.id, markdown: row.markdown } as BlockContent;
                }).reduce((obj, b) => {
                    const k = b.ial["custom-progref"];
                    obj.ids.push(k);
                    if (!obj.m.has(k)) obj.m.set(k, []);
                    obj.m.get(k).push(b);
                    return obj;
                }, { ids: [] as string[], m: new Map<string, BlockContent[]>() }))

            for (const id of [... new Set(ids)]) {
                for (const row of pieceMap.get(id) ?? []) {
                    delete row.ial.id;
                    delete row.ial.updated;
                    row.ial["custom-prog-key-note"] = "1";
                    mdList.push(`${row.markdown}\n${ial2str(row.ial)}`);
                }
                let w = false;
                for (const row of (await keyNoteMap).get(id) ?? []) {
                    delete row.ial.id;
                    delete row.ial.updated;
                    w = true;
                    mdList.push(`((${row.id} '${row.content}'))\n${ial2str(row.ial)}`);
                }
                if (w) mdList.push("---");
            }
            await taskClear;
            await siyuan.insertBlockAsChildOf(mdList.join("\n"), cmpDocID);
            siyuan.pushMsg("compare notes finished")
            OpenSyFile2(this.plugin, cmpDocID, windowOpenStyle.get() as any);
        }
    }

    private async extractAsBook(boxID: string, pieceID: string, notebookId: string, markKey: string) {
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

    private async extractNotes(pieceID: string, notebookId: string, markKey: string) {
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
                "content,ial", true, [
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
        for (const { id, ial, content } of contents) {
            if (!content) continue;
            delete ial.id;
            delete ial.updated;
            const thisIdx = ial["custom-paragraph-index"];
            if (thisIdx != lastIdx) {
                if (lastIdx != null) mdList.push(attrNewLine());
                lastIdx = thisIdx;
            }
            ial["custom-prog-key-note"] = "1";
            mdList.push(`((${id} '${content}'))\n${ial2str(ial)}`);
            noteMap.get(thisIdx)?.forEach(note => {
                mdList.push(note.content);
            })
        }
        await siyuan.clearAll(keysDocID);
        await siyuan.insertBlockAsChildOf(mdList.join("\n"), keysDocID);
        OpenSyFile2(this.plugin, keysDocID, windowOpenStyle.get() as any);
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

