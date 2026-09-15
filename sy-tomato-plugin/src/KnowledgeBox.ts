// 知识库面板 Box（knowledgebox 原型期，2026-09-14）：
// dock 面板（KnowledgePanel 双区=同步管理+问答）+ 命令 + 文档树右键「同步到知识库」
// + 间歇自动同步。通道=libs/knowledgeChannel（□3 智谱首发；hash 增量闸在 knowledgeSync）。
// 清理纪律：autoTimer 挂本模块 onunload 导出，index.ts onunload 清单调用（导出助手
// timer 泄漏教训在案——禁用后 interval 继续跑）。
import { DestroyManager } from "./libs/destroyer";
import { events } from "./libs/Events";
import { getTomatoPluginInstance, siyuan } from "./libs/utils";
import { winHotkey } from "./libs/winHotkey";
import { gatedAddCommand } from "./libs/cmdGate";
import { addIfVisible } from "./libs/menuManager";
import { tomatoI18n } from "./tomatoI18n";
import KnowledgePanel from "./KnowledgePanel.svelte";
import { newID } from "stonev5-utils";
import { adaptHotkey } from "siyuan";
import { knowledgeBoxCheckbox, knowledgeAutoSyncMin, knowledgeMenu } from "./libs/stores";
import { mount, unmount } from "svelte";
import { addToSync, inSync, removeFromSync, syncAll } from "./libs/knowledgeSync";
import { createFrontendToolEnv } from "./agentToolBridge";
import { createDefaultChannel } from "./libs/knowledgeChannel";
import { debugLog } from "./libs/logUtils";

export const KnowledgeBox知识库面板 = winHotkey("alt+F10", "知识库面板", "iconCloud", () => tomatoI18n.知识库同步, false, knowledgeMenu)

let dm: DestroyManager;
let autoTimer: ReturnType<typeof setInterval> | null = null;
let lastAutoSync = 0;
const DOCK_TYPE = "dock_KnowledgeBox";

export function initKnowledgeBox() {
    const plugin = getTomatoPluginInstance();
    if (knowledgeBoxCheckbox.get() && !events.isMobile) {
        addDock();
        gatedAddCommand(plugin, KnowledgeBox知识库面板.langKey, {
            langText: KnowledgeBox知识库面板.langText(),
            hotkey: KnowledgeBox知识库面板.m,
            callback: () => { toggleDock(); },
        });
        // 思源右键菜单同步构建：监听回调必须同步 addItem（await 之后菜已渲染完，项进不去）——
        // 加入/移出的名单判断挪进 click（幂等：重复加入跳过、移出不存在的 id 无害）
        events.addListener_open_menu_doctree("2026-9-14 15:30:00知识库同步", (detail) => {
            const ids = [...detail.elements]
                .map(e => (e as HTMLElement).getAttribute("data-node-id"))
                .filter(i => !!i) as string[];
            if (ids.length === 0) return;
            addIfVisible(detail.menu, "m.knowledge.add", {
                label: tomatoI18n.同步到知识库,
                icon: "iconCloud",
                click: async () => {
                    const fresh: string[] = [];
                    for (const id of ids) {
                        if (!(await inSync(id))) {
                            await addToSync(id);
                            fresh.push(id);
                        }
                    }
                    siyuan.pushMsg(fresh.length ? `${tomatoI18n.已加入}（${fresh.length}）` : tomatoI18n.已在同步白名单);
                },
            }, KnowledgeBox知识库面板.menu());
            addIfVisible(detail.menu, "m.knowledge.remove", {
                label: tomatoI18n.移出知识库同步,
                icon: "iconTrashcan",
                click: async () => {
                    await removeFromSync(ids);
                    siyuan.pushMsg(tomatoI18n.已移出);
                },
            }, KnowledgeBox知识库面板.menu());
        });
        startAutoTimer();
    } else {
        dm?.destroyBy();
        stopAutoTimer();
    }
}

function startAutoTimer() {
    stopAutoTimer();
    // 60s 心跳比对「距上次全量同步 ≥ N 分钟」：间隔设置变更 60s 内自然生效，勿重建 timer
    autoTimer = setInterval(async () => {
        const min = parseInt(knowledgeAutoSyncMin.get());
        if (!Number.isFinite(min) || min <= 0) return;
        if (Date.now() - lastAutoSync < min * 60_000) return;
        lastAutoSync = Date.now();
        try {
            const r = await syncAll(createFrontendToolEnv(getTomatoPluginInstance() as any), createDefaultChannel());
            debugLog("knowledge", `auto sync: ${r.ok} ok / ${r.fail} fail / ${r.skip} skip`, "knowledgebox");
        } catch (e: any) {
            debugLog("knowledge", `auto sync error: ${e?.message ?? e}`, "knowledgebox");
        }
    }, 60_000);
}

function stopAutoTimer() {
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
}

export function knowledgeBoxOnunload() {
    stopAutoTimer();
    dm?.destroyBy();
    // doctree 监听常驻 Events Map 同名覆盖（仓内惯例：重载安全，随插件实例销亡）
}

function toggleDock() {
    // dock 已开时命令=聚焦（内核无公开 toggle API，原型先走 open——重复调用内核自去重）
    (getTomatoPluginInstance() as any).openDock?.(DOCK_TYPE) ?? dm;
}

function addDock() {
    dm?.destroyBy()
    dm = new DestroyManager();
    let svelte: any
    const title = KnowledgeBox知识库面板.langText()
    const dock = getTomatoPluginInstance().addDock({
        type: DOCK_TYPE,
        config: {
            index: 5,
            position: "RightBottom",
            size: { width: 0, height: 300 },
            icon: KnowledgeBox知识库面板.icon,
            title,
            hotkey: KnowledgeBox知识库面板.m,
        },
        data: {
        },
        resize() {
        },
        update() {
        },
        destroy() {
            dm?.destroyBy()
        },
        init: (dock: any) => {
            const eleID = newID();
            dock.element.innerHTML = `<div class="fn__flex-1 fn__flex-column">
                    <div class="block__icons">
                        <div class="block__logo">
                            <svg class="block__logoicon"><use xlink:href="#${KnowledgeBox知识库面板.icon}"></use></svg>${title}
                        </div>
                        <span class="fn__flex-1 fn__space"></span>
                        <span data-type="min" class="block__icon b3-tooltips b3-tooltips__sw" aria-label="Min ${adaptHotkey("⌘W")}"><svg><use xlink:href="#iconMin"></use></svg></span>
                    </div>
                    <div id="${eleID}" class="fn__flex-1 fn__flex-column" style="min-height:0"></div>
                </div>`;
            svelte = mount(KnowledgePanel, {
                target: dock.element.querySelector("#" + eleID),
            });
        },
    } as any);
    dm.add("dock", () => dock);
    dm.add("svelte", () => { if (svelte) unmount(svelte); })
}
