// progtree □1 树即槽权威：树序=槽序唯一真相（Doc Tree 即结构，设计共识见
// docs/checkpoints/2026-09-13-2113-handoff-progtree.md + plans/2026-09-13-
// progtree-tree-authority.md「定案」节）。本文件上半区=树权威纯函数核（TDD 锁
// 行为），下半区=IO（递归拉取/一次性整理/出场判定/钉位 helper），IO 行为由 dev
// 实例手验/e2e 覆盖——与 writeBook.ts 同款纪律。
// 物理路径形态（6808 实测）：文档 path=id 形态（/box/书id/子id.sy）；
// listDocsByPath 的 path 参数=id 目录形态（/书id、/书id/子id）；changeSort
// paths=该层全量 /…/id.sy 数组；新建子文档默认插顶（倒序）——钉位必须显式。
import { MarkKey, TEMP_CONTENT } from "../../sy-tomato-plugin/src/libs/gconst";
import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
import { getDocIalPieces, getDocIalDigestDir, getDocIalDigestDirUnder, getDocIalDigestDirHub, getDocIalWords, getDocIalNewBookKey, getDocIalAllInOneKey, freshCreatedIDFor } from "./progData";
import { parseWritingPieceRows } from "./writeBook";

/** listDocsByPath 行子集（树拉取只认这四个字段，防响应形态耦合） */
export interface TreeDocRow {
    id: string;
    name: string;
    subFileCount: number;
    path: string;
}

/** 递归拉取产物：children 仅含白名单外的子文档（池夹子树在拉取层剪枝） */
export interface TreeNode {
    row: TreeDocRow;
    children: TreeNode[];
}

/** 树形槽（深度优先展开平铺）：point=平铺 index（WritingPieceState 同序）、
 *  depth=树深（0=书直属）、parentID=父文档 id（书直属=bookID，子槽=父槽 docID） */
export interface WritingTreeSlot {
    point: number;
    docID: string;
    title: string;
    depth: number;
    parentID: string;
}

/** 树 → 展开平铺（深度优先，同层按传入序=sort=15 文件树序）。excluded=白名单
 *  id 集（池夹等锚定文档），以其为根的子树整棵跳过；point 连续重编不留洞 */
export function flattenWritingTree(nodes: TreeNode[], excluded: Set<string>, parentID: string): WritingTreeSlot[] {
    const out: WritingTreeSlot[] = [];
    const walk = (list: TreeNode[], parent: string, depth: number) => {
        for (const n of list) {
            if (excluded.has(n.row.id)) continue;
            out.push({ point: out.length, docID: n.row.id, title: n.row.name, depth, parentID: parent });
            walk(n.children, n.row.id, depth + 1);
        }
    };
    walk(nodes, parentID, 0);
    return out;
}

/** 存量书一次性对齐计划：书下第一层 → [白名单夹(物理序)] + [point 槽按 MarkKey
 *  真值升序] + [无标手动槽(物理序垫底)]。needAlign=目标 id 序 ≠ 当前物理 id 序 */
export interface TreeAlignPlan {
    needAlign: boolean;
    orderedPaths: string[];
}

export function planTreeAlign(layer: TreeDocRow[], points: Map<string, number>, excluded: Set<string>): TreeAlignPlan {
    if (points.size === 0) return { needAlign: false, orderedPaths: layer.map(r => r.path) };
    const pools = layer.filter(r => excluded.has(r.id));
    const withPoint = layer
        .filter(r => points.has(r.id))
        .sort((a, b) => (points.get(a.id) ?? 0) - (points.get(b.id) ?? 0));
    const manual = layer.filter(r => !excluded.has(r.id) && !points.has(r.id));
    const ordered = [...pools, ...withPoint, ...manual];
    const needAlign = ordered.some((r, i) => r.id !== layer[i]?.id);
    return { needAlign, orderedPaths: ordered.map(r => r.path) };
}

/** 槽身份标记值（出场识别缓存用，无序语义——树序权威下 point 段恒 0；新槽/
 *  懒补标统一挂此值，isProtylePiece 前缀形态判定天然兼容） */
export function slotMarkValue(bookID: string): string {
    return getDocIalPieces(bookID, 0);
}

