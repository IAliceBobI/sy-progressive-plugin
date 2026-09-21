// revtrace □2/□3（docs/checkpoints/2026-09-08-1750-handoff-revtrace.md）：块级修订痕迹——
// 按编辑时间着色的回看视图（鸟 650189 需求：回头翻时看见哪些是上次改的、哪些是上上次改的）。
// 设计定稿=**纯视图零档案**：不记桶不存快照，色层=f(块 `updated` 距今天数)，多层回看由块间
// updated 分布天然表达（同块多轮改=最新层获胜）；唯一持久化=enrollment 基线映射（ProgressiveStorage，
// 首次纳入时刻——规则②防满屏，基线前内容永远无色=「原文」，此后改/新块=「加工」逐层上色）。
// 零内容写入硬红线：不进 .sy、不进同步、不污染导出/闪卡，关掉即无痕（revperf2 件3 起视觉
// 载体=块 div 挂类 prog-revtrace-block.prog-revtrace-tN，零节点注入；旧 span 条带通道退役）。
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

/** 色窗天数：今天+前 4 天（Scrivener 5 档先例窗宽保留），更早无色 */
export const REVTRACE_WINDOW_DAYS = 5;

/** 视觉档数（matfeed □5 形态分工后 09-10 bear 拍板恢复 5 档）：形态互斥已由
 * 徽章分工保证（竖条专留本族），「五颜六色难区分」根因消除——恢复 Scrivener
 * 一天一档颗粒度（t0=今天 … t4=前4天，与窗宽相等）。
 * ⚠三方手动同步点：改档数须同改 bucketTier 映射与 index.scss 的 .prog-revtrace-tN
 * 规则（本常量生产代码零消费，仅测试锁定防漂移） */
export const REVTRACE_TIERS = 5;

/** 天数 → 视觉档：一天一档恒等映射（0..4 → t0..t4）。保留这层间接=档位颗粒度
 * 的单点调节阀（3 档折叠期教训：bear 一句话改回，将来再调只动此函数+色值）。
 * hover 文案仍按真实天数（markLabel 收 days 非档位）；revperf2 起文案 hover 现算，
 * 恒等映射下换档即类名变化，旧「label 无条件刷新防御」不再需要 */
export function bucketTier(days: number): number {
    return days;
}

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
 * 距今天数：0=今天 … REVTRACE_WINDOW_DAYS-1=前4天；更早/解析失败/未来 → null（无色）。
 * 日历日差非 24h 差（分桶单位=按天拍板；昨晚 23:59 距今晨 00:30=昨天档）。
 */
