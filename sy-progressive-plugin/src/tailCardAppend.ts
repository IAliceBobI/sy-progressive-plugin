// □2 片尾收束卡——插卡通道+胶囊数据（轻量模块：无 .svelte/引擎依赖，helper.ts 与单测
// import 链安全）。appendTailCard=文档尾追加+宿主文档打幂等 flag；ensureDigestTailCard=
// 存量摘抄打开时幂等补插；胶囊（今日配额/附属卡到期）缓存与失效通道也在此——
// markReadSafe 翻片落账后失效今日缓存（review P1-3：60s TTL 会让高频翻片路径恒显旧值）。
// 渲染器与注册在 tailCardRender.ts（重量层）。
import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
import { pieceTailCard } from "../../sy-tomato-plugin/src/libs/stores";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import { rollerDebtSummary } from "./roller";
import { findDocByIal, getDocIalDigestDirUnder, getDocIalDigestDirHub } from "./progData";
import {
    TAIL_CARD_DOC_FLAG, buildTailCardBlockMD, buildTailCardContent,
    isTailCardRegistered, TailCardBlockData,
} from "./tailCardBlock";

/** 建卡总闸：3.8.3+ 已注册且开关开（关=停新建停补插，bear 拍板 2026-09-08） */
export function tailCardOn(): boolean {
    return isTailCardRegistered() && pieceTailCard.get() !== false;
}

/** 文档尾追加收束卡 + 宿主文档打幂等 flag。调用方保证文档是新建/已清空态（无重复卡）。
 *  flag-first（review P2-1）：先置 flag 再插块——两步之间失败=无卡不补插（与「用户手删
 *  卡不复活」同构），倒过来则窗口期=有卡无 flag，下次打开会补出第二张卡。
 *  失败静默（卡是增强层，缺卡不阻断建片/摘抄主流程），Loki 留观测面。 */
export async function appendTailCard(data: TailCardBlockData): Promise<void> {
    if (!tailCardOn()) return;
    try {
        await siyuan.setBlockAttrs(data.docID, { [TAIL_CARD_DOC_FLAG]: "1" } as any);
        await siyuan.appendBlock(buildTailCardBlockMD(buildTailCardContent(data)), data.docID);
        debugLog("prog.tailcard", `append kind=${data.kind} doc=${data.docID} book=${data.bookID}`, "progressive");
    } catch (e) {
        debugLog("prog.tailcard", `append failed kind=${data.kind} doc=${data.docID}: ${e}`, "progressive");
    }
}

/** 存量摘抄幂等补插（打开时）：flag 已置=有卡或用户手删过（不复活），未置=补插。
 *  仿写副本（review P1-2）跳过——机读标记 custom-prog-for-recite，存量副本无标记按
 *  「仿写」标题前缀兜底（newDigestDoc □28 的稳定命名）。走内核真值（getBlockAttrs）
 *  不走出场链快照——flag 是我们写的，快照可能早于落盘。 */
export async function ensureDigestTailCard(docID: string, bookID: string): Promise<void> {
    if (!docID || !tailCardOn()) return;
    try {
        const attrs = await siyuan.getBlockAttrs(docID);
        if (attrs?.[TAIL_CARD_DOC_FLAG]) return;
        if (attrs?.["custom-prog-for-recite"] === "1" || (attrs?.title ?? "").startsWith("仿写")) return;
        await appendTailCard({ v: 1, kind: "digest", bookID, point: 0, docID });
        debugLog("prog.tailcard", `retrofit doc=${docID}`, "progressive");
    } catch (e) {
        debugLog("prog.tailcard", `retrofit failed doc=${docID}: ${e}`, "progressive");
    }
}

// ============ 胶囊数据（今日配额/附属卡到期，60s TTL 防渲染高频查询） ============

const CAPSULE_TTL = 60_000;
let todayCache: { t: number; text: string } | null = null;
const dueCache = new Map<string, { t: number; due: number }>();

/** 今日缓存失效（markReadSafe 翻片落账后调用——新片卡的「今日 n/q」即时 +1） */
export function invalidateTailToday(): void {
    todayCache = null;
}

export async function capsuleTodayText(): Promise<string> {
    if (todayCache && Date.now() - todayCache.t < CAPSULE_TTL) return todayCache.text;
    const s = await rollerDebtSummary();
    const text = tomatoI18n.今日已读N片(s.readToday, s.quotaToday);
    todayCache = { t: Date.now(), text };
    return text;
}

/** 附属卡到期数（双夹并查，查不建——渲染路径零建夹副作用；refreshDue 同口径） */
export async function capsuleBookDue(bookID: string): Promise<number> {
    const hit = dueCache.get(bookID);
    if (hit && Date.now() - hit.t < CAPSULE_TTL) return hit.due;
    const dueOf = async (id: string) => id ? ((await siyuan.getTreeRiffDueCards(id))?.unreviewedCount ?? 0) : 0;
    const under = await findDocByIal(getDocIalDigestDirUnder(bookID));
    const hub = await findDocByIal(getDocIalDigestDirHub(bookID));
    let due = 0;
    if (under) due += await dueOf(under);
    if (hub && hub !== under) due += await dueOf(hub);
    dueCache.set(bookID, { t: Date.now(), due });
    return due;
}
