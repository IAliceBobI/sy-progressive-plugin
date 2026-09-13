// 阅读曲线接管·纯函数核（1530 期1；设计事实源=memory reading-curve-takeover-design §2.3/§2.4）。
// 本文件零 siyuan import（单测直入；生产侧在 readCurve.ts——helper 链拉 .svelte 进不了单测，
// vitest-svelte-import-chain 坑的分层对策）。本文件恒零 i18n：文案函数
// （badgeSpec/statusLineOf/nextSeeHint 等）在 readCurveText.ts——kernel bundle 摇树对
// tomatoI18n 模块内容变更不稳，readCurveCore 一引即可能整条 i18n 类链+Lute.New 顶层
// 进 kernel.js 在 goja 崩（09-13 □7 实锤）。
// 核心不变式：「每本在读书的下一片恒在列」——下一片 due=now（额度闸门开）/明天 00:00（关），
// 其余未评分卡 +99 天沉底，已评分卡即摘（阅读卡=待读提示卡，评完即摘，非记忆卡）。

/** 片文档 IAL 身份键。值两代：
 *  一期=建卡时刻 YYYYMMDDHHmmss（14 位纯数字，兼容读作 daily/count=0）；
 *  二期（统一流转模型）=三档曲线复合值 d#<ms>#<count>（每日重现·分片未完成）/
 *  x#<ms>#<count>（×2 递增 3→6→12→24→48 天）/ e#<ms>#<every>（每 N 天）/
 *  g#<ms>#<rounds>（毕业终态）。<ms>=水位线（最后一次自家操作时刻，isRated 基线） */
export const READCARD_KEY = "custom-prog-readcard";
/** 自家建卡尾链 review(2) 的 lastReview≈建卡时刻；真评分判据须留 5s 余量 */
export const RATING_GRACE_MS = 5_000;
/** 陈卡/忽略书推远天数（与忽略同通道；片删孤儿自然出局） */
export const FAR_DUE_DAYS = 99;

/** 宿主分类：piece=自动书分片（MarkKey 反解 point）/ slot=写作书槽片（同 MarkKey，书 writing 位区分）/ material=素材文档（写作书池，PDIGEST_CTIME 锚，首推=锤）/ digest=摘抄文档（阅读书，PDIGEST_CTIME 锚，□2 建卡即 ×2 曲线）/ rpcard=tomato 阅读点卡块（□3 接管，custom 围栏锚识别）/ plain=用户文档卡（□3 opt-in 收编，type='d'）——后两者无书归属（全局对象） */
export type ReadCardKind = "piece" | "material" | "slot" | "digest" | "rpcard" | "plain";

// ============ rpcard 识别（□3：tomato 阅读点卡块，跨插件纪律=围栏字面量禁 import） ============

/** tomato 阅读点卡块围栏头（=tomato gconst RPCARD_FENCE；禁 import tomato 模块，字面量同源维护） */
export const RPCARD_FENCE = ";;;sy-tomato-plugin/reading-point";

/** 块 markdown 文本是否 tomato 阅读点卡块：首行围栏头锚 + 次行 JSON 带 origin 字段
 *  （防他插件 custom 块 JSON 碰巧带 origin；与 tomato findLiveRPCards 同判据面的只读实现） */
export function isRPCardMarkdown(md: string): boolean {
    if (!md) return false;
    const lines = md.split("\n");
    if (lines[0]?.trim() !== RPCARD_FENCE) return false;
    for (let i = 1; i < lines.length; i++) {
        const t = lines[i].trim();
        if (!t || t === ";;;") continue;
        try {
            const data = JSON.parse(t);
            return typeof data?.origin === "string" && data.origin.length > 0;
        } catch {
            return false;
        }
    }
    return false;
}

// ============ 统一流转模型·三档曲线状态（1141 期1） ============

/** 曲线模式：daily=每日重现（分片未完成，连续 5 天上限毕业→下一片）；grow=×2 递增
 *  （3→6→12→24→48 天，5 次毕业，素材/摘抄/阅读点/文档卡默认）；sched=每 N 天（用户
 *  自选，永不毕业）。参数语义对齐 reviewQueue curve/sched 双模式 */
