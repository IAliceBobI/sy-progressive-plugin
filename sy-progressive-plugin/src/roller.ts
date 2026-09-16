// v5 核心循环引擎（□3）：滚筒轮转 / 已读记账 / 欠债汇总 / 归档打标。
// 纯逻辑 + deps 注入（progData.ts 同款模式），行为全可单测，不依赖 UI 与活实例。
// 设计共识：出片即轮转（order+lastServed）；已读=读到新片（routemap □1 计数解耦：翻页
// 留片与下片删同权，point 前进即计；当日去重锚 p 防回看-前进循环刷账，跨天重置=重读
// 也算读）；欠债滚动累积（每日记档位+已读，读满封顶不增债、无抵扣）；计划流退役。

/** reading-order.json 内容（plugin storage 独立键，books.json 不动结构） */
export interface ReadingOrder {
    /** 书序（Dock 管理面板拖动调序就改它；新书/历史书 append 兜底） */
    order: string[];
    /** 滚筒最后出片的书 */
    lastServed: string;
}

/** 每日日志块 IAL custom-proglog-data 的数据（机器唯一事实源，块内容是投影） */
export interface DayLogData {
    /** 当日档位（1/3/5，记账时同步当前设置） */
    q: number;
    /** bookID -> 当日已读片数（Dock 书卡「今日已读点」的数据需求） */
    b: { [bookID: string]: number };
    /** bookID -> 上次记账时的 point（routemap □1 当日去重锚：新 point 创新高才计，
        防回看-前进循环刷账；跨天新块自然无锚=重读也算读） */
    p?: { [bookID: string]: number };
    /** 全局重现计数（□2 额度分池：重现族消耗轮次计数，与书池 b 独立——重现=复习
        不占书额度不计已读；老块无此字段读作 0） */
    rc?: number;
    /** 写作侧当日活动计数（火苗分家 bear 2026-09-15 拍板：写作书开槽/素材消化退出
        阅读 quota 池 b，改记本池——重度写作用户阅读欠债变小=预期；与 rc 分池同款
        模式。写作火苗「今日已写」/书卡写作书「今日点」数据源。老块无此字段读作 {} */
    w?: { [bookID: string]: number };
}

export interface DebtSummary {
    readToday: number;
    quotaToday: number;
    /** 累积欠债 = Σ max(0, 当日q − 当日已读)，无清零日、超额不抵扣 */
    debt: number;
    /** 今日缺口 = max(0, 实时档位 − 今日已读)——实时分量（□4⑤ 来源拆分：tooltip 标注
     *  「今日缺 N」vs「历史欠债 N」，治「读满还欠」的困惑）。今日无日志块时=全档位，
     *  但不入 debt（记账口径：无行不入债，块由首笔 markRead 落） */
    todayGap: number;
    /** 历史欠债 = Σ 历史天 max(0, q−read)（当日结算恒定）。同日异常双块时取末行口径 */
    histDebt: number;
    /** 累计已读 = Σ 各日 read（progpush □2 火苗 tooltip 尾行；含今天，超额原样） */
    totalRead: number;
    state: "ok" | "warn" | "over";
}

export interface RollerDeps {
    loadOrder(): Promise<ReadingOrder>;
    saveOrder(ro: ReadingOrder): Promise<void>;
    /** books.json 全部书 ID（order 兜底合并用） */
    listBookIDs(): Promise<string[]>;
    /** 不可读集合（ignored / 归档 / 读完），生产侧由调用方预计算 */
    ignoredIDs(): Promise<Set<string>>;
    archivedIDs(): Promise<Set<string>>;
    finishedIDs(): Promise<Set<string>>;
    /** 书籍状态判定链的 ⏸闭笔记本/⚠丢失 集（2026-08-28；可选=纯引擎单测免注入） */
    invisibleIDs?(): Promise<Set<string>>;
    getTodayStr(): string;
    /** 设置档位（1/3/5 默认 3） */
    getQuota(): number;
    /** 按块 IAL custom-proglog-date 查当日块，返回块 ID 或 "" */
    findDayBlock(date: string): Promise<string>;
    readDayBlockData(blockID: string): Promise<DayLogData>;
    createDayBlock(date: string, data: DayLogData, summary: string): Promise<string>;
    updateDayBlock(blockID: string, date: string, data: DayLogData, summary: string): Promise<void>;
    getBookName(bookID: string): Promise<string>;
    /** 全量每日 {date, q, read}（热力图/欠债数据源） */
    loadAllDays(): Promise<{ date: string; q: number; read: number }[]>;
    setBookArchivedIal(bookID: string, ts: string): Promise<void>;
    nowTimestamp(): string;
}

