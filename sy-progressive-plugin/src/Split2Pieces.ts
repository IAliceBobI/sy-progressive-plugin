import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import {
    buildContentFrom, computePieceIndexCore, buildVolsContent, computePieceIndexVolsCore,
    HeadingGroup as HeadingGroupBase,
    type VolsContent,
} from "./splitCore";
import type { ChildBlockRow } from "./childBlocks";

// 纯逻辑核已迁 splitCore.ts（kernel 共用单一事实源）；本文件=前端 IO 壳：
// 注入 siyuan 通道 + re-export 保持旧 import 路径有效。行为锁定=tests/unit/split2pieces.test.ts。
export { ContentLenGroup, computePieceIndexVolsCore } from "./splitCore";
export type { VolSpan, VolsContent } from "./splitCore";

/** 前端版 HeadingGroup：默认注入 siyuan.sql（旧构造签名不变——"b" 档直接可用；
 *  kernel 侧用 splitCore 版显式注入 HTTP 通道） */
export class HeadingGroup extends HeadingGroupBase {
    constructor(wordCount: WordCountType[], headings: string[], bookID: string) {
        super(wordCount, headings, bookID, stmt => siyuan.sql(stmt));
    }
}

// 步骤 1：取书的块 + 算 WordCountType（数据源=getChildBlocks 单发，口径注释在 splitCore）。
export async function buildContentBlocks(bookID: string): Promise<{ blocks: WordCountType[], textLen: number, rawCount: number }> {
    return buildContentFrom(bookID, id => siyuan.getChildBlocks(id) as Promise<ChildBlockRow[]>);
}

// 步骤 2：计算分片索引（"b" 档注入 siyuan.sql——B 标记 SQL 分支持续可用）。
export async function computePieceIndex(
    contentBlocks: WordCountType[],
    headings: string[],
    bookID: string,
    splitWordNum: number,
): Promise<WordCountType[][]> {
    return computePieceIndexCore(contentBlocks, headings, bookID, splitWordNum, stmt => siyuan.sql(stmt));
}

// ============ □1 目录成书：多卷枚举 + 逐卷切窗 + 卷序通道（IO 壳） ============

export async function buildContentBlocksVols(volIDs: string[]): Promise<VolsContent> {
    return buildVolsContent(volIDs, id => siyuan.getChildBlocks(id) as Promise<ChildBlockRow[]>);
}

export async function computePieceIndexVols(
    content: VolsContent, headings: string[], splitWordNum: number,
): Promise<{ groups: WordCountType[][]; perVol: number[] }> {
    return computePieceIndexVolsCore(content, headings, splitWordNum, stmt => siyuan.sql(stmt));
}

import { progStorage } from "./ProgressiveStorage";
import { createPiece } from "./helper";
import { MarkKey } from "../../sy-tomato-plugin/src/libs/gconst";

// 端到端编排：给定书 + point，跑完整分片流程，返回 noteID。
// 供 window.prog_zZmqus5PtYRi.split.runSplit 调用，让 agent-browser 能逐步调试验证 bug
//（通道默认关闭，localStorage PROG_DEBUG=1 显式开启，门禁在 index.ts）。
// 保守策略：只用已保存索引（loadBookIndexIfNeeded）；索引为空时抛错而非静默返回空，
// 让外部调用方能明确区分"索引未就绪"和"createPiece 失败"。
export async function runSplit(bookID: string, point: number, bookName?: string): Promise<string> {
    void bookName; // 预留参数（未来索引重算路径会用），当前保守路径只用已保存索引。
    const index = await progStorage.loadBookIndexIfNeeded(bookID);
    if (index.length === 0) {
        throw new Error(`runSplit: book ${bookID} index empty (not ready or not split yet)`);
    }
    const info = await progStorage.booksInfo(bookID);
    return createPiece(info, index, point);
}

/** 书壳的直接子文档 id 序（文件树生效序=读序；一层目录语义，孙文档不进书）。
 *  listDocsByPath 走磁盘真相（未索引文档也在）；maxListCount:0=MaxInt 防 100+ 篇
 *  截断。MarkKey 过滤=片/备份等内部文档不进卷池（getRows 第二参 false=仅存列过滤）。
 *  缺席=新卷拾取推迟一轮（无损坏，索引追上下轮 sameOrder 失配触发重组补挂）；
 *  反向窗口同族：刚建的内部夹（cards-/digest-）ial 列索引未追上被放行误当卷一轮，
 *  下轮 sameOrder 失配重组剔除，自愈无实害（□29 实测 ial 进 SQL 有 24s+ 窗口）。 */
export async function listVolIDs(bookID: string): Promise<string[]> {
    const row = await siyuan.sqlOne(`select box,path from blocks where type='d' and id='${bookID}'`);
    if (!row?.box || !row?.path) return [];
    const dir = row.path.endsWith(".sy") ? row.path.slice(0, -3) : row.path;
    const r = await siyuan.call("/api/filetree/listDocsByPath", {
        notebook: row.box, path: dir, sort: 15, maxListCount: 0, ignoreMaxListHint: true,
    });
    const ids = (((r as any)?.files ?? []).map((f: any) => f?.id).filter(Boolean)) as string[];
    if (ids.length === 0) return [];
    const rows = await siyuan.getRows(ids, "id", false,
        [`(ial is null or ial = '' or ial not like '%${MarkKey}%')`]);
    const external = new Set(rows.map(r => r.id));
    return ids.filter(id => external.has(id));
}
