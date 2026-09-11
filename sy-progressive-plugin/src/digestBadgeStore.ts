// floatbar □1 类型胶囊数据采集层（digestBadge 纯函数的 SiYuan 侧供数）：
// 标题区类型胶囊（digestMarker.markDigestTag）与两摘抄清单（OriginDigestPopover/
// DigestAllDialog）共用。三键一次 SQL（pdigest-review/prog-think/prog-for-recite）
// + 卡组一次查询；独立 60s TTL 缓存（refMap 同模式）——出场链五事件高频重挂胶囊不重查。
// setReview 动作后 invalidateDigestBadge 即时失效（完成/推迟/移除跳下轮）。
import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import { findDocByIal, getDocIalDigestDir } from "./progData";
import { ReviewKey, PdigestReviewKey } from "./reviewQueue";
import type { DigestBadgeInput } from "./digestBadge";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";

const CACHE_TTL_MS = 60_000;
const FOR_RECITE_KEY = "custom-prog-for-recite";

const cache = new Map<string, { input: DigestBadgeInput; ts: number }>();

/** 调度键变更后失效（reviewMenu.setReview 完成族动作后逐 id 调；60s TTL 兜底自然过期） */
export function invalidateDigestBadge(docID: string) {
    cache.delete(docID);
}

/** 摘抄文档已入卡的块 ID set（自 digestMarker 迁入，原注释照搬）：
 *  digest 夹 IAL 只读认回（findDocByIal 不建——无夹=无卡），卡挂摘抄文档块，
 *  card.id 即块 ID。夹不存在/查询异常 → 空 set 静默降级（四态退三态，不崩列表）。 */
export async function cardIDSetOf(bookID: string): Promise<Set<string>> {
    try {
        const dirID = await findDocByIal(getDocIalDigestDir(bookID));
        if (!dirID) return new Set();
        const cards = await siyuan.getTreeRiffCardsAll(dirID);
        return new Set(cards.map(c => c.id));
    } catch {
        return new Set();
    }
}

const EMPTY_INPUT: DigestBadgeInput = {
    pdigestReview: "", thinkReview: "", thinkDone: false, cardInSet: false, forRecite: false,
};

/** think 多块聚合：活跃值（q#/s#）取下次最早的原值（胶囊日期=最近该想的一次），
 *  done 存在性单独记（活跃优先由 digestBadgeOf 判定层保证）。 */
function foldThink(values: string[]): { active: string; done: boolean } {
    let active = "";
    let activeNext = Infinity;
    let done = false;
    for (const v of values) {
        if (!v) continue;
        if (v === "done") { done = true; continue; }
        const ts = Number(v.split("#")[1]);
        if (Number.isFinite(ts) && ts < activeNext) { active = v; activeNext = ts; }
    }
    return { active, done };
}

/** 单文档快查（标题区胶囊）：走缓存；titles 兜底存量仿写副本（无标记，标题「仿写」前缀认回，
 *  tailCardAppend 同款口径）。bookID 空则卡组查询跳过（复访/思考可辨，背诵降级留档）。 */
export async function digestBadgeInputOf(
    docID: string, bookID: string, title = "",
): Promise<DigestBadgeInput | null> {
    const hit = cache.get(docID);
    if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.input;
    const map = await digestBadgeInputsOf([docID], bookID, new Map([[docID, title]]));
    return map.get(docID) ?? null;
}

/** 批量采集（两清单）：三键一次 SQL（显式 limit 防内核 64 截尾，dueReviewSQLFor 同款防线）；
 *  命中缓存的不重查。titles 参与仿写前缀兜底（title.startsWith("仿写")，存量副本无标记）。 */
export async function digestBadgeInputsOf(
    ids: string[], bookID: string, titles?: Map<string, string>,
): Promise<Map<string, DigestBadgeInput>> {
    const out = new Map<string, DigestBadgeInput>();
    if (ids.length === 0) return out;
    const now = Date.now();
    const missing: string[] = [];
    for (const id of ids) {
        const hit = cache.get(id);
        if (hit && now - hit.ts < CACHE_TTL_MS) out.set(id, hit.input);
        else missing.push(id);
    }
    if (missing.length > 0) {
        try {
            const rows = ((await siyuan.sql(
                `select name, root_id, value from attributes where root_id in (${missing.map(id => `"${id}"`).join(",")}) `
                + `and name in ("${PdigestReviewKey}", "${ReviewKey}", "${FOR_RECITE_KEY}") limit 1000000`,
            )) ?? []) as { name: string; root_id: string; value: string }[];
            const acc = new Map<string, { pdigest: string; think: string[]; forRecite: boolean }>();
            for (const r of rows) {
                if (!r?.root_id) continue;
                const a = acc.get(r.root_id) ?? { pdigest: "", think: [], forRecite: false };
                if (r.name === PdigestReviewKey) a.pdigest = r.value ?? "";
                else if (r.name === ReviewKey) a.think.push(r.value ?? "");
                else if (r.name === FOR_RECITE_KEY) a.forRecite = !!r.value;
                acc.set(r.root_id, a);
            }
            const cardSet = bookID ? await cardIDSetOf(bookID) : new Set<string>();
            for (const id of missing) {
                const a = acc.get(id);
                const think = foldThink(a?.think ?? []);
                const input: DigestBadgeInput = {
                    ...EMPTY_INPUT,
                    pdigestReview: a?.pdigest ?? "",
                    thinkReview: think.active,
                    thinkDone: think.done,
                    cardInSet: cardSet.has(id),
                    forRecite: !!a?.forRecite || !!(titles?.get(id) ?? "").startsWith("仿写"),
                };
                cache.set(id, { input, ts: now });
                out.set(id, input);
            }
            debugLog("digestmark", `digestBadgeInputsOf ids=${missing.length} 卡组=${cardSet.size}`, "progressive");
        } catch (e) {
            debugLog("digestmark", `digestBadgeInputsOf 失败降级空胶囊: ${e}`, "progressive");
        }
    }
    return out;
}
