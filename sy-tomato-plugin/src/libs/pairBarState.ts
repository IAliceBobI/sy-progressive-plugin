// PairBar —— 块配对接力浮条 V1 状态机纯逻辑（块配对 □2）。
// 状态机：idle →(触发)→ pick(6 图标+光标块预览) →(点功能/默认功能直进)→ target(状态条)
// →(同触发器/✓ 且目标合法)→ 执行后回 idle；Esc/× 任意态取消。
// 本层只做纯转移与门禁判定（可单测）；DOM/思源 API 副作用在 PairBarBox 控制器。
// 设计定稿：memory pair-block-tools-campaign（方案 A 接力浮条，用户逐段确认）。
import { cloneCleanDiv } from "./blockUtils";

export type PairPhase = "idle" | "pick" | "target";
export type PairFuncID = "bilink" | "embedBilink" | "refOnly" | "insRefs" | "sync" | "transport";
export type PairErr = "noSource" | "noTarget" | "sameTarget" | "funcGated" | "vipGated";

export interface PairState {
    phase: PairPhase;
    func: PairFuncID | null;
    srcIDs: string[];
    srcSummary: string;
    copyMode: boolean;
}

export interface PairFuncSpec {
    id: PairFuncID;
    icon: string;
    /** 功能总开关 store 名（图标灰态+点击拦截）：浮条是入口非功能，开关正交 */
    gate: "linkBoxCheckbox" | "linkBoxSyncBlock" | "cpBoxCheckbox";
    vip: boolean;
    /** 同步块/嵌入互链/搬运用全部源；互链族取第一个（沿 markBlock 语义） */
    multiSrc: boolean;
    /** i18n 文案 key（tomatoI18n getter 名） */
    labelKey: string;
}

/** 六功能 spec：id 顺序即浮条图标横排顺序，也是设置默认功能下拉顺序（勿随意重排） */
export const PAIR_FUNCS: PairFuncSpec[] = [
    { id: "bilink", icon: "iconLink", gate: "linkBoxCheckbox", vip: false, multiSrc: false, labelKey: "双向互链" },
    { id: "embedBilink", icon: "iconEmbed", gate: "linkBoxCheckbox", vip: true, multiSrc: true, labelKey: "嵌入互链" },
    { id: "refOnly", icon: "iconRef", gate: "linkBoxCheckbox", vip: false, multiSrc: false, labelKey: "关联两个块" },
    { id: "insRefs", icon: "iconBoth", gate: "linkBoxCheckbox", vip: false, multiSrc: false, labelKey: "互相插入引用" },
    { id: "sync", icon: "iconRefresh", gate: "linkBoxSyncBlock", vip: false, multiSrc: true, labelKey: "同步块" },
    { id: "transport", icon: "iconMove", gate: "cpBoxCheckbox", vip: false, multiSrc: true, labelKey: "搬运" },
];

export const initialPairState: PairState = {
    phase: "idle",
    func: null,
    srcIDs: [],
    srcSummary: "",
    copyMode: false,
};

/** 拖 chip 的自定义 MIME（□3 V2）：内核/其它拖拽互不认领（渐进 □12 同款做法）；
 *  Firefox 须 setData 才启动拖拽。组件 dragstart 写、控制器 dragover 只看 dragging
 *  标志不验 MIME（事件源头必是自家 chip），常量放纯函数层供组件 import 防循环依赖。 */
export const PAIR_DRAG_MIME = "application/x-tomato-pair";

/** 触发事件载荷：控制器现读 selectedDivs 后传入（ids=块 id 序列，summary=首块文本切片） */
export interface PairEvent {
    ids: string[];
    summary?: string;
}

/** 门禁上下文：gates=三功能总开关快照，vip=lastVerifyResult() */
export interface PairGateCtx {
    gates: Record<string, boolean>;
    vip: boolean;
}

/** 门禁上下文缺省值：不设防（控制器总会传真实快照；纯函数层面缺上下文≠拦截） */
const UNGATED: PairGateCtx = { gates: { linkBoxCheckbox: true, linkBoxSyncBlock: true, cpBoxCheckbox: true }, vip: true };

/** 图标灰态/点击拦截统一判据：VIP 功能未验证 → vipGated；总开关未开 → funcGated；放行 null */
export function pairGateErr(spec: PairFuncSpec, ctx?: Partial<PairGateCtx>): PairErr | null {
    const c = { gates: { ...UNGATED.gates, ...ctx?.gates }, vip: ctx?.vip ?? UNGATED.vip };
    if (spec.vip && !c.vip) return "vipGated";
    if (!c.gates[spec.gate]) return "funcGated";
    return null;
}

type PairResult = { state: PairState; err?: PairErr; attemptFunc?: PairFuncID };

/**
 * 同一触发器推进一步（快捷键/状态栏按钮/菜单项共用，不区分第一键第二键）：
 * - idle + 无默认功能 → pick（光标块预锁为源，无选中则源空）
 * - idle + 默认功能 + 源可用且过门禁 → 直进 target（两键零点击）
 * - pick → no-op（点功能图标推进；键盘流走默认功能，不做数字键选功能——浮条开着吞数字会打断打字）
 * - target + 目标合法（有块且不命中源）→ 回 idle，控制器据此执行
 */
