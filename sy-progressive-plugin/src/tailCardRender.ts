// □2（3.8.3 升级战役）渐进片尾收束卡——渲染器与插卡通道。
// 注册面（exp/apirenew-report.md 硬事实）：plugin.customBlockRenders["tail-card"] =
// { render({element, content}) => dispose? }；element=DIV.custom-block__content（块 id 在宿主
// [data-node-id]）；事务/切页签 dispose→render 成对；内核对 content 元素已做 30 类编辑器事件
// 隔离（卡内按钮不扰编辑器）。旧内核（<3.8.3）无此注册面→不注册不建卡（<pre> 降级不触发）。
// 动作接线复用 HtmlCBType 族（htmlBlockReadNextPeice）与 Progressive 引擎方法，与浮条同链
// （同动作跨入口同语义）；选中类动作（摘抄/制卡/收集）不上卡——归宿=快捷键+浮条（拍板）。
// 防御守卫：闪卡预览宿主（.card__block，浮条先例 ProgressiveBtn.ts 同判法）同源渲染时
// 隐全部动作钮与胶囊，只留静态头（防复习现场点「下一片」搅局）。
import { icon } from "../../sy-tomato-plugin/src/libs/utils";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
import { pieceTailCard } from "../../sy-tomato-plugin/src/libs/stores";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import { HtmlCBType } from "./constants";
import { prog } from "./Progressive";
import { digestProgressiveBox } from "./DigestProgressiveBox";
import { openRefillMenu } from "./refillMenu";
import { openFloatPopover, closeFloatPopover } from "./overlays";
import { showFloatTip, hideFloatTip } from "./floatTip";
import DigestTreePopover from "./DigestTreePopover.svelte";
import { formatDueCount } from "./progFloatState";
import { capsuleTodayText, capsuleBookDue } from "./tailCardAppend";
import {
    TAIL_CARD_BLOCK_TYPE, markTailCardRegistered, parseTailCardContent, TailCardBlockData,
} from "./tailCardBlock";

/** 最小注册面接口（siyuan 类型声明无 customBlockRenders，结构化窄化避免 as any 满天飞） */
export interface CustomBlockPlugin {
    customBlockRenders?: Record<string, unknown>;
}

export function registerTailCardRender(plugin: CustomBlockPlugin): void {
    if (!plugin.customBlockRenders) return; // <3.8.3：不注册，建卡链也不会触发
    plugin.customBlockRenders[TAIL_CARD_BLOCK_TYPE] = {
        render: ({ element, content }: { element: HTMLElement; content: string }) => {
            renderCard(element, content);
        },
    };
    markTailCardRegistered(true); // 建卡通道（tailCardAppend 轻量层）的支持判据
}

// ============ 动作表（与浮条同链同语义；data-act 供 e2e 定位） ============

interface TailAction {
    act: string;
    icon: string;
    label: () => string;
    /** 悬停长说明（复用路线指引长文案键） */
    tip?: () => string;
    primary?: boolean;
    run: (d: TailCardBlockData, ev: MouseEvent) => void | Promise<void>;
}

