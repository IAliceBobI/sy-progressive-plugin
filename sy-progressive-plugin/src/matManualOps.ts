// manualops □1 剪贴自动记账（手动随意操作一等公民）：ws 事务监听 → delete/insert
// 同 id 配对 → 自动补 MATERIAL_KEY 血缘。上半区=纯函数（TDD 见 tests/unit/
// matManualOps.test.ts），下半区=IO 接线（root 解析/槽白名单/属性写/空壳清理），
// 行为由 dev 实例 e2e 覆盖——与 writeBook.ts 同款纪律。
// 血缘链降级语义（设计内非 bug）：块被剪出槽再剪回槽，血缘=中间文档而非原始出处
// （exits 撤键的必然推论——原始锚只在本体搬运（move 保 id+IAL）时才连续）。
import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";

/** 配对账条：blockID → 剪切来源文档 + 入账时刻 */
export interface MatopsEntry {
    sourceRootID: string;
    ts: number;
}

export type MatopsAccount = Map<string, MatopsEntry>;

/** 配对窗 TTL（默认 10 分钟，可调常量） */
export const MATOPS_TTL_MS = 10 * 60 * 1000;

/** 账本容量上限（防无限增长） */
export const MATOPS_CAP = 500;

/** delete ops 入账：同 id 覆盖刷新（新剪切=新源），先修剪过期、超容驱逐最老 */
export function accountDeletes(
    account: MatopsAccount,
    deletes: { id: string; sourceRootID: string }[],
    now: number,
    ttlMs: number = MATOPS_TTL_MS,
    cap: number = MATOPS_CAP,
): void {
    for (const [id, e] of account) {
        if (now - e.ts >= ttlMs) account.delete(id);
    }
    for (const d of deletes) {
        if (!d?.id || !d.sourceRootID) continue;
        account.set(d.id, { sourceRootID: d.sourceRootID, ts: now });
    }
    // 超额数先定格（循环内 size 随删除递减，动态边界=欠驱逐破 cap 不变量，review P1-1）
    const excess = account.size - cap;
    if (excess > 0) {
        const byTs = [...account.entries()].sort((a, b) => a[1].ts - b[1].ts);
        for (let i = 0; i < excess; i++) account.delete(byTs[i][0]);
    }
}

/** 补血缘组：同源一批同锚（值=源rootID#锚块id 逐块散挂同值） */
export interface MatopsPair {
    sourceRootID: string;
    anchorID: string;
    ids: string[];
}

/** insert 配对结果：pairs=槽内命中（补血缘+销账）；exits=非槽命中（撤血缘候选，账保留） */
export interface MatopsInsertMatch {
    pairs: MatopsPair[];
    exits: string[];
}

/** 粘贴 insert ops × 账本 × 槽白名单 → 配对。落槽=补血缘销账；非槽=撤血缘候选；
 *  过期/未在账=零动作（降级路径：复制粘贴新 id 永不命中） */
export function matchInserts(
    account: MatopsAccount,
    inserts: { id: string; targetRootID: string }[],
    slotIDs: ReadonlySet<string>,
    now: number,
    ttlMs: number = MATOPS_TTL_MS,
): MatopsInsertMatch {
    const pairsBySource = new Map<string, MatopsPair>();
    const exits: string[] = [];
    for (const ins of inserts) {
        const e = account.get(ins.id);
        if (!e || now - e.ts >= ttlMs) continue;
        if (slotIDs.has(ins.targetRootID)) {
            let p = pairsBySource.get(e.sourceRootID);
            if (!p) {
                p = { sourceRootID: e.sourceRootID, anchorID: ins.id, ids: [] };
                pairsBySource.set(e.sourceRootID, p);
            }
            p.ids.push(ins.id);
            account.delete(ins.id);
        } else {
            exits.push(ins.id);
        }
    }
    return { pairs: [...pairsBySource.values()], exits };
}

