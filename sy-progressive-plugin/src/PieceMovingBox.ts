import { IProtyle, Plugin } from "siyuan";
import { getDocIalPieces, isProtylePiece } from "./helper";
import { isValidNumber, siyuan, } from "../../sy-tomato-plugin/src/libs/utils";
import { getBookIDByBlock } from "../../sy-tomato-plugin/src/libs/progressive";
import { events } from "../../sy-tomato-plugin/src/libs/Events";
import { OpenSyFile2 } from "../../sy-tomato-plugin/src/libs/docUtils";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import { winHotkey } from "../../sy-tomato-plugin/src/libs/winHotkey";
import { verifyKeyProgressive } from "../../sy-tomato-plugin/src/libs/user";

export const PieceMovingBox移动到上一分片内 = winHotkey("ctrl+alt+u", "移动到上一分片内", "🚚⬆️", () => tomatoI18n.移动到上一分片内) // □14 拍板免费（挪片=核心阅读流，不设门）
export const PieceMovingBox移动到下一分片内 = winHotkey("ctrl+alt+i", "移动到下一分片内", "🚚⬇️", () => tomatoI18n.移动到下一分片内) // □14 拍板免费（挪片=核心阅读流，不设门）

class PieceMovingBox {
    private plugin: Plugin;
    settings: TomatoSettings;

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
    }

    /** v5 □7：入口收进浮条 [+] 高级功能 + 命令面板（右键菜单/块图标菜单退役） */
    async move(protyle: IProtyle, delta: number) {
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
                        const id = await siyuan.getDocLastID(row.id);
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

export const pieceMovingBox = new PieceMovingBox();
