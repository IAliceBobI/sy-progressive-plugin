// □1 锁治理：navigator.locks 租约包装。
// 事故（2026-09-09 渐进跳片故障）：锁内链路某环节 HTTP hang → 持锁 promise 永不落定
// → 锁被永久占用（dev 实锤：插件 reload 不释放，整页刷新是唯一恢复通道；移动端连
// 刷新都没有）。navigator.locks 无 steal/abort 机制，治理只能从持有侧兜底：
// Promise.race(body, sleep(leaseMs))——租约一到回调即落定、锁即释放，body 成孤儿
// 继续跑（其后续落定无法取消，但不再堵住后续操作）。
// 租约默认 180s：合法最慢链（重试循环 30×(500ms+SQL) ≈ 2min + 巨片构建）之上的余量，
// 远小于"永远"；巨书清片（deleteAllPieces 数百片×每片 2 次 HTTP）等长链站点单独
// 放宽（如 600s）。嵌套锁（外 htmlBlockReadNextPeiceLock / 内 StartToLearnLock）
// 各自独立计租约，两层近乎同时起跑（内层仅晚 gotoBlock 的 1~2s）。
// 注意：租约靠 setTimeout 兑现——后台页签/移动端后台的 timer 节流会让放锁时刻
// 延后（晚放不早放，安全侧），回到前台后一个 timer 周期内收敛。
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
import { LockLeaseMs } from "./constants";

export type LockLeaseResult = "unavailable" | "done" | "lease-expired";

/** navigator.locks 的最小面（仅 request），可注入假实现供单测 */
type LockManagerLike = {
    request<T>(
        name: string,
        opts: { ifAvailable?: boolean },
        cb: (lock: unknown) => Promise<T>,
    ): Promise<T>;
};

export async function lockWithLease(
    name: string,
    body: () => Promise<unknown>,
    opts?: { leaseMs?: number; locks?: LockManagerLike; queued?: boolean },
): Promise<LockLeaseResult> {
    const locks = opts?.locks ?? (navigator.locks as unknown as LockManagerLike);
    const leaseMs = opts?.leaseMs ?? LockLeaseMs;
    // queued=true 排队模式（无 ifAvailable）：等持锁者放行后再跑，回调恒拿到真锁，
    // unavailable 分支不可达——用于「清理必须完成、晚点没关系」的长链站点
    const reqOpts = opts?.queued ? {} : { ifAvailable: true as const };
    return locks.request(name, reqOpts, async (lock) => {
        if (!lock) {
            debugLog("locklease", `${name} unavailable（上一操作仍在持锁）`, "progressive");
            return "unavailable";
        }
        let timer: ReturnType<typeof setTimeout> | undefined;
        const lease = new Promise<"lease-expired">((res) => {
            timer = setTimeout(() => res("lease-expired"), leaseMs);
        });
        const bodyP = (async () => {
            await body();
            return "done" as const;
        })();
        // 幽儿兜底：租约到期放锁后 body 仍在跑，其迟到 rejection 已无人消费——
        // 挂空 catch 防未处理拒绝告警（race 持的是 bodyP 本尊，租约内 reject 仍正常上抛）
        bodyP.catch(() => { /* 孤儿迟到的失败只进 Loki，不打扰用户 */ });
        try {
            const r = await Promise.race([bodyP, lease]);
            if (r === "lease-expired") {
                debugLog("locklease", `${name} lease expired after ${leaseMs}ms（放锁，body 成孤儿继续）`, "progressive");
            }
            return r;
        } finally {
            clearTimeout(timer);
        }
    });
}
