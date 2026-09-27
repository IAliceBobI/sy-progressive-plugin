// need-0926-06 本书槽/入槽选槽三处同构「槽树面板」：树形折叠（默认只开第一层）+
// 折叠状态按书记忆（petal 设置 slotTreeExpanded）+ 一键收回（复位到只开第一层）+
// 顶部搜索框过滤槽名。三处现场共用本构造器（Progressive.ts openWritingSlotList /
// openBatchSlotMenu / openSlotMenuCommon），点击直达语义不变（onPick 回调=原 click 体）。
// 底座=思源 Menu：面板走 type:"empty" 自画 item（内核 MenuItem 对 empty 类型建 div
// 非 button，官方式先例=openDocTagMenu 的 input-in-menu；bind 内事件委托一次挂全）。
// 纯函数核（visibleTreeSlots/槽匹配）单测锁定；DOM 接线行为归 6810 实例手验。
import { IMenu } from "siyuan";
import { escapeHtml } from "./progData";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import { slotTreeExpanded } from "../../sy-tomato-plugin/src/libs/stores";

/** 面板槽行（WritingTreeSlot / WritingSlotTarget.slots 同构子集——title 已剥 [N] 前缀） */
export interface TreeSlotRow {
    point: number;
    docID: string;
    title: string;
    depth: number;
    parentID: string;
}

/** docID → 直接子槽集（树序即传入序）；parentID 不在列表（定稿被过滤/书根）的槽视为根 */
export function slotChildrenOf(slots: TreeSlotRow[]): Map<string, TreeSlotRow[]> {
    const out = new Map<string, TreeSlotRow[]>();
    for (const s of slots) {
        const arr = out.get(s.parentID) ?? [];
        arr.push(s);
        out.set(s.parentID, arr);
    }
    return out;
}

/** 可见行计算（纯函数）：
 *  - query 空=折叠态渲染——槽可见 ⟺ 祖先链全部在 expanded 集（根槽恒可见=默认只开第一层）；
 *  - query 非空=搜索态——槽名大小写不敏感子串匹配，匹配行+其祖先链可见（折叠态被忽略，
 *    祖先只作上下文锚点），清空搜索词即回折叠态渲染 */
export function visibleTreeSlots(slots: TreeSlotRow[], expanded: Set<string>, query: string): TreeSlotRow[] {
    const byID = new Map(slots.map(s => [s.docID, s]));
    const ancestorsVisible = (s: TreeSlotRow): boolean => {
        let p = byID.get(s.parentID);
        while (p) {
            if (!expanded.has(p.docID)) return false;
            p = byID.get(p.parentID);
        }
        return true;
    };
    const q = query.trim().toLowerCase();
    if (!q) return slots.filter(s => ancestorsVisible(s));
    const keep = new Set<string>();
    for (const s of slots) {
        if (!s.title.toLowerCase().includes(q)) continue;
        keep.add(s.docID);
        let p = byID.get(s.parentID);
        while (p) {
            keep.add(p.docID);
            p = byID.get(p.parentID);
        }
    }
    return slots.filter(s => keep.has(s.docID));
}

// ============ 折叠记忆（按书；petal 设置 slotTreeExpanded：Record<bookID, 展开槽 id[]>） ============

function expandedRecord(): Record<string, string[]> {
    const v = slotTreeExpanded.get() as unknown;
    return v && typeof v === "object" ? v as Record<string, string[]> : {};
}

/** 读某书展开集（记忆缺省/值形坏=空集=只开第一层；stale id 渲染时自然无害） */
export function expandedSlotSet(bookID: string): Set<string> {
    const arr = expandedRecord()[bookID];
    return new Set(Array.isArray(arr) ? arr : []);
}

/** 落盘某书展开集（空集=删键回默认；.write=整文件落盘，settings.md 口径——用户可见
 * 的折叠动作必须持久，不可以用 .set 搭车） */
export function persistSlotExpanded(bookID: string, ids: Iterable<string>): void {
    const rec = { ...expandedRecord() };
    const arr = [...ids];
    if (arr.length === 0) delete rec[bookID];
    else rec[bookID] = arr;
    slotTreeExpanded.write(rec as never);
}

/** 一键收回：清该书折叠记忆（下次打开=默认只开第一层） */
export function resetSlotTreeMemory(bookID: string): void {
    persistSlotExpanded(bookID, []);
}

// ============ 面板构造器（三处共用） ============

export interface SlotTreePanelOptions {
    /** 折叠记忆归属书（按书记忆的键） */
    bookID: string;
    slots: TreeSlotRow[];
    /** 行内追加标记（已转义 HTML；本书槽的「已定稿/当前」等） */
    rowBadge?: (s: TreeSlotRow) => string;
    /** 行序号 #N 前缀（本书槽面板要；入槽菜单沿用旧形态=无序号） */
    showIndex?: boolean;
    /** 点行=原点击直达语义（导航/入槽动作，fire-and-forget 同旧 click 体） */
    onPick: (s: TreeSlotRow) => void;
    /** 点行后关菜单（原生 item click 自带 close，自画面板须自管） */
    closeMenu: () => void;
}