export function mergeMissingBooks(ro: ReadingOrder, knownBookIDs: string[]): ReadingOrder {
    // known 先洗 _cache 脏键（booksInfos 书/索引键混存），再双向对账：
    // 缺的补尾、死的剔除（□2 删书不清 order 留的死键会被滚筒选中报错）
    const known = new Set(knownBookIDs.filter(id => !id.endsWith("_cache")));
    const kept = ro.order.filter(id => known.has(id));
    const inOrder = new Set(kept);
    const missing = [...known].filter(id => !inOrder.has(id));
    if (missing.length === 0 && kept.length === ro.order.length) return ro;
    return { order: [...kept, ...missing], lastServed: ro.lastServed };
}

export function pickNextBook(ro: ReadingOrder, readable: Set<string>): string | null {
    const n = ro.order.length;
    if (n === 0) return null;
    const start = ro.lastServed ? ro.order.indexOf(ro.lastServed) : -1;
    // start+1 起环形扫一圈（含 start 自己——单书场景连续出片）；lastServed 不在 order 时从头扫
    for (let k = 1; k <= n; k++) {
        const idx = start < 0 ? k - 1 : (start + k) % n;
        const bookID = ro.order[idx];
        if (readable.has(bookID)) return bookID;
    }
    return null;
}

export function incrementDay(data: DayLogData, bookID: string, quota: number, point?: number): DayLogData {
    const next: DayLogData = { q: quota, b: { ...data.b, [bookID]: (data.b[bookID] ?? 0) + 1 } };
    if (point != null) next.p = { ...data.p, [bookID]: point };
    else if (data.p) next.p = { ...data.p };
    return next;
}

/** 全局重现计数 +1（□2 额度分池：b/q/p 全不动——重现族消耗与书池完全独立） */
export function incrementRevisit(data: DayLogData): DayLogData {
    return { ...data, rc: (data.rc ?? 0) + 1 };
}

/** 写作活动 +1（火苗分家 w 分池：b/q/p 全不动——阅读已读/欠债与写作计数彻底分家） */
export function incrementWriting(data: DayLogData, bookID: string): DayLogData {
    return { ...data, w: { ...(data.w ?? {}), [bookID]: ((data.w ?? {})[bookID] ?? 0) + 1 } };
}

export function summarizeDebt(
    days: { date: string; q: number; read: number; write?: number }[],
    today: string,
    quotaToday: number,
): DebtSummary {
    let histDebt = 0;
    let readToday = 0;
    let todayGapInDebt = 0;
    for (const d of days) {
        // 火苗分家 P0（review 09-15）：纯写作日（read=0 且 write>0）不背阅读债——
        // markWrite 首笔会建当日块（b={}），若照算 gap=q 则「只写作的一天」比
        // 「什么都没干的一天」（无日块不入债）更亏债，与「写作退出阅读 quota」
        // 拍板方向相反。混合日照算（阅读部分欠多少记多少，写作不代偿）
        const writingOnly = d.read === 0 && (d.write ?? 0) > 0;
        // 今天 q 以实时档位覆盖（改档位立即生效）；历史天按当日记录（不追溯）。
        // 同日双块（数据异常，□5 防撞修因）：今日分量取末行（与 findDayBlock 更新行同源）
        if (d.date === today) {
            readToday = d.read;
            todayGapInDebt = writingOnly ? 0 : Math.max(0, quotaToday - d.read);
        } else if (!writingOnly) {
            histDebt += Math.max(0, d.q - d.read);
        }
    }
    const debt = histDebt + todayGapInDebt;
    // 绿=无欠债；红=欠债≥2×今日档位（连续两天颗粒未收即双倍欠债）；中间为黄
    const state = debt === 0 ? "ok" : debt >= 2 * quotaToday ? "over" : "warn";
    return { readToday, quotaToday, debt, todayGap: Math.max(0, quotaToday - readToday), histDebt, totalRead: days.reduce((s, d) => s + d.read, 0), state };
}

