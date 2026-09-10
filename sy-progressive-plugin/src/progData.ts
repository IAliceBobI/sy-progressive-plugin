// v5 数据模型层：prog-data 锚定链（IAL 三段式 + ensure 认回）+ 归拢迁移。
// 原则：插件内部一切引用走 ID/IAL，永不走路径；hpath 只在创建瞬间用作落点。
import { TEMP_CONTENT, MarkKey, PDIGEST_CTIME } from "../../sy-tomato-plugin/src/libs/gconst";
import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";

export function getDocIalProgData(): string {
    return `progdata#${TEMP_CONTENT}`;
}

/** Menu label 走 innerHTML，用户文本（书名/槽名/标题）须转义防注入/破渲染（踩坑
 *  索引明令；期C 起公共化，存量直喂点见 □12） */
export function escapeHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function getDocIalDigestDir(bookID: string): string {
    return `digestdir#${TEMP_CONTENT}#${bookID}`;
}

/** writebook-next □4 双夹并存（bear 拍板逐次可选）：override 方向专用锚。首段独立命名
 *  （digestdiru/digestdirh）而非 bookID 后加后缀——findDocByIal 是 LIKE 子串匹配，
 *  `digestdir#…#bookID` 会命中 `digestdir#…#bookID#u`（前缀污染误认回）。与现锚
 *  （跟全局档的主力夹）三锚并存：under=书下夹、hub=总夹夹；主力夹恰在目标方向时
 *  ensure 层复用它不重复建（ProgressiveStorage.ensureDigestDirUnder/Hub）。 */
export function getDocIalDigestDirUnder(bookID: string): string {
    return `digestdiru#${TEMP_CONTENT}#${bookID}`;
}

export function getDocIalDigestDirHub(bookID: string): string {
    return `digestdirh#${TEMP_CONTENT}#${bookID}`;
}

/** 摘抄总夹（期1 □2）：prog-data 根下收所有 digest-书名 夹的总文件夹，初始名「摘抄」 */
export function getDocIalDigestHub(): string {
    return `digesthub#${TEMP_CONTENT}`;
}

/** 源文档下方档的非书摘抄夹（digest-源文档名，挂源文档下；按源文档锚定） */
export function getDocIalFreeDigestDir(docID: string): string {
    return `digestdirfree#${TEMP_CONTENT}#${docID}`;
}

export function getDocIalNoteBox(): string {
    return `notebox#${TEMP_CONTENT}`;
}

/** 札记匣内按源文档归集的夹（□3：digest-源文档名 挂札记匣下；按源文档锚定，位置无关） */
export function getDocIalNoteDir(docID: string): string {
    return `notedir#${TEMP_CONTENT}#${docID}`;
}

/** words 单词文档（v5 □4 起进 prog-data；值格式沿用历史 `words#t#bookID`，旧书下文档按 IAL 原位认回） */
export function getDocIalWords(bookID: string): string {
    return `words#${TEMP_CONTENT}#${bookID}`;
}

export function getDocIalReadLog(): string {
    return `readlog#${TEMP_CONTENT}`;
}

// 认回链依赖：生产侧由 ProgressiveStorage 注入真实现，单测注入 stub。
export interface AnchorDeps {
    /** plugin storage 里存的 doc ID（可能为空/失效） */
    storedID?: string;
    checkBlockExist(id: string): Promise<boolean>;
    /** 按 IAL 值全库搜文档，返回 doc ID 或 ""（doFindDoc 风格，位置无关） */
    findByIal(ialValue: string): Promise<string>;
    /** 惰性新建（打 IAL 由 create 自带），返回 doc ID 或 "" */
    create(): Promise<string>;
    /** 解析成功后回存 storage；fresh=true 表示本次新建 */
    onResolved(id: string, fresh: boolean): Promise<void>;
}

// 同 IAL 的进行中 ensure 去重；跨调用（非并发）的重复建由 freshCreatedIds 设防（□1）。
const inFlightEnsure = new Map<string, Promise<string>>();

// 本进程内新建过的锚定 ID（□1 双札记匣修复）：建匣/建夹后 attributes 索引有秒级延迟，
// in-flight 的去重只护并发、finally 即清 key——窗口期内跨调用的第二次 findByIal 仍查空
// 会重复建（用户主实例实锤双札记匣）。常驻内存认回 + 命中时 checkBlockExist 校验活死：
// checkBlockExist 走内核 HTTP 直查不受 SQL 索引延迟影响（annoDraft 删向 ~6s 残留识破实证），
// 文档被删 → 校验失败清缓存走完整链重建，「下一次 ensure 不拿死 ID」语义不丢。
const freshCreatedIds = new Map<string, string>();

