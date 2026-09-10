// 阅读曲线接管·生产侧（1530 期1；设计事实源=memory reading-curve-takeover-design）。
// 分片卡 due=滚筒节奏投影进官方闪卡复习（统一混排入口），官方评分回流滚筒状态
// （编辑器与官方复习双入口、一本账）。纯函数核在 readCurveCore.ts（单测直入，
// 本文件链 helper 拉 .svelte 进不了 vitest——分层红线）。
//
// ⚠️ riff 3.9.0 v2 重写预警：本文件对 riff 的一切读写收口在 setReadingDues/
// getReadingCardStates 两函数（内部=batchSetRiffCardsDueTimeByBlockID/
// getRiffCardsByBlockIDs，块 ID 语义）。3.9.0 换「设置到期时间」（CardID 语义）+
// flashcard-review-* 事件驱动时只动这层：setReadingDues 按 CardID 重写、巡查
// 从轮询升事件=删定时器加订阅。
import { Constants } from "siyuan";
import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
import { dailyQuota, readCurveSweepMins, readCurveTakeover } from "../../sy-tomato-plugin/src/libs/stores";
import { MarkKey, PDIGEST_CTIME, TEMP_CONTENT } from "../../sy-tomato-plugin/src/libs/gconst";
import { progStorage } from "./ProgressiveStorage";
import * as constants from "./constants";
import { lockWithLease } from "./lockLease";
import { mergeMissingBooks, rollerMarkRead, rollerTodayReads } from "./roller";
import { invalidateTailToday } from "./tailCardAppend";
import { notifyFleetChanged } from "./fleetNotify";
import { queryDigestTree } from "./digestUtils";
import { fetchWritingPieces, pickWritingDispatch } from "./writeBook";
import { PdigestReviewKey } from "./reviewQueue";
import { parseBookIDFromCtime } from "./progData";
import { createPiece, findPieceDoc } from "./helper";
import {
    CurvePlanCard, READCARD_KEY, ReadCardKind, dueStamp, isRated, normalizeDue,
    planSweep, shouldReconcilePiece, sortForReconcile, tomorrowStart,
} from "./readCurveCore";

// ============ 3.9.0 迁移层（riff 读写唯一收口） ============

/** 阅读卡批量改 due（blockID 语义；3.9.0 迁移=按 CardID 重写） */
export async function setReadingDues(dues: { id: string; due: string }[]): Promise<void> {
    if (!dues.length) return;
    await siyuan.batchSetRiffCardsDueTimeByBlockID(dues);
}

/** 查块集 riff 卡现状（块→末张卡；无卡块不在返回 Map——孤儿判定靠它） */
async function getReadingCardStates(blockIDs: string[]): Promise<Map<string, GetCardRetBlock[]>> {
    if (!blockIDs.length) return new Map<string, GetCardRetBlock[]>();
    return siyuan.getRiffCardsByBlockIDs(blockIDs);
}

/** 摘阅读卡（QUICK 牌组限定防误删用户手动卡；片已删的孤儿被内核校验拒=无害滞留） */
async function removeReadingCards(blockIDs: string[]) {
    if (!blockIDs.length) return;
    await siyuan.removeRiffCards(blockIDs, Constants.QUICK_DECK_ID);
}

// ============ 卡集合（身份键 SQL × riff 现状合并） ============

/** 片 MarkKey 值（TEMP#bookID,point）反解；非片形态（book#…/外书）返 null */
function parsePieceMark(value: string): { bookID: string; point: number } | null {
    const m = String(value ?? "").match(new RegExp(`^${TEMP_CONTENT}#([^,]+),(\\d+)$`));
    return m ? { bookID: m[1], point: +m[2] } : null;
}

/** 全量阅读卡：身份键行 × riff 现状——riff 查无卡的键=孤儿（建卡失败残留/已摘残留），
 *  顺手清键（块已删的残留行极窄窗口由 clearKeysSafe 存在性过滤兜住） */
