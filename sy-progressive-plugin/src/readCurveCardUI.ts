// 阅读曲线接管·官方复习界面 UI（1530 期2）。阅读卡=片文档整卡（文档卡无挖空→
// 出现即评分态，openCard :229），官方「良好」评分语义=读完确认——本模块向官方
// 复习界面注入「下一张」主钮（click=内核 Good 钮全链评分翻页；空格/回车原生保持）
// +「渐进阅读」身份徽标，官方 1/2/3/4 评分钮组 CSS 整组隐藏（跳过 -3/上一步 -2
// 保留）。键盘流（纯空格评分不产生 click-editorcontent——期1 巡查的键盘补口）：
// keydown 旁听空格/回车→延迟对账（评分态下内核空格=Good 翻页，openCard :718）。
// ⚠️ 注入必须覆盖两套 .card__action（官方按窗口宽度渲染答题/评分两套布局，跨宽度
// 断点只切 fn__none 类——childList observer 感知不到，单套注入在 resize 后主钮
// 凭空消失直到下次翻卡；vision 三轮 P1 实锤）。标记用 class 非 id（双套=双份）。
// ⚠️ DOM 依赖 3.9.0 重写复习界面须重验（cardUtils getIDFromCard 同款预警）：模板
// 类名/结构变更只动本文件（识别选择器+注入点）。
import { readCurveTakeover } from "../../sy-tomato-plugin/src/libs/stores";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
import { sweepReadCurve } from "./readCurve";
import { READCARD_KEY } from "./readCurveCore";

const MARK_CLS = "prog-revcard-mark-el";
const NEXT_CLS = "prog-revcard-next-el";
const CARD_CLS = "prog-revcard";

let observer: MutationObserver | null = null;
let cardMainEl: HTMLElement | null = null;
let keyHandler: ((e: KeyboardEvent) => void) | null = null;
let keySweepTimer: ReturnType<typeof setTimeout> | null = null;
let sweepPending = false;
let recheckTimer: ReturnType<typeof setTimeout> | null = null;

/** 当前复习容器是否渐进阅读卡：card__main 里文档卡根挂身份键（custom-* 渲染进
 *  DOM attribute，custom-riff-decks 同款通道；无需 API 往返） */
function findReadCard(cardMain: HTMLElement): HTMLElement | null {
    return cardMain.querySelector<HTMLElement>(
        `div[data-doc-type="NodeDocument"][${READCARD_KEY}]`);
}

/** 卸载注入物（翻页换普通卡/关页签/插件 unload；评分行 DOM 持存时主动摘，官方
 *  重写 DOM 时节点自己消失——remove 双保险；class 摘=两套全覆盖） */
function teardown() {
    observer?.disconnect();
    observer = null;
    if (keySweepTimer) { clearTimeout(keySweepTimer); keySweepTimer = null; }
    sweepPending = false;
    if (cardMainEl) {
        cardMainEl.classList.remove(CARD_CLS);
        cardMainEl = null;
    }
    document.querySelectorAll(`.${MARK_CLS}, .${NEXT_CLS}`).forEach(e => e.remove());
    if (keyHandler) {
        document.removeEventListener("keydown", keyHandler, true);
        keyHandler = null;
    }
}

/** 单套评分行注入：主钮组（官方组形态 <div><span></span><button>）+ 行首徽标 */
function mountIntoAction(action: HTMLElement, good: HTMLButtonElement) {
    const next = document.createElement("button");
    next.className = "b3-button b3-button--info";
    next.setAttribute("aria-label", tomatoI18n.tip下一张);
    const icon = document.createElement("div");
    icon.className = "card__icon";
    icon.textContent = "📖";
    next.append(icon, tomatoI18n.下一张);
    next.addEventListener("click", () => {
        // 内核原生链：评分+翻页+计数；对账由下方 sweep 补。isConnected 防御：
        // 持引用的 good 若已随评分行重写而游离，打空即可勿再评分（review P2-3）
        if (!good.isConnected) return;
        good.click();
        void sweepReadCurve("cardflip-btn");
    });
    // ⚠主钮必须包 div 组挂进 .card__action——官方 CSS 对裸 button 直接子级有
    // width:25% 规则（第一套布局）会把主钮拉成空宽块（vision 一轮 P0 实锤）。
    // NEXT_CLS 挂组壳不挂钮（review P0-1）：官方 .card__action > div 带 flex:1，
    // teardown 只摘钮会残留空壳占行额、read→normal→read 循环逐圈累积——摘壳连钮带走
    const nextGroup = document.createElement("div");
    nextGroup.className = NEXT_CLS;
    nextGroup.append(document.createElement("span"), next);

    const badge = document.createElement("span");
    badge.className = `prog-revcard-badge ${MARK_CLS}`;
    badge.setAttribute("aria-label", tomatoI18n.tip设置阅读曲线);
    const bicon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    // iconBookmark=番茄阅读点卡身份行同款（sprite 无 iconBook，空引用渲染为空盒）
    bicon.innerHTML = '<use xlink:href="#iconBookmark"></use>'; // svg use 必 innerHTML（命名空间坑）
    const t = document.createElement("span");
    t.textContent = tomatoI18n.渐进阅读;
    badge.append(bicon, t);

    action.prepend(badge);
    action.append(nextGroup); // 评分钮组（已隐藏）之后、行尾——主钮收尾位
}

