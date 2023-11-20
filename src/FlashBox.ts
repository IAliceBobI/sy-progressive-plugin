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
        const { content } = await siyuan.getBlockMarkdownAndContent(blockID);
        let cardContent = content;
        if (selected) {
            cardContent = content.replace(new RegExp(selected, "g"), `==${selected}==`);
        }
        if (cardContent.endsWith("*")) {
            cardContent = cardContent.slice(0, -1);
        }
        cardContent += `((${blockID} "*"))`;
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
