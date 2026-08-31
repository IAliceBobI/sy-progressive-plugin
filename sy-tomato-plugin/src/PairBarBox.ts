// PairBarBox —— 块配对接力浮条控制器（□2 V1 + □3 V2）。
// 职责：四入口（快捷键/状态栏按钮/内容右键/块 icon 右键）→ 同一触发器推进一步；
// 现读 selectedDivs 喂给 pairBarState 纯转移；执行时解析源 DOM 调 6 个现有实现；
// V2 增：拖 chip 定目标（HTML5 drag，document capture 段，渐进 □12 先例）+ 引导模式
// （click_editorcontent 驱动三步自动推进）；执行链统一 attemptRun（✓/drop/引导点目标共用，
// 含源=目标祖先/子孙拦截）。浮条挂 body（命令式组件，三层防线清理）。
// 设计定稿：memory pair-block-tools-campaign（方案 A 接力浮条）。
import { IProtyle, getAllEditor } from "siyuan";
import { mount, unmount } from "svelte";
import { get, writable } from "svelte/store";
import { events, EventType } from "./libs/Events";
import { DATA_NODE_ID } from "./libs/gconst";
import {
    PAIR_FUNCS,
    buildTransportOps,
    initialPairState,
    isRelatedTarget,
    pairCancel,
    pairConfirmTarget,
    pairPickFunc,
    pairSetSrcPreview,
    pairToggleCopy,
    pairTrigger,
    type PairErr,
    type PairFuncID,
    type PairState,
} from "./libs/pairBarState";
import {
    bilinkWithInsertingRefs,
    linkTwoElementsWithRef,
    siyuan,
} from "./libs/utils";
import * as utils from "./libs/utils";
import {
    cpBoxCheckbox,
    linkBoxCheckbox,
    linkBoxSyncBlock,
    pairBarDefaultFunc,
    pairBarEnabled,
    pairBarEntryHotkey,
    pairBarEntryIconMenu,
    pairBarEntryMenu,
    pairBarEntryStatus,
    pairBarGuideMode,
} from "./libs/stores";
import { BaseTomatoPlugin } from "./libs/BaseTomatoPlugin";
import { lastVerifyResult } from "./libs/user";
import { winHotkey } from "./libs/winHotkey";
import { addIfVisible } from "./libs/menuManager";
import { tomatoI18n } from "./tomatoI18n";
import { linkBox } from "./LinkBox";
import PairBar from "./PairBar.svelte";

// 默认键位 ⌥⇧V：四插件 winHotkey 全量 + 官方 keymap 排除后 alt+shift 系唯一空位
// （⌥⇧P 被官方命令面板占用，其余字母/数字/标点均被占；键位可在思源键位表改）
export const PairBar触发 = winHotkey("alt+shift+v", "pairBarTrigger", "iconPairTomato", () => tomatoI18n.块配对浮条);

const BAR_ROOT_ID = "tomato-pair-bar-root";
const GB_CLEANUP_KEY = "tomatoPairBarCleanup";
const DROP_HINT_CLS = "tomato-pairbar-droptarget";

type PairBarApi = {
    pick: (id: PairFuncID) => void;
    confirm: () => void;
    cancel: () => void;
    toggleCopy: () => void;
    dragStart: () => void;
    dragEnd: () => void;
};

class PairBarBox {
    private plugin: BaseTomatoPlugin;
    private state = writable<PairState>(initialPairState);
    private target: HTMLElement | null = null;
    private app: any = null;
    private statusBtn: HTMLElement | null = null;
    private unsubs: (() => void)[] = [];
    /** attemptRun 重入哨兵（✓ 钮/触发键/drop/引导点目标多入口并发防双重执行） */
    private busy = false;
    /** 我们的 chip 拖拽中（document dragover/drop 只在此态响应，内核自家拖拽零干扰） */
    private dragging = false;
    /** dragstart 时预解析的源 DOM 缓存（dragover 高亮判定用；光标拖拽中不动，解析一次够） */
    private dragSrc: (HTMLElement | null)[] | null = null;
    /** 当前高亮的目标块 */
    private dropHint: HTMLElement | null = null;

