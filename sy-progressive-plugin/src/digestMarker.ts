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
import { findDocByIal, getDocIalDigestDir } from "./progData";
import { buildDigestMenuItems, digestJumpOf, groupDigestRows, mergeRefRows, DigestRow } from "./digestList";
import { digestStateOf, digestStateIcon } from "./digestState";
import { openDigestReviewMenu } from "./reviewMenu";

const MARK_CLASS = "prog-digest-mark";
const CACHE_TTL_MS = 60_000;

// OpenSyFile2 需要 Plugin 实例（打开文档定位摘抄块），index.ts onload 时注入
let pluginRef: any = null;

export function initDigestMarker(plugin: any) {
    pluginRef = plugin;
}

// refMap 缓存：新摘抄后 invalidateDigestMarker 失效，下次出场重查
const cache = new Map<string, { map: Map<string, string[]>; ts: number }>();

export function invalidateDigestMarker(bookID: string) {
    cache.delete(bookID);
}

/** ref值 → 摘抄块 ID 数组（升序=时间序；同原文块多次摘抄全部收集，□15 前只留最新） */
async function buildRefMap(bookID: string): Promise<Map<string, string[]>> {
    const docRows = await siyuan.sqlAttr(
        `select block_id from attributes where name="${PDIGEST_CTIME}" and value like "${bookID}#%" limit 1000000`,
    );
    const docIDs = docRows.map((r: any) => r.block_id);
    if (docIDs.length === 0) return new Map();
    const rows = await siyuan.sqlAttr(
        `select block_id, value from attributes where name="${RefIDKey}" and root_id in (${docIDs.map((id: string) => `"${id}"`).join(",")}) limit 1000000`,
    );
    return mergeRefRows(rows);
}

async function refMapOf(bookID: string, force = false): Promise<Map<string, string[]>> {
    const hit = cache.get(bookID);
    if (!force && hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.map;
    const map = await buildRefMap(bookID);
    cache.set(bookID, { map, ts: Date.now() });
    return map;
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
 * 摘抄文档已入卡的块 ID set（期2 □2 A 背诵态判定数据源，微拍板方案 a）：
 * digest 夹 IAL **只读认回**（findDocByIal 不建——无夹=无卡，非 ensure 的写语义），
 * 卡挂摘抄文档块（setDigestCard(digestID)），card.id 即块 ID。
 * 夹不存在/查询异常 → 空 set 静默降级（四态退三态，不崩列表）。
 */
async function cardIDSetOf(bookID: string): Promise<Set<string>> {
    try {
        const dirID = await findDocByIal(getDocIalDigestDir(bookID));
        if (!dirID) return new Set();
        const cards = await siyuan.getTreeRiffCardsAll(dirID);
        return new Set(cards.map(c => c.id));
    } catch {
        return new Set();
    }
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
            label: it.label,
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
    if (!protyle?.wysiwyg?.element?.getAttribute(PDIGEST_CTIME)) return;
    const title = root.querySelector<HTMLElement>(".protyle-title");
    if (!title) return; // 无标题布局（移动端等），静默降级
    const tag = document.createElement("span");
    tag.className = "prog-digest-tag";
    tag.setAttribute("contenteditable", "false");
    tag.innerHTML = `<svg><use xlink:href="#iconProgQuill"></use></svg>${tomatoI18n.摘抄}`;
    tag.addEventListener("click", (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
        openDigestReviewMenu(protyle?.block?.rootID ?? "", ev);
    });
    const input = title.querySelector(".protyle-title__input");
    if (input) title.insertBefore(tag, input.nextSibling);
    else title.append(tag);
}
