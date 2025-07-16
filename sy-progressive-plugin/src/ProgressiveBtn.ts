import { IProtyle } from "siyuan";
import { CONTENT_EDITABLE, } from "../../sy-tomato-plugin/src/libs/gconst";
import { getContenteditableElement, getSyElement, siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import { HtmlCBType } from "./constants";
import { prog } from "./Progressive";
import { events } from "../../sy-tomato-plugin/src/libs/Events";
import { into, setGlobal } from "stonev5-utils";
import { mount, unmount } from "svelte";
import ProgressiveFloatBtns from "./ProgressiveFloatBtns.svelte";
import { writableWithGet } from "../../sy-tomato-plugin/src/libs/stores";

const Prog_BUTTON = "custom-prog-button";
const Prog_BUTTON_NoteID = "custom-prog-button-noteID";
const Prog_BUTTON_BookID = "custom-prog-button-bookID";
const Prog_BUTTON_Point = "custom-prog-button-point";

let show = writableWithGet(false)
let title = writableWithGet("")
let point = writableWithGet(0)
let noteID = writableWithGet("")
let bookID = writableWithGet("")
let zIndexPlus = writableWithGet(false)

export function initProgFloatBtns() {
    const btns = setGlobal("initProgFloatBtns 2025-07-15 23:47:53", mount(ProgressiveFloatBtns, {
        target: document.body,
        props: {
            show, title, point, noteID, bookID, zIndexPlus,
        }
    }));
    if (btns != null) {
        unmount(btns);
    }
}

export async function progressiveBtnFloating(protyle: IProtyle) {
    let { attrs, docID, name } = events.getInfo(protyle)
    zIndexPlus.set(false);
    if (protyle.element.classList.contains("card__block")) {
        attrs = await siyuan.getBlockAttrs(docID)
        name = attrs.title;
        zIndexPlus.set(true);
    }
    const { _bookID, _point } = into(() => {
        // "插件管理勿改managedByPluginDoNotModify#20240123151020-gpjyj0l,0"
        const [_bookID, idxStr] = attrs?.["custom-progmark"]?.split("#")?.at(1)?.split(",") ?? []
        return { _bookID, _point: parseInt(idxStr) }
    });

    if (_bookID != null && docID != null && Number.isInteger(_point)) {
        show.set(true)
        noteID.set(docID)
        title.set(name)
        point.set(_point)
        bookID.set(_bookID)
    } else {
        show.set(false)
    }
}

export function addClickEvent(element: HTMLElement) {
    element?.querySelectorAll(`div[${Prog_BUTTON}]`).forEach((e: HTMLElement) => {
        e.addEventListener("click", btnProcessor);
        e.style.backgroundColor = "var(--b3-font-background11)";
        getContenteditableElement(e)?.setAttribute(CONTENT_EDITABLE, "false");
    });
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