// □5 渐进协同（拍板 A）：「本书批注」分组数据层——从旧双键（键名即选区语义）切到
// tomato 属性模型 custom-tomato-annotations（JSON 数组，选区语义=条目有 sel）。
// 独立纯函数文件（digestList 先例）：零 UI/零 siyuan 依赖，单测直测（digestUtils
// import 链太重不可进单测）；判 sel 必须基于 parseAnnotations 净化后的条目——
// sel 脏值（非对象/缺 txt）被净化丢弃，直接读原始 JSON 会把坏数据翻成「选区」。
import { parseAnnotations } from "../../sy-tomato-plugin/src/libs/annotationsAttr";

/** 本书批注项（路线图浮层「本书批注」分组；锚定=原文块属性，渲染归 tomato 全局） */
export interface BookCommentItem {
    blockID: string;
    /** 原文块内容（列表行标题；截断在渲染层） */
    content: string;
    /** true=该块存在选区批注条目（净化后有 sel），false=纯块级批注 */
    range: boolean;
}

/** queryBookComments 的 SQL 行形态：{id: block_id, v: 属性值, c: 块内容} */
export interface BookCommentRow {
    id: string;
    v: string | null;
    c: string | null;
}

/** SQL 行 → 批注条目：一块一属性键天然无重复（Map 仅防御同块多行）；属性值净化后
 *  零有效条目（用户手改坏）则该块不出列表 */
export function bookCommentsFromRows(rows: BookCommentRow[] | null | undefined): BookCommentItem[] {
    const byBlock = new Map<string, BookCommentItem>();
    for (const r of rows ?? []) {
        if (r?.id == null || byBlock.has(r.id)) continue;
        const entries = parseAnnotations(r.v);
        if (entries.length === 0) continue;
        byBlock.set(r.id, { blockID: r.id, content: r.c ?? "", range: entries.some((e) => e.sel != null) });
    }
    return [...byBlock.values()];
}
