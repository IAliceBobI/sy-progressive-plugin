import { IProtyle, Plugin } from "siyuan";
import { getDocIalPieces, isProtylePiece } from "./helper";
import { getAttribute, isValidNumber, siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import { getBookIDByBlock } from "../../sy-tomato-plugin/src/libs/progressive";
import { events } from "../../sy-tomato-plugin/src/libs/Events";
import { lastVerifyResult, verifyKeyProgressive } from "../../sy-tomato-plugin/src/libs/user";
import { pieceMoveEnable } from "../../sy-tomato-plugin/src/libs/stores";
import { getDocBlocks, OpenSyFile2 } from "../../sy-tomato-plugin/src/libs/docUtils";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";

class PieceMovingBox {
    private plugin: Plugin;
    settings: TomatoSettings;

    blockIconEvent(detail: any) {
        if (!this.plugin) return;

        if (!lastVerifyResult()) return;
        if (!pieceMoveEnable.get()) return;

        const protyle: IProtyle = detail.protyle;
        const { isPiece } = isProtylePiece(protyle);
        if (isPiece) {
            detail.menu.addItem({
                iconHTML: "🚚⬆️",
                label: tomatoI18n.移动到上一分片内,
                click: () => {
                    this.move(protyle, -1);
                }
            });
            detail.menu.addItem({
                iconHTML: "🚚⬇️",
                label: tomatoI18n.移动到下一分片内,
                click: () => {
                    this.move(protyle, 1);
                }
            });
        }
    }

    async onload(plugin: Plugin, settings: TomatoSettings) {
        if (! await verifyKeyProgressive()) return;
        if (!pieceMoveEnable.get()) return;

        this.plugin = plugin;
        this.settings = settings;
        this.plugin.eventBus.on("open-menu-content", ({ detail }) => {
            const protyle: IProtyle = detail.protyle;
            const { isPiece } = isProtylePiece(protyle);
            if (isPiece) {
                const menu = detail.menu;
                menu.addItem({
                    label: tomatoI18n.移动到上一分片内,
                    iconHTML: "🚚⬆️",
                    click: () => {
                        this.move(protyle, -1);
                    },
                });
                menu.addItem({
                    label: tomatoI18n.移动到下一分片内,
                    iconHTML: "🚚⬇️",
                    click: () => {
                        this.move(protyle, 1);
                    },
                });
            }
        });
    }

    private async move(protyle: IProtyle, delta: number) {
        if (delta == 0) return;
        const { ids } = await events.selectedDivs(protyle)
        if (!ids || ids.length == 0) return;
        const { bookID, pieceNum } = await getBookIDByBlock(ids[0]);
        if (isValidNumber(pieceNum) && bookID) {
            const newPiece = pieceNum + delta;
            if (newPiece >= 0) {
                const row = await siyuan.sqlOne(`select id from blocks where type='d' and ial like "%${getDocIalPieces(bookID, newPiece)}%"`);
                if (row?.id) {
                    if (delta < 0) {
                        const id = await getInsertPoint(row.id)
                        if (id) {
                            await siyuan.moveBlocksAfter(ids, id);
                            await OpenSyFile2(this.plugin, ids.at(0));
                        }
                    } else {
                        await siyuan.moveBlocksAsChild(ids, row.id);
                        await OpenSyFile2(this.plugin, ids.at(0));
                    }
                }
            }
        }
    }
}

async function getInsertPoint(docID: string) {
    const { root } = await getDocBlocks(docID, "", false, true, 1);
    for (let i = 0; i < root.children.length; i++) {
        const c = root.children.at(i);
        const m = getAttribute(c.div, "custom-progmark")
        if ((c.type === 'tb' || c.type === "s") && m) {
            return root.children.at(i - 1)?.id
        }
    }
}

export const pieceMovingBox = new PieceMovingBox();
