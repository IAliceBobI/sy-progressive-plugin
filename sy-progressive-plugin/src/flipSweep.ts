// □4 翻片即时建卡（刘璐 09-22 反馈：分片模式翻片按钮产的新分片一直无卡）。
// 根因：翻片按钮族（下一分片不删/删片回上/删片退出/删片换书/读完删片/回看/下一本）
// 全走 startToLearnLeased 直调——全仓唯一不经 startToLearnWithLock 的出片路径，而
// 即时巡查 fire 只挂在 WithLock 尾部，翻片后建卡只能等 30min timer 兜底巡查。
// 修=对齐 WithLock 形态：Leased 返回（StartToLearnLock 已释放，巡查避让判定
// mainSweepLocksHeld 不撞自持锁）后 fire 一次 dispatch 巡查（fire-and-forget，
// 不阻塞翻片收尾）。语义边界：只对齐触发——巡查闸自 □5 progfix0922 起=sweepRegime
// 双闸（takeover‖pieceAutoCard，分片自动制卡默认开=接管关也建分片卡），见
// readCurveCore.sweepRegime。
// 独立小模块而非 Progressive 私有方法：tests/unit 无法实例化 Progressive 类
// （.svelte import 链无 svelte 插件，仓内惯例=纯函数单测），独立出来让触发契约可测。
import { sweepReadCurve } from "./readCurve";
import type { LockLeaseResult } from "./lockLease";

/** 翻片按钮族出片对齐器：await 租约 → fire dispatch 巡查 → 原样透传结果。
 *  fire 不看结果（unavailable/lease-expired 也 fire——lease-expired 的孤儿 body
 *  仍在跑、书状态可能已变，refresh 一下投影无坏处，与 WithLock 同口径）。 */
export async function leasedThenSweep(lease: () => Promise<LockLeaseResult>): Promise<LockLeaseResult> {
    const r = await lease();
    void sweepReadCurve("dispatch");
    return r;
}