export function formatDaySummary(data: DayLogData, bookNames: { [bookID: string]: string }): string {
    const total = Object.values(data.b).reduce((s, n) => s + n, 0);
    const parts = Object.entries(data.b).map(([id, n]) => `${bookNames[id] || id}×${n}`);
    const rc = data.rc ? ` · 重现 ${data.rc}` : "";
    // w 分池附行（火苗分家）：写作活动与阅读已读分开呈现，老块无 w 无附行
    const wTotal = Object.values(data.w ?? {}).reduce((s, n) => s + n, 0);
    const wParts = Object.entries(data.w ?? {}).map(([id, n]) => `${bookNames[id] || id}×${n}`);
    const wLine = wTotal ? ` · 写作 ${wTotal}${wParts.length ? ` —— ${wParts.join("、")}` : ""}` : "";
    return `档位 ${data.q} · 已读 ${total}${parts.length ? ` —— ${parts.join("、")}` : ""}${wLine}${rc}`;
}

export function isFinished(point: number, indexLength: number): boolean {
    return point >= indexLength;
}

export async function nextBook(deps: RollerDeps): Promise<string | null> {
    const merged = mergeMissingBooks(await deps.loadOrder(), await deps.listBookIDs());
    const unreadable = new Set<string>([
        ...await deps.ignoredIDs(),
        ...await deps.archivedIDs(),
        ...await deps.finishedIDs(),
        ...(deps.invisibleIDs ? await deps.invisibleIDs() : []),
    ]);
    const readable = new Set(merged.order.filter(id => !unreadable.has(id)));
    const pick = pickNextBook(merged, readable);
    if (pick === null) return null;
    await deps.saveOrder({ ...merged, lastServed: pick });
    return pick;
}

/** routemap □1：point=本次记账对应的新 point（gotoBlock 前进后的值）。传入时按当日
 * 去重锚判重——未创新高（回看后再前进到旧高度）整笔 no-op；不传=旧行为（无锚必计）。 */
export async function markRead(deps: RollerDeps, bookID: string, point?: number): Promise<void> {
    const date = deps.getTodayStr();
    const quota = deps.getQuota();
    let blockID = await deps.findDayBlock(date);
    if (!blockID) {
        // □5 同日双块防撞（08-31 实锤：五秒内同书双写两块）：并发 markRead/revisit 链
        // 刚建块、SQL 索引未入的窗口内 findDayBlock 恒 miss——直接建=双块（更新链只碰
        // 其中一块，另一块 data 冻结、loadAllDays 双行分账）。与 rollerCountRevisit 同款
        // 800ms 重查压缩竞态面（根除需内核事务级串行，插件不可及）
        await new Promise(r => setTimeout(r, 800));
        blockID = await deps.findDayBlock(date);
    }
    const data = blockID ? await deps.readDayBlockData(blockID) : { q: quota, b: {} };
    if (point != null && data.p && point <= (data.p[bookID] ?? -1)) return;
    const next = incrementDay(data, bookID, quota, point);
    const summary = formatDaySummary(next, { [bookID]: await deps.getBookName(bookID) });
    if (blockID) {
        await deps.updateDayBlock(blockID, date, next, summary);
    } else {
        await deps.createDayBlock(date, next, summary);
    }
}

/** 写作活动记账（火苗分家 w 分池）：markRead 同款建块/防撞链，写 w 不动 b/q——
 *  point=槽 point 当日去重锚（复用 p 池：写作书整体不走 markRead 写 p，无混池；
 *  review P1-1：无锚时反复点书卡同槽可刷「今日已写」——锚语义同阅读书，同日
 *  同槽只计一次；素材侧不传（锤幂等天然防重） */
