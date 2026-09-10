// 阅读曲线接管·纯函数核（1530 期1；设计事实源=memory reading-curve-takeover-design §2.3/§2.4）。
// 本文件零 siyuan import（单测直入；生产侧在 readCurve.ts——helper 链拉 .svelte 进不了单测，
// vitest-svelte-import-chain 坑的分层对策）。
// 核心不变式：「每本在读书的下一片恒在列」——下一片 due=now（额度闸门开）/明天 00:00（关），
// 其余未评分卡 +99 天沉底，已评分卡即摘（阅读卡=待读提示卡，评完即摘，非记忆卡）。

/** 片文档 IAL 身份键：值=建卡时刻 YYYYMMDDHHmmss（兼作自家评分水位线） */
export const READCARD_KEY = "custom-prog-readcard";
/** 自家建卡尾链 review(2) 的 lastReview≈建卡时刻；真评分判据须留 5s 余量 */
export const RATING_GRACE_MS = 5_000;
/** 陈卡/忽略书推远天数（与忽略同通道；片删孤儿自然出局） */
export const FAR_DUE_DAYS = 99;

/** 宿主分类：piece=自动书分片（MarkKey 反解 point）/ slot=写作书槽片（同 MarkKey，书 writing 位区分）/ material=素材文档（PDIGEST_CTIME 锚） */
export type ReadCardKind = "piece" | "material" | "slot";

/** 巡查输入卡（身份键 SQL × riff 现状合并后的活卡；孤儿键在生产侧已滤） */
export interface CurvePlanCard {
    blockID: string;
    bookID: string;
    kind: ReadCardKind;
    /** piece/slot=片 MarkKey 反解；material=null */
    point: number | null;
    /** 身份键值=建卡时刻 YYYYMMDDHHmmss */
    readcard: string;
    /** riff lastReview 毫秒（0=无） */
    lastReviewMs: number;
    /** 归一后现 due（YYYYMMDDHHmm；null=New 态动态 due/未知） */
    due: string | null;
}

export interface SweepPlan {
    /** 需写 due（已 diff：现值≠目标才进；无 diff 零写零请求） */
    setDue: { id: string; due: string }[];
    /** 已评分卡块集（removeRiffCards 摘卡） */
    remove: string[];
    /** 已评分且需对账回写的卡（书型分支在下游） */
    reconcile: CurvePlanCard[];
}

/** Date → 本地 YYYYMMDDHHmmss（due 写入契约格式） */
export function dueStamp(d: Date): string {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** YYYYMMDDHHmmss → 本地毫秒（坏串返 NaN） */
export function parseStamp(s: string): number {
    if (!s || s.length !== 14 || !/^\d+$/.test(s)) return NaN;
    return new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), +s.slice(10, 12), +s.slice(12, 14)).getTime();
}

/** +n 天同时刻 */
export function plusDays(now: Date, n: number): string {
    const d = new Date(now);
    d.setDate(d.getDate() + n);
    return dueStamp(d);
}

/** 明天 00:00（本地；「每日首窗后超档位的下一片」目标位） */
export function tomorrowStart(now: Date): string {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(0, 0, 0, 0);
    return dueStamp(d);
}

/** due 归一（diff 比对用，分钟粒度——秒级精度差不误判漂移）：
 *  接受 riff RFC3339 与 YYYYMMDDHHmmss 双格式；空/坏串返 null */
export function normalizeDue(due: string | null | undefined): string | null {
    if (!due) return null;
    if (/^\d{14}$/.test(due)) return due.slice(0, 12);
    const t = Date.parse(due);
    if (Number.isNaN(t)) return null;
    const d = new Date(t);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}`;
}

/** 真评分判定（身份键水位线）：lastReview 晚于建卡时刻+5s 余量。
 *  自家建卡尾链 review(2) 的 lastReview≈建卡时刻，恒被排除；进程重启丢 reps 基线
 *  后本判据幂等兜底（已对账卡早被摘、卡在即未对账） */
export function isRated(readcard: string, lastReviewMs: number): boolean {
    const built = parseStamp(readcard);
    if (Number.isNaN(built) || !lastReviewMs) return false;
    return lastReviewMs > built + RATING_GRACE_MS;
}

/** 目标集三分（纯核心）：targets=各书下一片 blockID（onload 态可为空 Map=不建片只拉平陈卡）；
 *  gateOpen=DayLog b[bookID]<q（额度闸门——勿用 riff lastReview 计数：自家 review(2)
 *  恒虚高 1 且编辑器入口不产生 lastReview） */
export function planSweep(args: {
    cards: CurvePlanCard[];
    targets: Map<string, string>;
    gateOpen: Map<string, boolean>;
    now: Date;
}): SweepPlan {
    const plan: SweepPlan = { setDue: [], remove: [], reconcile: [] };
    const nowDue = normalizeDue(dueStamp(args.now))!;
    for (const c of args.cards) {
        if (isRated(c.readcard, c.lastReviewMs)) {
            plan.remove.push(c.blockID);
            plan.reconcile.push(c);
            continue;
        }
        const target = args.targets.get(c.bookID) === c.blockID ? c.blockID : null;
        if (target) {
            const open = args.gateOpen.get(c.bookID);
            const due = open ? dueStamp(args.now) : tomorrowStart(args.now);
            // 幂等零写（review P2-1）：闸门开时现 due 已 ≤ 本分钟（已到期，语义达成）
            // 不再回写前进中的分钟——否则 timer 每轮恒 diff 恒一写
            if (normalizeDue(due) !== c.due && !(open && c.due != null && c.due <= nowDue)) {
                plan.setDue.push({ id: c.blockID, due });
            }
        } else {
            const due = plusDays(args.now, FAR_DUE_DAYS);
            if (normalizeDue(due) !== c.due) plan.setDue.push({ id: c.blockID, due });
        }
    }
    return plan;
}

/** 对账序（review P0-1）：同书 piece 卡按 point 升序——rated 集 SQL 序不定，乱序对账
 *  时高片先 gotoBlock 推进书 point，低片被判「已越过」只摘不计=漏计+闸门连锁超额；
 *  升序恢复正序逐片各计一次。⚠ 不能用「同书升序/跨书返 0」的比较器——非传递
 *  （cmp(a,b)>0 而 cmp(a,c)=cmp(b,c)=0），V8 TimSort 结果未定义：分桶拼接，同书
 *  piece 占位集内升序重排，他书/slot/material 原位不动 */
export function sortForReconcile(cards: CurvePlanCard[]): CurvePlanCard[] {
    const out = cards.slice();
    const pieceIdxByBook = new Map<string, number[]>();
    for (let i = 0; i < out.length; i++) {
        const c = out[i];
        if (c.kind !== "piece" || c.point == null) continue;
        const arr = pieceIdxByBook.get(c.bookID) ?? [];
        arr.push(i);
        pieceIdxByBook.set(c.bookID, arr);
    }
    for (const idxs of pieceIdxByBook.values()) {
        if (idxs.length < 2) continue;
        const sorted = idxs.map(i => out[i]).sort((a, b) => (a.point ?? 0) - (b.point ?? 0));
        idxs.forEach((at, k) => { out[at] = sorted[k]; });
    }
    return out;
}

/** 自动书漏网回写判据：书 point 未越过片 p（bookPoint≤p）才回写四步；已越过（编辑器
 *  入口先推了）只摘卡——「前夜评分、巡查崩在对账前」的跨天兜底也靠它幂等出局 */
export function shouldReconcilePiece(piecePoint: number, bookPoint: number): boolean {
    return bookPoint <= piecePoint;
}
