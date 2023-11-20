import { Plugin } from "siyuan";

class FlashBox {
    private plugin: Plugin;

    onload(plugin: Plugin) {
        this.plugin = plugin;
        this.plugin.eventBus.on("open-menu-content", async ({ detail }) => {
            const menu = detail.menu;
            menu.addItem({
                label: "插入填空闪卡B",
                icon: "iconFlashcard",
                click: () => {
                    const blockID = detail?.element?.getAttribute("data-node-id") ?? "";
                    const range = detail?.range;
                    if (blockID) {
                        this.blankSpaceCard(blockID, "C");
                        console.log(detail);
                    }
                },
            });
            menu.addItem({
                label: "插入填空闪卡C",
                icon: "iconFlashcard",
                click: () => {
                    const blockID = detail?.element?.getAttribute("data-node-id") ?? "";
                    const range = detail?.range;
                    if (blockID) {
                        this.blankSpaceCard(blockID, "C");
                        console.log(range.cloneContents().textContent);
                    }
                },
            });
        });
    }

    private async blankSpaceCard(blockID: string, cardType: string) {

    }
}

export const flashBox = new FlashBox();
