// v5 □12 重访调度菜单与动作（三入口共用）：块右键（DigestProgressiveBox）/ 浮条摘抄子排
// 「重访调度…」（ProgressiveFloatBtns）/ Dock ✧ 到期待办（openDueReviewList）。
// 动作后 notifyFleetChanged 即时刷新 ✧ 徽章；本模块不 import Progressive（fleet 单向依赖）。
import { Menu } from "siyuan";
import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import { OpenSyFile2 } from "../../sy-tomato-plugin/src/libs/docUtils";
import { getProgressivePluginInstance } from "../../sy-tomato-plugin/src/libs/globals";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import { PDIGEST_CTIME } from "../../sy-tomato-plugin/src/libs/gconst";
import { notifyFleetChanged } from "./fleetNotify";
import { findDocByIal, getDocIalDigestDir, parseBookIDFromCtime } from "./progData";
import { digestStateOf, digestStateIcon, DigestState } from "./digestState";
import { invalidateDigestBadge } from "./digestBadgeStore";
import {
    ReviewKey, ReviewState, SCHED_PRESETS, PdigestReviewKey,
    parseReview, markQuestion, markSched, deferReview, completeReview, completeRevisit,
    revisitDaysOf, scheduleSQLFor, splitSchedule,
    mergeDueRows, DueRow, isDue, DAY,
} from "./reviewQueue";
import { dayStartOf } from "./readCurveCore";

type MenuItemOption = Parameters<Menu["addItem"]>[0];

async function setReview(ids: string[], value: string, tip: string, key: string = ReviewKey) {
    for (const id of ids) {
        await siyuan.setBlockAttrs(id, { [key]: value } as any);
        // □1 类型胶囊缓存失效：完成/推迟/移除后下次出场重查（跳下轮/灭期即时反映）
        invalidateDigestBadge(id);
    }
    await siyuan.pushMsg(tip);
    notifyFleetChanged();
}

/** 完成/推迟/移除三动作（Dock 待办 submenu 与块右键共用）；prevValue=当前 IAL 值；
 *  key=ReviewKey 块级（曲线完成转心得）| PdigestReviewKey 文档级（曲线完成 ×2 进下轮，永不 done） */
export async function applyReviewAction(
    ids: string[], action: "complete" | "defer" | "remove", prevValue: string,
    key: string = ReviewKey,
) {
    if (ids.length === 0) return;
    if (action === "remove") {
        await setReview(ids, "", tomatoI18n.调度已移除, key);
        return;
    }
    const now = Date.now();
    const pdigest = key === PdigestReviewKey;
    const next = action === "complete"
        ? (pdigest ? completeRevisit(prevValue, now) : completeReview(prevValue, now))
        : deferReview(prevValue, now);
    const prev = parseReview(prevValue);
    const tip = action === "complete"
        ? (pdigest ? tomatoI18n.已完成复访N天(revisitDaysOf(next))
            : prev?.mode === "sched" ? tomatoI18n.已完成重访(prev.every) : tomatoI18n.已完成转心得)
        : tomatoI18n.已推迟重访.replace("N", String(revisitDaysOf(next)));
    await setReview(ids, next, tip, key);
}

/**
 * 设/改调度子菜单（平铺：曲线 + 五档日程 + 标为心得 + 移除；当前模式 ✓ 标记、点击不重置进度）。
 * current=done 时曲线/日程按「无调度」处理（设新值自然覆盖旧态），心得项显示 ✓ 已标；
 * raw=块上 IAL 原始值，非空即出移除项（done 态移除=取消心得，脏值也能清）。
 * 菜单翻新（2026-09-02）：原右键一级「标为心得/取消心得标记」并入本子菜单（iconStar 项）。
 * 期2 key 参数化：PdigestReviewKey 文档级复访共用本菜单（心得=done 终态是 think 专属，
 * 复访永不结业不出心得项）。
 */
