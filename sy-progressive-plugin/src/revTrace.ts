// revtrace □2/□3（docs/checkpoints/2026-09-08-1750-handoff-revtrace.md）：块级修订痕迹——
// 按编辑时间着色的回看视图（鸟 650189 需求：回头翻时看见哪些是上次改的、哪些是上上次改的）。
// 设计定稿=**纯视图零档案**：不记桶不存快照，色层=f(块 `updated` 距今天数)，多层回看由块间
// updated 分布天然表达（同块多轮改=最新层获胜）；唯一持久化=enrollment 基线映射（ProgressiveStorage，
// 首次纳入时刻——规则②防满屏，基线前内容永远无色=「原文」，此后改/新块=「加工」逐层上色）。
// 零内容写入硬红线：不进 .sy、不进同步、不污染导出/闪卡，关掉即无痕（span 注入范式=digestMarker）。
// 内核三事实（已验 /opt/projects/siyuan 源码）：updated 由内容事务 RefreshUpdated 维护（本地时间
// yyyyMMddHHmmss，级联刷全父链+标题→视图层须叶子块过滤）；SetBlockAttrs 属性写入不触碰 updated
// （摘抄打标/复访键等插件 attr 流零误染）；新块 updated=创建时刻（新块计当日增量自动成立）。
import { siyuan, timeUtil, getActiveProtyle } from "../../sy-tomato-plugin/src/libs/utils";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
import { revTraceScope } from "../../sy-tomato-plugin/src/libs/stores";
import { BOOK_WRITING, MarkKey, PDIGEST_CTIME, PDIGEST_INDEX, PDIGEST_LAST_ID, PDIGEST_PARENT_ID } from "../../sy-tomato-plugin/src/libs/gconst";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import { showFloatTip, hideFloatTip } from "./floatTip";
import { progStorage } from "./ProgressiveStorage";

/** 生成本地时间 14 位内核同构时间戳（实现在 tomato timeUtil.kernelTimeNow；enrollment
 *  基线写入用，与 updated 直接字典序比较） */
export const kernelTimeNow = (d?: Date) => timeUtil.kernelTimeNow(d);

/** 色窗档数：K=5（今天+前 4 天，Scrivener 5 档先例），更早无色 */
export const REVTRACE_TIERS = 5;

/** 内核 IAL updated 形态：yyyyMMddHHmmss 本地时间，14 位数字典序=时间序 */
const KERNEL_TIME_RE = /^\d{14}$/;

export function parseKernelTime(s: string): number | null {
    if (!KERNEL_TIME_RE.test(s)) return null;
    const y = +s.slice(0, 4), mo = +s.slice(4, 6), d = +s.slice(6, 8);
    const h = +s.slice(8, 10), mi = +s.slice(10, 12), se = +s.slice(12, 14);
    const t = new Date(y, mo - 1, d, h, mi, se);
    // 溢出假日期（13 月 32 日等）会被 Date 静默进位，回读分量防伪
    if (t.getFullYear() !== y || t.getMonth() !== mo - 1 || t.getDate() !== d) return null;
    return t.getTime();
}

/**
 * 距今天数档位：0=今天 … REVTRACE_TIERS-1=前4天；更早/解析失败/未来 → null（无色）。
 * 日历日差非 24h 差（分桶单位=按天拍板；昨晚 23:59 距今晨 00:30=昨天档）。
 */
export function tierOf(updated: string, now: Date): number | null {
    const t = parseKernelTime(updated);
    if (t == null) return null;
    const u = new Date(t);
    // 本地日期分量拼 UTC 零点做纯日差：两 UTC 零点差恒为整天数，DST/闰年免疫
    const dayOf = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = (dayOf(now) - dayOf(u)) / 86400000;
    return diff >= 0 && diff < REVTRACE_TIERS ? diff : null;
}

