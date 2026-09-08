import { IProtyle, Plugin } from "siyuan";
import { getDocIalPieces, isProtylePiece } from "./helper";
import { isValidNumber, siyuan, } from "../../sy-tomato-plugin/src/libs/utils";
import { getBookIDByBlock } from "../../sy-tomato-plugin/src/libs/progressive";
import { PROG_DONE_KEY } from "../../sy-tomato-plugin/src/libs/gconst";
import { progStorage } from "./ProgressiveStorage";
import { events } from "../../sy-tomato-plugin/src/libs/Events";
import { OpenSyFile2 } from "../../sy-tomato-plugin/src/libs/docUtils";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import { winHotkey } from "../../sy-tomato-plugin/src/libs/winHotkey";
import { verifyKeyProgressive } from "../../sy-tomato-plugin/src/libs/user";

export const PieceMovingBox移动到上一分片内 = winHotkey("ctrl+alt+u", "移动到上一分片内", "iconProgMoveUp", () => tomatoI18n.移动到上一分片内) // □14 拍板免费（挪片=核心阅读流，不设门）
export const PieceMovingBox移动到下一分片内 = winHotkey("ctrl+alt+i", "移动到下一分片内", "iconProgMoveDown", () => tomatoI18n.移动到下一分片内) // □14 拍板免费（挪片=核心阅读流，不设门）

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

    /** v5 □7：入口收进浮条 [+] 高级功能 + 命令面板（右键菜单/块图标菜单退役）
     *  期4 写作书语境增援：定稿件双向拦截（移入=内容已定勿再加块；移出=破坏定稿
     *  语义，先解除定稿再移）+ 空槽上移兜底（写作书空槽=建书常态，getDocLastID
     *  空片无尾锚，直接挂子头尾等价）+ 移动成功写 activePoint（移块=活跃该片） */
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
                    const writing = progStorage.peekBookInfo(bookID)?.writing;
                    if (writing) {
                        // getBlockAttrs 走 HTTP 直查，无 IAL 索引延迟（刚定稿也能拦住）
                        if (await siyuan.getBlockAttrs(row.id).then(a => a?.[PROG_DONE_KEY] === "1")) {
                            await siyuan.pushMsg(tomatoI18n.该片已定稿不可移入, 2500);
                            return;
                        }
                        // 源片已定稿同样拦截：拉走块=破坏定稿语义（先解除定稿再移）
                        const srcDoc = await siyuan.getDocRowByBlockID(ids[0]);
                        if (srcDoc?.id && await siyuan.getBlockAttrs(srcDoc.id).then(a => a?.[PROG_DONE_KEY] === "1")) {
                            await siyuan.pushMsg(tomatoI18n.该片已定稿不可移出, 2500);
                            return;
                        }
                    }
                    if (delta < 0) {
                        const id = await siyuan.getDocLastID(row.id);
                        if (id) {
                            await siyuan.moveBlocksAfter(ids, id);
                            await OpenSyFile2(this.plugin, ids.at(0));
                        } else if (writing) {
                            // 空槽无尾锚：直接挂子（空片头尾等价），阅读书零变化
                            await siyuan.moveBlocksAsChild(ids, row.id);
                            await OpenSyFile2(this.plugin, ids.at(0));
                        }
                    } else {
                        await siyuan.moveBlocksAsChild(ids, row.id);
                        await OpenSyFile2(this.plugin, ids.at(0));
                    }
                    if (writing) await progStorage.setActivePoint(bookID, newPiece);
                }
            }
        }
    }
}

export const pieceMovingBox = new PieceMovingBox();
