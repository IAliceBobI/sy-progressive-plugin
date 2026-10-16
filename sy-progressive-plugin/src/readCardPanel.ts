// sy-progressive-plugin/src/readCardPanel.ts
// 刘璐互转入口：闪卡工具面板「阅读推送」段——当前属性行+互转按钮（两向收拢）。
// 宿主=tomato CardBoxFloat 面板段注册表（依赖方向 p→t 单向）；判向=cardActionSet
// 矩阵同源（面板按钮与徽标菜单永远同语义）；渲染=原生 DOM（readCurveCardUI 同款
// 风格），takeover 关=段消失（翻卡时 render 即时反映）。
import { getIDFromCard } from "../../sy-tomato-plugin/src/libs/cardUtils";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import {
    registerCardPanelSection, unregisterCardPanelSection,
} from "../../sy-tomato-plugin/src/libs/cardPanelSections";
import { readCurveTakeover } from "../../sy-tomato-plugin/src/libs/stores";
import { cardActionSet } from "./readCurveCore";
import { statusLineOf } from "./readCurveText";
import { applyReadCardAction, inspectReadCard, ReadCardCtx } from "./readCurve";

/** 面板段面态：status=状态行（null=不显示）、convert=互转方向（null=无可互转） */
export interface PanelFace {
    status: string | null;
    convert: "memory" | "add" | null;
    convertLabel: string | null;
}

/** 判向与状态行（纯函数）：有键=statusLineOf（垃圾键 null=空段）；无键=已退出/未
 *  加入；毕业档案=[again,sched] 无 memory/add=只读。与徽标菜单（readCardMenu 组配）
 *  同一矩阵同一文案源，永不另立语义 */
export function panelFaceOf(
    ctx: Pick<ReadCardCtx, "readcard" | "optout" | "dueMs" | "kind" | "relaxedAt">,
    nowMs: number,
): PanelFace {
    const status = ctx.readcard
        ? statusLineOf(ctx.readcard, ctx.dueMs, nowMs, ctx.relaxedAt, ctx.kind === "material")
        : ctx.optout ? tomatoI18n.已退出阅读推送 : tomatoI18n.未加入阅读推送;
    const actions = cardActionSet(ctx.readcard);
    const convert = actions.includes("memory") ? "memory" as const
        : actions.includes("add") ? "add" as const : null;
    return {
        status,
        convert,
        convertLabel: convert === "memory" ? tomatoI18n.转为记忆卡
            : convert === "add" ? tomatoI18n.加入推送 : null,
    };
}

/** 段代次守卫：renderFace/清理每动作认领代次，旧闭包（点击/重渲染/快捷键回链的
 *  await 间隙）凭「el 当前代次=自己代次」判定存活——翻卡走 keyed each 复用同一
 * el，isConnected/组件级 alive 旗标拦不住旧代闭包回写，必须按代次作废 */
const elGen = new WeakMap<HTMLElement, number>();
let genSeq = 0;
function claimGen(el: HTMLElement): () => boolean {
    const my = ++genSeq;
    elGen.set(el, my);
    return () => elGen.get(el) === my;
}
/** 只拍照不认领：取 el 当前代次做守卫（快捷键回链刷新 host 用——自己认领会作废
 *  在场段的按钮守卫） */
function genIsCurrent(el: HTMLElement): () => boolean {
    const at = elGen.get(el);
    return () => elGen.get(el) === at;
}

