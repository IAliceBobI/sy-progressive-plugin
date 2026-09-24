// need-0924-01 到期复访卡片流组装（纯函数供单测，dueScheduleSections 先例）：
// 双源到期行（think 块级 / pdigest 文档级）→ 单张卡视图模型。卡片流口径：
// 最早到期的排最前（逾期最久先清）；防御过滤 done/垃圾/未来行（正常数据源
// dueReviewSQLFor 已滤，此处兜底——喂错数据源时宁空勿毒）。
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import { parseReview, ReviewKey, PdigestReviewKey, DAY } from "./reviewQueue";
import type { DueRow } from "./reviewQueue";
import { dayStartOf } from "./readCurveCore";

/** 卡片流来源三态：digest=摘抄复访（文档级）/ curve=思考块曲线 / sched=思考块日程 */
export type DueCardKind = "digest" | "curve" | "sched";

export interface DueCard {
    /** pdigest=摘抄文档 id / think=块 id（applyReviewAction 与跳转共用） */
    id: string;
    rootId: string;
    src: "think" | "pdigest";
    /** applyReviewAction 第四参（think/pdigest 键分流） */
    key: string;
    /** 原始 IAL 值（动作 prevValue） */
    v: string;
    /** 卡面内容摘要（白空间归一+60 截断；Svelte 插值自动转义不做 HTML 转义） */
    label: string;
    /** 逾期天数=日历日差（0=今天到期；dayStartOf 锚防 DST 漂移，条带/段界同口径） */
    overdueDays: number;
    kind: DueCardKind;
    completeLabel: string;
    deferLabel: string;
}

function clip(s: string, n: number): string {
    const t = s.replace(/\s+/g, " ").trim();
    return t.length > n ? t.slice(0, n) + "…" : t;
}

export function dueCardsOf(rows: (DueRow & { src: "think" | "pdigest" })[], now: number): DueCard[] {
    // next=解析出的到期时间戳（排序键）：v 字典序只在单前缀（纯 q# 或纯 s#）段内=到期序，
    // 双源混排 q#<s# 字典序压过时间戳（本函数单测实锤）——卡片流「逾期最久先清」必须按数值排
    const cards: (DueCard & { next: number })[] = [];
    for (const r of rows) {
        const s = parseReview(r.v);
        // strict:false 下 isDue 返回值不做联合窄化（!d.ok 同坑）——显式判 mode 换窄化
        if (!s || s.mode === "done" || s.next > now) continue;
        const curve = s.mode === "curve";
        cards.push({
            next: s.next,
            id: r.id,
            rootId: r.root_id,
            src: r.src,
            key: r.src === "pdigest" ? PdigestReviewKey : ReviewKey,
            v: r.v,
            label: clip(r.content ?? r.id, 60),
            overdueDays: Math.round((dayStartOf(now) - dayStartOf(s.next)) / DAY),
            kind: r.src === "pdigest" ? "digest" : curve ? "curve" : "sched",
            // 文案分流与 reviewMenu.reviewRowItem 子菜单同源（pdigest 复访/曲线问题/日程轮次）
            completeLabel: r.src === "think" && curve ? tomatoI18n.问题已解决 : tomatoI18n.本轮已完成,
            deferLabel: r.src === "think" && curve ? tomatoI18n.还没懂稍后再看 : tomatoI18n.推迟到明天,
        });
    }
    cards.sort((a, b) => a.next - b.next);
    return cards.map(({ next: _n, ...c }) => c);
}
