import { objOverrideNull } from "stonev5-utils";
import { lastVerifyResult, verifyKeyProgressive } from "../../sy-tomato-plugin/src/libs/user";
import { siyuan, sleep } from "../../sy-tomato-plugin/src/libs/utils";
import { createPiece } from "./helper";
import { ProgressiveStorage, progStorage } from "./ProgressiveStorage";
import { NotVIPMaxPlannedBooks } from "./constants";

export async function startTaskLoop() {
    await verifyKeyProgressive()
    while (true) {
        await sleep(20000);
        try {
            await loopBooks()
        } catch (e) {
            console.error(e);
        }
    }
}

async function loopBooks() {
    let count = NotVIPMaxPlannedBooks;
    if (lastVerifyResult()) count = Number.MAX_SAFE_INTEGER; // VIP
    const planned = Object.values(progStorage.booksInfos())
        .filter(book => book.finishDays > 0)
        .filter(book => book.ignored == false)
        .map(book => {
            return objOverrideNull(book, ProgressiveStorage.defaultBookInfo());
        });
    for (const book of planned.slice(count)) {
        book.finishIgnore = true;
    }
    for (const book of planned.slice(0, count)) {
        book.finishIgnore = false;
        const bookIdx = await progStorage.loadBookIndexIfNeeded(book.bookID)
        if (bookIdx.length > 0) {
            const secInterval = Math.ceil((book.finishDays * 24 * 60 * 60) / bookIdx.length)
            const nowSecs = await siyuan.currentTimeSec();
            if (secInterval + book.finishTimeSecs <= nowSecs) {
                try {
                    await tryCreateCard(book, bookIdx)
                } catch (e) {
                    console.error(e)
                }
            }
        }
    }
}

async function tryCreateCard(book: BookInfo, bookIdx: string[][]) {
    if (!book.finishPieceID) { // 意外，需要创建新分片。
        await createCard(book, bookIdx);
        return;
    }

    if (!(await siyuan.checkBlockExist(book.finishPieceID))) { // 当作复习后被用户删除分片，需要创建新分片。
        await createCard(book, bookIdx);
        return;
    }

    const card = await siyuan.getRiffCardsByBlockIDs([book.finishPieceID])
        .then(m => {
            return m?.get(book.finishPieceID)?.at(0);
        });

    if (card == null || card.riffCard == null || card.riffCard.state == null) { // 当作复习后被用户撤销闪卡，需要创建新分片。
        await createCard(book, bookIdx);
        return;
    }

    if (card.riffCard.state != 0) { // 老分片用户已经复习过，可以创建新分片。
        await createCard(book, bookIdx);
        return;
    }
}

async function createCard(book: BookInfo, bookIdx: string[][]) {
    ++book.point;
    book.autoCard = true;
    book.finishPieceID = await createPiece(book, bookIdx, book.point);
    book.finishTimeSecs = await siyuan.currentTimeSec();
    await progStorage.resetBookInfo(book.bookID, book);
}
