import { Dialog, IEventBusMap, IProtyle, Lute, Plugin, Protyle } from "siyuan";
import { isEditor, NewLute, } from "../../sy-tomato-plugin/src/libs/utils";
import DigestProgressiveSvelte from "./DigestProgressive.svelte";
import { EventType, events } from "../../sy-tomato-plugin/src/libs/Events";
import { SingleTab } from "../../sy-tomato-plugin/src/libs/docUtils";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import { DigestBuilder } from "./digestUtils";
import { DestroyManager } from "../../sy-tomato-plugin/src/libs/destroyer";
import { add2digBtn2lockIcon, add2piecesBtn2lockIcon, digestmenu, doubleClick2DigestDesktop, doubleClick2DigestMobile } from "../../sy-tomato-plugin/src/libs/stores";
import { winHotkey } from "../../sy-tomato-plugin/src/libs/winHotkey";
import { verifyKeyProgressive } from "../../sy-tomato-plugin/src/libs/user";
import { createFloatingBtn, getProgFloatingDm } from "./FloatingAction";
import { addCustomButton } from "../../sy-tomato-plugin/src/exportFiles";
import { prog } from "./Progressive";
import { newID } from "stonev5-utils";
import { mount } from "svelte";

export const digest渐进阅读摘抄模式 = winHotkey("⌥z", "渐进阅读摘抄模式 2025-5-12 22:02:39", "＋🍕", () => tomatoI18n.渐进阅读摘抄模式)
export const digest执行摘抄 = winHotkey("⇧⌥Z", "执行摘抄 2025-5-12 22:02:39", "🍕", () => tomatoI18n.执行摘抄)
export const digest执行摘抄并断句 = winHotkey("⇧⌥X", "执行摘抄并断句 2025-5-12 22:02:39", "✂", () => tomatoI18n.执行摘抄并断句)

class DigestProgressiveBox {
    plugin: Plugin;
    settings: TomatoSettings;
    lute: Lute;
    singleTab: SingleTab;
    digestCallback: any;
    private dialogOpened = false;

    blockIconEvent(detail: IEventBusMap["click-blockicon"]) {
        if (!this.plugin) return;
        if (digestmenu.get()) {
            detail.menu.addItem({
                label: digest渐进阅读摘抄模式.langText(),
                iconHTML: digest渐进阅读摘抄模式.icon,
                accelerator: digest渐进阅读摘抄模式.m,
                click: () => {
                    this.openDialog(detail.protyle);
                }
            });
        }
    }

    async onload(plugin: Plugin, settings: TomatoSettings) {
        this.plugin = plugin;
        this.settings = settings;
        this.lute = NewLute();
        this.singleTab = new SingleTab(this.plugin);
        await verifyKeyProgressive()
        this.plugin.addCommand({
            langKey: digest渐进阅读摘抄模式.langKey,
            langText: digest渐进阅读摘抄模式.langText(),
            hotkey: digest渐进阅读摘抄模式.m,
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
            if (digestmenu.get()) {
                menu.addItem({
                    label: digest渐进阅读摘抄模式.langText(),
                    iconHTML: digest渐进阅读摘抄模式.icon,
                    accelerator: digest渐进阅读摘抄模式.m,
                    click: () => {
                        this.openDialog(detail.protyle);
                    },
                });
            }
        });

        this.plugin.addCommand({
            langKey: digest执行摘抄.langKey,
            langText: digest执行摘抄.langText(),
            hotkey: digest执行摘抄.m,
            editorCallback: async (protyle) => {
                const s = await events.selectedDivs(protyle);
                const di = await initDi(s, protyle, settings);
                di.digest();
            }
        });

        this.plugin.addCommand({
            langKey: digest执行摘抄并断句.langKey,
            langText: digest执行摘抄并断句.langText(),
            hotkey: digest执行摘抄并断句.m,
            editorCallback: async (protyle) => {
                const s = await events.selectedDivs(protyle);
                const di = await initDi(s, protyle, settings);
                di.digest(true);
            }
        });

        const createBtn = () => {
            createFloatingBtn(this.plugin, this.settings)
            const e: HTMLElement = getProgFloatingDm()?.getData("e")
            if (e) { e.style.display = "none"; }
            this._addSelectionButton()
        }
        if (events.isMobile) {
            if (doubleClick2DigestMobile.get()) {
                createBtn();
            }
        } else {
            if (doubleClick2DigestDesktop.get()) {
                createBtn();
            }
        }
        if (add2digBtn2lockIcon.get()) {
            this._add2digBtn2lockIcon();
        }
        if (add2piecesBtn2lockIcon.get()) {
            this._add2piecesBtn2lockIcon();
        }
    }

