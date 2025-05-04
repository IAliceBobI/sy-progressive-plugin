import { IProtyle } from "siyuan";
import { set_href, siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import * as utils from "../../sy-tomato-plugin/src/libs/utils";
import { events } from "../../sy-tomato-plugin/src/libs/Events";
import * as gconst from "../../sy-tomato-plugin/src/libs/gconst";
import { getCardsDoc, getHPathByDocID } from "./helper";
import { getBookID } from "../../sy-tomato-plugin/src/libs/progressive";
import { domNewLine, DomSuperBlockBuilder, getSpans } from "../../sy-tomato-plugin/src/libs/sydom";
import { getDocTracer, OpenSyFile2 } from "../../sy-tomato-plugin/src/libs/docUtils";
import { flashcardAddRefs, flashcardNotebook, flashcardUseLink, makeCardEnable, makeCardHereEnable, multilineMarkEnable, send2dailyCardEnable, send2dailyCardNoRefEnable, windowOpenStyle } from "../../sy-tomato-plugin/src/libs/stores";
import { BaseTomatoPlugin } from "../../sy-tomato-plugin/src/libs/BaseTomatoPlugin";
import { verifyKeyProgressive } from "../../sy-tomato-plugin/src/libs/user";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";

enum CardType {
    Here = "Here", None = "None"
}

export function getDailyPath() {
    const today = utils.timeUtil.dateFormat(new Date()).split(" ")[0];
    const [y, m] = today.split("-");
    return `/daily card/c${y}/c${y}-${m}/c${today}`;
}

function getDailyAttrValue() {
    const today = utils.timeUtil.dateFormat(new Date()).split(" ")[0];
    const [y, m, d] = today.split("-");
    return y + m + d;
}

function getBlockDOM(dom: HTMLElement): { dom: HTMLElement, blockID: string } {
    if (!dom) return {} as any;
    if (dom?.tagName?.toLocaleLowerCase() == "body") return {} as any;
    const blockID: string = dom.getAttribute(gconst.DATA_NODE_ID) ?? "";
    if (!blockID) return getBlockDOM(dom.parentElement);
    return { dom, blockID };
}

class FlashBox {
    private plugin: BaseTomatoPlugin;
    private settings: TomatoSettings;

    blockIconEvent(detail: any) {
        if (!this.plugin) return;
        if (makeCardEnable.get()) {
            detail.menu.addItem({
                iconHTML: "＋🗃️",
                accelerator: "⌥E",
                label: tomatoI18n.制卡,
                click: () => {
                    this.makeCard(detail.protyle, CardType.None);
                }
            });
        }
        if (makeCardHereEnable.get()) {
            detail.menu.addItem({
                iconHTML: "＋🗃️⬇️",
                accelerator: "⌥`",
                label: tomatoI18n.原地制卡,
                click: () => {
                    this.makeCard(detail.protyle, CardType.Here);
                }
            });
        }
        if (send2dailyCardEnable.get()) {
            detail.menu.addItem({
                iconHTML: "🗓️🗃️⭐",
                accelerator: "⌘`",
                label: tomatoI18n.制卡并发到dailycard,
                click: () => {
                    this.makeCard(detail.protyle, CardType.None, getDailyPath());
                }
            });
        }
        if (send2dailyCardNoRefEnable.get()) {
            detail.menu.addItem({
                iconHTML: "🗓️🗃️",
                accelerator: "⌥S",
                label: tomatoI18n.制卡并发到dailycard无引用,
                click: () => {
                    this.makeCard(detail.protyle, CardType.None, getDailyPath(), true);
                }
            });
        }
        if (multilineMarkEnable.get()) {
            detail.menu.addItem({
                iconHTML: "🪧",
                accelerator: "⌥D",
                label: tomatoI18n.多行标记,
                click: () => {
                    this.multilineMark(detail.protyle);
                }
            });
        }
    }

    async onload(plugin: BaseTomatoPlugin, settings: TomatoSettings) {
        this.plugin = plugin;
        this.settings = settings;
        this.plugin.addCommand({
            langKey: "insertBlankSpaceCard2025-4-28 15:32:50",
            langText: tomatoI18n.制卡,
            hotkey: "⌥E",
            callback: () => {
                this.makeCard(events.protyle?.protyle, CardType.None);
            },
        });
        this.plugin.addCommand({
            langKey: "原地制卡2025-4-28 15:37:07",
            langText: tomatoI18n.原地制卡,
            hotkey: "⌥`",
            callback: () => {
                this.makeCard(events.protyle?.protyle, CardType.Here);
            },
        });
        this.plugin.addCommand({
            langKey: "制卡并发到dailycard2025-4-28 15:43:53",
            langText: tomatoI18n.制卡并发到dailycard,
            hotkey: "⌘`",
            callback: () => {
                this.makeCard(events.protyle?.protyle, CardType.None, getDailyPath());
            },
        });
        this.plugin.addCommand({
            langKey: "send2dailyCardNoRef2025-4-28 15:45:42",
            langText: tomatoI18n.制卡并发到dailycard无引用,
            hotkey: "⌥S",
            callback: () => {
                this.makeCard(events.protyle?.protyle, CardType.None, getDailyPath(), true);
            },
        });
        this.plugin.addCommand({
            langKey: "cardMark2025-4-28 15:57:05",
            langText: tomatoI18n.多行标记,
            hotkey: "⌥D",
            editorCallback: (p) => this.multilineMark(p),
        });
        this.plugin.eventBus.on("open-menu-content", ({ detail }) => {
            const menu = detail.menu;
            if (makeCardEnable.get()) {
                menu.addItem({
                    label: tomatoI18n.制卡,
                    iconHTML: "＋🗃️",
                    accelerator: "⌥E",
                    click: () => {
                        const blockID = detail?.element?.getAttribute("data-node-id") ?? "";
                        const blank = detail?.range?.cloneContents()?.textContent ?? "";
                        if (blockID) {
                            this.blankSpaceCard(blockID, blank, detail?.range, detail?.protyle, CardType.None);
                        }
                    },
                });
            }
            if (makeCardHereEnable.get()) {
                menu.addItem({
                    label: tomatoI18n.原地制卡,
                    iconHTML: "＋🗃️⬇️",
                    accelerator: "⌥`",
                    click: () => {
                        const blockID = detail?.element?.getAttribute("data-node-id") ?? "";
                        const blank = detail?.range?.cloneContents()?.textContent ?? "";
                        if (blockID) {
                            this.blankSpaceCard(blockID, blank, detail?.range, detail?.protyle, CardType.Here);
                        }
                    },
                });
            }
            if (send2dailyCardEnable.get()) {
                menu.addItem({
                    label: tomatoI18n.制卡并发到dailycard,
                    iconHTML: "🗓️🗃️⭐",
                    accelerator: "⌘`",
                    click: () => {
                        const blockID = detail?.element?.getAttribute("data-node-id") ?? "";
                        const blank = detail?.range?.cloneContents()?.textContent ?? "";
                        if (blockID) {
                            this.blankSpaceCard(blockID, blank, detail?.range, detail?.protyle, CardType.None, getDailyPath());
                        }
                    },
                });
            }
            if (send2dailyCardNoRefEnable.get()) {
                menu.addItem({
                    label: tomatoI18n.制卡并发到dailycard无引用,
                    iconHTML: "🗓️🗃️",
                    accelerator: "⌥S",
                    click: () => {
                        const blockID = detail?.element?.getAttribute("data-node-id") ?? "";
                        const blank = detail?.range?.cloneContents()?.textContent ?? "";
                        if (blockID) {
                            this.blankSpaceCard(blockID, blank, detail?.range, detail?.protyle, CardType.None, getDailyPath(), true);
                        }
                    },
                });
            }
            if (multilineMarkEnable.get()) {
                detail.menu.addItem({
                    iconHTML: "🪧",
                    accelerator: "⌥D",
                    label: tomatoI18n.多行标记,
                    click: () => {
                        this.multilineMark(detail.protyle);
                    }
                });
            }
        });
    }

    async multilineMark(protyle: IProtyle) {
        const { selected, rangeText } = await events.selectedDivs(protyle);
        if (rangeText) {
            protyle.toolbar.setInlineMark(protyle, "mark", "range");
        } else if (selected.length > 0) {
            const ops = selected.map(div => {
                div.querySelectorAll("span").forEach(e => {
                    const t = e.getAttribute(gconst.DATA_TYPE);
                    if (!t) {
                        e.setAttribute(gconst.DATA_TYPE, "mark");
                    } else if (!t.includes("mark")) {
                        e.setAttribute(gconst.DATA_TYPE, t + " mark");
                    } else if (t.includes("mark")) {
                        e.setAttribute(gconst.DATA_TYPE, t.replaceAll("mark", ""));
                    }
                });
                utils.getAllContentEditableElements(div).forEach(e => {
                    e.childNodes.forEach(e => {
                        if (e.nodeType === 3) {
                            const s = document.createElement("span");
                            s.setAttribute(gconst.DATA_TYPE, "mark");
                            s.textContent = e.textContent;
                            e.parentElement.replaceChild(s, e);
                        }
                    });
                });
                const id = div.getAttribute(gconst.DATA_NODE_ID);
                return { id, domStr: div.outerHTML };
            }).filter(i => !!i.id);
            if (ops?.length > 0) protyle.getInstance().transaction(siyuan.transUpdateBlocks(ops) as any);
        }
    }

    // https://asciiflow.com
    //              ┌────────┐              ┌───────────┐
    //     ┌───────►│makeCard│─────────────►│ insertCard│
    //     │        └────────┘              └───────────┘
    //     │              │                    ▲         
    // ┌───┴─┐            │                    │         
    // │start│            │                    │         
    // └───┬─┘            │   ┌──────────────┐ │         
    //     └──────────────┴──►│blankSpaceCard│─┘         
    //                        └──────────────┘           
    private async makeCard(protyle: IProtyle, t: CardType, path?: string, noRef?: boolean) {
        if (!protyle) return;
        const { ids, divs } = await this.cloneSelectedLineMarkdowns(protyle, noRef);
        if (ids.length > 0) { // multilines
            await this.insertCard(protyle, divs, t, ids[ids.length - 1], path);
        } else {
            const blockID = events.lastBlockID;
            const range = document.getSelection()?.getRangeAt(0);
            const blank = range?.cloneContents()?.textContent ?? "";
            if (blockID) {
                this.blankSpaceCard(blockID, blank, range, protyle, t, path, noRef);
            }
        }
    }

    private async insertCard(protyle: IProtyle, divs: HTMLElement[], t: CardType, lastSelectedID: string, path?: string) {
        return navigator.locks.request("prog-FlashBox-insertCard", { mode: "exclusive" }, async (_lock) => {
            return this.doInsertCard(protyle, divs, t, lastSelectedID, path);
        });
    }

    private async doInsertCard(protyle: IProtyle, divs: HTMLElement[], t: CardType, lastSelectedID: string, path?: string) {
        const boxID = flashcardNotebook.get(a => {
            if (!a) return protyle.notebookId
            return a;
        });
        const docID = protyle.block?.rootID;
        if (!docID) return;
        let { bookID } = await getBookID(docID);
        const srcDocAttrs = await siyuan.getBlockAttrs(docID);
        const srcPriority = srcDocAttrs["custom-card-priority"];
        const { cardID, domStr, text } = await this.createList(divs, srcPriority);
        const ops = []
        if (path) {
            const targetDocID = await getDailyCardDocID(boxID, path);
            ops.push(...siyuan.transInsertBlocksAfter([domStr, domNewLine().outerHTML], await siyuan.getDocLastID(targetDocID)))
        } else if (t == CardType.Here) {
            ops.push(...siyuan.transInsertBlocksAfter([domStr, domNewLine().outerHTML], lastSelectedID))
        } else {
            let hpath = "";
            if (bookID && !this.settings.cardUnderPiece) {
                hpath = await getHPathByDocID(bookID, "cards");
            } else {
                hpath = await getHPathByDocID(docID, "cards");
                bookID = docID;
            }
            if (!hpath) return;
            const targetDocID = await getCardsDoc(bookID, boxID, hpath);
            ops.push(...siyuan.transInsertBlocksAfter([domStr, domNewLine().outerHTML], await siyuan.getDocLastID(targetDocID)))
        }

        if (this.settings.markOriginText && !(await events.isDocReadonly(protyle, srcDocAttrs))) {
            const { div } = await utils.getBlockDiv(lastSelectedID);
            if (this.settings.markOriginTextBG) (div as HTMLElement).style.backgroundColor = "var(--b3-font-background7)";
            const edit = utils.getContenteditableElement(div);
            if (edit) {
                const span = edit.appendChild(document.createElement("span")) as HTMLElement;
                set_href(span, cardID, "  &  ");
                ops.push(...siyuan.transUpdateBlocks([{ id: lastSelectedID, domStr: div.outerHTML }]))
            }
        }

        ops.push(siyuan.transAddRiffCards([cardID]))
        ops.push(siyuan.transDoUpdateUpdated(cardID))
        await siyuan.transactions(ops).then(() => {
            if (t !== CardType.Here) {
                OpenSyFile2(this.plugin, cardID, windowOpenStyle.get() as any, null, null, lastSelectedID);
            }
            siyuan.addRiffCards([cardID]) // for UI refresh only
            siyuan.pushMsg("⚡🗃" + text, 2000);
        })
    }

    private async createList(divs: HTMLElement[], srcPriority: string) {
        let originPath: string = "";
        let refPath: string = "";
        let inBookIdx: string = "";
        const spans: HTMLElement[] = [];
        if (flashcardAddRefs.get() && await verifyKeyProgressive()) {
            spans.push(...await getSpans(divs, await getDocTracer()));
        }
        for (const div of divs) {
            if (!originPath) originPath = div.getAttribute(gconst.ORIGIN_HPATH);
            if (!refPath) refPath = div.getAttribute(gconst.REF_HPATH);
            if (!inBookIdx) inBookIdx = div.getAttribute(gconst.IN_BOOK_INDEX);
            div.removeAttribute(gconst.RefIDKey)
            div.removeAttribute(gconst.IN_BOOK_INDEX)
            div.removeAttribute(gconst.PARAGRAPH_INDEX)
            div.removeAttribute(gconst.PROG_ORIGIN_TEXT)
            div.removeAttribute(gconst.PROG_KEY_NOTE)
            div.removeAttribute(gconst.PROG_PIECE_PREVIOUS)
            div.removeAttribute("custom-prog-words")
        }

        const builder = new DomSuperBlockBuilder();
        builder.setAttr("custom-super-card-box", "1");
        if (spans.length > 0) {
            const r = domNewLine();
            utils.prepend_refs(r, spans)
            builder.append(r);
        }

        divs.forEach((div) => {
            div.removeAttribute(gconst.ORIGIN_HPATH)
            div.removeAttribute(gconst.REF_HPATH)
            div.style.background = ""
            div.querySelectorAll(`span[${gconst.DATA_TYPE}="a"]`).forEach(e => {
                const t = e.textContent?.trim();
                if (t == "&" || t == "+") e.parentElement.removeChild(e);
            })
            builder.append(div);
        });

        if (divs.length == 1) {
            builder.append(domNewLine(), domNewLine())
        } else if (divs.length == 2) {
            builder.append(domNewLine())
        }

        if (this.settings.cardAppendTime) {
            if (originPath) {
                builder.append(domNewLine(`【${originPath}】`));
            } else if (refPath) {
                builder.append(domNewLine(`【${refPath}】`));
            }
            const now = utils.timeUtil.dateFormat(utils.timeUtil.now());
            builder.append(domNewLine(`【${now}】`));
        }
        const div = builder.build()
        if (srcPriority) div.setAttribute(gconst.CARD_PRIORITY, srcPriority);
        if (originPath) div.setAttribute(gconst.ORIGIN_HPATH, originPath);
        if (refPath) div.setAttribute(gconst.REF_HPATH, refPath);
        return { cardID: builder.id, div, domStr: div.outerHTML, text: div.textContent };
    }

    private async cloneSelectedLineMarkdowns(protyle: IProtyle, noRef?: boolean) {
        const multiLine = protyle?.element?.querySelectorAll(`.${gconst.PROTYLE_WYSIWYG_SELECT}`);
        const divs = [];
        let setRef = !noRef;
        let doSetPath = true;
        const ids = [];
        const ro = await events.isDocReadonly(protyle);
        for (const div of multiLine) {
            const { id, div: elem, setTheRef, setPath } = await this.cloneDiv(div as any, setRef, doSetPath);
            if (this.settings.markOriginText && !ro) if (this.settings.markOriginTextBG) (div as HTMLElement).style.backgroundColor = "var(--b3-font-background7)";
            if (setTheRef) setRef = false;
            if (setPath) doSetPath = false;
            ids.push(id);
            divs.push(elem);
        }
        if (this.settings.markOriginText && !ro) if (this.settings.markOriginTextBG) changeBGofseletedElement(ids);
        return { divs, ids };
    }

    private async cloneDiv(div: HTMLDivElement, setRef: boolean, setPath: boolean = true) {
        div = div.cloneNode(true) as HTMLDivElement;
        return utils.cleanDiv(div,
            setRef,//ref
            setRef,//ori
            this.settings.flashcardMultipleLnks,
            setPath,//ctx
            flashcardUseLink.get(),
        );
    }

    private async blankSpaceCard(blockID: string, selected: string, range: Range, protyle: IProtyle, cardType: CardType, path?: string, noRef?: boolean) {
        let tmpDiv: HTMLElement;
        const { dom } = getBlockDOM(range.endContainer.parentElement);
        if (!dom) return;
        const ro = await events.isDocReadonly(protyle);
        if (selected) {
            if (ro) dom.querySelectorAll(`div[${gconst.CONTENT_EDITABLE}="false"]`).forEach(e => e.setAttribute(gconst.CONTENT_EDITABLE, "true"));

            protyle.toolbar.setInlineMark(protyle, "mark", "range");
            const { div } = await this.cloneDiv(dom as HTMLDivElement, !noRef);
            protyle.toolbar.setInlineMark(protyle, "mark", "range");

            if (ro) dom.querySelectorAll(`div[${gconst.CONTENT_EDITABLE}="true"]`).forEach(e => e.setAttribute(gconst.CONTENT_EDITABLE, "false"));

            if (this.settings.markOriginTextBG && !ro) {
                protyle.toolbar.setInlineMark(protyle, "text", "range", { type: "backgroundColor", color: "var(--b3-font-background9)" });

                div.querySelectorAll('[data-type~="text"]').forEach((e: HTMLElement) => {
                    if (e.style.backgroundColor == "var(--b3-font-background9)") {
                        e.style.backgroundColor = "";
                    }
                });
                div.querySelectorAll('[data-type~="prog-marked"]').forEach((e: HTMLElement) => { // for old
                    const v = e.getAttribute("data-type").replace("prog-marked", "");
                    e.setAttribute("data-type", v);
                    e.style.backgroundColor = "";
                });
            }

            tmpDiv = div;
        } else {
            const { id, div } = await this.cloneDiv(dom as HTMLDivElement, !noRef);
            tmpDiv = div;
            if (this.settings.markOriginText && !ro) if (this.settings.markOriginTextBG) changeBGofseletedElement([id]);
        }
        await this.insertCard(protyle, [tmpDiv], cardType, blockID, path);
    }
}

export const flashBox = new FlashBox();


export async function getDailyCardDocID(boxID: string, path: string) {
    const v = getDailyAttrValue();
    const attr = {};
    attr[`custom-dailycard-${v}`] = v;
    const targetDocID = await utils.siyuanCache.createDocWithMdIfNotExists(5000, boxID, path, "", attr);
    return targetDocID;
}

async function changeBGofseletedElement(ids: any[]) {
    const attrs = { "style": "background-color: var(--b3-font-background7);" } as AttrType;
    return siyuan.batchSetBlockAttrs(ids.map(id => {
        return { id, attrs };
    }));
}

// const appendDiv = (() => {
//     let answer = new DomSuperBlockBuilder();
//     const a = (div: HTMLElement, idx: number = null) => {
//         if (idx === 0) {
//             builder = new DomSuperBlockBuilder();
//             const q = new DomSuperBlockBuilder();
//             prepend_refs(div, spans);
//             q.append(div);
//             builder.append(q.container);
//             builder.append(answer.container)
//             builder.setAttr("custom-super-card-box", "1");
//             q.setAttr("custom-super-card-question", "1");
//             answer.setAttr("custom-super-card-answer", "1");
//             answer.append(domNewLine())
//             answer = q;
//         } else {
//             answer.append(div);
//         }
//     }
//     return a;
// })();