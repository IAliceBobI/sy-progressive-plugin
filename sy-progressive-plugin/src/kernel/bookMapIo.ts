// □7 知识地图——kernel 侧 siyuan IO 面（goja 环境；纯函数在 src/bookMapCore.ts 三端共用）。
// 专用文档=书壳下子文档「知识地图」：MarkKey IAL 值 map@<bookID> 锚定（位置无关找回
// +□1 卷枚举按「IAL 不含 MarkKey」过滤天然不混入读序）。正文=单块围栏
// ;;;sy-progressive-plugin/book-map + 池子 JSON 单行；getChildBlocks 直读（type='custom'
// 块 content=纯 JSON——09-13 实测，无需 getBlockKramdown/SQL）。
// ⚠建文档两步：HTTP createDocWithMd 传 custom- 字段不落 IAL（实测），建后补
// setBlockAttrs+getBlockAttrs 复核读（写类端点 data 恒 null 勿判返值——踩坑索引）。
import * as api from "./api";
import { readStorageText, readBooksInfos, readBookIndex, bookEntries } from "./progData";
import { volOffsets, type VolEntry, type VolTable } from "../volIndex";
import {
    buildBookMapMD, parseBookMapContent, normalizePool, canonicalJSON,
    type BookMap,
} from "../bookMapCore";

/** 同前端 gconst MarkKey（本地声明防拖依赖链，progData PLOG_* 先例） */
const MarkKey = "custom-progmark";
const MAP_DOC_NAME = "知识地图";
/** 建图素材片数上限（token 控制；超出提示按卷分批） */
export const CONTEXT_PIECE_LIMIT = 60;

const mapDocIalValue = (bookID: string) => `map@${bookID}`;

/** kernel.js 模块级存活缓存：救「建后立查」SQL 索引窗（attributes 表延迟） */
const docIDCache = new Map<string, string>();

// ============ 卷表（petal <bookID>.vols.json；前端 ProgressiveStorage 同源数据） ============

export async function readVolTable(bookID: string): Promise<VolEntry[]> {
    const text = await readStorageText(`${bookID}.vols.json`);
    if (!text) return [];
    try {
        const t = JSON.parse(text) as VolTable;
        return Array.isArray(t?.vols) ? t.vols : [];
    } catch {
        return [];
    }
}

/** 书总片数（卷表前缀和末位；空卷表=0） */
export async function readPieceCount(bookID: string): Promise<number> {
    const vols = await readVolTable(bookID);
    return volOffsets(vols).pop() ?? 0;
}

// ============ 专用文档找/建 ============

/** SQL attributes 查地图文档 id（索引窗内 miss→null，缓存兜底在上层） */
async function findMapDocID(bookID: string): Promise<string | null> {
    const rows = await api.sql<{ block_id: string }>(
        `select block_id from attributes where name='${MarkKey}' and value='${mapDocIalValue(bookID)}' limit 1`) ?? [];
    return rows[0]?.block_id ?? null;
}

/**
 * 找回或建地图专用文档。顺序：缓存（复核 IAL 防书删后悬空）→ SQL attributes → 建。
 * 建后 setBlockAttrs 两步落 IAL+复核读验真；书壳不可读（lost/未注册）throw。
 */
export async function ensureMapDoc(bookID: string): Promise<string> {
    const cached = docIDCache.get(bookID);
    if (cached) {
        const attrs = await api.getBlockAttrs(cached).catch(() => null);
        if (attrs && attrs[MarkKey] === mapDocIalValue(bookID)) return cached;
        docIDCache.delete(bookID);
    }
    const found = await findMapDocID(bookID);
    if (found) {
        // SQL 命中仍复核 IAL（attributes 索引窗内可能命中已删文档的残留行）
        const attrs = await api.getBlockAttrs(found).catch(() => null);
        if (attrs && attrs[MarkKey] === mapDocIalValue(bookID)) {
            docIDCache.set(bookID, found);
            return found;
        }
    }
    // 建：书壳定位（文件树通道拿 box+path，无索引窗）
    const info = await api.getBlockInfo(bookID).catch(() => null);
    if (!info?.box) throw new Error(`书壳不可读（bookID=${bookID} 可能已删或未注册）`);
    const hpath = await api.getHPathByID(bookID, info.box);
    if (!hpath) throw new Error(`拿不到书壳可读路径（bookID=${bookID}）`);
    const emptyPool: BookMap = { v: 1, nodes: [], edges: [], views: [] };
    const docID = await api.createDocWithMd(info.box, `${hpath}/${MAP_DOC_NAME}`, buildBookMapMD(emptyPool));
    if (!docID) throw new Error(`建 ${MAP_DOC_NAME} 文档失败（bookID=${bookID}）`);
    await api.setBlockAttrs(docID, { [MarkKey]: mapDocIalValue(bookID) });
    const after = await api.getBlockAttrs(docID).catch(() => null);
    if (after?.[MarkKey] !== mapDocIalValue(bookID)) {
        throw new Error(`地图文档 IAL 落盘验真失败（docID=${docID}）`);
    }
    docIDCache.set(bookID, docID);
    return docID;
}