export function pairTrigger(s: PairState, ev: PairEvent, opts: { defaultFunc?: PairFuncID | ""; gates?: Record<string, boolean>; vip?: boolean }): PairResult {
    if (s.phase === "idle") {
        const def = opts.defaultFunc || "";
        if (!def) {
            return { state: { ...initialPairState, phase: "pick", srcIDs: [...ev.ids], srcSummary: ev.summary ?? "" } };
        }
        const spec = PAIR_FUNCS.find(f => f.id === def);
        if (!spec) return { state: s, err: "funcGated" };
        if (ev.ids.length === 0) return { state: s, err: "noSource", attemptFunc: def };
        const gate = pairGateErr(spec, { gates: opts.gates, vip: opts.vip });
        if (gate) return { state: s, err: gate, attemptFunc: def };
        return { state: { ...initialPairState, phase: "target", func: def, srcIDs: [...ev.ids], srcSummary: ev.summary ?? "" } };
    }
    if (s.phase === "pick") {
        // pick 态无默认功能时触发键不推进（面板已在眼前，点图标即下一步）
        return { state: s };
    }
    return confirm(s, ev);
}

/** 选功能态点功能图标 → target；源取此刻新鲜读（用户可能在面板弹出后改了选区，覆盖触发时预锁） */
export function pairPickFunc(s: PairState, func: PairFuncID, ev: PairEvent, opts: PairGateCtx): PairResult {
    const spec = PAIR_FUNCS.find(f => f.id === func);
    if (!spec) return { state: s, err: "funcGated" };
    const gate = pairGateErr(spec, opts);
    if (gate) return { state: s, err: gate };
    if (ev.ids.length === 0) return { state: s, err: "noSource" };
    return { state: { ...initialPairState, phase: "target", func, srcIDs: [...ev.ids], srcSummary: ev.summary ?? "" } };
}

/** ✓ 钮确认目标：target 态触发键的同款转移 */
export function pairConfirmTarget(s: PairState, ev: PairEvent, _opts: unknown): PairResult {
    return confirm(s, ev);
}

/** 搬运 ops 构造（依赖注入 trans 工厂保纯函数可测；reasoning 评审 P0-1：复制必须
 *  cloneCleanDiv 换新 ID——活副本原块 ID 原地不动，否则页面/内核块 ID 分叉打错块） */
export function buildTransportOps(
    srcDivs: HTMLElement[],
    targetID: string,
    copy: boolean,
    trans: {
        insertAfter: (htmls: string[], id: string) => IOperation[];
        moveAfter: (ids: string[], id: string) => IOperation[];
    },
): IOperation[] {
    if (copy) {
        const htmls = srcDivs.map(d => cloneCleanDiv(d).div.outerHTML);
        return [...trans.insertAfter(htmls, targetID)];
    }
    const ids = srcDivs.map(d => d.getAttribute("data-node-id")).filter(Boolean) as string[];
    return [...trans.moveAfter(ids, targetID)];
}

function confirm(s: PairState, ev: PairEvent): PairResult {
    if (s.phase !== "target") return { state: s };
    const target = ev.ids[0];
    if (!target) return { state: s, err: "noTarget" };
    if (s.srcIDs.includes(target)) return { state: s, err: "sameTarget" };
    // 合法：执行由控制器负责（它持有 ev 的完整 DOM），状态机回 idle
    return { state: initialPairState };
}

/** Esc/× 任意态取消 → idle */
export function pairCancel(_s: PairState): PairState {
    return initialPairState;
}

/** 搬运「移动/复制」二选一切换：仅 target+transport 态有效，其余 no-op */
export function pairToggleCopy(s: PairState): PairState {
    if (s.phase !== "target" || s.func !== "transport") return s;
    return { ...s, copyMode: !s.copyMode };
}

/** 引导模式（□3 V2）：pick 态点块即现读更新预锁源（纯展示层，不改状态机转移）；
 *  非 pick 态 no-op——target 态点块走确认链，绝不允许改源 */
export function pairSetSrcPreview(s: PairState, ev: PairEvent): PairState {
    if (s.phase !== "pick") return s;
    return { ...s, srcIDs: [...ev.ids], srcSummary: ev.summary ?? "" };
}

/** 源与目标互为祖先/子孙判定（□2 评审转出①）：源=超级块、目标=其子块这类场景
 *  sameTarget 的 ID 相等检查抓不到，transport 会把子块 move 进自己祖先——控制器在
 *  执行前用它拦截。ID 相同不算（sameTarget 纯函数层已管）；detached 源 contains
 *  自然不命中，无害。 */
export function isRelatedTarget(srcDivs: HTMLElement[], target: HTMLElement | null | undefined): boolean {
    if (!target) return false;
    return srcDivs.some(d => d?.contains(target) || target.contains(d));
}
