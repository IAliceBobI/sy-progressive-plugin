// □8 知识地图——前端 IO 面（浏览器环境；纯函数在 bookMapCore/bookMapLayout）。
// 读池=SQL attributes 找专用文档→getChildBlocks 直读 custom 块（kernel bookMapIo
// 的前端复刻，无 goja 缓存层——前端低频打开，SQL 直查+IAL 命中即信；SQL miss 走
// 文件树兜底 findMapDocIDByTree——索引窗内刚建的地图文档不误报空态）。
// 片枚举=卷表→逐卷 listDocsByPath [NNNNN] 前缀（collectMapContext 同款）；
// readcard 批查挂片文档 IAL（readCurve.ts sweep 同源键）。
// ⚠读操作不建文档（review P2-4 纪律）；写 views=整池重写+复核读 JSON 全比
// （writePool 前端版；与 kernel map_save 并发=后写者赢，低概率场景记 P2 不设跨端锁）。
import { siyuan } from "../../sy-tomato-plugin/src/libs/siyuanApi";
import { OpenSyFile2 } from "../../sy-tomato-plugin/src/libs/navUtils";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
import type { Plugin } from "siyuan";
import {
    buildBookMapMD, parseBookMapContent, normalizePool, canonicalJSON,
    type BookMap, type BookMapView,
} from "./bookMapCore";
import type { VolEntry } from "./volIndex";

/** 同 kernel bookMapIo MarkKey（本地声明防拖依赖链，progData PLOG_* 先例） */
const MarkKey = "custom-progmark";
const READCARD_KEY = "custom-prog-readcard";

/** bookID 形态白名单（mapBookGuard 同守卫——SQL 拼串面收口，P1-2 前车） */
export const BOOK_ID_RE = /^\d{14}-[a-z0-9]+$/;

const mapDocIalValue = (bookID: string) => `map@${bookID}`;
/** 同 kernel bookMapIo MAP_DOC_NAME（本地声明防拖依赖链） */
const MAP_DOC_NAME = "知识地图";

/** 找地图专用文档 id（SQL attributes；未建/索引窗 miss → null） */
async function findMapDocID(bookID: string): Promise<string | null> {
    const rows = (await siyuan.sql(
        `select block_id from attributes where name='${MarkKey}' and value='${mapDocIalValue(bookID)}' limit 1`)) as { block_id: string }[] ?? [];
    return rows[0]?.block_id ?? null;
}

/** 打磨批（□8 P2「读池索引窗空态反向误导」）：SQL miss 的文件树兜底——map_save 刚建
 *  的地图文档 attributes 行未入索引窗，Dialog 立开读 miss →「暂无地图数据」反向误导。
 *  listDocsByPath=文件系统直读无索引窗（findPieceDoc 同款兜底家族）；只读不建（纪律）
 *  不变。IAL 复核防同名手造文档冒认 */
async function findMapDocIDByTree(bookID: string): Promise<string | null> {
    const info = await siyuan.getBlockInfo(bookID).catch(() => null);
    if (!info?.box) return null;
    const shellPath = String((info as any).path ?? "").replace(/\.sy$/, "");
    // 前端 HTTP 通道 data={box, files:[...]}——文档数组在 .files（kernel goja 版已解包勿互抄）
    const resp = await siyuan.listDocsByPath(info.box, shellPath).catch(() => null);
    const docs = (((resp as any)?.files ?? resp) as any[] | null) ?? [];
    const hit = docs.find(d => String(d?.name ?? "") === MAP_DOC_NAME);
    if (!hit?.id) return null;
    const attrs = await siyuan.getBlockAttrs(String(hit.id)).catch(() => null);
    return attrs && attrs[MarkKey] === mapDocIalValue(bookID) ? String(hit.id) : null;
}

/** 文档里找围栏块；文档已删 getChildBlocks 抛错 → catch 落空 */
async function findMapBlock(docID: string): Promise<{ id: string; map: BookMap } | null> {
    const children = (await siyuan.getChildBlocks(docID).catch(() => [])) ?? [];
    for (const b of children) {
        if ((b as any)?.type !== "custom") continue;
        const map = parseBookMapContent(String((b as any).content ?? ""));
        if (map) return { id: String((b as any).id), map };
    }
    return null;
}

/** 读池子（只读不建）：未建/坏数据 → null。SQL miss 走文件树兜底（索引窗反向误导） */
export async function readPoolFront(bookID: string): Promise<BookMap | null> {
    if (!BOOK_ID_RE.test(bookID)) return null;
    const docID = await locateMapDoc(bookID);
    if (!docID) return null;
    const found = await findMapBlock(docID);
    return found?.map ?? null;
}

/** 定位地图专用文档（saveView/readPoolFront 共用）：SQL attributes → 文件树兜底 */
async function locateMapDoc(bookID: string): Promise<string | null> {
    return (await findMapDocID(bookID)) ?? (await findMapDocIDByTree(bookID));
}

// ============ 片枚举与 readcard 三态 ============

export interface PieceStat { point: number; docID: string; readcard?: string }

