import { Plugin } from "siyuan";
import { newNodeID, siyuan } from "./utils";

enum CardType {
    B = "B", C = "C"
}

class FlashBox {
    private plugin: Plugin;

    onload(plugin: Plugin) {
        this.plugin = plugin;
        this.plugin.eventBus.on("open-menu-content", async ({ detail }) => {
            const menu = detail.menu;
            menu.addItem({
                label: this.plugin.i18n.insertBlankSpaceCard + CardType.B.toString(),
                icon: "iconFlashcard",
                click: () => {
                    const blockID = detail?.element?.getAttribute("data-node-id") ?? "";
                    const blank = detail?.range?.cloneContents()?.textContent ?? "";
                    if (blockID) {
                        this.blankSpaceCard(blockID, blank, CardType.B);
                    }
                },
            });
            menu.addItem({
                label: this.plugin.i18n.insertBlankSpaceCard + CardType.C.toString(),
                icon: "iconFlashcard",
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
        await siyuan.insertBlockAfter("", blockID);
        const cardID = newNodeID();
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
        await siyuan.insertBlockAfter("", blockID);
        await siyuan.addRiffCards([cardID]);
    }
}

export const flashBox = new FlashBox();