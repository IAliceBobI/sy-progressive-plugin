// v5 □16 摘抄工作流深化纯逻辑（handoff □16 拍板）：溯源降级链决策 + 片序号键 + 整摘内容过滤。
// 纯函数无 DOM/SiYuan 依赖；SiYuan API 侧在 Progressive.ts / digestUtils.ts 消费。
//
// 三层身份：读在片上、摘在 digest 上、源在书上——片=可抛弃可再生的工作台（自由读写，
// 删了可按大索引重切同样的片，2026-08-29 浮条 UX 重设计 □9 解锁退役「片=只读原料」）；
// digest=衍生物持久层；书=静态源永远在（ctime 含 bookID）。

import { TEMP_CONTENT } from "../../sy-tomato-plugin/src/libs/gconst";

/** digest 文档 IAL：片序号键（parent-id 锚片 ID 删后悬空，序号才可再生） */
export const PIECE_IDX_KEY = "custom-pdigest-piece-idx";

export function buildPieceIdx(bookID: string, point: number): string {
    return `${bookID}#${point}`;
}

export function parsePieceIdx(value: string | undefined | null): { bookID: string; point: number } | null {
    if (!value) return null;
    const i = value.lastIndexOf("#");
    if (i < 0) return null;
    const point = Number(value.slice(i + 1));
    const bookID = value.slice(0, i);
    if (!bookID || !Number.isInteger(point) || point < 0) return null;
    return { bookID, point };
}

/** 片 IAL custom-progmark 值（`${TEMP_CONTENT}#${bookID},${point}`）→ 片序号 */
export function piecePointFromMark(mark: string | undefined | null): number | null {
    if (!mark) return null;
    const i = mark.lastIndexOf(",");
    if (i < 0) return null;
    const point = Number(mark.slice(i + 1));
    if (!Number.isInteger(point) || point < 0) return null;
    return point;
}

export interface OriginTargetInput {
    /** 选中摘抄行的 custom-progref（书原文块 ID） */
    refID: string;
    refExists: boolean;
    /** digest 文档 IAL custom-pdigest-parent-id */
    parentID: string;
    parentExists: boolean;
    parentIsPiece: boolean;
    /** digest 文档 IAL custom-pdigest-piece-idx 值 */
    pieceIdx: string;
    /** ctime 解析出的书 ID（兜底） */
    bookID: string;
}

/** 摘抄归属链来源：mark=片 IAL、progref=块级反查（□29）、book=发起文档自身是注册书
 *  （□8 书态原文直接摘抄）、self=三链落空自指（札记摘抄/普通文档，落札记匣） */
export type DigestOriginFrom = "mark" | "progref" | "book" | "self";

/**
 * 摘抄发起文档 → 归属书判定链（digestUtils.init 消费，□11 从三段内联收拢为纯函数）：
 * ①mark（getBookID 解析片 IAL）②mark 落空的属性窗口期走 progref 反查（带回片序号）
 * ③发起文档自身是注册书。inBook=归属书须已注册——mark/反查给了 bookID 但书已删
 * （记录已清）时 inBook=false 落札记匣；三链全空自指 bookID=docID。
 * refHit 仅在 mark 落空时参与（与旧链一致）；isRegistered 由消费方注入
 * （progStorage.isRegisteredBook）。
 */
export function resolveDigestOrigin(args: {
    markBookID: string;
    refHit: { bookID: string; point: number } | null;
    docID: string;
    isRegistered: (id: string) => boolean;
}): { bookID: string; inBook: boolean; point: number | null; from: DigestOriginFrom } {
    const { markBookID, refHit, docID, isRegistered } = args;
    let bookID = markBookID ?? "";
    let point: number | null = null;
    let from: DigestOriginFrom = "mark";
    if (!bookID && refHit) {
        bookID = refHit.bookID;
        point = refHit.point;
        from = "progref";
    }
    if (!bookID && isRegistered(docID)) {
        bookID = docID;
        from = "book";
    }
    const inBook = !!bookID && isRegistered(bookID);
    if (!bookID) {
        bookID = docID;
        from = "self";
    }
    return { bookID, inBook, point, from };
}

export type OriginTarget =
    | { action: "ref"; id: string }
    | { action: "piece"; id: string }
    | { action: "rebuild"; bookID: string; point: number }
    | { action: "parentDoc"; id: string }
    | { action: "book"; id: string }
    | { action: "none" };

/**
 * 回原书智能链（形态一：单动作不加新按钮）：
 * ①块级 progref 存活 → 跳书原文块（最准永远第一优先）
 * ②parent 存活且是片 → 跳片；是任意文档 → 跳该文档
 * ③片已删 → 片序号键重切同片（静默重建 + toast「分片已重建」）
 * ④兜底跳书（ctime 含 bookID，书永远在）
 */
export function resolveOriginTarget(input: OriginTargetInput): OriginTarget {
    const { refID, refExists, parentID, parentExists, parentIsPiece, pieceIdx, bookID } = input;
    if (refID && refExists) return { action: "ref", id: refID };
    if (parentID && parentExists) {
        return parentIsPiece
            ? { action: "piece", id: parentID }
            : { action: "parentDoc", id: parentID };
    }
    const idx = parsePieceIdx(pieceIdx);
    if (idx) return { action: "rebuild", bookID: idx.bookID, point: idx.point };
    if (bookID) return { action: "book", id: bookID };
    return { action: "none" };
}

/** 摘抄内容过滤：移除空串、纯空白、仅含属性行（如 `{: id="xxx" }`）的条目（digest()/digestWhole() 共用） */
export function validDigestMd(md: string[]): string[] {
    return md.filter(m => {
        if (!m || !m.trim()) return false;
        const lines = m.trim().split("\n").filter(line => line.trim());
        if (lines.length === 0) return false;
        if (lines.length === 1 && lines[0].startsWith("{:")) return false;
        return true;
    });
}

/** TEMP_CONTENT re-export（消费方拼片 IAL 用，防各处裸抄魔法串） */
export { TEMP_CONTENT };