/** 拖块 move op 直配（无 delete 前置，源/目标两侧判定）：目标∈槽且源≠目标=补组
 *  （锚=组内末位 op id——前端拖拽/transMove 都逆序迭代，末位=文档序首块）；
 *  目标∉槽且源∈槽=撤血缘候选；同文档/两侧不涉槽=零动作 */
export function matchMoves(
    moves: { id: string; sourceRootID: string; targetRootID: string }[],
    slotIDs: ReadonlySet<string>,
): { pairs: MatopsPair[]; exits: string[] } {
    const pairsBySource = new Map<string, MatopsPair>();
    const exits: string[] = [];
    for (const m of moves) {
        if (!m?.id) continue;
        if (slotIDs.has(m.targetRootID)) {
            if (m.sourceRootID === m.targetRootID) continue;
            let p = pairsBySource.get(m.sourceRootID);
            if (!p) {
                p = { sourceRootID: m.sourceRootID, anchorID: m.id, ids: [] };
                pairsBySource.set(m.sourceRootID, p);
            }
            p.ids.push(m.id);
        } else if (slotIDs.has(m.sourceRootID)) {
            exits.push(m.id);
        }
    }
    // 锚=组内末位 op id：前端拖拽（editorCommonEvent 逆序循环）与 transMove 家族
    // （ids.slice().reverse()）都逆序提交，末位 op=文档序首块
    for (const p of pairsBySource.values()) p.anchorID = p.ids.at(-1) ?? p.anchorID;
    return { pairs: [...pairsBySource.values()], exits };
}

/** ws-main transactions 广播的三簇 ops 视图（纯提取，防御畸形 data） */
export interface MatopsTxView {
    deletes: { id: string; parentID?: string }[];
    inserts: { id: string; parentID?: string; previousID?: string }[];
    moves: { id: string; parentID?: string; previousID?: string }[];
    /** undo move/insert op 的原位映射（delete/move 的源侧判定：undo 原位在源文档） */
    undoMoveOf: Map<string, { parentID?: string; previousID?: string }>;
    undoInsertOf: Map<string, { parentID?: string; previousID?: string }>;
    rootIDs: string[];
    isUndoReplay: boolean;
}

export function matopsTxView(detail: any): MatopsTxView {
    const v: MatopsTxView = {
        deletes: [], inserts: [], moves: [],
        undoMoveOf: new Map(), undoInsertOf: new Map(), rootIDs: [], isUndoReplay: false,
    };
    const data = detail?.data;
    if (!Array.isArray(data)) return v;
    for (const tx of data) {
        const ops = tx?.doOperations;
        if (Array.isArray(ops)) {
            for (const op of ops) {
                if (!op?.id) continue;
                if (op.action === "delete") v.deletes.push({ id: String(op.id), parentID: op.parentID });
                else if (op.action === "insert") v.inserts.push({ id: String(op.id), parentID: op.parentID, previousID: op.previousID });
                else if (op.action === "move") v.moves.push({ id: String(op.id), parentID: op.parentID, previousID: op.previousID });
            }
        }
        const undos = tx?.undoOperations;
        if (Array.isArray(undos)) {
            for (const op of undos) {
                if (!op?.id) continue;
                const pos = { parentID: op.parentID, previousID: op.previousID };
                if (op.action === "move" && !v.undoMoveOf.has(op.id)) v.undoMoveOf.set(String(op.id), pos);
                else if (op.action === "insert" && !v.undoInsertOf.has(op.id)) v.undoInsertOf.set(String(op.id), pos);
            }
        }
    }
    const ctx = detail?.context;
    if (Array.isArray(ctx?.rootIDs)) v.rootIDs = ctx.rootIDs.map(String);
    v.isUndoReplay = ctx?.isUndoReplay === true;
    return v;
}

// ============ IO 段（root 解析/槽白名单/血缘写；行为由 dev 实例 e2e 覆盖） ============

import { MATERIAL_KEY, isSubstanceChild } from "./writeBook";
import { refreshMaterialTraceFor } from "./materialTrace";
import { fetchWritingTreeSlots, fetchDocLayer } from "./writeTree";
import { PDIGEST_CTIME } from "../../sy-tomato-plugin/src/libs/gconst";
import { progStorage } from "./ProgressiveStorage";

