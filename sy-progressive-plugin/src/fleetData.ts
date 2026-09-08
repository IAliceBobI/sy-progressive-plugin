// v5 □6 舰队总览数据聚合（视觉方案 docs/prog-v5-visual-design.md §3）：
// 书卡/热力图/三徽章的纯聚合逻辑在此（可单测），生产侧 loadFleetSummary 消费
// progStorage + roller 便捷函数 + attributes 表两次全量 SQL（✒✱✧ 不逐书查询）。
// 徽章归属链：✒=摘抄文档自身 PDIGEST_CTIME 行（值含 bookID）；✱✧=think 块的
// root_id（摘抄文档）经 ctime 映射反查书；札记匣等无书归属不进任何书卡。

import { ReviewKey, PdigestReviewKey, isDue, parseReview } from "./reviewQueue";
import { mergeMissingBooks, summarizeDebt, DebtSummary } from "./roller";
import { PDIGEST_CTIME } from "../../sy-tomato-plugin/src/libs/gconst";
import { parseBookIDFromCtime } from "./progData";
import { progStorage } from "./ProgressiveStorage";
import { loadBookStatuses } from "./bookStatus";
import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import { dailyQuota } from "../../sy-tomato-plugin/src/libs/stores";
import { fetchWritingPieces } from "./writeBook";

/** 三徽章：✒ 摘抄 / ✱ 心得 / ✧ 到期问题 */
export interface FleetBadges { digest: number; note: number; due: number; }

/** 单张书卡（点书卡=断点续读） */
export interface FleetBook {
    bookID: string;
    name: string;
    /** 书籍状态判定链（ok/closed/lost）：异常卡沉底灰化，点击由 startToLearn 拦截给对症提示 */
    status: "ok" | "closed" | "lost";
    /** 断点（已读到第几片，0 基） */
    point: number;
    /** 分片索引总数 */
    total: number;
    /** 今日该书已读片数 */
    todayRead: number;
    badges: FleetBadges;
    /** total>0 且 point>=total（读完待归档） */
    finished: boolean;
    /** 期3 手动分片书：索引恒空，片=摘抄（✒ 即片数），点卡=开原书 */
    manual: boolean;
    /** 期1 写作书：与 manualMode 分家（写作书进滚筒；徽标 ✍ 区分） */
    writing: boolean;
    /** 舰队管理 □2：置顶书（置顶组最优先，组内保滚筒序） */
    pinned: boolean;
}

/** 热力格（近 N 天横条，右端=今天） */
export interface HeatCell { date: string; level: 0 | 1 | 2 | 3 | 4; }

export interface FleetSummary {
    books: FleetBook[];
    debt: DebtSummary;
    heat: HeatCell[];
    quota: number;
    /** ✧ 全局到期待办数（think+pdigest 双源，含 free 源；Dock 待办胶囊） */
    dueTotal: number;
}

/** PDIGEST_CTIME 行是否结构合法（值 = bookID#ct，至少一个 # 分隔） */
function bookIDOfCtime(value: string): string {
    if (!value?.includes("#")) return "";
    return parseBookIDFromCtime(value);
}

