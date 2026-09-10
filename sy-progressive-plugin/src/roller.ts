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
}

export interface DebtSummary {
    readToday: number;
    quotaToday: number;
    /** 累积欠债 = Σ max(0, 当日q − 当日已读)，无清零日、超额不抵扣 */
    debt: number;
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

export function summarizeDebt(
    days: { date: string; q: number; read: number }[],
    today: string,
    quotaToday: number,
): DebtSummary {
    let debt = 0;
    let readToday = 0;
    for (const d of days) {
        // 今天 q 以实时档位覆盖（改档位立即生效）；历史天按当日记录（不追溯）
        const q = d.date === today ? quotaToday : d.q;
        if (d.date === today) readToday = d.read;
        debt += Math.max(0, q - d.read);
    }
    // 绿=无欠债；红=欠债≥2×今日档位（连续两天颗粒未收即双倍欠债）；中间为黄
    const state = debt === 0 ? "ok" : debt >= 2 * quotaToday ? "over" : "warn";
    return { readToday, quotaToday, debt, state };
}

export function formatDaySummary(data: DayLogData, bookNames: { [bookID: string]: string }): string {
    const total = Object.values(data.b).reduce((s, n) => s + n, 0);
    const parts = Object.entries(data.b).map(([id, n]) => `${bookNames[id] || id}×${n}`);
    return `档位 ${data.q} · 已读 ${total}${parts.length ? " —— " + parts.join("、") : ""}`;
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
    const blockID = await deps.findDayBlock(date);
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

export async function archiveBook(deps: RollerDeps, bookID: string): Promise<void> {
    await deps.setBookArchivedIal(bookID, deps.nowTimestamp());
}

// ============ 生产侧实现（真实 siyuan/storage，□3 接线） ============

import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import { dailyQuota } from "../../sy-tomato-plugin/src/libs/stores";
import { progStorage } from "./ProgressiveStorage";
import * as constants from "./constants";
import { loadBookStatuses } from "./bookStatus";
import { fetchWritingPieces, isWritingFinished, hasUnreadMaterial } from "./writeBook";

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
                // 期2 写作书：索引恒空，isFinished(point>=0) 恒 true=误伤（写作书被滚筒
                // 静默排除）；finished 语义=片列表全定稿（0 槽书不算完，提示建槽）。
                // 期A 补判（review P1-1）：片全定稿但素材池有未读 → 不退役——
                // 「定稿完继续往里摘」是素材并行的常见稳态，退役会让素材饿死
                if (info.writing) {
                    if (isWritingFinished(await fetchWritingPieces(id)) && !(await hasUnreadMaterial(id))) s.add(id);
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
                return { date: r.date, q: d.q, read: Object.values(d.b).reduce((s, n) => s + n, 0) };
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