// ============ 池子读写 ============

/** 文档里找围栏块（type='custom' 且 content 可解析为池子）；文档已删（缓存悬空/
 *  attributes 残留）getChildBlocks code -1 → catch 落空 */
async function findMapBlock(docID: string): Promise<{ id: string; map: BookMap } | null> {
    const children = await api.getChildBlocks(docID).catch(() => null);
    for (const b of children ?? []) {
        if (b?.type !== "custom") continue;
        const map = parseBookMapContent(String(b.content ?? ""));
        if (map) return { id: String(b.id), map };
    }
    return null;
}

/** 读池子（只读：不建文档——review P2-4，AI 中途放弃工作流不留空壳）；未建=null。
 *  缓存优先：刚 writePool 完的 attributes 索引窗内 SQL 查 miss（e2e ⑤ 实锤）；
 *  缓存悬空（文档被删）由 findMapBlock 空判自然落 null */
export async function readPoolExisting(bookID: string): Promise<BookMap | null> {
    const docID = docIDCache.get(bookID) ?? await findMapDocID(bookID);
    if (!docID) return null;
    const found = await findMapBlock(docID);
    return found?.map ?? null;
}

/** 读池子；空书/块未建 → null（map_save 空池合并用；首次调用会建文档带空池块） */
export async function readPool(bookID: string): Promise<BookMap | null> {
    const docID = await ensureMapDoc(bookID);
    const found = await findMapBlock(docID);
    return found?.map ?? null;
}

/** 同书串行闸（review P2-5：map_save 读改写无锁并发=后写者赢丢更新；goja 无导航锁，
 *  in-flight Promise 链式排队即可） */
const inFlight = new Map<string, Promise<unknown>>();
export async function runExclusive<T>(bookID: string, fn: () => Promise<T>): Promise<T> {
    const prev = inFlight.get(bookID) ?? Promise.resolve();
    const next = prev.catch(() => {}).then(fn);
    inFlight.set(bookID, next);
    try {
        return await next;
    } finally {
        if (inFlight.get(bookID) === next) inFlight.delete(bookID);
    }
}

/** 整池重写（updateBlock 换围栏块；块被手删 → insertBlock 重建兜底）。写后验真=回读
 *  canonicalJSON 全比（review P2-2：计数比对检不出内容漂移；双侧同过 normalizePool
 *  规整化+键序归一——goja/V8 属性枚举序不同，裸 stringify 比对对 layout 嵌套对象
 *  假阴性，09-13 □9 实锤）。updateBlock 落盘另有毫秒级 fs 竞态窗——一次 150ms 重试兜底 */
export async function writePool(bookID: string, map: BookMap): Promise<boolean> {
    const docID = await ensureMapDoc(bookID);
    const md = buildBookMapMD(map);
    const found = await findMapBlock(docID);
    if (found) {
        await api.updateBlock(found.id, md);
    } else {
        const tx = await api.insertBlock(docID, md);
        const id = (Array.isArray(tx) ? tx[0] : tx)?.doOperations?.[0]?.id;
        if (!id) return false;
    }
    let expected = "";
    try { expected = canonicalJSON(normalizePool(JSON.parse(JSON.stringify(map)))); } catch { expected = canonicalJSON(map); }
    let after = await findMapBlock(docID);
    if (!after || canonicalJSON(after.map) !== expected) {
        // 150ms 重试兜 updateBlock 落盘毫秒级 fs 竞态窗（canonicalJSON 修复后常态首读
        // 直过，本分支未经 e2e 实证——review P2-8 记档；goja setTimeout 已核实可用）
        await new Promise(r => setTimeout(r, 150));
        after = await findMapBlock(docID);
    }
    return !!after && canonicalJSON(after.map) === expected;
}

