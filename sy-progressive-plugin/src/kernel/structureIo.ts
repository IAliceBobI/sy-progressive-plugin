// progtree □2 结构树 kernel IO 面（goja）：树拉取（listDocsByPath 递归=□1 树权威 kernel
// 平移，不碰 MarkKey 序语义）/素材盘点（ctime 归属=位置无关）/建槽/reparent/素材归位。
// 纯函数核=src/structureCore.ts（kernel 直接 import，splitCore 先例）；常量本地声明防拖
// 前端依赖链（bookConvertIo MarkKey 先例，改源头须同步）。
// 四分叉定案（计划档 docs/superpowers/plans/2026-09-13-progtree-structure-mcp.md）：
// 素材身份=ctime 归属、槽身份=MarkKey、sacred=含手写内容（用户原创保护，manualops 翻转定案）、位置四档只报告不误动。
import * as api from "./api";
import { readBooksInfos } from "./progData";
import { runExclusive, readVolTable } from "./bookMapIo";
import { volOffsets } from "../volIndex";
import {
    planStructureActions, slotNameFromTitle, deriveSlotGuard, blocksToSlotText, planSlotReadPage, composeTitle, BOOK_ROOT_ID,
    type StructSlot, type StructMaterial, type SkeletonNode, type Placement, type StructureDiff,
} from "../structureCore";

const MarkKey = "custom-progmark";
const TEMP_CONTENT = "插件管理勿改managedByPluginDoNotModify";
const MATERIAL_KEY = "custom-prog-material";
const PROG_DONE_KEY = "custom-prog-done";
const BLOCK_ID_RE = /^\d{14}-[a-z0-9]{7}$/;
const PLUGIN_CUSTOM_FENCE = ";;;sy-progressive-plugin/";
/** 素材盘点上限/次（60 片哲学平移；超出 offset 翻页） */
export const MATERIAL_LIMIT = 60;
/** distill 标题节点上限/次（巨范文分批） */
export const DISTILL_HEADING_LIMIT = 300;

function log(msg: string) { void siyuan.logger.info("[progtree]", msg); }

/** 七锚值（复刻自前端 progData.getDocIal*：digestdir×3/words/编译成稿×2/AI 成稿——
 *  改源头须同步。composedoc=loosemat □7 成文产物，多稿并存） */
function anchorValues(bookID: string): string[] {
    return [
        `digestdir#${TEMP_CONTENT}#${bookID}`,
        `digestdiru#${TEMP_CONTENT}#${bookID}`,
        `digestdirh#${TEMP_CONTENT}#${bookID}`,
        `words#${TEMP_CONTENT}#${bookID}`,
        `newBookDoc#${TEMP_CONTENT}#${bookID}`,
        `allInOneKeysDoc#${TEMP_CONTENT}#${bookID}`,
        `composedoc#${TEMP_CONTENT}#${bookID}`,
    ];
}

/** 白名单六锚认回（attributes 一发；kernel 长流程无前端 freshCreatedIds 诉求） */
async function excludedIDs(bookID: string): Promise<Set<string>> {
    const anchors = anchorValues(bookID);
    const rows = await api.sql<{ block_id: string }>(
        `select block_id from attributes where name='${MarkKey}' and value in (${anchors.map(a => `'${a}'`).join(",")}) limit 10000000`) ?? [];
    return new Set(rows.map(r => String(r.block_id)));
}

interface TreeRow { id: string; name: string; subFileCount: number; path: string }
interface TreeNode { row: TreeRow; children: TreeNode[] }

/** 树递归拉取（listDocsByPath：sort=15 生效序/maxListCount:0/subFileCount>0 下钻/行 path
 *  剥 .sy——6808 实测契约。空目录=api 层语义化 []；真失败上抛中止整链（P1-2：fail-open
 *  瞬断当空树=apply 误建重复槽，宁可报错不误判） */
async function fetchTreeRows(box: string, dirPath: string, excluded: Set<string>): Promise<TreeNode[]> {
    const files = await api.listDocsByPath(box, dirPath);
    const layer = (files ?? []).filter((f: any) => !excluded.has(String(f.id ?? "")));
    return Promise.all(layer.map(async (f: any) => ({
        row: { id: String(f.id ?? ""), name: String(f.name ?? ""), subFileCount: Number(f.subFileCount ?? 0), path: String(f.path ?? "") },
        children: Number(f.subFileCount ?? 0) > 0
            ? await fetchTreeRows(box, String(f.path ?? "").replace(/\.sy$/, ""), excluded) : [],
    })));
}

/** 实质子块判定（复刻自 writeBook.isSubstanceChild：空段落+本插件 custom 块剔除） */
function isSubstanceChildKernel(c: any): boolean {
    if (c?.type === "p" && !String(c?.content ?? "").trim()) return false;
    if (c?.type === "custom" && String(c?.markdown ?? "").startsWith(PLUGIN_CUSTOM_FENCE)) return false;
    return true;
}