// ============ IO 段（树权威读写；行为由 e2e/手验覆盖） ============

/** 白名单六锚（书下系统文档）：主力池夹+under/hub 方向夹+words+编译成稿 merged+
 *  多合一键词笔记；锚值挂 MarkKey（ensureAnchoredDoc 通道，位置无关认回——池夹被
 *  手挪后照样认得）。P0-1：编译产物锚不在册则成稿变身槽（书永不退役+懒补标覆写锚
 *  重复建稿）。P1-5 fail-open 兜底：attributes 索引滞后/故障时并入 freshCreatedIds
 *  在册刚建夹（本进程保证），防池夹子树涌入槽列表 */
export async function writingTreeExcludedIDs(bookID: string): Promise<Set<string>> {
    const anchors = [getDocIalDigestDir(bookID), getDocIalDigestDirUnder(bookID), getDocIalDigestDirHub(bookID), getDocIalWords(bookID), getDocIalNewBookKey(bookID), getDocIalAllInOneKey(bookID)];
    const out = new Set<string>();
    for (const a of anchors) {
        const fresh = freshCreatedIDFor(a);
        if (fresh) out.add(fresh);
    }
    const rows = await siyuan.sql(
        `select block_id, value from attributes where name='${MarkKey}' and value in (${anchors.map(a => `'${a}'`).join(",")}) limit 100`) as any[] ?? [];
    for (const r of rows) out.add(r.block_id);
    return out;
}

/** listDocsByPath 一层（磁盘直读无索引窗；maxListCount:0=全量防内核默认截断；
 *  path=id 目录形态）。响应兜底两种形态（files 数组/裸数组），失败返 [] */
export async function fetchDocLayer(box: string, dirPath: string): Promise<TreeDocRow[] | null> {
    // P1-2：失败（call 吞错返 null/undefined）与空层必须可区分——返回 null 上抛传播，
    // 防瞬时故障被当「树真不含」误剥标/空槽列表进缓存
    const resp = await siyuan.call("/api/filetree/listDocsByPath", { notebook: box, path: dirPath, maxListCount: 0 }).catch(() => null);
    if (resp == null) return null;
    const files = ((resp as any)?.files ?? (resp as any) ?? []) as any[];
    return (Array.isArray(files) ? files : [])
        .map(f => ({ id: f.id, name: f.name ?? "", subFileCount: f.subFileCount ?? 0, path: f.path ?? "" }));
}

/** 递归拉写作书结构树（白名单子树在层内剪枝；subFileCount>0 才下钻=平铺书
 *  只 1 发 HTTP。TreeDocRow.path=…/<id>.sy 形态，下钻目录=剥 .sy） */
export async function fetchWritingTree(box: string, bookID: string): Promise<TreeNode[]> {
    const excluded = await writingTreeExcludedIDs(bookID);
    const walk = async (dirPath: string): Promise<TreeNode[]> => {
        const got = await fetchDocLayer(box, dirPath);
        if (got === null) throw new Error(`fetchDocLayer failed: ${dirPath}`);
        const layer = got.filter(r => !excluded.has(r.id));
        return Promise.all(layer.map(async r => ({
            row: r,
            children: r.subFileCount > 0 ? await walk(r.path.replace(/\.sy$/, "")) : [],
        })));
    };
    return walk(`/${bookID}`);
}

/** fetchWritingTreeSlots 的 storage 注入位（生产懒 import 真 progStorage 防循环，
 *  单测注入 stub——vitest fetch 路由形态照 bookMapFront.test.ts） */
export interface TreeStorage {
    booksInfo(bookID: string): Promise<any>;
    updateBookInfo(bookID: string, patch: any): Promise<void>;
}

async function realStorage(): Promise<TreeStorage> {
    const { progStorage } = await import("./ProgressiveStorage");
    return progStorage as any;
}

/** 树缓存（30s TTL）：舰队 30s 刷新/菜单/调度同窗口共享一次拉取。写点（split/
 *  merge/append/align）显式 invalidateWritingTreeCache；手动树变动（拖拽/手建）
 *  靠 TTL 过期+出场链 detectWritingTreeDoc 实拉双保险 */
