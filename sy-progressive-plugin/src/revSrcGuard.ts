// 复习界面源不可达守卫（revsrcguard，650189 2026-09-23 帖）：背诵卡=digest 文档卡，
// 内容 block-ref 引用源文档；源所在笔记本关闭时内核渲染弹「请打开笔记本 [X] 后再试」
// （原生 toast 插件拦不住），且这张卡每到复习必弹、用户无从下手。本模块向官方复习
// 界面注入温和提示条：主文案「这张背诵卡的来源在已关闭的笔记本中」+「跳过这张」
// （点官方 skip 钮 data-type="-3" 同 readCurveCardUI stop 先例）+「移除背诵卡」
// （removeRiffCards 摘卡——digest 文档本身保留只退复习，再翻页）。
// 通道与生命周期：出场链四事件驱动（Progressive.ts ProgressiveBox 分支，revCardOnAppear
// 旁）；digest 身份=wysiwyg 根的 custom-pdigest-parent-id（doc 级 IAL 渲染位，digestMarker
// 同通道）；纯 DOM 注入零落盘。事件早于键属性上 DOM 的瞬态窗 → 阴性 400ms 重判一次
// （scheduleRecheck 哲学）；异步查询回来时卡已翻走 → 代际守卫（parentID 比对）丢弃。
// 与 readCurveCardUI 的分野：那边只接管阅读卡（READCARD_KEY）且随实验开关；本守卫管
// 背诵卡（digest 卡）常开——出现条件=源不可达的出错态，常态零视觉零查询（getBlocks
// Info 只对 digest 卡发、每卡一次）。
// ⚠️ DOM 依赖 3.9.0 重写复习界面须重验（readCurveCardUI 文件头同款预警）。
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import { siyuan, icon } from "../../sy-tomato-plugin/src/libs/utils";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";

const BAR_CLS = "prog-revsrc-bar";

/** 已挂提示条的卡标识（parentID；翻卡即换——阳性幂等：同卡事件重入不重挂不闪） */
let lastKey = "";
let checkTimer: ReturnType<typeof setTimeout> | null = null;

function clearBar() {
    document.querySelectorAll(`.${BAR_CLS}`).forEach(e => e.remove());
}

/** 卡根块 id（摘卡目标）：官方 .card__block 的 data-node-id（文档卡=文档根块 id，
 *  digest 入卡走 addCardSetDueTime(digestID) 同 id 口径；readCurveCardUI cardBlockID 同源） */
function cardRootID(cardMain: HTMLElement): string {
    return cardMain.querySelector(".card__block")?.getAttribute("data-node-id") ?? "";
}

/** 官方跳过钮（data-type="-3"；两套 .card__action 各一枚——6807 实测 querySelector
 *  首个命中隐藏套，可见优先再兜底首枚，dev 实锤隐藏套命中点了不翻页） */
function clickSkip(cardMain: HTMLElement) {
    const btns = [...cardMain.querySelectorAll<HTMLButtonElement>('button[data-type="-3"]')];
    const btn = btns.find(b => b.offsetWidth || b.offsetHeight) ?? btns[0];
    btn?.click();
}

function mountBar(cardMain: HTMLElement, parentID: string) {
    clearBar();
    const bar = document.createElement("div");
    bar.className = BAR_CLS;
    const ic = document.createElement("span");
    ic.className = "prog-revsrc-bar__icon";
    ic.innerHTML = icon("iconProgQuill", 14); // svg use 须 innerHTML（命名空间坑）
    const text = document.createElement("span");
    text.className = "prog-revsrc-bar__text";
    text.textContent = tomatoI18n.背诵卡源不可达;

    const mk = (label: string, onClick: () => void, primary: boolean) => {
        const b = document.createElement("button");
        b.className = `b3-button b3-button--small ${primary ? "" : "b3-button--white"}`.trim();
        b.textContent = label;
        b.addEventListener("click", (ev) => { ev.stopPropagation(); onClick(); });
        return b;
    };
    const skip = mk(tomatoI18n.跳过这张, () => {
        debugLog("revsrcguard", `skip card src=${parentID}`, "progressive");
        lastKey = "";
        clickSkip(cardMain);
    }, false);
    const remove = mk(tomatoI18n.移除背诵卡, () => {
        const rootID = cardRootID(cardMain);
        debugLog("revsrcguard", `remove card=${rootID} src=${parentID}`, "progressive");
        if (!rootID) return;
        void siyuan.removeRiffCards([rootID]).then(() => {
            void siyuan.pushMsg(tomatoI18n.已移除背诵卡);
            lastKey = "";
            clickSkip(cardMain); // 摘卡后当前卡仍在屏——跳过翻页收口
        });
    }, true);

    bar.append(ic, text, skip, remove);
    // 挂 .card__main 顶层首子（卡面最顶、评分行外）：不在 wysiwyg 内容流内，
    // 不触发「内容流首位注入扰动退格锚点」家族坑（card__main 顶层非 contenteditable）
    cardMain.insertBefore(bar, cardMain.firstChild);
}

