// 期C 变形汇总（素材并行 □9；鸟「类似左侧小条条」）：反查「本文档内容进了哪些槽」。
// 数据链（digestMarker 镜像反向）：槽内胶囊 sb / 旧散挂块 IAL custom-prog-material
// = `源docID#锚块ID` → 反查=值 like `当前docID#%` → 锚块分组（素材文档首块/直送
// 原文档选中块命中同权）。渲染两件：块侧痕迹 span.prog-material-trace（digest 痕迹
// 同构配方，色=写作侧恒冷青）+ 文档级徽标 .prog-material-tag「已入 N 槽」
// （markDigestTag 同位胶囊）。硬约束继承：span 零 textContent、块 div 零改动、
// 纯 DOM 注入零落盘 reload 即消、出场链幂等清旧重挂。
import { Menu, getAllEditor } from "siyuan";
import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import { OpenSyFile2 } from "../../sy-tomato-plugin/src/libs/docUtils";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import { MATERIAL_KEY } from "./writeBook";
import { showFloatTip, hideFloatTip } from "./floatTip";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
import { escapeHtml } from "./progData";

/** Menu label 走 innerHTML，用户文本（槽名）须转义防注入/破渲染（踩坑索引明令）——
 *  期D 提公共 progData.escapeHtml，此处改 import（下方 openSlotMenu 消费） */

const TRACE_CLASS = "prog-material-trace";
const TAG_CLASS = "prog-material-tag";
const CACHE_TTL_MS = 60_000;

// OpenSyFile2 需要 Plugin 实例，index.ts onload 时注入（digestMarker/materialMarker 同款）
let pluginRef: any = null;

export function initMaterialTrace(plugin: any) {
    pluginRef = plugin;
}

/** 反查命中：blockID=槽内胶囊/散块（跳转落点）、rootID=所在片文档（槽名/槽计数）、
 *  anchorID=本文档内的锚块（痕迹挂点） */
export interface MaterialHit {
    blockID: string;
    rootID: string;
    anchorID: string;
}

/** 反查行分组（TDD 见 tests/unit/writingBook.test.ts）：attributes 行（name=
 *  custom-prog-material）→ 锚块 ID → 命中数组。前缀在 SQL 已滤一遍，函数内再防御
 *  （值非 `docID#` 开头/无 # 残值剔除）——纯函数不信任输入序与形态 */
export function groupMaterialHits(rows: { block_id: string; root_id: string; value: string }[], docID: string): Map<string, MaterialHit[]> {
    const prefix = `${docID}#`;
    const map = new Map<string, MaterialHit[]>();
    for (const r of rows ?? []) {
        if (!r?.value?.startsWith(prefix)) continue;
        const anchorID = r.value.slice(prefix.length);
        if (!anchorID) continue;
        const arr = map.get(anchorID) ?? [];
        arr.push({ blockID: r.block_id, rootID: r.root_id, anchorID });
        map.set(anchorID, arr);
    }
    return map;
}

/** 徽标计数=去重槽数（同槽多胶囊算 1——「已入 N 槽」口径） */
export function materialTagCount(map: Map<string, MaterialHit[]>): number {
    return new Set([...map.values()].flat().map(h => h.rootID)).size;
}

// 命中缓存（digestMarker refMap 同款）：60s TTL + 空结果负缓存（出场链五事件高频
// 触发，空文档反复 SQL 浪费）。invalidate 由入槽写点调（insertCapsuleToPiece 四路
// 唯一写点）——否则推式/直送场景源文档已被负缓存（用户开着它点的入槽），痕迹徽标
// 本会话永不出来（reasoning P1-1：负缓存只增不清=断链，不是 60s 旧数）
const cache = new Map<string, { map: Map<string, MaterialHit[]>; ts: number }>();
const emptyDocs = new Set<string>();

/** 入槽写点调用：清源文档两级缓存，出场链下次事件即重查出新痕迹 */
export function invalidateMaterialTrace(docID: string) {
    cache.delete(docID);
    emptyDocs.delete(docID);
}

/** 入槽写点全链刷新（writeBook.insertCapsuleToPiece 调）：失效缓存 + 若源文档正
 *  开着**立即重打**痕迹徽标——invalidate 只保证下次出场事件不再吃旧缓存，但菜单
 *  点完用户静止=无事件触发重渲染，痕迹要等下一次点击才出现（e2e 实锤）；此处主动
 *  重打把「入槽即见」闭环。getAllEditor 不可用即跳过，出场事件兜底 */
export function refreshMaterialTraceFor(docID: string) {
    invalidateMaterialTrace(docID);
    try {
        for (const editor of getAllEditor() as any[]) {
            const p = editor?.protyle;
            if (p?.block?.rootID === docID) {
                void markMaterialTraces(p);
                void markMaterialTag(p);
            }
        }
    } catch { /* editor 枚举失败不挡入槽主链，出场事件兜底 */ }
}

async function hitsOf(docID: string): Promise<Map<string, MaterialHit[]>> {
    const hit = cache.get(docID);
    if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.map;
    if (emptyDocs.has(docID)) return new Map();
    const rows = await siyuan.sqlAttr(
        `select block_id, root_id, value from attributes where name="${MATERIAL_KEY}" and value like "${docID}#%" limit 1000000`);
    const map = groupMaterialHits((rows ?? []) as any[], docID);
    debugLog("mattrace", `hitsOf doc=${docID.slice(-6)} rows=${rows?.length ?? 0} anchors=${map.size}`, "progressive");
    if (map.size === 0) emptyDocs.add(docID);
    else cache.set(docID, { map, ts: Date.now() });
    return map;
}