/** 槽守卫：sacred=含手写实质块（用户原创=默认保护）+ 素材篇数 + 手写块数（判定核=
 *  structureCore.deriveSlotGuard 同源）。拉取失败按 sacred=true——保护性判定
 *  fail-safe（宁可误拦不误挪，翻转后语义=误保护优于误动用户原创） */
async function slotGuardState(docID: string): Promise<{ sacred: boolean; materialCount: number; handwrittenCount: number }> {
    const children = await api.getChildBlocks(docID).catch(() => null);
    if (children == null) return { sacred: true, materialCount: 0, handwrittenCount: 0 };
    const substance = (children ?? []).filter(isSubstanceChildKernel).map(c => String(c.id));
    if (!substance.length) return { sacred: false, materialCount: 0, handwrittenCount: 0 };
    const inList = substance.map(i => `'${i}'`).join(",");
    const rows = await api.sql<{ block_id: string; value: string }>(
        `select block_id, value from attributes where name='${MATERIAL_KEY}' and block_id in (${inList}) limit 10000000`) ?? [];
    return deriveSlotGuard(substance, rows);
}

/** 拉写作书结构槽现状（树权威+判定层：done/marked/sacred/素材篇数/手写块数；每次实拉无缓存）。
 *  带本书 ctime 的文档=素材不是槽（分叉 3 定案「槽下无 ctime 文档=结构」反推；
 *  review P1-3：书根直属素材混进槽列表会冒名骨架同名节点→该分支动作全被误拦） */
export async function fetchStructureSlots(bookID: string, withGuard = true): Promise<StructSlot[]> {
    const info = (await readBooksInfos())[bookID];
    const box = info?.boxID ?? "";
    if (!box) return [];
    const excluded = await excludedIDs(bookID);
    const ctimeRows = await api.sql<{ block_id: string }>(
        `select block_id from attributes where name='custom-pdigest-ctime' and (value like '${bookID}#%' or value like '🔨#${bookID}#%') limit 10000000`) ?? [];
    for (const r of ctimeRows) excluded.add(String(r.block_id));
    const nodes = await fetchTreeRows(box, `/${bookID}`, excluded);
    const flat: StructSlot[] = [];
    const walk = (list: TreeNode[], parentID: string, depth: number) => {
        for (const n of list) {
            flat.push({ docID: n.row.id, title: slotNameFromTitle(n.row.name), depth, parentID, done: false, sacred: false, marked: false, materialCount: 0, handwrittenCount: 0 });
            walk(n.children, n.row.id, depth + 1);
        }
    };
    walk(nodes, BOOK_ROOT_ID, 0);
    const ids = flat.map(s => s.docID);
    if (!ids.length) return flat;
    const inList = ids.map(i => `'${i}'`).join(",");
    const [doneRows, markRows] = await Promise.all([
        api.sql<{ block_id: string }>(`select block_id from attributes where name='${PROG_DONE_KEY}' and value='1' and block_id in (${inList}) limit 10000000`),
        api.sql<{ block_id: string }>(`select block_id from attributes where name='${MarkKey}' and value like '${TEMP_CONTENT}#${bookID},%' and block_id in (${inList}) limit 10000000`),
    ]);
    const doneSet = new Set((doneRows ?? []).map(r => String(r.block_id)));
    const markSet = new Set((markRows ?? []).map(r => String(r.block_id)));
    for (const s of flat) { s.done = doneSet.has(s.docID); s.marked = markSet.has(s.docID); }
    if (withGuard) {
        for (const s of flat) {
            const g = await slotGuardState(s.docID);
            s.sacred = g.sacred;
            s.materialCount = g.materialCount;
            s.handwrittenCount = g.handwrittenCount;
        }
    }
    return flat;
}

export interface MaterialRow extends StructMaterial { excerpt: string }

/** 箱内素材盘点：ctime 归属（位置无关）+四档位置分类+块数/字数/摘录（逐篇 getChildBlocks） */
export async function collectMaterials(
    bookID: string, slotIDs: Set<string>, anchorIDs: Set<string>,
): Promise<{ materials: MaterialRow[]; total: number }> {
    const rows = await api.sql<{ block_id: string; value: string }>(
        `select block_id, value from attributes where name='custom-pdigest-ctime' and (value like '${bookID}#%' or value like '🔨#${bookID}#%') limit 10000000`) ?? [];
    const materials: MaterialRow[] = [];
    for (const r of rows) {
        const id = String(r.block_id);
        const info = await api.getBlockInfo(id).catch(() => null);
        // removeDocByID 后 attributes 行有索引残留窗（写后立读假行）——文档本体不可读
        // =已删，不计入箱（apply 写后验真摘要依赖此判定；瞬时误剔下轮盘点自愈）
        if (!info?.box || !info?.path) continue;
        const parentSeg = String(info.path).split("/").filter(Boolean).at(-2) ?? "";
        const location: StructMaterial["location"] = anchorIDs.has(parentSeg) ? "pool"
            : parentSeg === bookID ? "root"
                : slotIDs.has(parentSeg) ? "inSlot" : "elsewhere";
        const children = await api.getChildBlocks(id).catch(() => [] as any[]);
        const substance = (children ?? []).filter(isSubstanceChildKernel);
        const charCount = substance.reduce((s, c) => s + String(c?.content ?? "").length, 0);
        const firstText = String(substance.find(c => String(c?.content ?? "").trim())?.content ?? "").replace(/\s+/g, " ").trim();
        materials.push({
            id, title: String(info?.name ?? "") || id.slice(0, 8), location,
            done: String(r.value).startsWith("🔨#"), blockCount: substance.length, charCount,
            excerpt: firstText.slice(0, 200),
        });
    }
    materials.sort((a, b) => a.id.localeCompare(b.id));
    return { materials, total: materials.length };
}

