import { IProtyle, Lute, Plugin } from "siyuan";
import { findSummary, getHPathByDocID, getSummaryDoc } from "./helper";
import { NewLute, cloneCleanDiv, getID, siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import { events } from "../../sy-tomato-plugin/src/libs/Events";
import { getBookIDByBlock } from "../../sy-tomato-plugin/src/libs/progressive";
import { OpenSyFile2 } from "../../sy-tomato-plugin/src/libs/docUtils";
import { windowOpenStyle } from "../../sy-tomato-plugin/src/libs/stores";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import { winHotkey } from "../../sy-tomato-plugin/src/libs/winHotkey";
import { verifyKeyProgressive } from "../../sy-tomato-plugin/src/libs/user";

export const PieceSummaryBox收集内容到文件 = winHotkey("shift+alt+o", "收集内容到文件", "iconProgInbox", () => tomatoI18n.收集内容到文件, true) // □14 收费门恢复（收集=合并导出型，Pro）

class PieceSummaryBox {
    private plugin: Plugin;
    settings: TomatoSettings;
    lute: Lute;

    async onload(plugin: Plugin, settings: TomatoSettings) {
        this.plugin = plugin;
        this.settings = settings;
        this.lute = NewLute();
        await verifyKeyProgressive();
        this.plugin.addCommand({
            langKey: PieceSummaryBox收集内容到文件.langKey,
            langText: PieceSummaryBox收集内容到文件.langText(),
            hotkey: PieceSummaryBox收集内容到文件.m,
            callback: () => {
                if (PieceSummaryBox收集内容到文件.cmd()) {
                    this.copyBlocks(events.protyle?.protyle);
                }
            },
        });
    }

    /** v5 □7：入口收进浮条 [+] 高级功能 + 命令面板（右键菜单/块图标菜单退役）；
        summary2dailycard 日记分支随设置砍除，固定收集到书的 summary 文档 */
    async copyBlocks(protyle: IProtyle) {
        const { selected } = await events.selectedDivs(protyle);
        if (!(selected?.length > 0)) return;
        let summaryID: string;
        const { bookID } = await getBookIDByBlock(getID(selected[0]));
        if (bookID) {
            summaryID = await findSummary(bookID);
            if (!summaryID) {
                const hpath = await getHPathByDocID(bookID, "summary");
                if (hpath) {
                    summaryID = await getSummaryDoc(bookID, events.boxID, hpath);
                }
            }
        }
        if (!summaryID) {
            const r = await siyuan.createDailyNote(events.boxID);
            summaryID = r.id;
        }
        if (summaryID) {
            const divs = selected.map(d => cloneCleanDiv(d))
            const lastID = divs[divs.length - 1].newID
            await siyuan.appendBlocks(divs.map(d => d.div.outerHTML), summaryID);
            await OpenSyFile2(this.plugin, lastID, windowOpenStyle.get() as any);
        }
    }
}

export const pieceSummaryBox = new PieceSummaryBox();

