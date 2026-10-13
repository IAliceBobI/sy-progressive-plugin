// 渐进悬浮球（收起态，FloatBall.svelte）位置存档（lsfix 2026-10-13 家族战役，qeBall.ts
// 同款姿势）：原走 localStorage——思源桌面 Electron 壳每次启动给内核随机端口，origin 含
// 端口变=localStorage 换格子清空，跨重启必丢（群实报「块编辑器收缩球位置重启丢失」同
// 根因）；改 progFloatBallPos 工作空间档。null=无存档（球回默认左下 200,innerHeight-200
// ——默认位依赖运行期窗口尺寸，故 store 默认 null 而非坐标）；localStorage 旧档
// （prog-floatball-pos，单键 JSON {x,y}）由 loadProgFloatBallPos 一次性收编。
// 展开态浮条位置是另一条键（prog-piece-floatbar-pos，共享 FloatBar 组件 posKey 传入），
// 互不干扰。store 实体在 tomato stores.ts（登记员统一登记），load 由 progressive
// 的 loadStore 负责（index.ts），本文件只做读写门面。
import { progFloatBallPos } from "../../sy-tomato-plugin/src/libs/stores";

// 旧档收编源（lsfix 前的主档，仅 loadProgFloatBallPos 读）
const LS_KEY = "prog-floatball-pos";

// ---------- 纯函数（单测 tests/unit/progFloatBallStore.test.ts） ----------

/** 旧档解析：单键 JSON 串 {x,y}；缺坐标/坏 JSON 判无存档（坏档回默认位，组件原容错沿用） */
export function parseProgFloatBallPos(raw: string | null): { x: number; y: number } | null {
    try {
        const pos = JSON.parse(raw ?? "null");
        if (pos?.x != null && pos?.y != null) return { x: pos.x, y: pos.y };
        return null;
    } catch { return null; /* 坏数据回默认位置 */ }
}

/** 球位存档读取：progFloatBallPos 档优先；无档时收编 localStorage 旧档（固定端口环境有真值，
 *  桌面端随机端口 origin 下恒空）并落新档。均无→null（调用方回默认 200,innerHeight-200） */
export function loadProgFloatBallPos(): { x: number; y: number } | null {
    const p = progFloatBallPos.get();
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) return p;
    const legacy = parseProgFloatBallPos(localStorage.getItem(LS_KEY));
    if (legacy) saveProgFloatBallPos(legacy);
    return legacy;
}

/** 球位落盘（拖拽松手/旧档收编共用）：set 后紧跟 write 确定性落盘
 *  （settingFactory.set 只写内存不落盘，搭车不可靠——stores.ts 注释） */
export function saveProgFloatBallPos(p: { x: number; y: number }) {
    progFloatBallPos.set(p);
    void progFloatBallPos.write();
}
