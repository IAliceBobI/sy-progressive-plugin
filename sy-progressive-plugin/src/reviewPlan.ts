// 可见性期3 □3（handoff 拍板：书分组列表 + 独立 Dialog + 入口常驻）：
// 复习计划面板数据组装纯函数——双源调度行按书归组、到期书置顶、未归书（札记匣）收尾、
// 行文案（模式/到期日/距离）与四态图标映射。无 DOM/SiYuan 依赖（digestList 同款约定），
// 数据采集在 ReviewPlanDialog.svelte 消费层。
import { DueRow, parseReview, isDue, DAY } from "./reviewQueue";
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

/** 到期日与距离文案：同年 MM-DD、跨年带年；diff≤0 逾期（至少 1 天）、<24h 今天、否则 N 天后 */
export function planDueLabel(next: number, now: number): { date: string; rel: string } {
    const d = new Date(next);
    const sameYear = d.getFullYear() === new Date(now).getFullYear();
    const date = sameYear ? `${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const diff = next - now;
    const rel = diff <= 0 ? tomatoI18n.计划逾期N(Math.max(1, Math.ceil(-diff / DAY)))
        : diff < DAY ? tomatoI18n.计划今天
        : tomatoI18n.计划N天后(Math.ceil(diff / DAY));
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