/** 单测隔离用：清空刚建 ID 缓存 */
export function resetAnchoredCacheForTest() {
    freshCreatedIds.clear();
}

/** 统一锚定链：storage ID → checkBlockExist → IAL 全库搜 →（刚建缓存校验）→ 惰性新建。 */
export async function ensureAnchoredDoc(ialValue: string, deps: AnchorDeps): Promise<string> {
    const running = inFlightEnsure.get(ialValue);
    if (running) return running;
    const p = (async () => {
        if (deps.storedID && await deps.checkBlockExist(deps.storedID)) {
            return deps.storedID;
        }
        const found = await deps.findByIal(ialValue);
        if (found) {
            await deps.onResolved(found, false);
            return found;
        }
        // 索引延迟窗口守卫：本进程刚建过同 IAL 文档而 SQL 仍查空——校验活着就认回，勿重复建
        const fresh = freshCreatedIds.get(ialValue);
        if (fresh) {
            if (await deps.checkBlockExist(fresh)) {
                await deps.onResolved(fresh, false);
                return fresh;
            }
            freshCreatedIds.delete(ialValue);
        }
        const created = await deps.create();
        if (!created) return "";
        freshCreatedIds.set(ialValue, created);
        await deps.onResolved(created, true);
        return created;
    })().finally(() => inFlightEnsure.delete(ialValue));
    inFlightEnsure.set(ialValue, p);
    return p;
}

/** 片文档 IAL 值：TEMP#书ID,片序号（0 起）。自 helper 搬入（期1 写作书纯函数
 *  依赖它；helper 链拉 .svelte 进不了单测），helper re-export 保旧 import 路径 */
export function getDocIalPieces(bookID: string, point: number) {
    return `${TEMP_CONTENT}#${bookID},${point}`;
}

/** 分片片名：[NNNNN] 五位序号 + 摘要（v5 直挂书下，前缀与用户子文档区分） */
export function pieceDocName(point: number, title: string): string {
    return `[${String(point).padStart(5, "0")}]${title}`;
}

/** 分片 alias：书名,摘要（思源 alias 现状格式） */
export function pieceAlias(bookName: string, summary: string): string {
    return summary ? `${bookName},${summary}` : bookName;
}

// ============ 归拢（「归拢老数据」命令） ============

/** 按摘抄 IAL 反查到的摘抄文档及其 digest 夹信息（位置无关，跨笔记本天然支持） */
export interface DigestDocInfo {
    docID: string;
    parentID: string;
    parentName: string;
    /** digest 夹的父文档 ID——夹是否已在 prog-data 下的判定依据（幂等） */
    dirParentID: string;
    bookID: string;
}

export interface DigestDirToMove {
    dirID: string;
    dirName: string;
    bookID: string;
}

export interface ConsolidatePlan {
    dirsToMove: DigestDirToMove[];
    /** 父已在 prog-data 的摘抄数（幂等跳过） */
    skippedInPlace: number;
    /** 父非 digest- 夹的摘抄数（日记等用户自选落点，尊重不动） */
    skippedForeign: number;
}

export function planConsolidation(digests: DigestDocInfo[], progDataID: string, hubID: string): ConsolidatePlan {
    const plan: ConsolidatePlan = { dirsToMove: [], skippedInPlace: 0, skippedForeign: 0 };
    const seen = new Set<string>();
    for (const d of digests) {
        // 已归拢（期1 起归拢终点=摘抄总夹）：夹已在总夹下；摘抄无夹直挂 prog-data/总夹的
        // （搬迁机制只动夹）也视为已就位。夹在 prog-data 根下（v3 期形态）不再算已归拢——
        // 它正是「归拢进总夹」的搬运对象
        if (d.dirParentID === hubID || d.parentID === hubID || d.parentID === progDataID) {
            plan.skippedInPlace++;
            continue;
        }
        if (!d.parentName.startsWith("digest-")) {
            plan.skippedForeign++;
            continue;
        }
        if (seen.has(d.parentID)) continue;
        seen.add(d.parentID);
        plan.dirsToMove.push({ dirID: d.parentID, dirName: d.parentName, bookID: d.bookID });
    }
    return plan;
}

