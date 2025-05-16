import { IProtyle, Lute, Plugin } from "siyuan";
import { findSummary, getHPathByDocID, getSummaryDoc } from "./helper";
import { NewLute, cloneCleanDiv, getID, siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import { events } from "../../sy-tomato-plugin/src/libs/Events";
import { getBookIDByBlock } from "../../sy-tomato-plugin/src/libs/progressive";
import { OpenSyFile2 } from "../../sy-tomato-plugin/src/libs/docUtils";
import { PieceSummaryBoxmenu, summary2dailynote, windowOpenStyle } from "../../sy-tomato-plugin/src/libs/stores";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import { winHotkey } from "../../sy-tomato-plugin/src/libs/winHotkey";
import { verifyKeyProgressive } from "../../sy-tomato-plugin/src/libs/user";

export const PieceSummaryBox收集内容到文件 = winHotkey("shift+alt+o", "收集内容到文件 2025-5-13 08:44:46", "💼", () => tomatoI18n.收集内容到文件, true, PieceSummaryBoxmenu)

class PieceSummaryBox {
    private plugin: Plugin;
    settings: TomatoSettings;
    lute: Lute;

    blockIconEvent(detail: any) {
        if (!this.plugin) return;
        const menu = detail.menu;
        if (PieceSummaryBox收集内容到文件.menu()) {
            menu.addItem({
                iconHTML: PieceSummaryBox收集内容到文件.icon,
                label: PieceSummaryBox收集内容到文件.langText(),
                accelerator: PieceSummaryBox收集内容到文件.m,
                click: async () => {
                    this.copyBlocks(events.protyle?.protyle);
                }
            });
        }
    }

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
        this.plugin.eventBus.on("open-menu-content", ({ detail }) => {
            const menu = detail.menu;
            if (PieceSummaryBox收集内容到文件.menu()) {
                menu.addItem({
                    iconHTML: PieceSummaryBox收集内容到文件.icon,
                    label: PieceSummaryBox收集内容到文件.langText(),
                    accelerator: PieceSummaryBox收集内容到文件.m,
                    click: async () => {
                        this.copyBlocks(events.protyle?.protyle);
                    }
                });
            }
        });
    }

    private async copyBlocks(protyle: IProtyle) {
        const { selected } = await events.selectedDivs(protyle);
        if (!(selected?.length > 0)) return;
        let summaryID: string;
        if (summary2dailynote.get()) {
            //
        } else {
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