export async function markWrite(deps: RollerDeps, bookID: string, point?: number): Promise<void> {
    const date = deps.getTodayStr();
    const quota = deps.getQuota();
    let blockID = await deps.findDayBlock(date);
    if (!blockID) {
        await new Promise(r => setTimeout(r, 800));
        blockID = await deps.findDayBlock(date);
    }
    const data = blockID ? await deps.readDayBlockData(blockID) : { q: quota, b: {} };
    if (point != null && data.p && point <= (data.p[bookID] ?? -1)) return;
    let next = incrementWriting(data, bookID);
    if (point != null) next = { ...next, p: { ...(next.p ?? {}), [bookID]: point } };
    const summary = formatDaySummary(next, { [bookID]: await deps.getBookName(bookID) });
    if (blockID) {
        await deps.updateDayBlock(blockID, date, next, summary);
    } else {
        await deps.createDayBlock(date, next, summary);
    }
}

export async function archiveBook(deps: RollerDeps, bookID: string): Promise<void> {
    await deps.setBookArchivedIal(bookID, deps.nowTimestamp());
}

// ============ 生产侧实现（真实 siyuan/storage，□3 接线） ============

import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import { dailyQuota } from "../../sy-tomato-plugin/src/libs/stores";
import { progStorage } from "./ProgressiveStorage";
import * as constants from "./constants";
import { loadBookStatuses } from "./bookStatus";
import { hasUnreadMaterial } from "./writeBook";

