// □4 操作面菜单组配（卡徽标/右键/面板行三入口共用）：顶部只读状态行（statusLineOf）
// + 动作集（cardActionSet 纯函数矩阵）。独立 Menu（independent 第三参，插件自建菜单
// 内再弹的先例坑）；文案期5 已入 tomatoI18n（label 走函数惰性取——模块级求值会在
// 插件 init 设 conf 前冻结 lang）。「每 N 天」子菜单同构 reviewMenu schedSubmenuItems
// （✓ 当前档标记、点击不重置进度）。
import { Menu } from "siyuan";
import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import {
    cardActionSet, SCHED_CHOICES, statusLineOf,
} from "./readCurveCore";
import { applyReadCardAction, inspectReadCard } from "./readCurve";
import type { ReadCardActionId } from "./readCurve";

type MenuItemOption = Parameters<Menu["addItem"]>[0];

/** 动作定义（label 惰性取 i18n；kind 特化在 applyReadCardAction 内） */
const ACTION_DEFS: Record<Exclude<ReadCardActionId, "sched">, { icon: string; label: () => string }> = {
    stop: { icon: "iconTrashcan", label: () => tomatoI18n.不再推 },
    again: { icon: "iconRefresh", label: () => tomatoI18n.再来一轮 },
    defer: { icon: "iconClock", label: () => tomatoI18n.推迟到明天 },
    repush: { icon: "iconPlay", label: () => tomatoI18n.再推一次 },
    memory: { icon: "iconEye", label: () => tomatoI18n.转为记忆卡 },
    add: { icon: "iconRiffCard", label: () => tomatoI18n.加入推送 },
};

function menuPos(ev: { clientX: number; clientY: number }) {
    return {
        x: ev.clientX > 0 ? ev.clientX : innerWidth / 2,
        y: ev.clientY > 0 ? ev.clientY : innerHeight / 2,
    };
}

/** 「阅读推送」菜单（状态行+全动作集）。onApplied=动作落盘后回调（卡面翻页/面板重载） */
export async function openReadCardMenu(
    blockID: string, ev: { clientX: number; clientY: number }, onApplied?: (action: ReadCardActionId) => void,
): Promise<void> {
    if (!blockID) return;
    const ctx = await inspectReadCard(blockID);
    const items: MenuItemOption[] = [];
    // 顶部只读状态行（无 click）；无键带退推标记 → 「已退出」提示行
    const status = ctx.readcard
        ? statusLineOf(ctx.readcard, ctx.dueMs, Date.now())
        : ctx.optout ? tomatoI18n.已退出阅读推送 : null;
    if (status) {
        items.push({ icon: "iconInfo", label: status });
        items.push({ type: "separator" } as MenuItemOption);
    }
    const curEvery = ctx.st?.mode === "sched" ? ctx.st.count : 0;
    for (const a of cardActionSet(ctx.readcard)) {
        if (a === "sched") {
            items.push({
                icon: "iconCalendar",
                label: tomatoI18n.每N天档位,
                submenu: SCHED_CHOICES.map(n => ({
                    icon: "iconCalendar",
                    label: (curEvery === n ? "✓ " : "") + tomatoI18n.计划每N天(n),
                    click: () => void runAction(blockID, "sched", n, onApplied),
                })),
            });
            continue;
        }
        const def = ACTION_DEFS[a];
        items.push({
            icon: def.icon,
            label: def.label(),
            click: () => void runAction(blockID, a, 0, onApplied),
        });
    }
    if (!items.length) return;
    const menu = new (Menu as any)("progReadCardMenu", undefined, true) as Menu;
    for (const it of items) menu.addItem(it);
    debugLog("readcurve.ui", `menu open block=${blockID} key=${ctx.readcard || "(none)"}`, "progressive");
    setTimeout(() => menu.open(menuPos(ev)), 0);
}

async function runAction(
    blockID: string, action: ReadCardActionId, every: number, onApplied?: (action: ReadCardActionId) => void,
): Promise<void> {
    const tip = await applyReadCardAction(blockID, action, every);
    if (tip) {
        onApplied?.(action);
    } else {
        // 静默失败兜底（review P2-7）：动作内部 catch 吞错时用户零反馈
        try { await siyuan.pushMsg(tomatoI18n.操作未生效, 2500); } catch { /* noop */ }
    }
}
