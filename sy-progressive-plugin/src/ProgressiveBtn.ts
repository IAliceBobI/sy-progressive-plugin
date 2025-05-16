import { CONTENT_EDITABLE, SPACE } from "../../sy-tomato-plugin/src/libs/gconst";
import { getContenteditableElement, getSyElement } from "../../sy-tomato-plugin/src/libs/utils";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import { HtmlCBType } from "./constants";
import { prog } from "./Progressive";

const Prog_BUTTON = "custom-prog-button";
const Prog_BUTTON_NoteID = "custom-prog-button-noteID";
const Prog_BUTTON_BookID = "custom-prog-button-bookID";
const Prog_BUTTON_Point = "custom-prog-button-point";

export function addClickEvent(element: HTMLElement) {
    element?.querySelectorAll(`div[${Prog_BUTTON}]`).forEach((e: HTMLElement) => {
        e.addEventListener("click", btnProcessor);
        e.style.backgroundColor = "var(--b3-font-background11)";
        getContenteditableElement(e)?.setAttribute(CONTENT_EDITABLE, "false");
    });
}

export function getReadingBtns3(bookID: string, noteID: string, point: number) {
    return `{{{col
${btn(HtmlCBType.splitByPunctuations, "✂📜👑", tomatoI18n.按标点断句 + "VIP", bookID, noteID, point, prog.settings.btnSplitByPunctuations)}

${btn(HtmlCBType.splitByPunctuationsListCheck, "✂✅👑", tomatoI18n.按标点断句Checkbox + "VIP", bookID, noteID, point, prog.settings.btnSplitByPunctuationsListCheck)}

${btn(HtmlCBType.splitByPunctuationsList, "✂📌👑", tomatoI18n.按标点断句列表 + "VIP", bookID, noteID, point, prog.settings.btnSplitByPunctuationsList)}

${btn(HtmlCBType.nop, SPACE, "", bookID, noteID, point, false)}

${btn(HtmlCBType.nop, SPACE, "", bookID, noteID, point, false)}

${btn(HtmlCBType.nop, SPACE, "", bookID, noteID, point, false)}

${btn(HtmlCBType.nop, SPACE, "", bookID, noteID, point, false)}

}}}`.trim();
}

export function getReadingBtns2(bookID: string, noteID: string, point: number) {
    return `{{{col
${btn(HtmlCBType.openFlashcardTab, "⚡", tomatoI18n.打开本书的闪卡, bookID, noteID, point, prog.settings.btnOpenFlashcardTab)}

${btn(HtmlCBType.deleteAndBack, "⬅🗑", tomatoI18n.删除分片看上一个分片, bookID, noteID, point, prog.settings.btnDeleteBack)}

${btn(HtmlCBType.deleteAndNext, "🗑➡", tomatoI18n.删除分片看下一个分片, bookID, noteID, point, prog.settings.btnDeleteNext)}

${btn(HtmlCBType.AddDocCard, "＋🗃", tomatoI18n.将文档加入闪卡, bookID, noteID, point, prog.settings.btnSaveCard)}

${btn(HtmlCBType.DelDocCard, "－🗃", tomatoI18n.删除文档闪卡, bookID, noteID, point, prog.settings.btnDelCard)}

${btn(HtmlCBType.deleteAndExit, "🗑🕺", tomatoI18n.删除分片并退出, bookID, noteID, point, prog.settings.btnDeleteExit)}

${btn(HtmlCBType.ignoreBook, "🚫", tomatoI18n.不再推送本书, bookID, noteID, point, prog.settings.btnIgnoreBook)}

}}}`.trim();
}

export function getReadingBtns1(bookID: string, noteID: string, point: number) {
    return `{{{col
${btn(HtmlCBType.viewContents, "📜", tomatoI18n.打开目录, bookID, noteID, point, prog.settings.btnViewContents)}

${btn(HtmlCBType.previous, "⬅", tomatoI18n.上一个分片, bookID, noteID, point, prog.settings.btnPrevious)}

${btn(HtmlCBType.next, "➡", tomatoI18n.下一个分片, bookID, noteID, point, prog.settings.btnNext)}

${btn(HtmlCBType.cleanOriginText, "🧹", tomatoI18n.删除原文, bookID, noteID, point, prog.settings.btnCleanOriginText)}

${btn(HtmlCBType.fullfilContent, "⬇", tomatoI18n.重新插入分片内容, bookID, noteID, point, prog.settings.btnFullfilContent)}

${btn(HtmlCBType.quit, "🕺", tomatoI18n.关闭分片, bookID, noteID, point, prog.settings.btnStop)}

${btn(HtmlCBType.nextBook, "📚📖", tomatoI18n.换一本书看, bookID, noteID, point, prog.settings.btnNextBook)}

}}}`.trim();
}

export function btn(btnID: HtmlCBType, icon: string, tips: string, bookID: string, noteID: string, point: number, show: boolean) {
    if (!show) {
        return "";
    }
    return `${icon}
{: ${Prog_BUTTON}="${btnID}" memo="${tips}" ${Prog_BUTTON_NoteID}="${noteID}" ${Prog_BUTTON_BookID}="${bookID}" ${Prog_BUTTON_Point}="${point}"}`;
}

async function btnProcessor(ev: MouseEvent) {
    ev.stopPropagation();
    const e = getSyElement(ev.target as HTMLElement);
    if (!e) return;
    const cbType = Number(e.getAttribute(Prog_BUTTON)) as HtmlCBType;
    const bookID = e.getAttribute(Prog_BUTTON_BookID);
    if (cbType == HtmlCBType.nop) {
        //
    } else if (cbType == HtmlCBType.readThisBlock) {
        const blockID = bookID;
        await prog.readThisPiece(blockID);
    } else {
        const noteID = e.getAttribute(Prog_BUTTON_NoteID);
        const point = Number(e.getAttribute(Prog_BUTTON_Point));
        await prog.htmlBlockReadNextPeice(bookID, noteID, cbType, point);
    }
}

export function getContentPrefix(level: number) {
    const h = level > 1 ? "|" : "";
    const s = "　　".repeat(level - 1);
    const d = ["", "", "", "", "", "", "", "", ""][level];
    // const d = ["[Z]", "[A]", "[B]", "[C]", "[D]", "[E]", "[F]", "[G]", "[H]"][level];
    return h + s + d;
}