const pieceActions = (): TailAction[] => [
    {
        act: "next", icon: "iconProgNext", primary: true,
        label: () => tomatoI18n.下片删, tip: () => tomatoI18n.路线片下一片,
        run: d => prog.htmlBlockReadNextPeice(d.bookID, d.docID, HtmlCBType.deleteAndNext, d.point),
    },
    {
        act: "nextPure", icon: "iconProgFFast",
        label: () => tomatoI18n.下一个分片, tip: () => tomatoI18n.路线片下一片纯,
        run: d => prog.htmlBlockReadNextPeice(d.bookID, d.docID, HtmlCBType.next, d.point),
    },
    {
        act: "delBack", icon: "iconProgDelBack",
        label: () => tomatoI18n.上片删,
        run: d => prog.htmlBlockReadNextPeice(d.bookID, d.docID, HtmlCBType.deleteAndBack, d.point),
    },
    {
        act: "delExit", icon: "iconProgDelExit",
        label: () => tomatoI18n.删片退出,
        run: d => prog.htmlBlockReadNextPeice(d.bookID, d.docID, HtmlCBType.deleteAndExit, d.point),
    },
    {
        act: "quit", icon: "iconProgQuit",
        label: () => tomatoI18n.关闭分片,
        run: d => prog.htmlBlockReadNextPeice(d.bookID, d.docID, HtmlCBType.quit, d.point),
    },
    {
        act: "refill", icon: "iconProgRefill",
        label: () => tomatoI18n.重插,
        run: (d, ev) => openRefillMenu(ev, stype => prog.refillPiece(d.bookID, d.docID, d.point, stype)),
    },
    {
        act: "clean", icon: "iconProgClean",
        label: () => tomatoI18n.删原文,
        run: d => prog.htmlBlockReadNextPeice(d.bookID, d.docID, HtmlCBType.cleanOriginText, d.point),
    },
    {
        act: "prev", icon: "iconProgPrev",
        label: () => tomatoI18n.回看,
        run: d => prog.htmlBlockReadNextPeice(d.bookID, d.docID, HtmlCBType.previous, d.point),
    },
    {
        act: "origin", icon: "iconProgBook",
        label: () => tomatoI18n.回原书,
        run: d => prog.returnToOriginFromPiece(d.docID, d.bookID),
    },
    {
        act: "swap", icon: "iconProgSwap",
        label: () => tomatoI18n.换书,
        run: () => prog.startToLearnWithLock(),
    },
    {
        act: "addBook", icon: "iconProgAddBook",
        label: () => tomatoI18n.加书,
        run: d => prog.addProgressiveReadingWithLock(d.docID),
    },
];

const digestActions = (): TailAction[] => [
    {
        act: "recite", icon: "iconProgSend", primary: true,
        label: () => tomatoI18n.送进仿写, tip: () => tomatoI18n.路线摘抄送仿写,
        run: () => prog.sendToRecite(),
    },
    {
        act: "origin", icon: "iconProgBook",
        label: () => tomatoI18n.回原书,
        run: d => prog.openOriginFromDigest(d.docID, []), // 拍板：digest 态动作全文档级，不带选区
    },
    {
        act: "tree", icon: "iconProgTree",
        label: () => tomatoI18n.路线图,
        run: (d, ev) => {
            openFloatPopover({
                title: tomatoI18n.路线图,
                x: ev.clientX, y: ev.clientY,
                component: DigestTreePopover,
                props: {
                    bookID: d.bookID,
                    onJump: (id: string) => {
                        closeFloatPopover();
                        void prog.jumpTo(id);
                    },
                },
            });
        },
    },
    {
        act: "summary", icon: "iconProgQuill",
        label: () => tomatoI18n.摘抄汇总,
        run: d => prog.openDigestSummary(d.bookID),
    },
    {
        act: "redigest", icon: "iconProgScissors",
        label: () => tomatoI18n.再摘抄, tip: () => tomatoI18n.路线摘抄再摘抄,
        run: () => digestProgressiveBox.digestModeToggle(),
    },
];

// ============ 渲染 ============

function mkBtn(a: TailAction, d: TailCardBlockData): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `prog-tailcard__btn${a.primary ? " prog-tailcard__btn--primary" : ""}`;
    b.dataset.act = a.act;
    const tip = a.tip?.() ?? a.label();
    // tooltip 走自建 #prog-float-tip 单例（浮条同款，AGENTS 军规：勿原生 title——长文案
    // 左缘裁剪坑）；aria-label=单例数据源+无障碍
    b.setAttribute("aria-label", tip);
    b.addEventListener("mouseenter", () => showFloatTip(b));
    b.addEventListener("mouseleave", hideFloatTip);
    b.innerHTML = `${icon(a.icon, 13)}<span class="prog-tailcard__blabel">${a.label()}</span>`;
    // stopPropagation 双保险（btnProcessor 先例）：内核事件隔离外再挡一道冒泡
    b.addEventListener("click", ev => {
        ev.stopPropagation();
        debugLog("prog.tailcard", `action ${a.act} kind=${d.kind} doc=${d.docID}`, "progressive");
        void a.run(d, ev);
    });
    return b;
}

