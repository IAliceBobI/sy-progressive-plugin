// 原文引用合成（2026-09-13，bear 拍板「不想要引用指向原文——原文快删」）：卡尾 `*`
// （指向原文块）与分片场景 `@`（指向原书块）由「制卡加原文引用」设置开关统一控制，
// 默认开（老用户零感知）。显式无引用通道（⌥S「制卡无引用」与直发命令的 noRef=true）
// 恒优先——开关只影响默认通道。纯函数锁语义，测试 tests/unit/flashCardRef.test.ts。
export function shouldAddOriginRef(noRef: boolean | undefined, settingOn: boolean): boolean {
    return !noRef && settingOn;
}
