import { objOverrideNull } from "stonev5-utils";
import { lastVerifyResult, verifyKeyProgressive } from "../../sy-tomato-plugin/src/libs/user";
import { Siyuan, siyuan, } from "../../sy-tomato-plugin/src/libs/utils";
import { createPiece } from "./helper";
import { ProgressiveStorage, progStorage } from "./ProgressiveStorage";
import { NotVIPMaxPlannedBooks } from "./constants";
import { setGlobal } from "stonev5-utils";
import { finishPieceCreateAt } from "../../sy-tomato-plugin/src/libs/stores";
import { getFrontend } from "siyuan";

export async function startTaskLoop() {
    if (finishPieceCreateAt.get() == "all" || finishPieceCreateAt.get() == getFrontend()) {
        await verifyKeyProgressive()
        clearInterval(setGlobal("loopBooks 2025-07-14 13:12:09", setInterval(async () => {
            try {
                await loopBookName()
            } catch (e) {
                console.error(e);
            }
            try {
                await loopBooks()
            } catch (e) {
                console.error(e);
            }
        }, 20000)))
    }
}

async function loopBookName() {
    for (const info of Object.values(progStorage.booksInfos())) {
        const row = await siyuan.getRowByID(info.bookID)
        if (row?.content && info.bookName != row.content) {
            info.bookName = row.content
            await progStorage.resetBookInfo(info.bookID, info);
        }
    }
}

async function loopBooks() {
    let count = NotVIPMaxPlannedBooks;
    if (lastVerifyResult()) count = Number.MAX_SAFE_INTEGER; // VIP
    const planned = Object.values(progStorage.booksInfos())
        .filter(info => info.finishDays > 0)
        .filter(info => info.ignored == false)
        .map(info => {
            return objOverrideNull(info, ProgressiveStorage.defaultBookInfo());
        });
    for (const info of planned.slice(count)) {
        info.finishIgnore = true;
    }
    for (const info of planned.slice(0, count)) {
        info.finishIgnore = false;
        if (await siyuan.checkBlockExist(info.bookID)) {
            const notebook = Siyuan.notebooks.find(n => n.id == info.boxID);
            if (notebook && notebook.closed === false) {
                const bookIdx = await progStorage.loadBookIndexIfNeeded(info.bookID)
                if (bookIdx.length > 0) {
                    const secInterval = Math.ceil((info.finishDays * 24 * 60 * 60) / bookIdx.length)
                    const nowSecs = await siyuan.currentTimeSec();
                    if (secInterval + info.finishTimeSecs <= nowSecs) {
                        try {
                            await tryCreateCard(info, bookIdx)
                        } catch (e) {
                            console.error(e)
                        }
                    }
                }
            }
        }
    }
}

async function tryCreateCard(info: BookInfo, bookIdx: string[][]) {
    if (!info.finishPieceID) { // 意外，需要创建新分片。
        await createCard(info, bookIdx);
        return;
    }

    if (!(await siyuan.checkBlockExist(info.finishPieceID))) { // 当作复习后被用户删除分片，需要创建新分片。
        await createCard(info, bookIdx);
        return;
    }

    const card = await siyuan.getRiffCardsByBlockIDs([info.finishPieceID])
        .then(m => {
            return m?.get(info.finishPieceID)?.at(0);
        });

    if (card == null || card.riffCard == null || card.riffCard.state == null) { // 当作复习后被用户撤销闪卡，需要创建新分片。
        await createCard(info, bookIdx);
        return;
    }

    if (card.riffCard.state != 0) { // 老分片用户已经复习过，可以创建新分片。
        await createCard(info, bookIdx);
        return;
    }
}

async function createCard(info: BookInfo, bookIdx: string[][]) {
    ++info.point;
    info.autoCard = true;
    info.finishPieceID = await createPiece(info, bookIdx, info.point);
    info.finishTimeSecs = await siyuan.currentTimeSec();
    await progStorage.resetBookInfo(info.bookID, info);
}
