import { PARAGRAPH_INDEX, PROG_ORIGIN_TEXT, RefIDKey } from "../../sy-tomato-plugin/src/libs/gconst";
import { escapeLead, mergeMathLead } from "./escapeLead";
import { NewNodeID, get_siyuan_lnk_md, siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import { Plugin } from "siyuan";
import { prog } from "./Progressive";
import { isMultiLineElement, OpenSyFile2 } from "../../sy-tomato-plugin/src/libs/docUtils";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import { progStorage } from "./ProgressiveStorage";
import { lockWithLease } from "./lockLease";

export class SplitSentence {
    private asList: AsList;
    private noteID: string;
    private bookID: string;
    private textAreas: { blocks: { text: string, id: string }[], ref: string }[];
    plugin: Plugin;

    constructor(bookID: string, plugin: Plugin, noteID: string, asList: AsList) {
        this.noteID = noteID;
        this.asList = asList;
        this.plugin = plugin;
        this.bookID = bookID;
    }

    async insert(open = true) {
        return lockWithLease("prog.SplitSentence.insert", async () => {
            let firstID: string;
            const mdList: string[] = [];
            for (const b of this.textAreas) {
                if (b.blocks.length === 0) continue; // p 档 filter 后理论可空，空 textArea 不产出（防空行粘连）
                if (!firstID) {
                    firstID = b.blocks[0].id;
                }
                mdList.push(b.blocks.map(i => i.text).join(""));
            }
            await siyuan.insertBlockAsChildOf(mdList.join("\n\n"), this.noteID);
            if (firstID && open) {
                OpenSyFile2(this.plugin, firstID);
            }
        });
    }

    async splitByIDs(chilrenIDs: string[]): Promise<boolean> {
        const bookInfo = await progStorage.booksInfo(this.bookID);
        const rows = (await siyuan.getRows(chilrenIDs, "id, content, ial, type, markdown", true, [
            // "type NOT IN ('html', 't', 's')",
            "content != ''",
            "content IS NOT NULL",
        ])).filter(row => !!row.markdown);
        this.textAreas = [];
        if (rows.length == 0) {
            await siyuan.pushMsg(tomatoI18n.找不到分片内容);
            return false;
        }
        let i = 1;
        for (const row of rows) {
            let { ref, idx } = getIDFromIAL(row.ial);
            if (!ref) ref = row.id;
            if (!idx) idx = String(i);
            if (row.type == "h" || isMultiLineElement(row.markdown)) {
                const { newID, attrLine } = getAttrLineWithID(ref, idx);
                this.textAreas.push({
                    blocks: [{ text: row.markdown + `\n${attrLine}`, id: newID }],
                    ref,
                });
            } else {
                // if (dontSplit(row.markdown)) {
                //     row.markdown = getAllContentEditableText((await getBlockDiv(row.id))?.div, "");
                // }

                let ps = [row.markdown];
                if (bookInfo?.addIndex2paragraph && !ps[0].startsWith("[")) {
                    ps[0] = `[${i}]` + ps[0];
                }
                ps = splitLines(ps);
                let blocks: { text: string, id: string }[];
                // □1 重插失真（2026-09-01）：三档原各有一次尾部裸 IAL 行 push——Lute 把它解析成
                // 带属性的空段落块（实测 p 档重插产物尾部凭空多空块），断句产物从此零空块
                if (this.asList == "p") {
                    ps = mergeMathLead(ps); // $$ 前导片段回粘上一句（□13 review P1-1，escapeLead.ts 头注）
                    blocks = ps.map(i => i.trim())
                        .filter(i => i.length > 0)
                        .map(i => {
                            const { newID, attrLine } = getAttrLineWithID(ref, idx);
                            return { text: escapeLead(i) + ` ${get_siyuan_lnk_md(ref, "  *  ", prog.settings.pieceNoBacktraceLink)}\n${attrLine}\n`, id: newID };
                        });
                } else if (this.asList == "t") {
                    blocks = ps.map(i => {
                        const { newID, attrLine } = getAttrLineWithID(ref, idx);
                        return { text: `* ${getAttrLine(ref, idx)}[ ] ` + i + ` ${get_siyuan_lnk_md(ref, "  *  ", prog.settings.pieceNoBacktraceLink)}\n\t${attrLine}\n`, id: newID };
                    });
                } else {
                    blocks = ps.map(i => {
                        const { newID, attrLine } = getAttrLineWithID(ref, idx);
                        return { text: `* ${getAttrLine(ref, idx)} ` + i + ` ${get_siyuan_lnk_md(ref, "  *  ", prog.settings.pieceNoBacktraceLink)}\n\t${attrLine}\n`, id: newID };
                    });
                }
                this.textAreas.push({ blocks, ref });
                i++;
            }
        }
        return true;
    }
}

// □14 断句管线（splitLines/splitBy）迁出至 splitPipeline.ts（纯函数文件保单测直测，
// 含公式跨度保护）；import+re-export 保既有 import 路径（seller splitBy / digestUtils splitLines）。
import { splitLines, splitBy } from "./splitPipeline";
export { splitLines, splitBy };

function getAttrLine(ref: string, idx: string) {
    return `{: ${RefIDKey}="${ref}" ${PARAGRAPH_INDEX}="${idx}" ${PROG_ORIGIN_TEXT}="1"}`;
}

function getAttrLineWithID(ref: string, idx: string) {
    const newID = NewNodeID();
    const attrLine = `{: id="${newID}" ${RefIDKey}="${ref}" ${PARAGRAPH_INDEX}="${idx}" ${PROG_ORIGIN_TEXT}="1"}`;
    return { attrLine, newID };
}

export function dontSplit(markdown: string) {
    if (markdown.indexOf("://") > 0) return true;
    if ([...markdown.matchAll(/!\[.*?\]\(.*?\)/g)].length > 0) return true;
    return false;
}

function getIDFromIAL(ial: string) {
    // {: updated="20240104110156" custom-progref="20240103165224-jdum4t6" id="20240104110156-8tsr201"}
    const ref = ial.match(/custom-progref="([^"]+)"/);
    const idx = ial.match(/custom-paragraph-index="([^"]+)"/);
    let idxText = "";
    if (idx && idx[1]) {
        idxText = idx[1];
    }
    if (ref) return { ref: ref[1] ?? "", idx: idxText };
    return {};
}