export function tierOf(updated: string, now: Date): number | null {
    const t = parseKernelTime(updated);
    if (t == null) return null;
    const u = new Date(t);
    // 本地日期分量拼 UTC 零点做纯日差：两 UTC 零点差恒为整天数，DST/闰年免疫
    const dayOf = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = (dayOf(now) - dayOf(u)) / 86400000;
    return diff >= 0 && diff < REVTRACE_WINDOW_DAYS ? diff : null;
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

/** SQL rows → (blockID → updated) 快照构建（含空块过滤，revperf2 双契约）。空内容块
 *  永不入 map（bear 拍板 2026-09-09：空行零信息量，砍视觉噪音）——过滤责任两通道：
 *  ① 主路径=SQL where content!='' 下推内核（行无 content 字段，不传输巨书内容体），
 *  本函数对无 content 字段的行全保留；② 防御路径=行带 content 字段时仍过滤（直调/
 *  旧调用方形态，空串/纯空白/null 滤除）。图片段落实测 content='<img … />' 非空、
 *  公式/代码块同理（源文本即 content），不误杀 */
export function rowsToUpdatedMap(rows: any[]): Map<string, string> {
    return new Map(
        rows
            .filter((r: any) => {
                if (!r?.id || !r?.updated) return false;
                const c = r.content;
                return c === undefined || (typeof c === "string" && c.trim() !== "");
            })
            .map((r: any) => [r.id as string, r.updated as string]),
    );
}

/** 同 docID 在途查询去重（revperf2）：出场五事件同帧并发（剖析实测冷开局 4 路并发同
 *  查询，01:44:54.797/.801/.805/.806 四连）共享同一 Promise，冷开局 SQL 4→1 */
const inFlightMaps = new Map<string, Promise<Map<string, string>>>();

/** docID → (blockID → updated) 全量快照；rows 空文档查无（删除/索引未就绪）返回空 Map。
 *  revperf2：不拉 content 列——空块过滤 where content!='' 下推内核，传输面从「全文档
 *  内容体序列化」（剖析 561 块 41KB 内容=131KB JSON 载荷）降到 id+updated 两列 32KB */
export async function updatedMapOf(docID: string): Promise<Map<string, string>> {
    const hit = cache.get(docID);
    if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.map;
    const inflight = inFlightMaps.get(docID);
    if (inflight) return inflight;
    const p = (async () => {
        const rows = ((await siyuan.sql(
            `select id, updated from blocks where root_id='${docID}' and content!='' limit 1000000`,
        )) ?? []) as any[];
        const map = rowsToUpdatedMap(rows);
        cache.set(docID, { map, ts: Date.now() });
        return map;
    })().finally(() => inFlightMaps.delete(docID));
    inFlightMaps.set(docID, p);
    return p;
}

/** 只读缓存（重画补挂零 SQL 红线）：不看 TTL，数据至多陈旧「上次出场以来的编辑」——条不丢、
 *  色档偏差由下次出场修正（10s TTL 折衷同款 by design） */
function peekUpdatedMap(docID: string): Map<string, string> | null {
    return cache.get(docID)?.map ?? null;
}

// ============ □3 视图层：块级染色渲染 ============

/** 块级染色类（revperf2 件3）：块 div 直接挂。命名刻意避开旧 span 通道类名
 *  prog-revtrace-mark——seller/recite 打包内联的旧版 progressive CSS 抄送副本
 *  （「改共享 scss 后 p/s/r 须全量重建」坑：旧副本随对方发版节奏长期存活）含
 *  .prog-revtrace-mark{position:absolute;width:3px} span 形态规则，块 div 复用同名
 *  会被钉成 3px 细条（6810 实测：seller 旧 bundle 压死新通道）。旧类名仅存于热升级
 *  残留清扫通道；档类 prog-revtrace-tN 无单类规则、旧规则皆与 -mark 复合，复用安全 */
const BLOCK_MARK_CLASS = "prog-revtrace-block";
const LEGACY_SPAN_CLASS = "prog-revtrace-mark";

/** 旧版 span 通道一次性清扫守卫（每编辑器每会话一次） */
const legacySwept = new WeakSet<HTMLElement>();

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
    document.querySelectorAll<HTMLElement>(`.${BLOCK_MARK_CLASS}, span.${LEGACY_SPAN_CLASS}`).forEach((el) => {
        if (el.tagName === "SPAN") { el.remove(); return; } // 旧版 span 通道残留（热升级窗口）
        stripRevTraceClasses(el);
    });
    if (scope === "off") return;
    const p = getActiveProtyle();
    if (p) revTraceOnAppear(p, p?.block?.rootID ?? "").catch(() => { });
}

/** 只清不打（feature 关/查询空路径）——块级染色零落盘，reload 即消，插件热升级
 *  reload 不重建已开文档 DOM 须出场主动剥一遍（clearDigestMarks 同哲学）。
 *  块 div 剥本族类（内核/第三方类保全）；span 形态=旧版热升级残留整节点移除 */
export function clearRevTrace(welement: HTMLElement) {
    welement?.querySelectorAll<HTMLElement>(`.${BLOCK_MARK_CLASS}, span.${LEGACY_SPAN_CLASS}`).forEach((el) => {
        if (el.tagName === "SPAN") { el.remove(); return; }
        stripRevTraceClasses(el);
    });
    // 剥染连带收 tip（清旧重打/关功能后悬停源已逝，靠下次 mouseover 重显）
    if (tipOwner) {
        tipOwner = null;
        hideFloatTip();
    }
}

/** selection 锚所在块的 id（空=无编辑现场）——正在编辑的块本轮跳过挂类，防 IME/
 *  光标被打断；下次出场事件（点击/切页签）自然补染 */
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
 * 出场链入口（ProgressiveBtn 四态路径调用）：取数→enroll 基线→按 updated 色层染色。
 * 幂等单块对账（revperf：稳定态出场零 DOM 变更，防高频出场的布局翻转迟顿）；懒加载双向窗口随出场五事件反复调用（digestMarker □15 同款）。
 * 叶子块过滤：div 内嵌套 [data-node-id] 的容器块（列表/引用/超级块）不染——内核
 * RefreshUpdated 级联刷父链，不过滤会把容器染花。块级染色零属性落 DOM（⑦ 纪律）。
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

const TIER_CLASS_RE = /^prog-revtrace-t\d$/;

/** 剥单块的本族染色类（mark+tN；内核类与第三方类保全）。classList.remove 不存在即
 *  no-op 零 mutation（⑦ 前值比较纪律：只写 classList 通道，同值天然幂等） */