/**
 * 上色判据：窗口内 且 晚于 enrollment 基线。基线空/畸形（未纳入/存储损坏）恒不染
 * ——enroll 是染色前提，防「首开满屏一色」。
 */
export function shouldColor(updated: string, enrolledAt: string, now: Date): boolean {
    if (!KERNEL_TIME_RE.test(enrolledAt)) return false;
    return tierOf(updated, now) != null && updated > enrolledAt;
}

// ============ revtrace-scope：渐进文档判定（"prog" 档门控）============

/** 摘抄产物锚键（custom-pdigest-* 家族现役四键，gconst 单一事实源） */
const PDIGEST_IAL_KEYS = [PDIGEST_CTIME, PDIGEST_LAST_ID, PDIGEST_INDEX, PDIGEST_PARENT_ID];

/**
 * 「是渐进文档」纯信号判定（挂单测）：命中 progStorage 注册书，或文档 IAL 带渐进锚键
 * 任一——custom-progmark（书/片/prog-data 锚文档统一挂载键，getDocIal* 家族的值全落此键）
 * / custom-book-writing（写作书）/ custom-pdigest-*（摘抄产物）。ial 空对象/兜底查询失败
 * 时仅靠注册书信号（fail-safe 偏保守=跳过不染，漏染由 30s 缓存过期后下次出场修正）。
 */
export function isProgDocBySignals(ial: Record<string, string> | null | undefined, isRegistered: boolean): boolean {
    if (isRegistered) return true;
    if (!ial) return false;
    if (ial[MarkKey] || ial[BOOK_WRITING]) return true;
    return PDIGEST_IAL_KEYS.some((k) => !!ial[k]);
}

// 30s 短缓存（digestState 同量级）：判定输入=注册书（内存）+文档 IAL（重查询走 HTTP），
// 出场链五事件高频触发须兜住；加书/删书等导致注册集变化由 TTL 自然过期吸收
const PROG_DOC_TTL_MS = 30_000;
const progDocCache = new Map<string, { ok: boolean; ts: number }>();

/** 单测隔离用：清 isProgDoc 缓存 */
export function resetProgDocCacheForTest() {
    progDocCache.clear();
}

/**
 * 运行时判定（"prog" 档出场门控消费）：IAL 优先读 protyle.background?.ial（内存零请求，
 * isDailyNoteIal 同款先例），缺则 getBlockAttrs 一次兜底；结果 30s 缓存。
 * 注册书命中走内存快判不进缓存（isRegisteredBook 零开销，缓存反而陈旧化加书场景）。
 */
export async function isProgDoc(protyle: any, docID: string): Promise<boolean> {
    if (!docID) return false;
    if (progStorage.isRegisteredBook(docID)) return true;
    const hit = progDocCache.get(docID);
    if (hit && Date.now() - hit.ts < PROG_DOC_TTL_MS) return hit.ok;
    let ial = protyle?.background?.ial as Record<string, string> | null | undefined;
    if (!ial || Object.keys(ial).length === 0) {
        ial = await siyuan.getBlockAttrs(docID).catch(() => null);
    }
    const ok = isProgDocBySignals(ial, false);
    progDocCache.set(docID, { ok, ts: Date.now() });
    return ok;
}

/** 同步读判定缓存（MutationObserver 回调用）：不看 TTL（peekUpdatedMap 只读哲学——
 *  条不丢，注册集/IAL 变化由出场全量修正）；注册书内存快判同款先行，缓存 miss=false
 *  保守跳过本轮补挂 */
function isProgDocSync(docID: string): boolean {
    if (progStorage.isRegisteredBook(docID)) return true;
    return progDocCache.get(docID)?.ok ?? false;
}

// ============ □2 数据层：updated 快照（TTL 缓存）============

// 10s TTL（digestMarker 60s 模式缩窗——着色要跟手，编辑后数秒内重出场即见新色；
// 出场链五事件高频触发，缓存兜住活跃编辑期的 SQL 频率）
const CACHE_TTL_MS = 10_000;
const cache = new Map<string, { map: Map<string, string>; ts: number }>();

