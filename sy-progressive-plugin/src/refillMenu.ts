// □22 重插翻新（2026-08-30 用户实测报回）：refill 钮从「静默追加」改为「清空片内全部
// 内容（含手写笔记，confirm 警告）+ 按所选断句方式重插」。断句选择=贴钮菜单（recite
// startAISplit / reviewMenu 先例，independent 自管生命周期）；p/t/i 与 AddBook 同口径
// 整体 Pro（□14：可见不藏 + 点击引导），执行侧 splitAndInsert 另有同门禁兜底。
// runner 回调注入（不 import Progressive，避免模块环）。
import { Menu, confirm } from "siyuan";
import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import { lastVerifyResult } from "../../sy-tomato-plugin/src/libs/user";

/** 重插断句档位：null=按书设置（书级 auto 断句或不断句，免费）；"no"=强制不断句（免费，
 * 压过书级 auto）；p/t/i=直选三档（Pro）。用户实测二轮增补（2026-08-30）：纯不断句档。
 * □1 重插失真（2026-09-01）：no 档升首位+标签换「原样插回」——用户心智「重插=原样恢复」，
 * 首位 null 档在书级 auto 开着时会按断句重写块结构，产物≠原文。 */
export type RefillMode = AsList | "no" | null;

export const REFILL_MODES: readonly RefillMode[] = ["no", null, "p", "t", "i"];

/** 纯逻辑：档位标签（菜单项次序=REFILL_MODES 数组序） */
export function refillModeLabel(stype: RefillMode): string {
    switch (stype) {
        case "no": return tomatoI18n.原样插回;
        case "p": return tomatoI18n.断句为段落块;
        case "t": return tomatoI18n.断句为任务块;
        case "i": return tomatoI18n.断句为无序表;
        default: return tomatoI18n.按书的断句设置;
    }
}

/** 纯逻辑：档位图标（功能信号，与 reviewMenu emoji 口径一致）。锁定态换思源 sprite
 * 小锁（□30：🔒 emoji 退役，用户 emoji 装饰土口径收口）。类挂官方 .b3-menu__icon 拿
 * 菜单 icon 的 margin 排版（运行时产物实测该类管 18px+边距），inline 13px 盖过其尺寸
 * 与 AddBook chip 锁统一并兜底类缺失（裸 svg 无 CSS 命中时按替换元素默认 300×150
 * 撑爆菜单项，review 双通道实锤）。任务块用空选框 ☐（用户实测二轮：☑️ 打勾像已选中）；
 * 不断句=保持整块。 */
const LOCK_ICON_SVG = '<svg class="b3-menu__icon" style="width:13px;height:13px"><use xlink:href="#iconLock"></use></svg>';
export function refillModeIcon(stype: RefillMode, locked: boolean): string {
    if (locked) return LOCK_ICON_SVG;
    switch (stype) {
        case "no": return "🧱";
        case "p": return "📃";
        case "t": return "☐";
        case "i": return "📋";
        default: return "📖";
    }
}

/** 纯逻辑：Pro 锁定判定（□14 口径：直选 p/t/i 是 Pro；按书设置与强制不断句免费——
 * 后者走整块复制不碰断句引擎） */
export function refillModeLocked(stype: RefillMode, paid: boolean): boolean {
    return !paid && (stype === "p" || stype === "t" || stype === "i");
}

/** 菜单入口：选档 → confirm 清空警告 → runner(stype)。ev 坐标 0（键盘触发）落屏中 */
export function openRefillMenu(
    ev: { clientX: number; clientY: number },
    runner: (stype: RefillMode) => void | Promise<void>,
) {
    const paid = lastVerifyResult();
    const menu = new (Menu as any)("progRefillMenu", undefined, true) as Menu;
    for (const stype of REFILL_MODES) {
        const locked = refillModeLocked(stype, paid);
        menu.addItem({
            iconHTML: refillModeIcon(stype, locked),
            label: refillModeLabel(stype),
            click: locked
                ? () => void siyuan.pushMsg(tomatoI18n.断句Pro提示, 2500)
                : () => confirm(
                    tomatoI18n.重插清空确认标题,
                    tomatoI18n.重插清空确认内容,
                    () => { void runner(stype); },
                ),
        });
    }
    const x = ev.clientX > 0 ? ev.clientX : innerWidth / 2;
    const y = ev.clientY > 0 ? ev.clientY : innerHeight / 2;
    setTimeout(() => menu.open({ x, y }), 0);
}
