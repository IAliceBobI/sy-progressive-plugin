// 通用重访调度（v5 □4 拍板问题/心得统一标记，□12 推广为正交调度维度）：
// 一个块 IAL 状态机，不进官方 riff。设计依据 docs/research/prog-v5-review-queue/——
// 背诵走 riff（FSRS，唯一），重访走本队列两模式：
// - 曲线 q：间隔温和拉长（3 天起步、每次 ×2、60 天封顶——SuperMemo 式「等知识储备」，
//   读不懂推迟而不是缩短硬刷）；问题解决即出队转心得态，心得零调度。
// - 日程 s：每 N 天固定重访（N 可改可移除；「执行完默认 3 天后再出来」即此模式），
//   完成一轮 +N 进下轮（周期性），推迟顺延 1 天。
// IAL 名沿用 custom-prog-think（旧 q 态值零迁移直接兼容）。
// 值格式：`q#<下次重访毫秒时间戳>#<已重访次数>` | `s#<下次重访毫秒时间戳>#<每N天>` | `done`
export const ReviewKey = "custom-prog-think";

const DAY = 24 * 3600 * 1000;
const BASE_DAYS = 3;
const MAX_DAYS = 60;

/** 「执行完默认 3 天后再出来」——日程模式默认档（菜单里可改可移除） */
export const DEFAULT_SCHED_DAYS = 3;
/** 日程档位菜单（重访调度…/右键子菜单共用） */
export const SCHED_PRESETS = [1, 3, 7, 14, 30];

export type ReviewState =
    | { mode: "curve"; next: number; count: number }
    | { mode: "sched"; next: number; every: number }
    | { mode: "done" };

export function parseReview(value?: string): ReviewState | null {
    if (value === "done") return { mode: "done" };
    if (!value) return null;
    let m = value.match(/^q#(\d{13})#(\d+)$/);
    if (m) return { mode: "curve", next: Number(m[1]), count: Number(m[2]) };
    m = value.match(/^s#(\d{13})#([1-9]\d*)$/); // every=0 非法（0 天循环无意义）
    if (m) return { mode: "sched", next: Number(m[1]), every: Number(m[2]) };
    return null;
}

export function nextIntervalDays(count: number): number {
    return Math.min(BASE_DAYS * 2 ** count, MAX_DAYS);
}

/** 曲线初始（问题摘抄入口，思考去向默认调度） */
export function markQuestion(now: number): string {
    return `q#${now + nextIntervalDays(0) * DAY}#0`;
}

/** 日程初始（每 N 天；N=1..∞，菜单档位见 SCHED_PRESETS） */
export function markSched(now: number, days: number): string {
    return `s#${now + days * DAY}#${days}`;
}

/** 推迟：曲线 ×2 拉长（还没懂）、日程顺延 1 天（明天再来）、done 不动 */
export function deferReview(prev: string | ReviewState, now: number): string {
    const s = typeof prev === "string" ? parseReview(prev) : prev;
    if (!s || s.mode === "done") return "done";
    if (s.mode === "sched") return `s#${now + DAY}#${s.every}`;
    return `q#${now + nextIntervalDays(s.count + 1) * DAY}#${s.count + 1}`;
}

/** 完成：曲线（问题）已解决转心得 done、日程完成一轮 +every 进下轮（周期性） */
export function completeReview(prev: string | ReviewState, now: number): string {
    const s = typeof prev === "string" ? parseReview(prev) : prev;
    if (!s || s.mode === "done") return "done";
    if (s.mode === "sched") return `s#${now + s.every * DAY}#${s.every}`;
    return "done";
}

/** 推迟后的重访天数（toast 展示用）：曲线按其 count、日程按其 every、非调度态按初始档 */
export function revisitDaysOf(value: string): number {
    const s = parseReview(value);
    if (!s || s.mode === "done") return BASE_DAYS;
    return s.mode === "sched" ? s.every : nextIntervalDays(s.count);
}

export function isDue(s: ReviewState, now: number): boolean {
    return s.mode !== "done" && s.next <= now;
}

/** 全局到期重访块查询（到期待办列表用，带块内容摘要）：q#/s# 后 13 位等长时间戳，各前缀段内字符串字典序即数值序 */
export function dueReviewSQL(now: number): string {
    return `select a.block_id as id, a.root_id as root_id, a.value as v, b.content as content `
        + `from attributes as a left join blocks as b on b.id = a.block_id `
        + `where a.name="${ReviewKey}" and (`
        + `(a.value like "q#%" and a.value < "q#${now}") or `
        + `(a.value like "s#%" and a.value < "s#${now}")) order by a.value`;
}
