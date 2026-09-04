// v5 □15 摘抄痕迹多摘列表纯逻辑（handoff □15 拍板）：refMap 从 ref→最新块 ID 单值升级
// ref→块 ID 数组；痕迹点击单摘直跳（现状保留）/多摘弹原生 Menu 轻量列表。
// 可见性期1（handoff 2026-09-04 □1 B 拍板）：列表按摘抄文档分组（同 root_id 多块=一次断句
// 摘抄拆多块，合并一行）+ 悬空孤儿剔除 + 头部「共 N 条摘抄」。
// 纯函数无 DOM/SiYuan 依赖，DOM/Menu 层在 digestMarker.ts 消费。

/** buildRefMap 的 SQL 行（attributes 表 name=custom-progref） */
export interface RefRow {
    block_id?: string;
    value?: string;
}

/** 多摘列表的 SQL 行（blocks join 取摘抄内容与所属 digest 文档标题；root_id=分组键） */
export interface DigestRow {
    id: string;
    content?: string | null;
    doc?: string | null;
    root_id?: string | null;
}

/** 多摘列表一行=一个摘抄文档（同 root_id 多块合并后） */
export interface DigestGroup {
    /** 代表块 ID=组内最早块（文档起始，点击落文档头） */
    id: string;
    /** 所属摘抄文档块 ID */
    rootId: string;
    /** 摘抄文档标题（join 不上为 ""） */
    doc: string;
    /** 组内块按文档序（块 ID 升序）空格拼接的预览 */
    content: string;
}

/** SQL 行聚合：ref值 → 摘抄块 ID 数组（升序=块 ID 时间序，末位最新） */
export function mergeRefRows(rows: RefRow[]): Map<string, string[]> {
    const map = new Map<string, string[]>();
    for (const r of rows) {
        if (!r?.block_id || !r?.value) continue;
        const list = map.get(r.value);
        if (list) list.push(r.block_id);
        else map.set(r.value, [r.block_id]);
    }
    for (const list of map.values()) list.sort();
    return map;
}

/** 痕迹点击分派：单摘返回直跳块 ID；空/多摘返回 null（多摘走 Menu 列表） */
export function digestJumpOf(ids: string[]): string | null {
    return ids.length === 1 ? ids[0] : null;
}

/**
 * 多摘列表分组（期1 B）：orderedIDs=refMap 块 ID（升序=时间序），rows=SQL 实查。
 * ① 悬空孤儿剔除——orderedIDs 里查无 rows 的 id（块已删、IAL 残留）直接不产出组；
 * ② 同 root_id 多块合并一行，代表块=文档序首块（跳转落文档头）；
 * ③ 组序=最新文档排最上（按组内最新块 ID 倒序）。
 * docOrders（可选）=rootId → 文档真实块序（getChildBlocks）——断句摘抄的块创建序
 * 实测乱序（id 序≠文档序），预览拼接必须按文档序；缺省回退块 ID 升序。
 */
export function groupDigestRows(
    orderedIDs: string[], rows: DigestRow[], docOrders?: Map<string, string[]>,
): DigestGroup[] {
    const byID = new Map(rows.map(r => [r.id, r]));
    const groups = new Map<string, { g: DigestGroup; ids: string[] }>();
    for (const id of orderedIDs) {
        const r = byID.get(id);
        if (!r) continue; // 孤儿：SQL 查无此块（用户实锤弹层比树多行），不显示
        const rootId = r.root_id || r.id;
        const cur = groups.get(rootId);
        if (cur) {
            cur.ids.push(id);
        } else {
            groups.set(rootId, {
                g: { id, rootId, doc: (r.doc ?? "").trim(), content: "" },
                ids: [id],
            });
        }
    }
    const orderOf = (rootId: string, ids: string[]): string[] => {
        const docOrder = docOrders?.get(rootId);
        if (!docOrder?.length) return [...ids].sort();
        const inSet = new Set(ids);
        const ordered = docOrder.filter(id => inSet.has(id));
        // 组内 id 不在 docOrder（防御：索引延迟）追加尾部，保证不丢
        return [...ordered, ...[...ids].sort().filter(id => !ordered.includes(id))];
    };
    const latestOf = new Map<string, string>();
    for (const [rootId, { ids }] of groups) {
        const ordered = orderOf(rootId, ids);
        const g = groups.get(rootId)!.g;
        g.id = ordered[0]; // 文档序首块=跳转落点
        g.content = ordered
            .map(id => (byID.get(id)?.content ?? "").replace(/\s+/g, " ").trim())
            .filter(Boolean)
            .join(" ");
        const latest = [...ids].sort().pop()!;
        latestOf.set(rootId, latest);
    }
    return [...groups.values()]
        .map(({ g }) => g)
        .sort((a, b) => {
            const la = latestOf.get(a.rootId) ?? a.id;
            const lb = latestOf.get(b.rootId) ?? b.id;
            return la < lb ? 1 : la > lb ? -1 : 0;
        });
}

/** label 尾部内容截断（含 CJK；空白规整后为空视为缺省） */
function clip(s: string | null | undefined, n: number): string {
    const t = (s ?? "").replace(/\s+/g, " ").trim();
    return t.length > n ? t.slice(0, n) + "…" : t;
}

/** 分组模型 → Menu 项（label = 摘抄文档标题 · 内容预览截断；内容缺省 fallback 代表块 ID） */
export function buildDigestMenuItems(groups: DigestGroup[]): { label: string; id: string }[] {
    return groups.map(g => {
        const doc = clip(g.doc, 20);
        const body = clip(g.content, 40) || g.id;
        return { label: doc ? `${doc} · ${body}` : body, id: g.id };
    });
}