    async onload(plugin: BaseTomatoPlugin) {
        this.plugin = plugin;

        // 入口 1：快捷键（命令恒注册保键位表可改；入口开关只拦行为）
        this.plugin.addCommand({
            langKey: PairBar触发.langKey,
            langText: PairBar触发.langText(),
            hotkey: PairBar触发.m,
            callback: () => {
                if (!pairBarEntryHotkey.get()) return;
                void this.trigger();
            },
        });

        // 入口 2：状态栏按钮
        this.mountStatusButton();

        // 入口 3：内容右键菜单
        this.plugin.eventBus.on(EventType.open_menu_content, ({ detail }) => {
            if (!pairBarEntryMenu.get()) return;
            this.addMenuItem(detail);
        });

        // 入口 4：块 icon 右键菜单
        this.plugin.eventBus.on(EventType.click_blockicon, ({ detail }) => {
            if (!pairBarEntryIconMenu.get()) return;
            this.addMenuItem(detail);
        });

        // □3 V2 引导模式：点编辑器内容区自动推进——pick 态点块=现读更新预锁源（①），
        // target 态点块=以该块为目标走统一执行链（③）。浮条在 body 下不在编辑器内，
        // 点浮条自身不触发本事件，天然隔离。
        this.plugin.eventBus.on(EventType.click_editorcontent, ({ detail }) => {
            if (!pairBarGuideMode.get()) return;
            const cur = get(this.state);
            if (cur.phase !== "pick" && cur.phase !== "target") return;
            const protyle = (detail as any)?.protyle ?? this.curProtyle();
            if (!protyle) return;
            if (cur.phase === "pick") void this.updateSrcPreview(protyle);
            else void this.guideConfirm(protyle);
        });
    }

    onunload() {
        this.hideBar();
        delete (globalThis as any)[GB_CLEANUP_KEY];
        // SiYuan addStatusBar 只 push 不移除，同步摘防 detached 节点驻留（TomatoClock 先例）
        this.statusBtn?.remove();
        const arr = (this.plugin as any)?.statusBarIcons as Element[];
        const i = arr?.indexOf(this.statusBtn ?? null) ?? -1;
        if (i >= 0) arr.splice(i, 1);
        this.statusBtn = null;
        this.unsubs.forEach(u => u());
        this.unsubs = [];
    }

    private addMenuItem(detail: any) {
        if (!pairBarEnabled.get()) return;
        addIfVisible(detail?.menu, PairBar触发.langKey, {
            icon: "iconPairTomato",
            accelerator: PairBar触发.m,
            label: PairBar触发.langText(),
            click: () => void this.trigger(),
        });
    }

    private mountStatusButton() {
        const t = document.createElement("template");
        t.innerHTML = `<div class="toolbar__item ariaLabel" aria-label="${tomatoI18n.块配对浮条}"><svg><use xlink:href="#iconPairTomato"></use></svg></div>`;
        const el = t.content.firstElementChild as HTMLElement;
        el.addEventListener("click", () => {
            if (!pairBarEntryStatus.get()) return;
            void this.trigger();
        });
        this.plugin.addStatusBar({ element: el, position: "left" });
        this.statusBtn = el;
        // 开关正交：总开关/入口开关即时控制显隐（免 reload）
        const sync = () => {
            el.style.display = pairBarEnabled.get() && pairBarEntryStatus.get() ? "" : "none";
        };
        this.unsubs.push(pairBarEnabled.subscribe(sync), pairBarEntryStatus.subscribe(sync));
        // 总开关中途关闭：已开的浮条即时收（状态栏钮已有 sync，浮条本体补同款联动）
        this.unsubs.push(pairBarEnabled.subscribe(v => { if (!v) this.hideBar(); }));
        sync();
    }