/** 平铺槽 → 嵌套树（plan 返回形态：AI/用户可读结构面） */
export function buildSlotTree(slots: StructSlot[]): Record<string, any>[] {
    const byParent = new Map<string, { slot: StructSlot; node: Record<string, any> }[]>();
    for (const s of slots) {
        const entry = { slot: s, node: { title: s.title, docID: s.docID, done: s.done, sacred: s.sacred, marked: s.marked, materialCount: s.materialCount, handwrittenCount: s.handwrittenCount, children: [] as Record<string, any>[] } };
        const list = byParent.get(s.parentID) ?? [];
        list.push(entry);
        byParent.set(s.parentID, list);
    }
    const attach = (parentID: string): Record<string, any>[] =>
        (byParent.get(parentID) ?? []).map(e => { e.node.children = attach(e.slot.docID); return e.node; });
    return attach(BOOK_ROOT_ID);
}

// ============ 写操作件 ============

/** 槽身份 attrs（mini-spec 定死：card-priority 50 + MarkKey 0 值 + alias 书名,槽名） */
function slotAttrs(bookID: string, bookName: string, title: string): Record<string, string> {
    return {
        "custom-card-priority": "50",
        [MarkKey]: `${TEMP_CONTENT}#${bookID},0`,
        alias: bookName ? `${bookName},${title}` : title,
    };
}

/** 建子槽两步（HTTP createDocWithMd 传 custom- 不落 IAL——建后补 setBlockAttrs+复核读）。
 *  物理撞名兜底=缀时间戳（diff 层已消化骨架内同名；此处防树外意外文档劫持） */
async function createSlotDoc(box: string, bookID: string, bookName: string, parentDocID: string, title: string): Promise<string> {
    const parentHPath = await api.getHPathByID(parentDocID, box);
    if (!parentHPath) throw new Error(`拿不到父槽可读路径（parent=${parentDocID}）`);
    let path = `${parentHPath}/${title}`;
    if ((await api.getIDsByHPath(box, path)).length > 0) path = `${path}-${Date.now()}`;
    const docID = await api.createDocWithMd(box, path, "");
    if (!docID) throw new Error(`建槽失败（path=${path}）`);
    const attrs = slotAttrs(bookID, bookName, title);
    await api.setBlockAttrs(docID, attrs);
    const after = await api.getBlockAttrs(docID).catch(() => null);
    if (after?.[MarkKey] !== attrs[MarkKey]) throw new Error(`槽身份 IAL 落盘验真失败（docID=${docID}）`);
    return docID;
}

/** 新文档钉到 parentDocID 子层末尾（新建默认插顶的逆操作；已不在该层=尊重现状不钉） */
async function appendSlotToEnd(box: string, docID: string, parentDocID: string): Promise<void> {
    const info = parentDocID ? await api.getBlockInfo(parentDocID).catch(() => null) : null;
    const dir = String(info?.path ?? "").replace(/\.sy$/, "");
    if (!dir) throw new Error(`appendSlotToEnd: 父槽路径缺失（${parentDocID}）`);
    const files = await api.listDocsByPath(box, dir).catch(() => [] as any[]);
    const mine = (files ?? []).find((f: any) => String(f.id ?? "") === docID);
    if (!mine) return;
    const paths = [...(files ?? []).filter((f: any) => String(f.id ?? "") !== docID).map((f: any) => String(f.path ?? "")), String(mine.path ?? "")];
    await api.changeSort(box, paths);
}

/** 素材归位（moveDigestIntoPiece kernel 同构）：子文档守卫（磁盘直查，索引窗免疫）→
 *  搬块保 id→逐块挂 MATERIAL_KEY 血缘（review P1-1：不挂则下轮 sacred 误判=体系自搬
 *  的块被当「人动过」，增量管道对已归位槽失能；值=materialID#首块 同散挂先例）→
 *  复核源空→删源。返回搬入块数；throw=中止可重试续搬（源不删不丢数据） */
