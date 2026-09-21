// progfeatpool 件4：批量整理摘抄（入素材池/换籍）UI 壳的纯逻辑层。
// 引擎（writeBook.copyDigestsToPool/moveDigestsToPool）零改动只读复用——本文件只收
// UI 侧需要单测的判定/分流：分批拦截（>100 先拦提示）、回执重试动作分流（copy 非幂等
// 只重传失败篇 / move 幂等整批重跑安全）、引擎逐项 log 行解析（进度+成功 id 集）。
// 组件（DigestBatchPoolDialog.svelte）与弹链（Progressive.openBatchPoolDialog）不含
// 可测逻辑，形态全抄 DigestAllDialog 期D manage 模式。

/** 引擎单批上限（writeBook.ts 两壳 :494/:545 抛错值；UI 侧同值先拦，引擎抛错兜底） */
export const POOL_BATCH_CAP = 100;

export type PoolBatchMode = "copy" | "move";

/** 归一回执（引擎 DigestsToPoolResult/DigestsMovePoolResult 两形归一：copied/moved→ok） */
export interface PoolBatchOutcome {
    total: number;
    ok: number;
    skipped: { id: string; reason: string }[];
    failed: { id: string; error: string }[];
}

/** 分批拦截判定：去重后超上限返回溢出篇数（>0 即拦），否则 0。
 *  口径=UI 预拦按去重后计数，比引擎壳（writeBook.ts :494/:545 在去重**前**比对
 *  length）更宽：含重复 id 的 102 条去重后 100 时 UI 放行、引擎会抛错。真实 UI
 *  通道 selected 恒无重复（toggle/toggleSelectAll 由去重清单构造），两口径不可达
 *  地分叉；引擎抛错兜底仍在，Dialog catch 落通用失败 toast。 */
export function batchOverflowCount(ids: readonly string[], cap: number = POOL_BATCH_CAP): number {
    return Math.max(0, new Set(ids).size - cap);
}

/** 回执重试动作分流（引擎两壳收尾 log 文案直译：copy「重试请只传 failed 里的 id
 *  （复制非幂等，整批重跑会双份）」/ move「换籍幂等，整批重跑安全」）：
 *  failed-only=选择集装 failed 的 id 再跑；whole-batch=整批原样重跑（幂等无害）；
 *  null=无失败篇不给重试行。 */
export function poolRetryKind(mode: PoolBatchMode, failedCount: number): "failed-only" | "whole-batch" | null {
    if (failedCount <= 0) return null;
    return mode === "copy" ? "failed-only" : "whole-batch";
}

/**
 * 引擎批量壳逐项 log 行解析（UI 进度唯一通道——引擎回执是整体返回，逐项进度只有
 * log 注入点）。只依赖最小契约（引擎冻结+单测钉住）：进度行前缀 `n/m `；成功行
 * `n/m ✓ <id>`。skipped/failed 行的逐项明细回执里本就有，无需从 log 提取（不耦合
 * 「跳过（…）/失败」文案形态）——move 剔行要的成功 id 集从 ✓ 行收集。
 * 非 progress 行（去重提示/汇总行）返回 null 跳过。 */
export function parseEngineProgressLine(line: string): { done: number; total: number; okId: string | null } | null {
    const m = /^(\d+)\/(\d+)\s(.*)$/.exec(line);
    if (!m) return null;
    const rest = m[3];
    const ok = rest.startsWith("✓ ");
    return { done: Number(m[1]), total: Number(m[2]), okId: ok ? rest.slice(2) : null };
}