    /** 同一触发器推进一步（快捷键/状态栏/菜单共用） */
    async trigger() {
        if (!pairBarEnabled.get()) return;
        const cur = get(this.state);
        if (cur.phase === "target") {
            await this.confirmTarget();
            return;
        }
        if (cur.phase === "pick") return; // pick 态触发键 no-op（点图标推进），先于 protyle 校验免误报
        const protyle = this.curProtyle();
        if (!protyle) {
            await siyuan.pushMsg(tomatoI18n.请先打开文档);
            return;
        }
        const ev = await this.readEv(protyle);
        const r = pairTrigger(cur, ev, {
            defaultFunc: (pairBarDefaultFunc.get() || "") as PairFuncID | "",
            gates: this.gates(),
            vip: lastVerifyResult() === true,
        });
        if (r.err) await this.toastErr(r.err, r.attemptFunc ?? r.state.func);
        if (r.state.phase === "idle") {
            this.hideBar();
        } else {
            this.state.set(r.state);
            this.showBar();
        }
    }

    /** 选功能态点功能图标（源取此刻新鲜读，覆盖触发时预锁） */
    async pick(funcID: PairFuncID) {
        const cur = get(this.state);
        if (cur.phase !== "pick") return;
        const protyle = this.curProtyle();
        if (!protyle) {
            await siyuan.pushMsg(tomatoI18n.请先打开文档);
            return;
        }
        const ev = await this.readEv(protyle);
        const r = pairPickFunc(cur, funcID, ev, { gates: this.gates(), vip: lastVerifyResult() === true });
        if (r.err) {
            await this.toastErr(r.err, funcID);
            return;
        }
        this.state.set(r.state);
    }

    /** 等目标态确认（目标块上再触发 / 点 ✓ 同款）：读当前光标块为目标 */
    async confirmTarget() {
        const protyle = this.curProtyle();
        if (!protyle) {
            await siyuan.pushMsg(tomatoI18n.请先打开文档);
            return;
        }
        const { selected } = await events.selectedDivs(protyle);
        await this.attemptRun(selected?.[0] ?? null, protyle);
    }

    /** 统一执行链（□3 V2）：✓ 钮/触发键/drop/引导点目标四入口共用。
     *  纯检查（noTarget/sameTarget）→ 源解析 → 祖先/子孙拦截（□2 评审转出①）→ 收浮条执行。
     *  busy 哨兵防多入口并发；拦截类失败保持浮条（用户换目标重试），源不可用收浮条（同 V1 行为）。 */
    private async attemptRun(target: HTMLElement | null, protyle: IProtyle) {
        const cur = get(this.state);
        if (cur.phase !== "target" || this.busy) return;
        const targetID = target?.getAttribute(DATA_NODE_ID);
        const r = pairConfirmTarget(cur, { ids: targetID ? [targetID] : [] }, {});
        if (r.err) {
            await this.toastErr(r.err, cur.func);
            return;
        }
        this.busy = true;
        try {
            const srcDivs = await this.resolveSrcDivs(cur);
            if (srcDivs.some(d => !d)) {
                this.state.set(initialPairState);
                this.hideBar();
                await siyuan.pushMsg(tomatoI18n.源块不可用);
                return;
            }
            // 源=目标的祖先/子孙（如源=超级块、目标=其子块）：ID 相等检查抓不到，
            // 不拦会让 transport 把子块 move 进自己祖先（□2 评审转出①）
            if (isRelatedTarget(srcDivs as HTMLElement[], target)) {
                await siyuan.pushMsg(tomatoI18n.目标与源相同);
                return;
            }
            // 先收浮条再执行（执行可能慢，状态条不再响应）
            this.state.set(initialPairState);
            this.hideBar();
            try {
                const ok = await this.executeWith(cur, srcDivs as HTMLElement[], target, protyle);
                if (ok) await siyuan.pushMsg(tomatoI18n.配对完成);
                else await siyuan.pushMsg(tomatoI18n.源块不可用);
            } catch (e) {
                console.error("[pairBar] execute failed:", e);
                await siyuan.pushMsg(tomatoI18n.源块不可用);
            }
        } finally {
            this.busy = false;
        }
    }

