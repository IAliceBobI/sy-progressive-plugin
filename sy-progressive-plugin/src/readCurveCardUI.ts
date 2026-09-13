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
import { openReadCardMenu } from "./readCardMenu";
import { READCARD_KEY } from "./readCurveCore";
import { badgeSpec, nextSeeHint } from "./readCurveText";

const MARK_CLS = "prog-revcard-mark-el";
const NEXT_CLS = "prog-revcard-next-el";
const CARD_CLS = "prog-revcard";
const BADGE_TEXT_CLS = "prog-revcard-badge-text";
const NEXT_TEXT_CLS = "prog-revcard-next-text";

let observer: MutationObserver | null = null;
let cardMainEl: HTMLElement | null = null;
let keyHandler: ((e: KeyboardEvent) => void) | null = null;
let keySweepTimer: ReturnType<typeof setTimeout> | null = null;
let sweepPending = false;
let recheckTimer: ReturnType<typeof setTimeout> | null = null;

/** 当前复习容器是否渐进阅读卡：卡内容里任何带身份键的元素（6808 实测键挂点三态：
 *  文档卡=.protyle-wysiwyg 根〔doc 级 IAL 渲染位〕/ rpcard=custom 块元素本身 /
 *  片内 item 块=item 元素——□4 前的 div[data-doc-type] 窄选择器对 rpcard 恒 miss）。
 *  custom-* 渲染进 DOM attribute（custom-riff-decks 同款通道；无需 API 往返） */
function findReadCard(cardMain: HTMLElement): HTMLElement | null {
    // 合法命中面（review P1-2：带键子块被复制进普通文档时，用户官方卡整套注入=劫持）：
    // ① .protyle-wysiwyg 根（文档卡 IAL 渲染位，无 data-node-id）；② 块 id===卡 rootID
    // （rpcard custom 块/片内 item 块=块级键恰是卡的复习对象）。带 data-node-id 且≠rootID
    // 的子块键拒认
    const rootID = cardMain.querySelector(".card__block")?.getAttribute("data-node-id") ?? "";
    for (const el of cardMain.querySelectorAll<HTMLElement>(`[${READCARD_KEY}]`)) {
        const nid = el.getAttribute("data-node-id");
        if (!el.classList.contains("protyle-wysiwyg") && nid !== rootID) continue;
        return el;
    }
    return null;
}

/** 卡的块 ID（徽标菜单/动作目标）：键元素自带（块级键）优先，缺省回落 .card__block
 *  （文档卡的根块 id 挂在 card__block 上，wysiwyg 根无 data-node-id——6808 实锤） */
