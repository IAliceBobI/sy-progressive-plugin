// v5 □6 状态栏火苗 + 左 Dock 舰队总览（视觉方案 docs/prog-v5-visual-design.md §2/§3）。
// 挂载编排 + 刷新调度：动作经 FleetActions 注入（不 import Progressive，防循环依赖——
// 数据侧反向只 import fleetNotify 发信号，本模块 initFleet 订阅后刷新，□7 拆信号与装载）。
// 刷新时机：30s 定时 + fleetNotify 信号（读片/摘抄等数据变化点）+ 面板手动 ♻。

import { mount, unmount } from "svelte";
import { writable } from "svelte/store";
import FleetFlame from "./FleetFlame.svelte";
import WritingFlame from "./WritingFlame.svelte";
import DueBell from "./DueBell.svelte";
import DockPanel from "./DockPanel.svelte";
import { loadFleetSummary, type FleetSummary } from "./fleetData";
import { rollerDebtSummary, rollerTodayWrites, rollerRemainingToday, invalidateTodaysFullCache, type DebtSummary } from "./roller";
import { pickWritingFlameBook } from "./writeBook";
import { latestVisitNoteOfBook } from "./visitNoteQuery";
import { progStorage } from "./ProgressiveStorage";
import { PdigestReviewKey, ReviewKey, dueReviewSQLFor } from "./reviewQueue";
import { onFleetChanged } from "./fleetNotify";
import { dailyQuota } from "../../sy-tomato-plugin/src/libs/stores";
import { icon, siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import { newID } from "stonev5-utils";

export interface FleetActions {
    /** ▶ 开始今日阅读（滚筒下一片） */
    startReading(): any;
    /** □11 自由态上岗（状态栏 ✂ 钮：普通文档浮条到场；在场=生命周期 toggle，见 toggleFreeFloat □3） */
    freeDigest(): any;
    /** 空态主按钮=把当前文档加入渐进阅读 */
    addFirstBook(): any;
    /** 书卡点击=断点续读（开片不删旧） */
    continueReading(bookID: string): any;
    /** 管理书目（旧「查看所有渐进学习文档」表格，□7 收编进面板） */
    manageBooks(): any;
    /** 期1 写作书：新建写作书弹窗（书名+落点笔记本+可选大纲） */
    addWritingBook(): any;
    /** □5 写作火苗点击=直达当前写作书的写作现场（与滚筒调度同源） */
    openWriting(): any;
    /** 打开设置 */
    openSettings(): any;
    /** recite 导流：装了=触发仿写练习，未装=提示 */
    reciteAction(): any;
    /** recite 是否已安装（导流图标亮/灰态） */
    isReciteInstalled(): boolean;
    /** v5 □12：书卡 ✧ 徽章点开=该书重访到期待办列表（完成/推迟/移除，见 reviewMenu.ts）；
     *  期2 bookID 缺省=全局清单（free 源复访的唯一入口） */
    openDueList(ev: { clientX: number; clientY: number }, bookID?: string): any;
    /** 可见性期3 □3：复习计划面板（独立 Dialog，常驻入口不依赖 due>0） */
    openReviewPlan(): any;
    /** need-0924-01：状态栏 ✧ 角标点击=单张到期复访卡片流（完成/推迟/看原文，见 index.openDueCardFlow） */
    openDueFlow(): any;
    /** □8 知识地图：书级地图 Dialog（书卡右键菜单动作入口） */
    openBookMap(bookID: string): any;
    /** 舰队管理 □2：书卡右键菜单四动作（置顶/隐匿=存储纯视觉；忽略/归档复用现成链） */
    togglePinBook(bookID: string, v: boolean): any;
    toggleHideBook(bookID: string, v: boolean): any;
    ignoreBook(bookID: string): any;
    archiveBook(bookID: string): any;
    /** □3 回访频率：书级档位（书 IAL+在册 grow 卡批量跟随，readCurve setBookVisitFreq；
     *  f="l"|"m"|"h"=VisitFreq 字面联合——fleet 基座层不反向依赖曲线模块，形状同源维护） */
    setVisitFreq(bookID: string, f: "l" | "m" | "h"): any;
    /** rollerquota □3 入口①：读完书重置阅读进度（point 归零，分片/摘抄/复习记录不动）
     *  并立即出片 */
    resetReadingPoint(bookID: string): any;
    /** progfeatpool 件4：批量整理摘抄（对该书摘抄清单开选择器：勾选→目标写作书→
     *  批量复制入池/换籍，见 Progressive.openBatchPoolDialog） */
    openBatchPool(bookID: string): any;
}

export const FLEET_DOCK_TYPE = "prog-fleet-dock";

/** 火苗数据（状态栏消费，轻查询） */
export const flameState = writable<DebtSummary | null>(null);
/** 到期摘抄数（火苗 tooltip 尾行消费，期2；非阻塞提示，不占 quota 不进欠债） */
export const digestDueState = writable(0);

/** need-0924-01 卡片流乐观账：动作已落盘但 attributes SQL 索引秒级窗内 refreshFlame 会拿
 *  旧值回写覆盖计数（造数实测乐观 set 与信号轮竞速不可赌）——乐观窗内 refreshFlame 让位
 *  （digestDueEffective 滤旧值），过期或下轮定时自然校准真值 */
let dueOverride: { value: number; until: number } | null = null;
export function setDigestDueOverride(n: number, ttlMs = 8000) {
    dueOverride = { value: n, until: Date.now() + ttlMs };
    digestDueState.set(n);
}
export function digestDueEffective(n: number): number {
    if (dueOverride && Date.now() < dueOverride.until) return dueOverride.value;
    dueOverride = null;
    return n;
}
/** 今日待轮转书数（火苗 tooltip 尾行消费，650189 09-23 帖；null=查询失败/未及不占行） */
export const flameRemaining = writable<number | null>(null);
/** 面板数据（Dock 消费，重查询） */
export const panelState = writable<FleetSummary | null>(null);

/** □5 写作火苗数据（WritingFlame 消费）：null=无写作书不渲染。
 *  today=今日已写片数（写作书在 DayLogData.b 里的计数拆出独立显示，滚筒计数同权）；
 *  slotTitle=pickWritingTarget 命中槽的文档标题（null=无未定稿槽，tooltip 换素材/完稿
 *  口径）；materialUnread=期B 槽空态的未读素材数（tooltip 素材态分叉依赖）；
 *  notePreview=□4 该书最新回访留言前半句（null=无留言，tooltip 不加行） */
export interface WritingFlameData {
    bookID: string;
    bookName: string;
    today: number;
    slotTitle: string | null;
    materialUnread: number;
    notePreview?: string | null;
}
export const writingFlameState = writable<WritingFlameData | null>(null);

let refreshTimer: ReturnType<typeof setInterval> | null = null;
let refreshing = false;
let flameApp: any = null;
let wflameApp: any = null;
let dueBellApp: any = null;
let quotaSubStop: (() => void) | null = null;
let notifySubStop: (() => void) | null = null;

export async function refreshFlame() {
    try {
        // 期2 □2 B 盲区双源化：到期摘抄数=pdigest 文档级 + think 块级（两类键行不重叠，计数直加；
        // dueReviewSQLFor 只回到期行，done/垃圾值被 q#/s# 前缀自然排除）
        const now = Date.now();
        const [debt, dueRows, thinkRows, remaining] = await Promise.all([
            rollerDebtSummary(),
            siyuan.sql(dueReviewSQLFor(PdigestReviewKey, now)) as Promise<any[]>,
            siyuan.sql(dueReviewSQLFor(ReviewKey, now)) as Promise<any[]>,
            rollerRemainingToday().catch(() => null),
        ]);
        flameState.set(debt);
        digestDueState.set(digestDueEffective((dueRows ?? []).length + (thinkRows ?? []).length));
        flameRemaining.set(remaining);
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

/** □5 写作火苗刷新：书选择走 pickWritingFlameBook（与打开侧共用防漂移）；
 *  今日已写=DayLogData.w 中写作书集合的计数求和（火苗分家 w 分池：写作活动
 *  独立记账，不进阅读 quota 池 b）。并发闸与 refreshPanel 同款（review P2-1：防慢旧轮
 *  在新轮 set(null) 后回写旧值）。槽标题查失败回落 [point]（review P2-3：null 严格
 *  留给「真无未定稿槽」，tooltip 文案分叉依赖它） */
let wrefreshing = false;
export async function refreshWritingFlame() {
    if (wrefreshing) return;
    wrefreshing = true;
    try {
        const hit = await pickWritingFlameBook();
        if (!hit) {
            writingFlameState.set(null);
            return;
        }
        const reads = await rollerTodayWrites();
        const infos = progStorage.booksInfos();
        // w 分池（火苗分家）：写作活动改记 DayLogData.w（退出阅读 quota 池 b）——
        // 写作书求和口径不变只换数据源；老块无 w 读作 {}，数字从今日起重新累积
        const today = Object.entries(infos).reduce((s, [id, info]) =>
            info?.writing && !info.ignored && !info.archived && progStorage.isRegisteredBook(id)
                ? s + (reads[id] ?? 0) : s, 0);
        let slotTitle: string | null = null;
        if (hit.target) {
            const row = await siyuan.sqlOne(`select content from blocks where type='d' and id='${hit.target.docID}'`);
            slotTitle = row?.content ?? `[${hit.target.point}]`;
        }
        // □4 该书最新回访留言前半句（null=无留言不加行；查询失败静默不阻塞火苗）
        const notePreview = await latestVisitNoteOfBook(hit.bookID).catch(() => null);
        writingFlameState.set({ bookID: hit.bookID, bookName: hit.bookName, today, slotTitle, materialUnread: hit.materialUnread, notePreview });
    } catch (e) {
        console.error("fleet refreshWritingFlame failed", e);
    } finally {
        wrefreshing = false;
    }
}

export async function refreshFleet() {
    await Promise.all([refreshFlame(), refreshWritingFlame(), refreshPanel()]);
}

/** 档位切换（Dock 今日状态区胶囊）：落盘 + 立即重刷（今天的 q 以实时档位覆盖）。
 *  progfeatpool 件2 边界⑥：达量集 1s TTL 缓存随调档立即失效——免窗口内按旧档判
 *  「今日已读满」（quota 现取已在 todaysFullIDsImpl 保证，此处只清按旧档算出的值） */
export async function setQuota(n: number) {
    await dailyQuota.write(String(n));
    invalidateTodaysFullCache();
    await refreshFleet();
}

/** □3 管理书目右键：initFleet 注入的 actions 全局引用（ShowAllBooks 弹窗复用
 *  openBookMenu 的同一动作集，单一事实源不重复组配；reload 重跑模块顶层=引用随代
 *  重建无跨代陈旧，onunloadFleet 置 null 防悬挂） */
let _fleetActions: FleetActions | null = null;
export function fleetActionsRef(): FleetActions | null {
    return _fleetActions;
}

export function initFleet(plugin: any, actions: FleetActions) {
    _fleetActions = actions;
    // ---- □11 状态栏 ✂ 钮（火苗旁，不复用火苗）：上岗/浮条生命周期 toggle（□3 二击=收缩/消失） ----
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

    // ---- need-0924-01 状态栏 ✧ 到期复访角标（写作火苗与 ✂ 之间：注册序=✂→✧→写作→
    //      阅读，afterbegin 后注册者更靠左，最终左→右=阅读火苗、写作火苗、✧、✂）。
    //      0 条灰淡常驻（DueBell 组件内 data-on 分态）；计数源=digestDueState ----
    const bhost = document.createElement("div");
    bhost.className = "prog-duebell-host";
    dueBellApp = mount(DueBell, {
        target: bhost,
        props: { due: digestDueState, onOpen: actions.openDueFlow },
    }) as any;
    plugin.addStatusBar({ element: bhost, position: "left" });

    // ---- □5 状态栏写作火苗（阅读火苗与 ✂ 之间：先于阅读火苗注册=靠右一位；afterbegin
    //      插头部，最终左→右=阅读火苗、写作火苗、✂）。无写作书组件内 {#if} 不渲染 ----
    const whost = document.createElement("div");
    whost.className = "prog-flame-host";
    wflameApp = mount(WritingFlame, {
        target: whost,
        props: { flame: writingFlameState, onOpen: actions.openWriting },
    }) as any;
    plugin.addStatusBar({ element: whost, position: "left" });

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
            // □7 高度链修复：须挂 fn__flex（display:flex）——dock.element 是 block（高=面板
            // 尺寸），中间层缺 flex 时 height:auto 被书卡内容撑开溢出挂载点、footer/主按钮
            // 沉入 dock 滚动区；配套 .prog-fleet-dock 样式（height:100%+子级 min-height:0）
            dock.element.innerHTML = `<div class="fn__flex fn__flex-column fn__flex-1 prog-fleet-dock"><div id="${eleID}" class="fn__flex-1"></div></div>`;
            panel = mount(DockPanel, {
                target: dock.element.querySelector("#" + eleID),
                props: { panel: panelState, actions, onQuota: setQuota, onRefresh: refreshFleet, writing: writingFlameState },
            }) as any;
        },
        destroy() {
            if (panel) {
                unmount(panel);
                panel = null;
            }
        },
    } as any);

    // ---- 刷新调度：30s 全量 + 档位变化联动 + 数据侧信号（□7 拆 fleetNotify，
    //      notifyFleetChanged 等信号在 initFleet 前到达=无订阅者丢弃，等价旧空刷） ----
    notifySubStop = onFleetChanged(() => refreshFleet());
    refreshFleet();
    refreshTimer = setInterval(refreshFleet, 30 * 1000);
    quotaSubStop = dailyQuota.subscribe(() => refreshFlame());
}

export function onunloadFleet() {
    _fleetActions = null;
    if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
    }
    notifySubStop?.();
    notifySubStop = null;
    quotaSubStop?.();
    quotaSubStop = null;
    if (flameApp) {
        unmount(flameApp);
        flameApp = null;
    }
    if (wflameApp) {
        unmount(wflameApp);
        wflameApp = null;
    }
    if (dueBellApp) {
        unmount(dueBellApp);
        dueBellApp = null;
    }
}