/** 配对账本（内存态：TTL/容量由 accountDeletes 修剪）。挂 globalThis——插件自身
 *  storage 写会触发 dataChanges 整重载（模块顶层重跑、Map 归零，6809 实锤一轮
 *  剪贴被重载吃账），页面级内存跨插件代际存活（与 globalThis 注册表同惯用法） */
const account: MatopsAccount = ((globalThis as any).__matopsLedger ??= new Map());

/** 槽白名单缓存（10s）：写点（split/merge/append）已有 30s 树缓存兜底，这里只挡
 *  高频 ws 事件的重复全书拉取 */
let slotSetCache: { at: number; ids: Set<string> } | null = null;
const SLOT_SET_TTL_MS = 10_000;

async function slotDocIDs(force = false): Promise<Set<string>> {
    if (!force && slotSetCache && Date.now() - slotSetCache.at < SLOT_SET_TTL_MS) return slotSetCache.ids;
    const ids = new Set<string>();
    const infos = progStorage.booksInfos();
    for (const [bookID, info] of Object.entries(infos)) {
        if (!info?.writing || info.ignored || info.archived || !progStorage.isRegisteredBook(bookID)) continue;
        for (const s of await fetchWritingTreeSlots(bookID)) ids.add(s.docID);
    }
    // 空集不钉缓存（review P1-2）：fetchWritingTreeSlots 失败返 []，若当「无槽」缓存
    // 10s——同窗 exits 是破坏性动作（撤真血缘无自愈）。有空书时空集几乎必是故障，
    // 立即重拉一次；确无槽的书每次双拉可忍（仅账目活跃窗口内触发）
    if (ids.size === 0 && hasWritingBooks() && !force) return slotDocIDs(true);
    if (ids.size > 0) slotSetCache = { at: Date.now(), ids };
    return ids;
}

function hasWritingBooks(): boolean {
    const infos = progStorage.booksInfos();
    return Object.entries(infos).some(([id, info]) =>
        info?.writing && !info.ignored && !info.archived && progStorage.isRegisteredBook(id));
}

/** 批量根解析：块/文档 id → root_id（文档行 root_id=自身，顶块与嵌块统一走这一发；
 *  锚块预存在=行稳定，索引延迟窗风险由失败侧降级承担） */
async function rootsOf(ids: string[]): Promise<Map<string, string>> {
    const uniq = [...new Set(ids.filter(Boolean))];
    const out = new Map<string, string>();
    if (uniq.length === 0) return out;
    const rows = (await siyuan.sql(
        `select id, root_id from blocks where id in (${uniq.map(i => `'${i}'`).join(",")}) limit ${uniq.length}`,
    ).catch(() => null)) as any[] | null;
    for (const r of rows ?? []) out.set(r.id, r.root_id);
    return out;
}

/** insert/move 落点解析（insert 族用；move 族走 moveTargetOf——次序相反，见其注释）：
 *  候选根里**槽优先**（嵌套槽场景 parentID 可能落在父文档，previousID 兄弟块才是槽内
 *  真锚——白名单相交消歧），无槽命中取首候选（非槽落点判定用），全空=""（解析失败=
 *  保守零动作）。⚠ 真前端粘贴的 insert op 常不带 parentID/previousID（DOM 先行 tx 只
 *  带 id+data，6809 实测）——rootIDs 兜底进候选（真编辑器事务 context 恒在） */
export function resolveTarget(
    op: { parentID?: string; previousID?: string },
    roots: ReadonlyMap<string, string>,
    slots: ReadonlySet<string>,
    rootIDs: string[] = [],
): string {
    const cands = [
        ...rootIDs,
        roots.get(op.parentID ?? ""),
        roots.get(op.previousID ?? ""),
        op.parentID,
        op.previousID,
    ].filter(Boolean) as string[];
    return cands.find(c => slots.has(c)) ?? cands[0] ?? "";
}

