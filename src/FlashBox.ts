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
                label: "插入填空题闪卡" + CardType.B.toString(),
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
                label: "插入填空题闪卡" + CardType.C.toString(),
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
        let cardContent = content;
        if (selected) {
            selected = selected.replace(/=/g, "​=​");
            content = content.replace(/=/g, "​=​");
            cardContent = content.replace(new RegExp(selected, "g"), `==${selected}==`);
            cardContent = cardContent.replace(/====/g, "");
        }
        if (cardContent.endsWith("*")) {
            cardContent = cardContent.slice(0, -1);
        }
        const progref = (await siyuan.getBlockAttrs(blockID))["custom-progref"];
        if (progref) {
            cardContent += `((${progref} "*"))`;
        } else {
            cardContent += `((${blockID} "*"))`;
        }
        await siyuan.insertBlockAfter("", blockID);
        const cardID = newNodeID();
        if (cardType === CardType.B) {
            await siyuan.insertBlockAfter(`* ${cardContent}
* >
{: id="${cardID}"}
`, blockID);
        } else {
            await siyuan.insertBlockAfter(`* ${cardContent}
* \`\`\`
{: id="${cardID}"}
`, blockID);
        }
        await siyuan.insertBlockAfter("", blockID);
        await siyuan.addRiffCards([cardID]);
    }
}

export const flashBox = new FlashBox();
