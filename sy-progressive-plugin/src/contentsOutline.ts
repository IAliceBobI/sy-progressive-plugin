import { removeHtmlTags, siyuan } from "../../sy-tomato-plugin/src/libs/utils";

// □21 目录浮层数据源：getDocBlocks 底层 getBlockDOM 拉整树 DOM（巨书 25~39s/24MB）只为
// 取标题，换内核 getDocOutline 只回标题树（巨书实测 0.18s/205KB）。书大纲低频变——插件
// 内容流（重插 fullfilContent / 断句 splitAndInsert / 清原文 cleanNote）全只写分片文档
// 不动书本身，变更只来自用户手动编辑，故会话级 TTL 缓存兜 staleness，无需失效钩子。

export interface OutlineRow { id: string; text: string; level: number }

/** getDocOutline 响应的结构子集：顶层节点 name + blocks，子级递归 content + children */
type OutlineTop = { id: string; name: string; subType?: string; blocks?: OutlineKid[] };
type OutlineKid = { id: string; content?: string; subType?: string; children?: OutlineKid[] };

const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { rows: OutlineRow[]; expiresAt: number }>();

/** 标题树拍平为列表（DFS 前序=文档顺序），缩进档位取 h1~h6，剥内联 HTML 后滤空 */
export function flattenOutline(top: OutlineTop[]): OutlineRow[] {
    const rows: OutlineRow[] = [];
    const push = (id: string, text: string, subType?: string) => {
        const level = Number((subType ?? "h1").slice(1)) || 1;
        const t = removeHtmlTags(text ?? "").trim();
        if (id && t) rows.push({ id, text: t, level });
    };
    const walk = (kids: OutlineKid[]) => {
        for (const k of kids ?? []) {
            push(k.id, k.content, k.subType);
            walk(k.children);
        }
    };
    for (const t of top ?? []) {
        push(t.id, t.name, t.subType);
        walk(t.blocks);
    }
    return rows;
}

/** 书大纲（会话级 TTL 缓存）：同书 5 分钟内重开目录浮层瞬时出列表 */
export async function fetchBookOutline(bookID: string): Promise<OutlineRow[]> {
    const hit = cache.get(bookID);
    if (hit && hit.expiresAt > Date.now()) return [...hit.rows]; // 拷贝防 $state 代理穿透污染缓存
    const data = await siyuan.getDocOutline(bookID);
    const rows = flattenOutline(data);
    // 仅缓存真非空数组：siyuan.call 吞错返 null/undefined 与无标题书的 data:null 同形，
    // 缓存空结果会把瞬时故障钉成 5 分钟假空态——空态每次重开重试（0.2s 级，review P1-1）
    if (Array.isArray(data) && data.length > 0) {
        cache.set(bookID, { rows, expiresAt: Date.now() + TTL_MS });
        for (const [k, v] of cache) if (v.expiresAt <= Date.now()) cache.delete(k);
    }
    return rows;
}

/** 失效缓存（单书/全量）；当前无调用方，预留给未来会改写书内容的流程 */
export function invalidateBookOutline(bookID?: string) {
    if (bookID) cache.delete(bookID);
    else cache.clear();
}