// ============ 建图素材收集（map_context） ============

export interface MapContextPiece { point: number; volID: string; title: string; excerpt: string; docID: string }
export interface MapContextVol { id: string; name: string; startPiece: number; pieceCount: number }
export interface MapContextData {
    book: { bookID: string; title: string; pieceCount: number; volCount: number };
    vols: MapContextVol[];
    pieces: MapContextPiece[];
    pool: BookMap | null;
    alignment: string;
}

const ALIGNMENT_TEXT = [
    "对齐契约：下方 pool 是该书已有的节点池。你产出的每个节点，若 name 或 aliases 能与 pool 中",
    "任一节点的 name/aliases 匹配，必须直接重用该节点的 id（不要新建）；新节点 id 留空由系统分配。",
    "证据锚 anchors 只能用 pieces 里出现过的 point 数字（越界会被剔除）。",
    "边只连接你本次产出或池中已存在的节点（名字或 id 均可作端点），悬空边会被丢弃；",
    "新建节点在边里引用一律用 name（自造 id 会被系统重分配，不参与端点解析）。",
].join("");

/** scope：缺省=全书；vols=只给卷；points=只给片（所属卷结构仍全量给） */
export interface MapScope { vols?: string[]; points?: number[] }

/**
 * 收集建图素材：卷结构+片标题+片首段截断+现有池子。
 * 片识别=挂卷下、名字 [NNNNN] 前缀（渐进内部文档无此前缀，天然滤除）；
 * excerpt=片内首个段落块 content 前 200 字（getChildBlocks 直读无索引窗）。
 */
export async function collectMapContext(bookID: string, scope: MapScope): Promise<MapContextData> {
    const infos = await readBooksInfos();
    const info = bookEntries(infos).find(([id]) => id === bookID)?.[1];
    if (!info) throw new Error(`书未注册（bookID=${bookID}，先 list_books 拿在册书）`);
    if (info.writing || info.manualMode) throw new Error("写作书/手动分片书无卷结构，暂不支持建图");
    const vols = await readVolTable(bookID);
    if (!vols.length) throw new Error("书无卷表（单篇老书未走目录成书链，暂不支持建图）");
    const offsets = volOffsets(vols);
    const pieceCount = offsets[offsets.length - 1];

    // 书壳定位+子文档枚举（卷名 by id 匹配；文件树直查）
    const shell = await api.getBlockInfo(bookID).catch(() => null);
    if (!shell?.box) throw new Error(`书壳不可读（bookID=${bookID} 可能已删）`);
    const shellPath = String(shell.path ?? "").replace(/\.sy$/, "");
    const children = await api.listDocsByPath(shell.box, shellPath);
    const nameOf = new Map<string, string>((children ?? []).map((d: any) => [String(d.id), String(d.name ?? "")]));

    // scope 过滤
    const volFilter = new Set(scope.vols ?? []);
    const pointFilter = scope.points?.length ? new Set(scope.points) : null;
    const ctxVols: MapContextVol[] = [];
    vols.forEach((v, i) => {
        if (volFilter.size && !volFilter.has(v.d)) return;
        ctxVols.push({ id: v.d, name: nameOf.get(v.d) ?? "", startPiece: offsets[i], pieceCount: v.n });
    });
    if (!ctxVols.length) throw new Error("scope.vols 未命中任何卷（用 map_context 先不带 scope 拿全卷清单）");

    // 逐卷枚举片（[NNNNN] 前缀识别，doc id 直接在手）+逐片 excerpt。
    // 空卷（0 子文档）无物理目录：listDocsByPath 对不存在目录 code -1 → catch 落 []
    const pieces: { point: number; volID: string; title: string; excerpt: string; docID: string }[] = [];
    for (const v of ctxVols) {
        const docs = await api.listDocsByPath(shell.box, `${shellPath}/${v.id}`).catch(() => [] as any[]);
        const physicalPoints = new Set<number>();
        for (const d of docs ?? []) {
            const m = /^\[(\d{5})\]/.exec(String(d.name ?? ""));
            if (!m) continue;
            physicalPoints.add(Number(m[1]));
            const point = Number(m[1]);
            if (pointFilter && !pointFilter.has(point)) continue;
            pieces.push({ point, volID: v.id, title: String(d.name ?? ""), excerpt: "", docID: String(d.id ?? "") });
        }
        // 块态回退：该卷物理片未覆盖的 point，按索引窗口+卷内块直读补素材（读书中的书
        // 部分片物理化=混合态，逐 point 合并、物理态优先——锚点口径不漂）
        pieces.push(...await indexPiecesOfVol(bookID, vols, v, pointFilter, physicalPoints));
    }
    if (pieces.length > CONTEXT_PIECE_LIMIT) {
        throw new Error(`素材片数 ${pieces.length} 超上限 ${CONTEXT_PIECE_LIMIT}——用 scope.vols 按卷分批（一次建一卷逐步拼全）`);
    }
    pieces.sort((a, b) => a.point - b.point);
    // 块态片（docID 空）excerpt 已在回退时构造——pieceExcerpt 对空 docID 返 fallbackTitle
    // 会把它覆盖成 title（e2e 实锤），只补物理片
    for (const p of pieces) if (p.docID) p.excerpt = await pieceExcerpt(p.docID, p.title);

    const pool = await readPoolExisting(bookID);
    const titleRow = await api.sql<{ content: string }>(`select content from blocks where id='${bookID}' limit 1`) ?? [];
    return {
        book: { bookID, title: titleRow[0]?.content ?? bookID, pieceCount, volCount: vols.length },
        vols: ctxVols,
        pieces,
        pool,
        alignment: ALIGNMENT_TEXT,
    };
}