    /** 引导模式 target 态：点目标块即确认（读光标块走统一执行链） */
    private async guideConfirm(protyle: IProtyle) {
        const { selected } = await events.selectedDivs(protyle);
        await this.attemptRun(selected?.[0] ?? null, protyle);
    }

    /** 引导模式 pick 态：点块现读更新预锁源（纯展示层，不改状态机转移） */
    private async updateSrcPreview(protyle: IProtyle) {
        const cur = get(this.state);
        if (cur.phase !== "pick") return;
        const ev = await this.readEv(protyle);
        this.state.set(pairSetSrcPreview(cur, ev));
    }

    cancel() {
        this.state.set(pairCancel(get(this.state)));
        this.hideBar();
    }

    toggleCopy() {
        this.state.update(pairToggleCopy);
    }

    // ---------------- 拖 chip 定目标（□3 V2，HTML5 drag，渐进 □12 先例） ----------------

    /** chip dragstart（组件回调）：预解析源 DOM 缓存——dragover 高亮判定高频调用，
     *  拖拽中光标不动解析结果稳定；含 null 项无妨（isRelatedTarget 内防御） */
    dragStart() {
        this.dragging = true;
        const cur = get(this.state);
        if (cur.phase !== "target") return;
        void this.resolveSrcDivs(cur).then(divs => { this.dragSrc = divs; });
    }

    dragEnd() {
        this.dragging = false;
        this.dragSrc = null;
        this.setDropHint(null);
    }

    /** dragover/drop 共用的目标判定：closest 块 → 限激活编辑器内（跨页签/文档 drop
     *  无效，设计拍板跨文档走快捷键）→ 排除源亲缘块（源上不高亮） */
    private dropCandidate(ev: DragEvent): HTMLElement | null {
        const t = (ev.target as Element)?.closest?.("div[data-node-id]") as HTMLElement | null;
        if (!t) return null;
        const wysiwyg = this.curProtyle()?.wysiwyg?.element;
        if (!wysiwyg || !wysiwyg.contains(t)) return null;
        if (this.dragSrc && isRelatedTarget(this.dragSrc.filter(Boolean) as HTMLElement[], t)) return null;
        return t;
    }

    private setDropHint(el: HTMLElement | null) {
        if (this.dropHint === el) return;
        this.dropHint?.classList.remove(DROP_HINT_CLS);
        this.dropHint = el;
        el?.classList.add(DROP_HINT_CLS);
    }

    /** document capture 段：drop 目标在 protyle 内，须先于内核自家 drop handler 看到；
     *  仅自己 chip 拖拽中响应（内核块拖拽/外部文件拖入零干扰放行） */
    private onDocDragOver = (ev: DragEvent) => {
        if (!this.dragging) return;
        const cand = this.dropCandidate(ev);
        this.setDropHint(cand);
        if (cand) {
            ev.preventDefault();
            ev.stopPropagation();
            ev.dataTransfer!.dropEffect = "move";
        }
    };

    private onDocDrop = (ev: DragEvent) => {
        if (!this.dragging) return;
        const cand = this.dropCandidate(ev);
        if (cand) {
            ev.preventDefault();
            ev.stopPropagation();
            const protyle = this.curProtyle();
            this.dragEnd();
            if (protyle) void this.attemptRun(cand, protyle);
        } else {
            this.dragEnd();
        }
    };

    /** dragend 兜底（组件内 ondragend 为主；Esc 取消拖拽等旁路也走这） */
    private onDocDragEnd = () => {
        if (this.dragging) this.dragEnd();
    };

    /** 源块 DOM 执行时现解析：页面活副本优先（跨文档页签可能已切），内核兜底；
     *  多命中（同文档双开视图）用光标锚定选副本——命中滞后副本会把旧内容写回内核（resolveSuperDiv 先例） */
    private async resolveSrcDivs(st: PairState): Promise<(HTMLElement | null)[]> {
        const srcDivs: (HTMLElement | null)[] = [];
        for (const id of st.srcIDs) {
            const hits = [...document.querySelectorAll(`div[data-node-id="${id}"]`)] as HTMLElement[];
            let live = hits[0];
            const anchor = getSelection()?.anchorNode;
            if (anchor) {
                const hit = hits.find(d => d.contains(anchor));
                if (hit) live = hit;
            }
            srcDivs.push(live ?? (await utils.getBlockDiv(id))?.div);
        }
        return srcDivs;
    }