/** 注入：两套 .card__action 全挂（resize 断点只切类，observer 不感知）+ 键盘旁听 */
function mount(cardMain: HTMLElement) {
    const actions = [...cardMain.querySelectorAll<HTMLElement>(".card__action")];
    const good = actions
        .map(a => a.querySelector<HTMLButtonElement>(`button[data-type="3"]`))
        .find(g => !!g);
    // Good 钮=评分态锚（两套中必有其一；都无=答题瞬间态，下一事件/observer 兜）
    if (!actions.length || !good) return;
    teardown();
    cardMainEl = cardMain;
    cardMain.classList.add(CARD_CLS);
    for (const a of actions) mountIntoAction(a, good);

    // 键盘旁听（一次）：阅读卡在场时空格/回车=Good 评分翻页（内核 :718），延迟对账
    // 补键盘流（评分落库后巡查摘卡+续推）；pending 防连按重入
    keyHandler = (e: KeyboardEvent) => {
        if (e.key !== " " && e.key !== "Enter") return;
        if (!document.querySelector(`.${MARK_CLS}`)) return; // 已翻到普通卡
        if (sweepPending) return;
        sweepPending = true;
        keySweepTimer = setTimeout(() => {
            keySweepTimer = null;
            sweepPending = false;
            void sweepReadCurve("cardflip-key");
        }, 800);
    };
    document.addEventListener("keydown", keyHandler, true);

    // 防孤儿+翻页重挂（两判定）：①徽标离开文档=评分行被整段重写（内核会话内其实
    // 只切 fn__none 类、genCardCount 只改计数——此判定为第三方改 DOM 的防御位）
    // ——清场+recheck 重注入；②徽标还在但当前卡已非阅读卡（翻页只重写卡内容区、
    // 评分行 DOM 持存；事件链每次翻卡必发 loaded-protyle-static→revCardOnAppear，
    // 但纯键盘流/事件丢失时 observer 是兜底）——注入物与新卡态不符，同样清场
    observer = new MutationObserver(() => {
        const cm = cardMainEl;
        if (!cm) return;
        if (!document.querySelector(`.${MARK_CLS}`)) {
            teardown();
            scheduleRecheck();
        } else if (!findReadCard(cm)) {
            teardown();
        }
    });
    observer.observe(cardMain, { childList: true, subtree: true });
    debugLog("readcurve", "card UI mounted", "progressive");
}

/** 翻页后新卡 re-check（防抖：官方翻页连发多批 DOM 变更） */
function scheduleRecheck() {
    if (recheckTimer) return;
    recheckTimer = setTimeout(() => {
        recheckTimer = null;
        const cm = document.querySelector<HTMLElement>(".card__main");
        if (cm && findReadCard(cm)) mount(cm);
    }, 200);
}

/** 出场链入口（Progressive 四事件分支调：翻卡=loaded/switch、点击=click） */
export function revCardOnAppear(protyleEl: HTMLElement | undefined) {
    if (!readCurveTakeover.get() || !protyleEl) return;
    // 复习 Dialog 整树移除不触发 observer（mutation 发生在父层）——入口收尸（review P2-2）
    if (cardMainEl && !cardMainEl.isConnected) teardown();
    const cardMain = protyleEl.closest<HTMLElement>(".card__main");
    if (!cardMain) return;
    if (!findReadCard(cardMain)) {
        // 普通卡：清掉上一张阅读卡的残留注入（评分套还原=类摘除+钮移除即无痕）
        if (cardMainEl === cardMain) teardown();
        return;
    }
    if (document.querySelector(`.${MARK_CLS}`) && cardMainEl === cardMain) return; // 同卡已挂
    mount(cardMain);
}

/** 插件 unload 清理（onunload 调） */
export function disposeRevCardUI() {
    teardown();
    if (recheckTimer) { clearTimeout(recheckTimer); recheckTimer = null; }
}