/** 槽列表菜单行数据：命中 → 槽（片文档）行（去重+槽名+书名）。click 时现查（低频
 *  操作，出场链不预查槽名省 SQL）；槽文档已删的行自动消失（SQL 查无此 root） */
async function slotMenuItems(hits: MaterialHit[]) {
    const rootIDs = [...new Set(hits.map(h => h.rootID))];
    const rows = (await siyuan.sql(
        `select id, content, box, path from blocks where type='d' and id in (${rootIDs.map(id => `"${id}"`).join(",")}) limit 1000`)) ?? [];
    const byRoot = new Map(rows.map((r: any) => [r.id, r]));
    return rootIDs
        .filter(rid => byRoot.has(rid))
        .map(rid => {
            const r = byRoot.get(rid)!;
            // 同槽多胶囊：行点开跳第一个（OpenSyFile2 定位块级，槽内其余胶囊可滚动看到）
            const first = hits.find(h => h.rootID === rid)!;
            return { rootID: rid, title: r.content || rid, blockID: first.blockID };
        });
}

function openSlotMenu(ev: MouseEvent, hits: MaterialHit[]) {
    void slotMenuItems(hits).then(items => {
        if (items.length === 0) return;
        const menu = new (Menu as any)("progMaterialSlotMenu", undefined, true) as Menu;
        menu.addItem({ label: `<span style="font-weight:600">${tomatoI18n.已入N槽(items.length)}</span>` });
        menu.addSeparator();
        for (const it of items) {
            menu.addItem({
                label: escapeHtml(it.title),
                click: () => { if (pluginRef) OpenSyFile2(pluginRef, it.blockID); },
            });
        }
        setTimeout(() => menu.open({
            x: ev.clientX > 0 ? ev.clientX : innerWidth / 2,
            y: ev.clientY > 0 ? ev.clientY : innerHeight / 2,
        }), 0);
    });
}

/** 块侧痕迹（markDigests 同构）：当前文档 DOM 块 data-node-id ∈ 反查锚集合 → 注入
 *  span（单胶囊直跳槽内块/多胶囊弹槽列表）。幂等清旧重挂（出场链反复调用，protyle
 *  懒加载窗口丢标补挂） */
export async function markMaterialTraces(protyle: any) {
    const docID: string = protyle?.block?.rootID ?? "";
    const welement: HTMLElement = protyle?.wysiwyg?.element;
    if (!welement || !docID) return;
    const map = await hitsOf(docID);
    welement.querySelectorAll(`.${TRACE_CLASS}`).forEach(m => m.remove());
    if (map.size === 0) return;
    welement.querySelectorAll<HTMLElement>(`div[data-node-id]`).forEach((div) => {
        const hits = map.get(div.getAttribute("data-node-id") ?? "");
        if (!hits?.length) return;
        const span = document.createElement("span");
        span.className = TRACE_CLASS;
        span.setAttribute("aria-label", tomatoI18n.已入N槽(new Set(hits.map(h => h.rootID)).size));
        span.setAttribute("contenteditable", "false");
        // 自建元素对思源 tip 生态隐身——aria 须接 #prog-float-tip 单例（materialMarker
        // 同款，reasoning P2-2：3px 细条 hover 零提示=可发现性差）
        span.addEventListener("mouseenter", () => showFloatTip(span));
        span.addEventListener("mouseleave", () => hideFloatTip());
        span.addEventListener("click", (ev) => {
            ev.stopPropagation();
            ev.preventDefault();
            if (!pluginRef) return;
            const roots = new Set(hits.map(h => h.rootID));
            if (roots.size === 1 && hits.length === 1) OpenSyFile2(pluginRef, hits[0].blockID);
            else openSlotMenu(ev, hits);
        });
        div.insertBefore(span, div.firstChild);
    });
}

/** 文档级徽标（markDigestTag 同位）：title 区注入「已入 N 槽」胶囊（N=去重槽数），
 *  点击弹槽列表。素材文档（digest 态）与直送原文档统一挂（血缘同键不分形态）；
 *  digest-tag 在场时排其右。title 区不受「span 零 textContent」约束（markDigestTag
 *  注释同款） */
export async function markMaterialTag(protyle: any) {
    const root: HTMLElement = protyle?.element;
    const docID: string = protyle?.block?.rootID ?? "";
    if (!root || !docID) return;
    const map = await hitsOf(docID);
    // 清旧紧贴判定（阴性也清）：切文档时清掉残留旧徽章防串档；必须在 await 之后——
    // 清在 await 前时出场链五事件并发「A清→B清→A插→B插」双徽标同屏（digestMarker
    // review P1#1 教训，reasoning P1-2 复发处）
    root.querySelectorAll(`.${TAG_CLASS}`).forEach(t => t.remove());
    const title = root.querySelector<HTMLElement>(".protyle-title");
    if (!title || map.size === 0) return;
    const n = materialTagCount(map);
    if (n === 0) return;
    const tag = document.createElement("span");
    tag.className = TAG_CLASS;
    tag.setAttribute("contenteditable", "false");
    tag.innerHTML = `<svg><use xlink:href="#iconProgPiece"></use></svg>${tomatoI18n.已入N槽(n)}`;
    tag.addEventListener("click", (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
        openSlotMenu(ev, [...map.values()].flat());
    });
    const input = title.querySelector(".protyle-title__input");
    const digestTag = title.querySelector(".prog-digest-tag");
    if (digestTag) title.insertBefore(tag, digestTag.nextSibling);
    else if (input) title.insertBefore(tag, input.nextSibling);
    else title.append(tag);
}