const treeCache = new Map<string, { at: number; slots: WritingTreeSlot[] }>();
const TREE_TTL_MS = 30_000;
const alignInFlight = new Map<string, Promise<void>>();

export function invalidateWritingTreeCache(bookID: string) {
    treeCache.delete(bookID);
}

/** 单测隔离用：清空树缓存（用例间模块态不串味——毒缓存实锤后照 progData
 *  resetAnchoredCacheForTest 先例） */
export function resetTreeCacheForTest() {
    treeCache.clear();
}

/** 存量书一次性整理：按 MarkKey 真值 point 序 changeSort 钉齐书下第一层→置位
 *  treeAligned（books.json 标记位=唯一开关：存量书真值序钉齐、新书出生即置位）。
 *  池夹钉最前、无标手动槽垫底（planTreeAlign）。半途失败不置位（下次重跑幂等
 *  自愈——changeSort 重钉无害）；真值 MarkKey 保留不洗（isProtylePiece/老链
 *  兼容，fetchWritingPieces 已不读它） */
async function alignTreeOrderOnce(bookID: string, box: string, storage: TreeStorage): Promise<void> {
    const running = alignInFlight.get(bookID);
    if (running) return running;
    const p = (async () => {
        const rows = await siyuan.sql(
            `select a.block_id as block_id, a.value as value from attributes a` +
            ` where a.name = '${MarkKey}' and a.value like '${TEMP_CONTENT}#${bookID},%' limit 10000000`) as any[];
        const pieces = parseWritingPieceRows(rows ?? [], bookID);
        const layer = await fetchDocLayer(box, `/${bookID}`);
        if (layer === null) throw new Error("alignTreeOrder: fetchDocLayer failed");
        if (layer.length === 0) {
            await storage.updateBookInfo(bookID, { treeAligned: true });
            return;
        }
        const points = new Map(pieces.map(pc => [pc.docID, pc.point]));
        if (points.size > 0) {
            const plan = planTreeAlign(layer, points, await writingTreeExcludedIDs(bookID));
            if (plan.needAlign) {
                await siyuan.call("/api/filetree/changeSort", { notebook: box, paths: plan.orderedPaths });
                debugLog("progtree", `alignTreeOrder done book=${bookID} slots=${points.size}（MarkKey 真值序钉齐）`);
            }
        }
        // P2-4：置位不走 updateBookInfo（会 bump info.time=存量书首触即「最近活跃」
        // 顶到入槽菜单前）；直改内存+落盘，stub 无 booksInfos 时兜底走老路
        const infos = (storage as any).booksInfos?.();
        if (infos && infos[bookID]) {
            infos[bookID].treeAligned = true;
            await (storage as any).saveBookInfos?.();
        } else {
            await storage.updateBookInfo(bookID, { treeAligned: true });
        }
    })().finally(() => alignInFlight.delete(bookID));
    alignInFlight.set(bookID, p);
    await p.catch(e => debugLog("progtree", `alignTreeOrder failed book=${bookID}: ${e}`));
}

/** 拉写作书树形槽列表（树权威唯一读口）：缓存命中直返；未 align 的书先整理再拉。
 *  info/storage 生产调用可省（走 booksInfo/真 storage） */
export async function fetchWritingTreeSlots(bookID: string, info?: any, storage?: TreeStorage): Promise<WritingTreeSlot[]> {
    const st = storage ?? await realStorage();
    const bi = info ?? await st.booksInfo(bookID);
    const box = bi?.boxID ?? "";
    if (!box) return [];
    const hit = treeCache.get(bookID);
    if (hit && Date.now() - hit.at < TREE_TTL_MS) return hit.slots;
    if (!bi.treeAligned) await alignTreeOrderOnce(bookID, box, st);
    // P1-2：拉取失败（含闭笔记本外的瞬断）不写缓存返 []，下次重试——错误导致的
    // 空槽列表钉 30s 比现挂空档更糟
    const nodes = await fetchWritingTree(box, bookID).catch(() => null);
    if (nodes === null) return [];
    const slots = flattenWritingTree(nodes, new Set(), bookID);
    treeCache.set(bookID, { at: Date.now(), slots });
    return slots;
}

// ============ 钉位 helper（split/append 建后归位；新建默认插顶的逆操作） ============

