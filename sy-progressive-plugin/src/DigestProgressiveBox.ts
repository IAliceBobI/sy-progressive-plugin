import { Dialog, IEventBusMap, IProtyle, Lute, Plugin } from "siyuan";
import { newID, NewLute } from "../../sy-tomato-plugin/src/libs/utils";
import DigestProgressive from "./DigestProgressive.svelte";
import { events } from "../../sy-tomato-plugin/src/libs/Events";
import { SingleTab } from "../../sy-tomato-plugin/src/libs/docUtils";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import { DigestBuilder } from "./digestUtils";
import { DestroyManager } from "../../sy-tomato-plugin/src/libs/destroyer";
import { doubleClick2DigestDesktop, doubleClick2DigestMobile } from "../../sy-tomato-plugin/src/libs/stores";

class DigestProgressiveBox {
    plugin: Plugin;
    settings: TomatoSettings;
    lute: Lute;
    singleTab: SingleTab;
    digestCallback: any;
    private doubleDialogOpen = false;

    blockIconEvent(detail: IEventBusMap["click-blockicon"]) {
        if (!this.plugin) return;
        detail.menu.addItem({
            iconHTML: "＋🍕",
            label: this.plugin.i18n.digestProgressive,
            accelerator: "⌥A",
            click: () => {
                this.openDialog(detail.protyle);
            }
        });
    }

    async onload(plugin: Plugin, settings: TomatoSettings) {
        this.plugin = plugin;
        this.settings = settings;
        this.lute = NewLute();
        this.singleTab = new SingleTab(this.plugin);
        this.plugin.addCommand({
            langKey: "digestProgressive",
            hotkey: "⌥A",
            callback: () => {
                if (this.digestCallback) {
                    this.digestCallback();
                } else {
                    this.openDialog(events.protyle?.protyle);
                }
            }
        });
        this.plugin.eventBus.on("open-menu-content", ({ detail }) => {
            const menu = detail.menu;
            menu.addItem({
                label: this.plugin.i18n.digestProgressive,
                iconHTML: "＋🍕",
                accelerator: "⌥A",
                click: () => {
                    this.openDialog(detail.protyle);
                },
            });
        });

        this.plugin.addCommand({
            langKey: "摘抄2025-5-6 14:14:20",
            langText: tomatoI18n.执行摘抄,
            hotkey: "⇧⌥A",
            editorCallback: async (protyle) => {
                const s = await events.selectedDivs(protyle);
                const di = await initDi(s, protyle, settings);
                di.digest();
            }
        });
        this.plugin.addCommand({
            langKey: "摘抄断句2025-5-6 14:14:21",
            langText: tomatoI18n.执行摘抄并断句,
            hotkey: "⇧⌥Z",
            editorCallback: async (protyle) => {
                const s = await events.selectedDivs(protyle);
                const di = await initDi(s, protyle, settings);
                di.digest(true);
            }
        });

        if (events.isMobile) {
            if (doubleClick2DigestMobile.get()) {
                document.addEventListener("dblclick", () => {
                    this.openDialog(events.protyle?.protyle, true)
                }, false);
            }
        } else {
            if (doubleClick2DigestDesktop.get()) {
                document.addEventListener("dblclick", () => {
                    this.openDialog(events.protyle?.protyle, true)
                }, false);
            }
        }
    }

    private async openDialog(protyle: IProtyle, isDouble = false) {
        if (!protyle) return;
        if (this.doubleDialogOpen) return;
        this.doubleDialogOpen = true;
        const id = newID();
        const dm = new DestroyManager()
        const dialog = new Dialog({
            title: this.plugin.i18n.digestProgressive,
            content: `<div id='${id}'></div>`,
            destroyCallback: () => {
                dm.destroyBy("1")
            },
            transparent: true,
        });
        const d = new DigestProgressive({
            target: dialog.element.querySelector("#" + id),
            props: {
                dm,
                protyle,
                settings: this.settings,
                isDouble,
            }
        });
        dm.add("1", () => dialog.destroy())
        dm.add("2", () => d.$destroy())
        dm.add("3", () => digestProgressiveBox.digestCallback = null)
        dm.add("4", () => this.doubleDialogOpen = false)
    }
}

export async function initDi(s: Awaited<ReturnType<typeof events.selectedDivs>>, protyle: IProtyle, settings: TomatoSettings) {
    let di = new DigestBuilder();
    di.protyle = protyle;
    di.settings = settings;
    di.element = s.element;
    di.docID = s.docID;
    di.docName = s.docName;
    di.anchorID = s.ids[s.ids.length - 1];
    di.selected = s.selected;
    di.ids = s.ids;
    di.boxID = s.boxID;
    di.plugin = digestProgressiveBox.plugin;
    di.otab = digestProgressiveBox.singleTab;
    await di.init();
    return di;
}

export const digestProgressiveBox = new DigestProgressiveBox();

