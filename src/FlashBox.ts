import { Plugin } from "siyuan";
import * as constants from "./constants";
import { siyuan } from "../../sy-tomato-plugin/src/utils";
import * as utils from "../../sy-tomato-plugin/src/utils";
import { events } from "../../sy-tomato-plugin/src/Events";
import * as helper from "./helper";

enum CardType {
    B = "B", C = "C"
}

class FlashBox {
    private plugin: Plugin;

    onload(plugin: Plugin) {
        this.plugin = plugin;
        this.plugin.addCommand({
            langKey: "insertBlankSpaceCardB",
            hotkey: "⌥E",
            editorCallback: (protyle) => {
                this.makeCard(protyle, CardType.B);
            },
        });
        this.plugin.addCommand({
            langKey: "insertBlankSpaceCardC",
            hotkey: "⌘`",
            editorCallback: (protyle) => {
                this.makeCard(protyle, CardType.C);
            },
        });
        this.plugin.eventBus.on("open-menu-content", async ({ detail }) => {
            const menu = detail.menu;
            menu.addItem({
                label: this.plugin.i18n.insertBlankSpaceCardB,
                icon: "iconFlashcard",
                accelerator: "⌥E",
                click: () => {
                    const blockID = detail?.element?.getAttribute("data-node-id") ?? "";
                    const blank = detail?.range?.cloneContents()?.textContent ?? "";
                    if (blockID) {
                        this.blankSpaceCard(blockID, blank, detail?.range, detail?.protyle, CardType.B);
                    }
                },
            });
            menu.addItem({
                label: this.plugin.i18n.insertBlankSpaceCardC,
                icon: "iconFlashcard",
                accelerator: "⌘`",
                click: () => {
                    const blockID = detail?.element?.getAttribute("data-node-id") ?? "";
                    const blank = detail?.range?.cloneContents()?.textContent ?? "";
                    if (blockID) {
                        this.blankSpaceCard(blockID, blank, detail?.range, detail?.protyle, CardType.C);
                    }
                },
            });
        });
    }

    private async makeCard(protyle: any, t: CardType) {
        const { lastSelectedID, firstSelectedID, markdowns } = this.cloneSelectedLineMarkdowns(protyle);
        if (lastSelectedID) {
            const { cardID, markdown } = this.createList(markdowns, firstSelectedID, t);
            await siyuan.insertBlockAfter("", lastSelectedID);
            await utils.sleep(200);
            await siyuan.insertBlockAfter(markdown, lastSelectedID);
            await utils.sleep(200);
            await siyuan.insertBlockAfter("", lastSelectedID);
            setTimeout(() => { siyuan.addRiffCards([cardID]); }, 1000);
        } else {
            const blockID = events.lastBlockID;
            const range = document.getSelection()?.getRangeAt(0);
            const blank = range?.cloneContents()?.textContent ?? "";
            if (blockID) {
                this.blankSpaceCard(blockID, blank, range, protyle, t);
            }
        }
    }

    private createList(markdowns: string[], firstSelectedID: string, cardType: CardType) {
        markdowns = helper.tryRmIDAddLink(markdowns, firstSelectedID);
        const tmp = [];
        for (const m of markdowns) {
            tmp.push("* " + m);
        }
        const cardID = utils.NewNodeID();
        if (cardType === CardType.B) {
            tmp.push("* >");
        } else {
            tmp.push("* ```");
        }
        tmp.push(`{: id="${cardID}"}`);
        return { cardID, "markdown": tmp.join("\n") };
    }

    private cloneSelectedLineMarkdowns(protyle: any) {
        const lute = utils.NewLute();
        const multiLine = protyle?.element?.getElementsByTagName("div") as HTMLDivElement[] ?? [];
        const markdowns = [];
        let lastSelectedID = "";
        let firstSelectedID = "";
        for (const div of multiLine) {
            if (div.classList.contains(constants.PROTYLE_WYSIWYG_SELECT)) {
                const id = div.getAttribute(constants.DATA_NODE_ID);
                if (id) {
                    lastSelectedID = id;
                    if (!firstSelectedID) firstSelectedID = id;
                }
                div.classList.remove(constants.PROTYLE_WYSIWYG_SELECT);
                const elem = div.cloneNode(true) as HTMLDivElement;
                markdowns.push(lute.BlockDOM2Md(elem.innerHTML));
            }
        }
        return { markdowns, firstSelectedID, lastSelectedID };
    }

    private getBlockDOM(dom: Element): { dom: Element, blockID: string } {
        if (!dom) return {} as any;
        if (dom?.tagName?.toLocaleLowerCase() == "body") return {} as any;
        const blockID: string = dom.getAttribute(constants.DATA_NODE_ID) ?? "";
        if (!blockID) return this.getBlockDOM(dom.parentElement);
        return { dom, blockID };
    }

    private async blankSpaceCard(blockID: string, selected: string, range: Range, protyle: any, cardType: CardType) {
        const lute = utils.NewLute();
        let md;
        if (selected) {
            const { dom } = this.getBlockDOM(range.endContainer.parentElement);
            if (!dom) return;
            protyle.toolbar.setInlineMark(protyle, "mark", "range");
            md = helper.tryRmIDAddLinkOne(lute.BlockDOM2Md(dom.outerHTML), blockID);
            protyle.toolbar.setInlineMark(protyle, "mark", "range");
        } else {
            const { dom } = await siyuan.getBlockDOM(blockID);
            md = helper.tryRmIDAddLinkOne(lute.BlockDOM2Md(dom), blockID);
        }
        const cardID = utils.NewNodeID();
        const list = [];
        list.push(`* ${md}`);
        if (cardType === CardType.B) {
            list.push("* >");
        } else {
            list.push("* ```");
        }
        list.push(`{: id="${cardID}"}`);
        await siyuan.insertBlockAfter("", blockID);
        await utils.sleep(200);
        await siyuan.insertBlockAfter(list.join("\n"), blockID);
        await utils.sleep(200);
        await siyuan.insertBlockAfter("", blockID);
        await siyuan.addRiffCards([cardID]);
    }
}

export const flashBox = new FlashBox();