async function placeMaterialIntoSlot(materialID: string, targetDocID: string): Promise<number> {
    const info = await api.getBlockInfo(materialID).catch(() => null);
    if (!info?.box || !info?.path) throw new Error(`素材不可读（${materialID} 可能已删）`);
    // 子文档守卫：listDocsByPath 磁盘直查（P1-5——SQL path like 有索引延迟窗，刚建的
    // 子文档查不到会被 removeDocByID 连坐整棵子树）
    const subDocs = await api.listDocsByPath(info.box, String(info.path).replace(/\.sy$/, ""));
    if ((subDocs ?? []).length > 0) throw new Error(`素材有子文档（${subDocs.length} 个）——先处理子文档再归位`);
    const children = await api.getChildBlocks(materialID).catch(() => null);
    if (children == null) throw new Error("素材内容拉取失败（可重试）");
    const substance = (children ?? []).filter(isSubstanceChildKernel);
    if (substance.length === 0) {
        // 空壳续收（前端 moveDigestIntoPiece 同语义）：源已无实质块，直接删源收口
        await api.removeDocByID(materialID);
        return 0;
    }
    const tail = await api.getDocLastID(targetDocID);
    if (tail) await api.transMoveBlocksAfter(substance.map(c => String(c.id)), tail);
    else await api.transMoveBlocksAsChild(substance.map(c => String(c.id)), targetDocID);
    // P1-1 血缘：逐块散挂（事务通道 updateBlockAttrs 无效——踩坑索引，走 HTTP 端点）。
    // 源文档即将删除，血缘跳转是死链（前端徽标轻噪声），sacred/计数语义正确性优先。
    // 挂载失败只留痕不阻断归位（复评 P2-A：丢血缘=该槽 sacred 误判回归，须可排障）
    const anchorBlock = String(substance[0].id);
    for (const b of substance) {
        await api.setBlockAttrs(String(b.id), { [MATERIAL_KEY]: `${materialID}#${anchorBlock}` }).catch(e => {
            void siyuan.logger.error("[progtree]", `material lineage lost block=${b.id} material=${materialID}: ${e}`);
        });
    }
    const remain = ((await api.getChildBlocks(materialID).catch(() => [] as any[])) ?? []).filter(isSubstanceChildKernel);
    if (remain.length > 0) throw new Error(`搬块后源残留 ${remain.length} 块（中止不删源，可重试续搬）`);
    await api.removeDocByID(materialID);
    return substance.length;
}

// ============ 三工具入口 ============

/** 写作书守卫（map_* 的 mapBookGuard 同构+writing 校验：结构管道只对写作书开放） */
async function structureBookGuard(bookID: string): Promise<{ boxID: string; bookName: string } | string> {
    if (!BLOCK_ID_RE.test(bookID)) return `bookID 形态非法：${bookID.slice(0, 40)}（list_books 返回的书壳文档 id）`;
    const info = (await readBooksInfos())[bookID];
    if (!info) return `书未注册（bookID=${bookID}，先 list_books 拿在册书）`;
    if (!info.writing) return "structure_* 只对写作书开放（该 bookID 不是写作书）";
    return { boxID: info.boxID ?? "", bookName: info.bookName ?? "" };
}

export interface PlanResult {
    mode: "inventory" | "preview";
    book: { bookID: string; boxID: string; bookName: string };
    slots: Record<string, any>[];
    materials?: { list: MaterialRow[]; total: number; offset: number; limit: number };
    gaps?: { title: string; docID: string }[];
    diff?: StructureDiff;
    hint: string;
}

const PLAN_HINT = [
    "结构管道契约：本工具给素材与现状，你（AI）归纳骨架 [{title, children?}] 与归位表 [{materialID, slotPath}]（slotPath=骨架标题路径，/ 分隔）。",
    "把骨架+归位表回传 structure_plan 做预演（返回动作清单不落盘），与用户确认后 structure_apply 执行。",
    "增量铁律：不删槽/不重排既有顺序/不改名；含手写内容的槽(sacred=用户原创，默认保护，AI 不动其结构)与已定稿槽只报告不挪不入；素材归位=内容搬进槽+删源（可拖回思源原生兜底）。",
    "盘点平权：每槽 materialCount=素材篇数（血缘去重）、handwrittenCount=手写块数（用户原创，与素材同为正当公民）；缺口=空槽（materialCount=0）；location=inSlot=用户已手动挂进结构（既成事实，不自动处理）。",
].join("");

/** structure_plan（纯读两模式）：盘点（无 slots）=素材页+槽树+缺口；预演（带 slots）=增量动作清单 */
export async function structurePlan(
    bookID: string,
    opts: { slots?: SkeletonNode[]; placements?: Placement[]; offset?: number } = {},
): Promise<PlanResult> {
    const guard = await structureBookGuard(bookID);
    if (typeof guard === "string") throw new Error(guard);
    const slots = await fetchStructureSlots(bookID);
    const anchorIDs = await excludedIDs(bookID);
    const { materials, total } = await collectMaterials(bookID, new Set(slots.map(s => s.docID)), anchorIDs);
    const base = {
        book: { bookID, boxID: guard.boxID, bookName: guard.bookName },
        slots: buildSlotTree(slots),
    };
    if (opts.slots) {
        const diff = planStructureActions(slots, materials, opts.slots, opts.placements ?? []);
        return { mode: "preview", ...base, diff, hint: PLAN_HINT };
    }
    const offset = Math.max(0, Number(opts.offset ?? 0));
    return {
        mode: "inventory", ...base,
        materials: { list: materials.slice(offset, offset + MATERIAL_LIMIT), total, offset, limit: MATERIAL_LIMIT },
        gaps: slots.filter(s => !s.sacred && !s.done && s.materialCount === 0).map(s => ({ title: s.title, docID: s.docID })),
        hint: PLAN_HINT,
    };
}

