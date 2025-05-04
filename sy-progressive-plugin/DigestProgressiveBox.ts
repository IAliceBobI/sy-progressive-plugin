import { Dialog, IEventBusMap, IProtyle, Lute, Plugin } from "siyuan";
import { newID, NewLute } from "../../sy-tomato-plugin/src/libs/utils";
import DigestProgressive from "./DigestProgressive.svelte";
import { events } from "../../sy-tomato-plugin/src/libs/Events";
import { SingleTab } from "../../sy-tomato-plugin/src/libs/docUtils";

class DigestProgressiveBox {
    plugin: Plugin;
    settings: TomatoSettings;
    lute: Lute;
    singleTab: SingleTab;
    digestCallback: any;

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
    }

    private async openDialog(protyle: IProtyle) {
        if (!protyle) return;
        const id = newID();
        const dialog = new Dialog({
            title: this.plugin.i18n.digestProgressive,
            content: `<div id='${id}'></div>`,
            destroyCallback: () => {
                digestProgressiveBox.digestCallback = null;
            }
        });
        new DigestProgressive({
            target: dialog.element.querySelector("#" + id),
            props: {
                dialog,
                protyle,
                settings: this.settings,
            }
        });
    }
}

export const digestProgressiveBox = new DigestProgressiveBox();