    private async executeWith(st: PairState, srcDivs: HTMLElement[], target: HTMLElement, protyle: IProtyle): Promise<boolean> {
        const spec = PAIR_FUNCS.find(f => f.id === st.func);
        if (!spec || !target) return false;
        const useAll = spec.multiSrc ? srcDivs : [srcDivs[0]];
        switch (st.func) {
            case "bilink":
                await linkBox.addLnkTwoDivs(protyle, useAll[0], target);
                break;
            case "embedBilink":
                await linkBox.addEmbedLnkTwoDivs(protyle, useAll, target);
                break;
            case "refOnly":
                await linkTwoElementsWithRef(useAll[0], target, protyle);
                break;
            case "insRefs":
                await bilinkWithInsertingRefs(useAll[0], target, protyle);
                break;
            case "sync":
                await linkBox.addSyncLink(protyle, useAll, target);
                break;
            case "transport":
                await this.transport(useAll, target, st.copyMode);
                break;
        }
        return true;
    }

    /** 搬运：源块范围 → 目标块后（复制=cloneCleanDiv 换新 ID 插入，活 DOM 原块不动——P0；
     *  移动=transMoveBlocksAfter 搬走保序）。复用 moveBlocksUtil 的构件，aacc 标记链路不进浮条 */
    private async transport(srcDivs: HTMLElement[], target: HTMLElement, copy: boolean) {
        const targetID = target.getAttribute(DATA_NODE_ID);
        if (!targetID) return;
        const ops = buildTransportOps(srcDivs, targetID, copy, {
            insertAfter: (htmls, id) => siyuan.transInsertBlocksAfter(htmls, id),
            moveAfter: (ids, id) => siyuan.transMoveBlocksAfter(ids, id),
        });
        await siyuan.transactions(ops);
    }

    private async readEv(protyle: IProtyle) {
        const { selected } = await events.selectedDivs(protyle);
        const ids = ((selected ?? []).map(d => d.getAttribute(DATA_NODE_ID)).filter(Boolean)) as string[];
        const summary = ids.length > 0 ? this.summaryOf(selected[0]) : "";
        return { ids, summary };
    }

    /** 源摘要：剥锚点链接 span（互链执行后块内会带 [->*] 标记，混进 chip 是噪音） */
    private summaryOf(div: HTMLElement) {
        const editable = utils.getContenteditableElement(div) as HTMLElement | null;
        const c = (editable ?? div).cloneNode(true) as HTMLElement;
        c.querySelectorAll("span[data-type=\"a\"]").forEach(e => e.parentElement?.removeChild(e));
        return (c.textContent ?? "").trim().slice(0, 24);
    }

    /** 当前编辑器：events 绑定优先（热路径）；冷启动（?id= 直开未点击）events 未绑时回落
     *  getAllEditor——光标锚定优先（单 wnd 多页签时两个 protyle 同属激活 wnd，按 wnd 判
     *  恒取第一个会拿错文档——光标所在编辑器才是真激活，resolveSrcDivs 同款思想），
     *  无光标（冷启动未点击）再退 wnd 激活判定（旧命令走 editorCallback 由思源递 protyle，
     *  浮条走 callback 须自取——冷启动触发浮条直接 toast 的实锤修复） */
    private curProtyle(): IProtyle | undefined {
        const fromEvents = events.protyle?.protyle;
        if (fromEvents) return fromEvents;
        const editors = getAllEditor();
        const anchor = getSelection()?.anchorNode;
        if (anchor) {
            const byCursor = editors.find(p => p.protyle?.element?.contains(anchor));
            if (byCursor) return byCursor.protyle;
        }
        const active = editors.find(p => p.protyle?.element?.closest(".layout__wnd--active"));
        return (active ?? editors[0])?.protyle;
    }

