// □1 目录书卷表新鲜度校验：出场链读 point 前跑——卷增删/重排（用户在文件树拖动）
// → 按卷 id 重组全书索引+卷表+point 映射。只动索引数据不动片文档（可恢复红线：
// 重组结果可由下次 ensure 复核；片文档仍在原卷下由 IAL 锚定，重划分链照常全量重建）。
// deps 注入（progData.ts 同款模式）：纯编排可单测；生产实现 volRebuildDeps()。
// import 纪律：本文件只 import 纯模块（volIndex/ProgressiveStorage/Split2Pieces 的
// 具名函数）——Progressive.ts 的接线在 Progressive.ts 本侧（勿把 .svelte 链拖进单测）。
import { rebuildVolIndex, mapPoint } from "./volIndex";
import type { VolEntry } from "./volIndex";

export interface VolRebuildDeps {
    listVolIDs(bookID: string): Promise<string[]>;
    loadVolTable(bookID: string): Promise<VolEntry[]>;
    saveVolTable(bookID: string, vols: VolEntry[]): Promise<void>;
    loadIndex(bookID: string): Promise<string[][]>;
    saveIndex(bookID: string, pieces: string[][]): Promise<void>;
    getPoint(bookID: string): Promise<number>;
    setPoint(bookID: string, point: number): Promise<void>;
    log(msg: string): void;
}

/** 卷表与文件树实时卷序一致？序与集都比对（0 片卷也占位——新空卷=结构变化须落表） */
function sameOrder(a: VolEntry[], ids: string[]): boolean {
    return a.length === ids.length && a.every((v, i) => v.d === ids[i]);
}

/** 校验并在漂移时重组。返回是否发生了重组（true=索引/卷表/point 已更新）。 */
export async function ensureVolTableFresh(bookID: string, deps: VolRebuildDeps): Promise<boolean> {
    const vols = await deps.loadVolTable(bookID);
    if (vols.length === 0) return false; // 非目录书/损坏=按现状走（调用方已判 dirMode）
    const liveIDs = await deps.listVolIDs(bookID);
    // review P1-2：空枚举对非空卷书只可能是查询异常（内核重启索引重建窗口书壳 SQL
    // 查空）——当「全部卷删除」处理会把全书片段清空落盘+point 钳 0。保守跳过，
    // 出场按盘上索引继续，下次出场（索引追上）自愈。
    if (liveIDs.length === 0 && vols.length > 0) {
        deps.log(`liveIDs empty but vols=${vols.length} book=${bookID} — skip rebuild (query anomaly)`);
        return false;
    }
    if (sameOrder(vols, liveIDs)) {
        // review P1-1 守卫：写序=先卷表后索引，中断态=新表+老索引（sameOrder 过、Σ 不齐）
        // ——此时按表切段索引=段与卷 id 张冠李戴。Σ 不等只可能是上次两写中断（或人工
        // 改盘），保守跳过不重组；重开加书弹窗重分片可重建（写库同样先表后序，落定自齐）。
        const idxLen = (await deps.loadIndex(bookID)).length;
        const sum = vols.reduce((s, v) => s + v.n, 0);
        if (sum !== idxLen) {
            deps.log(`vol table Σn=${sum} != index ${idxLen} book=${bookID} — interrupted two-write? skip rebuild`);
            return false;
        }
        return false;
    }
    const pieces = await deps.loadIndex(bookID);
    const next = rebuildVolIndex(vols, pieces, liveIDs);
    const oldPoint = await deps.getPoint(bookID);
    const newPoint = mapPoint(vols, next.vols, oldPoint);
    // review P1-1：先卷表后索引——中断态=新表+老索引（sameOrder Σ 守卫可检测）；
    // 原序（先索引）的反向中断=老表切新索引=错位重组持久化且 sameOrder 恒真永不自愈
    await deps.saveVolTable(bookID, next.vols);
    await deps.saveIndex(bookID, next.pieces);
    if (newPoint !== oldPoint) await deps.setPoint(bookID, newPoint);
    deps.log(`rebuild book=${bookID} vols ${vols.length}->${next.vols.length} pieces ${pieces.length}->${next.pieces.length} point ${oldPoint}->${newPoint}`);
    return true;
}

// ============ 生产侧（真实 siyuan/storage） ============
import { progStorage } from "./ProgressiveStorage";
import { listVolIDs } from "./Split2Pieces";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";

export function volRebuildDeps() {
    return {
        listVolIDs,
        loadVolTable: (id: string) => progStorage.loadVolTable(id),
        saveVolTable: (id: string, vols: VolEntry[]) => progStorage.saveVolTable(id, vols),
        loadIndex: (id: string) => progStorage.loadBookIndexIfNeeded(id),
        saveIndex: async (id: string, pieces: string[][]) => {
            // saveIndex 收 WordCountType[][]（preSave 只取 .id 落盘）——喂 {id} 形即同构
            await progStorage.saveIndex(id, pieces.map(p => p.map(bid => ({ id: bid }) as WordCountType)));
        },
        getPoint: async (id: string) => (await progStorage.booksInfo(id)).point ?? 0,
        setPoint: (id: string, point: number) => progStorage.gotoBlock(id, point),
        log: (msg: string) => debugLog("volbook", msg, "progressive"),
    } satisfies VolRebuildDeps;
}
