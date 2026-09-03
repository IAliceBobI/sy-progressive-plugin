// v5 □12 重访调度菜单与动作（三入口共用）：块右键（DigestProgressiveBox）/ 浮条摘抄子排
// 「重访调度…」（ProgressiveFloatBtns）/ Dock ✧ 到期待办（openDueReviewList）。
// 动作后 notifyFleetChanged 即时刷新 ✧ 徽章；本模块不 import Progressive（fleet 单向依赖）。
import { Menu } from "siyuan";
import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import { OpenSyFile2 } from "../../sy-tomato-plugin/src/libs/docUtils";
import { getProgressivePluginInstance } from "../../sy-tomato-plugin/src/libs/globals";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import { PDIGEST_CTIME } from "../../sy-tomato-plugin/src/libs/gconst";
import { notifyFleetChanged } from "./fleet";
import {
    ReviewKey, ReviewState, SCHED_PRESETS,
    parseReview, markQuestion, markSched, deferReview, completeReview,
    revisitDaysOf, dueReviewSQL,
} from "./reviewQueue";

type MenuItemOption = Parameters<Menu["addItem"]>[0];

async function setReview(ids: string[], value: string, tip: string) {
    for (const id of ids) {
        await siyuan.setBlockAttrs(id, { [ReviewKey]: value } as any);
    }
    await siyuan.pushMsg(tip);
    notifyFleetChanged();
}

/** 完成/推迟/移除三动作（Dock 待办 submenu 与块右键共用）；prevValue=该块当前 IAL 值 */
export async function applyReviewAction(ids: string[], action: "complete" | "defer" | "remove", prevValue: string) {
    if (ids.length === 0) return;
    if (action === "remove") {
        await setReview(ids, "", tomatoI18n.调度已移除);
        return;
    }
    const next = action === "complete" ? completeReview(prevValue, Date.now()) : deferReview(prevValue, Date.now());
    const prev = parseReview(prevValue);
    const tip = action === "complete"
        ? (prev?.mode === "sched" ? tomatoI18n.已完成重访(prev.every) : tomatoI18n.已完成转心得)
        : tomatoI18n.已推迟重访.replace("N", String(revisitDaysOf(next)));
    await setReview(ids, next, tip);
}

/**
 * 设/改调度子菜单（平铺：曲线 + 五档日程 + 标为心得 + 移除；当前模式 ✓ 标记、点击不重置进度）。
 * current=done 时曲线/日程按「无调度」处理（设新值自然覆盖旧态），心得项显示 ✓ 已标；
 * raw=块上 IAL 原始值，非空即出移除项（done 态移除=取消心得，脏值也能清）。
 * 菜单翻新（2026-09-02）：原右键一级「标为心得/取消心得标记」并入本子菜单（iconStar 项）。
 */
export function schedSubmenuItems(ids: string[], current: ReviewState | null, raw = ""): MenuItemOption[] {
    if (ids.length === 0) return [];
    const live = current && current.mode !== "done" ? current : null;
    const done = current?.mode === "done";
    const items: MenuItemOption[] = [{
        icon: "iconGraph",
        label: (live?.mode === "curve" ? "✓ " : "") + tomatoI18n.曲线重访,
        ...(live?.mode === "curve" ? {} : { click: () => setReview(ids, markQuestion(Date.now()), tomatoI18n.已设曲线重访) }),
    }];
    for (const n of SCHED_PRESETS) {
        const on = live?.mode === "sched" && live.every === n;
        items.push({
            icon: "iconCalendar",
            label: (on ? "✓ " : "") + tomatoI18n.每N天重访(n),
            ...(on ? {} : { click: () => setReview(ids, markSched(Date.now(), n), tomatoI18n.已设每N天重访(n)) }),
        });
    }
    items.push(done ? {
        icon: "iconStar",
        label: "✓ " + tomatoI18n.已标心得不再重访,
    } : {
        icon: "iconStar",
        label: tomatoI18n.标为心得不再重访,
        click: () => setReview(ids, "done", tomatoI18n.已完成转心得),
    });
    if (live || done || raw) {
        items.push({
            icon: "iconTrashcan",
            label: tomatoI18n.移除重访调度,
            click: () => setReview(ids, "", tomatoI18n.调度已移除),
        });
    }
    return items;
}