export function invalidateRevTrace(docID?: string) {
    if (docID) cache.delete(docID);
    else cache.clear();
}

/** docID → (blockID → updated) 全量快照；rows 空文档查无（删除/索引未就绪）返回空 Map */
export async function updatedMapOf(docID: string): Promise<Map<string, string>> {
    const hit = cache.get(docID);
    if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.map;
    const rows = ((await siyuan.sql(
        `select id, updated from blocks where root_id='${docID}' limit 1000000`,
    )) ?? []) as any[];
    const map = new Map(
        rows.filter((r: any) => r?.id && r?.updated).map((r: any) => [r.id as string, r.updated as string]),
    );
    cache.set(docID, { map, ts: Date.now() });
    return map;
}

/** 只读缓存（重画补挂零 SQL 红线）：不看 TTL，数据至多陈旧「上次出场以来的编辑」——条不丢、
 *  色档偏差由下次出场修正（10s TTL 折衷同款 by design） */
function peekUpdatedMap(docID: string): Map<string, string> | null {
    return cache.get(docID)?.map ?? null;
}

// ============ □3 视图层：DOM 注入渲染 ============

const MARK_CLASS = "prog-revtrace-mark";

// □4 开关接线（revtrace-scope 三档化）：revTraceScope store（默认 off；设置面板三档 select
// 与命令 toggle 同源），出场门控实时读——设置面板 bind:value 与命令 .set() 都走订阅
// applyRevTraceEnabled 实时清/挂（index.ts）

/** 命令 toggle 的「上次范围档」记忆：任何非 off 档落地即记录（index.ts 订阅写入）；
 *  从未有非 off 值（新装/老开关本就关未迁移）时空串，toggle 开时回退 "prog" */
let lastScope = "";
export function rememberRevTraceScope(scope: string) {
    if (scope !== "off") lastScope = scope;
}
export function lastRevTraceScope(): string {
    return lastScope || "prog";
}

/** 档位翻转后的实时生效（index.ts 订阅调）：切档全局清旧档残留（如 all→prog 须撤掉
 *  非渐进文档的条——纯 DOM 零落盘，reload 即消）；非 off 档=当前激活编辑器按新档立即
 *  补染（其余编辑器随下次出场事件自然染——digest 族同款事件模型；"prog" 档下激活页
 *  非渐进文档时 revTraceOnAppear 自会清跳过） */
export function applyRevTraceEnabled(scope: string) {
    document.querySelectorAll(`.${MARK_CLASS}`).forEach((m) => m.remove());
    if (scope === "off") return;
    const p = getActiveProtyle();
    if (p) revTraceOnAppear(p, p?.block?.rootID ?? "").catch(() => { });
}

/** 只清不打（feature 关/查询空路径）——纯 DOM 注入零落盘，reload 即消，插件热升级
 *  reload 不重建已开文档 DOM 须出场主动剥一遍（clearDigestMarks 同哲学） */
export function clearRevTrace(welement: HTMLElement) {
    welement?.querySelectorAll(`.${MARK_CLASS}`).forEach(m => m.remove());
    // 剥 span 连带收 tip（清旧重打/关功能后悬停源已逝，靠下次 mouseover 重显）
    if (tipOwner) {
        tipOwner = null;
        hideFloatTip();
    }
}

/** selection 锚所在块的 id（空=无编辑现场）——正在编辑的块本轮跳过注入，防 IME/
 *  光标被打断；下次出场事件（点击/切页签）自然补挂 */
function editingBlockID(welement: HTMLElement): string {
    let n: Node | null = document.getSelection()?.anchorNode ?? null;
    while (n && n !== welement) {
        const id = (n as HTMLElement).getAttribute?.("data-node-id");
        if (id) return id;
        n = n.parentElement;
    }
    return "";
}

