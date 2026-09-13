// 可见性期3 □3（handoff 拍板：书分组列表 + 独立 Dialog + 入口常驻）：
// 复习计划面板数据组装纯函数——双源调度行按书归组、到期书置顶、未归书（札记匣）收尾、
// 行文案（模式/到期日/距离）与四态图标映射。无 DOM/SiYuan 依赖（digestList 同款约定），
// 数据采集在 ReviewPlanDialog.svelte 消费层。
import { DueRow, parseReview, isDue, DAY } from "./reviewQueue";
import { REVISIT_DAILY_LIMIT, dayStartOf } from "./readCurveCore";
import { digestStateIcon } from "./digestState";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";

/** 计划面板一行=一条有调度的摘抄（think 块级 / pdigest 文档级） */
export interface PlanRow extends DueRow {
    src: "think" | "pdigest";
    /** 行首四态图标（think=思考问号 / pdigest=复访时钟） */
    icon: string;
    /** 模式短标（曲线 · 已 N 次 / 每 N 天；垃圾值空串） */
    mode: string;
    /** 下次到期日（同年 MM-DD，跨年 YYYY-MM-DD） */
    date: string;
    /** 距离（今天 / N 天后 / 逾期 N 天） */
    rel: string;
    /** 是否已到期（行内直放完成/推迟钮的判据） */
    due: boolean;
}