const TOGGLER_SVG = '<svg class="prog-slot-tree__arrow"><use xlink:href="#iconRight"></use></svg>';

function rowHtml(s: TreeSlotRow, hasChildren: boolean, isOpen: boolean, opts: SlotTreePanelOptions): string {
    const toggle = hasChildren
        ? `<span class="prog-slot-tree__toggle" aria-expanded="${isOpen}" data-slot-toggle="${s.docID}">${TOGGLER_SVG}</span>`
        : `<span class="prog-slot-tree__toggle prog-slot-tree__toggle--leaf"></span>`;
    const idx = opts.showIndex ? `#${s.point + 1} ` : "";
    return `<div class="prog-slot-tree__row" data-slot-id="${s.docID}" data-depth="${s.depth}" ` +
        `style="padding-left:${8 + s.depth * 16}px">${toggle}` +
        `<span class="prog-slot-tree__label">${idx}${escapeHtml(s.title)}${opts.rowBadge?.(s) ?? ""}</span></div>`;
}

/** 槽树面板 item（type:"empty"——内核 MenuItem 建裸 div 容纳自画 DOM；bind 挂事件委托）。
 *  返回 IMenu 可直接进 menu.addItem 或 submenu 数组（三处同构的落点差异只剩挂载位置） */
export function slotTreePanelItem(opts: SlotTreePanelOptions): IMenu {
    const { bookID, slots } = opts;
    const childrenOf = slotChildrenOf(slots);
    const byID = new Map(slots.map(s => [s.docID, s]));
    const html = `<div class="prog-slot-tree" data-book-id="${bookID}">` +
        `<div class="prog-slot-tree__bar">` +
        `<input class="prog-slot-tree__search b3-text-field" type="text" placeholder="${escapeHtml(tomatoI18n.搜索槽名占位)}">` +
        `<span class="prog-slot-tree__reset" role="button" tabindex="0" aria-label="${escapeHtml(tomatoI18n.tip槽树收回)}">${escapeHtml(tomatoI18n.槽树收回钮)}</span>` +
        `</div><div class="prog-slot-tree__rows"></div></div>`;
    return {
        type: "empty",
        label: html,
        bind(el: HTMLElement) {
            const input = el.querySelector(".prog-slot-tree__search") as HTMLInputElement;
            const reset = el.querySelector(".prog-slot-tree__reset") as HTMLElement;
            const rows = el.querySelector(".prog-slot-tree__rows") as HTMLElement;
            const state = { expanded: expandedSlotSet(bookID), query: "" };
            const render = () => {
                const vis = visibleTreeSlots(slots, state.expanded, state.query);
                // 搜索态箭头一律渲染折叠态：子层由 query 决定可见性（不匹配即隐藏），
                // 箭头若按 expanded 渲染展开态=指向与可见内容矛盾（vision 0926 P2）
                rows.innerHTML = vis.map(s =>
                    rowHtml(s, (childrenOf.get(s.docID)?.length ?? 0) > 0, state.query === "" && state.expanded.has(s.docID), opts)).join("");
            };
            // 事件委托一次挂全（重渲染只换 rows.innerHTML，无需逐行重接线）
            rows.addEventListener("click", (ev: Event) => {
                const target = ev.target as HTMLElement;
                const toggle = target.closest(".prog-slot-tree__toggle:not(.prog-slot-tree__toggle--leaf)");
                if (toggle) {
                    ev.stopPropagation();
                    const id = toggle.getAttribute("data-slot-toggle") ?? "";
                    if (state.expanded.has(id)) state.expanded.delete(id);
                    else state.expanded.add(id);
                    persistSlotExpanded(bookID, state.expanded);
                    debugLog("slottree", `toggle book=${bookID} slot=${id} open=${state.expanded.has(id)}`, "progressive");
                    render();
                    return;
                }
                const row = target.closest(".prog-slot-tree__row");
                if (!row) return;
                const s = byID.get(row.getAttribute("data-slot-id") ?? "");
                if (!s) return;
                debugLog("slottree", `pick book=${bookID} slot=${s.docID} depth=${s.depth}`, "progressive");
                opts.onPick(s);
                opts.closeMenu();
            });
            // IME 组字期不重渲染（isComposing 双通道=内核 openDocTagMenu 同款纪律）
            input.addEventListener("input", (ev: Event) => {
                if ((ev as InputEvent).isComposing) return;
                state.query = input.value;
                render();
            });
            input.addEventListener("compositionend", () => {
                state.query = input.value;
                render();
            });
            // 输入框键盘事件不外溢（stopPropagation 会拦掉独立菜单层的 Escape 关菜单
            // 语义——内核 openDocTagMenu 同款在此自管：Esc=关菜单，其余键不外溢）
            input.addEventListener("keydown", ev => {
                if (ev.key === "Escape") opts.closeMenu();
                ev.stopPropagation();
            });
            reset.addEventListener("click", ev => {
                ev.stopPropagation();
                state.expanded = new Set();
                resetSlotTreeMemory(bookID);
                input.value = "";
                state.query = "";
                debugLog("slottree", `reset book=${bookID}（收回默认=只开第一层）`, "progressive");
                render();
            });
            render();
        },
    };
}