/** move 族落点解析（review P0-2）：**位置派生候选优先、rootIDs 只兜底**——与 insert
 *  相反的次序是结构必需：拖出槽的 tx rootIDs=[源槽,目标]，槽优先扫描若扫到 rootIDs
 *  会把源槽当目标（sourceRootID===targetRootID 零动作，拖出槽撤血缘整半不可达）；
 *  真拖拽 move op 恒带 parentID/previousID（editorCommonEvent dropEvent 实锤），
 *  rootIDs-first 只对「不带位置的粘贴 insert」是刚需 */
export function moveTargetOf(
    op: { parentID?: string; previousID?: string },
    roots: ReadonlyMap<string, string>,
    slots: ReadonlySet<string>,
    rootIDs: string[] = [],
): string {
    const pos = [roots.get(op.parentID ?? ""), roots.get(op.previousID ?? ""), op.parentID, op.previousID]
        .filter(Boolean) as string[];
    return pos.find(c => slots.has(c)) ?? pos[0]
        ?? rootIDs.find(r => slots.has(r)) ?? rootIDs[0] ?? "";
}

/** 补血缘组（逐块散挂同值=kernel placeMaterialIntoSlot 先例；keep-first：块上已有
 *  血缘不覆盖——胶囊整块剪贴搬运保真源）。读失败单次重试后仍空=按新块落写（剪贴
 *  主流量=原创内容无血缘，漏写=主链失败代价更高） */
async function applyPairs(pairs: MatopsPair[]) {
    for (const p of pairs) {
        const value = `${p.sourceRootID}#${p.anchorID}`;
        let written = 0;
        for (const id of p.ids) {
            try {
                let attrs = await siyuan.getBlockAttrs(id).catch(() => null);
                // 空 map 同为读闪烁形态（踩坑索引：非只有 null——同块连续直读一空一有），
                // 重试后仍空按新块落写（剪贴主流量=原创内容无血缘，漏写代价更高）
                if (attrs == null || Object.keys(attrs).length === 0) {
                    await new Promise(r => setTimeout(r, 250));
                    attrs = await siyuan.getBlockAttrs(id).catch(() => null);
                }
                if (attrs?.[MATERIAL_KEY]) continue;
                await siyuan.setBlockAttrs(id, { [MATERIAL_KEY]: value } as any);
                written++;
            } catch (e) {
                debugLog("matops", `补血缘失败 block=${id}: ${e}`, "progressive");
            }
        }
        debugLog("matops", `配对成功 +${written}/${p.ids.length} 块 lineage=${value}（剪贴自动记账）`, "progressive");
        try { refreshMaterialTraceFor(p.sourceRootID); } catch { /* 刷新链失败不挡记账 */ }
    }
}

/** 撤血缘（剪/拖出槽防徽标错乱：markMaterials 按属性在任何文档都渲染）。空串=删键
 *  （setPieceDoneState 同款入参形态）；块上无键零动作 */
async function applyExits(ids: string[]) {
    for (const id of ids) {
        try {
            const attrs = await siyuan.getBlockAttrs(id).catch(() => null);
            if (attrs == null || !attrs[MATERIAL_KEY]) continue;
            await siyuan.setBlockAttrs(id, { [MATERIAL_KEY]: "" } as any);
            debugLog("matops", `撤血缘 block=${id}（离槽撤徽标）`, "progressive");
        } catch (e) {
            debugLog("matops", `撤血缘失败 block=${id}: ${e}`, "progressive");
        }
    }
}

/** 空壳自动清（moveDigestIntoPiece 空壳续收同语义）：delete 清空摘抄文档（带
 *  custom-pdigest-ctime）全部实质块 → 复查 getChildBlocks 过滤 isSubstanceChild 为空
 *  → removeDocByID 删源。⚠️ 一发即删：任何拉取失败不删；有物理子文档跳过保树
 *  （removeDocByID 连删整棵子树，path 层反查） */
