export const STORAGE_BOOKS = "books.json";
export const TryAddStarsLock = "TryAddStarsLock";
export const ProgressiveAddBtnListenersLock = "ProgressiveAddBtnListenersLock";
export const AddProgressiveReadingLock = "AddProgressiveReadingLock";
export const BuildContentsLock = "BuildContentsLock";
export const StartToLearnLock = "StartToLearnLock";
export const IndexTime2Wait = 400;
export const NotVIPMaxPlannedBooks = 4;

export enum HtmlCBType {
    previous = 0,
    deleteAndNext = 1,
    AddDocCard = 2,
    // saveDoc = 3,
    quit = 4,
    nextBook = 5,
    next = 6,
    ignoreBook = 7,
    fullfilContent = 8,
    // cleanUnchanged = 9,
    DelDocCard = 10,
    deleteAndExit = 11,
    openFlashcardTab = 12,
    deleteAndBack = 13,
    viewContents = 14,
    splitByPunctuations = 15,
    splitByPunctuationsList = 16,
    splitByPunctuationsListCheck = 17,
    cleanOriginText = 18,
    readThisBlock = 19,
    nop = 20,
}