/** 渲染一帧（同步、幂等：先清空）。空面（垃圾键/异常态）=零残留 */
function renderFace(el: HTMLElement, cardID: string, face: PanelFace): void {
    const isLive = claimGen(el);
    el.replaceChildren();
    if (!face.status && !face.convert) return;
    const box = document.createElement("div");
    box.className = "prog-rcpanel";
    if (face.status) {
        const st = document.createElement("div");
        st.className = "prog-rcpanel__status";
        const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        // svg use 必 innerHTML（命名空间坑，readCurveCardUI 同款）
        icon.innerHTML = '<use xlink:href="#iconInfo"></use>';
        const t = document.createElement("span");
        t.textContent = face.status;
        st.append(icon, t);
        box.append(st);
    }
    if (face.convert && face.convertLabel) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "prog-rcpanel__convert";
        const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        icon.innerHTML = `<use xlink:href="${face.convert === "memory" ? "#iconEye" : "#iconRiffCard"}"></use>`;
        const t = document.createElement("span");
        t.textContent = face.convertLabel;
        btn.append(icon, t);
        btn.addEventListener("click", () => {
            void (async () => {
                const tip = await applyReadCardAction(cardID, face.convert!);
                debugLog("readcurve.ui", `panel convert ${face.convert} ${cardID} → ${tip || "(fail)"}`, "progressive");
                // 有 tip 才动 DOM（空=静默失败保持原态，apply 内部已 toast 兜底）；
                // takeover 中途关=清段（对齐「关=段消失」语义，防残留按钮空转循环）；
                // 飞行中翻卡已换新代（翻卡必经 sectionRender 重渲染）→ 旧代不回写
                if (!tip) return;
                if (!readCurveTakeover.get()) { el.replaceChildren(); return; }
                if (isLive()) await rerender(el, cardID, isLive);
            })();
        });
        box.append(btn);
    }
    el.append(box);
}

async function rerender(el: HTMLElement, cardID: string, isLive: () => boolean): Promise<void> {
    try {
        const ctx = await inspectReadCard(cardID);
        // inspect 间隙可能已翻卡重渲染（代次换新）→ 旧代不落 DOM
        if (isLive()) renderFace(el, cardID, panelFaceOf(ctx, Date.now()));
    } catch (e) {
        debugLog("readcurve.ui", `panel rerender fail ${cardID}: ${e}`, "progressive");
    }
}

/** 面板段渲染入口（注册表合同）：takeover 关=空段（翻卡即时反映）；代次守卫防
 * 卸载/翻卡后异步 inspect 回写（清理即作废本代） */
function sectionRender(el: HTMLElement, ctx: { cardID: string }): (() => void) | undefined {
    el.replaceChildren();
    if (!readCurveTakeover.get()) return;
    const isLive = claimGen(el);
    void (async () => {
        try {
            const c = await inspectReadCard(ctx.cardID);
            if (isLive()) renderFace(el, ctx.cardID, panelFaceOf(c, Date.now()));
        } catch (e) {
            debugLog("readcurve.ui", `panel inspect fail ${ctx.cardID}: ${e}`, "progressive");
        }
    })();
    return () => { claimGen(el); el.replaceChildren(); };
}

const SECTION_KEY = "prog-readcard";

export function mountReadCardPanelSection(): void {
    registerCardPanelSection(SECTION_KEY, { render: sectionRender });
}

export function unmountReadCardPanelSection(): void {
    unregisterCardPanelSection(SECTION_KEY);
}

/** 快捷键通道（Task 3 命令消费）：对当前复习卡执行互转（判向同 panelFaceOf）。
 *  非复习界面 getIDFromCard=null 天然 no-op；面板开着则顺带 best-effort 刷新本段。
 *  全链 try/catch——Progressive.ts 回调 void 消费本 promise，不吞即 unhandledrejection */
export async function convertCurrentReviewCard(): Promise<void> {
    try {
        const cardID = await getIDFromCard();
        if (!cardID) return;
        const ctx = await inspectReadCard(cardID);
        const face = panelFaceOf(ctx, Date.now());
        if (!face.convert) return;
        await applyReadCardAction(cardID, face.convert);
        // host/卡号实时取：飞行中翻卡/关面板重开 → 刷新当前在场卡（旧卡数据不进
        // 新面板）；takeover 中途关=清段（与按钮回链同语义）
        const host = document.querySelector(".ext-section .prog-rcpanel")?.parentElement ?? null;
        if (!host) return;
        if (!readCurveTakeover.get()) { host.replaceChildren(); return; }
        const nowID = (await getIDFromCard()) ?? cardID;
        await rerender(host, nowID, genIsCurrent(host));
    } catch (e) {
        debugLog("readcurve.ui", `hotkey convert fail: ${e}`, "progressive");
    }
}