async function cleanupEmptyDigest(docIDs: string[]) {
    for (const docID of docIDs) {
        try {
            const attrs = await siyuan.getBlockAttrs(docID).catch(() => null);
            if (!attrs || !attrs[PDIGEST_CTIME]) continue;
            const children = await siyuan.getChildBlocks(docID).catch(() => null);
            if (children == null || children.some(isSubstanceChild)) continue;
            // 子文档守卫=父层磁盘直查读 subFileCount（review P0-1：SQL path-like 三向量
            // 绕过——拉取失败 dir 空裸删/标题单引号必炸 SQL 恒 null 裸删/新子文档索引窗
            // 漏判连坐删子树）。⚠ 直列自身不可用：无子文档的档其目录物理不存在，
            // listDocsByPath("/<id>") 必 code:-1 与真故障不可分——父层计数是唯一可靠信号
            const info = await siyuan.getBlockInfo(docID).catch(() => null);
            if (!info?.box || !info?.path) continue; // 取向失败=不删（守卫不可跳过）
            const segs = String(info.path).replace(/\.sy$/, "").split("/").filter(Boolean);
            const relParent = segs.slice(1, -1).join("/"); // 剥盒前缀与自身段
            const layer = await fetchDocLayer(info.box, relParent ? `/${relParent}` : "/");
            if (layer == null) continue; // 父层拉取失败=不删
            const mine = layer.find(r => r.id === docID);
            if (!mine || mine.subFileCount > 0) continue; // 瞬态不在父层/有子文档=保树
            await siyuan.removeDocByID(docID);
            debugLog("matops", `空壳清理 doc=${docID}（剪空摘抄自动删源）`, "progressive");
        } catch (e) {
            debugLog("matops", `空壳清理跳过 doc=${docID}: ${e}`, "progressive");
        }
    }
}

/** delete 簇入账 + 空壳复查排程。源解析优先级：被删块自身 root 直读（广播即刻
 *  blocks 表删除滞后索引窗——旧行几乎必在；行已清=miss 降级）→ undo insert 原位
 *  parentID → delete op 自带 parentID → rootIDs 单根兜底 */
async function handleDeletes(v: MatopsTxView) {
    if (!hasWritingBooks()) return; // 无写作书=配对/exit 均不可达，省每笔块删除的 rootsOf（review P2-6）
    const anchors = new Set<string>(v.deletes.map(d => d.id));
    for (const d of v.deletes) {
        const undo = v.undoInsertOf.get(d.id);
        if (undo?.parentID) anchors.add(undo.parentID);
        if (d.parentID) anchors.add(d.parentID);
    }
    const roots = await rootsOf([...anchors]);
    const deletes: { id: string; sourceRootID: string }[] = [];
    for (const d of v.deletes) {
        const undo = v.undoInsertOf.get(d.id);
        const src = roots.get(d.id) ?? roots.get(undo?.parentID ?? "") ?? roots.get(d.parentID ?? "")
            ?? (v.rootIDs.length === 1 ? v.rootIDs[0] : "");
        if (src) deletes.push({ id: d.id, sourceRootID: src });
    }
    if (deletes.length === 0) return;
    accountDeletes(account, deletes, Date.now());
    debugLog("matops", `delete 入账 +${deletes.length}：${deletes.map(d => d.id.slice(-6) + "←" + d.sourceRootID.slice(-6)).join(",")}`, "progressive");
    // 空壳复查：延迟落盘稳定后再读（tx 已提交，getBlocks 走树通道；800ms 起步）
    const srcRoots = [...new Set(deletes.map(d => d.sourceRootID))];
    setTimeout(() => { void cleanupEmptyDigest(srcRoots); }, 800);
}