function todayStr(): string {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

function nowTimestampStr(): string {
    return todayStr().replaceAll("-", "") + String(Math.floor(Date.now() / 1000) % 100000).padStart(5, "0");
}

function parseDayLogData(raw: string): DayLogData {
    try {
        const d = JSON.parse(raw);
        if (typeof d?.q === "number" && d?.b && typeof d.b === "object") return d as DayLogData;
    } catch { }
    return { q: 3, b: {} };
}

function makeRollerDeps(): RollerDeps {
    return {
        loadOrder: () => progStorage.loadReadingOrder(),
        saveOrder: (ro) => progStorage.saveReadingOrder(ro),
        listBookIDs: async () => Object.keys(progStorage.booksInfos()),
        ignoredIDs: async () => {
            const infos = progStorage.booksInfos();
            return new Set(Object.entries(infos).filter(([, v]) => v.ignored).map(([k]) => k));
        },
        archivedIDs: async () => {
            const infos = progStorage.booksInfos();
            return new Set(Object.entries(infos).filter(([, v]) => v.archived).map(([k]) => k));
        },
        finishedIDs: async () => {
            const s = new Set<string>();
            for (const [id, info] of Object.entries(progStorage.booksInfos())) {
                if (info.ignored || info.archived) continue;
                // 火苗分家（bear 2026-09-15 拍板）：写作书整体退出阅读滚筒——素材/槽
                // 只从写作火苗出（openWritingFlameTarget 指定书路径，调度链共享但入口
                // 分家），阅读轮转池不再含写作书。旧语义「片全定稿+无未读素材才退役
                // （期A P1-1 素材饿死防线）」随之退役：写作侧供给改由写作火苗承担，
                // 阅读轮不再喂它（书卡 finished 显示走 fleetData 独立判定不受影响）
                if (info.writing) {
                    s.add(id);
                    continue;
                }
                // □2 手动书进轮转（fbfeat，鸟 09-15）：片=摘抄，finished=0 未锤摘抄
                // （判据与写作书素材同函数=语义统一）。today 无消费者给手动摘抄挂锤
                // → 有摘抄即持续在池，退役=用户归档/忽略（手动书「读完」=用户判断，
                // 无 point>=len 可依）；0 摘抄=finished（首读走点击引导开原书摘抄）
                if (info.manualMode) {
                    if (!(await hasUnreadMaterial(id))) s.add(id);
                    continue;
                }
                const idx = await progStorage.loadBookIndexIfNeeded(id);
                if (isFinished(info.point ?? 0, idx.length)) s.add(id);
            }
            return s;
        },
        invisibleIDs: async () => {
            const statuses = await loadBookStatuses();
            return new Set([...statuses].filter(([, s]) => s.status !== "ok").map(([id]) => id));
        },
        getTodayStr: todayStr,
        getQuota: () => Number(dailyQuota.get()) || 3,
        findDayBlock: async (date) => {
            const rows = await siyuan.sqlAttr(
                `select * from attributes where name="${constants.PLOG_DATE}" and value="${date}" limit 1`);
            return rows?.at(0)?.block_id ?? "";
        },
        readDayBlockData: async (blockID) => {
            const attrs = await siyuan.getBlockAttrs(blockID);
            return parseDayLogData(attrs?.[constants.PLOG_DATA] ?? "");
        },
        createDayBlock: async (date, data, summary) => {
            const docID = await progStorage.ensureReadLog();
            if (!docID) return "";
            // 内核 markdown 通道不解析 kramdown IAL（`{: id=}` 落字面文本，2026-09-04 e2e 实锤：
            // 预置 id 打空→setBlockAttrs 静默失败→date/data 永远缺失→findDayBlock 恒 miss 每次
            // 新建块）——真实块 id 改从 insert 响应 doOperations[0].id 取
            const r = await siyuan.insertBlockAsChildOf(summary, docID);
            const id = ((r as any[])?.[0])?.doOperations?.[0]?.id ?? "";
            if (!id) return "";
            await siyuan.setBlockAttrs(id, {
                [constants.PLOG_DATE]: date,
                [constants.PLOG_DATA]: JSON.stringify(data),
            } as any);
            return id;
        },
        updateDayBlock: async (blockID, date, data, summary) => {
            // 内容是投影可随时重写（markdown 通道不解析 IAL，只写纯 summary 勿带 {: id=}）；
            // IAL 双键全量重设（data 是真源，date 锚随更新补回）
            await siyuan.updateBlock(blockID, summary);
            await siyuan.setBlockAttrs(blockID, {
                [constants.PLOG_DATE]: date,
                [constants.PLOG_DATA]: JSON.stringify(data),
            } as any);
        },
        getBookName: async (bookID) => {
            const info = progStorage.booksInfos()[bookID];
            if (info?.bookName) return info.bookName;
            const row = await siyuan.sqlOne(`select content from blocks where type='d' and id='${bookID}'`);
            return row?.content ?? bookID;
        },
        loadAllDays: async () => {
            // 显式 limit 防内核 64 截尾：日志块 >64 天（约两个月重度使用）热力图/欠债即漏
            const rows = await siyuan.sql(`
                select a.value as data, b.value as date
                from attributes a
                join attributes b on a.block_id = b.block_id and b.name = '${constants.PLOG_DATE}'
                where a.name = '${constants.PLOG_DATA}' limit 10000000`) ?? [];
            return (rows as any[]).map(r => {
                const d = parseDayLogData(r.data);
                // write 逐日携带（火苗分家 P0：summarizeDebt 据此跳过纯写作日的阅读债）
                return { date: r.date, q: d.q, read: Object.values(d.b).reduce((s, n) => s + n, 0), write: Object.values(d.w ?? {}).reduce((s, n) => s + n, 0) };
            });
        },
        setBookArchivedIal: async (bookID, ts) => {
            await siyuan.setBlockAttrs(bookID, { [constants.BOOK_ARCHIVED_KEY]: ts } as any);
            const info = await progStorage.booksInfo(bookID);
            info.archived = ts;
            await progStorage.resetBookInfo(bookID, info);
        },
        nowTimestamp: nowTimestampStr,
    };
}

/** 便捷入口（UI 层接线用；deps 每次现取，避免模块加载序问题） */
export async function rollerNextBook(): Promise<string> {
    return (await nextBook(makeRollerDeps())) ?? "";
}

export async function rollerMarkRead(bookID: string, point?: number): Promise<void> {
    await markRead(makeRollerDeps(), bookID, point);
}

/** 写作活动记账便捷入口（写作分派消费；w 分池不进阅读 quota；point=槽锚防同日重复计） */
export async function rollerMarkWrite(bookID: string, point?: number): Promise<void> {
    await markWrite(makeRollerDeps(), bookID, point);
}

export async function rollerArchiveBook(bookID: string): Promise<void> {
    await archiveBook(makeRollerDeps(), bookID);
}

/** 火苗/热力图数据（□6 状态栏与 Dock 面板消费） */
export async function rollerDebtSummary(): Promise<DebtSummary> {
    return summarizeDebt(await makeRollerDeps().loadAllDays(), todayStr(), Number(dailyQuota.get()) || 3);
}

/** 全量每日 {date,q,read}（□6 热力图横条数据源） */
export async function rollerAllDays(): Promise<{ date: string; q: number; read: number }[]> {
    return makeRollerDeps().loadAllDays();
}

/** 今日逐书已读片数（□6 Dock 书卡「今日已读点」；无当日块=空对象） */
export async function rollerTodayReads(): Promise<{ [bookID: string]: number }> {
    const deps = makeRollerDeps();
    const blockID = await deps.findDayBlock(todayStr());
    if (!blockID) return {};
    return (await deps.readDayBlockData(blockID)).b;
}

// ============ 出片硬闸（progpush □1：每书每天出片上限=档位值） ============

/** 闸判定（纯）：当日该书读数已达档位 且 要出的片越过当日去重锚（=开新片）。
 *  重开当前片（point=锚）/回看旧片（point<锚）恒放行——拦截≠禁读，续读自由；
 *  「读一半关页签再点书卡回来」不受闸影响。口径与 readCurve gateOpen 同源（同
 *  b 计数、同 dailyQuota 档位值）：闸拦出片动作、gate 管目标新卡 due 今/明，并存 */
export function gateBlocked(todayRead: number, quota: number, nextPoint: number, dayAnchor: number): boolean {
    return todayRead >= quota && nextPoint > dayAnchor;
}

/** 闸数据（当日该书读数+去重锚）：markRead 同款直读链——findDayBlock 走 sqlAttr
 *  （PLOG_DATE 值恒定、按值查块 id，不吃写后立读窗）+ getBlockAttrs IAL 直读拿
 *  PLOG_DATA（勿走 SQL attributes 读回数据：写后立查缓存回旧值）。当日块刚建的
 *  防撞窗内 findDayBlock 可能 miss：markRead 同款 800ms 重查压缩；仍 miss=今日
 *  零读（闸偏松方向，markRead 锚互斥防双计）。返回 -1 锚=当日该书无前进记录 */
export async function rollerTodayGate(bookID: string): Promise<{ reads: number; anchor: number }> {
    const deps = makeRollerDeps();
    const date = todayStr();
    let blockID = await deps.findDayBlock(date);
    if (!blockID) {
        await new Promise(r => setTimeout(r, 800));
        blockID = await deps.findDayBlock(date);
        if (!blockID) return { reads: 0, anchor: -1 };
    }
    const data = await deps.readDayBlockData(blockID);
    return { reads: data.b[bookID] ?? 0, anchor: data.p?.[bookID] ?? -1 };
}

/** 今日逐书写作活动数（火苗分家：写作火苗「今日已写」/书卡写作书「今日点」数据源；
 *  无当日块/老块无 w=空对象） */
export async function rollerTodayWrites(): Promise<{ [bookID: string]: number }> {
    const deps = makeRollerDeps();
    const blockID = await deps.findDayBlock(todayStr());
    if (!blockID) return {};
    return (await deps.readDayBlockData(blockID)).w ?? {};
}

/** 今日全局重现计数（□2 额度分池闸门判定；无当日块/老块无 rc=0） */
export async function rollerTodayRevisits(): Promise<number> {
    const deps = makeRollerDeps();
    const blockID = await deps.findDayBlock(todayStr());
    if (!blockID) return 0;
    return (await deps.readDayBlockData(blockID)).rc ?? 0;
}

/** 重现计数 +n（□2：sweep 尾部合并一次写——逐卡写会与 markRead 的建块撞「写后
 *  立读」SQL 索引延迟窗口各建一块，rc/b 分裂两块闸门失效〔6808 实测〕；找不到当日
 *  块时 800ms 重查一次再兜底新建，压缩与 markRead 同轮建块的竞态面） */
export async function rollerCountRevisit(n = 1): Promise<void> {
    const deps = makeRollerDeps();
    const date = todayStr();
    let blockID = await deps.findDayBlock(date);
    if (!blockID) {
        await new Promise(r => setTimeout(r, 800));
        blockID = await deps.findDayBlock(date);
    }
    const data = blockID ? await deps.readDayBlockData(blockID) : { q: deps.getQuota(), b: {} };
    let next = data;
    for (let i = 0; i < n; i++) next = incrementRevisit(next);
    if (blockID) {
        await deps.updateDayBlock(blockID, date, next, formatDaySummary(next, {}));
    } else {
        await deps.createDayBlock(date, next, formatDaySummary(next, {}));
    }
}
