// 书籍状态判定链（2026-08-28 设计共识）：boxID 对应笔记本 closed=true → ⏸ 笔记本
// 已关闭（可能是暂时的，不提供清理；闭箱检查先于 SQL——内核 Unindex 异步入队，
// 关箱广播先于 SQL 退库，事件化失效秒级重判时行还在，闭箱才是真状态）；
// 笔记本开着 → SQL 查得到 = 活书；查不到再文件层兜底——书自己 box 目录命中
// <bookID>.sy = ok（索引重建窗口）、闭箱目录命中 = closed（挪书进闭笔记本边角）、
// 都没有才判 ⚠ 疑似失效。移动端无 fs 降级 ⚠。判定低频触发（出片前/管理页打开/
// 手动刷新/开箱关箱事件失效），结果短缓存——不做主动轮询。
import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import { osFs } from "../../sy-tomato-plugin/src/libs/globals";
import { events } from "../../sy-tomato-plugin/src/libs/Events";
import { progStorage } from "./ProgressiveStorage";

export type BookStatus = "ok" | "closed" | "lost";

export interface BookStatusInfo {
    status: BookStatus;
    /** 提示文案里带书名（books.json bookName 缓存或 SQL 实查） */
    name: string;
    /** 移动端无 fs 兜底时的保守标注（文案提示「也可能在已关闭的笔记本中」） */
    fsUnavailable?: boolean;
}

/** 纯判定：无副作用，单测注入 rows/closedBoxes/fs 命中集。
 *  新书保护期（2026-08-28 误伤教训）：加书 ≤2 分钟的书绝不判 lost——刚加完就阅读
 *  是标准路径，此时 SQL 索引可能延迟、fs 递归也赶不上，宁可信其活（closed 无害不保护）。 */
export function judgeBookStatus(args: {
    sqlIDs: Set<string>;
    boxOf: { [bookID: string]: string };
    bookNames: { [bookID: string]: string };
    closedBoxes: Set<string>;
    /** 文件层在书自己 box 目录命中 <bookID>.sy（文档在、SQL 索引延迟中） */
    ownHitIDs: Set<string>;
    /** 文件层在闭箱目录命中（挪书进闭笔记本的边角） */
    fsHitIDs: Set<string>;
    fsAvailable: boolean;
    timeOf?: { [bookID: string]: number };
    now?: number;
}): Map<string, BookStatusInfo> {
    const m = new Map<string, BookStatusInfo>();
    const now = args.now ?? Date.now();
    for (const [bookID, box] of Object.entries(args.boxOf)) {
        const name = args.bookNames[bookID] || bookID;
        // 闭箱优先于 SQL 命中：Unindex 异步，关箱瞬间 SQL 行还在但书已不可读
        if (args.closedBoxes.has(box)) {
            m.set(bookID, { status: "closed", name });
            continue;
        }
        if (args.sqlIDs.has(bookID)) {
            m.set(bookID, { status: "ok", name });
            continue;
        }
        // 笔记本开着且文件在：SQL 索引重建窗口（开箱后几秒~几十秒）——判 ok，
        // createPiece 查不到块返回 "" 由 startToLearnWithLock 的重试循环扛过索引期
        if (args.ownHitIDs.has(bookID)) {
            m.set(bookID, { status: "ok", name });
            continue;
        }
        if (args.fsHitIDs.has(bookID)) {
            m.set(bookID, { status: "closed", name });
            continue;
        }
        // 新书保护期：time 太新不判死（索引延迟窗口），交给阅读链路重试
        const time = args.timeOf?.[bookID] ?? 0;
        if (time > 0 && now - time < NEW_BOOK_GRACE_MS) {
            m.set(bookID, { status: "ok", name });
            continue;
        }
        // 移动端无 fs：可能是挪进闭笔记本的书，标注文案会注明「也可能在已关闭的笔记本中」
        m.set(bookID, { status: "lost", name, fsUnavailable: !args.fsAvailable });
    }
    return m;
}

/** 新书保护期时长：加书后 2 分钟内不判 lost */
export const NEW_BOOK_GRACE_MS = 2 * 60 * 1000;

// ============ 生产侧（真实 siyuan/fs） ============

const CACHE_TTL_MS = 30 * 1000;
let cache: { at: number; m: Map<string, BookStatusInfo> } | null = null;

/** 文件层兜底：书自己 box 目录命中=文档在（索引延迟）；闭箱目录命中=挪进闭笔记本。
 *  ⚠ 必须递归：子文档的 .sy 在父文档同名子目录里（demoDoc/Raincloudsrol/…），
 *  只查 box 根一层会对所有子文档书误判 lost（2026-08-28 真实误伤教训）。 */