export interface ApplyResult {
    bookID: string;
    diff: StructureDiff;
    created: { title: string; docID: string; parentPath: string }[];
    reparented: { title: string; docID: string; toParentPath: string }[];
    placed: { materialID: string; targetTitle: string; movedBlocks: number }[];
    failed: { ref: string; error: string }[];
    after: { slotCount: number; materialsRemaining: number };
}

/** structure_apply：执行增量计划。执行序=建槽（骨架 DFS 序）→reparent→素材归位；
 *  写后验真=树复读+素材复读摘要。runExclusive 与 map_save/convert 共闸防并发 */
export async function structureApply(bookID: string, skeleton: SkeletonNode[], placements: Placement[]): Promise<ApplyResult> {
    const guard = await structureBookGuard(bookID);
    if (typeof guard === "string") throw new Error(guard);
    if (!Array.isArray(skeleton) || !skeleton.length) throw new Error("slots 必填：骨架树 [{title, children?}]（structure_plan 预演确认后原样传入）");
    return runExclusive(bookID, async () => {
        const slots = await fetchStructureSlots(bookID);
        const anchorIDs = await excludedIDs(bookID);
        const { materials } = await collectMaterials(bookID, new Set(slots.map(s => s.docID)), anchorIDs);
        const diff = planStructureActions(slots, materials, skeleton, placements ?? []);

        // 骨架路径 → docID 寻址表（diff.resolved=单一事实源；将建项建后回填）
        const addr = new Map(diff.resolved.filter(r => r.docID).map(r => [r.path, r.docID]));

        // 1) 建槽（diff.creates 已是骨架 DFS 序：父（既有或先建）必先于子在序中）
        const created: ApplyResult["created"] = [];
        for (const c of diff.creates) {
            const finalTitle = c.seqTitle ?? c.title;
            const path = c.parentPath ? `${c.parentPath}/${c.title}` : c.title;
            const parentDocID = c.parentPath ? (addr.get(c.parentPath) ?? "") : bookID;
            if (!parentDocID) { diff.skips.push({ ref: `槽「${finalTitle}」`, reason: `父槽解析失败（${c.parentPath}）` }); continue; }
            try {
                const docID = await createSlotDoc(guard.boxID, bookID, guard.bookName, parentDocID, finalTitle);
                await appendSlotToEnd(guard.boxID, docID, parentDocID);
                addr.set(path, docID);
                created.push({ title: finalTitle, docID, parentPath: c.parentPath });
            } catch (e: any) {
                diff.skips.push({ ref: `槽「${finalTitle}」`, reason: `建槽失败：${String(e?.message ?? e)}` });
            }
        }

        // 2) reparent（sacred/done 已在 diff 层滤掉；目标父=既有或本轮新建统一走 addr）
        const reparented: ApplyResult["reparented"] = [];
        for (const r of diff.reparents) {
            try {
                const toParentDocID = r.toParentPath ? (addr.get(r.toParentPath) ?? "") : bookID;
                const from = await api.getBlockInfo(r.docID).catch(() => null);
                if (!toParentDocID || !from?.path) { diff.skips.push({ ref: `槽「${r.title}」`, reason: "reparent 路径解析失败" }); continue; }
                const to = await api.getBlockInfo(toParentDocID).catch(() => null);
                if (!to?.path) { diff.skips.push({ ref: `槽「${r.title}」`, reason: "目标父槽不可读" }); continue; }
                await api.moveDocs([String(from.path)], String(to.path), guard.boxID);
                await appendSlotToEnd(guard.boxID, r.docID, toParentDocID);
                reparented.push({ title: r.title, docID: r.docID, toParentPath: r.toParentPath });
            } catch (e: any) {
                diff.skips.push({ ref: `槽「${r.title}」`, reason: `reparent 失败：${String(e?.message ?? e)}` });
            }
        }

        // 3) 素材归位（串行；失败跳过最后汇总）
        const placed: ApplyResult["placed"] = [];
        const failed: ApplyResult["failed"] = [];
        for (const p of diff.placements) {
            const targetDocID = p.targetDocID || addr.get(p.slotPath) || "";
            if (!targetDocID) { failed.push({ ref: p.materialID, error: "目标槽 docID 解析失败" }); continue; }
            try {
                const movedBlocks = await placeMaterialIntoSlot(p.materialID, targetDocID);
                placed.push({ materialID: p.materialID, targetTitle: p.targetTitle, movedBlocks });
            } catch (e: any) {
                failed.push({ ref: p.materialID, error: String(e?.message ?? e) });
            }
        }

        // 写后验真：树复读+素材复读摘要
        const afterSlots = await fetchStructureSlots(bookID, false);
        const afterAnchor = await excludedIDs(bookID);
        const afterMaterials = await collectMaterials(bookID, new Set(afterSlots.map(s => s.docID)), afterAnchor);
        log(`structureApply book=${bookID} created=${created.length} reparented=${reparented.length} placed=${placed.length} skipped=${diff.skips.length} failed=${failed.length}`);
        return {
            bookID, diff, created, reparented, placed, failed,
            after: { slotCount: afterSlots.length, materialsRemaining: afterMaterials.total },
        };
    });
}