/** 新文档钉到 afterDocID 同层其后：拉 after 的父层全量→paths 插位→changeSort。
 *  after 缺位（被删）钉层尾兜底 */
export async function insertDocAfter(box: string, docID: string, afterDocID: string): Promise<void> {
    const after = await siyuan.getBlockInfo(afterDocID).catch(() => null);
    const afterPath = (after as any)?.path ?? "";
    if (!afterPath) throw new Error("insertDocAfter: anchor path missing");
    const dir = afterPath.split("/").slice(0, -1).join("/") || "/";
    const layer = await fetchDocLayer(box, dir);
    if (layer === null) throw new Error("insertDocAfter: fetchDocLayer failed");
    const mine = layer.find(r => r.id === docID);
    if (!mine) return; // 已不在该层（用户秒拖走）——尊重现状不钉
    const rest = layer.filter(r => r.id !== docID);
    const i = rest.findIndex(r => r.id === afterDocID);
    const paths = i >= 0
        ? [...rest.slice(0, i + 1).map(r => r.path), mine.path, ...rest.slice(i + 1).map(r => r.path)]
        : [...rest.map(r => r.path), mine.path];
    await siyuan.call("/api/filetree/changeSort", { notebook: box, paths });
}

/** 新文档钉到 parentDocID 子层末尾 */
export async function appendDocToEnd(box: string, docID: string, parentDocID: string): Promise<void> {
    const layer = await fetchDocLayer(box, `/${parentDocID}`);
    if (layer === null) throw new Error("appendDocToEnd: fetchDocLayer failed");
    const mine = layer.find(r => r.id === docID);
    if (!mine) return; // 已不在该层（用户秒拖走）——尊重现状不钉
    const paths = [...layer.filter(r => r.id !== docID).map(r => r.path), mine.path];
    await siyuan.call("/api/filetree/changeSort", { notebook: box, paths });
}

/** 出场树判定（懒补标/拖出剥标通道）：docID ∈ 某注册写作书的白名单外子树 → 返回
 *  bookID；全部书拉取失败 → 返回 "unknown"（调用方不下任何结论——P1-2：瞬时故障
 *  ≠树真不含，误剥标比晚剥标代价高）；确认不在 → null。
 *  P1-4：出场链对 click-editorcontent 每击都跑——先吃 30s 新鲜缓存的「包含」结论
 *  （快路径安全：陈旧树把拖出者多留 30s 与槽序本身的 staleness 同档），miss 或
 *  「不包含」才实拉下结论（破坏性判定必须新鲜证据） */
export async function detectWritingTreeDoc(docID: string): Promise<string | null | "unknown"> {
    if (!docID) return null;
    const { progStorage } = await import("./ProgressiveStorage");
    const entries = Object.entries(progStorage.booksInfos()).filter(([id, info]) =>
        info.writing && !info.ignored && !info.archived && progStorage.isRegisteredBook(id) && info.boxID);
    let anyFailed = false;
    for (const [bookID, info] of entries) {
        // 快路径：仅「新鲜缓存**包含**」才安全短路（复评 P1 实锤：不含必须 fall
        // through 实拉下结论——continue 会把懒补标打残+开误剥标窗口）
        const hit = treeCache.get(bookID);
        if (hit && Date.now() - hit.at < TREE_TTL_MS && hit.slots.some(sl => sl.docID === docID)) return bookID;
        // 慢路径：缓存 miss/不含 → 实拉下结论（含回写缓存——出场链 ifAvailable 锁
        // 下每击实拉会丢兄弟事件，实拉结论顺便惠及后续出场）
        const nodes = await fetchWritingTree(info.boxID, bookID).catch(() => null);
        if (nodes === null) { anyFailed = true; continue; }
        const slots = flattenWritingTree(nodes, new Set(), bookID);
        // 终判 P3：未 align 的存量书回写的是未整理物理序（fetchWritingTreeSlots 的
        // 缓存命中检查在 align 检查前）——只回写已置位书，防 30s 内调度/导航乱序
        if (info.treeAligned) treeCache.set(bookID, { at: Date.now(), slots });
        if (slots.some(sl => sl.docID === docID)) return bookID;
    }
    return anyFailed ? "unknown" : null;
}