export async function getReadingCards(): Promise<CurvePlanCard[]> {
    const rows = (await siyuan.sql(
        `select block_id, value from attributes where name='${READCARD_KEY}' limit 10000000`)) as any[] ?? [];
    if (!rows.length) return [];
    const ids = rows.map(r => r.block_id);
    const inList = ids.map(id => `'${id}'`).join(",");
    const [markRows, ctRows, cardStates] = await Promise.all([
        siyuan.sql(`select block_id, value from attributes where name='${MarkKey}' and block_id in (${inList}) limit 10000000`) as Promise<any[]> ?? [],
        siyuan.sql(`select block_id, value from attributes where name='${PDIGEST_CTIME}' and block_id in (${inList}) limit 10000000`) as Promise<any[]> ?? [],
        getReadingCardStates(ids),
    ]);
    const markOf = new Map((markRows ?? []).map(r => [r.block_id, String(r.value ?? "")]));
    const ctOf = new Map((ctRows ?? []).map(r => [r.block_id, String(r.value ?? "")]));
    const infos = progStorage.booksInfos();

    const cards: CurvePlanCard[] = [];
    const orphans: string[] = [];
    for (const r of rows) {
        const states = cardStates.get(r.block_id);
        if (!states?.length) { orphans.push(r.block_id); continue; } // 卡不在 riff
        const rc = (states[states.length - 1].riffCard ?? {}) as RiffCard;
        // RiffCard.lastReview 类型声明 number 但 API 实返 ISO 串（3.8.x 实测）——双形态兼容
        const lr = rc.lastReview as unknown;
        const lastReviewMs = typeof lr === "number" ? lr : lr ? Date.parse(String(lr)) || 0 : 0;
        // 归属反解：片/槽片=MarkKey（书 writing 位分 slot）；素材=PDIGEST_CTIME
        const piece = parsePieceMark(markOf.get(r.block_id) ?? "");
        let bookID = "";
        let kind: ReadCardKind = "material";
        let point: number | null = null;
        if (piece) {
            bookID = piece.bookID;
            point = piece.point;
            kind = infos[bookID]?.writing ? "slot" : "piece";
        } else {
            const bid = parseBookIDFromCtime(ctOf.get(r.block_id) ?? "");
            if (bid) bookID = bid;
        }
        cards.push({
            blockID: r.block_id,
            bookID, kind, point,
            readcard: String(r.value ?? ""),
            lastReviewMs,
            due: normalizeDue(rc.due as string),
        });
    }
    await clearKeysSafe(orphans);
    return cards;
}

/** 清身份键（块存在性过滤——attributes 索引延迟窗口内死块行发事务会 txerr 弹窗） */
async function clearKeysSafe(ids: string[]) {
    if (!ids.length) return;
    const alive = new Set(((await siyuan.sql(
        `select id from blocks where id in (${ids.map(id => `'${id}'`).join(",")}) limit 10000000`)) as any[] ?? []).map(r => r.id));
    const live = ids.filter(id => alive.has(id));
    if (!live.length) return;
    await siyuan.batchSetBlockAttrs(live.map(id => ({ id, attrs: { [READCARD_KEY]: "" } as any })));
}

// ============ 目标集（各书「下一片」——调度同源函数现算） ============

/** 各在读书下一片 + 额度闸门（DayLog b[bookID]<q——勿用 riff lastReview 计数：
 *  自家建卡 review(2) 恒虚高 1 且编辑器入口读片不产生 lastReview，双入口不统一）。
 *  noCreate=onload 态：只认已建片（findPieceDoc），不凭空建片文档。 */
async function computeTargets(noCreate: boolean): Promise<{
    targets: Map<string, string>;
    gateOpen: Map<string, boolean>;
}> {
    const infos = progStorage.booksInfos();
    const ro = await progStorage.loadReadingOrder();
    const order = mergeMissingBooks(ro, Object.keys(infos)).order;
    const [todayReads, revisitRows] = await Promise.all([
        rollerTodayReads(),
        siyuan.sql(`select block_id from attributes where name='${PdigestReviewKey}' limit 10000000`) as Promise<any[]> ?? [],
    ]);
    // 素材双调度重叠防御：已在复访账（custom-pdigest-review）的素材不作目标（取次老）
    const revisiting = new Set((revisitRows ?? []).map(r => r.block_id));
    const quota = Number(dailyQuota.get()) || 3;
    const targets = new Map<string, string>();
    const gateOpen = new Map<string, boolean>();
    for (const bookID of order) {
        const info = infos[bookID];
        if (!info || info.ignored || info.archived) continue; // 忽略/归档：其卡全落「其余未评分」+99
        gateOpen.set(bookID, (todayReads[bookID] ?? 0) < quota);
        if (info.manualMode) continue; // 手动书滚筒排除，不投影
        let targetID = "";
        if (info.writing) {
            const flat = (await queryDigestTree(bookID)).flat
                .map(n => (revisiting.has(n.id) ? { ...n, done: true } : n));
            const dispatch = pickWritingDispatch(flat, await fetchWritingPieces(bookID), info.activePoint);
            if (!dispatch) continue; // 0 槽空池/全定稿=终态，投影自然停
            targetID = dispatch.kind === "material" ? dispatch.id : dispatch.docID;
        } else {
            const index = await progStorage.loadBookIndexIfNeeded(bookID);
            const point = info.point ?? 0;
            if (point >= index.length) continue; // 读完/未分片
            targetID = noCreate ? await findPieceDoc(bookID, point) : await createPiece(info, index, point);
            if (!targetID) continue; // 索引未就绪（可重试）/onload 未建——下轮兜底
        }
        targets.set(bookID, targetID);
    }
    return { targets, gateOpen };
}

