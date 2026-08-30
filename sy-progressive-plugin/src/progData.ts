// v5 数据模型层：prog-data 锚定链（IAL 三段式 + ensure 认回）+ 归拢迁移。
// 原则：插件内部一切引用走 ID/IAL，永不走路径；hpath 只在创建瞬间用作落点。
import { TEMP_CONTENT, MarkKey, PDIGEST_CTIME } from "../../sy-tomato-plugin/src/libs/gconst";
import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";

export function getDocIalProgData(): string {
    return `progdata#${TEMP_CONTENT}`;
}

export function getDocIalDigestDir(bookID: string): string {
    return `digestdir#${TEMP_CONTENT}#${bookID}`;
}

export function getDocIalNoteBox(): string {
    return `notebox#${TEMP_CONTENT}`;
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

// 同 IAL 的进行中 ensure 去重：建匣/建夹后 attributes 索引有秒级延迟，窗口期内第二次
// findByIal 查空会重复建（e2e 实测首摘抄双札记匣）；只去重 in-flight 不缓存结果——
// 文档被删后下一次 ensure 仍走完整认回链，不会拿到死 ID。
const inFlightEnsure = new Map<string, Promise<string>>();

/** 统一锚定链：storage ID → checkBlockExist → IAL 全库搜 → 惰性新建。 */
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
        const created = await deps.create();
        if (!created) return "";
        await deps.onResolved(created, true);
        return created;
    })().finally(() => inFlightEnsure.delete(ialValue));
    inFlightEnsure.set(ialValue, p);
    return p;
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

export function planConsolidation(digests: DigestDocInfo[], progDataID: string): ConsolidatePlan {
    const plan: ConsolidatePlan = { dirsToMove: [], skippedInPlace: 0, skippedForeign: 0 };
    const seen = new Set<string>();
    for (const d of digests) {
        // 已归拢：digest 夹的父（或摘抄本身直接挂）已在 prog-data 下——正常形态摘抄的父是 digest 夹、
        // 夹的父才是 prog-data，判错层会导致幂等失效（e2e 实测：重跑重复搬）
        if (d.dirParentID === progDataID || d.parentID === progDataID) {
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
    progDataID: string;
    listChildDocs(docID: string): Promise<{ id: string; name: string }[]>;
    /** 整夹移动进 prog-data（moveDocs），成功与否由返回值表达 */
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
    const progDataChildren = await deps.listChildDocs(deps.progDataID);
    for (const dir of plan.dirsToMove) {
        const target = progDataChildren.find(c => c.name === dir.dirName);
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

/** 思源文档 path 形如 /父ID/.../本ID.sy——文档级 parent 不在 blocks.parent_id（恒空），取 path 倒数第二段 */
export function parentIDFromDocPath(path: string): string {
    const parts = (path ?? "").split("/").filter(Boolean);
    if (parts.length < 2) return "";
    return parts[parts.length - 2];
}

/** 列文档夹的直接子文档（id+name）——文档父子在 path 层（parent_id 恒空），按父 path 去掉 .sy 的目录前缀匹配一层 */
export async function listChildDocs(docID: string): Promise<{ id: string; name: string }[]> {
    const row = await siyuan.sqlOne(`select path from blocks where type='d' and id='${docID}'`);
    if (!row?.path) return [];
    const prefix = row.path.endsWith(".sy") ? row.path.slice(0, -3) : row.path;
    const rows = await siyuan.sql(
        `select id, content from blocks where type='d' and path like '${prefix}/%' and path not like '${prefix}/%/%'`);
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
export async function consolidateDigests(progDataID: string): Promise<ConsolidateSummary> {
    // 文档行 parent_id 恒空（父子在 path 层）：先拿摘抄 path，TS 侧推父 ID，再批量查父名
    const rows = await siyuan.sql(`
        select a.block_id as docID, b.path as path, a.value as ctime
        from attributes a
        join blocks b on b.id = a.block_id and b.type='d'
        where a.name='${PDIGEST_CTIME}'
    `) ?? [];
    const parentIDs = [...new Set((rows as any[]).map(r => parentIDFromDocPath(r.path)).filter(Boolean))];
    const nameRows = parentIDs.length
        ? await siyuan.sql(`select id, content from blocks where type='d' and id in (${parentIDs.map(id => `'${id}'`).join(",")})`) ?? []
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
    const plan = planConsolidation(digests, progDataID);
    const result = await executeConsolidation(plan, {
        progDataID,
        listChildDocs,
        moveDirWhole: (dirID) => moveDocIntoParent(dirID, progDataID),
        moveDocInto: (docID, targetDirID) => moveDocIntoParent(docID, targetDirID),
        removeDoc: (id) => siyuan.removeDocByIDSiyuan(id),
        setIal: (id, ial) => siyuan.setBlockAttrs(id, { [MarkKey]: ial } as any),
    });
    // 空 pieces- 夹层清理（分片读完即删自然消亡后留下的空壳）；
    // 子文档判定同样走 path 前缀（父 path 去 .sy 后即子目录前缀）
    const emptyPieceDirs = await siyuan.sql(`
        select c.id from blocks c where c.type='d' and c.content like 'pieces-%'
        and not exists (
            select 1 from blocks k
            where k.type='d' and k.path like substr(c.path, 1, length(c.path) - 3) || '/%'
        )
    `) ?? [];
    for (const row of emptyPieceDirs) await siyuan.removeDocByIDSiyuan(row.id);
    return { plan, result, cleanedEmptyPieceDirs: emptyPieceDirs.length };
}
