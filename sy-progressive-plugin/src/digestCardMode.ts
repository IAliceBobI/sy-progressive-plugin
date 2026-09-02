/**
 * 摘抄去向级制卡档（2026-09-02 用户反馈落地）：「留档」与「背诵」分别独立命令/快捷键。
 * 档位值与 DigestBuilder.setDigestCard 分流一致——"0"=不入卡、"1"=清旧卡只留最新一摘、
 * "2"=每个摘抄都入卡；留档/背诵恰取 "0"/"2" 两端。覆盖是去向级（只改本次，不
 * saveCardMode 不改书 IAL），与浮条「留档/背诵」子排按钮同构。
 */
export const CARD_ARCHIVE = "0";
export const CARD_RECITE = "2";

export type DigestIntent = "archive" | "recite" | "auto";

/** 命令去向 → cardMode 覆盖值；auto 返回 undefined=不覆盖（跟随书设置） */
export function cardModeFor(intent: DigestIntent): string | undefined {
    if (intent === "archive") return CARD_ARCHIVE;
    if (intent === "recite") return CARD_RECITE;
    return undefined;
}
