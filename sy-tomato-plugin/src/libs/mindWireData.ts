// □2 词级导线数据链纯函数（spec docs/tomato-mindwire-visual-spec.md §3/D12）。
// 词级锚点=批注同款 setInlineMark('a') 标记对：href 前缀 #tomato-mindwire-<wireId>
// 与批注 #tomato-anno- 天然隔离；关系类型存文档根块属性 custom-mindwire-relations
// （JSON map，改关系只写属性不动标记）；孤儿=DOM 零端的属性条目，重画时求差非空才回写。
// 渲染接线见 MindWire.ts；曲线几何见 mindWireGeom.ts。

export const WORD_WIRE_HREF_PREFIX = "#tomato-mindwire-";
export const RELATIONS_ATTR = "custom-mindwire-relations";

export type RelationKey = "related" | "echo" | "foreshadow" | "metaphor" | "contrast" | "cause";

/** 六档关系色（spec §4.7；color7 批注橙全板排除） */
export const RELATION_COLOR: Record<RelationKey, string> = {
    related: "var(--b3-font-color5)",
    echo: "var(--b3-font-color6)",
    foreshadow: "var(--b3-font-color8)",
    metaphor: "var(--b3-font-color9)",
    contrast: "var(--b3-font-color10)",
    cause: "var(--b3-font-color11)",
};

/** 关系色查表：未知/缺省 key 兜底「关联」灰5（新线默认档，语义诚实不强迫选色） */
export function relationColor(key: string | undefined): string {
    return RELATION_COLOR[key as RelationKey] ?? RELATION_COLOR.related;
}

/** wire id：mw + Date.now().toString(36) + 2 位随机 base36（spec §3.1）；now/rand 注入供测试 */
export function makeWireId(now: number = Date.now(), rand: () => number = Math.random): string {
    const digit = () => Math.floor(rand() * 36).toString(36);
    return "mw" + now.toString(36) + digit() + digit();
}

/** href → wireId：词级前缀命中剥前缀；批注/普通链接/裸串/空前缀一律 null */
export function wireIdFromHref(href: string | null | undefined): string | null {
    if (!href?.startsWith(WORD_WIRE_HREF_PREFIX)) return null;
    const id = href.slice(WORD_WIRE_HREF_PREFIX.length);
    return id || null;
}

export interface GroupedWordWires<T> {
    /** 恰好两端成对（DOM 顺序即端序）；>2 端防御取前 2（span href 一线一值，理论不可能） */
    pairs: { wireId: string; ends: [T, T] }[];
    /** 单端 wireId（不成线；仍在 seen 里，孤儿判定不算它） */
    singles: Set<string>;
    /** DOM 中出现过的全部 wireId（孤儿差集的 DOM 侧全集） */
    seen: Set<string>;
}

/** href 列表 → wireId 分组配对（T=锚 span，泛型保纯函数可测） */
export function groupWordWires<T>(items: { href: string; end: T }[]): GroupedWordWires<T> {
    const byId = new Map<string, T[]>();
    for (const { href, end } of items) {
        const id = wireIdFromHref(href);
        if (!id) continue;
        const arr = byId.get(id);
        if (arr) arr.push(end);
        else byId.set(id, [end]);
    }
    const pairs: { wireId: string; ends: [T, T] }[] = [];
    const singles = new Set<string>();
    for (const [wireId, ends] of byId) {
        if (ends.length >= 2) pairs.push({ wireId, ends: [ends[0], ends[1]] });
        else singles.add(wireId);
    }
    return { pairs, singles, seen: new Set(byId.keys()) };
}

/** 文档根块属性 JSON 容错解析：坏 JSON/非对象 → 空 map（渲染走默认色，不抛） */
export function parseRelations(attr: string | null | undefined): Record<string, string> {
    if (!attr) return {};
    try {
        const v = JSON.parse(attr);
        return v && typeof v === "object" && !Array.isArray(v) ? v : {};
    } catch {
        return {};
    }
}

/** 孤儿差集：属性条目 − DOM 扫集（seen 含单端）。返回回写值——null=无孤儿不写；
 *  JSON=清理后余量；""=清空到零（思源惯例空串=删属性）。坏 JSON 返回 null 宁留不误清 */
export function cleanupRelations(attr: string | null | undefined, domWireIds: Set<string>): string | null {
    const map = parseRelations(attr);
    const keys = Object.keys(map);
    if (keys.length === 0) return null;
    const orphans = keys.filter((k) => !domWireIds.has(k));
    if (orphans.length === 0) return null;
    orphans.forEach((k) => delete map[k]);
    return Object.keys(map).length ? JSON.stringify(map) : "";
}

export type WireEndCheck = "ok" | "same" | "crossdoc";

/** 两步流第二步边界判定（spec §4.3 边界表，□3）：终点选区命中的既有标记 wireId
 *  与 pending 同线 → same（起点终点相同）；rootId 不同 → crossdoc（仅限本文档）；
 *  划在别的线上（一词多线复用）是合法端 → ok */
export function checkWireEnd(
    pending: { wireId: string; rootId: string },
    target: { selWireId: string | null; rootId: string },
): WireEndCheck {
    if (target.selWireId === pending.wireId) return "same";
    if (target.rootId !== pending.rootId) return "crossdoc";
    return "ok";
}

/** 词文本截断：芯片起点词 12 字（spec §4.4）/ 残端标签 8 字（spec §4.2） */
export function wordClip(text: string, n: number = 12): string {
    return text.length > n ? text.slice(0, n) + "…" : text;
}