/**
 * 出场链入口（ProgressiveBtn 四态路径调用）：取数→enroll 基线→按 updated 色层打标。
 * 幂等清旧重打；懒加载双向窗口随出场五事件反复调用（digestMarker □15 同款）。
 * 叶子块过滤：div 内嵌套 [data-node-id] 的容器块（列表/引用/超级块）不染——内核
 * RefreshUpdated 级联刷父链，不过滤会把容器染花。span 零 textContent 硬约束。
 */
export async function revTraceOnAppear(protyle: any, docID: string) {
    const welement: HTMLElement = protyle?.wysiwyg?.element;
    if (!welement) return;
    const scope = revTraceScope.get();
    if (scope === "off" || !docID) {
        clearRevTrace(welement);
        return;
    }
    // "prog" 档门控：非渐进文档直接跳过（不发 SQL、不扫 DOM、不 enroll 基线）；
    // 清残留兜住切档（all→prog）后非渐进文档内存中的旧条
    if (scope === "prog" && !(await isProgDoc(protyle, docID))) {
        clearRevTrace(welement);
        return;
    }
    try {
        await revTraceOnAppear0(welement, docID);
    } catch (e: any) {
        debugLog("revtrace", `appear 异常 docID=${docID}: ${e?.message ?? e}`, "progressive");
    }
}

/** 单块打标（出场全量与重画补挂共用）：叶子过滤+幂等（已有条早退）+编辑现场跳过+
 *  基线/窗口判染；命中染返回 true。span 形态/tier 类名/aria-label 见 insertMarkSpan */
function markBlockIfDue(
    div: HTMLElement,
    map: Map<string, string>,
    base: string,
    now: Date,
    editingID: string,
): boolean {
    if (div.querySelector("[data-node-id]")) return false; // 容器块跳过（叶子过滤）
    if (div.querySelector(`:scope > .${MARK_CLASS}`)) return false; // 幂等（出场/补挂双通道并发安全）
    const id = div.getAttribute("data-node-id");
    if (!id || id === editingID) return false;
    const updated = map.get(id);
    if (!updated || !shouldColor(updated, base, now)) return false;
    insertMarkSpan(div, tierOf(updated, now) ?? 0, updated); // shouldColor 已保证 tier 非空
    return true;
}

function insertMarkSpan(div: HTMLElement, tier: number, updated: string) {
    const span = document.createElement("span");
    // tier 修饰类名=prog-revtrace-tN（无 -mark 中段，与 scss .prog-revtrace-mark.prog-revtrace-tN
    // 对齐；曾错写 -mark-tN 致 tier 背景规则全不命中=span 隐形，视觉评审二轮破案）
    span.className = `${MARK_CLASS} prog-revtrace-t${tier}`;
    span.setAttribute("contenteditable", "false");
    // hover 提示（□4）：aria-label 驱动 #prog-float-tip 单例（digest 来源提示同款，
    // 自建元素对思源 tip 生态隐身防补刀）；tier=距今天数，日月分量取自 updated 本体。
    // □7 后悬停走宿主块委托（ensureHoverDelegate，span 本体 pointer-events:none 真鼠标
    // 永不命中——旧 span mouseenter 是死通道已拆，勿再挂回来）
    span.setAttribute("aria-label", tomatoI18n.修订痕迹提示(tier, +updated.slice(4, 6), +updated.slice(6, 8)));
    div.insertBefore(span, div.firstChild);
}