export interface ConsolidateDeps {
    /** 归拢目标=摘抄总夹 ID（同名冲突探测/整搬终点/幂等判定都以它为家） */
    hubID: string;
    listChildDocs(docID: string): Promise<{ id: string; name: string }[]>;
    /** 整夹移动进总夹（moveDocs），成功与否由返回值表达 */
    moveDirWhole(dirID: string): Promise<boolean>;
    /** 把单个文档移动并入目标夹（同名冲突时的逐子并入） */
    moveDocInto(docID: string, targetDirID: string): Promise<boolean>;
    removeDoc(docID: string): Promise<void>;
    setIal(docID: string, ialValue: string): Promise<void>;
}

export interface ConsolidateResult {
    moved: number;
    failed: number;
}

/** 执行归拢计划：同名逐子并入删壳、否则整搬；搬完打 IAL 锚定；单夹失败不阻断（可重跑）。 */
export async function executeConsolidation(plan: ConsolidatePlan, deps: ConsolidateDeps): Promise<ConsolidateResult> {
    const r: ConsolidateResult = { moved: 0, failed: 0 };
    const hubChildren = await deps.listChildDocs(deps.hubID);
    for (const dir of plan.dirsToMove) {
        const target = hubChildren.find(c => c.name === dir.dirName);
        try {
            if (target) {
                const children = await deps.listChildDocs(dir.dirID);
                let allMoved = true;
                for (const child of children) {
                    if (!await deps.moveDocInto(child.id, target.id)) allMoved = false;
                }
                if (allMoved) await deps.removeDoc(dir.dirID);
                await deps.setIal(target.id, getDocIalDigestDir(dir.bookID));
            } else {
                if (!await deps.moveDirWhole(dir.dirID)) {
                    r.failed++;
                    continue;
                }
                await deps.setIal(dir.dirID, getDocIalDigestDir(dir.bookID));
            }
            r.moved++;
        } catch {
            r.failed++;
        }
    }
    return r;
}

// ============ 生产侧实现（真实 siyuan API） ============

/** 按 IAL 值全库搜文档（IAL 全局唯一，SQL 命中即真；位置无关） */
export async function findDocByIal(ialValue: string): Promise<string> {
    const row = await siyuan.sqlOne(`select id from blocks where type='d' and ial like '%${MarkKey}="${ialValue}"%' limit 1`);
    return row?.id ?? "";
}

/** 解析 custom-pdigest-ctime 值里的 bookID（兼容已完成的 🔨#bookID#ct 与普通 bookID#ct） */
export function parseBookIDFromCtime(value: string): string {
    // slice 按 code unit 切：🔨 占 2 unit，slice(2) 落在 # 上、首段解析成空串（fleetData 单测抓出）
    const v = value.startsWith("🔨#") ? value.slice("🔨#".length) : value;
    return v.split("#")[0] ?? "";
}

/** ctime 值剥 🔨 完成态前缀（期A 素材推过即锤），返回干净「bookID#ct」；非完成态 null。
 *  从 digestUtils 迁来（vitest 链禁 .svelte，纯函数落纯模块可单测）。⚠ slice 按
 *  「🔨#」整串长度——slice(2) 只剥 emoji 残留前导 #（期A review P2-4 地雷，单测锁形态） */
export function doneCtime(v: string): string | null {
    return v.startsWith("🔨#") ? v.slice("🔨#".length) : null;
}

/** 思源文档 path 形如 /父ID/.../本ID.sy——文档级 parent 不在 blocks.parent_id（恒空），取 path 倒数第二段 */
export function parentIDFromDocPath(path: string): string {
    const parts = (path ?? "").split("/").filter(Boolean);
    if (parts.length < 2) return "";
    return parts[parts.length - 2];
}

/** 列文档夹的直接子文档（id+name）——文档父子在 path 层（parent_id 恒空），按父 path 去掉 .sy 的目录前缀匹配一层。
 *  显式 limit 防内核 64 截尾：归拢同名并入分支（executeConsolidation）老夹子文档 >64 时
 *  只搬前 64 个而 allMoved 仍真 → removeDoc 整树删=壳内尾部摘抄静默丢失（review P1-3）。 */
export async function listChildDocs(docID: string): Promise<{ id: string; name: string }[]> {
    const row = await siyuan.sqlOne(`select path from blocks where type='d' and id='${docID}'`);
    if (!row?.path) return [];
    const prefix = row.path.endsWith(".sy") ? row.path.slice(0, -3) : row.path;
    const rows = await siyuan.sql(
        `select id, content from blocks where type='d' and path like '${prefix}/%' and path not like '${prefix}/%/%' limit 10000000`);
    return (rows ?? []).map(r => ({ id: r.id, name: r.content }));
}

