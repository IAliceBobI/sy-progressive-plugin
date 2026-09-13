// 阅读卡文案层（badgeSpec/dueRelOf/statusLineOf/nextSeeHint）——从 readCurveCore.ts 拆出：
// 这些函数引用 tomatoI18n，而 kernel bundle（kernel.ts→tools→reviewQueue→readCurveCore）
// 的摇树对「模块内容变更」不稳（□5 给 tomatoI18n.ts 加 39 个 getter 后整条 i18n 类链
// 946KB 连同 globals 的 Lute.New 顶层求值被打进 kernel.js，goja 无 Lute 全局直接崩——
// 09-13 □7 e2e 排障实锤；readCurveCore 保持零 i18n=kernel 图物理断链）。
// 前端消费面：readCardMenu/readCurve/readCurveCardUI/reviewPlan 族；vitest 同样可入
// （tomatoI18n=纯 TS 零 DOM）。
import { parseReadCard, GRADUATE_ROUNDS, growInterval, materialInterval } from "./readCurveCore";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";

/** 素材卡文案态（打磨批）：material=素材卡（宿主书的 writing 位——readCurveCardUI 走
 *  DOM custom 属性同步判、readCardMenu 走 inspectReadCard 的 kind）；matRemaining=该书
 *  未锤素材数（剩余量才是素材进度真值；未知=undefined 时 nextSeeHint 宁缺毋错返 null） */
export interface MaterialHint {
    material?: boolean;
    matRemaining?: number;
}

/** 复习卡徽标进度文案：daily=第 N/5 天 / grow=N/5（count+1=当前第几见）/ sched=每 N 天；
 *  count=4（第 5 见）=最后一见。素材卡（material）无五轮毕业语义——count 不封顶也不
 *  毕业（消耗驱动出池），「N/5·最后一见」恒误导，徽标回落素材身份标签。毕业/垃圾/空 →
 *  null（徽标不挂） */
export function badgeSpec(readcard: string, material = false): { text: string; lastSee: boolean } | null {
    const st = parseReadCard(readcard);
    if (!st || st.graduated) return null;
    if (st.mode === "sched") return { text: tomatoI18n.计划每N天(st.count), lastSee: false };
    if (material) return { text: tomatoI18n.素材, lastSee: false };
    const n = Math.min(st.count + 1, GRADUATE_ROUNDS);
    return {
        text: st.mode === "daily" ? tomatoI18n.阅读卡第N天(n, GRADUATE_ROUNDS) : tomatoI18n.阅读卡进度N(n, GRADUATE_ROUNDS),
        lastSee: st.count + 1 >= GRADUATE_ROUNDS,
    };
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** 到期距离尾巴：due≤now=已到期 / <24h=今天 / 否则 N 天后；null=无 due 无尾巴 */
function dueRelOf(dueMs: number | null, nowMs: number): string {
    if (dueMs == null) return "";
    const diff = dueMs - nowMs;
    const rel = diff <= 0 ? tomatoI18n.已到期 : diff < 86_400_000 ? tomatoI18n.计划今天 : tomatoI18n.计划N天后(Math.ceil(diff / 86_400_000));
    return " · " + rel;
}

/** 右键/面板只读状态行：✦ 曲线·第 N/5 次 / 每 N 天 / 分片·第 N/5 天 / 已毕业（推完 N 轮）·日期。
 *  □6 relaxedAt（书 autorelax 标记时刻）在场=活态三支尾部拼「30 天零摘抄，回访间隔已
 *  放宽」；缺省与旧输出逐字节一致（零感知）。垃圾值 → null（调用方落无键分支） */
export function statusLineOf(readcard: string, dueMs: number | null, nowMs: number, relaxedAt?: number, material = false): string | null {
    const st = parseReadCard(readcard);
    if (!st) return null;
    // □6 尾句（毕业态不挂——放宽只作用于活曲线）
    const relaxTail = relaxedAt != null ? ` · ${tomatoI18n.回访已自动放宽()}` : "";
    if (st.graduated) {
        const d = new Date(st.waterlineMs);
        const date = d.getFullYear() === new Date(nowMs).getFullYear()
            ? `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` : `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
        return `✦ ${tomatoI18n.已毕业推完N轮(st.count)} · ${date}`;
    }
    if (st.mode === "sched") return `✦ ${tomatoI18n.计划每N天(st.count)}${dueRelOf(dueMs, nowMs)}${relaxTail}`;
    if (st.mode === "daily") return `✦ ${tomatoI18n.阅读卡分片} · ${tomatoI18n.阅读卡第N天(Math.min(st.count + 1, GRADUATE_ROUNDS), GRADUATE_ROUNDS)}${dueRelOf(dueMs, nowMs)}${relaxTail}`;
    // □3：非中档尾标档位（中档无尾标=老卡状态行与一期逐字节一致）
    const freqTag = st.freq && st.freq !== "m" ? ` · ${tomatoI18n.回访频率()}·${tomatoI18n.回访频率档名(st.freq)}` : "";
    // 打磨批：素材卡无「第 N/5 次」骨架（count 不封顶不毕业）——回落素材身份+due 尾
    if (material) return `✦ ${tomatoI18n.素材}${dueRelOf(dueMs, nowMs)}${freqTag}${relaxTail}`;
    return `✦ ${tomatoI18n.阅读卡曲线} · ${tomatoI18n.阅读卡第N次(Math.min(st.count + 1, GRADUATE_ROUNDS), GRADUATE_ROUNDS)}${dueRelOf(dueMs, nowMs)}${freqTag}${relaxTail}`;
}

/** 点「下一张」评分即时反馈文案（同构官方 nextDues 预览）：grow=count 推进档 / sched=every；
 *  count=4=最后一见 → null（毕业 toast 接管）；daily 分片=完成翻篇即时续推 → null。
 *  素材卡（opts.material）间隔=materialInterval(剩余量) 非 grow ×2 表——剩余量未知/已锤 0
 *  返 null（宁缺毋错，剩 0=出池毕业 toast 接管） */
export function nextSeeHint(readcard: string, _nowMs: number, opts?: MaterialHint): string | null {
    const st = parseReadCard(readcard);
    if (!st || st.graduated) return null;
    if (st.mode === "sched") return tomatoI18n.天后再见(st.count);
    if (st.mode !== "grow") return null;
    if (opts?.material) {
        if (opts.matRemaining == null || opts.matRemaining <= 0) return null;
        return tomatoI18n.天后再见(materialInterval(opts.matRemaining, st.freq ?? "m"));
    }
    const next = st.count + 1;
    if (next >= GRADUATE_ROUNDS) return null;
    return tomatoI18n.天后再见(growInterval(next - 1, st.freq ?? "m"));
}