async function revTraceOnAppear0(welement: HTMLElement, docID: string) {
    const map = await updatedMapOf(docID);
    debugLog("revtrace", `appear docID=${docID} rows=${map.size}`, "progressive");
    ensureHoverDelegate(welement);
    // 清旧紧贴打标（digestMarker review P1#1 同款：清在 await 前的并发交错会同块双插
    // span）；查询空（文档已删/索引未就绪）也清——重渲染孤儿 span 直接按类剥
    clearRevTrace(welement);
    if (map.size === 0) {
        // 查询空两形态：①新建索引未就绪（首开热路径）→ 无条目先 enroll 占基线，防
        // 「基线迟到至就绪后的出场」吞掉创建→就绪窗口内的编辑（A2 回归实锤：编辑
        // updated<迟到基线被误判「原文」永不染）；②文档已删（含 piece 删除）→ 条目
        // 留存无害（出场事件随页签销毁停止；残留量级 KB/年，ProgressiveStorage 已声明
        // 不做主动清扫），drop 误删基线代价更大故退役
        if (!progStorage.revTraceEnrolledAt(docID)) {
            await progStorage.enrollRevTrace(docID);
        }
        debugLog("revtrace", `docID=${docID} 查询空（索引未就绪占基线/已删条目留存）`, "progressive");
        return;
    }
    const base = progStorage.revTraceEnrolledAt(docID) || await progStorage.enrollRevTrace(docID);
    if (!base) return; // □13 门闩窗口内 enroll 未成——本轮不染，下轮出场补
    const now = new Date();
    const editingID = editingBlockID(welement);
    let marks = 0;
    welement.querySelectorAll<HTMLElement>("div[data-node-id]").forEach((div) => {
        if (markBlockIfDue(div, map, base, now, editingID)) marks++;
    });
    ensureReplantObserver(welement, docID, base);
    debugLog("revtrace", `docID=${docID} base=${base} marks=${marks}/${map.size} tier0..4`, "progressive");
}

// ============ □8 重画补挂：MutationObserver 按块增量 ============
// 根因（bear 试用「显示不出来→很久后才显示→又消失」实锤复现）：内核事务重画块 DOM 会
// 吞掉注入 span（updateBlock/打字/AI 写入等），而补挂只靠出场五事件——ws 事务广播不在
// 五事件里，纯滚动/无点击场景 span 丢了没人补；「很久之后才显示」=下一次出场事件才补，
// 继续编辑又被吞=「又消失」。大段落编辑久、出场间隔长故最显眼，小块同机制「时隐时现」。
// 对策：wysiwyg 挂 MutationObserver，块 div 被重画/滚入（addedNodes）时按块补挂——数据
// 走 peekUpdatedMap 只读缓存（零 SQL 红线：出场=真相修正，补挂=乐观续条，色档偏差窗
// by design）；与出场全量双通道并发安全（markBlockIfDue 幂等）；编辑中块照旧跳过（防
// IME 打断，出场补）；出场清旧重打自身产生的 span 插入被 Observer 识别为非块忽略。
// 弃选 ws 广播 invalidate：击穿 10s TTL 兜底=出场（每次点击都触发）频率直通 SQL，红线不动。

interface ReplantState { docID: string; base: string }
const replantStates = new WeakMap<HTMLElement, ReplantState>();
const replantObservers = new WeakMap<HTMLElement, MutationObserver>();

/** 出场链幂等挂（每个 wysiwyg 一个 Observer）；页签关闭随元素 GC */
function ensureReplantObserver(welement: HTMLElement, docID: string, base: string) {
    replantStates.set(welement, { docID, base });
    if (replantObservers.has(welement)) return;
    const mo = new MutationObserver((muts) => {
        const st = replantStates.get(welement);
        const scope = revTraceScope.get();
        // 三档门控（revtrace-scope）：off 不补挂；"prog" 档须文档仍是渐进的（切档
        // all→prog 后残留 observer 的宿主可能已不在范围内）——同步读判定缓存
        if (!st || scope === "off") return;
        if (scope === "prog" && !isProgDocSync(st.docID)) return;
        const divs = new Set<HTMLElement>();
        for (const m of muts) {
            for (const n of m.addedNodes) {
                if (!(n instanceof HTMLElement)) continue;
                if (n.matches("div[data-node-id]")) divs.add(n);
                n.querySelectorAll<HTMLElement>("div[data-node-id]").forEach((d) => divs.add(d));
            }
        }
        if (!divs.size) return;
        const map = peekUpdatedMap(st.docID);
        if (!map?.size) return; // 无缓存=文档未出场过，出场链全量兜底
        const editingID = editingBlockID(welement);
        const now = new Date();
        let n = 0;
        divs.forEach((d) => { if (markBlockIfDue(d, map!, st.base, now, editingID)) n++; });
        if (n) debugLog("revtrace", `replant docID=${st.docID} blocks=${n}`, "progressive");
    });
    mo.observe(welement, { childList: true, subtree: true });
    replantObservers.set(welement, mo);
}