function stripRevTraceClasses(div: HTMLElement) {
    div.classList.remove(BLOCK_MARK_CLASS);
    for (const c of [...div.classList]) {
        if (TIER_CLASS_RE.test(c)) div.classList.remove(c);
    }
    if (tipOwner === div) {
        tipOwner = null;
        hideFloatTip();
    }
}

/**
 * 单块对账（出场全量与重画补挂共用，revperf2 块级染色通道，导出供单测）：按块当前
 * 染色态与应染态 diff，返回是否发生 DOM 变更——
 * ① 应染（窗口内且晚于基线）：无染→挂类（mark+tier 两类，内核类保全）；有染同档→
 *   零 DOM 变更（出场幂等主路径，classList 同值 add 零 mutation）；档漂移（跨天换档）
 *   →只剥本族旧档类再挂新档（零节点插拔、零布局翻转——box-shadow 换色仅重绘）
 * ② 不应染：有染→剥（褪色/出窗/基线内/换文档残留）；无染→不动
 * ③ 容器块（嵌套 data-node-id，叶子过滤）：有染→剥（历史残留）；无染→跳过
 * ④ 编辑现场块（editingID）：不挂不改（防 IME/光标打断），既有染保留——对账模型下
 *   可能带染出场，档陈旧由下次出场修正
 * 悬停文案不落 DOM：aria-label/data-* 一律不写（kernel 块 div 进思源 tip 生态风险），
 * hover 委托按 replant 缓存现算（ensureHoverDelegate）——旧 span 版的「label 刷新
 * 防御」随之不需要（现算恒新鲜）
 */
export function reconcileBlock(
    div: HTMLElement,
    map: Map<string, string>,
    base: string,
    now: Date,
    editingID: string,
): boolean {
    const marked = div.classList.contains(BLOCK_MARK_CLASS);
    if (div.querySelector("[data-node-id]")) { // 容器块（叶子过滤）
        if (marked) { stripRevTraceClasses(div); return true; }
        return false;
    }
    const id = div.getAttribute("data-node-id");
    if (!id) return false;
    const updated = map.get(id);
    if (!updated || !shouldColor(updated, base, now)) {
        if (marked) { stripRevTraceClasses(div); return true; }
        return false;
    }
    if (id === editingID) return false; // 编辑现场：保染不保挂（防打断，下场修正）
    const days = tierOf(updated, now) ?? 0; // shouldColor 已保证非 null
    const tier = bucketTier(days); // 档位映射（当前=一天一档恒等；文案仍按真实天数）
    const tierClass = `prog-revtrace-t${tier}`;
    if (!marked) {
        div.classList.add(BLOCK_MARK_CLASS, tierClass);
        return true;
    }
    if (!div.classList.contains(tierClass)) {
        stripRevTraceClasses(div); // 只剥本族旧档类（防多档陈旧残留病态），第三方类零误伤
        div.classList.add(BLOCK_MARK_CLASS, tierClass);
        return true;
    }
    return false; // 稳定态：同档有染，零写零 mutation
}

function markLabel(days: number, updated: string): string {
    return tomatoI18n.修订痕迹提示(days, +updated.slice(4, 6), +updated.slice(6, 8));
}

async function revTraceOnAppear0(welement: HTMLElement, docID: string) {
    // revperf2 剖析打点（件3）：出场链四嫌疑源分相计时——sqlMs=updatedMapOf（含全量
    // content 列传输）、enrollMs=基线读、scanMs=全量遍历+逐块对账、reflowMs=强制样式/
    // 布局 flush（:has 宿主重算的可见代理）。6810 isDevPort 段 debugLog 直推 Loki。
    const perf0 = performance.now();
    const map = await updatedMapOf(docID);
    const perf1 = performance.now();
    debugLog("revtrace", `appear docID=${docID} rows=${map.size}`, "progressive");
    ensureHoverDelegate(welement);
    // revperf：出场不再无条件「全剥→全插」——宿主 :has(>mark) 挂着 padding-left，每轮
    // 剥插=窗口内全部染色块布局翻转两遍（实测 97 块窗口 5~7ms/轮），click_editorcontent
    // 级高频出场累计=可感知迟顿（群反馈 650189）；改单块对账（reconcileBlock），稳定态
    // 出场零 DOM 变更。查询空（文档已删/索引未就绪）由对账自然全剥（所有块无 updated
    // =不应染）；并发交错（await 后同块双插）由对账幂等分支吸收。
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
    }
    const base = progStorage.revTraceEnrolledAt(docID) || await progStorage.enrollRevTrace(docID);
    if (!base) return; // □13 门闩窗口内 enroll 未成——本轮不动（不剥不插），下轮出场补
    const perf2 = performance.now();
    // revperf2 旧通道清场：span 形态残留只可能来自上一插件版本的会话（本版零 span 产出），
    // 每编辑器一次性清扫（WeakSet 守卫），不进逐块对账（防逐块 querySelector 回吃 (b) 成本）
    if (!legacySwept.has(welement)) {
        legacySwept.add(welement);
        welement.querySelectorAll(`span.${LEGACY_SPAN_CLASS}`).forEach((s) => s.remove());
    }
    const now = new Date();
    const editingID = editingBlockID(welement);
    let changed = 0;
    let blocks = 0;
    welement.querySelectorAll<HTMLElement>("div[data-node-id]").forEach((div) => {
        blocks++;
        if (reconcileBlock(div, map, base, now, editingID)) changed++;
    });
    ensureReplantObserver(welement, docID, base);
    const perf3 = performance.now();
    void welement.offsetHeight; // 强制样式/布局 flush——:has 宿主重算成本的可见代理
    const perf4 = performance.now();
    debugLog("revtrace", `perf docID=${docID} rows=${map.size} base=${base} blocks=${blocks} changed=${changed}`
        + ` sqlMs=${(perf1 - perf0).toFixed(1)} enrollMs=${(perf2 - perf1).toFixed(1)}`
        + ` scanMs=${(perf3 - perf2).toFixed(1)} reflowMs=${(perf4 - perf3).toFixed(1)}`
        + ` totalMs=${(perf4 - perf0).toFixed(1)}`, "progressive");
}