/** 计划面板一组=一本书（或未归书组） */
export interface PlanGroup {
    /** 书 ID；空串=未归书组（札记匣摘抄等） */
    bookID: string;
    bookName: string;
    rows: PlanRow[];
    dueCount: number;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 到期日与距离文案：同年 MM-DD、跨年带年。rel 距离=**日历日差**（与条带 stripDayIdx
 *  同 dayStartOf 锚——滚动 24h 的「今天」会把明晨到期显成今天、与条带分桶打架，review
 *  P1-1 统一）：0=今天（已过时刻=逾期 1 天）、n>0=N 天后、n<0=逾期 |n| 天 */
export function planDueLabel(next: number, now: number): { date: string; rel: string } {
    const d = new Date(next);
    const sameYear = d.getFullYear() === new Date(now).getFullYear();
    const date = sameYear ? `${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const days = Math.round((dayStartOf(next) - dayStartOf(now)) / DAY);
    const rel = days > 0 ? tomatoI18n.计划N天后(days)
        : days === 0 && next > now ? tomatoI18n.计划今天
        : tomatoI18n.计划逾期N(Math.max(1, -days));
    return { date, rel };
}

/** 模式短标：曲线带已完成次数 / 日程每 N 天；done/垃圾值空串（防御） */
export function planModeLabel(v: string): string {
    const s = parseReview(v);
    if (!s || s.mode === "done") return "";
    return s.mode === "sched" ? tomatoI18n.计划每N天(s.every) : tomatoI18n.计划曲线N次(s.count);
}

/**
 * 双源调度行 → 书分组。组序=到期书置顶（dueCount>0 优先）、同级按书名、未归书恒收尾；
 * 组内保持传入序（mergeDueRows 已按 v 字典序=到期序）。
 * @param rows mergeDueRows 产出（带 src）
 * @param bookOfDoc 摘抄文档 id → 书 ID（bookOfDocFrom；无映射=未归书）
 * @param bookNames 书 ID → 书名（缺省用 ID 兜底）
 */
export function reviewPlanGroups(
    rows: (DueRow & { src: "think" | "pdigest" })[],
    bookOfDoc: Map<string, string>,
    bookNames: Map<string, string>,
    now: number,
): PlanGroup[] {
    const groups = new Map<string, PlanGroup>();
    for (const r of rows) {
        const bookID = bookOfDoc.get(r.root_id) ?? "";
        let g = groups.get(bookID);
        if (!g) {
            g = { bookID, bookName: bookID ? (bookNames.get(bookID) ?? bookID) : tomatoI18n.未归书, rows: [], dueCount: 0 };
            groups.set(bookID, g);
        }
        const s = parseReview(r.v);
        const { date, rel } = planDueLabel(s && s.mode !== "done" ? s.next : now, now);
        g.rows.push({
            ...r,
            icon: digestStateIcon(r.src === "think" ? "think" : "review"),
            mode: planModeLabel(r.v),
            date,
            rel,
            due: !!s && s.mode !== "done" && isDue(s, now),
        });
        if (g.rows[g.rows.length - 1].due) g.dueCount++;
    }
    const list = [...groups.values()];
    // 到期书置顶；同级按书名（未归书组 bookID="" 恒最后）
    return list.sort((a, b) => {
        if (a.bookID === "") return 1;
        if (b.bookID === "") return -1;
        if ((a.dueCount > 0) !== (b.dueCount > 0)) return a.dueCount > 0 ? -1 : 1;
        return a.bookName.localeCompare(b.bookName);
    });
}

// ============ □5 今日清单日历投影：未来 7 天条带（纯函数层） ============

/** 单卡预估分钟（期首从简=固定均值；条带「约 N 分钟」口径，勿扩散多处） */
export const STRIP_MIN_PER_CARD = 2;

/** 行落格：dueAt 落未来 7 天哪一格（0=今天格含逾期；null=无调度/NaN/第 7 天外）。
 *  双源共用：sched 行 parseReview(v).next / 阅读卡行 dueMs——过滤与条带同口径，
 *  保证「条带数字与列表一致」（点击过滤=同函数重放，非另一套判定）。
 *  双日界差+round（review P2-1）：DST 时区每天 23/25h，floor(Δms/DAY) 会错格；
 *  两侧都取本地午夜后差恒为 24k±1h，round 精确切格 */
export function stripDayIdx(dueAt: number | null | undefined, now: number): number | null {
    if (dueAt == null || !Number.isFinite(dueAt)) return null;
    const diff = Math.round((dayStartOf(dueAt) - dayStartOf(now)) / DAY);
    if (diff < 0) return 0;
    return diff > 6 ? null : diff;
}

/** 超载三档（Weave IRPlannedDay 行为级，轻量勿过度设计）：锚 REVISIT_DAILY_LIMIT=5
 *  （全局重现每日限额既有语义）——≤5 正常 / 6~10 轻 / >10 重 / 0 空。
 *  ⚠期5 该限额接设置档（1/3/5/10）时此档阈值会随设置漂移——届时回看：换固定常数或
 *  文档写明「随每日限额联动」（review P2-5 记档） */
export function overloadOf(count: number): 0 | 1 | 2 | 3 {
    if (count <= 0) return 0;
    if (count <= REVISIT_DAILY_LIMIT) return 1;
    if (count <= REVISIT_DAILY_LIMIT * 2) return 2;
    return 3;
}

/** 条带一格 */
export interface StripCell {
    /** 当日 00:00 毫秒（第 i 格=今天+i 天） */
    dayStart: number;
    /** 今天 / 明天 / 周X（i≥2） */
    label: string;
    /** MM-DD 副行 */
    sub: string;
    count: number;
    minutes: number;
    /** 0 空 / 1 正常 / 2 轻 / 3 重（标色依据） */
    overload: 0 | 1 | 2 | 3;
}

/** 到期时间戳集合 → 7 格条带（null/undefined 不计=阅读卡无调度行/毕业档案）。
 *  第一格=逾期+今天合计（「今日清单」口径：今天要清的含欠账） */
export function weekStrip(dueAt: (number | null | undefined)[], now: number): StripCell[] {
    const start = dayStartOf(now);
    const cells: StripCell[] = [];
    const d0 = new Date(start);
    for (let i = 0; i < 7; i++) {
        const d = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + i);
        const wd = d.getDay();
        cells.push({
            dayStart: d.getTime(),
            label: i === 0 ? tomatoI18n.计划今天 : i === 1 ? tomatoI18n.条带明天 : tomatoI18n.周N(wd === 0 ? 7 : wd),
            sub: `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
            count: 0, minutes: 0, overload: 0,
        });
    }
    for (const t of dueAt) {
        const idx = stripDayIdx(t, now);
        if (idx != null) cells[idx].count++;
    }
    for (const c of cells) {
        c.minutes = c.count * STRIP_MIN_PER_CARD;
        c.overload = overloadOf(c.count);
    }
    return cells;
}