async function fsScan(boxOf: { [bookID: string]: string }, missing: string[], closedBoxes: Set<string>): Promise<{ ownHit: Set<string>; closedHit: Set<string>; ok: boolean }> {
    const ownHit = new Set<string>();
    const closedHit = new Set<string>();
    if (missing.length === 0) return { ownHit, closedHit, ok: true };
    if (events.isMobile) return { ownHit, closedHit, ok: false };
    try {
        const fs = osFs();
        const path = require("path");
        const dataDir = window.siyuan.config.system.dataDir;
        // box 目录下所有 .sy 相对路径集合（分隔符归一到 /，递归含父文档同名子目录）
        const listDocFiles = async (boxID: string): Promise<Set<string>> => {
            const rel = (await fs.readdir(path.join(dataDir, boxID), { recursive: true })) as string[];
            return new Set(rel.map(f => f.split(path.sep).join("/")));
        };
        const hitOf = (files: Set<string>, id: string) =>
            files.has(`${id}.sy`) || [...files].some(f => f.endsWith(`/${id}.sy`));

        // 缓存目录列表：同 box 多本书/多闭箱时只读一次盘
        const boxFiles = new Map<string, Set<string>>();
        const filesOf = async (boxID: string) => {
            let s = boxFiles.get(boxID);
            if (!s) { s = await listDocFiles(boxID); boxFiles.set(boxID, s); }
            return s;
        };

        for (const id of missing) {
            const box = boxOf[id] ?? "";
            // 自己的 box 开着才有「索引延迟判 ok」一说；关着的已在上游判 closed
            if (box && !closedBoxes.has(box)) {
                try {
                    if (hitOf(await filesOf(box), id)) { ownHit.add(id); continue; }
                } catch { /* 目录读不到按未命中走闭箱兜底 */ }
            }
            // box 为空（booksInfo 未补齐）也扫闭箱目录：按文件名全局找挪进闭箱的书
            for (const cb of closedBoxes) {
                try {
                    if (hitOf(await filesOf(cb), id)) { closedHit.add(id); break; }
                } catch { /* 闭箱目录读不到即跳过 */ }
            }
        }
        return { ownHit, closedHit, ok: true };
    } catch {
        return { ownHit, closedHit, ok: false };
    }
}

/** 全量判定（管理页/出片前共用）。force=true 跳过缓存（清理后/手动刷新用） */
export async function loadBookStatuses(force = false): Promise<Map<string, BookStatusInfo>> {
    const now = Date.now();
    if (!force && cache && now - cache.at < CACHE_TTL_MS) return cache.m;

    const infos = progStorage.booksInfos();
    const ids = Object.keys(infos);
    const boxOf: { [k: string]: string } = {};
    const bookNames: { [k: string]: string } = {};
    for (const id of ids) {
        boxOf[id] = infos[id]?.boxID ?? "";
        bookNames[id] = infos[id]?.bookName ?? "";
    }
    if (ids.length === 0) {
        cache = { at: now, m: new Map() };
        return cache.m;
    }

    // 一次批量 SQL 查所有书档存在性（type='d' 才算文档还在）。
    // 显式 limit 防内核 64 截尾：一批 100 本全活会被截到 64，尾部书误走 missing→
    // 移动端无 fs 兜底时误判 lost「书丢了」（桌面端 ownHit 兜底也白扫一次盘）
    const sqlIDs = new Set<string>();
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));
    const rows = (await Promise.all(chunks.map(c =>
        siyuan.sql(`select id from blocks where type='d' and id in (${c.map(x => `'${x}'`).join(",")}) limit 10000000`)
    ))).flat() as any[] ?? [];
    for (const r of rows) sqlIDs.add(r.id);

    // 闭箱集合全程参与判定（closed 检查先于 SQL 命中），不能只在有 missing 时才查
    let closedBoxes = new Set<string>();
    try {
        const nbs = await siyuan.lsNotebooks();
        closedBoxes = new Set((nbs ?? []).filter(n => n.closed).map(n => n.id));
    } catch { /* lsNotebooks 失败按全开处理，走文件层兜底 */ }

    const missing = ids.filter(id => !sqlIDs.has(id));

    const fsRes = await fsScan(boxOf, missing, closedBoxes);

    const timeOf: { [k: string]: number } = {};
    for (const id of ids) timeOf[id] = infos[id]?.time ?? 0;
    const m = judgeBookStatus({
        sqlIDs, boxOf, bookNames, closedBoxes,
        ownHitIDs: fsRes.ownHit, fsHitIDs: fsRes.closedHit, fsAvailable: fsRes.ok,
        timeOf, now,
    });
    cache = { at: now, m };
    return m;
}

/** 清理记录后调（removeIndex 已执行），让下一次判定立即反映现状 */
export function invalidateBookStatusCache() {
    cache = null;
}
