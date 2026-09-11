// floatbar-badges □1 类型胶囊纯函数层：标题区类型胶囊与两清单小标共用六态判定 +
// 到期信息 + 日期格式化。零 DOM/SiYuan 依赖（digestState 同款纯函数约定），数据采集在
// digestMarker.ts 消费层（queryDigestBadges）。
// 与 digestStateOf 四态的关系：digestStateOf 服务 ✧ 菜单/痕迹图标（think done 视同无键），
// 本模块服务胶囊展示——多两态：insight（think 全 done=心得灰显，think 家族的 done 终态）
// 与 forRecite（仿写副本身份，独立于四态优先级链之外有键即仿写——练习副本的入卡/复访
// 是建卡链副产物，身份优先）。调度有效性口径对齐 reviewQueue.parseReview：q#/s#=有调度。
import { parseReview } from "./reviewQueue";

/** 胶囊六态（前四态 digestStateOf 同名同义，insight/forRecite 为胶囊扩展） */
export type DigestBadgeKind = "forRecite" | "review" | "think" | "insight" | "recite" | "archive";

export interface DigestBadgeInput {
    /** 文档 IAL custom-pdigest-review 原始值 */
    pdigestReview: string;
    /** 文档内首个活跃（非空非 done）思考块的 custom-prog-think 值 */
    thinkReview: string;
    /** 文档内存在 done 思考块（采集层保证：thinkReview 活跃时此值不参与判定） */
    thinkDone: boolean;
    /** 该摘抄文档已入书 digest 夹卡组 */
    cardInSet: boolean;
    /** 仿写副本机读标记 custom-prog-for-recite */
    forRecite: boolean;
}

export interface DigestBadge {
    kind: DigestBadgeKind;
    /** review/think：next <= now（到期含逾期） */
    due: boolean;
    /** review 专属「今天」标（due 且 next 落在今天内）；逾期整日 dueToday=false 显示日期红 */
    dueToday: boolean;
    /** 下次重访毫秒（review/think；其余态为 0） */
    next: number;
}

/** 本地日历日 0 点（dueToday 的「今天」边界；走 Date 年月日构造，跨 DST 日不受 24h 差影响） */
export function dayStart(ms: number): number {
    const d = new Date(ms);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** 绝对短日期 M-D 不补零（胶囊「✧ 复访 · 9-14」；年份窗口最长 60 天封顶不带年） */
export function fmtDueDate(ms: number): string {
    const d = new Date(ms);
    return `${d.getMonth() + 1}-${d.getDate()}`;
}

/** 六态判定。优先级：forRecite（身份）> review > think > insight > recite > archive。 */
export function digestBadgeOf(input: DigestBadgeInput, now: number): DigestBadge {
    if (input.forRecite) return { kind: "forRecite", due: false, dueToday: false, next: 0 };
    const pd = parseReview(input.pdigestReview);
    if (pd && pd.mode !== "done") {
        return { kind: "review", due: pd.next <= now, dueToday: pd.next >= dayStart(now) && pd.next <= now, next: pd.next };
    }
    const th = parseReview(input.thinkReview);
    if (th && th.mode !== "done") {
        return { kind: "think", due: th.next <= now, dueToday: th.next >= dayStart(now) && th.next <= now, next: th.next };
    }
    if (input.thinkDone) return { kind: "insight", due: false, dueToday: false, next: 0 };
    if (input.cardInSet) return { kind: "recite", due: false, dueToday: false, next: 0 };
    return { kind: "archive", due: false, dueToday: false, next: 0 };
}
