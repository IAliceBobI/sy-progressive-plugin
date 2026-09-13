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
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import { dailyQuota, readCurveSweepMins, readCurveTakeover, readCurveReadingPoint, readCurvePlainDocs, readCurvePiece, readCurveMaterial, readCurveDigest, readCurveCadMaterial, readCurveCadDigest, readCurveCadReadingPoint, readCurveCadPlain } from "../../sy-tomato-plugin/src/libs/stores";
import { MarkKey, PDIGEST_CTIME, TEMP_CONTENT } from "../../sy-tomato-plugin/src/libs/gconst";
import { progStorage } from "./ProgressiveStorage";
import * as constants from "./constants";
import { lockWithLease } from "./lockLease";
import { mergeMissingBooks, rollerMarkRead, rollerTodayReads, rollerTodayRevisits, rollerCountRevisit } from "./roller";
import { invalidateTailToday } from "./tailCardAppend";
import { notifyFleetChanged } from "./fleetNotify";
import { queryDigestTree } from "./digestUtils";
import { fetchWritingPieces, pickWritingDispatch } from "./writeBook";
import { PdigestReviewKey } from "./reviewQueue";
import { matUnreadOfRows, parseBookIDFromCtime, digestCountsInWindow } from "./progData";
import { createPiece, findPieceDoc, findCards } from "./helper";
import { loadBookStatuses } from "./bookStatus";
import {
    AUTORELAX_KEY, AUTO_RELAX_CAP, CurveMode, CurvePlanCard, parseReadCard, RATING_GRACE_MS, READCARD_KEY, READOUT_KEY, ReadCardKind,
    cadenceDays, cadenceOpts, consumeRound, DIGEST_BUILD_CAP, dueStamp, formatReadCard, GROW_INTERVALS,
    growInterval, isConsumedCurve, isMaterialFirstPush, isRPCardMarkdown, isRated, normalizeDue, parseStamp, planSweep, plusDays,
    RELAX_WINDOW_DAYS, relaxVerdict, relaxWindowStart, REVISIT_DAILY_LIMIT, rescheduleDays, SCHED_CHOICES, shouldReconcilePiece, sortForReconcile,
    toSchedValue, tomorrowStart, VisitFreq, VISITRATE_KEY,
} from "./readCurveCore";
import { statusLineOf } from "./readCurveText";

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

/** 片 MarkKey 值（TEMP#bookID,point）反解；非片形态（book#TEMP/外书/素材摘抄防删护栏）返 null。
 *  护栏守卫（□2 修正一期暗坑）：素材/摘抄文档的 progmark=`TEMP#bookID,<13位毫秒>`——
 *  parseWritingPieceRows 同款 point>=1e10 剔除（真片 point=五位序号），不剔会把素材卡
 *  误判成 slot 片（评分走 slot 分支不锤→素材未锤重推死循环，v3.7.0 一期实存） */
function parsePieceMark(value: string): { bookID: string; point: number } | null {
    const m = String(value ?? "").match(new RegExp(`^${TEMP_CONTENT}#([^,]+),(\\d+)$`));
    if (!m) return null;
    const point = +m[2];
    return point < 1e10 ? { bookID: m[1], point } : null;
}

/** 全量阅读卡：身份键行 × riff 现状——riff 查无卡的键=孤儿（建卡失败残留/已摘残留），
 *  顺手清键（块已删的残留行极窄窗口由 clearKeysSafe 存在性过滤兜住）。
 *  keyed=全量键行（含 g 毕业档案与孤儿行）——digest 建卡排除/素材首推过滤须看见
 *  毕业档案，只看活卡集会让 ④ 对已毕业摘抄重建打穿 g 键（review P0-1） */
