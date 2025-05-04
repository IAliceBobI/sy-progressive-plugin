import { IProtyle, Lute, Plugin } from "siyuan";
import { findSummary, getHPathByDocID, getSummaryDoc } from "./helper";
import { NewLute, cloneCleanDiv, getID, siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import { events } from "../../sy-tomato-plugin/src/libs/Events";
import { getBookIDByBlock } from "../../sy-tomato-plugin/src/libs/progressive";
import { OpenSyFile2 } from "../../sy-tomato-plugin/src/libs/docUtils";
import { summary2dailynote, summaryEnable, windowOpenStyle } from "../../sy-tomato-plugin/src/libs/stores";
import { lastVerifyResult, verifyKeyProgressive } from "../../sy-tomato-plugin/src/libs/user";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";

class PieceSummaryBox {
    private plugin: Plugin;
    settings: TomatoSettings;
    lute: Lute;

    blockIconEvent(detail: any) {
        if (!this.plugin) return;

        if (!lastVerifyResult()) return;
        if (!summaryEnable.get()) return;

        const menu = detail.menu;
        menu.addItem({
            iconHTML: "💼",
            label: tomatoI18n.收集内容到文件,
            accelerator: "⌥⇧Z",
            click: async () => {
                this.copyBlocks(events.protyle?.protyle);
            }
        });
    }

    async onload(plugin: Plugin, settings: TomatoSettings) {
        if (! await verifyKeyProgressive()) return;
        if (!summaryEnable.get()) return;


        this.plugin = plugin;
        this.settings = settings;
        this.lute = NewLute();
        this.plugin.addCommand({
            langKey: "collect2025-4-27 11:43:05",
            langText: tomatoI18n.收集内容到文件,
            hotkey: "⌥⇧Z",
            callback: () => {
                this.copyBlocks(events.protyle?.protyle);
            },
        });
        this.plugin.eventBus.on("open-menu-content", ({ detail }) => {
            const menu = detail.menu;
            menu.addItem({
                iconHTML: "💼",
                label: tomatoI18n.收集内容到文件,
                accelerator: "⌥⇧Z",
                click: async () => {
                    this.copyBlocks(events.protyle?.protyle);
                }
            });
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