/** ✒：PDIGEST_CTIME 行 → 按书计数 */
export function digestCountsFrom(rows: { value: string }[]): Map<string, number> {
    const m = new Map<string, number>();
    for (const r of rows) {
        const id = bookIDOfCtime(r.value);
        if (!id) continue;
        m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
}

/** 摘抄文档 → 书 映射（ctime 行 block_id=摘抄文档 ID） */
export function bookOfDocFrom(rows: { block_id: string; value: string }[]): Map<string, string> {
    const m = new Map<string, string>();
    for (const r of rows) {
        const id = bookIDOfCtime(r.value);
        if (id) m.set(r.block_id, id);
    }
    return m;
}

/** ✱✧：重访块（root_id=所在摘抄文档）归属到书；done→note，曲线/日程到期→due */
export function badgesFromReview(
    rows: { root_id: string; value: string }[],
    bookOfDoc: Map<string, string>,
    now: number,
): Map<string, { note: number; due: number }> {
    const m = new Map<string, { note: number; due: number }>();
    for (const r of rows) {
        const bookID = bookOfDoc.get(r.root_id);
        if (!bookID) continue; // 札记匣等无书归属
        const s = parseReview(r.value);
        if (!s) continue;
        const cur = m.get(bookID) ?? { note: 0, due: 0 };
        if (s.mode === "done") cur.note++;
        else if (isDue(s, now)) cur.due++;
        m.set(bookID, cur);
    }
    return m;
}

/** ✧ 双源合并（期2 复访通道）：think 块级 + pdigest 文档级到期数相加；note（心得）只来自 think */
export function combineBadges(
    a: Map<string, { note: number; due: number }>,
    b: Map<string, { note: number; due: number }>,
): Map<string, { note: number; due: number }> {
    const m = new Map(a);
    for (const [k, v] of b) {
        const cur = m.get(k) ?? { note: 0, due: 0 };
        m.set(k, { note: cur.note + v.note, due: cur.due + v.due });
    }
    return m;
}

/** 全局到期计数（期2 Dock ✧ 待办胶囊）：不问归属——free 源（札记匣等无书）也计入，
 *  与书卡 ✧ 徽章（按书过滤）互补，是 free 来源到期待办的唯一可视入口 */
export function dueCountOf(rows: { value: string }[], now: number): number {
    let n = 0;
    for (const r of rows) {
        const s = parseReview(r.value);
        if (s && isDue(s, now)) n++;
    }
    return n;
}

/** 热力五档：没读=0；比例 1/3、2/3 分档；读满=4；q 缺失有读（防御）=2 */
export function heatLevel(read: number, q: number): 0 | 1 | 2 | 3 | 4 {
    if (read <= 0) return 0;
    if (q <= 0) return 2;
    if (read >= q) return 4;
    if (read >= q * 2 / 3) return 3;
    if (read >= q / 3) return 2;
    return 1;
}

function shiftDate(date: string, days: number): string {
    const d = new Date(date + "T00:00:00");
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 近 N 天补零横条（右端=今天；窗口外与未来日期丢弃） */
export function buildHeat(days: { date: string; q: number; read: number }[], today: string, span: number): HeatCell[] {
    const byDate = new Map(days.map(d => [d.date, d]));
    const cells: HeatCell[] = [];
    for (let i = span - 1; i >= 0; i--) {
        const date = shiftDate(today, -i);
        const d = byDate.get(date);
        cells.push({ date, level: d ? heatLevel(d.read, d.q) : 0 });
    }
    return cells;
}

/** 书卡聚合：滚筒序输出，过滤忽略/归档/隐匿（□2 hidden 纯视觉：调度链不含 hidden）；
 *  order 外的书按 books.json 序兜底排尾。
 *  status 缺省全 ok（与管理页同 rank：⚠ lost 次之、⏸ closed 沉底）。
 *  期2 写作书：point/total 语义=定稿片数/片数（doneLens 注入；进度=定稿占比） */
export function buildFleetBooks(args: {
    infos: { [bookID: string]: { point?: number; ignored?: boolean; archived?: string | boolean; bookName?: string; manualMode?: boolean; writing?: boolean; pinned?: boolean; hidden?: boolean } };
    order: string[];
    todayReads: { [bookID: string]: number };
    indexLens: { [bookID: string]: number };
    names: { [bookID: string]: string };
    digestCounts: Map<string, number>;
    thinkBadges: Map<string, { note: number; due: number }>;
    statuses?: { [bookID: string]: "ok" | "closed" | "lost" };
    /** 写作书定稿片数（point 换源）；缺省按 0 计 */
    doneLens?: { [bookID: string]: number };
}): FleetBook[] {
    const merged = mergeMissingBooks({ order: args.order, lastServed: "" }, Object.keys(args.infos));
    const rank = (s: string) => (s === "ok" ? 0 : s === "lost" ? 1 : 2);
    const books: FleetBook[] = [];
    for (const bookID of merged.order) {
        const info = args.infos[bookID];
        if (!info || info.ignored || info.archived || info.hidden) continue;
        const total = args.indexLens[bookID] ?? 0;
        const point = info.writing ? (args.doneLens?.[bookID] ?? 0) : (info.point ?? 0);
        const think = args.thinkBadges.get(bookID);
        books.push({
            bookID,
            name: args.names[bookID] || info.bookName || bookID,
            status: args.statuses?.[bookID] ?? "ok",
            point,
            total,
            todayRead: args.todayReads[bookID] ?? 0,
            badges: {
                digest: args.digestCounts.get(bookID) ?? 0,
                note: think?.note ?? 0,
                due: think?.due ?? 0,
            },
            manual: !!info.manualMode,
            writing: !!info.writing,
            pinned: !!info.pinned,
            finished: total > 0 && point >= total,
        });
    }
    // □2 置顶组最优先（组内保滚筒序=不按 status 分层）；其余维持现状 rank（ok→lost→closed）。
    // JS sort 稳定：组内比较返回 0 即保输入（滚筒）序
    books.sort((a, b) => {
        if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
        if (a.pinned && b.pinned) return 0;
        return rank(a.status) - rank(b.status);
    });
    return books;
}

/** 书卡关键字过滤（舰队管理 □1 搜索框）：书名大小写不敏感包含匹配，
 *  纯视觉过滤不动滚筒序/沉底序；空/纯空白关键字原样返回 */
export function filterFleetBooks(books: FleetBook[], kw: string): FleetBook[] {
    const k = (kw ?? "").trim().toLowerCase();
    if (!k) return books;
    return books.filter(b => b.name.toLowerCase().includes(k));
}

// ============ 生产侧（真实 siyuan/storage） ============

import { rollerAllDays, rollerTodayReads } from "./roller";

function quotaNum(): number {
    return Number(dailyQuota.get()) || 3;
}

function todayLocalStr(): string {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

/**
 * 舰队总览全量数据（状态栏火苗与 Dock 面板共用）：
 * SQL 次数固定（书名兜底 + ✒ctime + think 全量 + 滚筒三查），不随书数增长。
 */
export async function loadFleetSummary(spanDays = 14): Promise<FleetSummary> {
    const infos = progStorage.booksInfos();
    const ids = Object.keys(infos);

    // attributes 反查显式 limit：内核对外层无 LIMIT 的 SELECT 套 Search.Limit（默认 64）
    // 静默截尾——✒ctime/✱think/✧review 三源 >64 篇即漏徽章（getDocRowsByName 同款防线）
    const [ctimeRows, thinkRows, pdigestRows, allDays, ro, todayReads] = await Promise.all([
        siyuan.sql(`select block_id, value from attributes where name='${PDIGEST_CTIME}' limit 10000000`) as Promise<any[]> ?? [],
        siyuan.sql(`select root_id, value from attributes where name='${ReviewKey}' limit 10000000`) as Promise<any[]> ?? [],
        siyuan.sql(`select root_id, value from attributes where name='${PdigestReviewKey}' limit 10000000`) as Promise<any[]> ?? [],
        rollerAllDays(),
        progStorage.loadReadingOrder(),
        rollerTodayReads(),
    ]);

    // 书名：bookName 缓存优先，缺失的一次 SQL 兜底（书被改名以 SQL 为准）
    const names: { [bookID: string]: string } = {};
    const missing = ids.filter(id => !infos[id]?.bookName);
    if (missing.length) {
        const rows = await siyuan.sql(
            `select id, content from blocks where type='d' and id in (${missing.map(id => `'${id}'`).join(",")}) limit 10000000`) as any[] ?? [];
        for (const r of rows) names[r.id] = r.content;
    }
    for (const id of ids) names[id] = names[id] || infos[id]?.bookName || id;

    const indexLens: { [bookID: string]: number } = {};
    const doneLens: { [bookID: string]: number } = {};
    for (const id of ids) {
        // 期2 写作书：total=片数（运行时 MarkKey 拉取）、doneLens=定稿数（进度换源）
        if (progStorage.booksInfos()[id]?.writing) {
            const pieces = await fetchWritingPieces(id);
            indexLens[id] = pieces.length;
            doneLens[id] = pieces.filter(p => p.done).length;
            continue;
        }
        indexLens[id] = (await progStorage.loadBookIndexIfNeeded(id)).length;
    }

    const now = Date.now();
    // 书籍状态判定链（30s 缓存，与 fleet 30s 刷新同量级）：异常卡沉底+Dock 灰化
    const statusesObj: { [bookID: string]: "ok" | "closed" | "lost" } = {};
    for (const [id, s] of await loadBookStatuses()) statusesObj[id] = s.status;
    const books = buildFleetBooks({
        infos,
        order: ro.order,
        todayReads,
        indexLens,
        doneLens,
        names,
        statuses: statusesObj,
        digestCounts: digestCountsFrom(ctimeRows ?? []),
        // 期2 ✧ 双源：think 块级 + pdigest 文档级（spec 定稿节 3——书卡到期数含复访）
        thinkBadges: combineBadges(
            badgesFromReview(thinkRows ?? [], bookOfDocFrom(ctimeRows ?? []), now),
            badgesFromReview(pdigestRows ?? [], bookOfDocFrom(ctimeRows ?? []), now),
        ),
    });

    const quota = quotaNum();
    return {
        books,
        debt: summarizeDebt(allDays, todayLocalStr(), quota),
        heat: buildHeat(allDays, todayLocalStr(), spanDays),
        quota,
        dueTotal: dueCountOf(thinkRows ?? [], now) + dueCountOf(pdigestRows ?? [], now),
    };
}
