// bookcards □1（1141 档 □7a 方案 A'）：本书卡清单数据层。
// 归属跟 ctime 标记不跟物理位置（鸟 09-04 反馈根治）；查询链+缓存在本文件，
// 纯函数 parseCtimeBook/sortCardRows 的 TDD=tests/unit/cardList.test.ts。
import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import { PDIGEST_CTIME } from "../../sy-tomato-plugin/src/libs/gconst";

/** ctime 归一形态：归属书 id + 锤态标志（🔨=卡已收进阅读曲线） */
export interface CtimeBook {
    bookID: string;
    hammered: boolean;
}

/**
 * PDIGEST_CTIME 属性值 → 归属形态。两种合法形态：
 * - 裸 `bookID#ts`（在池）
 * - 锤态 `🔨#bookID#ts`（卡收进曲线后的 done 标记，readCurve.ts 挂）
 * 非法（空/无 # 分隔/段数不足）→ null。防御性：值里多余 # 段不炸（只取前两段语义）。
 */
export function parseCtimeBook(value: unknown): CtimeBook | null {
    if (typeof value !== "string" || value === "") return null;
    // 🔨 是代理对（2 code unit），切片定界一律 indexOf 勿写死字面长度
    const hammered = value.startsWith("🔨");
    const rest = hammered ? value.slice(value.indexOf("#") + 1) : value;
    const i = rest.indexOf("#");
    if (i <= 0) return null;
    const bookID = rest.slice(0, i);
    if (bookID === "" || rest.slice(i + 1) === "") return null;
    return { bookID, hammered };
}

/** 清单行模型（浮层渲染与徽标求和共用） */
export interface CardRow {
    docID: string;
    title: string;
    /** 官方 riff 到期数；null=惰性未填（后台并发补） */
    due: number | null;
    /** 锤态：卡已收进阅读曲线（曲线自管 due），行显示「已进曲线」态不参与 due 序 */
    hammered: boolean;
}

/**
 * 清单行排序：due 降序前置（复习价值优先），due=0 与未填(null)垫尾保持稳定。
 * 锤态行照常参与 due 序（6808 实测：🔨 只是曲线收编标记，官方 riff 卡独立存活、
 * getTreeRiffDueCards 照收——「已进曲线」只是行内附加信息不改变排序）。输入不被修改。
 */
export function sortCardRows(rows: readonly CardRow[]): CardRow[] {
    const rank = (r: CardRow) => (r.due != null && r.due > 0 ? 0 : 1);
    return [...rows]
        .map((r, i) => ({ r, i }))
        .sort((a, b) => rank(a.r) - rank(b.r)
            || (b.r.due ?? 0) - (a.r.due ?? 0)
            || a.i - b.i)
        .map(x => x.r);
}

/** ctime 全量查询先例=readCurve.ts:217（limit 10000000 全量属性扫） */
async function fetchCtimeAttrs(): Promise<{ id: string; value: string }[]> {
    const rows = await siyuan.sql(
        `select block_id as id, value from attributes where name='${PDIGEST_CTIME}' limit 10000000`,
    ) ?? [];
    return rows as { id: string; value: string }[];
}

/** 缓存条目：行集+填充时刻；TTL 内复用（出场刷/徽标读共享一次查询） */
const CACHE_TTL = 30_000;
const cache = new Map<string, { rows: CardRow[]; at: number; inflight?: Promise<CardRow[]> }>();

/** 失效（复习完成/摘抄动作后调用；TTL 兜底前的主动通道） */
export function invalidateBookCardRows(bookID?: string): void {
    if (bookID == null) cache.clear();
    else cache.delete(bookID);
}

/**
 * 本书卡清单行（按 ctime 归属，与物理位置无关）。due 惰性：首返 due=null 的骨架行
 * +后台并发填（逐篇 getTreeRiffDueCards 实测 ~21ms/条，百篇大书 ~2s）。
 * 标题取文档行 content 首段（无则 id 兜底）。TTL 30s 缓存，inflight 去重并发查询。
 */
export async function fetchBookCardRows(bookID: string): Promise<CardRow[]> {
    const hit = cache.get(bookID);
    if (hit && Date.now() - hit.at < CACHE_TTL) return hit.rows;
    if (hit?.inflight) return hit.inflight;
    const p = (async () => {
        const attrs = await fetchCtimeAttrs();
        const mine = attrs
            .map(a => ({ id: a.id, ct: parseCtimeBook(a.value) }))
            .filter(x => x.ct?.bookID === bookID);
        const titles = await fetchTitles(mine.map(x => x.id));
        const rows: CardRow[] = mine.map(x => ({
            docID: x.id,
            title: titles.get(x.id) ?? x.id,
            due: null,
            hammered: x.ct!.hammered,
        }));
        // 并发限 ~8 填 due（防大书打爆内核）；结果写回缓存供徽标求和复用
        const CHUNK = 8;
        for (let i = 0; i < rows.length; i += CHUNK) {
            const batch = rows.slice(i, i + CHUNK);
            await Promise.all(batch.map(async r => {
                try {
                    r.due = (await siyuan.getTreeRiffDueCards(r.docID))?.unreviewedCount ?? 0;
                } catch {
                    r.due = 0;
                }
            }));
        }
        cache.set(bookID, { rows, at: Date.now() });
        return rows;
    })();
    cache.set(bookID, { rows: hit?.rows ?? [], at: hit?.at ?? 0, inflight: p });
    try {
        return await p;
    } finally {
        const cur = cache.get(bookID);
        if (cur) delete (cur as { inflight?: unknown }).inflight;
    }
}

/** 文档标题批查（blocks 表 content 首行≈标题；miss 兜底 id 由调用方处理） */
async function fetchTitles(docIDs: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (docIDs.length === 0) return map;
    const inList = docIDs.map(id => `'${id}'`).join(",");
    const rows = await siyuan.sql(
        `select id, content from blocks where id in (${inList}) limit ${docIDs.length}`,
    ) ?? [];
    for (const r of rows as { id: string; content: string }[]) {
        const first = (r.content ?? "").split("\n").find(l => l.trim() !== "") ?? "";
        map.set(r.id, first.slice(0, 60) || r.id);
    }
    return map;
}