/** 源可达性（每卡一次）——两态都算不可达（6807 造数实锤：刚关的笔记本 blocktree
 *  未清，getBlockInfo 照常 code 0 返回；内核空闲清理已关笔记本块树后才 -1。用户
 *  截图的 -1=清理后的硬失败，软失败态必须查 box 是否已关闭才判得出）：
 *  ① getBlockInfo null（blocktree 已清/已删）；② box 在已关闭笔记本列表 */
async function srcUnreachable(parentID: string): Promise<boolean> {
    const info = await siyuan.getBlockInfo(parentID).catch(() => null);
    if (!info?.box) return true;
    const nbs = await siyuan.call("/api/notebook/lsNotebooks", {}) as any;
    const box = String(info.box);
    return (nbs?.notebooks ?? []).some((n: any) => n.id === box && !!n.closed);
}

async function check(cardMain: HTMLElement, parentID: string) {
    const unreachable = await srcUnreachable(parentID);
    // 代际守卫：查询期间翻卡/关页签 → 丢弃迟到结果（wys 断连或 parentID 已换）
    const wys = cardMain.querySelector<HTMLElement>(".protyle-wysiwyg");
    if (!wys || !wys.isConnected) return;
    if ((wys.getAttribute("custom-pdigest-parent-id") ?? "") !== parentID) return;
    if (!unreachable) {
        clearBar(); // 源活着——正常态清残留（上张卡的条）
        return;
    }
    lastKey = parentID;
    mountBar(cardMain, parentID);
}

/** 阴性瞬态窗重判（事件早于键属性上 DOM——readCurveCardUI recheck 同哲学；一次即止） */
function scheduleTransientRecheck(protyleEl: HTMLElement) {
    if (checkTimer) return;
    checkTimer = setTimeout(() => {
        checkTimer = null;
        if (!protyleEl.isConnected) return;
        revSrcGuardOnAppear(protyleEl);
    }, 400);
}

/** 出场链入口（Progressive 四事件分支调，revCardOnAppear 旁；普通文档自短路） */
export function revSrcGuardOnAppear(protyleEl: HTMLElement | undefined) {
    if (!protyleEl) return;
    const cardMain = protyleEl.closest<HTMLElement>(".card__main");
    if (!cardMain) return;
    const wys = cardMain.querySelector<HTMLElement>(".protyle-wysiwyg");
    const parentID = wys?.getAttribute("custom-pdigest-parent-id") ?? "";
    if (!parentID) {
        // 非 digest 卡（阅读卡/普通卡）或属性未上 DOM——清残留+瞬态重判兜后者
        clearBar();
        lastKey = "";
        scheduleTransientRecheck(protyleEl);
        return;
    }
    // 阳性幂等：同卡已挂不重挂（评分行点击等事件重入防闪）
    if (lastKey === parentID && document.querySelector(`.${BAR_CLS}`)) return;
    void check(cardMain, parentID);
}

/** 插件 unload 清理（Progressive.onunload 调） */
export function disposeRevSrcGuard() {
    clearBar();
    lastKey = "";
    if (checkTimer) { clearTimeout(checkTimer); checkTimer = null; }
}