export type CurveMode = "daily" | "grow" | "sched";

/** 身份键值解析态（parseReadCard 产物；g 毕业终态 mode 恒读作 grow——语义已终结） */
export interface ReadCardState {
    mode: CurveMode;
    /** 水位线毫秒：最后一次自家操作时刻（建卡/推进/消耗），isRated 判据基线 */
    waterlineMs: number;
    /** daily/grow=轮次计数（0..5）；sched=every 天数；毕业态=毕业时轮数 */
    count: number;
    /** 毕业终态（g 前缀；riff 卡已摘，键值仅供期4 面板毕业分组/右键状态行读） */
    graduated: boolean;
    /** 回访频率档位（□3）：仅 grow/毕业态有效（sched 用户直控每 N 天、daily 分片不走
     *  曲线）；解析侧缺省/中档=字段不存在（旧值与一期逐字段零漂移），写入侧可传 "m"
     *  =formatReadCard 落无尾段 */
    freq?: VisitFreq;
}

const MODE_TAG: Record<CurveMode, string> = { daily: "d", grow: "x", sched: "e" };

/** 身份键值 → 状态（旧 14 位一期值兼容读作 daily/count=0；垃圾值/撞形值返 null。
 *  □3：x#/g# 可带第四段频率尾段 #l/#h（缺省=中档）；d#/e# 不带——带尾段判垃圾） */