    private gates() {
        return {
            linkBoxCheckbox: linkBoxCheckbox.get(),
            linkBoxSyncBlock: linkBoxSyncBlock.get(),
            cpBoxCheckbox: cpBoxCheckbox.get(),
        };
    }

    private labelOf(func?: PairFuncID | null) {
        const spec = PAIR_FUNCS.find(f => f.id === func);
        return spec ? (tomatoI18n as any)[spec.labelKey] as string : "";
    }

    private async toastErr(err: PairErr, func?: PairFuncID | null) {
        switch (err) {
            case "noSource":
            case "noTarget":
                await siyuan.pushMsg(tomatoI18n.请先选中块);
                break;
            case "sameTarget":
                await siyuan.pushMsg(tomatoI18n.目标与源相同);
                break;
            case "funcGated":
                await siyuan.pushMsg(tomatoI18n.功能未开启(this.labelOf(func)));
                break;
            case "vipGated":
                await siyuan.pushMsg(tomatoI18n.需要Pro(this.labelOf(func)));
                break;
        }
    }

    // ---------------- 浮条挂载（命令式 body 组件，三层防线清理） ----------------

    private onKeydown = (e: KeyboardEvent) => {
        if (e.key === "Escape" && get(this.state).phase !== "idle") {
            this.cancel();
        }
    };

    private showBar() {
        if (this.target) return;
        // 防线 1：globalThis 跨代——仅清「别的实例」的残留（同一实例上一次 hideBar 已自清，
        // 无条件回调会把 trigger 刚设好的 phase 重置回 idle，浮条挂成空壳——□2 e2e 实锤）
        const prev = (globalThis as any)[GB_CLEANUP_KEY] as { tag?: unknown; fn?: () => void } | undefined;
        if (prev && prev.tag !== this) {
            try { prev.fn?.(); } catch { /* 跨代残留已 detached，清不掉无妨 */ }
        }
        // 防线 2：固定 id 清残留（reload 未走 onunload 的 DOM 尸体）
        document.getElementById(BAR_ROOT_ID)?.remove();
        this.target = document.body.appendChild(document.createElement("div"));
        this.target.id = BAR_ROOT_ID;
        const api: PairBarApi = {
            pick: id => void this.pick(id),
            confirm: () => void this.confirmTarget(),
            cancel: () => this.cancel(),
            toggleCopy: () => this.toggleCopy(),
            dragStart: () => this.dragStart(),
            dragEnd: () => this.dragEnd(),
        };
        this.app = mount(PairBar, {
            target: this.target,
            props: {
                pairState: this.state,
                api,
                hotkeyText: PairBar触发.w(),
            },
        });
        document.addEventListener("keydown", this.onKeydown, true);
        // 拖 chip：document capture 段（drop 目标在 protyle 内，先于内核 handler 看到）
        document.addEventListener("dragover", this.onDocDragOver, true);
        document.addEventListener("drop", this.onDocDrop, true);
        document.addEventListener("dragend", this.onDocDragEnd, true);
        (globalThis as any)[GB_CLEANUP_KEY] = { tag: this, fn: () => this.hideBar() };
    }

    private hideBar() {
        document.removeEventListener("keydown", this.onKeydown, true);
        document.removeEventListener("dragover", this.onDocDragOver, true);
        document.removeEventListener("drop", this.onDocDrop, true);
        document.removeEventListener("dragend", this.onDocDragEnd, true);
        this.dragEnd(); // 拖拽中途被收（Esc/总开关关闭）：清高亮与拖拽态
        if (this.app) {
            try { unmount(this.app); } catch { /* 跨代残留已 detached，销毁失败无妨 */ }
            this.app = null;
        }
        this.target?.remove();
        document.getElementById(BAR_ROOT_ID)?.remove();
        this.target = null;
        this.state.set(initialPairState);
    }
}

export const pairBarBox = new PairBarBox();