/**
 * 卷表→逐卷枚举片（[NNNNN] 前缀识别，渐进内部文档天然滤除）→readcard 批查。
 * 卷表由调用方传（Dialog 层 progStorage.loadVolTable——测试免 mock progStorage）。
 * 书壳不可读/空卷目录 catch 落空；[NNNNN] 与卷表 n 不核对（片枚举以实存为准，
 * 卷表 n 是片数快照——书编辑后两者短暂失配是既有语义）。
 */
export async function collectPieceStats(bookID: string, vols: VolEntry[]): Promise<Map<number, PieceStat>> {
    const out = new Map<number, PieceStat>();
    if (!BOOK_ID_RE.test(bookID) || !vols.length) return out;
    const info = await siyuan.getBlockInfo(bookID).catch(() => null);
    if (!info?.box) return out;
    const shellPath = String((info as any).path ?? "").replace(/\.sy$/, "");
    // 逐卷并行枚举（review P2-4：30 卷串行=30 个往返拖长 loading），结果按卷序拼=
    // 确定性不变。空卷（0 子文档）无物理目录 code -1 抛错 → catch 落 []；
    // ⚠前端 HTTP 通道 data={box, files:[...]}（e2e 实测）——文档数组在 .files，
    // kernel goja 版 api 已解包，两端形态不同勿互抄
    const perVol = await Promise.all(vols.map(v =>
        siyuan.listDocsByPath(info.box, `${shellPath}/${v.d}`)
            .then(resp => (((resp as any)?.files ?? resp) as any[] | null) ?? [])
            .catch(() => [] as any[])));
    const pieces: PieceStat[] = [];
    for (const docs of perVol) {
        for (const d of docs) {
            const m = /^\[(\d{5})\]/.exec(String(d?.name ?? ""));
            if (!m) continue;
            pieces.push({ point: Number(m[1]), docID: String(d?.id ?? "") });
        }
    }
    if (!pieces.length) return out;
    // readcard 批查（片文档 IAL；500/批——片数级远小于 readCurve sweep 全量）
    for (let i = 0; i < pieces.length; i += 500) {
        const batch = pieces.slice(i, i + 500);
        const inList = batch.map(p => `"${p.docID}"`).join(",");
        const rows = (await siyuan.sql(
            `select block_id, value from attributes where name='${READCARD_KEY}' and block_id in (${inList}) limit 10000000`).catch(() => [])) as { block_id: string; value: string }[] ?? [];
        const rc = new Map(rows.map(r => [r.block_id, r.value]));
        for (const p of batch) {
            const v = rc.get(p.docID);
            out.set(p.point, v ? { ...p, readcard: v } : p);
        }
    }
    return out;
}

/** point → 片文档 id（跳原文用）；未命中 null */
export function pointDocID(stats: Map<number, PieceStat>, point: number): string | null {
    return stats.get(point)?.docID ?? null;
}

// ============ 视图持久化 ============

/** 保存视图：读池→views 同名替换/push→updateBlock 整池重写→复核读验真。
 *  文档未建 → false 不建（读操作不建文档纪律）；复核不一致 → false。
 *  updateBlock 落盘毫秒级 fs 竞态窗同 kernel writePool（09-13 □9 实锤）——150ms 重试兜底 */
export async function saveView(bookID: string, view: BookMapView): Promise<boolean> {
    if (!BOOK_ID_RE.test(bookID)) return false;
    const docID = await locateMapDoc(bookID);
    if (!docID) return false;
    const found = await findMapBlock(docID);
    if (!found) return false;
    const next: BookMap = {
        ...found.map,
        views: [...found.map.views.filter(v => v.name !== view.name), { ...view }],
    };
    const md = buildBookMapMD(next);
    // 打磨批（□7 P2「大池子单行 JSON 块大小监控」）：写路径 Loki 留池子字节量
    //（巨池趋势可查——超 256KB 进 kernel 单块性能危险区，该分书/整理）
    debugLog("prog.bookmap", `saveView poolBytes=${md.length} views=${next.views.length}`, "progressive");
    await siyuan.updateBlock(found.id, md);
    // 写后验真：复核读双侧 normalizePool+canonicalJSON 键序归一（kernel writePool 同法）
    let expected = "";
    try { expected = canonicalJSON(normalizePool(JSON.parse(JSON.stringify(next)))); } catch { return false; }
    let after = await findMapBlock(docID);
    if (!after || canonicalJSON(after.map) !== expected) {
        // 150ms 重试兜 fs 毫秒窗（canonicalJSON 修复后常态首读直过，本分支未经实证——kernel 侧同注）
        await new Promise(r => setTimeout(r, 150));
        after = await findMapBlock(docID);
    }
    if (!after) return false;
    return canonicalJSON(after.map) === expected;
}

// ============ 跳原文 ============

/** 双击节点跳证据锚片：第一锚（点序最小）所在片文档 openTab */
export async function jumpToPiece(plugin: Plugin, anchors: number[], stats: Map<number, PieceStat>): Promise<boolean> {
    const first = [...anchors].sort((a, b) => a - b).find(a => pointDocID(stats, a));
    const docID = first != null ? pointDocID(stats, first) : null;
    if (!docID) return false;
    await OpenSyFile2(plugin, docID);
    return true;
}
