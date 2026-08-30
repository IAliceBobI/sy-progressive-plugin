import { IProtyle } from "siyuan";
import { getAllEditor } from "siyuan";
import { CONTENT_EDITABLE, MarkKey, PDIGEST_CTIME, } from "../../sy-tomato-plugin/src/libs/gconst";
import { getActiveDocID, getContenteditableElement, getSyElement, isEditor, siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import { HtmlCBType } from "./constants";
import { prog } from "./Progressive";
import { events } from "../../sy-tomato-plugin/src/libs/Events";
import { into, setGlobal } from "stonev5-utils";
import { mount, unmount } from "svelte";
import ProgressiveFloatBtns from "./ProgressiveFloatBtns.svelte";
import { hideBtnsInFlashCard, initProgFloatBtnsDisable, writableWithGet } from "../../sy-tomato-plugin/src/libs/stores";
import { FloatDocKind } from "./progFloatState";
import { parseBookIDFromCtime } from "./progData";
import { progStorage } from "./ProgressiveStorage";
import { formatDueCount } from "./progFloatState";
import { markDigests } from "./digestMarker";

const Prog_BUTTON = "custom-prog-button";
const Prog_BUTTON_NoteID = "custom-prog-button-noteID";
const Prog_BUTTON_BookID = "custom-prog-button-bookID";
const Prog_BUTTON_Point = "custom-prog-button-point";

// v5 □5 浮条三态 stores：show=体系内文档在场（球或浮条），expanded=浮条展开（false 时收起为球）。
// 片态出场直接展开（userCollapsed 记录用户 ✕ 收起偏好，session 级）；书/摘抄态出场收起成球。
let show = writableWithGet(false)
let expanded = writableWithGet(false)
let kind = writableWithGet<FloatDocKind | null>(null)
let title = writableWithGet("")
let point = writableWithGet(0)
let noteID = writableWithGet("")
let bookID = writableWithGet("")
let zIndexPlus = writableWithGet(false)
let dueText = writableWithGet("")        // 附属卡到期胶囊文案（空=不渲染，formatDueCount 产出）
let digOpen = writableWithGet(false)     // 摘抄子排展开（⇧⌥Z 改道入口也驱动它）
let userCollapsed = false;               // session 级：用户点 ✕ 后本会话片态也收起成球

export function progFloatStores() {
    return { show, expanded, kind, title, point, noteID, bookID, zIndexPlus, dueText, digOpen };
}

// DigestProgressiveBox ⌥z 改道需要读出场态（show+kind=当前文档在三态内）
export { show, kind };

/** 展开浮条（球点击 / 命令通道）；userCollapsed 随之清掉 */
export function expandFloatBar() {
    userCollapsed = false;
    expanded.set(true);
}

/** 收起为球（浮条 ✕）；记住用户偏好，本会话片态出场不再强展开 */
export function collapseFloatBar() {
    userCollapsed = true;
    expanded.set(false);
    digOpen.set(false);
}

/** 展开浮条并打开摘抄子排（⌥z 摘抄模式命令在三态文档内的改道出口） */
export function openDigestSubrank() {
    expandFloatBar();
    digOpen.set(true);
}

// □11 自由态（第四态）：会话级上岗/下班——上岗后本会话所有普通文档浮条都到场，
// 浮条 ✕=本会话收起（同 userCollapsed 先例，session 级不落盘）。三态文档出场不受影响。
let freeSession = false;

/** 自由态上岗（状态栏 ✂ 钮 / ⌥Z 在普通文档的改道出口）。三态文档在场=聚焦浮条+
 *  展开子排；普通文档=自由态上岗并立刻出场（withSubrank=⌥Z 通道顺手展开摘抄子排）。
 *  编辑器解析不出时只置上岗位，下次出场事件（点击编辑器/切页签）自然带出浮条。 */
export async function toggleFreeFloat(withSubrank = false) {
    if (show.get() && kind.get()) {
        openDigestSubrank();
        return;
    }
    freeSession = true;
    // 出场求值：优先最近交互的编辑器，兜底按激活页签文档 ID 匹配
    // （文档树点开还没点内容时 events.protyle 为空，同 addProgressiveReading 先例）
    let protyle = events.protyle?.protyle ?? null;
    if (!protyle) {
        const docID = getActiveDocID();
        if (docID) {
            protyle = getAllEditor().find(p => p?.protyle?.block?.rootID === docID)?.protyle ?? null;
        }
    }
    if (protyle) {
        await progressiveBtnFloating(protyle);
        if (withSubrank && kind.get() === "free") digOpen.set(true);
    }
}

/** 自由态下班（浮条 ✕）：本会话普通文档不再出浮条；可随时再上岗（✂ 钮/⌥Z） */
export function freeFloatOff() {
    freeSession = false;
    show.set(false);
}

// 浮条不可见即清子排（reasoning review P2-5）：show.set(false) 系路径（离开三态文档/
// 系统开关/闪卡预览）不清 digOpen，⇧⌥Z 开子排后快捷键切走再回来会带旧开合态——在
// store 所在地订阅一次兜底（□8 组件 $effect 随 moreOpen/advOpen 退役删除，此为等价覆盖）
show.subscribe(v => { if (!v) digOpen.set(false); });

export function initProgFloatBtns() {
    if (initProgFloatBtnsDisable.get()) {
        return;
    }
    const btns = setGlobal("initProgFloatBtns 2025-07-15 23:47:53", mount(ProgressiveFloatBtns, {
        target: document.body,
        props: {
            show, expanded, kind, title, point, noteID, bookID, zIndexPlus, dueText, digOpen,
        }
    }));
    if (btns != null) {
        unmount(btns);
    }
}

/** 附属卡到期数：doc deck 挂 digest-书名 夹，getTreeRiffDueCards 按子树查（出场时异步刷新，防抖 bookID） */
let lastDueKey = "";
async function refreshDue(dirKey: string) {
    if (dirKey === lastDueKey) return;
    lastDueKey = dirKey;
    try {
        const dirID = await progStorage.ensureDigestDir(dirKey);
        if (!dirID || lastDueKey !== dirKey) return;
        const ret = await siyuan.getTreeRiffDueCards(dirID);
        if (lastDueKey !== dirKey) return;
        dueText.set(formatDueCount(ret?.unreviewedCount ?? 0));
    } catch (e) {
        console.error("prog float due refresh failed", e);
    }
}

/** 浮条系统总开关（设置项+命令共用）：关=不出球不出浮条（出场 gate） */
export function toggleFloatBarSystem() {
    const next = !initProgFloatBtnsDisable.get();
    initProgFloatBtnsDisable.set(next);
    if (next) {
        show.set(false);
    } else expanded.set(false); // 重开后各文档重新出场（球/片态展开）
}
// （□11.1「片内双色」.prog-piece-live 挂类/清类逻辑已随 2026-08-30 用户实测反馈退役——
// 原文灰显+笔记继承属性同色没法分清，回归原文不做色彩修饰的老形态，CSS 与本体同批移除）

export async function progressiveBtnFloating(protyle: IProtyle, closed = false) {
    if (closed) {
        // destroy_protyle 只收浮条、不做任何全局态清理：被销毁视图的 DOM 随页签消亡，全局
        // 清理会误伤仍存活的视图（□20 实锤：读下一篇链新片挂载态被旧片 destroy 抹掉；分屏
        // 关一方同理——「派发点紧跟 DOM 移除」已逐族核验 /opt/projects/siyuan
        // app/src/protyle/util/destroy.ts，思源升级若改 destroy 语义需复核此处）。
        // 宿主 gate：noteID 只可能被编辑器或闪卡预览宿主写入，其它 protyle（块引浮窗/搜索
        // 预览/历史版本视图）销毁时宿主页签还开着，不收浮条。
        const canHost = isEditor(protyle) || protyle.element.classList.contains("card__block");
        if (canHost && events.getInfo(protyle).docID == noteID.get()) {
            show.set(false)
        }
        return;
    }
    if (initProgFloatBtnsDisable.get()) {
        show.set(false);
        return;
    }
    let { attrs, docID, name } = events.getInfo(protyle)
    zIndexPlus.set(false);
    if (protyle.element.classList.contains("card__block")) {
        // 闪卡预览里显示的是分片：维持片态出场（hideBtnsInFlashCard 可关）；
        // □11 free 态不进闪卡预览（普通文档的卡预览弹 free 浮条违反直觉，review P2）
        if (events.isMobile || hideBtnsInFlashCard.get() || freeSession) {
            show.set(false);
            return;
        }
        attrs = await siyuan.getBlockAttrs(docID)
        name = attrs.title;
        zIndexPlus.set(true);
    } else {
        if (!isEditor(protyle)) {
            return;
        }
    }

    // v5 三态识别（判据优先级 pdigest > mark > books，与 progFloatState.detectFloatKind 一致：
    // 真实 digest 文档自带片形状 custom-progmark 防删护栏，mark 优先会误判成片）
    const { _bookID, _point, _digestBookID, _isBook } = into(() => {
        const mark = attrs?.[MarkKey]?.split("#")?.at(1)?.split(",") ?? [];
        const digestBookID = attrs?.[PDIGEST_CTIME] ? parseBookIDFromCtime(attrs[PDIGEST_CTIME]) : "";
        return {
            _bookID: mark[0],
            _point: parseInt(mark[1]),
            _digestBookID: digestBookID,
            _isBook: Object.prototype.hasOwnProperty.call(progStorage.booksInfos(), docID ?? ""),
        };
    });

    let nextKind: FloatDocKind | null = null;
    let nextBookID = "";
    let nextPoint = 0;
    if (_digestBookID) {
        nextKind = "digest";
        nextBookID = _digestBookID;
    } else if (_bookID != null && _bookID !== "" && Number.isInteger(_point)) {
        nextKind = "piece";
        nextBookID = _bookID;
        nextPoint = _point;
    } else if (_isBook) {
        nextKind = "book";
        nextBookID = docID;
    }

    // □11 自由态：普通文档（非三态）在自由态上岗时以 free 态出场（✂📥 两键）
    if (docID == null || (nextKind == null && !freeSession)) {
        show.set(false);
        return;
    }
    if (nextKind == null) nextKind = "free";

    // 同文档重复触发（click-editorcontent 等）不重置展开态；跨文档按态重置
    const docChanged = docID !== noteID.get() || nextKind !== kind.get();
    show.set(true);
    noteID.set(docID);
    kind.set(nextKind);
    title.set(name);
    point.set(nextPoint);
    bookID.set(nextBookID);
    if (docChanged) {
        digOpen.set(false);
        // 片态直接展开（尊重 userCollapsed）；free 态出场直接展开不收球（□11）
        expanded.set((nextKind === "piece" && !userCollapsed) || nextKind === "free");
        if (nextBookID) refreshDue(nextBookID);
    }
    // 摘抄痕迹：片态（块 custom-progref 命中）与书态原文（块 ID 即 ref 值）双侧打标。
    // □15 移出 docChanged：出场链由五种事件驱动（含 loaded_protyle_dynamic），protyle
    // 懒加载双向窗口（向下滚出新块 + 顶部折叠重展开）都会丢标须重打；幂等清旧重打，
    // refMap 60s 缓存兜底开销。
    if (nextKind === "piece" || nextKind === "book") {
        markDigests(protyle, nextBookID).catch(() => { });
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

/** 滚筒换书（公共组 🔄）：无参 startToLearn 走滚筒出下一本（出片即轮转） */
export async function floatSwapBook() {
    await prog.startToLearnWithLock();
}