/** insert 簇配对（粘贴落点判定）。账本零命中直接返回（普通粘贴/打字零成本） */
async function handleInserts(v: MatopsTxView) {
    if (account.size === 0) return;
    const hits = v.inserts.filter(i => account.has(i.id));
    if (hits.length === 0) {
        debugLog("matops", `insert 零命中（普通粘贴/打字）：insertIds=[${v.inserts.map(i => i.id.slice(-6)).join(",")}] 账键=[${[...account.keys()].map(k => k.slice(-6)).join(",")}]`, "progressive");
        return;
    }
    const slots = await slotDocIDs();
    const roots = await rootsOf(hits.flatMap(i => [i.parentID, i.previousID]).filter(Boolean) as string[]);
    const resolved = hits
        .map(i => ({ id: i.id, targetRootID: resolveTarget(i, roots, slots, v.rootIDs) }))
        .filter(i => i.targetRootID);
    debugLog("matops", `insert 处理 hits=${hits.length} slots=${slots.size} rootsQueried=${roots.size} resolved=${resolved.map(r => r.id.slice(-6) + "→" + r.targetRootID.slice(-6)).join(",") || "无"} rootIDs=[${v.rootIDs.map(r => r.slice(-6)).join(",")}]`, "progressive");
    const m = matchInserts(account, resolved, slots, Date.now());
    await applyPairs(m.pairs);
    await applyExits(m.exits);
    if (m.exits.length) debugLog("matops", `insert 非槽落点 ${m.exits.length} 块出撤血缘候选（账保留）`, "progressive");
}

/** move 簇直配（拖块：无 delete 前置，源侧=undo 原位、目标侧=do op 新位）。广播
 *  rootIDs 与槽无交集即返回（跨文档拖拽两侧树都在 rootIDs——不涉槽的移动零 SQL；
 *  无写作书用户近零开销） */
async function handleMoves(v: MatopsTxView) {
    if (!hasWritingBooks()) return;
    const slots = await slotDocIDs();
    if (slots.size === 0) return;
    if (!v.rootIDs.some(r => slots.has(r))) return;
    const anchors = new Set<string>();
    for (const m of v.moves) {
        if (m.parentID) anchors.add(m.parentID);
        if (m.previousID) anchors.add(m.previousID);
        const u = v.undoMoveOf.get(m.id);
        if (u?.parentID) anchors.add(u.parentID);
        if (u?.previousID) anchors.add(u.previousID);
    }
    const roots = await rootsOf([...anchors]);
    const moves = v.moves
        .map(m => {
            const targetRootID = moveTargetOf(m, roots, slots, v.rootIDs);
            const u = v.undoMoveOf.get(m.id);
            // 源候选只认解析根（裸块 id 当源=产出指向块的死链血缘，review P2-5）
            const srcCands = [roots.get(u?.parentID ?? ""), roots.get(u?.previousID ?? "")]
                .filter(Boolean) as string[];
            let sourceRootID = srcCands[0] ?? "";
            if (!sourceRootID && targetRootID) {
                // rootIDs 兜底：跨文档移动 tx=[源,目标]，非目标即源；单根=同文档（零动作）
                const others = v.rootIDs.filter(r => r !== targetRootID);
                sourceRootID = others.length === 1 ? others[0] : "";
            }
            return { id: m.id, sourceRootID, targetRootID };
        })
        .filter(m => m.sourceRootID && m.targetRootID);
    const r = matchMoves(moves, slots);
    await applyPairs(r.pairs);
    await applyExits(r.exits);
}

/** ws-main 入口（index.ts 订阅转发；非 transactions cmd 零动作；undo 重放整批跳过
 *  防撤销噪声）。全程吞错：记账员不打扰编辑主链 */
export async function onMatopsWsMain(detail: any): Promise<void> {
    if (detail?.cmd !== "transactions") return;
    let v: MatopsTxView;
    try {
        v = matopsTxView(detail);
    } catch {
        return;
    }
    if (v.isUndoReplay) return;
    if (v.deletes.length === 0 && v.inserts.length === 0 && v.moves.length === 0) return;
    debugLog("matops", `ws tx deletes=${v.deletes.length} inserts=${v.inserts.length} moves=${v.moves.length} rootIDs=${v.rootIDs.join(",")}`, "progressive");
    try {
        if (v.deletes.length > 0) await handleDeletes(v);
        if (v.inserts.length > 0) await handleInserts(v);
        if (v.moves.length > 0) await handleMoves(v);
    } catch (e) {
        debugLog("matops", `ws 处理异常（降级零动作）: ${e}`, "progressive");
    }
}