// ============ 对账回写（官方评分 → 滚筒状态；双分支） ============

/** markReadSafe 同款三件（roller 记账+片尾卡今日缓存+舰队联动）——Progressive 私有
 *  方法不可达，此处直组等价链 */
async function markReadAndNotify(bookID: string, point?: number) {
    try {
        await rollerMarkRead(bookID, point);
        invalidateTailToday();
        notifyFleetChanged();
    } catch (e) {
        console.error("roller markRead failed", e);
    }
}

/** lastServed 回流（公平轮转双入口一致） */
async function saveLastServed(bookID: string) {
    if (!bookID) return;
    const ro = await progStorage.loadReadingOrder();
    await progStorage.saveReadingOrder({ order: ro.order, lastServed: bookID });
}

/** 已评分卡对账（isRated=身份键水位线判据，进程重启丢基线也幂等——对完即摘，
 *  卡不在=已对账自然出局）。序=sortForReconcile（同书 piece 升序，review P0-1：
 *  乱序对账漏计+闸门连锁超额） */
async function reconcileRated(rated: CurvePlanCard[]) {
    const infos = progStorage.booksInfos();
    for (const c of sortForReconcile(rated)) {
        try {
            const info = c.bookID ? infos[c.bookID] : null;
            if (c.kind === "piece" && c.point != null && info) {
                // 自动书四步：只进不退 + lastServed + 同锚记账（编辑器翻页 markRead(p+1)
                // 锚互斥，先到先计零双计）——书已越过（编辑器先推）只摘卡不回写
                if (shouldReconcilePiece(c.point, info.point ?? 0)) {
                    await progStorage.gotoBlock(c.bookID, c.point + 1);  // gotoBlock=滚筒翻页同款 point 写通道
                    await markReadAndNotify(c.bookID, c.point + 1);
                }
                await saveLastServed(c.bookID);
            } else if (c.kind === "material" && info) {
                // 素材：锤=完成态（已锤=编辑器入口已消费过，只摘卡不再计——双入口一账）
                const attrs = await siyuan.getBlockAttrs(c.blockID);
                const ct = String((attrs as any)?.[PDIGEST_CTIME] ?? "");
                if (ct && !ct.startsWith("🔨")) {
                    await siyuan.setBlockAttrs(c.blockID, { [PDIGEST_CTIME]: `🔨#${ct}` } as any);
                    await markReadAndNotify(c.bookID);
                }
                await saveLastServed(c.bookID);
            } else if (c.kind === "slot" && c.point != null && info) {
                // 槽片：评分≠定稿不前进，slotPoint 锚防同 slot 重复计；持续为下一片直到定稿
                await markReadAndNotify(c.bookID, c.point);
                await saveLastServed(c.bookID);
            }
            await removeReadingCards([c.blockID]);
            await clearKeysSafe([c.blockID]);
            debugLog("readcurve", `reconciled ${c.kind} ${c.blockID} book=${c.bookID}`, "progressive");
        } catch (e) {
            debugLog("readcurve", `reconcile fail ${c.blockID}: ${e}`, "progressive");
        }
    }
}

// ============ 建卡三连（readpoint 同构） ============

/** 片文档建阅读卡：挂身份键 → addRiffCards → 1s 尾链 review(2)+due=目标
 *  （review(2) 转 Review 态躲官方新卡限额；fire-and-forget，下轮巡查幂等补）。
 *  尾链收尾回读 lastReview 反写身份键（水位线校准，review P1-2）：setTimeout 只保
 *  至少 1s，主线程长任务可把 review 拖过「建卡+5s」余量 → isRated 误判真评分幽灵
 *  推进；校准后水位线恒=自家 review 实际时刻，晚于它的必为用户评分 */