/** 键盘触发（clientX/Y=0）时菜单落屏幕中间 */
function menuPos(ev: { clientX: number; clientY: number }) {
    return {
        x: ev.clientX > 0 ? ev.clientX : innerWidth / 2,
        y: ev.clientY > 0 ? ev.clientY : innerHeight / 2,
    };
}

/** 浮条摘抄子排「重访调度…」：选中块当前态感知的独立菜单（independent，同 progAdvancedMenu 惯例） */
export async function openReviewSchedMenu(ids: string[], ev: { clientX: number; clientY: number }) {
    if (ids.length === 0) return;
    const attrs = await siyuan.getBlockAttrs(ids[0]);
    const raw = attrs?.[ReviewKey] ?? "";
    const current = parseReview(raw);
    const menu = new (Menu as any)("progReviewSchedMenu", undefined, true) as Menu;
    menu.addItem({
        icon: "iconProgSched",
        label: tomatoI18n.重访调度,
        submenu: schedSubmenuItems(ids, current, raw),
    });
    setTimeout(() => menu.open(menuPos(ev)), 0);
}

/**
 * Dock ✧ 到期待办列表（可按书过滤）：主点击=跳块定位，submenu=完成/推迟/移除。
 * 空列表不开菜单，toast 提示。
 */
export async function openDueReviewList(ev: { clientX: number; clientY: number }, bookID?: string) {
    let dueRows: any[] = (await siyuan.sql(dueReviewSQL(Date.now()))) ?? [];
    if (bookID) {
        const ctimeRows = (await siyuan.sql(
            `select block_id, value from attributes where name='${PDIGEST_CTIME}'`)) as any[] ?? [];
        const docs = new Set(ctimeRows.filter(r => String(r.value).startsWith(bookID + "#")).map(r => r.block_id));
        dueRows = dueRows.filter(r => docs.has(r.root_id));
    }
    if (dueRows.length === 0) {
        await siyuan.pushMsg(tomatoI18n.暂无到期重访);
        return;
    }
    const menu = new (Menu as any)("progDueReviewMenu", undefined, true) as Menu;
    // 标题行（无 click）：到期待办数
    menu.addItem({ label: `✧ ${tomatoI18n.重访到期待办}（${dueRows.length}）` });
    menu.addSeparator();
    for (const r of dueRows) {
        const s = parseReview(r.v);
        if (!s || s.mode === "done") continue;
        const curve = s.mode === "curve";
        menu.addItem({
            icon: curve ? "iconProgThink" : "iconCalendar",
            label: clip(r.content ?? r.id, 40),
            click: async () => {
                await OpenSyFile2(
                    getProgressivePluginInstance() as any, r.id, "front",
                    ["cb-get-context", "cb-get-focus", "cb-get-hl"]);
            },
            submenu: [
                {
                    icon: "iconCheck",
                    label: curve ? tomatoI18n.问题已解决 : tomatoI18n.本轮已完成,
                    click: () => applyReviewAction([r.id], "complete", r.v),
                },
                {
                    icon: curve ? "iconProgThink" : "iconClock",
                    label: curve ? tomatoI18n.还没懂稍后再看 : tomatoI18n.推迟到明天,
                    click: () => applyReviewAction([r.id], "defer", r.v),
                },
                {
                    icon: "iconTrashcan",
                    label: tomatoI18n.移除重访调度,
                    click: () => applyReviewAction([r.id], "remove", r.v),
                },
            ],
        });
    }
    setTimeout(() => menu.open(menuPos(ev)), 0);
}

function clip(s: string, n: number): string {
    const t = s.replace(/\s+/g, " ").trim();
    return t.length > n ? t.slice(0, n) + "…" : t;
}