/** 片首段：getChildBlocks 直读，首个 type='p' 块 content 截 200 字 */
async function pieceExcerpt(docID: string, fallbackTitle: string): Promise<string> {
    if (!docID) return fallbackTitle;
    const blocks = await api.getChildBlocks(docID).catch(() => []);
    const first = (blocks ?? []).find((b: any) => b?.type === "p");
    const text = String(first?.content ?? "").replace(/\s+/g, " ").trim();
    return text ? text.slice(0, 200) : fallbackTitle;
}

/** 块态素材回退：该卷物理片未覆盖的 point 按索引窗口构造（skipPoints=物理片已占的
 *  point，混合态逐 point 合并）。title=[NNNNN]+首块 15 字（createNote docTitle 同口径
 *  ——与物理片名形态一致，片物理化后不漂）；excerpt=首个 p 块前 200 字（pieceExcerpt 同
 *  语义）；docID 空=无物理文档（anchors 只认 point，无消费冲突）。索引=petal 一维块 id
 *  表（convert 后=转书分片计算的原生产物；老式目录成书=逐卷切窗索引，同源同界） */
async function indexPiecesOfVol(
    bookID: string, vols: VolEntry[], vol: MapContextVol,
    pointFilter: Set<number> | null, skipPoints: Set<number>,
): Promise<MapContextPiece[]> {
    const volIdx = vols.findIndex(v => v.d === vol.id);
    if (volIdx < 0) return [];
    const off = volOffsets(vols);
    const index = await readBookIndex(bookID);
    if (index.length === 0) return [];
    const rows = await api.getChildBlocks(vol.id).catch(() => []);
    const byID = new Map((rows ?? []).map((r: any) => [String(r?.id ?? ""), r]));
    const out: MapContextPiece[] = [];
    for (let point = off[volIdx]; point < off[volIdx + 1] && point < index.length; point++) {
        if (skipPoints.has(point)) continue;
        if (pointFilter && !pointFilter.has(point)) continue;
        const blocks = (index[point] ?? []).map(id => byID.get(id)).filter(Boolean) as any[];
        if (blocks.length === 0) continue; // 悬空 id 窗口（书被编辑后索引残留）不产素材
        // title=首个有内容块（含标题块）——createNote docTitle 同口径，物理化后文件名不漂
        const firstContent = blocks.find(b => String(b?.content ?? "").trim());
        const first = blocks.find(b => b?.type === "p") ?? firstContent;
        const head = String(firstContent?.content ?? "").slice(0, 15).replace(/[　\/ ​]+/g, "").trim();
        const excerpt = String(first?.content ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
        out.push({
            point, volID: vol.id,
            title: `[${String(point).padStart(5, "0")}]${head || "（空片）"}`,
            excerpt: excerpt || `（片 ${point}）`, docID: "",
        });
    }
    return out;
}