// ============ □8 重画补挂：MutationObserver 按块增量 ============
// 根因（bear 试用「显示不出来→很久后才显示→又消失」实锤复现）：内核事务重画块 DOM 会
// 换新块 div——旧 span 通道吞注入 span、revperf2 块级染色通道丢挂类（updateBlock/打字/
// AI 写入等），而补挂只靠出场五事件——ws 事务广播不在五事件里，纯滚动/无点击场景染色丢
// 了没人补；「很久之后才显示」=下一次出场事件才补，继续编辑又被吞=「又消失」。大段落
// 编辑久、出场间隔长故最显眼，小块同机制「时隐时现」。
// 对策：wysiwyg 挂 MutationObserver，块 div 被重画/滚入（addedNodes）时按块补挂——数据
// 走 peekUpdatedMap 只读缓存（零 SQL 红线：出场=真相修正，补挂=乐观续染，色档偏差窗
// by design）；与出场全量双通道并发安全（reconcileBlock 幂等）；编辑中块照旧跳过（防
// IME 打断，出场补）；revperf2 后补挂只剩 classList.add/remove 微操作（同值幂等零
// mutation，⑦ 纪律），旧版「补挂插 span 撞内核 patch 半程」的注入面随之消失（defer
// 出波时序保留——零节点写入下依旧最稳）。
// 弃选 ws 广播 invalidate：击穿 10s TTL 兜底=出场（每次点击都触发）频率直通 SQL，红线不动。

interface ReplantState { docID: string; base: string }
const replantStates = new WeakMap<HTMLElement, ReplantState>();
const replantObservers = new WeakMap<HTMLElement, MutationObserver>();

// revperf2 剖析打点（件3）：replant Observer 打字期高频回调聚合——每 5s 冲一条 Loki
// 行（回调次数/mutation 记录/新增块 div/对账 DOM 变更/回调内累计耗时），量化嫌疑④
// 「subtree childList 打字期高频回调」的真实量级
const replantPerf = { cbs: 0, muts: 0, added: 0, blocks: 0, changed: 0, ms: 0.0, since: 0 };
function replantPerfTick(cbMs: number, mutCount: number, addedCount: number, blocksCount: number, changedCount: number) {
    const p = replantPerf;
    if (!p.since) { p.since = Date.now(); return; }
    p.cbs++; p.muts += mutCount; p.added += addedCount;
    p.blocks += blocksCount; p.changed += changedCount; p.ms += cbMs;
    if (Date.now() - p.since >= 5000) {
        debugLog("revtrace", `replantPerf win=${((Date.now() - p.since) / 1000).toFixed(1)}s cbs=${p.cbs}`
            + ` muts=${p.muts} addedNodes=${p.added} blocksSeen=${p.blocks} changed=${p.changed}`
            + ` cbMs=${p.ms.toFixed(1)}`, "progressive");
        p.cbs = 0; p.muts = 0; p.added = 0; p.blocks = 0; p.changed = 0; p.ms = 0; p.since = Date.now();
    }
}

