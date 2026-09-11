// v5 □5 摘抄痕迹（docs/prog-v5-floatbar-design.md §5）：分片/原文双侧标记已摘块。
// 数据链：digest 夹子树内摘抄行块 IAL custom-progref → 原文块 ID；refMap = ref值 → 摘抄块 ID 数组（□15 数组化）。
// 打标：当前文档 DOM 块（data-node-id ∈ refMap 键 或 块 DOM 属性 custom-progref ∈ 键）
// → 注入 span.prog-digest-mark（单摘直跳/多摘弹列表）。
// □15 安全实验结论（2026-08-28 dev 实例）：.sy md5/updated 不变、不进事务不同步，
// reload 即消无幽灵块；**span 永不加 textContent 是硬约束**——带文本的 span 在非只读块
// 被编辑时文本会以 NodeTextMark 卷入 .sy（实测），无文本纯样式 span 被干净剥离零污染。
// □12 修正（2026-08-29 dev 实例实测）：块 div 上 setAttribute 的 custom-* 属性会被
// 编辑事务卷进 IAL 落盘（kramdown 出现 custom-prog-digested=""，只读时代结论在解锁
// 分片后失效）——**块 div 一律零改动**，痕迹只由 span 承载，CSS 锚定用 :has() 选择器。
import { Menu } from "siyuan";
import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import { OpenSyFile2 } from "../../sy-tomato-plugin/src/libs/docUtils";
import { PDIGEST_CTIME, RefIDKey } from "../../sy-tomato-plugin/src/libs/gconst";
import { PdigestReviewKey, ReviewKey } from "./reviewQueue";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import { parseBookIDFromCtime, escapeHtml } from "./progData";
import { PIECE_IDX_KEY, digestTagKind } from "./originTrace";
import { progStorage } from "./ProgressiveStorage";
import { showFloatTip, hideFloatTip } from "./floatTip";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
import { buildDigestMenuItems, digestJumpOf, groupDigestRows, mergeRefRows, DigestRow } from "./digestList";
import { digestStateOf, digestStateIcon } from "./digestState";
import { openDigestReviewMenu } from "./reviewMenu";
import { digestBadgeInputOf, cardIDSetOf, invalidateDigestBadge } from "./digestBadgeStore";
import { digestBadgeOf, fmtDueDate, DigestBadge } from "./digestBadge";

const MARK_CLASS = "prog-digest-mark";
const CACHE_TTL_MS = 60_000;

// OpenSyFile2 需要 Plugin 实例（打开文档定位摘抄块），index.ts onload 时注入
let pluginRef: any = null;

export function initDigestMarker(plugin: any) {
    pluginRef = plugin;
}

// refMap 缓存：新摘抄后 invalidateDigestMarker 失效，下次出场重查
const cache = new Map<string, { map: Map<string, string[]>; ts: number }>();

// 空结果负缓存（群反馈 650189 根治配套）：refMap 首查为空的 bookID 记会话级 Set，
// 后续出场跳过 SQL——普通文档出场补挂后高频触发（切页签/出场链五事件反复调），
// 空结果靠 60s TTL 过期后每轮重发两条 SQL 浪费。invalidateDigestMarker 同步解除
// （newDigestDoc 落库必调）：该 bookID 下新建摘抄即恢复重查。只增不清+插件 reload
// 清零，同 ProgressiveBtn.verifiedNormalDoc 模式。
const emptyRefBooks = new Set<string>();

export function invalidateDigestMarker(bookID: string) {
    cache.delete(bookID);
    emptyRefBooks.delete(bookID);
}

/** ref值 → 摘抄块 ID 数组（升序=时间序；同原文块多次摘抄全部收集，□15 前只留最新）。
 *  ctime 双 like 含 🔨 锤前缀（期A 写作书素材推过即锤——单 like 会漏已锤素材，
 *  原文侧痕迹凭空消失；queryDigestTree:313 同款双 like） */
