import { Plugin, Lute } from "siyuan";
import * as constants from "./constants";
import { siyuan } from "./utils";
import * as utils from "./utils";
import { events } from "./Events";

enum CardType {
    B = "B", C = "C"
}

class FlashBox {
    private plugin: Plugin;
    private lute: Lute;

    onload(plugin: Plugin) {
        this.plugin = plugin;
        this.lute = (globalThis as any).Lute.New();
        this.plugin.addCommand({
            langKey: "insertBlankSpaceCardB",
            hotkey: "⌘6",
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
                accelerator: "⌘6",
                click: () => {
                    const blockID = detail?.element?.getAttribute("data-node-id") ?? "";
                    const blank = detail?.range?.cloneContents()?.textContent ?? "";
                    if (blockID) {
                        this.blankSpaceCard(blockID, blank, CardType.B);
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
                        this.blankSpaceCard(blockID, blank, CardType.C);
                    }
                },
            });
        });
    }

    private makeCard(protyle: any, t: CardType) {
        const { lastSelectedID, firstSelectedID, markdowns } = this.cloneSelectedLineMarkdowns(protyle);
        if (lastSelectedID) {
            const { cardID, markdown } = this.createList(markdowns, firstSelectedID, t);
            siyuan.insertBlockAfter(markdown, lastSelectedID);
            setTimeout(() => { siyuan.addRiffCards([cardID]); }, 1000);
        } else {
            const blockID = events.lastBlockID;
            const blank = document.getSelection()?.getRangeAt(0)?.cloneContents()?.textContent ?? "";
            if (blockID) {
                this.blankSpaceCard(blockID, blank, t);
            }
        }
    }

    private createList(markdowns: string[], firstSelectedID: string, cardType: CardType) {
        if (markdowns.length > 0) {
            const parts = markdowns[0].split("\n");
            if (!parts[0].endsWith(` "*"))`)) {
                parts[0] = parts[0] + `((${firstSelectedID} "*"))`
            }
            markdowns[0] = parts.join("\n");
        }
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
        tmp.push(`{: id="${cardID}"}`)
        return { cardID, "markdown": tmp.join("\n") };
    }

    private cloneSelectedLineMarkdowns(protyle: any) {
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
                markdowns.push(this.lute.BlockDOM2Md(elem.innerHTML));
            }
        }
        return { markdowns, firstSelectedID, lastSelectedID };
    }

    private async blankSpaceCard(blockID: string, selected: string, cardType: CardType) {
        let { content } = await siyuan.getBlockMarkdownAndContent(blockID);
        if (selected) {
            selected = selected.replace(/=/g, "​=​");
            content = content.replace(/=/g, "​=​");
            content = content.replace(new RegExp(selected, "g"), `==${selected}==`);
            content = content.replace(/====/g, "");
        }
        if (content.endsWith("*")) {
            content = content.slice(0, -1);
        }
        const progref = (await siyuan.getBlockAttrs(blockID))["custom-progref"];
        if (progref) {
            content += `((${progref} "*"))`;
        } else {
            content += `((${blockID} "*"))`;
        }
        const cardID = utils.NewNodeID();
        if (cardType === CardType.B) {
            await siyuan.insertBlockAfter(`* ${content}
* >
{: id="${cardID}"}
`, blockID);
        } else {
            await siyuan.insertBlockAfter(`* ${content}
* \`\`\`
{: id="${cardID}"}
`, blockID);
        }
        await siyuan.addRiffCards([cardID]);
    }
}

export const flashBox = new FlashBox();
