// v5 □15 摘抄痕迹多摘列表纯逻辑（handoff □15 拍板）：refMap 从 ref→最新块 ID 单值升级
// ref→块 ID 数组；痕迹点击单摘直跳（现状保留）/多摘弹原生 Menu 轻量列表。
// 纯函数无 DOM/SiYuan 依赖，DOM/Menu 层在 digestMarker.ts 消费。

/** buildRefMap 的 SQL 行（attributes 表 name=custom-progref） */
export interface RefRow {
    block_id?: string;
    value?: string;
}

/** 多摘列表的 SQL 行（blocks join 取摘抄内容与所属 digest 文档标题） */
export interface DigestRow {
    id: string;
    content?: string | null;
    doc?: string | null;
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

/** label 尾部内容截断（含 CJK；空白规整后为空视为缺省） */
function clip(s: string | null | undefined, n: number): string {
    const t = (s ?? "").replace(/\s+/g, " ").trim();
    return t.length > n ? t.slice(0, n) + "…" : t;
}

/** SQL 行 → Menu 项（块 ID 倒序=最新摘抄排最上；label = 摘抄文档标题 · 内容首行截断） */
export function buildDigestMenuItems(rows: DigestRow[]): { label: string; id: string }[] {
    return [...rows]
        .sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
        .map(r => {
            const doc = clip(r.doc, 20);
            const body = clip(r.content, 40) || r.id;
            return { label: doc ? `${doc} · ${body}` : body, id: r.id };
        });
}