export function schedSubmenuItems(ids: string[], current: ReviewState | null, raw = "", key: string = ReviewKey): MenuItemOption[] {
    if (ids.length === 0) return [];
    const live = current && current.mode !== "done" ? current : null;
    const done = current?.mode === "done";
    const items: MenuItemOption[] = [{
        icon: "iconGraph",
        label: (live?.mode === "curve" ? "✓ " : "") + tomatoI18n.曲线重访,
        ...(live?.mode === "curve" ? {} : { click: () => setReview(ids, markQuestion(Date.now()), tomatoI18n.已设曲线重访, key) }),
    }];
    for (const n of SCHED_PRESETS) {
        const on = live?.mode === "sched" && live.every === n;
        items.push({
            icon: "iconCalendar",
            label: (on ? "✓ " : "") + tomatoI18n.每N天重访(n),
            ...(on ? {} : { click: () => setReview(ids, markSched(Date.now(), n), tomatoI18n.已设每N天重访(n), key) }),
        });
    }
    if (key === ReviewKey) { // 心得（done 终态）是 think 专属语义；复访永不结业
        items.push(done ? {
            icon: "iconStar",
            label: "✓ " + tomatoI18n.已标心得不再重访,
        } : {
            icon: "iconStar",
            label: tomatoI18n.标为心得不再重访,
            click: () => setReview(ids, "done", tomatoI18n.已完成转心得),
        });
    }
    if (live || done || raw) {
        items.push({
            icon: "iconTrashcan",
            label: tomatoI18n.移除重访调度,
            click: () => setReview(ids, "", tomatoI18n.调度已移除, key),
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

// □7 摘抄浮条 ✧ 复访动作组：两态组配（纯函数供单测）+ 菜单打开器。
function wrapApplied(items: MenuItemOption[], onApplied?: () => void): MenuItemOption[] {
    if (!onApplied) return items;
    const after = (fn: any) => async () => { await fn(); onApplied(); };
    return items.map(it => ({ ...it, ...(it.click ? { click: after(it.click) } : {}) }));
}

/**
 * 无键（含 done/垃圾值——pdigest 正常流永不 done，脏值视同无键可重新入队）= 加入组顶层
 * 直列：schedSubmenuItems current=null 产曲线+五档、无移除项（□8 存量摘抄后补入口）。
 * 有键 = 标题行「复访中 · 曲线/每N天 · X 天后到期（已到期）」+ 本轮已完成/推迟到明天/
 * 复访节奏…（子菜单改档）/不再复访——与 Dock ✧ 待办摘抄行子菜单同构。
 * onApplied=动作落盘后回调（浮条红点复查：complete/defer 进未来、remove 清键均灭点）。
 * 期2 □2 A 四态活标题：stateBadge（非复访态由调用方 digestStateBadgeOf 现查传入）在
 * 无键态菜单顶部插只读状态行；有键态标题行 icon 用时钟（复访态图标，iconProgSched 退役到动作行）。
 */
export function digestReviewMenuItems(
    docID: string, raw: string, now: number, onApplied?: () => void,
    stateBadge?: { icon: string; label: string; state: DigestState } | null,
): MenuItemOption[] {
    if (!docID) return [];
    const current = parseReview(raw);
    if (!current || current.mode === "done") {
        const items = schedSubmenuItems([docID], null, "", PdigestReviewKey);
        if (stateBadge) {
            return wrapApplied([
                { icon: stateBadge.icon, label: stateBadge.label },
                { type: "separator" },
                ...items,
                // 可见性期3 □3：stateBadge 分支同样挂计划面板入口（否则该分支漏挂）
                {
                    icon: "iconProgSched", label: tomatoI18n.复习计划,
                    click: () => (getProgressivePluginInstance() as any)?.openReviewPlanDialog?.(),
                },
            ] as MenuItemOption[], onApplied);
        }
        // 可见性期3 □3：无键态菜单尾部也挂计划面板入口（空态=新用户教育通道）
        items.push({
            icon: "iconProgSched", label: tomatoI18n.复习计划,
            click: () => (getProgressivePluginInstance() as any)?.openReviewPlanDialog?.(),
        });
        return wrapApplied(items, onApplied);
    }
    const mode = current.mode === "sched" ? tomatoI18n.每N天重访(current.every) : tomatoI18n.曲线重访;
    const days = isDue(current, now) ? null : Math.ceil((current.next - now) / DAY);
    return wrapApplied([
        { icon: "iconClock", label: tomatoI18n.复访中标题(mode, days) },
        {
            icon: "iconCheck", label: tomatoI18n.本轮已完成,
            click: () => applyReviewAction([docID], "complete", raw, PdigestReviewKey),
        },
        {
            icon: "iconClock", label: tomatoI18n.推迟到明天,
            click: () => applyReviewAction([docID], "defer", raw, PdigestReviewKey),
        },
        {
            icon: "iconProgSched", label: tomatoI18n.复访节奏,
            submenu: wrapApplied(schedSubmenuItems([docID], current, raw, PdigestReviewKey), onApplied),
        },
        {
            icon: "iconTrashcan", label: tomatoI18n.不再复访,
            click: () => applyReviewAction([docID], "remove", raw, PdigestReviewKey),
        },
        // 可见性期3 □3：复习计划面板入口（常驻承诺的第二浮条入口；openDueReviewList 轻量场景保留）
        {
            icon: "iconProgSched", label: tomatoI18n.复习计划,
            click: () => (getProgressivePluginInstance() as any)?.openReviewPlanDialog?.(),
        },
    ], onApplied);
}

/** □7 摘抄浮条 ✧ 钮点击：直查文档 IAL 组配两态菜单（independent，openReviewSchedMenu 惯例） */
export async function openDigestReviewMenu(
    docID: string, ev: { clientX: number; clientY: number }, onApplied?: () => void, bookID = "",
) {
    if (!docID) return;
    const attrs = await siyuan.getBlockAttrs(docID);
    const raw = attrs?.[PdigestReviewKey] ?? "";
    const menu = new (Menu as any)("progDigestReviewMenu", undefined, true) as Menu;
    // 期2 □2 A 四态活标题：现查思考块与卡组（bookID 缺省跳过卡组查询，仅复访/思考可辨）
    const stateBadge = await digestStateBadgeOf(docID, bookID);
    const items = digestReviewMenuItems(docID, raw, Date.now(), onApplied, stateBadge);
    for (let i = 0; i < items.length; i++) {
        menu.addItem(items[i]);
        // 有键态标题行（无键态首项=可点的曲线档有 click）后加分隔线拉开与动作行的层级，
        // openDueReviewList 标题行同款（vision P1：同级列表扫不出标题）
        if (i === 0 && !items[0].click && items.length > 1) menu.addSeparator();
    }
    setTimeout(() => menu.open(menuPos(ev)), 0);
}

/**
 * ✧ 菜单四态标题徽（期2 □2 A）：复访态在 digestReviewMenuItems 内由标题行承载，
 * 此处只补非复访态（背诵/思考/留档）——打开 ✧ 菜单第一眼知道当前文档状态。
 * think 取文档内任一思考块值；卡组 bookID 缺省/异常降级为无卡（查询失败不阻塞菜单）。
 */
async function digestStateBadgeOf(
    docID: string, bookID = "",
): Promise<{ icon: string; label: string; state: DigestState } | null> {
    if (!docID) return null;
    try {
        const thinkRows = ((await siyuan.sql(
            `select value from attributes where name="${ReviewKey}" and root_id="${docID}" limit 100`,
        )) ?? []) as any[];
        const think = (thinkRows.map(r => r?.value).find(v => v && v !== "done")) ?? "";
        let cardInSet = false;
        if (bookID) {
            const dirID = await findDocByIal(getDocIalDigestDir(bookID));
            if (dirID) {
                const cards = await siyuan.getTreeRiffCardsAll(dirID);
                cardInSet = cards.some(c => c.id === docID);
            }
        }
        const state = digestStateOf("", think, cardInSet);
        if (state === "review") return null; // 复访态由有键标题行自带（iconClock 在 items 内）
        const label = state === "recite" ? tomatoI18n.背诵中
            : state === "think" ? tomatoI18n.思考中 : tomatoI18n.留档;
        return { icon: digestStateIcon(state), label, state };
    } catch {
        return null;
    }
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
 * Dock ✧ 到期待办列表（可按书过滤）：主点击=跳块/跳摘抄文档，submenu=完成/推迟/移除。
 * 期2 双源（spec 定稿节 3）：think 块级（iconProgThink/iconCalendar）+ pdigest 文档级
 * （iconProgQuill）图标区分、按到期序混排；pdigest 行 id=root_id=摘抄文档，
 * 按 bookID 过滤与 think 同走 ctime 前缀链（root_id 都是摘抄文档）。
 * □9 排期视图（三段，纯函数组配见 dueScheduleSections）：已到期〔现行为不动〕/
 * 未来 7 天 / 更远；查询扩 attributes 全量行（scheduleSQLFor 无到期过滤），空态改为
 * 「无任何调度」才 toast（有未来排期即开菜单）。空列表不开菜单。
 */
export async function openDueReviewList(ev: { clientX: number; clientY: number }, bookID?: string) {
    const now = Date.now();
    const [thinkRows, pdigestRows] = await Promise.all([
        siyuan.sql(scheduleSQLFor(ReviewKey)) as Promise<DueRow[]>,
        siyuan.sql(scheduleSQLFor(PdigestReviewKey)) as Promise<DueRow[]>,
    ]);
    let rows = mergeDueRows(thinkRows ?? [], pdigestRows ?? []);
    if (bookID) {
        // 显式 limit 防内核 64 截尾（fleetData 同款）：全库摘抄 >64 条时 docs 集不全 → 该书排期条目误滤。
        // parseBookIDFromCtime 兼容 🔨 锤前缀（期A 素材推过即锤，单前缀 startsWith 会漏——review P2-3）
        const ctimeRows = (await siyuan.sql(
            `select block_id, value from attributes where name='${PDIGEST_CTIME}' limit 10000000`)) as any[] ?? [];
        const docs = new Set(ctimeRows.filter(r => parseBookIDFromCtime(String(r.value)) === bookID).map(r => r.block_id));
        rows = rows.filter(r => docs.has(r.root_id));
    }
    const { header, sections } = dueScheduleSections(rows, now);
    if (sections.length === 0) { // 无任何有效调度（零行或全垃圾值）同态出 toast，不开空壳菜单
        await siyuan.pushMsg(tomatoI18n.暂无到期重访);
        return;
    }
    const menu = new (Menu as any)("progDueReviewMenu", undefined, true) as Menu;
    menu.addItem({ label: header }); // 总标题行（无 click）：排期总数
    menu.addSeparator();
    sections.forEach((sec, i) => {
        if (i > 0) menu.addSeparator();
        menu.addItem({ label: sec.title }); // 段标题行（无 click）：本段计数
        for (const item of sec.items) menu.addItem(item);
    });
    setTimeout(() => menu.open(menuPos(ev)), 0);
}

/** 排期段（□9）：段标题行 + 段内待办行。label 走内核 innerHTML——标题/尾缀内联弱化
 *  样式（vision 三级层级：总标题 600 / 段标题 12px·62% / 行尾缀 65%），内容文本经 clip 转义 */
export interface ScheduleSection { title: string; items: MenuItemOption[]; }

const SEC_TITLE = "font-size:12px;opacity:.62";
const DAYS_TAG = "opacity:.65";

/**
 * □9 ✧ 待办三段排期组配（纯函数供单测，digestReviewMenuItems 先例）：已到期〔现行为
 * 不动，含三动作子菜单〕/未来 7 天/更远；段间标题行带本段计数，空段剔除。未来段行
 * submenu=复访节奏+移除（完成/推迟对未到期无意义不挂）、行尾 · N 天后距期天数；
 * 主点击仍跳块/跳摘抄文档。书卡 ✧ 徽章与全局胶囊计数维持只算已到期（fleet 侧）。
 */
export function dueScheduleSections(
    rows: (DueRow & { src: "think" | "pdigest" })[], now: number,
): { header: string; sections: ScheduleSection[] } {
    const { due, week, later } = splitSchedule(rows, now);
    const defs: [string, typeof due, boolean][] = [
        [tomatoI18n.段已到期(due.length), due, false],
        [tomatoI18n.段未来7天(week.length), week, true],
        [tomatoI18n.段更远(later.length), later, true],
    ];
    const sections: ScheduleSection[] = [];
    for (const [title, list, future] of defs) {
        const items: MenuItemOption[] = [];
        for (const r of list) {
            const s = parseReview(r.v);
            if (!s || s.mode === "done") continue;
            items.push(reviewRowItem(r, s, now, future));
        }
        if (items.length > 0) sections.push({ title: `<span style="${SEC_TITLE}">${title}</span>`, items });
    }
    const total = sections.reduce((n, sec) => n + sec.items.length, 0);
    return { header: `<span style="font-weight:600">✧ ${tomatoI18n.复习排期}（${total}）</span>`, sections };
}

/** 待办行组配：图标按来源/模式分流，主点击=跳转；future=false 三动作子菜单（现行为），
 *  future=true（□9 未来段）节奏+移除、行尾距期天数弱化尾缀（done 态由调用方过滤，签名收窄免判） */
function reviewRowItem(
    r: DueRow & { src: "think" | "pdigest" }, s: Exclude<ReviewState, { mode: "done" }>,
    now: number, future: boolean,
): MenuItemOption {
    const curve = s.mode === "curve";
    const pd = r.src === "pdigest";
    const key = pd ? PdigestReviewKey : ReviewKey;
    const label = clip(r.content ?? r.id, 40);
    // 日历日差（□5 review P2-B：滚动 ceil 是全仓最后一处旧口径——面板 rel/条带/段界均日历化）
    const days = tomatoI18n.N天后(Math.round((dayStartOf(s.next) - dayStartOf(now)) / DAY));
    return {
        icon: pd ? "iconProgQuill" : curve ? "iconProgThink" : "iconCalendar",
        label: future ? `${label} <span style="${DAYS_TAG}">· ${days}</span>` : label,
        click: async () => {
            await OpenSyFile2(
                getProgressivePluginInstance() as any, r.id, "front",
                ["cb-get-context", "cb-get-focus", "cb-get-hl"]);
        },
        submenu: future ? [
            {
                icon: "iconProgSched",
                label: tomatoI18n.复访节奏,
                submenu: schedSubmenuItems([r.id], s, r.v, key),
            },
            {
                icon: "iconTrashcan",
                label: pd ? tomatoI18n.不再复访 : tomatoI18n.移除重访调度,
                click: () => applyReviewAction([r.id], "remove", r.v, key),
            },
        ] : pd ? [
            {
                icon: "iconCheck",
                label: tomatoI18n.本轮已完成,
                click: () => applyReviewAction([r.id], "complete", r.v, PdigestReviewKey),
            },
            {
                icon: "iconClock",
                label: tomatoI18n.推迟到明天,
                click: () => applyReviewAction([r.id], "defer", r.v, PdigestReviewKey),
            },
            {
                icon: "iconProgSched",
                label: tomatoI18n.复访节奏,
                submenu: schedSubmenuItems([r.id], s, r.v, PdigestReviewKey),
            },
            {
                icon: "iconTrashcan",
                label: tomatoI18n.不再复访,
                click: () => applyReviewAction([r.id], "remove", r.v, PdigestReviewKey),
            },
        ] : [
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
    };
}

/** 期2 free「不再推送」：源文档全部摘抄的复访批量移除（ctime 前缀=docID#，摘抄关联 IAL 位置无关）。
 *  返回涉及摘抄条数（0=该文档没有摘抄）。书忽略与复访正交，本函数不碰忽略态。 */
export async function removeRevisitBySource(docID: string): Promise<number> {
    if (!docID) return 0;
    // 显式 limit 防内核 64 截尾：本函数目标场景=单文档摘抄批量移除，>64 条时尾部
    // 清不掉且无 order by 重跑还是同 64 条=永不可自愈。双 like 含 🔨 锤（期A 对齐）
    const rows = (await siyuan.sql(
        `select block_id from attributes where name='${PDIGEST_CTIME}' and (value like '${docID}#%' or value like '🔨#${docID}#%') limit 10000000`)) as any[] ?? [];
    const ids = (rows ?? []).map(r => r.block_id);
    for (const id of ids) {
        await siyuan.setBlockAttrs(id, { [PdigestReviewKey]: "" } as any);
    }
    if (ids.length) notifyFleetChanged();
    return ids.length;
}

/** 行内容截断：label 走内核 innerHTML，块文本先转义 <>&（防用户内容注入/破坏标签结构） */
function clip(s: string, n: number): string {
    const t = s.replace(/\s+/g, " ").trim()
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return t.length > n ? t.slice(0, n) + "…" : t;
}
