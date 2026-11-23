// 清零历史欠债菜单（2026-11-23 鸟反馈，bear 定「手动清零」）：欠债=每日「档位−已读」
// 累加、多读不抵扣，档位一次调高没读完就永久挂债，此前没有出口。状态栏火苗右键 /
// 舰队面板欠债胶囊 / 命令面板三入口共用本菜单——菜单项即确认步（点一下才清）。
// 形态对齐 bookMenu.ts 惯例：independent 第三参防 click 冒泡单例坑（AGENTS.md 踩坑表）
// + setTimeout 包 open + 键盘触发落屏中（reviewMenu menuPos 同款）。
import { Menu } from "siyuan";
import { get } from "svelte/store";
import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import { rollerClearHistoricalDebt } from "./roller";
import { flameState, refreshFleet } from "./fleet";

/** 键盘触发（clientX/Y=0）时菜单落屏幕中间 */
function menuPos(ev: { clientX: number; clientY: number }) {
    return {
        x: ev.clientX > 0 ? ev.clientX : innerWidth / 2,
        y: ev.clientY > 0 ? ev.clientY : innerHeight / 2,
    };
}

/** 把今天之前的历史欠债清零（菜单项点击后才调）：落标记 + 重刷火苗/面板 + 提示。
 *  只动标记不动账——阅读日志逐日数据原样保留，热力图/累计已读不受影响 */
export async function clearHistoricalDebt() {
    await rollerClearHistoricalDebt();
    await refreshFleet();
    await siyuan.pushMsg(tomatoI18n.历史欠债已清零, 2000);
}

export function openDebtMenu(ev: { clientX: number; clientY: number }) {
    const hist = get(flameState)?.histDebt ?? 0;
    if (hist <= 0) {
        // 火苗未及刷新/确实没有历史欠债：不弹空菜单，直接说明
        void siyuan.pushMsg(tomatoI18n.没有历史欠债, 2000);
        return;
    }
    const menu = new (Menu as any)("progDebtMenu", undefined, true) as Menu;
    menu.addItem({
        icon: "iconRefresh",
        label: tomatoI18n.清零历史欠债N片(hist),
        click: () => void clearHistoricalDebt(),
    });
    setTimeout(() => menu.open(menuPos(ev)), 0);
}
