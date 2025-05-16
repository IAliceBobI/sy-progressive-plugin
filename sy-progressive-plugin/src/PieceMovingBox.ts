import { IProtyle, Plugin } from "siyuan";
import { getDocIalPieces, isProtylePiece } from "./helper";
import { getAttribute, isValidNumber, siyuan, } from "../../sy-tomato-plugin/src/libs/utils";
import { getBookIDByBlock } from "../../sy-tomato-plugin/src/libs/progressive";
import { events } from "../../sy-tomato-plugin/src/libs/Events";
import { getDocBlocks, OpenSyFile2 } from "../../sy-tomato-plugin/src/libs/docUtils";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import { PieceMovingDown, PieceMovingUp } from "../../sy-tomato-plugin/src/libs/stores";
import { winHotkey } from "../../sy-tomato-plugin/src/libs/winHotkey";
import { verifyKeyProgressive } from "../../sy-tomato-plugin/src/libs/user";

export const PieceMovingBox移动到上一分片内 = winHotkey("ctrl+alt+u", "移动到上一分片内 2025-5-13 11:27:32", "🚚⬆️", () => tomatoI18n.移动到上一分片内, true, PieceMovingUp)
export const PieceMovingBox移动到下一分片内 = winHotkey("ctrl+alt+i", "移动到下一分片内 2025-5-13 11:27:26", "🚚⬇️", () => tomatoI18n.移动到下一分片内, true, PieceMovingDown)

class PieceMovingBox {
    private plugin: Plugin;
    settings: TomatoSettings;

    blockIconEvent(detail: any) {
        if (!this.plugin) return;

        const protyle: IProtyle = detail.protyle;
        const { isPiece } = isProtylePiece(protyle);
        if (isPiece) {
            if (PieceMovingBox移动到上一分片内.menu()) {
                detail.menu.addItem({
                    iconHTML: PieceMovingBox移动到上一分片内.icon,
                    label: PieceMovingBox移动到上一分片内.langText(),
                    accelerator: PieceMovingBox移动到上一分片内.m,
                    click: () => {
                        this.move(protyle, -1);
                    }
                });
            }
            if (PieceMovingBox移动到下一分片内.menu()) {
                detail.menu.addItem({
                    iconHTML: PieceMovingBox移动到下一分片内.icon,
                    label: PieceMovingBox移动到下一分片内.langText(),
                    accelerator: PieceMovingBox移动到下一分片内.m,
                    click: () => {
                        this.move(protyle, 1);
                    }
                });
            }
        }
    }

    async onload(plugin: Plugin, settings: TomatoSettings) {
        this.plugin = plugin;
        this.settings = settings;
        await verifyKeyProgressive()

        this.plugin.addCommand({
            langKey: PieceMovingBox移动到上一分片内.langKey,
            langText: PieceMovingBox移动到上一分片内.langText(),
            hotkey: PieceMovingBox移动到上一分片内.m,
            editorCallback: async (protyle) => {
                if (PieceMovingBox移动到上一分片内.cmd()) {
                    const { isPiece } = isProtylePiece(protyle);
                    if (isPiece) {
                        this.move(protyle, -1);
                    }
                }
            },
        });
        this.plugin.addCommand({
            langKey: PieceMovingBox移动到下一分片内.langKey,
            langText: PieceMovingBox移动到下一分片内.langText(),
            hotkey: PieceMovingBox移动到下一分片内.m,
            editorCallback: async (protyle) => {
                if (PieceMovingBox移动到下一分片内.cmd()) {
                    const { isPiece } = isProtylePiece(protyle);
                    if (isPiece) {
                        this.move(protyle, 1);
                    }
                }
            },
        });

        this.plugin.eventBus.on("open-menu-content", ({ detail }) => {
            const protyle: IProtyle = detail.protyle;
            const { isPiece } = isProtylePiece(protyle);
            if (isPiece) {
                const menu = detail.menu;
                if (PieceMovingBox移动到上一分片内.menu()) {
                    menu.addItem({
                        iconHTML: PieceMovingBox移动到上一分片内.icon,
                        label: PieceMovingBox移动到上一分片内.langText(),
                        accelerator: PieceMovingBox移动到上一分片内.m,
                        click: () => {
                            this.move(protyle, -1);
                        },
                    });
                }
                if (PieceMovingBox移动到下一分片内.menu()) {
                    menu.addItem({
                        iconHTML: PieceMovingBox移动到下一分片内.icon,
                        label: PieceMovingBox移动到下一分片内.langText(),
                        accelerator: PieceMovingBox移动到下一分片内.m,
                        click: () => {
                            this.move(protyle, 1);
                        },
                    });
                }
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