    private _add2digBtn2lockIcon() {
        events.addListener("selection btns 2025-5-25 00:40:16", (eventType, detail: Protyle) => {
            if (eventType == EventType.loaded_protyle_static || eventType == EventType.loaded_protyle_dynamic || eventType == EventType.click_editorcontent || eventType == EventType.switch_protyle) {
                navigator.locks.request("lock 2025-5-25 00:40:19", { mode: "exclusive" }, async (lock) => {
                    if (lock) {
                        const protyle: IProtyle = detail.protyle;
                        if (!protyle) return;
                        if (!isEditor(protyle)) return;
                        addCustomButton(protyle, 'progressive-add2dig', tomatoI18n.执行摘抄, "Star", async () => {
                            const s = await events.selectedDivs(protyle);
                            const di = await initDi(s, protyle, this.settings);
                            di.digest();
                        });
                    }
                });
            }
        });
    }

    private _add2piecesBtn2lockIcon() {
        events.addListener("selection btns 2025-5-23 09:47:12", (eventType, detail: Protyle) => {
            if (eventType == EventType.loaded_protyle_static || eventType == EventType.loaded_protyle_dynamic || eventType == EventType.click_editorcontent || eventType == EventType.switch_protyle) {
                navigator.locks.request("lock 2025-5-23 09:47:16", { mode: "exclusive" }, async (lock) => {
                    if (lock) {
                        const protyle: IProtyle = detail.protyle;
                        if (!protyle) return;
                        if (!isEditor(protyle)) return;
                        addCustomButton(protyle, 'progressive-add2piece', tomatoI18n.添加当前文档到渐进阅读分片模式, "Add", () => {
                            prog.addProgressiveReadingWithLock();
                        });
                    }
                });
            }
        });
    }

    private _addSelectionButton() {
        events.addListener("selection btns 2025-5-21 15:24:40", (eventType, detail: Protyle) => {
            if (eventType == EventType.loaded_protyle_static || eventType == EventType.loaded_protyle_dynamic || eventType == EventType.click_editorcontent || eventType == EventType.switch_protyle) {
                navigator.locks.request("lock 2025-5-21 15:24:43", { mode: "exclusive" }, async (lock) => {
                    if (lock) {
                        const protyle: IProtyle = detail.protyle;
                        if (!protyle) return;
                        if (!isEditor(protyle)) return;
                        this.addMenuButton(protyle)
                    }
                });
            }
        });
    }

    private addMenuButton(protyle: IProtyle) {
        addCustomButton(protyle, 'progressive-menu', tomatoI18n.打开多行选择菜单, "Menu", () => {
            const e: HTMLElement = getProgFloatingDm()?.getData("e")
            if (e) { e.style.display = "block"; }
        });
    }

    private openDialog(protyle: IProtyle) {
        if (!protyle) return;
        if (this.dialogOpened) return;
        this.dialogOpened = true;
        const id = newID();
        const dm = new DestroyManager()
        const dialog = new Dialog({
            title: this.plugin.i18n.digestProgressive,
            content: `<div id='${id}'></div>`,
            width: null,
            height: null,
            hideCloseIcon: true,
            destroyCallback: () => {
                dm.destroyBy("1")
            },
            transparent: true,
        });
        const d = mount(DigestProgressiveSvelte, {
            target: dialog.element.querySelector("#" + id),
            props: {
                dm,
                protyle,
                settings: this.settings,
                plugin: this.plugin,
            }
        });
        dm.add("1", () => dialog.destroy())
        dm.add("2", () => d.destroy())
        dm.add("3", () => digestProgressiveBox.digestCallback = null)
        dm.add("4", () => this.dialogOpened = false)
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