export async function getReadingCards(): Promise<{ cards: CurvePlanCard[]; keyed: Map<string, string> }> {
    const rows = (await siyuan.sql(
        `select block_id, value from attributes where name='${READCARD_KEY}' limit 10000000`)) as any[] ?? [];
    if (!rows.length) return { cards: [], keyed: new Map() };
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
    const keyed = new Map<string, string>();
    const orphans: string[] = [];
    // 双锚皆 miss 的行暂存（□3 第三归属通道：blocks 表 type/markdown 复核 rpcard/plain）
    const pending: { blockID: string; readcard: string; lastReviewMs: number; due: string | null }[] = [];
    for (const r of rows) {
        keyed.set(r.block_id, String(r.value ?? ""));
        // 内核对无卡块返回占位条目（riffCard=null，content="不存在符合条件的内容块"）而非
        // 缺席——真卡判定必须过滤 riffCard 空值（digest 建卡同坑：占位条目下 Map.has 恒真）
        const live = (cardStates.get(r.block_id) ?? []).filter(s => s.riffCard);
        if (!live.length) {
            // g 毕业档案不算孤儿：毕业即摘卡、键留 g 供期4 面板毕业分组/右键状态行读
            if (parseReadCard(String(r.value ?? ""))?.graduated) continue;
            orphans.push(r.block_id); continue; // 卡不在 riff
        }
        const rc = live[live.length - 1].riffCard as RiffCard;
        // RiffCard.lastReview 类型声明 number 但 API 实返 ISO 串（3.8.x 实测）——双形态兼容
        const lr = rc.lastReview as unknown;
        const lastReviewMs = typeof lr === "number" ? lr : lr ? Date.parse(String(lr)) || 0 : 0;
        // 归属反解：片/槽片=MarkKey（书 writing 位分 slot）；ctime 通道（素材/摘抄文档，
        // □2 起按书 writing 位分流：写作书池=material〔首推锤+曲线〕/阅读书摘抄=digest〔建卡即曲线〕）
        const piece = parsePieceMark(markOf.get(r.block_id) ?? "");
        let bookID = "";
        let kind: ReadCardKind | "" = "";
        let point: number | null = null;
        if (piece) {
            bookID = piece.bookID;
            point = piece.point;
            kind = infos[bookID]?.writing ? "slot" : "piece";
        } else {
            const bid = parseBookIDFromCtime(ctOf.get(r.block_id) ?? "");
            if (bid) {
                bookID = bid;
                kind = infos[bid]?.writing ? "material" : "digest";
            }
        }
        if (!kind) {
            pending.push({ blockID: r.block_id, readcard: String(r.value ?? ""), lastReviewMs, due: normalizeDue(rc.due as string) });
            continue;
        }
        cards.push({
            blockID: r.block_id,
            bookID, kind, point,
            readcard: String(r.value ?? ""),
            lastReviewMs,
            due: normalizeDue(rc.due as string),
        });
    }
    // □3 第三归属通道：双锚 miss 行查 blocks 表——type='d'=plain（用户文档卡收编键行）；
    // type='custom'+围栏锚=rpcard（tomato 阅读点卡块，只读识别禁 import）；其余照旧 digest
    // 脏行（空书 sink 沉底）。分两发查：type 结果集小先全量；markdown 只查 custom 子集
    // （文档块 markdown=整文档内容，全捞一遍重）
    if (pending.length) {
        const inL = (ids: string[]) => ids.map(id => `'${id}'`).join(",");
        const tRows = (await siyuan.sql(
            `select id, type from blocks where id in (${inL(pending.map(p => p.blockID))}) limit 10000000`)) as any[] ?? [];
        const typeOf = new Map(tRows.map(r => [String(r.id), String(r.type ?? "")]));
        const customIDs = pending.filter(p => typeOf.get(p.blockID) === "custom").map(p => p.blockID);
        const mdOf = new Map<string, string>();
        if (customIDs.length) {
            const mdRows = (await siyuan.sql(
                `select id, markdown from blocks where id in (${inL(customIDs)}) limit 10000000`)) as any[] ?? [];
            for (const m of mdRows) mdOf.set(String(m.id), String(m.markdown ?? ""));
        }
        for (const p of pending) {
            const t = typeOf.get(p.blockID);
            const st = parseReadCard(p.readcard);
            const kind: ReadCardKind = t === "d" ? "plain"
                : t === "custom" && isRPCardMarkdown(mdOf.get(p.blockID) ?? "") ? "rpcard"
                // review P1-1：grow/sched 键（非毕业）无书无锚=只能来自单卡通道/adopt——
                // 归 plain 走全局对象曲线（否则右键内容块加的卡被当 digest 脏行空书 sink
                // +99 沉底，新入口主路径静默失效）。daily/旧 14 位照旧 digest 脏行兜底
                : st && !st.graduated && st.mode !== "daily" ? "plain" : "digest";
            cards.push({ blockID: p.blockID, bookID: "", kind, point: null, ...p });
        }
    }
    await clearKeysSafe(orphans);
    return { cards, keyed };
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

/** 「我的文档卡」分摊游标（□3，session 级）：④ 批查无卡/已收编的候选进此集下轮跳过
 *  ——全库文档块无卡的恒多数，不记则分摊指针永远卡在候选头部；重启重置（幂等重扫） */
const plainSkipped = new Set<string>();

/** 各在读书下一片 + 额度闸门（DayLog b[bookID]<q——勿用 riff lastReview 计数：
 *  自家建卡 review(2) 恒虚高 1 且编辑器入口读片不产生 lastReview，双入口不统一）。
 *  noCreate=onload 态：只认已建片（findPieceDoc），不凭空建片文档。
 *  □2 扩展：readcards=现行键行（素材首推池过滤——已进曲线的素材不再作首推目标，
 *  dispatch 恒选最老未锤防连环建卡）；digestTargets=在册阅读书的无键摘抄（建卡
 *  候选，riff 检查在 ④ 建卡时做——用户 FSRS 卡零接触）；readable=在册可读书集
 *  （曲线族沉底判定）。
 *  □3 扩展：rpcardTargets=全库无键阅读点卡块（接管候选，类开关滤）；plainCandidates=
 *  「我的文档卡」开闸时的无键无锚文档块头 2*CAP（收编候选，riff 检查在 ④）。 */
async function computeTargets(noCreate: boolean, readcards?: Map<string, string>): Promise<{
    targets: Map<string, string>;
    gateOpen: Map<string, boolean>;
    readable: Set<string>;
    /** 首推素材目标（targets 值里的素材文档——建卡走 grow 键而非 daily，□2） */
    materialTargets: Set<string>;
    digestTargets: string[];
    /** 无键阅读点卡块（□3 接管候选：tomato 已建卡，只挂键排 due） */
    rpcardTargets: string[];
    /** 「我的文档卡」收编候选头 2*CAP（□3：无键无锚文档块，riff 批查在 ④） */
    plainCandidates: string[];
    /** 书→未锤素材数（□4：ctRows 纯内存聚合——planSweep 出池判据+曲线传参，
     *  与 fleetData.materialUnread 同判据面：🔨 前缀=已锤剔除） */
    matUnread: Map<string, number>;
}> {
    const infos = progStorage.booksInfos();
    const ro = await progStorage.loadReadingOrder();
    const order = mergeMissingBooks(ro, Object.keys(infos)).order;
    const rpOn = readCurveReadingPoint.get() && !noCreate;
    const plainOn = readCurvePlainDocs.get() && !noCreate;
    // □5 类别开关：关=该类不再新建卡（存量键走完自然毕业，清场语义对齐一期分级）
    const digestOn = readCurveDigest.get() && !noCreate;
    const [todayReads, revisitRows, ctRows, statuses, customRows, docRows, markRows, optoutRows] = await Promise.all([
        rollerTodayReads(),
        siyuan.sql(`select block_id from attributes where name='${PdigestReviewKey}' limit 10000000`) as Promise<any[]> ?? [],
        // digest 建卡候选底表：全量 ctime 行（书过滤+键排除内存做）
        siyuan.sql(`select block_id as id, value from attributes where name='${PDIGEST_CTIME}' limit 10000000`) as Promise<any[]> ?? [],
        // 书物理存在判定（丢失书=⚠：流转族靠 targets 恒 miss 隐式 +99；曲线族 readable
        // 显式集必须同样排除，否则丢失书的重现卡到期照弹、digest 对着空 box 建卡）
        loadBookStatuses(),
        // rpcard 接管候选底表（类开关关/onload 不查——全库 custom 块扫描省下；
        // content 粗筛 '%"origin"%'（review P2-1，findLiveRPCards 同款先例）防重度
        // 用户全量 markdown 每轮数 MB 传输——粗筛后 markdown 精判仍兜他插件误伤）
        rpOn ? siyuan.sql(`select id, markdown from blocks where type='custom' and content like '%"origin"%' limit 10000000`) as Promise<any[]> : null,
        // 「我的文档卡」候选底表（默认关零成本；order by id 稳定分摊序）
        plainOn ? siyuan.sql(`select id from blocks where type='d' order by id limit 10000000`) as Promise<any[]> : null,
        // plain 排除锚：片/槽片文档（MarkKey）——ctime 锚复用 ctRows（渐进产物全排除）
        plainOn ? siyuan.sql(`select block_id from attributes where name='${MarkKey}' limit 10000000`) as Promise<any[]> : null,
        // □4 持久退推标记（「不再推」/「转记忆卡」）：全候选面统一排除——session 游标
        // 挡不住 reload 重收编（review P1-4），digest 无锤无复访类标记可依赖（□2 P1-1）
        siyuan.sql(`select block_id from attributes where name='${READOUT_KEY}' limit 10000000`) as Promise<any[]> ?? [],
    ]);
    const optout = new Set((optoutRows ?? []).map(r => r.block_id));
    // 素材双调度重叠防御：已在复访账（custom-pdigest-review）的素材不作目标（取次老）
    const revisiting = new Set((revisitRows ?? []).map(r => r.block_id));
    const lost = new Set([...statuses].filter(([, s]) => s.status !== "ok").map(([id]) => id));
    const quota = Number(dailyQuota.get()) || 3;
    const targets = new Map<string, string>();
    const gateOpen = new Map<string, boolean>();
    const readable = new Set<string>();
    const materialTargets = new Set<string>();
    for (const bookID of order) {
        const info = infos[bookID];
        if (!info || info.ignored || info.archived || lost.has(bookID)) continue; // 忽略/归档/丢失：曲线族 sink 沉底
        gateOpen.set(bookID, (todayReads[bookID] ?? 0) < quota);
        if (info.manualMode) continue; // 手动书滚筒排除，不投影（曲线卡同沉底；digest 也不自动建）
        // readable 在 manualMode 之后（review P2-1）：手动书不在册可读集，其曲线卡到期
        // 照沉底——否则与上行注释矛盾（到期重现打扰手动阅读节奏）
        readable.add(bookID);
        let targetID = "";
        if (info.writing) {
            // 首推池四滤：复访在管 done / 持久退推（□4 opt-out）/ 已进曲线（□2：锤+键
            // 双条件，isConsumedCurve）/ done 本身（🔨 锤态）——都标 done 让 dispatch 跳过
            const flat = (await queryDigestTree(bookID)).flat
                .map(n => (revisiting.has(n.id) || optout.has(n.id) || isConsumedCurve(readcards?.get(n.id) ?? "")
                    ? { ...n, done: true } : n));
            // 槽片同理滤退推（□4：不再推的槽不再被 pickWritingTarget 选中催促）
            const dispatch = pickWritingDispatch(flat,
                (await fetchWritingPieces(bookID)).filter(p => !optout.has(p.docID)), info.activePoint);
            if (!dispatch) continue; // 0 槽空池/全定稿=终态，投影自然停
            targetID = dispatch.kind === "material" ? dispatch.id : dispatch.docID;
            if (dispatch.kind === "material") materialTargets.add(dispatch.id); // 建卡走 grow 键（首见消耗）
        } else {
            const index = await progStorage.loadBookIndexIfNeeded(bookID);
            const point = info.point ?? 0;
            if (point >= index.length) continue; // 读完/未分片
            targetID = noCreate ? await findPieceDoc(bookID, point) : await createPiece(info, index, point);
            if (!targetID) continue; // 索引未就绪（可重试）/onload 未建——下轮兜底
        }
        targets.set(bookID, targetID);
    }
    // digest 建卡候选：在册阅读书（!writing，忽略/归档/丢失/手动同 targets 口径排除）的
    // 无键摘抄（有键=已在曲线；含 g 毕业档案不重建）；复访在管的跳过（用户已显式选
    // 择复习通道，双通道双推=打扰——revisiting 语义随 □2 从素材扩到摘抄）
    const digestTargets: string[] = [];
    const keyed = readcards ?? new Map<string, string>();
    for (const r of ctRows ?? []) {
        const bid = parseBookIDFromCtime(String(r.value ?? ""));
        const info = bid ? infos[bid] : null;
        if (!info || info.writing || info.ignored || info.archived || info.manualMode || lost.has(bid)) continue;
        if (keyed.has(r.id) || revisiting.has(r.id) || optout.has(r.id)) continue;
        if (!digestOn) continue; // □5 摘抄关：不再为无键摘抄建卡（存量走完自然毕业）
        digestTargets.push(r.id);
    }
    // rpcard 接管候选（□3）：围栏锚识别 + 键排除（含 g 毕业档案不重接管——P0-1 同向）；
    // riff「卡还在」检查在 ④（tomato 建卡失败残留块不接管，防挂键→孤儿→清键 每轮空转）
    const rpcardTargets: string[] = [];
    for (const r of customRows ?? []) {
        const id = String(r.id);
        if (keyed.has(id) || optout.has(id) || !isRPCardMarkdown(String(r.markdown ?? ""))) continue;
        rpcardTargets.push(id);
    }
    // plain 收编候选（□3「我的文档卡」）：无键无锚文档块，滤 session 游标后取头 2*CAP
    // （④ 批查 riff——有卡的收编、无卡的进游标；锚排除=渐进产物零重叠：片/槽片=MarkKey、
    // 素材/摘抄=ctime，rpcard 是 custom 块天然不在 type='d' 集内）
    const plainCandidates: string[] = [];
    if (docRows && markRows) {
        const anchored = new Set([...(ctRows ?? []).map(r => r.id), ...markRows.map(r => r.block_id)]);
        for (const r of docRows) {
            const id = String(r.id);
            if (plainCandidates.length >= DIGEST_BUILD_CAP * 2) break;
            if (keyed.has(id) || anchored.has(id) || plainSkipped.has(id) || optout.has(id)) continue;
            plainCandidates.push(id);
        }
    }
    // □4 书→未锤素材数（与 fleetData.materialUnread 同判据面：🔨 前缀=已锤剔除；
    // 全量行在手纯内存聚合，零新查询）。已锤行落 0 条目=全锤书确证出池（matUnreadOfRows）
    const matUnread = matUnreadOfRows((ctRows ?? []) as { value?: unknown }[]);
    return { targets, gateOpen, readable, materialTargets, digestTargets, rpcardTargets, plainCandidates, matUnread };
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

/** 单书未锤素材数（□4 评分现场单查：ctRows 全量快照在 computeTargets 内不外露，
 *  cardflip 频率低一次单书 SQL 可接受；与 fleetData/ctRows 聚合同判据面） */
async function materialUnreadOfBook(bookID: string): Promise<number | undefined> {
    if (!bookID) return undefined;
    try {
        const rows = (await siyuan.sql(
            `select value from attributes where name='${PDIGEST_CTIME}' and (value like '${bookID}#%' or value like '🔨#${bookID}#%') limit 10000000`)) as any[] ?? [];
        return (rows ?? []).filter(r => !String(r.value ?? "").startsWith("🔨")).length;
    } catch (e) {
        debugLog("readcurve", `mat unread fail ${bookID}: ${e}`, "progressive");
        return undefined; // 查询失败=未知：走旧 ×2 骨架（保守方向），下轮自愈
    }
}

/** 重现族消耗一轮（□2 分流面）：material 首推（未消耗）=锤+计已读+saveLastServed
 *  （一期首推语义：新读占书额度）再消耗；此后每轮 consumeRound 改键改 due 不摘卡，
 *  5 轮毕业=摘卡键留 g 档案（期4 面板毕业分组）。中断序=先锤后消耗（review 取舍：
 *  锤成功+消耗失败→水位线未进 isRated 仍 true→下轮重试消耗幂等自愈；反序=消耗成功
 *  锤失败则锤永久丢，损失更大）。daily 存量卡（一期未评分素材卡）先升级转 grow
 *  count=0 再消耗——评分即入曲线零迁移。返回 1=重现轮次（rc 计数由巡查尾部合并写）。
 *  □4 notifyGrad=用户评分现场（cardflip* 触发）毕业时弹一次性 toast——onload/timer
 *  巡查补账的迟到毕业不弹（用户无当下语境，静默入面板毕业分组即可） */
async function reconcileCurveRound(c: CurvePlanCard, st: NonNullable<ReturnType<typeof parseReadCard>>, notifyGrad = false): Promise<number> {
    // 首推判定（期5 P1-1）：sched 素材卡（档位建卡）无 count0 态改锤态判；attrs 只在
    // 疑似首推时读（非素材/已消耗零请求）。grow count0 保持先读后判旧形态
    let firstPush = false;
    if (c.kind === "material" && (st.count === 0 || st.mode === "sched")) {
        const attrs = await siyuan.getBlockAttrs(c.blockID);
        const ct = String((attrs as any)?.[PDIGEST_CTIME] ?? "");
        firstPush = isMaterialFirstPush(c.kind, st, ct);
        if (firstPush) {
            if (ct && !ct.startsWith("🔨")) {
                // 锤+计已读一体（已锤=编辑器分派链已 markReadSafe，双入口一账不双计）
                await siyuan.setBlockAttrs(c.blockID, { [PDIGEST_CTIME]: `🔨#${ct}` } as any);
                await markReadAndNotify(c.bookID);
            }
            await saveLastServed(c.bookID);
        }
    }
    const value = st.mode === "daily"
        // 存量 daily 素材卡评分升级转 grow 烙书档（review P2-2：不烙则此后整条曲线恒中档，
        // 与「书 IAL=建卡默认」漏一格；仅存量升级走到，热路径零成本）
        ? formatReadCard({ ...st, mode: "grow", count: 0, freq: c.bookID ? await bookVisitFreq(c.bookID) : undefined })
        : c.readcard;
    // □4 素材曲线：仅 material 传剩余量（锤已在上文先行落盘→计数天然剔除刚锤的这一个；
    // undefined=查询失败走旧 ×2 骨架保守自愈；首推剩余量=锤后全书余量，间隔语义一致）
    const matRemaining = c.kind === "material" ? await materialUnreadOfBook(c.bookID) : undefined;
    const cr = consumeRound(value, c.lastReviewMs, new Date(), matRemaining);
    if (!cr) {
        // 防御：分流条件已滤 graduated/daily，到这=状态异常，摘卡清键止蚀（孤儿链兜底）
        await removeReadingCards([c.blockID]);
        await clearKeysSafe([c.blockID]);
        return 0;
    }
    await siyuan.setBlockAttrs(c.blockID, { [READCARD_KEY]: cr.value } as any);
    if (cr.graduated) {
        await removeReadingCards([c.blockID]);
        if (notifyGrad) {
            // 毕业 toast（□4 一次性：「毕业」文案禁用「消失」红线）；失败不阻断主链
            try {
                await siyuan.pushMsg(tomatoI18n.毕业五轮提示, 4000);
            } catch (e) {
                debugLog("readcurve", `grad toast fail: ${e}`, "progressive");
            }
        }
    } else {
        await setReadingDues([{ id: c.blockID, due: cr.due }]);
    }
    debugLog("readcurve", `consumed ${c.kind} ${c.blockID} → ${cr.value}${cr.graduated ? " (graduated)" : ""}`, "progressive");
    return firstPush ? 0 : 1;  // 首推=书池已计（markRead），rc 只数重现轮次
}

/** 已评分卡对账（isRated=身份键水位线判据，进程重启丢基线也幂等——对完即摘，
 *  卡不在=已对账自然出局）。序=sortForReconcile（同书 piece 升序，review P0-1：
 *  乱序对账漏计+闸门连锁超额）。□2 分流：曲线族（grow/sched 键任意 kind+material/
 *  digest 存量 daily）→ reconcileCurveRound 消耗不摘卡；流转族走一期对账摘卡。
 *  返回=本轮重现轮次计数（rc 合并写由调用方收口——逐卡写撞 markRead 建块的
 *  「写后立读」窗口会分裂当日块〔6808 实测〕） */
async function reconcileRated(rated: CurvePlanCard[], notifyGrad = false): Promise<number> {
    const infos = progStorage.booksInfos();
    let revisits = 0;
    for (const c of sortForReconcile(rated)) {
        try {
            const st = parseReadCard(c.readcard);
            const curveFamily = !!st && !st.graduated && (
                st.mode === "grow" || st.mode === "sched"
                || ((c.kind === "material" || c.kind === "digest") && st.mode === "daily"));
            if (curveFamily && st) {
                revisits += await reconcileCurveRound(c, st, notifyGrad);
                continue;
            }
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
                // □2 起素材 daily/grow 键全部进曲线分流（首推=锤+挂曲线），此分支仅
                // 垃圾键（parseReadCard null）兜底：按一期语义摘卡清键
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
    return revisits;
}

/** 未完成超限毕业对账（期1 分片显式完成制）：与 rated 对账的差异=**不计已读**——
 *  没读不 markRead 不进舰队联动，毕业≠服务过（不 saveLastServed）。piece=gotoBlock
 *  推进下一片（守卫已越过只摘；忽略/归档/手动书只摘卡不推片——review P1-1：残留
 *  g 卡无 target 语境，书已弃管不该被悄悄推进阅读进度）；slot/material=只摘卡
 *  （下轮调度自然换目标；slot 毕业后 pickWritingDispatch 可能再选同未定稿槽=每
 *  5 天催一次的防卡死循环，期2 勿当 bug 报）。键值 g 终态由 sweepReadCurve 的
 *  setKey 链先落（中断残留=planSweep 毕业分支重摘） */
async function reconcileGraduated(graduated: CurvePlanCard[]) {
    const infos = progStorage.booksInfos();
    for (const c of sortForReconcile(graduated)) {
        try {
            const info = c.bookID ? infos[c.bookID] : null;
            if (c.kind === "piece" && c.point != null && info
                && !info.ignored && !info.archived && !info.manualMode
                && shouldReconcilePiece(c.point, info.point ?? 0)) {
                await progStorage.gotoBlock(c.bookID, c.point + 1);
            }
            await removeReadingCards([c.blockID]);
            debugLog("readcurve", `graduated ${c.kind} ${c.blockID} book=${c.bookID}`, "progressive");
        } catch (e) {
            debugLog("readcurve", `graduate fail ${c.blockID}: ${e}`, "progressive");
        }
    }
}

// ============ 建卡三连（readpoint 同构） ============

/** 片文档建阅读卡：挂身份键 → addRiffCards → 1s 尾链 review(2)+due=目标
 *  （review(2) 转 Review 态躲官方新卡限额；fire-and-forget，下轮巡查幂等补）。
 *  □2 参数化曲线档：默认 d#now#0（分片 daily）；素材首推={grow,0}（评分=首见消耗）；
 *  digest={grow,1}（摘抄动作本身=第 1 见，建卡即 3 天后第 2 见）。
 *  只用于「卡要建」的块；卡已在的（rpcard/用户文档卡）走 adoptReadingCard——
 *  addRiffCards/review 会污染他人卡。
 *  尾链收尾回读 lastReview 反写身份键（水位线校准，review P1-2）：setTimeout 只保
 *  证至少 1s，主线程长任务可把 review 拖过「建卡+5s」余量 → isRated 误判真评分幽灵
 *  推进；校准后水位线恒=自家 review 实际时刻，晚于它的必为用户评分 */
export async function buildReadingCard(docID: string, due: string, opts?: { mode?: CurveMode; count?: number; freq?: VisitFreq }): Promise<void> {
    const keyOf = (ms: number) => formatReadCard({
        mode: opts?.mode ?? "daily", waterlineMs: ms, count: opts?.count ?? 0, graduated: false, freq: opts?.freq,
    });
    await siyuan.setBlockAttrs(docID, { [READCARD_KEY]: keyOf(Date.now()) } as any);
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
                if (ms > 0) await siyuan.setBlockAttrs(docID, { [READCARD_KEY]: keyOf(ms) } as any);
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
            const { cards: cards0, keyed } = await getReadingCards();
            // ① 对账（评分晚于建卡+5s 余量=真评分；reps 基线可省——水位线判据幂等全覆盖）；
            //    rc 计数由对账聚合、此处合并一次写（逐卡写撞 markRead 建块窗口分裂当日块）
            const rated = cards0.filter(c => isRated(c.readcard, c.lastReviewMs));
            let revisits = 0;
            // cardflip*=用户评分现场（毕业 toast 出口）；onload/timer 补账静默
            if (rated.length) revisits = await reconcileRated(rated, reason.startsWith("cardflip"));
            // rc 记账单独兜底（review P1-2）：卡轮次已在 reconcileRated 落块，此写抛错若
            // 走主 catch 会跳过本轮全部 setDue/setKey/graduate/④——闸门偏松方向丢单
            if (revisits > 0) {
                try {
                    await rollerCountRevisit(revisits);
                } catch (e) {
                    debugLog("readcurve", `rc count fail (lost ${revisits}, gate loose this round): ${e}`, "progressive");
                }
            }
            // ② 目标集+③ diff（对账后世界态；已摘卡不再参与）。readcards=全量键行
            //    （素材首推池过滤+digest 建卡排除——含 g 毕业档案，review P0-1）；
            //    rcGateOpen=全局重现额度闸门（□2）
            const readcards = keyed;
            const { targets, gateOpen, readable, materialTargets, digestTargets, rpcardTargets, plainCandidates, matUnread } = await computeTargets(!!opts.noCreate, readcards);
            const rcGateOpen = (await rollerTodayRevisits()) < REVISIT_DAILY_LIMIT;
            const ratedIDs = new Set(rated.map(c => c.blockID));
            const plan = planSweep({
                cards: cards0.filter(c => !ratedIDs.has(c.blockID)),
                targets, gateOpen, now, readable, rcGateOpen,
                matRemaining: matUnread, // □4：素材写完出池+间隔传参的剩余量快照
            });
            if (plan.setDue.length) await setReadingDues(plan.setDue);
            // setKey 先于 graduate 落键（g 终态先行，摘卡中断有 planSweep 毕业分支兜底）
            if (plan.setKey.length) {
                await siyuan.batchSetBlockAttrs(plan.setKey.map(k => ({ id: k.id, attrs: { [READCARD_KEY]: k.value } as any })));
            }
            if (plan.graduate.length) await reconcileGraduated(plan.graduate);
            if (plan.remove.length) { // 正常恒空（rated 已摘）；判据同源留作保险
                await removeReadingCards(plan.remove);
                await clearKeysSafe(plan.remove);
            }
            // 毕业推片后 targets 已陈旧（point 前进了一格）——重算目标集让新下一片
            // 当轮即建卡（「毕业→下一片」不断流；低频路径，成本可弃）
            let liveTargets = targets, liveGate = gateOpen, liveDigests = digestTargets;
            let liveMat = materialTargets, liveRPCards = rpcardTargets, livePlain = plainCandidates;
            if (plan.graduate.length && !opts.noCreate) {
                const t = await computeTargets(false, readcards);
                liveTargets = t.targets;
                liveGate = t.gateOpen;
                liveDigests = t.digestTargets;
                liveMat = t.materialTargets;
                liveRPCards = t.rpcardTargets;
                livePlain = t.plainCandidates;
            }
            // ④ 目标片缺卡补建（含刚摘的续推片——「评分→摘卡→续推 due=now 连续读流」；
            //    新键新时刻，水位线判据天然不误触）。写作书素材目标=grow 键（评分=首见
            //    消耗锤+挂曲线）；digest 建卡=grow count1（摘抄即第 1 见，3 天后第 2 见）
            const known = new Set(cards0.map(c => c.blockID));
            let builtN = 0;
            // □5 类别开关+节奏档位（关=不再建卡不降级：素材关时 liveMat 命中直接跳过，
            // 勿落 undefined=daily 分片键——类语义不可串）
            const pieceOn = readCurvePiece.get();
            const matOn = readCurveMaterial.get();
            const cadMat = readCurveCadMaterial.get();
            const cadDg = readCurveCadDigest.get();
            const cadRP = readCurveCadReadingPoint.get();
            const cadPlain = readCurveCadPlain.get();
            for (const [bookID, pieceID] of liveTargets) {
                if (opts.noCreate) break; // onload 不建片（勿凭空多 N 个文档+巨书成本）
                if (known.has(pieceID)) continue;
                if (liveMat.has(pieceID)) {
                    if (!matOn) continue; // □5 素材关：目标位素材不建卡（下轮自然重选）
                    await buildReadingCard(pieceID, liveGate.get(bookID) ? dueStamp(now) : tomorrowStart(now),
                        cadenceOpts(cadMat) ?? { mode: "grow", count: 0, freq: await bookVisitFreq(bookID) });
                } else {
                    if (!pieceOn) continue; // □5 分片关：不再建分片卡（存量每日重现走完毕业）
                    await buildReadingCard(pieceID, liveGate.get(bookID) ? dueStamp(now) : tomorrowStart(now));
                }
                builtN++;
            }
            if (!opts.noCreate && liveDigests.length) {
                // 用户 FSRS 卡零接触：已有 riff 卡的摘抄跳过（内核一块一卡 issue 7476，
                // 重复 add 是 no-op 但 review(2) 尾链会污染用户卡——先查后建；
                // 占位条目须滤 riffCard 空值再判「有卡」）
                const states = await getReadingCardStates(liveDigests);
                // □3 书回访频率（digest 建卡烙书档）：digestTargets 平铺无书——ctime 批查
                // 反解归属书，一书一档批量缓存（一轮最多 CAP 张建卡，一次 SQL 摊销）
                const dgCt = (await siyuan.sql(
                    `select block_id, value from attributes where name='${PDIGEST_CTIME}' and block_id in (${liveDigests.map(i => `"${i}"`).join(",")}) limit 10000000`)) as any[] ?? [];
                const bookOf = new Map((dgCt ?? []).map(r => [String(r.block_id), parseBookIDFromCtime(String(r.value ?? ""))]));
                const freqCache = new Map<string, VisitFreq>();
                const freqOfBook = async (bid: string | null): Promise<VisitFreq> => {
                    if (!bid) return "m";
                    if (!freqCache.has(bid)) freqCache.set(bid, await bookVisitFreq(bid));
                    return freqCache.get(bid)!;
                };
                let built = 0;
                for (const dg of liveDigests) {
                    // 每轮建卡上限（review P2-4）：takeover 首开对全库无键摘抄一次性建卡，
                    // 千级=写入风暴+持锁数分钟——分摊到后续巡查轮（30min/轮自然节奏摊完）
                    if (built >= DIGEST_BUILD_CAP) break;
                    if (known.has(dg) || (states.get(dg) ?? []).some(s => s.riffCard)) continue;
                    // per-item 兜底（review P1-3）：digest 候选=任意用户文档，死 ctime 行
                    // 单点抛错会让每轮巡查在同一行中断、其后候选饿死
                    try {
                        const schedDg = cadenceOpts(cadDg);
                        const dgFreq = await freqOfBook(bookOf.get(dg) ?? null);
                        await buildReadingCard(dg, plusDays(now, schedDg ? cadenceDays(cadDg) : growInterval(0, dgFreq)),
                            schedDg ?? { mode: "grow", count: 1, freq: dgFreq });
                        built++;
                    } catch (e) {
                        debugLog("readcurve", `digest build fail ${dg}: ${e}`, "progressive");
                    }
                }
                if (built) debugLog("readcurve", `digest cards built=${built}`, "progressive");
            }
            // rpcard 接管（□3）：阅读点卡块已由 tomato 建卡（QUICK deck+其建卡尾链
            // review(2)）——只挂键排 due，绝不 addRiffCards/review（污染 tomato 卡）；
            // 接管=第 1 见（+3 天第 2 见）。无卡块（tomato 建卡失败残留/清理链剩块）
            // 不接管——挂键→孤儿判定→清键 每轮空转。上限同 digest 分摊口径
            if (!opts.noCreate && liveRPCards.length) {
                const states = await getReadingCardStates(liveRPCards);
                let adopted = 0;
                for (const id of liveRPCards) {
                    if (adopted >= DIGEST_BUILD_CAP) break;
                    if (keyed.has(id) || !(states.get(id) ?? []).some(s => s.riffCard)) continue;
                    try {
                        await adoptReadingCard(id, plusDays(now, cadenceDays(cadRP)), cadenceOpts(cadRP) ?? { mode: "grow", count: 1 });
                        adopted++;
                    } catch (e) {
                        debugLog("readcurve", `rpcard adopt fail ${id}: ${e}`, "progressive");
                    }
                }
                if (adopted) debugLog("readcurve", `rpcard adopted=${adopted}`, "progressive");
            }
            // plain 收编（□3「我的文档卡」开闸）：候选头 2*CAP 批查 riff——有卡（用户
            // 文档卡）→ adopt 挂键；无卡 → 进 session 游标下轮跳过（文档块无卡恒多数，
            // 不记则分摊指针卡死在头部）。毕业时 QUICK 限定摘卡摘不动用户 deck 卡=只落
            // g 键留卡（关闸不清卡同款语义，探测记录⑤）
            if (!opts.noCreate && livePlain.length) {
                const states = await getReadingCardStates(livePlain);
                let adopted = 0;
                for (const id of livePlain) {
                    if (adopted >= DIGEST_BUILD_CAP) break;
                    const hasCard = (states.get(id) ?? []).some(s => s.riffCard);
                    if (!hasCard || keyed.has(id)) { plainSkipped.add(id); continue; }
                    try {
                        await adoptReadingCard(id, plusDays(now, cadenceDays(cadPlain)), cadenceOpts(cadPlain) ?? { mode: "grow", count: 1 });
                        adopted++;
                        plainSkipped.add(id);
                    } catch (e) {
                        debugLog("readcurve", `plain adopt fail ${id}: ${e}`, "progressive");
                    }
                }
                if (adopted) debugLog("readcurve", `plain cards adopted=${adopted}`, "progressive");
            }
            debugLog("readcurve",
                `sweep(${reason}) cards=${cards0.length} rated=${rated.length} due=${plan.setDue.length} key=${plan.setKey.length} grad=${plan.graduate.length} build=${builtN} rc=${rcGateOpen ? "open" : "shut"}`,
                "progressive");
            // □6 产出率反哺顺带算（锁内直调无锁核；自带 30min 限流，cardflip 高频无感）
            await autoRelaxSweep();
        } catch (e) {
            debugLog("readcurve", `sweep fail (${reason}): ${e}`, "progressive");
        }
    }, { queued: false });
}

/** 关开关=末次清场：全量摘卡+清键（阅读卡 due 语义完全依赖巡查续命，弃管比不开
 *  更糟——readpoint「关不碰卡」先例不适用这边）。queued=true（review P1-1）：
 *  巡查持锁时排队等它跑完再清——ifAvailable 会静默丢清场，卡群变弃管孤儿。
 *  □3 起按块形态分流（review P0-1）：custom-rpcard 块上的卡=tomato 资产（QUICK
 *  deck、其复用链 reuseRPCard 只 review 不重建）——只清键不摘卡，否则一次开关
 *  往复静默摧毁全部已接管阅读点的复习功能且无恢复路径；书锚行（片/素材/摘抄）
 *  与无锚行照旧摘（自家 build 面；用户 deck 卡摘不动=no-op 等价只清，语义自洽） */
export async function clearReadCurve(): Promise<void> {
    await lockWithLease(ReadCurveSweepLock, async () => {
        try {
            const rows = (await siyuan.sql(
                `select block_id from attributes where name='${READCARD_KEY}' limit 10000000`)) as any[] ?? [];
            const ids = rows.map(r => r.block_id);
            let removable = ids;
            if (ids.length) {
                const inL = ids.map(id => `'${id}'`).join(",");
                // 只需识别「不能摘」的面：custom-rpcard（tomato 资产）。书锚行（片/
                // 素材/摘抄=自家 build）与无锚行（单卡通道）默认全在摘卡面内
                const customRows = (await siyuan.sql(
                    `select id, markdown from blocks where type='custom' and id in (${inL}) limit 10000000`)) as any[] ?? [];
                const rpCards = (customRows ?? []).filter(r => isRPCardMarkdown(String(r.markdown ?? ""))).map(r => String(r.id));
                if (rpCards.length) {
                    const keepCard = new Set(rpCards);
                    removable = ids.filter(id => !keepCard.has(id));
                    debugLog("readcurve", `clear keeps ${rpCards.length} tomato rpcards (unadopt only)`, "progressive");
                }
            }
            await removeReadingCards(removable);
            await clearKeysSafe(ids);
            debugLog("readcurve", `cleared ${ids.length} keys / ${removable.length} cards`, "progressive");
        } catch (e) {
            debugLog("readcurve", `clear fail: ${e}`, "progressive");
        }
    }, { queued: true });
}

// ============ item↔topic 互转通道（期3 预留：仅通道+window 命令位，不预排 UI）============

/** 收编既有卡（□3）：块上 riff 卡已存在（tomato rpcard=QUICK / 用户文档卡=自建 deck）——
 *  只挂身份键+排 due，绝不 addRiffCards/review（污染他人卡）；与 buildReadingCard 的
 *  分野=「卡已在」vs「卡要建」。waterlineMs=now：既有卡的 lastReview 恒在过去不误判，
 *  之后的评分才是真消耗；count 默认 1（收编动作=第 1 见，+3 天第 2 见，digest 同款）。
 *  校准尾（review P1-3，仿 buildReadingCard）：接管窗口若与 tomato 建卡尾链（1s 延迟的
 *  review(2)+setDue）交错——review 被主线程拖过 5s 余量→下轮 isRated 误判提前消耗；
 *  其 setDue(ts≈now) 晚到→+3d 被回写成即期。6s 后回读：lastReview 越线则校准水位线、
 *  due 被覆则重排（两效应均自限一次性，此处兜底） */
export async function adoptReadingCard(blockID: string, due: string, opts?: { mode?: CurveMode; count?: number; freq?: VisitFreq }): Promise<void> {
    const value = formatReadCard({
        mode: opts?.mode ?? "grow", waterlineMs: Date.now(), count: opts?.count ?? 1, graduated: false, freq: opts?.freq,
    });
    await siyuan.setBlockAttrs(blockID, { [READCARD_KEY]: value } as any);
    await setReadingDues([{ id: blockID, due }]);
    debugLog("readcurve", `adopted ${blockID} → ${value} due=${due}`, "progressive");
    setTimeout(() => {
        void (async () => {
            try {
                const states = await getReadingCardStates([blockID]);
                const rc = states.get(blockID)?.at(-1)?.riffCard;
                if (!rc) return;
                const lr = rc.lastReview as unknown;
                const ms = typeof lr === "number" ? lr : lr ? Date.parse(String(lr)) || 0 : 0;
                const st = parseReadCard(value);
                if (st && ms > st.waterlineMs + RATING_GRACE_MS) {
                    await siyuan.setBlockAttrs(blockID, { [READCARD_KEY]: formatReadCard({ ...st, waterlineMs: ms }) } as any);
                    debugLog("readcurve", `adopt recalibrated ${blockID} wl=${ms}`, "progressive");
                }
                // 期4 review P2-3：6s 窗口内用户可能已改档（sched/defer）——回读键值被改过
                // 则放弃重排，勿用旧 due 覆盖新档期
                const curAttrs = ((await siyuan.getBlockAttrs(blockID)) ?? {}) as any;
                if (String(curAttrs?.[READCARD_KEY] ?? "") === value
                    && normalizeDue(rc.due as string) !== normalizeDue(due)) {
                    await setReadingDues([{ id: blockID, due }]);
                    debugLog("readcurve", `adopt due rewritten ${blockID} → ${due}`, "progressive");
                }
            } catch (e) {
                debugLog("readcurve", `adopt tail fail ${blockID}: ${e}`, "progressive");
            }
        })();
    }, 6000);
}

/** 进：块纳入阅读曲线管理（grow 曲线，due=+3 天〔加入动作=第 1 见〕）。卡已在（tomato
 *  rpcard/用户文档卡）→ adopt 只挂键排 due；无卡 → build 建卡三连。锁内执行（review
 *  P2-3 兑现）：锁外挂键→addRiffCards 完成前的窗口，并发巡查见「键行有、riff 无卡」判
 *  孤儿清键→卡在键丢永久弃管。已有键幂等跳过（右键重复点不重置水位线）。⚠ 片内 item
 *  块与片卡同 root 双卡并存会双计，调用方自担（期4 子菜单收编时补场景过滤） */
/** 返回=首见间隔天数（0=未建：takeover 关/已有键/失败——调用方 toast 兜底用骨架首档） */
export async function addToReadingCurve(blockID: string): Promise<number> {
    if (!readCurveTakeover.get()) {
        debugLog("readcurve", `channel add skip: takeover off`, "progressive");
        return 0;
    }
    let firstDays = 0;
    await lockWithLease(ReadCurveSweepLock, async () => {
        try {
            const attrs = await siyuan.getBlockAttrs(blockID);
            if ((attrs as any)?.[READCARD_KEY]) {
                debugLog("readcurve", `channel add skip: already keyed ${blockID}`, "progressive");
                return;
            }
            // □4 清退推标记（「加入推送」=重进，stop/memory 留下的 opt-out 失效）
            if ((attrs as any)?.[READOUT_KEY]) {
                await siyuan.setBlockAttrs(blockID, { [READOUT_KEY]: "" } as any);
            }
            const states = await getReadingCardStates([blockID]);
            const hasCard = (states.get(blockID) ?? []).some(s => s.riffCard);
            // □3 建卡烙书档：ctime 反解归属书取回访频率（全局对象无书=中档）
            const bid = parseBookIDFromCtime(String((attrs as any)?.[PDIGEST_CTIME] ?? ""));
            const f = bid ? await bookVisitFreq(bid) : "m";
            const due = plusDays(new Date(), growInterval(0, f));
            if (hasCard) await adoptReadingCard(blockID, due, { mode: "grow", count: 1, freq: f });
            else await buildReadingCard(blockID, due, { mode: "grow", count: 1, freq: f });
            firstDays = growInterval(0, f);
        } catch (e) {
            debugLog("readcurve", `channel add fail ${blockID}: ${e}`, "progressive");
        }
    }, { queued: true });
    return firstDays;
}

/** 出：退出阅读曲线管理（摘卡+清键；块已删的孤儿卡内核拒删=无害滞留） */
export async function removeFromReadingCurve(blockID: string): Promise<void> {
    await removeReadingCards([blockID]);
    await clearKeysSafe([blockID]);
}

// ============ □3 回访频率：书 IAL 默认+批量跟随 / 卡级改档 ============

/** 书回访频率档位（书文档 IAL 读；空/坏值=中档零感知） */
export async function bookVisitFreq(bookID: string): Promise<VisitFreq> {
    if (!bookID) return "m";
    try {
        const attrs = ((await siyuan.getBlockAttrs(bookID)) ?? {}) as any;
        const v = String(attrs[VISITRATE_KEY] ?? "");
        return v === "l" || v === "h" ? v : "m";
    } catch {
        return "m";
    }
}

async function toastFreqSet(f: VisitFreq) {
    try { await siyuan.pushMsg(tomatoI18n.已设回访频率(tomatoI18n.回访频率档名(f)), 2500); } catch { /* noop */ }
}

/** 卡级改档（grow 在册卡）：改频率尾段（count/水位线不动=进度不重置）+在轮卡（count≥1）
 *  due 按新档重排——due=水位线+新间隔（consumeRound 同口径锚）；count0 首推位由书闸门
 *  管不动；sched 用户直控/daily 分片/毕业档案不适用（菜单层已滤）。返回 toast 文案（空=失败） */
export async function setCardVisitFreq(blockID: string, f: VisitFreq): Promise<string> {
    if (!blockID) return "";
    if (!readCurveTakeover.get()) return tomatoI18n.接管未开启;
    let tip = "";
    // queued 等锁（review P2-1）：cardflip 巡查持锁数秒窗口内改档静默失败=「操作未生效」
    // 泛化兜底；操作幂等等锁无害（applyReadCardAction 同族同款）
    await lockWithLease(ReadCurveSweepLock, async () => {
        try {
            // 重分片/出片进行中不改（幽灵片防线，applyReadCardAction 同款避让）
            if (await mainSweepLocksHeld()) {
                tip = tomatoI18n.正在整理书籍;
                return;
            }
            const ctx = await inspectReadCard(blockID);
            if (!ctx.st || ctx.st.graduated || ctx.st.mode !== "grow") return;
            await siyuan.setBlockAttrs(blockID, { [READCARD_KEY]: formatReadCard({ ...ctx.st, freq: f }) } as any);
            if (ctx.st.count >= 1 && ctx.hasCard) {
                // 素材卡重排走素材曲线间隔（□4 review P1-1）：剩余量现查，查询失败=null 跳过重排
                const matRemaining = ctx.kind === "material" ? await materialUnreadOfBook(ctx.bookID) : undefined;
                const days = rescheduleDays(ctx.kind, matRemaining, ctx.st.count, f);
                if (days != null) {
                    await setReadingDues([{ id: blockID, due: plusDays(new Date(ctx.st.waterlineMs), days) }]);
                }
            }
            notifyFleetChanged();
            tip = tomatoI18n.已设回访频率(tomatoI18n.回访频率档名(f));
            debugLog("readcurve", `freq card ${blockID} → ${f}`, "progressive");
        } catch (e) {
            debugLog("readcurve", `freq card fail ${blockID}: ${e}`, "progressive");
        }
    }, { queued: true });
    return tip;
}

/** 书级改档：书 IAL 落默认（此后 digest/material 建卡烙印跟随）+该书在册 grow 卡批量
 *  重写频率尾段（ctime 通道=摘抄/素材含已锤 🔨 前缀；sched/daily 不跟随）。转档金句片
 *  （MarkKey 通道）与全局对象（rpcard/plain 无书）不走批量=卡级菜单覆盖，口径记档。
 *  在轮卡 due 同 setCardVisitFreq 口径重排（无 riff 卡的毕业档案只改键不写 due）。
 *  卡批量段持巡查锁+batch 收拢（review P1-1）：无锁时「cardflip 对账落 g 毕业键→本处
 *  陈旧快照覆写复活→孤儿判定清键」=毕业档案不可逆丢失；串行 setBlockAttrs 收拢为批量
 *  压并发窗口。书档无 takeover 守卫=偏好预置语义（接管关时改档只落 IAL，重开后建卡跟随）。
 *  □6 opts.auto=巡查自动放宽路径（落 AUTORELAX 标记+免 toast）；手动路径（含一键恢复）
 *  清标记=显式意图接管。返 false=失败（review P2：UI 侧勿乐观更新本地 Map） */
export async function setBookVisitFreq(bookID: string, f: VisitFreq, opts?: { auto?: boolean }): Promise<boolean> {
    if (!bookID) return false;
    try {
        let ok = true;
        await lockWithLease(ReadCurveSweepLock, async () => {
            ok = await applyBookVisitFreq(bookID, f, opts);
        }, { queued: true });
        if (!ok) return false;
        notifyFleetChanged();
        await toastFreqSet(f);
        return true;
    } catch (e) {
        debugLog("readcurve", `freq book fail ${bookID}: ${e}`, "progressive");
        return false;
    }
}

/** □6 无锁核（setBookVisitFreq 的锁内主体，autoRelaxSweep 持锁直调——公开壳的 queued
 *  锁在 sweep 锁内嵌套=排队互等死锁到租约爆，故抽核）：书 IAL+AUTORELAX 标记管理+
 *  在册卡批量跟随。auto=落放宽时刻（与手动选 l 同值不同源）；非 auto=清标记。
 *  返 false=书 IAL 写失败（缺块/lost 书——call 对 code!=0 返 null 不抛，写后验真
 *  =返值判别，review P1-1：静默假成功会让调用侧计 applied+虚日志+标记永不落死循环） */
async function applyBookVisitFreq(bookID: string, f: VisitFreq, opts?: { auto?: boolean }): Promise<boolean> {
    await siyuan.setBlockAttrs(bookID, {
        [VISITRATE_KEY]: f === "m" ? "" : f,
        [AUTORELAX_KEY]: opts?.auto ? dueStamp(new Date()) : "",
    } as any);
    // 写后验真=复核读（⚠写类端点 data 恒 null，返值判 null=100% 误判——踩坑索引明文，
    // review P1-1 修法初版即踩：恒 false 短路批量跟随段；lost/缺块书复核读返空 map 判失败）
    const back = ((await siyuan.getBlockAttrs(bookID)) ?? {}) as any;
    if (String(back[VISITRATE_KEY] ?? "") !== (f === "m" ? "" : f)) {
        debugLog("readcurve", `freq book write fail ${bookID} (block missing?)`, "progressive");
        return false;
    }
    let followed = 0;
    const rows = (await siyuan.sql(
        `select block_id from attributes where name='${PDIGEST_CTIME}' and (value like '${bookID}#%' or value like '🔨#${bookID}#%') limit 10000000`)) as any[] ?? [];
    const ids = (rows ?? []).map(r => String(r.block_id));
    const dueWrites: { id: string; due: string }[] = [];
    // 写作书→其锚卡=素材卡，重排走素材曲线间隔（□4 review P1-1）：剩余量一书一查全批共用
    const matBook = !!progStorage.booksInfos()[bookID]?.writing;
    const matRemaining = matBook ? await materialUnreadOfBook(bookID) : undefined;
    if (ids.length) {
        const cards = (await siyuan.sql(
            `select block_id, value from attributes where name='${READCARD_KEY}' and block_id in (${ids.map(i => `"${i}"`).join(",")}) limit 10000000`)) as any[] ?? [];
        const writes: { id: string; attrs: any }[] = [];
        for (const c of cards ?? []) {
            const st = parseReadCard(String(c.value ?? ""));
            if (!st || (st.mode !== "grow" && !st.graduated)) continue;
            writes.push({ id: String(c.block_id), attrs: { [READCARD_KEY]: formatReadCard({ ...st, freq: f }) } });
            followed++;
            if (!st.graduated && st.count >= 1) {
                const days = rescheduleDays(matBook ? "material" : "digest", matRemaining, st.count, f);
                if (days != null) dueWrites.push({
                    id: String(c.block_id),
                    due: plusDays(new Date(st.waterlineMs), days),
                });
            }
        }
        for (let i = 0; i < writes.length; i += 200) {
            await siyuan.batchSetBlockAttrs(writes.slice(i, i + 200));
        }
        if (dueWrites.length) {
            // 无 riff 卡的行写不进（摘卡残留/毕业档案）——批查在册才写，防无效请求
            const states = await getReadingCardStates(dueWrites.map(d => d.id));
            await setReadingDues(dueWrites.filter(d => (states.get(d.id) ?? []).some(s => s.riffCard)));
        }
    }
    debugLog("readcurve", `freq book ${bookID} → ${f}${opts?.auto ? " (auto)" : ""} followed=${followed} dueRewritten=${dueWrites.length}`, "progressive");
    return true;
}

// ============ □6 产出率反哺：零产出自动放宽（巡查顺带算，pull 红线=纯幂等补算） ============

/** 限流锚（cardflip 触发的巡查高频，30 分钟一算够用——观察窗本身 30 天）。
 *  review P2：成功路径才置位（中途抛错下轮重试，不白等 30min） */
let lastAutoRelaxMs = 0;
const AUTO_RELAX_INTERVAL_MS = 30 * 60_000;

/** □6 巡查顺带算：30 天窗口零摘抄零制卡的中档在册书自动放宽到 l（×1.5）。持
 *  ReadCurveSweepLock 态由 sweepReadCurve 锁内直调（内部 applyBookVisitFreq=无锁核，
 *  勿走 setBookVisitFreq——queued 嵌套死锁）。档位/标记判读 getBlockAttrs 直读（SQL
 *  attributes 索引延迟窗内会把刚改的 h 判回 m→误放宽覆写显式意图，ShowAllBooks 同款
 *  理由）。单向：标记在场不再动；收回只走一键恢复。制卡计数=书盒文档（cards# 锚）子块
 *  窗口内新建（blocks 表 created 列——⚠无 ctime 列，review P0-1 实锤「no such column」
 *  静默恒 0；每日/现场卡落点无书锚漏计，方向=放宽少误不误已产出书，记档）。全程
 *  debugLog=变更理由留 Loki 时间线（Weave priorityLog 行为级） */
export async function autoRelaxSweep(): Promise<void> {
    const now = Date.now();
    if (now - lastAutoRelaxMs < AUTO_RELAX_INTERVAL_MS) {
        debugLog("readcurve", `autorelax skip (throttled ${Math.round((now - lastAutoRelaxMs) / 60_000)}min)`, "progressive");
        return;
    }
    await doAutoRelaxSweep(now);
    lastAutoRelaxMs = now;
}

async function doAutoRelaxSweep(now: number): Promise<void> {
    const winMs = relaxWindowStart(now);
    const infos = progStorage.booksInfos();
    // 书集（review P1-1/P2）：lost/closed 书进集=写静默失败→标记永不落→每轮重试吃光
    // CAP 活书饿死——对齐 computeTargets 的 status!=="ok" 排除；manualMode 书无调度面
    // （曲线不为手动书建卡），放宽+徽标对它是纯噪音
    const statuses = await loadBookStatuses();
    const bookIDs = Object.entries(infos)
        .filter(([id, info]) => progStorage.isRegisteredBook(id) && !info.ignored && !info.archived
            && !info.manualMode && statuses.get(id)?.status === "ok")
        .map(([id]) => id);
    if (!bookIDs.length) return;
    const rows = (await siyuan.sql(
        `select block_id, value from attributes where name='${PDIGEST_CTIME}' limit 10000000`)) as any[] ?? [];
    const digests = digestCountsInWindow(rows ?? [], winMs);
    // 制卡计数（短路：摘抄非零已判不放宽，不查制卡省请求）。查询失败不落条目=「未知」，
    // 判定处 skip 下轮重查（review R2 P2：勿当 0 参与——瞬时 SQL 失败会假零产出误放宽；
    // findCards 返 null 的无盒/失败二义无法区分，按无盒=零制卡处理记档）
    const cardN = new Map<string, number>();
    const winStamp = dueStamp(new Date(winMs));
    for (const b of bookIDs.filter(b => !(digests.get(b) > 0))) {
        const doc = await findCards(b).catch(() => null);
        if (!doc) { cardN.set(b, 0); continue; }
        const r = (await siyuan.sqlOne(
            `select count(*) as n from blocks where root_id='${doc}' and id != root_id and created > '${winStamp}'`).catch(() => null)) as any;
        if (r != null) cardN.set(b, Number(r?.n ?? 0));
    }
    let applied = 0;
    for (const b of bookIDs) {
        if (applied >= AUTO_RELAX_CAP) break;
        // per-book 兜底（review P1-1c，digest 建卡同款）：单书抛错饿死迭代序其后所有书
        try {
            const dg = digests.get(b) ?? 0;
            if (dg === 0 && !cardN.has(b)) {
                debugLog("readcurve", `autorelax skip ${b} (card count unknown this round)`, "progressive");
                continue;
            }
            const ar = String((((await siyuan.getBlockAttrs(b)) ?? {}) as any)[AUTORELAX_KEY] ?? "");
            const verdict = relaxVerdict({
                digestN: dg, cardN: cardN.get(b) ?? 0,
                freq: await bookVisitFreq(b),
                autorelaxAt: /^\d{14}$/.test(ar) ? parseStamp(ar) : null,
                bookAddedMs: infos[b]?.time, nowMs: now,
            });
            debugLog("readcurve", `autorelax check ${b} digest=${dg} card=${cardN.get(b) ?? 0} age=${infos[b]?.time ? Math.floor((now - infos[b].time!) / 86_400_000) : "?"}d → ${verdict}`, "progressive");
            if (!verdict) continue;
            const ok = await applyBookVisitFreq(b, "l", { auto: true });
            if (!ok) {
                debugLog("readcurve", `autorelax apply fail ${b} (skipped, next round retries)`, "progressive");
                continue;
            }
            applied++;
            debugLog("readcurve", `autorelax applied ${b} → l (${RELAX_WINDOW_DAYS}d zero output)`, "progressive");
        } catch (e) {
            debugLog("readcurve", `autorelax per-book fail ${b}: ${e}`, "progressive");
        }
    }
    if (applied) notifyFleetChanged();
}

// ============ □4 操作面：单块上下文 + 动作函数族（卡菜单/右键/面板三入口共用） ============

/** 单块阅读卡上下文（菜单组配输入）：归属反解与 getReadingCards 同判据面的单块版 */
export interface ReadCardCtx {
    blockID: string;
    readcard: string;
    st: ReturnType<typeof parseReadCard>;
    /** 持久退推标记在场（「已退出」状态行/加入推送需清标） */
    optout: boolean;
    kind: ReadCardKind | "";
    bookID: string;
    point: number | null;
    /** riff 卡在场（again/sched 分流 adopt/build 的判据） */
    hasCard: boolean;
    /** 现卡 due 毫秒（状态行「X 天后再见」尾） */
    dueMs: number | null;
    /** □6 书 autorelax 标记时刻（ms；在场=状态行挂「30 天零摘抄，回访间隔已放宽」尾句） */
    relaxedAt: number | null;
}

export async function inspectReadCard(blockID: string): Promise<ReadCardCtx> {
    const attrs = ((await siyuan.getBlockAttrs(blockID)) ?? {}) as any;
    const readcard = String(attrs[READCARD_KEY] ?? "");
    const st = parseReadCard(readcard);
    const infos = progStorage.booksInfos();
    const piece = parsePieceMark(String(attrs[MarkKey] ?? ""));
    let kind: ReadCardKind | "" = "";
    let bookID = "";
    let point: number | null = null;
    if (piece) {
        bookID = piece.bookID;
        point = piece.point;
        kind = infos[bookID]?.writing ? "slot" : "piece";
    } else {
        const bid = parseBookIDFromCtime(String(attrs[PDIGEST_CTIME] ?? ""));
        if (bid) {
            bookID = bid;
            kind = infos[bid]?.writing ? "material" : "digest";
        }
    }
    if (!kind) {
        // 第三归属通道（单块版）：type d=plain / custom+围栏=rpcard / grow|sched 无锚=plain
        const rows = (await siyuan.sql(
            `select type, markdown from blocks where id='${blockID}' limit 1`)) as any[] ?? [];
        const t = rows[0]?.type;
        kind = t === "d" ? "plain"
            : t === "custom" && isRPCardMarkdown(String(rows[0]?.markdown ?? "")) ? "rpcard"
            : st && !st.graduated && st.mode !== "daily" ? "plain" : "digest";
    }
    const states = await getReadingCardStates([blockID]);
    const live = (states.get(blockID) ?? []).filter(s => s.riffCard);
    const nd = live.length ? normalizeDue(live[live.length - 1].riffCard!.due as string) : null;
    const dueMs = nd ? parseStamp(`${nd}00`) : null; // 分钟粒度补秒
    // □6 书放宽标记（菜单低频场景一书一查；无书对象=全局 rpcard/plain 无此面）
    let relaxedAt: number | null = null;
    if (bookID) {
        const ar = String((((await siyuan.getBlockAttrs(bookID)) ?? {}) as any)[AUTORELAX_KEY] ?? "");
        if (/^\d{14}$/.test(ar)) relaxedAt = parseStamp(ar);
    }
    return { blockID, readcard, st, optout: !!attrs[READOUT_KEY], kind, bookID, point, hasCard: live.length > 0, dueMs, relaxedAt };
}

/** 分片转档/退推时的书推进（reconcileGraduated 同守卫：只进不退+忽略/归档/手动不推） */
async function advanceBookPast(bookID: string, point: number | null): Promise<void> {
    if (!bookID || point == null) return;
    const info = progStorage.booksInfos()[bookID];
    if (!info || info.ignored || info.archived || info.manualMode) return;
    if (!shouldReconcilePiece(point, info.point ?? 0)) return;
    await progStorage.gotoBlock(bookID, point + 1);
}

/** 素材落锤（退出曲线/转档时同步锤掉，防 countUnreadMaterial 计数虚高挂着「N 篇待读」） */
async function hammerMaterial(blockID: string, bookID: string): Promise<void> {
    if (!bookID) return;
    const attrs = ((await siyuan.getBlockAttrs(blockID)) ?? {}) as any;
    const ct = String(attrs[PDIGEST_CTIME] ?? "");
    if (ct && !ct.startsWith("🔨")) {
        await siyuan.setBlockAttrs(blockID, { [PDIGEST_CTIME]: `🔨#${ct}` } as any);
    }
}

/** 操作面六动作（□4）：不再推/每 N 天/再来一轮/推迟/转记忆卡/加入推送。
 *  锁内执行（与巡查互斥——改键/摘卡/建卡的中途态会被 getReadingCards 孤儿判定打断）；
 *  add 委托 addToReadingCurve（自带锁，勿嵌套死锁）。返回 toast 文案（空=静默失败） */
export type ReadCardActionId = "stop" | "sched" | "again" | "defer" | "repush" | "memory" | "add" | "freq";

export async function applyReadCardAction(blockID: string, action: ReadCardActionId, every = 0, opts?: { silent?: boolean }): Promise<string> {
    if (!blockID) return "";
    if (!readCurveTakeover.get()) return tomatoI18n.接管未开启;
    if (action === "add") {
        const d = await addToReadingCurve(blockID);
        return tomatoI18n.已加入阅读推送(d > 0 ? d : GROW_INTERVALS[0]);
    }
    let tip = "";
    await lockWithLease(ReadCurveSweepLock, async () => {
        try {
            // 重分片/出片进行中不推进书 point（幽灵片防线，sweepReadCurve 同款避让；review P1-1）
            if (await mainSweepLocksHeld()) {
                tip = tomatoI18n.正在整理书籍;
                return;
            }
            const ctx = await inspectReadCard(blockID);
            const now = new Date();
            if (action === "stop") {
                if (ctx.kind === "piece") await advanceBookPast(ctx.bookID, ctx.point);
                if (ctx.kind === "material") await hammerMaterial(blockID, ctx.bookID);
                // optout 先落（review P2-1：半程态守住不重推——摘卡/清键失败时下轮不重建）
                await siyuan.setBlockAttrs(blockID, { [READOUT_KEY]: dueStamp(now) } as any);
                // 摘卡面只免 rpcard（tomato 资产，clearReadCurve 分流同款）；plain 含自家 add
                // 通道建的 QUICK 卡必须摘（review P0-1），真用户 deck 卡 QUICK 限定摘=no-op 无害
                if (ctx.kind !== "rpcard") await removeReadingCards([blockID]);
                await clearKeysSafe([blockID]);
                tip = tomatoI18n.已不再推送;
            } else if (action === "sched") {
                const n = SCHED_CHOICES.includes(every) ? every : 0;
                if (!n) return;
                if (ctx.kind === "piece") await advanceBookPast(ctx.bookID, ctx.point);
                if (ctx.kind === "material") await hammerMaterial(blockID, ctx.bookID);
                const due = plusDays(now, n);
                if (ctx.hasCard) {
                    await siyuan.setBlockAttrs(blockID, { [READCARD_KEY]: toSchedValue(n, now.getTime()) } as any);
                    await setReadingDues([{ id: blockID, due }]);
                } else {
                    // 毕业转档：卡已摘 → 重建（build 参数化 sched 与 toSchedValue 同形）
                    await buildReadingCard(blockID, due, { mode: "sched", count: n });
                }
                tip = tomatoI18n.已改为每N天推送(n);
            } else if (action === "again") {
                if (ctx.optout) await siyuan.setBlockAttrs(blockID, { [READOUT_KEY]: "" } as any);
                // □3 再来一轮继承卡上频率档（毕业档案 g# 尾段同保；无尾段=中档）
                const f = ctx.st?.freq ?? "m";
                const due = plusDays(now, growInterval(0, f));
                if (ctx.hasCard) await adoptReadingCard(blockID, due, { mode: "grow", count: 1, freq: f });
                else await buildReadingCard(blockID, due, { mode: "grow", count: 1, freq: f });
                tip = tomatoI18n.已再来一轮;
            } else if (action === "defer") {
                await setReadingDues([{ id: blockID, due: tomorrowStart(now) }]);
                tip = tomatoI18n.已推迟到明天;
            } else if (action === "repush") {
                // □8：due 拉回 now 立刻重进队列——不动身份键不耗轮次（误评回手代价=下次评分
                // 多耗一轮，撤销语义留观察）；无卡（毕业/已摘）落不了 due=静默失败走兜底 toast
                if (!ctx.hasCard) return;
                await setReadingDues([{ id: blockID, due: dueStamp(now) }]);
                tip = tomatoI18n.已重推稍后再见;
            } else if (action === "memory") {
                if (ctx.kind === "piece") await advanceBookPast(ctx.bookID, ctx.point);
                if (ctx.kind === "material") await hammerMaterial(blockID, ctx.bookID);
                await clearKeysSafe([blockID]);
                await siyuan.setBlockAttrs(blockID, { [READOUT_KEY]: dueStamp(now) } as any);
                tip = tomatoI18n.已转为记忆卡;
            }
        } catch (e) {
            debugLog("readcurve", `action ${action} fail ${blockID}: ${e}`, "progressive");
            tip = "";
        }
    }, { queued: true });
    if (tip && !opts?.silent) {
        try { await siyuan.pushMsg(tip, 2500); } catch { /* toast 失败不回滚 */ }
    }
    debugLog("readcurve", `action ${action} ${blockID} every=${every} → ${tip || "(silent)"}`, "progressive");
    notifyFleetChanged();
    return tip;
}

/** □4 计划面板行集：活跃卡（状态行+due）+ 毕业档案（g 键，恢复入口的展示面） */
export interface ReadCurvePlanRow {
    blockID: string;
    content: string;
    kind: ReadCardKind | "";
    bookID: string;
    status: string;
    dueMs: number | null;
}

export async function getReadCurvePlanRows(): Promise<{ active: ReadCurvePlanRow[]; graduated: ReadCurvePlanRow[] }> {
    const { cards, keyed } = await getReadingCards();
    const gradIDs = [...keyed.entries()].filter(([, v]) => parseReadCard(String(v ?? ""))?.graduated).map(([id]) => id);
    const need = [...new Set([...cards.map(c => c.blockID), ...gradIDs])];
    const contentOf = new Map<string, string>();
    if (need.length) {
        const rows = (await siyuan.sql(
            `select id, content from blocks where id in (${need.map(id => `'${id}'`).join(",")}) limit 10000000`)) as any[] ?? [];
        for (const r of rows) contentOf.set(String(r.id), String(r.content ?? ""));
    }
    const nowMs = Date.now();
    // □6 书放宽标记批查（书 ID 去重一书一查，面板打开一次；statusLineOf 尾句消费）
    const relaxedOf = new Map<string, number>();
    for (const bid of [...new Set(cards.map(c => c.bookID).filter(Boolean))]) {
        const ar = String((((await siyuan.getBlockAttrs(bid)) ?? {}) as any)[AUTORELAX_KEY] ?? "");
        if (/^\d{14}$/.test(ar)) relaxedOf.set(bid, parseStamp(ar));
    }
    const active: ReadCurvePlanRow[] = cards.map(c => ({
        blockID: c.blockID,
        content: contentOf.get(c.blockID) ?? c.blockID,
        kind: c.kind,
        bookID: c.bookID,
        status: statusLineOf(c.readcard, dueMsOf(c.due), nowMs, relaxedOf.get(c.bookID)) ?? `✦ ${tomatoI18n.阅读卡}`,
        dueMs: dueMsOf(c.due),
    }));
    // 死块行滤除（contentOf 查不到=块已删：面板不再示人，批量恢复对死块发事务=内核
    // txerr 全局弹窗）；active 已含 id 排除（毕业摘卡中断残留 g 键+卡 live 双行，review P2-12）
    const activeIDs = new Set(active.map(r => r.blockID));
    const graduated: ReadCurvePlanRow[] = gradIDs
        .filter(id => contentOf.has(id) && !activeIDs.has(id))
        .map(id => ({
            blockID: id,
            content: contentOf.get(id) ?? id,
            kind: "",
            bookID: "",
            status: statusLineOf(keyed.get(id) ?? "", null, nowMs) ?? `✦ ${tomatoI18n.已毕业}`,
            dueMs: null,
        }));
    // rpcard 行内容=content 列的 JSON 串（custom 块原文），面板显示换成友好标签——
    // active 行按 kind 判（防 JSON 笔记误标），毕业档案行 kind="" 留启发式兜底（review P2-9）
    for (const row of active) {
        if (row.kind === "rpcard" && row.content.trimStart().startsWith("{")) row.content = tomatoI18n.阅读点卡;
    }
    for (const row of graduated) {
        if (row.content.trimStart().startsWith("{")) row.content = tomatoI18n.阅读点卡;
    }
    return { active, graduated };
}

/** due（YYYYMMDDHHmm 分钟串）→ 毫秒 */
function dueMsOf(due: string | null): number | null {
    return due ? parseStamp(`${due}00`) : null;
}

// ============ 触发器（事件驱动为主+轻量定时兜底） ============

let sweepTimer: ReturnType<typeof setInterval> | null = null;
let takeoverStop: (() => void) | null = null;
let minsStop: (() => void) | null = null;
let quotaStop: (() => void) | null = null;
let classStops: (() => void)[] = [];
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
    // 期5 类别开关/节奏档位族订阅（review P2-1：sweepMins=0 时无 timer，改开关要等
    // 翻卡/onload 才生效太迟——对齐 quota 即时重算先例；首轮回调=当前值，值比对防误触）
    const classPrev = [
        readCurvePiece, readCurveMaterial, readCurveDigest, readCurveReadingPoint, readCurvePlainDocs,
        readCurveCadMaterial, readCurveCadDigest, readCurveCadReadingPoint, readCurveCadPlain,
    ].map(s => String(s.get() ?? ""));
    classStops = [
        readCurvePiece, readCurveMaterial, readCurveDigest, readCurveReadingPoint, readCurvePlainDocs,
        readCurveCadMaterial, readCurveCadDigest, readCurveCadReadingPoint, readCurveCadPlain,
    ].map((s, i) => s.subscribe(v => {
        const cur = String(v ?? "");
        if (cur === classPrev[i]) return;
        classPrev[i] = cur;
        void sweepReadCurve("settings-class");
    }));
    resetSweepTimer();
}

export function disposeReadCurve() {
    if (sweepTimer) { clearInterval(sweepTimer); sweepTimer = null; }
    takeoverStop?.(); takeoverStop = null;
    minsStop?.(); minsStop = null;
    quotaStop?.(); quotaStop = null;
    classStops.forEach(stop => stop()); classStops = [];
}