// ============ □7 悬停提示通道：宿主块委托（真鼠标通道）============
// 根因（bear 主实例 P0 实锤）：.prog-revtrace-mark 本体 pointer-events:none（纯提示勿拦
// 指针哲学的误用）——真鼠标 hover 的 hit-testing 永不落 span，mouseenter 永不触发；曾用
// 合成 mouseenter 验证=假绿（合成事件绕过 pointer-events，教训沉淀 recipe-revtrace）。
// 对策（B 方案）：span 保持穿透（不挡选字/caret），检测改 wysiwyg 委托 mouseover/mouseout
// 按几何判中（指针落 span 条带放宽区）——委托不依赖 span 存活，出场清旧重打/内核重画
// 重建 span 不丢悬停态；digest/material 的 tip（同 #prog-float-tip 单例、各自 span
// mouseenter 驱动且本体可交互）不受影响：hide 只收自己 show 的那份。

/** 条带命中判定：x 落 span 条带放宽区（3px 裸条太难瞄：左放宽 3 右放宽 7 ≈13px 瞄准带）、
 *  y 在块全高内（span top/bottom=块全高，±1 容差）——导出供单测 */
export function hitRevTraceBand(x: number, y: number, r: { left: number; top: number; right: number; bottom: number }): boolean {
    return x >= r.left - 3 && x <= r.right + 7 && y >= r.top - 1 && y <= r.bottom + 1;
}

const hoverDelegated = new WeakSet<HTMLElement>();
/** 当前由 revtrace 持有的 tip（共用单例只收自己的：digest/material mouseenter 抢显时轮不到我们 hide） */
let tipOwner: HTMLElement | null = null;

function blockDivFrom(target: EventTarget | null, welement: HTMLElement): HTMLElement | null {
    let n = target as Node | null;
    while (n && n !== welement) {
        if ((n as HTMLElement).getAttribute?.("data-node-id")) return n as HTMLElement;
        n = (n as HTMLElement).parentElement;
    }
    return null;
}

/** 出场链幂等挂委托（每个 wysiwyg 一次）；页签关闭随元素 GC，WeakSet 不阻回收 */
function ensureHoverDelegate(welement: HTMLElement) {
    if (hoverDelegated.has(welement)) return;
    hoverDelegated.add(welement);
    welement.addEventListener("mouseover", (e: MouseEvent) => {
        // 每次进入元素重判命中：条带内→show（同块幂等重定位无闪烁）；否则离带→收自己的 tip
        const div = blockDivFrom(e.target, welement);
        const span = div?.querySelector<HTMLElement>(`:scope > .${MARK_CLASS}`) ?? null;
        const r = span?.getBoundingClientRect();
        if (span && r && hitRevTraceBand(e.clientX, e.clientY, r)) {
            tipOwner = span;
            showFloatTip(span);
            return;
        }
        if (tipOwner) {
            tipOwner = null;
            hideFloatTip();
        }
    });
    welement.addEventListener("mouseout", (e: MouseEvent) => {
        // 移出整个编辑器（relatedTarget 在 wysiwyg 外/null）才收——块内/块间移动交给 mouseover 重判
        if (tipOwner && !welement.contains(e.relatedTarget as Node)) {
            tipOwner = null;
            hideFloatTip();
        }
    });
}