async function buildRefMap(bookID: string): Promise<Map<string, string[]>> {
    const docRows = await siyuan.sqlAttr(
        `select block_id from attributes where name="${PDIGEST_CTIME}" and (value like "${bookID}#%" or value like "🔨#${bookID}#%") limit 1000000`,
    );
    const docIDs = docRows.map((r: any) => r.block_id);
    if (docIDs.length === 0) {
        debugLog("digestmark", `buildRefMap bookID=${bookID} 摘抄文档0（负缓存候选）`, "progressive");
        return new Map();
    }
    const rows = await siyuan.sqlAttr(
        `select block_id, value from attributes where name="${RefIDKey}" and root_id in (${docIDs.map((id: string) => `"${id}"`).join(",")}) limit 1000000`,
    );
    const map = mergeRefRows(rows);
    debugLog("digestmark", `buildRefMap bookID=${bookID} 文档${docIDs.length} ref${map.size}`, "progressive");
    return map;
}

async function refMapOf(bookID: string, force = false): Promise<Map<string, string[]>> {
    const hit = cache.get(bookID);
    if (!force && hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.map;
    // 负缓存只拦非 force：force=调用方明确要重查（如摘抄刚落库），须穿透
    if (!force && emptyRefBooks.has(bookID)) return new Map();
    const map = await buildRefMap(bookID);
    if (map.size === 0) emptyRefBooks.add(bookID);
    else cache.set(bookID, { map, ts: Date.now() });
    return map;
}

/**
 * 只清不打：digest 卡片出场用（digestMarkBookID digest 态返回空串）——卡片零痕迹。
 * 清残留的必要性：修复前版本满挂的 span 是纯 DOM 注入零落盘（reload 即消），但插件
 * 热升级/集市更新 reload 不重建已开文档的 DOM，须出场主动剥一遍。零 SQL。
 */
export function clearDigestMarks(protyle: any) {
    protyle?.wysiwyg?.element?.querySelectorAll(`.${MARK_CLASS}`).forEach(m => m.remove());
}

/**
 * 对当前文档打摘抄痕迹。片态：块靠 DOM 属性 custom-progref 命中；
 * 原文书态：原文块自身 ID 即 ref 值直接命中。幂等：重复调用清旧标重打。
 * □15 起事件级重打：protyle 懒加载是双向窗口（向下滚底部出新块 + 顶部折叠卸载，
 * 重展开后块重渲染丢标），400 段长文初始仅渲染 ~24%——markDigests 随
 * loaded_protyle_dynamic 等事件反复调用（ProgressiveBtn 出场链）。
 */
export async function markDigests(protyle: any, bookID: string, force = false) {
    const welement: HTMLElement = protyle?.wysiwyg?.element;
    if (!welement || !bookID) return;
    const refMap = await refMapOf(bookID, force);
    // 清旧标紧贴打标（同一同步段，review P1#1：清在 await 前时并发交错「A清→B清→A打→B打」
    // 会同块双插 span）；早退仍在清标后——摘抄被删光（refMap 空）时也清掉残留旧标
    // （文档重渲染后残留 span 会孤儿化，直接按 span 类清；块 div 无任何注入物）
    welement.querySelectorAll(`.${MARK_CLASS}`).forEach(m => m.remove());
    if (refMap.size === 0) return;
    welement.querySelectorAll<HTMLElement>(`div[data-node-id]`).forEach((div) => {
        const ref = div.getAttribute(RefIDKey) ?? div.getAttribute("data-node-id");
        const digestIDs = ref ? refMap.get(ref) : undefined;
        if (!digestIDs?.length) return;
        const span = document.createElement("span");
        span.className = MARK_CLASS;
        span.setAttribute("data-digest-ids", digestIDs.join(","));
        span.setAttribute("contenteditable", "false");
        span.addEventListener("click", (ev) => {
            ev.stopPropagation();
            ev.preventDefault();
            if (!pluginRef) return;
            const jump = digestJumpOf(digestIDs);
            if (jump) OpenSyFile2(pluginRef, jump);
            else openDigestListMenu(ev, digestIDs, bookID);
        });
        div.insertBefore(span, div.firstChild);
    });
}

/**
 * 多摘列表（□15 拍板：思源原生 Menu 轻量列表，点击跳；可见性期1 □1 B：按摘抄文档分组
 * （同 root_id 多块合并一行）+ 悬空孤儿剔除（SQL 查无此块不显示）+ 头部「共 N 条摘抄」，
 * N=去重后文档数；最新文档排最上）。期2 □2 A：行首四态活图标（实时 IAL 现查）。
 * 标题行无 click + addSeparator——reviewMenu 标题行同款（vision P1：同级列表扫不出标题）。
 * independent 第三参 + setTimeout open——click 处理器内弹菜单惯例（reviewMenu 同款，
 * 单例菜单会被同次冒泡清空）。
 */
async function openDigestListMenu(ev: MouseEvent, ids: string[], bookID = "") {
    const rows: DigestRow[] = ((await siyuan.sql(
        `select b.id, b.content, b.root_id, d.content as doc from blocks b left join blocks d on d.id = b.root_id `
        + `where b.id in (${ids.map(id => `"${id}"`).join(",")}) limit 1000`,
    )) ?? []) as any[];
    // 文档真实块序（getChildBlocks）——断句块 id 序≠文档序（实测），预览拼接/跳转落点都靠它
    const rootIDs = [...new Set(rows.map(r => r.root_id).filter(Boolean))] as string[];
    const docOrders = new Map<string, string[]>(
        (await Promise.all(rootIDs.map(async rid => [rid, (await siyuan.getChildBlocks(rid)).map(b => b.id)])))
            .filter(([, order]) => (order as string[]).length > 0) as [string, string[]][],
    );
    const groups = groupDigestRows(ids, rows, docOrders);
    // 四态判定数据（期2 □2 A）：复访/思考双键一次 SQL（think 多块任一有效即思考）+ 卡组 set
    const schedRows = ((await siyuan.sql(
        `select name, root_id, value from attributes where root_id in (${rootIDs.map(id => `"${id}"`).join(",")}) `
        + `and name in ("${PdigestReviewKey}", "${ReviewKey}") limit 10000`,
    )) ?? []) as any[];
    const schedByDoc = new Map<string, { pdigest?: string; think?: string }>();
    for (const r of schedRows) {
        if (!r?.root_id) continue;
        const m = schedByDoc.get(r.root_id) ?? {};
        if (r.name === PdigestReviewKey) m.pdigest = r.value;
        else if (r.name === ReviewKey && !m.think) m.think = r.value;
        schedByDoc.set(r.root_id, m);
    }
    const cardSet = bookID ? await cardIDSetOf(bookID) : new Set<string>();
    const items = buildDigestMenuItems(groups).map((it, i) => {
        const g = groups[i];
        const m = schedByDoc.get(g.rootId) ?? {};
        return {
            ...it,
            icon: digestStateIcon(digestStateOf(m.pdigest ?? "", m.think ?? "", cardSet.has(g.rootId))),
        };
    });
    if (items.length === 0) return;
    const menu = new (Menu as any)("progDigestListMenu", undefined, true) as Menu;
    menu.addItem({ label: `<span style="font-weight:600">${tomatoI18n.摘抄列表共(items.length)}</span>` });
    menu.addSeparator();
    for (const it of items) {
        menu.addItem({
            icon: it.icon,
            // label=用户标题/内容预览，Menu label 走 innerHTML 须转义（□12 存量补）
            label: escapeHtml(it.label),
            click: () => { if (pluginRef) OpenSyFile2(pluginRef, it.id); },
        });
    }
    setTimeout(() => menu.open({
        x: ev.clientX > 0 ? ev.clientX : innerWidth / 2,
        y: ev.clientY > 0 ? ev.clientY : innerHeight / 2,
    }), 0);
}

/**
 * 摘抄文档标题区身份徽章（progpolish □4）：摘抄文档出场时在 .protyle-title 注入
 * 「✒ 摘抄」胶囊，点击弹复访节奏菜单（openDigestReviewMenu 直查 IAL 自动组配两态：
 * 未设复访=首设直列，已设=复访中+改档），顺带治未设 review 的摘抄文档零入口。
 * 纯 DOM 注入零落盘；出场链五事件反复调用，幂等清旧重挂（markDigests 同哲学），
 * title 重渲染丢注入由下次出场事件补挂。
 * 安全性：本函数只动 title 区（.protyle-title__input 的兄弟节点），不碰 wysiwyg
 * 内容块——「span 永不加 textContent」硬约束防的是带文本 span 被编辑卷入 .sy
 * （见文件头 □15），title 区不受此限，徽章带文字安全。
 */
export function markDigestTag(protyle: any) {
    const root: HTMLElement = protyle?.element;
    if (!root) return;
    // 清旧紧贴判定（阴性也清）：切到普通文档/片态时清掉残留旧徽章防串文档
    root.querySelectorAll(".prog-digest-tag").forEach(t => t.remove());
    root.querySelectorAll(".prog-digest-state").forEach(t => t.remove());
    const wys = protyle?.wysiwyg?.element;
    if (!wys?.getAttribute(PDIGEST_CTIME)) return;
    const title = root.querySelector<HTMLElement>(".protyle-title");
    if (!title) return; // 无标题布局（移动端等），静默降级
    // □2 类型字标：片摘（片序号键）> 书摘（ctime 归属注册书）> 札记（非书）——
    // 全类型统一「摘抄」被用户点名无信息量；问题/整摘靠 title 的 ❓/[整] 前缀自表达
    const kind = digestTagKind(
        wys.getAttribute(PIECE_IDX_KEY),
        parseBookIDFromCtime(wys.getAttribute(PDIGEST_CTIME) ?? ""),
        (id) => progStorage.isRegisteredBook(id),
    );
    const label = kind === "piece" ? tomatoI18n.片摘 : kind === "book" ? tomatoI18n.书摘 : tomatoI18n.札记徽章;
    const tag = document.createElement("span");
    tag.className = "prog-digest-tag";
    tag.setAttribute("contenteditable", "false");
    tag.innerHTML = `<svg><use xlink:href="#iconProgQuill"></use></svg>${label}`;
    // hover 来源提示：aria-label 驱动 #prog-float-tip 单例（自建元素对思源 tip 生态隐身，
    // □10/□1 坑）；来源名异步补，未就绪时 hover 无 tip 功能不受损（floatTip 语义）
    const parentID = wys.getAttribute("custom-pdigest-parent-id");
    if (parentID) {
        siyuan.getBlockInfo(parentID).then((info: any) => {
            if (info?.rootTitle) tag.setAttribute("aria-label", `${label}\n${tomatoI18n.摘抄来源提示(info.rootTitle)}`);
        }).catch(() => { });
        tag.addEventListener("mouseenter", () => showFloatTip(tag));
        tag.addEventListener("mouseleave", hideFloatTip);
    }
    tag.addEventListener("click", (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
        openDigestReviewMenu(protyle?.block?.rootID ?? "", ev);
    });
    const input = title.querySelector(".protyle-title__input");
    if (input) title.insertBefore(tag, input.nextSibling);
    else title.append(tag);
    // □1 类型胶囊（六态）：来源胶囊右邻，异步查询后代际守卫注入。清理已在本函数头部
    // 与来源胶囊同段做（阴性也清）；此处迟到查询只插不清——插入前按类再清一遍防
    // 出场链五事件并发双插（同文档同值，后到覆盖先到无害）
    const ctime = wys.getAttribute(PDIGEST_CTIME) ?? "";
    const docID = protyle?.block?.rootID ?? "";
    if (!docID) return;
    const titleText = (title.querySelector(".protyle-title__input")?.textContent ?? "").trim();
    const bookID = parseBookIDFromCtime(ctime);
    digestBadgeInputOf(docID, bookID, titleText)
        .then((badgeInput) => {
            // 代际守卫：同 protyle 切文档（ctime 变）/页签关闭（断连）后丢弃迟到结果
            if (!badgeInput || !wys.isConnected || wys.getAttribute(PDIGEST_CTIME) !== ctime) return;
            // □1 完成复访后胶囊即时跳下轮：onApplied（setReview 后回调）重挂。复访动作只动
            // 文档级 pdigest-review——走 getBlockAttrs 内核直读（SQL attributes 有写后立读
            // 窗口，800ms 延迟仍读到旧值且回填缓存钉死 60s，e2e 实锤）；think/卡组不受复访
            // 动作影响沿用首查值；invalidate 让下次出场走 SQL 重查拿全量新态。400ms 错峰菜单关闭动画
            const refreshStateBadge = () => {
                setTimeout(() => {
                    siyuan.getBlockAttrs(docID).then((attrs: any) => {
                        if (!wys.isConnected || wys.getAttribute(PDIGEST_CTIME) !== ctime) return;
                        invalidateDigestBadge(docID);
                        attachStateBadge(title, tag, digestBadgeOf({
                            ...badgeInput, pdigestReview: attrs?.[PdigestReviewKey] ?? "",
                        }, Date.now()), docID, bookID, refreshStateBadge);
                    }).catch(() => { });
                }, 400);
            };
            attachStateBadge(title, tag, digestBadgeOf(badgeInput, Date.now()), docID, bookID, refreshStateBadge);
        })
        .catch(() => { });
}

/** 类型胶囊文案（消费层 i18n 拼装，纯函数在 digestBadge）：复访带 ✧ 与日期（到期
 *  今天/逾期整日显原日期），思考带 ❓ 与日期，心得 ✓ 灰显，背诵/仿写/留档裸词。 */
function stateBadgeLabel(b: DigestBadge): string {
    switch (b.kind) {
        case "review": return `✧ ${tomatoI18n.复访} · ${b.dueToday ? tomatoI18n.今天 : fmtDueDate(b.next)}`;
        case "think": return `❓ ${tomatoI18n.思考} · ${fmtDueDate(b.next)}`;
        case "insight": return `✓ ${tomatoI18n.心得}`;
        case "recite": return tomatoI18n.背诵;
        case "forRecite": return tomatoI18n.仿写;
        default: return tomatoI18n.留档;
    }
}

/** 类型胶囊 DOM：anchor=来源胶囊（右邻）。复访态可点开 ✧ 复访菜单（完成/推迟高频
 *  动作的就近入口），其余态静态展示。textContent 组装（title 区无「零 textContent」
 *  约束，markDigestTag 注释同款）。onApplied=复访动作落盘后重查重挂（跳下轮即时反映）。 */
function attachStateBadge(
    title: HTMLElement, anchor: HTMLElement, badge: DigestBadge, docID: string,
    bookID = "", onApplied?: () => void,
) {
    title.querySelectorAll(".prog-digest-state").forEach(t => t.remove());
    const tag = document.createElement("span");
    tag.className = `prog-digest-state st-${badge.kind}${badge.due ? " st-due" : ""}`;
    tag.setAttribute("contenteditable", "false");
    tag.textContent = stateBadgeLabel(badge);
    if (badge.kind === "review") {
        tag.classList.add("st-click");
        tag.addEventListener("click", (ev) => {
            ev.stopPropagation();
            ev.preventDefault();
            openDigestReviewMenu(docID, ev, onApplied, bookID);
        });
    }
    title.insertBefore(tag, anchor.nextSibling);
}