/** 出场链幂等挂（每个 wysiwyg 一个 Observer）；页签关闭随元素 GC */
function ensureReplantObserver(welement: HTMLElement, docID: string, base: string) {
    replantStates.set(welement, { docID, base });
    if (replantObservers.has(welement)) return;
    const mo = new MutationObserver((muts) => {
        const cbT0 = performance.now();
        const st0 = replantStates.get(welement);
        const scope = revTraceScope.get();
        // 三档门控（revtrace-scope）：off 不补挂；"prog" 档须文档仍是渐进的（切档
        // all→prog 后残留 observer 的宿主可能已不在范围内）——同步读判定缓存
        if (!st0 || scope === "off") { replantPerfTick(performance.now() - cbT0, muts.length, 0, 0, 0); return; }
        if (scope === "prog" && !isProgDocSync(st0.docID)) { replantPerfTick(performance.now() - cbT0, muts.length, 0, 0, 0); return; }
        let addedCount = 0;
        const divs = new Set<HTMLElement>();
        for (const m of muts) {
            for (const n of m.addedNodes) {
                addedCount++;
                if (!(n instanceof HTMLElement)) continue;
                if (n.matches("div[data-node-id]")) divs.add(n);
                n.querySelectorAll<HTMLElement>("div[data-node-id]").forEach((d) => divs.add(d));
            }
        }
        if (!divs.size) { replantPerfTick(performance.now() - cbT0, muts.length, addedCount, 0, 0); return; }
        if (!peekUpdatedMap(st0.docID)?.size) { replantPerfTick(performance.now() - cbT0, muts.length, addedCount, divs.size, 0); return; } // 无缓存=文档未出场过，出场链全量兜底
        // 补挂出波 defer（setTimeout 宏任务）：mutation 回调在 microtask 跑，若内核
        // patch（Backspace 合并/重画）分帧进行中，波内同步插 span 会撞 patch 半程的
        // DOM 结构假设（行首退格误删同族根因，09-16 群反馈二分实锤）；出波后内核
        // patch 与 selection 均已落地再补，代价=补挂晚一帧视觉无感。依赖（st/map/
        // editingID/now）全部 defer 内重取——editingID 晚取更准（selection 已摆好）
        setTimeout(() => {
            const st = replantStates.get(welement);
            const cur = revTraceScope.get();
            if (!st || cur === "off") return;
            if (cur === "prog" && !isProgDocSync(st.docID)) return;
            const map = peekUpdatedMap(st.docID);
            if (!map?.size) return;
            const editingID = editingBlockID(welement);
            const now = new Date();
            let n = 0;
            divs.forEach((d) => { if (reconcileBlock(d, map!, st.base, now, editingID)) n++; });
            replantPerfTick(performance.now() - cbT0, muts.length, addedCount, divs.size, n);
            if (n) debugLog("revtrace", `replant docID=${st.docID} blocks=${n}`, "progressive");
        }, 0);
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

/** 出场链幂等挂委托（每个 wysiwyg 一次）；页签关闭随元素 GC，WeakSet 不阻回收。
 *  revperf2：检测从「span 条带矩形」改「块 div 挂类判定+合成条带几何」——条带几何与
 *  旧 span 同位（left 2px/宽 3px 全高），hitRevTraceBand 及其单测零改动；文案按
 *  replant 缓存现算（不再读 aria-label——块 div 不落任何本族属性，防进思源 tip 生态） */
function ensureHoverDelegate(welement: HTMLElement) {
    if (hoverDelegated.has(welement)) return;
    hoverDelegated.add(welement);
    welement.addEventListener("mouseover", (e: MouseEvent) => {
        // 每次进入元素重判命中：条带内→show（同块幂等重定位无闪烁）；否则离带→收自己的 tip
        const div = blockDivFrom(e.target, welement);
        let tip: { text: string; anchor: { left: number; top: number; bottom: number; width: number } } | null = null;
        if (div?.classList.contains(BLOCK_MARK_CLASS)) {
            const r = div.getBoundingClientRect();
            const band = { left: r.left + 2, top: r.top, right: r.left + 5, bottom: r.bottom };
            if (hitRevTraceBand(e.clientX, e.clientY, band)) {
                const st = replantStates.get(welement);
                const updated = st ? peekUpdatedMap(st.docID)?.get(div.getAttribute("data-node-id") ?? "") : null;
                const days = updated ? tierOf(updated, new Date()) : null;
                if (days != null) {
                    tip = {
                        text: markLabel(days, updated!),
                        anchor: { left: band.left, top: band.top, bottom: band.bottom, width: 3 },
                    };
                }
            }
        }
        if (tip && div) {
            tipOwner = div;
            showFloatTip(div, { text: tip.text, anchorRect: tip.anchor });
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