export interface DistillHeading { level: number; text: string; excerpt: string; blockCount: number }
export interface DistillVol { id: string; name: string; startPiece: number; pieceCount: number; titles: string[] }

/** structure_distill（纯读）：拆范文出叙事骨架。docID=单文档（标题层级树+每级首段摘录）；
 *  bookID=阅读书（卷表+卷内片标题，scope.vols 分批）。上限 DISTILL_HEADING_LIMIT 报错 */
export async function structureDistill(input: { docID?: string; bookID?: string; vols?: string[] }): Promise<Record<string, any>> {
    const docID = String(input.docID ?? "").trim();
    const bookID = String(input.bookID ?? "").trim();
    if (docID && bookID) throw new Error("docID 与 bookID 二选一（单文档 / 阅读书两形态）");
    if (!docID && !bookID) throw new Error("docID 或 bookID 必填一个：docID=范文文档 id；bookID=阅读书 id（卷结构）");
    if (docID) {
        if (!BLOCK_ID_RE.test(docID)) return { error: `docID 形态非法：${docID.slice(0, 40)}` };
        const blocks = await api.getChildBlocks(docID).catch(() => null);
        if (blocks == null) throw new Error(`范文不可读（docID=${docID}）`);
        const headings: DistillHeading[] = [];
        for (const b of blocks ?? []) {
            if (b?.type === "h" && b?.subType) {
                if (headings.length >= DISTILL_HEADING_LIMIT) {
                    throw new Error(`标题节点 ${headings.length} 超上限 ${DISTILL_HEADING_LIMIT}——范文过长，先在思源里分卷/分段（子文档）再逐篇 distill`);
                }
                headings.push({ level: Number(String(b.subType).replace(/^h/, "")) || 1, text: String(b.content ?? ""), excerpt: "", blockCount: 0 });
                continue;
            }
            if (!headings.length) continue;
            const cur = headings[headings.length - 1];
            cur.blockCount++;
            if (!cur.excerpt && isSubstanceChildKernel(b)) {
                const t = String(b?.content ?? "").replace(/\s+/g, " ").trim();
                if (t) cur.excerpt = t.slice(0, 200);
            }
        }
        if (!headings.length) throw new Error("范文无标题块——叙事骨架按标题层级提取，无标题范文先在思源里加标题");
        return {
            kind: "doc", docID, headings,
            hint: "叙事骨架=标题层级+每级首段摘录。给 AI 做写作骨架参考（读写之桥）：结构与节奏可平移，内容另起。",
        };
    }
    // bookID 形态：卷表+片标题（map_context 同款面；scope.vols 分批）
    if (!BLOCK_ID_RE.test(bookID)) throw new Error(`bookID 形态非法：${bookID.slice(0, 40)}`);
    const info = (await readBooksInfos())[bookID];
    if (!info) throw new Error(`书未注册（bookID=${bookID}，先 list_books 拿在册书）`);
    if (info.writing || info.manualMode) throw new Error("写作书/手动分片书无卷结构——distill 阅读书形态请给目录成书");
    const volTable = await readVolTable(bookID);
    if (!volTable.length) throw new Error("书无卷表（单篇老书未走目录成书链）——用 docID 形态 distill 书壳文档");
    const shell = await api.getBlockInfo(bookID).catch(() => null);
    if (!shell?.box) throw new Error(`书壳不可读（bookID=${bookID}）`);
    const shellPath = String(shell.path ?? "").replace(/\.sy$/, "");
    const offsets = volOffsets(volTable);
    const volFilter = new Set(input.vols ?? []);
    const out: DistillVol[] = [];
    let pieceTotal = 0;
    for (const [i, v] of volTable.entries()) {
        if (volFilter.size && !volFilter.has(v.d)) continue;
        const docs = await api.listDocsByPath(String(shell.box), `${shellPath}/${v.d}`).catch(() => [] as any[]);
        const titles = (docs ?? []).map((d: any) => String(d.name ?? "")).filter(Boolean);
        pieceTotal += titles.length;
        if (pieceTotal > DISTILL_HEADING_LIMIT) {
            throw new Error(`片标题累计 ${pieceTotal} 超上限 ${DISTILL_HEADING_LIMIT}——用 vols 参数按卷分批（先不带 vols 拿全卷清单）`);
        }
        const nameRow = await api.sql<{ content: string }>(`select content from blocks where type='d' and id='${v.d}' limit 1`) ?? [];
        out.push({ id: v.d, name: String(nameRow[0]?.content ?? ""), startPiece: offsets[i], pieceCount: v.n, titles });
    }
    if (!out.length) throw new Error("vols 未命中任何卷（先不带 vols 拿全卷清单）");
    return {
        kind: "book", bookID, vols: out,
        hint: "叙事骨架=卷结构+片标题序列。给 AI 做写作骨架参考；titles 即该片文件名（含 [NNNNN] 序号=阅读序）。",
    };
}