export function parseReadCard(value: string): ReadCardState | null {
    if (!value) return null;
    if (/^\d{14}$/.test(value)) {
        const ms = parseStamp(value);
        return Number.isNaN(ms) ? null : { mode: "daily", waterlineMs: ms, count: 0, graduated: false };
    }
    const freqOf = (t: string | undefined) => (t === "l" || t === "h" ? t : undefined);
    let m = value.match(/^g#(\d{13})#(\d+)(?:#([lmh]))?$/);
    if (m) return { mode: "grow", waterlineMs: +m[1], count: +m[2], graduated: true, freq: freqOf(m[3]) };
    m = value.match(/^x#(\d{13})#(\d+)(?:#([lmh]))?$/);
    if (m) return { mode: "grow", waterlineMs: +m[1], count: +m[2], graduated: false, freq: freqOf(m[3]) };
    m = value.match(/^([de])#(\d{13})#(\d+)$/);
    if (!m) return null;
    const mode: CurveMode = m[1] === "d" ? "daily" : "sched";
    return { mode, waterlineMs: +m[2], count: +m[3], graduated: false };
}

/** 状态 → 身份键值（毕业态落 g；与 parseReadCard 互逆。□3：频率尾段只落 grow/毕业态
 *  且仅非中档——中档省略=旧格式字节不变，默认零感知） */
export function formatReadCard(s: ReadCardState): string {
    const tag = s.graduated ? "g" : MODE_TAG[s.mode];
    const f = s.freq === "l" || s.freq === "h" ? s.freq : "";
    const tail = (s.graduated || s.mode === "grow") && f ? `#${f}` : "";
    return `${tag}#${s.waterlineMs}#${s.count}${tail}`;
}

/** ×2 递增档（天；与 reviewQueue BASE_DAYS ×2 同源，3 起步）。count=已消耗轮次，
 *  共 5 见（徽标 N/5=count+1，5/5 最后一见），见间等待=GROW_INTERVALS[新count-1]；
 *  表尾 48 档为序列完整形状，毕业断在第 5 见消耗 */
export const GROW_INTERVALS = [3, 6, 12, 24, 48];
/** 毕业轮数上限（daily=连续未完成天数上限，grow=消耗轮次上限，同值 5） */
export const GRADUATE_ROUNDS = 5;

/** 素材进度感知间隔参数（□4 kja140 行为级）：base=剩 1 个素材的间隔天数；slope=剩余量
 *  每减半收多少天；min/max=clamp。数值表=剩 64→4 天 … 剩 1→16 天（剩得多回访密、快锤完
 *  稀疏），期首可调，勿扩散多处 */
export const MAT_BASE_DAYS = 16;
export const MAT_SLOPE_DAYS = 2;
export const MAT_MIN_DAYS = 3;
/** 素材间隔（□4）：天数=f(该书未锤素材数) 纯函数（非 kja140 乘子形态——间隔不依赖
 *  prev interval，同剩余量同间隔=「两次回访未消耗→间隔冻结」零进度守卫天然成立）；
 *  回访频率档乘子同乘（与 □3 grow 档一致口径） */
export function materialInterval(remaining: number, freq: VisitFreq = "m"): number {
    const r = Math.max(1, Math.floor(remaining));
    const raw = MAT_BASE_DAYS - MAT_SLOPE_DAYS * Math.log2(r);
    return Math.max(1, Math.round(Math.min(MAT_BASE_DAYS, Math.max(MAT_MIN_DAYS, raw)) * FREQ_MULT[freq]));
}

/** 回访频率档位（□3）：低=回访更少（间隔 ×1.5）/中=默认 ×2 曲线原样（缺省零感知）/
 *  高=回访更多（间隔 ×0.7）。只乘间隔不动 ×2 骨架与五轮毕业 */
export type VisitFreq = "l" | "m" | "h";
export const FREQ_MULT: Record<VisitFreq, number> = { l: 1.5, m: 1, h: 0.7 };
/** 第 i 档见间等待天数（乘频率系数取整；中档=骨架原值） */
export function growInterval(i: number, freq: VisitFreq = "m"): number {
    return Math.round(GROW_INTERVALS[i] * FREQ_MULT[freq]);
}

/** 改档 due 重排间隔（□4 review P1-1）：素材卡（kind=material 且剩余量已知）走素材
 *  曲线间隔——改档前用 ×2 表重排=间隔系统性偏短（素材消耗间隔自 □4 起已是
 *  materialInterval 体系）；剩余量查询失败（undefined）返 null=跳过重排（保守：due
 *  留给下次消耗自然按新档）。count=当前轮次（×2 表索引=count-1） */
export function rescheduleDays(kind: string, matRemaining: number | undefined, count: number, f: VisitFreq): number | null {
    if (kind === "material") return matRemaining == null ? null : materialInterval(matRemaining, f);
    return growInterval(count - 1, f);
}

/** □6 自动放宽标记 IAL：值=放宽时刻 14 位。在场=当前 l 档来自巡查自动放宽（与手动选 l
 *  同值不同源）；手动改档（任意档）清除——显式意图接管。恢复=一键回 m+清标记 */
export const AUTORELAX_KEY = "custom-prog-autorelax";
/** □6 零产出观察窗（日历日；书龄同判据） */
export const RELAX_WINDOW_DAYS = 30;
/** □6 单轮巡查自动放宽书数上限（DIGEST_BUILD_CAP 同款：防一次写风暴） */
export const AUTO_RELAX_CAP = 10;

/** □6 窗口界（日历日锚−30 天；□5 dayStartOf 共用锚，勿引入滚动 24h） */
export function relaxWindowStart(nowMs: number): number {
    return dayStartOf(nowMs) - RELAX_WINDOW_DAYS * 86_400_000;
}

/** □6 判定矩阵（期首收拢定案）：窗口内摘抄+制卡双零 且 档位=m（手动选过 l/h=显式
 *  意图优先）且 无 autorelax 标记（幂等防重入）且 书龄≥窗口（刚加的书没来得及产出）
 *  → true。单向：放宽后标记在场恒 false；收回只走一键恢复（「不受 AI 调度摆布」） */
export function relaxVerdict(p: { digestN: number; cardN: number; freq: string; autorelaxAt: number | null; bookAddedMs: number | undefined; nowMs: number }): boolean {
    if (p.digestN > 0 || p.cardN > 0) return false;
    if (p.freq !== "m") return false;
    if (p.autorelaxAt != null) return false;
    if (p.bookAddedMs == null) return false;
    return p.bookAddedMs <= relaxWindowStart(p.nowMs);
}
/** 全局重现每日限额（□2 额度分池：重现族到期待弹卡的日闸门；期5 接设置档 1/3/5/10） */
export const REVISIT_DAILY_LIMIT = 5;
/** digest 建卡每轮巡查上限（review P2-4：takeover 首开对全库无键摘抄分摊建卡，
 *  防千级一次性写入风暴+持锁数分钟；30min/轮自然节奏摊完） */
export const DIGEST_BUILD_CAP = 20;

export interface ConsumeResult {
    /** 新身份键值（毕业=g 终态） */
    value: string;
    /** 下一轮 due（YYYYMMDDHHmmss；毕业态无意义=now 占位） */
    due: string;
    graduated: boolean;
}

/** 重现族消耗一轮（点「下一张」≠摘卡，按曲线排下次）：grow 进档 ×2、达 5 轮毕业；
 *  sched +every 进下轮永不毕业。atMs=消耗锚时刻（生产侧传评分 lastReviewMs 作新
 *  水位线——下次巡查该评分被水位线吸收，不重复消耗；契约：必须>0）。due 锚=atMs
 *  非巡查 now（review P2-2：见时刻随评分走不随巡查漂移——评分 20:00 巡查 23:00，
 *  下次 due=20:00+n 天）。daily/毕业/垃圾输入 → null（分片完成走评分对账链，不经此函数）。
 *  □4：matRemaining 由生产侧仅对 kind=material 传——走素材曲线分支（间隔=
 *  materialInterval(剩余量)，永不毕业：写完出池=消耗驱动，由 planSweep 在 remaining=0
 *  时摘卡出池），count 照加（轮次记录供面板显示），freq 档位同乘 */
export function consumeRound(value: string, atMs: number, now: Date, matRemaining?: number): ConsumeResult | null {
    const st = parseReadCard(value);
    if (!st || !atMs || st.graduated || st.mode === "daily") return null;
    const at = new Date(atMs);
    if (st.mode === "sched") {
        return { value: formatReadCard({ ...st, waterlineMs: atMs }), due: plusDays(at, st.count), graduated: false };
    }
    if (matRemaining != null) {
        return {
            value: formatReadCard({ ...st, waterlineMs: atMs, count: st.count + 1 }),
            due: plusDays(at, materialInterval(matRemaining, st.freq ?? "m")),
            graduated: false,
        };
    }
    const next = st.count + 1;
    if (next >= GRADUATE_ROUNDS) {
        return { value: formatReadCard({ ...st, waterlineMs: atMs, count: next, graduated: true }), due: dueStamp(now), graduated: true };
    }
    return {
        value: formatReadCard({ ...st, waterlineMs: atMs, count: next }),
        due: plusDays(at, growInterval(next - 1, st.freq ?? "m")),
        graduated: false,
    };
}

/** 分片每日重现·跨天未读推进（「跳过=明天同一片」的计数面；官方跳过=skipCardCache
 *  纯会话缓存不改 due，「未评分跨天」即同态）：count+1、水位线=now（同天多轮巡查
 *  不重计）；count 达 5 → 毕业终态（防单书卡死，生产侧毕业=推下一片不计已读）。
 *  count 语义=跨天到期未读次数（额度满日 due 被拉到次日 00:00 不计——「连续」
 *  实为跨天计数，毕业被拉长方向保守）。sched/毕业/垃圾 → null（不推进；sched
 *  分片按周期自然重现） */
export function advanceUnread(value: string, now: Date): { value: string; graduated: boolean } | null {
    const st = parseReadCard(value);
    if (!st || st.graduated || st.mode !== "daily") return null;
    const next = st.count + 1;
    return {
        value: formatReadCard({ ...st, waterlineMs: now.getTime(), count: next, graduated: next >= GRADUATE_ROUNDS }),
        graduated: next >= GRADUATE_ROUNDS,
    };
}

/** 素材首推池过滤判据（□2）：已进曲线（消耗过/毕业/转档）的素材不再作首推目标——
 *  dispatch 恒选最老未锤占首推位，若不过滤「已锤在曲线」的会连环建卡刷爆池。
 *  x#0（首推中未消耗）/旧 14 位一期值（存量首推卡）→ false 保持占位；x#1+/g/e → true。
 *  daily 计数态/垃圾 → false（保守当首推占位，防静默饿死） */
export function isConsumedCurve(readcard: string): boolean {
    const st = parseReadCard(readcard);
    if (!st) return false;
    if (st.graduated) return true;
    return st.mode === "grow" ? st.count >= 1 : st.mode === "sched";
}

// ============ □4 操作面纯函数（徽标/状态行/动作矩阵/转档键值/评分反馈） ============

/** 持久退推标记 IAL（「不再推」/「转记忆卡」落此；值=标记时刻 14 位。消费面=readCurve
 *  computeTargets 四处候选过滤 + addToReadingCurve 进卡前清除——session 游标挡不住
 *  reload 重收编（review P1-4），digest 无锤无复访类可依赖故须显式标记〔□2 P1-1 备案〕） */
export const READOUT_KEY = "custom-prog-readout";
/** 「每 N 天」档位（设计共识 N∈{1,3,7,14,30}） */
export const SCHED_CHOICES = [1, 3, 7, 14, 30];

/** 回访频率档位 IAL（□3）：挂书文档，值 l/m/h（缺省/m=中档零感知）。消费面=建卡默认
 *  （digest/material 建卡时烙进 readcard 键值尾段）+书级批量跟随（改档时重写该书在册
 *  grow 卡的频率尾段，setBookVisitFreq）；卡上键值才是执行事实源（位置无关随文档走） */
export const VISITRATE_KEY = "custom-prog-visitrate";

/** 类别节奏档位（□5 设置）：0=默认（×2 递增曲线）；N>0=每 N 天永不毕业。
 *  → buildReadingCard/adoptReadingCard 参数（undefined=调用方自身缺省 grow） */
export function cadenceOpts(cadence: number): { mode: "sched"; count: number } | undefined {
    return cadence > 0 ? { mode: "sched", count: cadence } : undefined;
}

/** 类别节奏档位 → 建卡首排 due 天数（0=默认 grow 首档 3 天；N=N 天） */
export function cadenceDays(cadence: number): number {
    return cadence > 0 ? cadence : GROW_INTERVALS[0];
}

/** material 首推判定（期5 P1-1 修）：grow/daily=count0 未消耗；sched=锤态（🔨 前缀缺失=
 *  未锤）——期5 档位建卡即 sched 无 count0 态，用户手动转档的 sched 卡已锤天然 false。
 *  ctime=PDIGEST_CTIME 现值（空串=未锤，保守按首推进锤链；锤挂失败幂等可重试） */
export function isMaterialFirstPush(kind: ReadCardKind, st: ReadCardState, ctime: string): boolean {
    if (kind !== "material") return false;
    return st.mode === "sched" ? !ctime.startsWith("🔨") : st.count === 0;
}

/** 转「每 N 天」新键值（e#now#every；水位线重置=转档时刻，此后评分才是真消耗） */
export function toSchedValue(every: number, nowMs: number): string {
    return formatReadCard({ mode: "sched", waterlineMs: nowMs, count: every, graduated: false });
}

/** 「再来一轮」新键值（x#now#1：复活=第 1 见，+3 天第 2 见——adopt 收编同款口径） */
export function reviveValue(nowMs: number): string {
    return formatReadCard({ mode: "grow", waterlineMs: nowMs, count: 1, graduated: false });
}

/** 操作面动作 id（菜单组配序即数组序） */
export type CardAction = "stop" | "sched" | "again" | "defer" | "repush" | "memory" | "add";

/** 动作可用矩阵（纯函数）：无键=[add]；毕业=[again,sched]；daily 分片=[stop,sched,repush,memory]
 *  （推迟无意义——闸门开时 planSweep 恒把目标片 due 拉回 now；repush=今天再弹一次）；
 *  曲线族=[stop,sched,defer,repush,memory] 全集；垃圾键=[stop]（清键摘卡止蚀）。
 *  repush（□8 bear 需求）=due 拉回 now 立刻重进队列，不动键不耗轮次——测试重推/误评回手。
 *  kind 特化（piece 转档须推进书 point 等）在生产侧 */
export function cardActionSet(readcard: string): CardAction[] {
    if (!readcard) return ["add"];
    const st = parseReadCard(readcard);
    if (!st) return ["stop"];
    if (st.graduated) return ["again", "sched"];
    if (st.mode === "daily") return ["stop", "sched", "repush", "memory"];
    return ["stop", "sched", "defer", "repush", "memory"];
}

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
    /** 身份键值推进（期1 分片显式完成制：跨天未读 count+1 / 毕业落 g 终态） */
    setKey: { id: string; value: string }[];
    /** 未完成超限毕业卡（生产侧：摘卡+推下一片不计已读；键值走 setKey 的 g 终态） */
    graduate: CurvePlanCard[];
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

/** 当日 00:00（本地，毫秒）——日历日分桶唯一锚（□5 条带 stripDayIdx/行文案 planDueLabel/
 *  待办段 splitSchedule 共用，滚动 24h 与日历日两种「天」口径在此统一） */
export function dayStartOf(now: number): number {
    const d = new Date(now);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
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

/** 真评分判定（身份键水位线）：lastReview 晚于水位线+5s 余量（水位线=建卡时刻〔旧值〕
 *  或最后一次自家操作时刻〔新值〕）。自家建卡尾链 review(2)/消耗回写的 lastReview≈
 *  水位线本身，恒被排除；进程重启丢 reps 基线后本判据幂等兜底（已对账卡早被摘、
 *  卡在即未对账）。毕业态恒 false（防御快通道） */
export function isRated(readcard: string, lastReviewMs: number): boolean {
    const st = parseReadCard(readcard);
    if (!st || st.graduated || !lastReviewMs) return false;
    return lastReviewMs > st.waterlineMs + RATING_GRACE_MS;
}

/** 跨天未读判据（期1 分片显式完成制的计数面）：due<今日00:00（昨天到期弹过
 *  「跳过/没点下一张」）且水位线<今日00:00（同天多轮巡查不重计）。额度关从未
 *  弹出的卡（due=今日00:00 起步）天然不满足——今天才是第一见 */
function unreadOvernight(c: CurvePlanCard, waterlineMs: number, now: Date): boolean {
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    if (waterlineMs >= dayStart.getTime()) return false;
    return c.due != null && c.due < normalizeDue(dueStamp(dayStart))!;
}

/** 目标集三分（纯核心）：targets=各书下一片 blockID（onload 态可为空 Map=不建片只拉平陈卡）；
 *  gateOpen=DayLog b[bookID]<q（额度闸门——勿用 riff lastReview 计数：自家 review(2)
 *  恒虚高 1 且编辑器入口不产生 lastReview）。
 *  期1 扩展：目标分片卡（piece/slot）跨天未读 → advanceUnread 推进 count（5 天
 *  上限毕业→graduate，推下一片不计已读）；material 保持一期「评分即摘」语义
 *  期2 扩展：曲线族（grow/sched 键）完全绕过流转族 target 逻辑——重现卡按自身
 *  due 到期出现（rc 额度关推明）、书不可读沉底、material 首推（count=0）走书闸门
 *  （首推=新读占书额度，与 rc 重现池两池独立）。readable/rcGateOpen 可选=老调用兼容 */
export function planSweep(args: {
    cards: CurvePlanCard[];
    targets: Map<string, string>;
    gateOpen: Map<string, boolean>;
    now: Date;
    /** 在册可读书集（忽略/归档外的书；曲线族沉底判定，流转族走 targets 隐式覆盖） */
    readable?: Set<string>;
    /** 全局重现额度闸门（今日 rc<上限；默认 true=老调用不闸） */
    rcGateOpen?: boolean;
    /** 书→未锤素材数（□4：确证 0=该书素材写完→出池摘卡；缺省/缺书=未知保守不动） */
    matRemaining?: Map<string, number>;
}): SweepPlan {
    const plan: SweepPlan = { setDue: [], remove: [], reconcile: [], setKey: [], graduate: [] };
    const nowDue = normalizeDue(dueStamp(args.now))!;
    const rcOpen = args.rcGateOpen !== false;
    for (const c of args.cards) {
        if (isRated(c.readcard, c.lastReviewMs)) {
            plan.remove.push(c.blockID);
            plan.reconcile.push(c);
            continue;
        }
        // 毕业残留（键已落 g 但摘卡前中断的卡）：直接重进 graduate 幂等恢复——
        // 推进守卫 shouldReconcilePiece 防重推，摘卡/清 due 语义与首毕业同款。
        // plain 例外（review P1-2）：用户 deck 卡摘不动恒 live，重进=每轮无效摘卡
        // 请求循环（cardflip 高频触发），且掉流转族会 sink 写 +99——整体跳过：
        // 毕业即终态，无卡可摘无片可推，零写静默出局
        if (parseReadCard(c.readcard)?.graduated) {
            if (c.kind !== "plain") plan.graduate.push(c);
            continue;
        }
        // □4 素材写完出池：该书未锤素材确证归零 → 摘卡出池（复用毕业链，无 5 轮
        // 语义——素材终态=消耗驱动）。Map 缺书=未知（如关开关的旧巡查）保守不动。
        // g 终态键随出池自带（5 轮毕业的 g 是 consumeRound 经 setKey 落的，出池不过
        // 消耗路径；不落=下轮巡查见 x#+无卡判孤儿清键丢档案——e2e 09-12 实锤）
        if (c.kind === "material" && (args.matRemaining?.get(c.bookID) ?? -1) === 0) {
            plan.graduate.push(c);
            const stPool = parseReadCard(c.readcard);
            if (stPool) plan.setKey.push({ id: c.blockID, value: formatReadCard({ ...stPool, graduated: true }) });
            continue;
        }
        // 曲线族（□2）：grow/sched 键任意 kind（含转档金句片）+ material/digest 的
        // daily 首推态（x#0 新卡与旧 14 位存量卡，评分时升级转 grow 消耗）
        const st = parseReadCard(c.readcard);
        const curveFamily = !!st && !st.graduated && (
            st.mode === "grow" || st.mode === "sched"
            || ((c.kind === "material" || c.kind === "digest") && st.mode === "daily"));
        if (curveFamily) {
            // 全局对象族（□3：rpcard/plain 无书归属，bookID 恒空）不参与书沉底——
            // 阅读点/文档卡是全局推送对象，到期重现走 rc 池；书沉底判据（空书/不可读
            // → +99）只对书归属 kind（material/digest/片族）生效
            const globalScope = c.kind === "rpcard" || c.kind === "plain";
            if (!globalScope && args.readable && (!c.bookID || !args.readable.has(c.bookID))) {
                const due = plusDays(args.now, FAR_DUE_DAYS);
                if (normalizeDue(due) !== c.due) plan.setDue.push({ id: c.blockID, due });
                continue;
            }
            // 素材首推悬而未决（未消耗，daily 存量或 x#0）：书闸门（一期语义——首推=
            // 新读占书额度；sched 转档位恒非首推）。digest 建卡即 count=1 恒走重现轮次
            if (c.kind === "material" && st!.mode !== "sched" && st!.count === 0) {
                const open = args.gateOpen.get(c.bookID);
                const due = open ? dueStamp(args.now) : tomorrowStart(args.now);
                // 幂等零写同 target 分支（review P2-1：已到期不回写前进分钟）
                if (normalizeDue(due) !== c.due && !(open && c.due != null && c.due <= nowDue)) {
                    plan.setDue.push({ id: c.blockID, due });
                }
                continue;
            }
            // 重现轮次：未到期零写（曲线自己排的 due）；到期+rc 额度开零写保持（已在
            // 官方队列）；额度关推明（新一天额度重置自然再弹——一期书闸门同款语义）
            if (c.due != null && c.due > nowDue) continue;
            if (rcOpen) continue;
            const due = tomorrowStart(args.now);
            if (normalizeDue(due) !== c.due) plan.setDue.push({ id: c.blockID, due });
            continue;
        }
        const target = args.targets.get(c.bookID) === c.blockID ? c.blockID : null;
        if (target) {
            // 分片显式完成制：未评分跨天=未完成（官方「跳过」=skipCardCache 纯会话
            // 缓存不改 due，与本判据同态——无需监听跳过事件；g 态已在循环头拦截）
            if (c.kind !== "material") {
                const st = parseReadCard(c.readcard);
                if (st && st.mode === "daily" && unreadOvernight(c, st.waterlineMs, args.now)) {
                    const adv = advanceUnread(c.readcard, args.now)!; // 前置条件已验，恒非 null
                    plan.setKey.push({ id: c.blockID, value: adv.value });
                    if (adv.graduated) {
                        plan.graduate.push(c);
                        continue; // 毕业卡即摘，不走 due 分支
                    }
                }
            }
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