async function getDocBoxPath(docID: string): Promise<{ box: string; path: string }> {
    const row = await siyuan.sqlOne(`select box, path from blocks where type='d' and id='${docID}'`);
    return { box: row?.box ?? "", path: row?.path ?? "" };
}

/** moveDocs 是物理 path 域：把 docID（整棵子树）移动为 parentDirID 的子文档，ID 不变 */
async function moveDocIntoParent(docID: string, parentDirID: string): Promise<boolean> {
    const from = await getDocBoxPath(docID);
    const to = await getDocBoxPath(parentDirID);
    if (!from.box || !from.path || !to.box || !to.path) return false;
    await siyuan.moveDocs([from.path], to.path, to.box);
    return true;
}

export interface ConsolidateSummary {
    plan: ConsolidatePlan;
    result: ConsolidateResult;
    cleanedEmptyPieceDirs: number;
}

/**
 * 「归拢老数据」命令（设置面板按钮）：
 * 按摘抄 IAL 全库反查老 digest- 夹（位置无关、跨笔记本）→ 搬进 prog-data →
 * 顺手清理已空的 pieces- 夹层。幂等可重跑，单夹失败不阻断。
 */
export async function consolidateDigests(progDataID: string, hubID = progDataID): Promise<ConsolidateSummary> {
    // 文档行 parent_id 恒空（父子在 path 层）：先拿摘抄 path，TS 侧推父 ID，再批量查父名。
    // 显式 limit 防内核 64 截尾（用户650189 实锤：64 篇日记摘抄=截断值非真实数，
    // 排在 64 行后的 digest- 夹整组漏归拢、skippedForeign 同漏计）
    const rows = await siyuan.sql(`
        select a.block_id as docID, b.path as path, a.value as ctime
        from attributes a
        join blocks b on b.id = a.block_id and b.type='d'
        where a.name='${PDIGEST_CTIME}'
        limit 10000000
    `) ?? [];
    const parentIDs = [...new Set((rows as any[]).map(r => parentIDFromDocPath(r.path)).filter(Boolean))];
    const nameRows = parentIDs.length
        ? await siyuan.sql(`select id, content from blocks where type='d' and id in (${parentIDs.map(id => `'${id}'`).join(",")}) limit 10000000`) ?? []
        : [];
    const nameMap = new Map((nameRows as any[]).map(r => [r.id, r.content]));
    const digests: DigestDocInfo[] = (rows as any[]).map(r => {
        const parentID = parentIDFromDocPath(r.path);
        // digest 夹的父 = 摘抄 path 倒数第三段（幂等判定用）
        const parts = String(r.path ?? "").split("/").filter(Boolean);
        const dirParentID = parts.length >= 3 ? parts[parts.length - 3] : "";
        return {
            docID: r.docID,
            parentID,
            parentName: nameMap.get(parentID) ?? "",
            dirParentID,
            bookID: parseBookIDFromCtime(r.ctime ?? ""),
        };
    });
    const plan = planConsolidation(digests, progDataID, hubID);
    const result = await executeConsolidation(plan, {
        hubID,
        listChildDocs,
        moveDirWhole: (dirID) => moveDocIntoParent(dirID, hubID),
        moveDocInto: (docID, targetDirID) => moveDocIntoParent(docID, targetDirID),
        removeDoc: (id) => siyuan.removeDocByIDSiyuan(id),
        setIal: (id, ial) => siyuan.setBlockAttrs(id, { [MarkKey]: ial } as any),
    });
    // 空 pieces- 夹层清理（分片读完即删自然消亡后留下的空壳）；
    // 子文档判定同样走 path 前缀（父 path 去 .sy 后即子目录前缀）；limit 同防 64 截尾
    const emptyPieceDirs = await siyuan.sql(`
        select c.id from blocks c where c.type='d' and c.content like 'pieces-%'
        and not exists (
            select 1 from blocks k
            where k.type='d' and k.path like substr(c.path, 1, length(c.path) - 3) || '/%'
        )
        limit 10000000
    `) ?? [];
    for (const row of emptyPieceDirs) await siyuan.removeDocByIDSiyuan(row.id);
    return { plan, result, cleanedEmptyPieceDirs: emptyPieceDirs.length };
}