function renderCard(element: HTMLElement, content: string): void {
    const data = parseTailCardContent(content);
    if (!data) {
        const tip = document.createElement("div");
        tip.className = "prog-tailcard__broken";
        tip.textContent = "…";
        element.append(tip);
        return;
    }
    const card = document.createElement("div");
    const off = pieceTailCard.get() === false;
    card.className = `prog-tailcard prog-tailcard--${data.kind}${off ? " prog-tailcard--off" : ""}`;

    // ---- 头行：态标题 + （片态）胶囊加菜：今日配额 / 附属卡到期 ----
    const head = document.createElement("div");
    head.className = "prog-tailcard__head";
    const title = document.createElement("span");
    title.className = "prog-tailcard__title";
    title.textContent = data.kind === "piece" ? tomatoI18n.路线组读完这片 : tomatoI18n.路线指引摘抄;
    head.append(title);
    card.append(head);

    // 总开关关（bear 拍板 2026-09-08）：存量卡降为一行细静条（不可点、可整块手删，不自动清理）
    if (off) {
        element.append(card);
        return;
    }

    // 闪卡预览宿主：只留静态头（隐动作钮+胶囊——复习现场点「下一片」会搅局，浮条先例同判法）
    if (element.closest(".card__block")) {
        element.append(card);
        return;
    }
    debugLog("prog.tailcard", `render kind=${data.kind} doc=${data.docID}`, "progressive");

    const actions = data.kind === "piece" ? pieceActions() : digestActions();
    const rowMain = document.createElement("div");
    rowMain.className = "prog-tailcard__row";
    const rowRest = document.createElement("div");
    rowRest.className = "prog-tailcard__row prog-tailcard__row--wrap";
    for (const a of actions) {
        (a.primary ? rowMain : rowRest).append(mkBtn(a, data));
    }
    card.append(rowMain, rowRest);

    // ---- 片态胶囊：今日 n/q（只读）+ 附属卡·到期 N（点击=开附属卡复习）----
    if (data.kind === "piece") {
        const chips = document.createElement("span");
        chips.className = "prog-tailcard__chips";
        head.append(chips);
        const today = document.createElement("span");
        today.className = "prog-tailcard__chip prog-tailcard__chip--today";
        today.textContent = "…";
        chips.append(today);
        void capsuleTodayText().then(t => {
            if (today.isConnected) today.textContent = t;
        }).catch(() => { today.remove(); });
        const cardsChip = document.createElement("button");
        cardsChip.type = "button";
        cardsChip.className = "prog-tailcard__chip prog-tailcard__chip--cards";
        cardsChip.dataset.act = "cards";
        cardsChip.setAttribute("aria-label", tomatoI18n.附属卡);
        cardsChip.addEventListener("mouseenter", () => showFloatTip(cardsChip));
        cardsChip.addEventListener("mouseleave", hideFloatTip);
        cardsChip.textContent = tomatoI18n.附属卡;
        cardsChip.addEventListener("click", ev => {
            ev.stopPropagation();
            debugLog("prog.tailcard", `action cards doc=${data.docID}`, "progressive");
            void prog.openBookCards(data.bookID);
        });
        chips.append(cardsChip);
        void capsuleBookDue(data.bookID).then(due => {
            if (!cardsChip.isConnected || due <= 0) return;
            const badge = document.createElement("span");
            badge.className = "prog-tailcard__chip-due";
            badge.textContent = formatDueCount(due);
            cardsChip.append(badge);
        }).catch(() => { });
    }

    element.append(card);
}