// ============ loosemat □7 成文整理：读面（structure_read）/写面（structure_compose） ============

/** 槽读预算/次（≈15k token；整槽装到为止分页，nextOffset 续读） */
export const READ_CHAR_BUDGET = 60_000;
/** 单文档读取硬顶（巨文档分篇；distill 300 标题上限同族不对称补齐——review P2-2） */
export const DOC_READ_CHAR_LIMIT = 500_000;
/** 成稿单次字符上限（防巨 payload 单事务；长稿分节 appendTo 续写） */
export const COMPOSE_CHAR_LIMIT = 100_000;

/** 读闪烁重试（getBlockAttrs 空 map/null 两形态同病——poolStampOps.stampOne 先例；
 *  review P1-2：验真读失败零重试会把已成功的写误报失败→AI 重试=重复落稿） */
async function attrsWithRetry(id: string): Promise<Record<string, string> | null> {
    let a = await api.getBlockAttrs(id).catch(() => null);
    if (a == null || Object.keys(a).length === 0) {
        await new Promise(r => setTimeout(r, 250));
        a = await api.getBlockAttrs(id).catch(() => null);
    }
    return a;
}

const COMPOSE_HINT = [
    "成稿=书下独立文档（不挂素材血缘、不占槽位、不进消化调度——血缘断就断，bear Q2 拍板）。",
    "继续写=再调 structure_compose 带 appendTo=本 docID（只认本书成稿）；不满意在思源里直接改（普通文档）。",
    "structure_read 可再取槽全文；structure_apply 照旧只管素材搬运，永不动成稿与手写。",
].join("");

/** structure_read（纯读）：docID 模式=单文档全文（槽/素材/手写皆可——改写原料）；
 *  列表模式=槽序预算分页。全槽文本逐发拉（写作书槽量级人建，几十发可忍；改写场景
 *  低频）。withGuard=false——sacred 计数面 structure_plan 已给，读面只要内容 */
export async function structureRead(
    bookID: string,
    opts: { docID?: string; offset?: number } = {},
): Promise<Record<string, any>> {
    const guard = await structureBookGuard(bookID);
    if (typeof guard === "string") throw new Error(guard);
    if (opts.docID != null && String(opts.docID).trim()) {
        const docID = String(opts.docID).trim();
        if (!BLOCK_ID_RE.test(docID)) throw new Error(`docID 形态非法：${docID.slice(0, 40)}`);
        const blocks = await api.getChildBlocks(docID).catch(() => null);
        if (blocks == null) throw new Error(`文档不可读（docID=${docID}——槽/素材/手写文档 id 皆可）`);
        if (!blocks.length) {
            // 内核对不存在 id 返 code 0+[]（review P2-2）——补一发存在性甄别：真空文档放行
            const info = await api.getBlockInfo(docID).catch(() => null);
            if (!info?.box) throw new Error(`文档不存在（docID=${docID}）——内核对 bogus id 返空集不可与真空文档分`);
        }
        const text = blocksToSlotText(blocks);
        if (text.length > DOC_READ_CHAR_LIMIT) {
            throw new Error(`文档 ${text.length} 字符超单文档读取上限 ${DOC_READ_CHAR_LIMIT}——先在思源里分篇再逐篇取`);
        }
        return {
            mode: "doc", bookID, docID,
            doc: { docID, text, chars: text.length },
            hint: "单文档全文（纯文本+标题层级标注）。改写原料面：槽/素材/手写皆可取。",
        };
    }
    const slots = await fetchStructureSlots(bookID, false);
    const offset = Math.max(0, Math.floor(Number(opts.offset ?? 0) || 0));
    // 惰性拉取（review P2-1）：从 offset 起拉到预算必够即停（分页只会消费到首个超预算槽），
    // 深页不再 O(全书)；单槽读失败=哨兵文本进页（AI 知情可重试，勿静默当空槽）
    const texts = new Map<string, string>();
    let cum = 0;
    for (let i = offset; i < slots.length && cum <= READ_CHAR_BUDGET; i++) {
        const blocks = await api.getChildBlocks(slots[i].docID).catch(() => null);
        const t = blocks == null ? "（槽文本读取失败——重试，或用 docID 单文档模式取本槽）" : blocksToSlotText(blocks);
        texts.set(slots[i].docID, t);
        cum += t.length;
    }
    const page = planSlotReadPage(slots, texts, READ_CHAR_BUDGET, offset);
    return {
        mode: "slots", bookID,
        totalSlots: slots.length,
        slots: page.included.map(s => ({ docID: s.docID, title: s.title, chars: s.chars, text: s.text })),
        nextOffset: page.nextOffset,
        truncated: page.truncated,
        hint: `槽内容全文（素材+手写一视同仁，纯文本+标题层级标注）${page.nextOffset != null ? `；预算分页——带 offset=${page.nextOffset} 取下页` : "（全量到此）"}${page.truncated ? "；本页单槽超预算独占返回" : ""}。改写完用 structure_compose 落成稿。`,
    };
}

