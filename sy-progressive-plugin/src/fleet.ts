// v5 □6 状态栏火苗 + 左 Dock 舰队总览（视觉方案 docs/prog-v5-visual-design.md §2/§3）。
// 挂载编排 + 刷新调度：动作经 FleetActions 注入（不 import Progressive，防循环依赖——
// Progressive.ts 反向 import 本模块的 notifyFleetChanged 在记账后触发刷新）。
// 刷新时机：30s 定时 + notifyFleetChanged（读片/摘抄等数据变化点）+ 面板手动 ♻。

import { mount, unmount } from "svelte";
import { writable } from "svelte/store";
import FleetFlame from "./FleetFlame.svelte";
import DockPanel from "./DockPanel.svelte";
import { loadFleetSummary, type FleetSummary } from "./fleetData";
import { rollerDebtSummary, type DebtSummary } from "./roller";
import { dailyQuota } from "../../sy-tomato-plugin/src/libs/stores";
import { icon } from "../../sy-tomato-plugin/src/libs/utils";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import { newID } from "stonev5-utils";

export interface FleetActions {
    /** ▶ 开始今日阅读（滚筒下一片） */
    startReading(): any;
    /** □11 自由态上岗（状态栏 ✂ 钮：普通文档浮条到场；三态文档=聚焦浮条开子排） */
    freeDigest(): any;
    /** 空态主按钮=把当前文档加入渐进阅读 */
    addFirstBook(): any;
    /** 书卡点击=断点续读（开片不删旧） */
    continueReading(bookID: string): any;
    /** 管理书目（旧「查看所有渐进学习文档」表格，□7 收编进面板） */
    manageBooks(): any;
    /** 打开设置 */
    openSettings(): any;
    /** recite 导流：装了=触发仿写练习，未装=提示 */
    reciteAction(): any;
    /** recite 是否已安装（导流图标亮/灰态） */
    isReciteInstalled(): boolean;
    /** v5 □12：书卡 ✧ 徽章点开=该书重访到期待办列表（完成/推迟/移除，见 reviewMenu.ts） */
    openDueList(ev: { clientX: number; clientY: number }, bookID: string): any;
}

export const FLEET_DOCK_TYPE = "prog-fleet-dock";

/** 火苗数据（状态栏消费，轻查询） */
export const flameState = writable<DebtSummary | null>(null);
/** 面板数据（Dock 消费，重查询） */
export const panelState = writable<FleetSummary | null>(null);

let refreshTimer: ReturnType<typeof setInterval> | null = null;
let refreshing = false;
let flameApp: any = null;
let quotaSubStop: (() => void) | null = null;

export async function refreshFlame() {
    try {
        flameState.set(await rollerDebtSummary());
    } catch (e) {
        console.error("fleet refreshFlame failed", e);
    }
}

export async function refreshPanel() {
    if (refreshing) return; // 并发去重（30s 定时与 notify 撞车时）
    refreshing = true;
    try {
        panelState.set(await loadFleetSummary());
    } catch (e) {
        console.error("fleet refreshPanel failed", e);
    } finally {
        refreshing = false;
    }
}

export async function refreshFleet() {
    await Promise.all([refreshFlame(), refreshPanel()]);
}

/** 数据变化点入口：Progressive.markReadSafe 记账成功后调用（火苗/面板即时联动） */
export function notifyFleetChanged() {
    refreshFleet();
}

/** 档位切换（Dock 今日状态区胶囊）：落盘 + 立即重刷（今天的 q 以实时档位覆盖） */
export async function setQuota(n: number) {
    await dailyQuota.write(String(n));
    await refreshFleet();
}

export function initFleet(plugin: any, actions: FleetActions) {
    // ---- □11 状态栏 ✂ 钮（火苗旁，不复用火苗）：自由态上岗/聚焦浮条 ----
    // 两钮均 position:"left"（afterbegin 插头部，后注册者更靠左）→ 火苗须后注册才在最左端
    const freeHost = document.createElement("div");
    freeHost.className = "prog-freebtn-host";
    const freeBtn = document.createElement("button");
    freeBtn.className = "prog-freebtn b3-tooltips b3-tooltips__n";
    freeBtn.setAttribute("aria-label", tomatoI18n.自由摘抄模式);
    freeBtn.innerHTML = icon("iconProgScissors", 14);
    freeBtn.addEventListener("click", () => {
        void actions.freeDigest();
    });
    freeHost.appendChild(freeBtn);
    plugin.addStatusBar({ element: freeHost, position: "left" });

    // ---- 状态栏火苗 ----
    const host = document.createElement("div");
    host.className = "prog-flame-host";
    flameApp = mount(FleetFlame, {
        target: host,
        props: { flame: flameState, onStart: actions.startReading },
    }) as any;
    plugin.addStatusBar({ element: host, position: "left" });

    // ---- 左 Dock 舰队总览 ----
    let panel: any = null;
    plugin.addDock({
        type: FLEET_DOCK_TYPE,
        config: {
            position: "LeftBottom",
            size: { width: 300, height: 520 },
            icon: "iconProgFleet",
            title: tomatoI18n.舰队总览,
        },
        init: (dock: any) => {
            const eleID = newID();
            dock.element.innerHTML = `<div class="fn__flex-1 fn__flex-column prog-fleet-dock"><div id="${eleID}" class="fn__flex-1"></div></div>`;
            panel = mount(DockPanel, {
                target: dock.element.querySelector("#" + eleID),
                props: { panel: panelState, actions, onQuota: setQuota, onRefresh: refreshFleet },
            }) as any;
        },
        destroy() {
            if (panel) {
                unmount(panel);
                panel = null;
            }
        },
    } as any);

    // ---- 刷新调度：30s 全量 + 档位变化联动 ----
    refreshFleet();
    refreshTimer = setInterval(refreshFleet, 30 * 1000);
    quotaSubStop = dailyQuota.subscribe(() => refreshFlame());
}

export function onunloadFleet() {
    if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
    }
    quotaSubStop?.();
    quotaSubStop = null;
    if (flameApp) {
        unmount(flameApp);
        flameApp = null;
    }
}
