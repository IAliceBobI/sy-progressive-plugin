import { IProtyle } from "siyuan";
import { siyuan, } from "../../sy-tomato-plugin/src/libs/utils";
import * as utils from "../../sy-tomato-plugin/src/libs/utils";
import { events } from "../../sy-tomato-plugin/src/libs/Events";
import * as gconst from "../../sy-tomato-plugin/src/libs/gconst";
import { getCardsDoc, getHPathByDocID } from "./helper";
import { getBookID } from "../../sy-tomato-plugin/src/libs/progressive";
import { domNewLine, DomSuperBlockBuilder, getSpans } from "../../sy-tomato-plugin/src/libs/sydom";
import { getDocTracer, OpenSyFile2 } from "../../sy-tomato-plugin/src/libs/docUtils";
import { card2dailycard, flashcardAddRefs, flashcardNotebook, flashcardUseLink, windowOpenStyle } from "../../sy-tomato-plugin/src/libs/stores";
import { BaseTomatoPlugin } from "../../sy-tomato-plugin/src/libs/BaseTomatoPlugin";
import { verifyKeyProgressive } from "../../sy-tomato-plugin/src/libs/user";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import { winHotkey } from "../../sy-tomato-plugin/src/libs/winHotkey";

export enum CardType {
    Here = "Here", None = "None"
}

export function getDailyPath() {
    const today = utils.timeUtil.dateFormat(new Date()).split(" ")[0];
    const [y, m] = today.split("-");
    return `/daily card/c${y}/c${y}-${m}/c${today}`;
}

export function getDailyAttrValue() {
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

export const flashBox制卡 = winHotkey("⌥E", "制卡", "＋🗃️", () => tomatoI18n.制卡)
export const flashBox原地制卡 = winHotkey("⌥`", "原地制卡", "＋🗃️⬇️", () => tomatoI18n.原地制卡)
export const flashBox制卡并发到dailycard = winHotkey("⌘`", "制卡并发到dailycard", "🗓️🗃️⭐", () => tomatoI18n.制卡并发到dailycard)
export const flashBox制卡并发到dailycard无引用 = winHotkey("⌥S", "制卡并发到dailycard无引用", "🗓️🗃️", () => tomatoI18n.制卡并发到dailycard无引用) // □14 拍板免费（制卡=核心复习流，不设门）
export const flashBox多行标记 = winHotkey("shift+alt+enter", "多行标记", "🪧", () => tomatoI18n.多行标记)

class FlashBox {
    private plugin: BaseTomatoPlugin;
    private settings: TomatoSettings;

    async onload(plugin: BaseTomatoPlugin, settings: TomatoSettings) {
        this.plugin = plugin;
        this.settings = settings;
        await verifyKeyProgressive();

        this.plugin.addCommand({
            langKey: flashBox制卡.langKey,
            langText: flashBox制卡.langText(),
            hotkey: flashBox制卡.m,
            callback: () => {
                this.makeCard(events.protyle?.protyle, CardType.None);
            },
        });
        this.plugin.addCommand({
            langKey: flashBox原地制卡.langKey,
            langText: flashBox原地制卡.langText(),
            hotkey: flashBox原地制卡.m,
            callback: () => {
                this.makeCard(events.protyle?.protyle, CardType.Here);
            },
        });
        this.plugin.addCommand({
            langKey: flashBox制卡并发到dailycard.langKey,
            langText: flashBox制卡并发到dailycard.langText(),
            hotkey: flashBox制卡并发到dailycard.m,
            callback: () => {
                this.makeCard(events.protyle?.protyle, CardType.None, getDailyPath());
            },
        });
        this.plugin.addCommand({
            langKey: flashBox制卡并发到dailycard无引用.langKey,
            langText: flashBox制卡并发到dailycard无引用.langText(),
            hotkey: flashBox制卡并发到dailycard无引用.m,
            callback: () => {
                if (flashBox制卡并发到dailycard无引用.cmd()) {
                    this.makeCard(events.protyle?.protyle, CardType.None, getDailyPath(), true);
                }
            },
        });
        this.plugin.addCommand({
            langKey: flashBox多行标记.langKey,
            langText: flashBox多行标记.langText(),
            hotkey: flashBox多行标记.m,
            editorCallback: (p) => this.multilineMark(p),
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
    // │start│            │
    // └───┬─┘            │   ┌──────────────┐ │
    //     └──────────────┴──►│blankSpaceCard│─┘
    //                        └──────────────┘
    /** v5 □7：制卡入口收进浮条 [+] 高级功能 + 命令面板（右键菜单/块图标菜单退役） */
    async makeCard(protyle: IProtyle, t: CardType, path?: string, noRef?: boolean) {
        if (!protyle) return;
        const { ids, divs } = await this.cloneSelectedLineMarkdowns(protyle, noRef);
        if (ids.length > 0) { // multilines
            await this.insertCard(protyle, divs, t, ids[ids.length - 1], path);
        } else {
            const blockID = events.lastBlockID; // getCursorElement
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
        } else if (card2dailycard.get()) {
            // □3 制卡统一归置（2026-09-01 拍板）：默认制卡并入当日 daily card 文档（与 ⌘｀ 同款
            // 落点）；设置关闭后回落 cards 夹旧路线（cardUnderPiece 分叉保持原语义）
            const targetDocID = await getDailyCardDocID(boxID, getDailyPath());
            ops.push(...siyuan.transInsertBlocksAfter([domStr, domNewLine().outerHTML], await siyuan.getDocLastID(targetDocID)))
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

        // □12 摘抄标记零触碰统一：markOriginText 退役——制卡后原文不再写 & 链接/背景
        // （原文痕迹唯一机制=digestMarker span，摘抄侧覆盖）

        ops.push(siyuan.transDoUpdateUpdated(cardID))
        await siyuan.transactions(ops).then(() => {
            if (t !== CardType.Here) {
                OpenSyFile2(this.plugin, cardID, windowOpenStyle.get() as any, null, null, lastSelectedID);
            }
            // SiYuan 3.8.0 起事务会校验 addFlashcards 的目标块已存在于块树，新卡片块不能在同一事务内注册；
            // /api/transactions 返回前事务已落盘（FlushTxQueue），此处注册安全
            siyuan.addRiffCards([cardID])
            siyuan.pushMsg("⚡🗃" + text, 2000);
        })
    }

    private async createList(divs: HTMLElement[], srcPriority: string) {
        let originPath: string = "";
        let refPath: string = "";
        let inBookIdx: string = "";
        const spans: HTMLElement[] = [];
        if (flashcardAddRefs.get()) {
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
        for (const div of multiLine) {
            const { id, div: elem, setTheRef, setPath } = await this.cloneDiv(div as any, setRef, doSetPath);
            if (setTheRef) setRef = false;
            if (setPath) doSetPath = false;
            ids.push(id);
            divs.push(elem);
        }
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

            tmpDiv = div;
        } else {
            const { div } = await this.cloneDiv(dom as HTMLDivElement, !noRef);
            tmpDiv = div;
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