export async function buildReadingCard(docID: string, due: string): Promise<void> {
    const ts = dueStamp(new Date());
    await siyuan.setBlockAttrs(docID, { [READCARD_KEY]: ts } as any);
    const added = await siyuan.addRiffCards([docID]);
    if (!added) {
        debugLog("readcurve", `addRiffCards null ${docID}`, "progressive");
        await clearKeysSafe([docID]);
        return;
    }
    setTimeout(() => {
        void (async () => {
            try {
                await siyuan.reviewRiffCardByBlockID(docID, 2);
                await setReadingDues([{ id: docID, due }]);
                const states = await getReadingCardStates([docID]);
                const lr = states.get(docID)?.at(-1)?.riffCard?.lastReview as unknown;
                const ms = typeof lr === "number" ? lr : lr ? Date.parse(String(lr)) || 0 : 0;
                if (ms > 0) await siyuan.setBlockAttrs(docID, { [READCARD_KEY]: dueStamp(new Date(ms)) } as any);
                debugLog("readcurve", `card built ${docID} due=${due}`, "progressive");
            } catch (e) {
                debugLog("readcurve", `build tail fail ${docID}: ${e}`, "progressive");
            }
        })();
    }, 1000);
}

// ============ 巡查（幂等 diff：无 diff 零写零请求） ============

const ReadCurveSweepLock = "ReadCurveSweepLock";
const MAIN_LOCKS = [constants.AddProgressiveReadingLock, constants.StartToLearnLock];

/** 与主锁族互斥（只读避让，无死锁面）：重分片/出片中途不建卡不回写（幽灵片防线） */
async function mainSweepLocksHeld(): Promise<boolean> {
    try {
        const q = await (navigator.locks as any).query();
        const names = [...(q?.held ?? []), ...(q?.pending ?? [])].map((x: any) => x?.name);
        return MAIN_LOCKS.some(n => names.includes(n));
    } catch {
        return false; // query 不可用（老内核/环境）不阻断巡查
    }
}

/** 巡查主流程：①扫已评分→对账回写+摘卡 ②目标集现算（看到对账后的最新 point）
 *  ③diff 拉 due ④目标片缺卡补建。noCreate=onload 态（只对账拉平不建片）。
 *  触发点：onload/推片后/复习翻卡/设置变更/定时兜底。 */
export async function sweepReadCurve(reason: string, opts: { noCreate?: boolean } = {}): Promise<void> {
    if (!readCurveTakeover.get()) {
        debugLog("readcurve", `sweep skip (${reason}): takeover off`, "progressive");
        return;
    }
    await lockWithLease(ReadCurveSweepLock, async () => {
        if (await mainSweepLocksHeld()) {
            debugLog("readcurve", `sweep skip (${reason}): main lock held`, "progressive");
            return;
        }
        try {
            const now = new Date();
            const cards0 = await getReadingCards();
            // ① 对账（评分晚于建卡+5s 余量=真评分；reps 基线可省——水位线判据幂等全覆盖）
            const rated = cards0.filter(c => isRated(c.readcard, c.lastReviewMs));
            if (rated.length) await reconcileRated(rated);
            // ② 目标集+③ diff（对账后世界态；已摘卡不再参与）
            const { targets, gateOpen } = await computeTargets(!!opts.noCreate);
            const ratedIDs = new Set(rated.map(c => c.blockID));
            const plan = planSweep({
                cards: cards0.filter(c => !ratedIDs.has(c.blockID)),
                targets, gateOpen, now,
            });
            if (plan.setDue.length) await setReadingDues(plan.setDue);
            if (plan.remove.length) { // 正常恒空（rated 已摘）；判据同源留作保险
                await removeReadingCards(plan.remove);
                await clearKeysSafe(plan.remove);
            }
            // ④ 目标片缺卡补建（含刚摘的续推片——「评分→摘卡→续推 due=now 连续读流」；
            //    新键新时刻，水位线判据天然不误触）
            const known = new Set(cards0.map(c => c.blockID));
            for (const [bookID, pieceID] of targets) {
                if (opts.noCreate) break; // onload 不建片（勿凭空多 N 个文档+巨书成本）
                if (known.has(pieceID)) continue;
                await buildReadingCard(pieceID, gateOpen.get(bookID) ? dueStamp(now) : tomorrowStart(now));
            }
            debugLog("readcurve",
                `sweep(${reason}) cards=${cards0.length} rated=${rated.length} due=${plan.setDue.length} build=${targets.size - [...targets.values()].filter(id => known.has(id)).length}`,
                "progressive");
        } catch (e) {
            debugLog("readcurve", `sweep fail (${reason}): ${e}`, "progressive");
        }
    }, { queued: false });
}