function cardBlockID(cardMain: HTMLElement): string {
    const found = findReadCard(cardMain);
    return found?.getAttribute("data-node-id")
        ?? cardMain.querySelector(".card__block")?.getAttribute("data-node-id") ?? "";
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

/** □4 徽标文案：进度平铺常显（N/5·第 N/5 天·每 N 天）；5/5=最后一见强调；
 *  无键/毕业（理论不达）回落静态「渐进阅读」 */
function badgeLabelOf(cardMain: HTMLElement): { text: string; lastSee: boolean } {
    const spec = badgeSpec(findReadCard(cardMain)?.getAttribute(READCARD_KEY) ?? "");
    if (!spec) return { text: tomatoI18n.渐进阅读, lastSee: false };
    return { text: `${tomatoI18n.渐进阅读} · ${spec.lastSee ? `${spec.text} · ${tomatoI18n.最后一见}` : spec.text}`, lastSee: spec.lastSee };
}

/** □4 徽标进度刷新（翻页换卡：评分行 DOM 持存，徽标文本不刷会是旧卡的 N/5）——
 *  两套评分行的徽标全刷（class 选择器天然覆盖） */
function refreshBadge(cardMain: HTMLElement) {
    const { text, lastSee } = badgeLabelOf(cardMain);
    document.querySelectorAll<HTMLElement>(`.${MARK_CLS}`).forEach(b => {
        const t = b.querySelector(`.${BADGE_TEXT_CLS}`);
        // ⚠同值也必须跳过：Element.textContent 赋值是 replace-all 语义（同值也替换
        // 子 Text 节点=childList mutation），本函数在自家 observer 回调内被调——无值
        // 比较守卫=observer↔refreshBadge 无限乒乓，复习界面 100% 同步死循环（09-11
        // 主实例 ⌃0 卡死根因，renderer 100%CPU+内存狂涨）
        if (t && t.textContent !== text) t.textContent = text;
        b.classList.toggle("prog-revcard-last", lastSee);
    });
}

/** 下一张即时反馈（□4）：label 闪换「N 天后再见」，1.2s 还原（翻到普通卡时钮随
 *  teardown 消失，isConnected 防游离改写） */
function flashNextLabel(btn: HTMLButtonElement, hint: string) {
    const label = btn.querySelector(`.${NEXT_TEXT_CLS}`);
    if (!label) return;
    label.textContent = hint;
    btn.classList.add("prog-revcard-flashed");
    clearTimeout((btn as any).__flashTimer as number | undefined);
    (btn as any).__flashTimer = setTimeout(() => {
        if (label.isConnected) label.textContent = tomatoI18n.下一张;
        btn.classList.remove("prog-revcard-flashed");
    }, 1200);
}

/** 单套评分行注入：主钮组（官方组形态 <div><span></span><button>）+ 行首徽标 */
function mountIntoAction(action: HTMLElement, good: HTMLButtonElement, cardMain: HTMLElement) {
    const next = document.createElement("button");
    next.className = "b3-button b3-button--info";
    next.setAttribute("aria-label", tomatoI18n.tip下一张);
    const icon = document.createElement("div");
    icon.className = "card__icon";
    icon.textContent = "📖";
    const nextText = document.createElement("span");
    nextText.className = NEXT_TEXT_CLS;
    nextText.textContent = tomatoI18n.下一张;
    next.append(icon, nextText);
    next.addEventListener("click", () => {
        // 内核原生链：评分+翻页+计数；对账由下方 sweep 补。isConnected 防御：
        // 持引用的 good 若已随评分行重写而游离，打空即可勿再评分（review P2-3）
        if (!good.isConnected) return;
        // □4 评分即时反馈：曲线族消耗轮次→闪「N 天后再见」（分片=完成翻篇、毕业=toast，均不出）
        const hint = nextSeeHint(findReadCard(cardMain)?.getAttribute(READCARD_KEY) ?? "", Date.now());
        good.click();
        void sweepReadCurve("cardflip-btn");
        if (hint) flashNextLabel(next, hint);
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
    t.className = BADGE_TEXT_CLS;
    badge.append(bicon, t);
    // □4 徽标=动作菜单入口（不再推/每 N 天/再来一轮/推迟/转记忆卡）
    badge.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = cardBlockID(cardMain);
        debugLog("readcurve.ui", `badge menu click block=${id}`, "progressive");
        void openReadCardMenu(id, { clientX: e.clientX, clientY: e.clientY }, (act) => {
            // 不再推/转记忆卡后当前卡失效：点官方「跳过」翻页（skipCardCache 纯会话
            // 缓存不改 due 不评分，对已摘卡安全；转记忆卡留官方 FSRS 语义不跳）
            if (act === "stop") {
                cardMain.querySelector<HTMLButtonElement>(`button[data-type="-3"]`)?.click();
            }
        });
    });

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
    for (const a of actions) mountIntoAction(a, good, cardMain);
    refreshBadge(cardMain);

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
        } else {
            // □4：翻页换卡的内容区晚于事件链渲染（revCardOnAppear 刷新时键属性未上 DOM
            // → 徽标回落静态文案），childList 变更兜底再刷一次进度
            refreshBadge(cm);
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
    if (document.querySelector(`.${MARK_CLS}`) && cardMainEl === cardMain) {
        refreshBadge(cardMain); // 同卡已挂：只刷徽标进度（□4 翻页换卡 N/5 跟新）
        return;
    }
    mount(cardMain);
}

/** 插件 unload 清理（onunload 调） */
export function disposeRevCardUI() {
    teardown();
    if (recheckTimer) { clearTimeout(recheckTimer); recheckTimer = null; }
}