/** structure_compose（写）：书下建成稿文档（composedoc 锚=编译产物同族排除，多稿并存
 *  迭代起草）；appendTo=续写既有成稿（守卫：只认本书 composedoc 锚——防误写槽/无辜
 *  文档）。成稿块不挂 MATERIAL_KEY。写后验真=锚复核读/新块 id 可读+块数增长 */
export async function structureCompose(
    bookID: string,
    input: { title?: string; markdown: string; appendTo?: string },
): Promise<Record<string, any>> {
    const guard = await structureBookGuard(bookID);
    if (typeof guard === "string") throw new Error(guard);
    const markdown = String(input.markdown ?? "").trim();
    if (!markdown) throw new Error("markdown 必填：成稿正文（Markdown 文本）");
    if (markdown.length > COMPOSE_CHAR_LIMIT) {
        throw new Error(`markdown 超 ${COMPOSE_CHAR_LIMIT} 字符上限（收到 ${markdown.length}）——分节写：首次 compose 落首节，后续带 appendTo=返回的 docID 逐节续写`);
    }
    const composeAnchor = `composedoc#${TEMP_CONTENT}#${bookID}`;
    return runExclusive(bookID, async () => {
        if (input.appendTo != null && String(input.appendTo).trim()) {
            const target = String(input.appendTo).trim();
            if (!BLOCK_ID_RE.test(target)) throw new Error(`appendTo 形态非法：${target.slice(0, 40)}`);
            const attrs = await attrsWithRetry(target);
            if (!attrs) throw new Error(`续写目标不可读（appendTo=${target}）`);
            if (attrs[MarkKey] !== composeAnchor) throw new Error("appendTo 只认本书成稿文档（structure_compose 返回的 docID）——槽/手写文档不接受续写");
            // 一发严格读兼取基线与尾块（review P1-1：getDocLastID 读失败坍缩空串会静默
            // 头插进既有成稿顶——失败在写前上抛=重试安全）
            const rows = await api.getChildBlocks(target);
            const before = rows.length;
            const tail = rows.at(-1)?.id ?? "";
            const tx = await api.insertBlock(target, markdown, "markdown", tail);
            const newID = String(tx?.[0]?.doOperations?.[0]?.id ?? "");
            const verify = newID ? await api.getBlockAttrs(newID).catch(() => null) : null;
            const afterRows = await api.getChildBlocks(target).catch(() => null);
            const after = afterRows?.length ?? 0;
            if (!verify || after <= before) throw new Error("续写落盘验真失败（新块不可读或块数未增——重试或查内核日志）");
            log(`structureCompose append book=${bookID} doc=${target} chars=${markdown.length}`);
            return { bookID, docID: target, appended: true, chars: markdown.length, blockCount: after, hint: COMPOSE_HINT };
        }
        const shell = await api.getBlockInfo(bookID).catch(() => null);
        if (!shell?.box || !shell?.path) throw new Error(`书壳不可读（bookID=${bookID}）`);
        const box = String(shell.box);
        const bookHPath = await api.getHPathByID(bookID, box);
        if (!bookHPath) throw new Error("拿不到书可读路径（getHPathByID 空）");
        const title = composeTitle(guard.bookName, input.title, Date.now());
        let path = `${bookHPath}/${title}`;
        if ((await api.getIDsByHPath(box, path)).length > 0) path = `${path}-${Date.now()}`;
        const docID = await api.createDocWithMd(box, path, markdown);
        if (!docID) throw new Error(`建成稿失败（path=${path}）`);
        await api.setBlockAttrs(docID, { [MarkKey]: composeAnchor });
        const after = await attrsWithRetry(docID);
        if (after?.[MarkKey] !== composeAnchor) {
            // review P1-2：闪烁误报会引导重试=时间戳后缀重复建稿留孤儿——终验失败时
            // best-effort 删己（doc 刚建无子树，removeDocByID 安全）再上抛
            await api.removeDocByID(docID).catch(() => { });
            throw new Error(`成稿锚落盘验真失败（docID=${docID}，已回收半成品）`);
        }
        await appendSlotToEnd(box, docID, bookID);
        log(`structureCompose create book=${bookID} doc=${docID} title=${title} chars=${markdown.length}`);
        return { bookID, docID, title, hpath: path, appended: false, chars: markdown.length, hint: COMPOSE_HINT };
    });
}