/** 关开关=末次清场：全量摘卡+清键（阅读卡 due 语义完全依赖巡查续命，弃管比不开
 *  更糟——readpoint「关不碰卡」先例不适用这边）。queued=true（review P1-1）：
 *  巡查持锁时排队等它跑完再清——ifAvailable 会静默丢清场，卡群变弃管孤儿 */
export async function clearReadCurve(): Promise<void> {
    await lockWithLease(ReadCurveSweepLock, async () => {
        try {
            const rows = (await siyuan.sql(
                `select block_id from attributes where name='${READCARD_KEY}' limit 10000000`)) as any[] ?? [];
            await removeReadingCards(rows.map(r => r.block_id));
            await clearKeysSafe(rows.map(r => r.block_id));
            debugLog("readcurve", `cleared ${rows.length} cards`, "progressive");
        } catch (e) {
            debugLog("readcurve", `clear fail: ${e}`, "progressive");
        }
    }, { queued: true });
}

// ============ item↔topic 互转通道（期3 预留：仅通道+window 命令位，不预排 UI）============

/** 进：块/文档纳入阅读曲线管理（身份键+建卡三连，due=now 立即进官方复习）。
 *  ⚠ 语义边界：非当前目标片的卡被巡查按 planSweep 非目标分支冻结 +99 天；评分
 *  对账按其 root 归属书走 piece/material/slot 分支——片内 item 块与片卡同 root
 *  双卡并存会双计，调用方自担（预留通道，UI 未排，帮助文档已提重复出现） */
export async function addToReadingCurve(blockID: string): Promise<void> {
    if (!readCurveTakeover.get()) {
        debugLog("readcurve", `channel add skip: takeover off`, "progressive");
        return;
    }
    await buildReadingCard(blockID, dueStamp(new Date()));
}

/** 出：退出阅读曲线管理（摘卡+清键；块已删的孤儿卡内核拒删=无害滞留） */
export async function removeFromReadingCurve(blockID: string): Promise<void> {
    await removeReadingCards([blockID]);
    await clearKeysSafe([blockID]);
}

// ============ 触发器（事件驱动为主+轻量定时兜底） ============

let sweepTimer: ReturnType<typeof setInterval> | null = null;
let takeoverStop: (() => void) | null = null;
let minsStop: (() => void) | null = null;
let quotaStop: (() => void) | null = null;
let takeoverPrev = false;
let quotaPrev = "";

function resetSweepTimer() {
    if (sweepTimer) { clearInterval(sweepTimer); sweepTimer = null; }
    const mins = Number(readCurveSweepMins.get()) || 0;
    if (!readCurveTakeover.get() || mins <= 0) return;
    sweepTimer = setInterval(() => void sweepReadCurve("timer"), mins * 60_000);
}

/** onload 接线：开关边缘（开→巡查/关→清场）+频率档热切+quota 档变更即时重算
 *  （review P2-4：闸门语义随 q 变，等 timer 兜底太迟）+定时兜底。
 *  注意 subscribe 首轮回调=当前值：takeoverPrev/quotaPrev 预置同值跳过，防 load 误触 */
export function initReadCurveTriggers() {
    takeoverPrev = readCurveTakeover.get();
    takeoverStop = readCurveTakeover.subscribe(v => {
        if (v === takeoverPrev) return;
        takeoverPrev = v;
        if (v) void sweepReadCurve("settings-on");
        else void clearReadCurve();
    });
    minsStop = readCurveSweepMins.subscribe(() => resetSweepTimer());
    quotaPrev = String(dailyQuota.get() ?? "");
    quotaStop = dailyQuota.subscribe(v => {
        if (v === quotaPrev) return;
        quotaPrev = v;
        void sweepReadCurve("settings-quota");
    });
    resetSweepTimer();
}

export function disposeReadCurve() {
    if (sweepTimer) { clearInterval(sweepTimer); sweepTimer = null; }
    takeoverStop?.(); takeoverStop = null;
    minsStop?.(); minsStop = null;
    quotaStop?.(); quotaStop = null;
}
