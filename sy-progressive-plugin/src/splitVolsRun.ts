// 纯逻辑核（runSplitVols+SplitVolsDeps）已迁 splitCore.ts（kernel 共用单一事实源）；
// 本文件=re-export 壳 + 前端生产侧 deps（真实 siyuan/storage）。行为锁定=tests/unit/splitVolsRun.test.ts。
export { runSplitVols } from "./splitCore";
export type { SplitVolsDeps } from "./splitCore";
import type { SplitVolsDeps } from "./splitCore";

// ============ 生产侧（真实 siyuan/storage） ============
import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
import { listDocsByPathQuiet } from "./listDocsQuiet";

export function splitVolsDeps() {
    return {
        getDocRow: async (id: string) => {
            const row = await siyuan.sqlOne(
                `select box, path, hpath, content from blocks where type='d' and id='${id}'`);
            if (!row) return null;
            return {
                box: String(row.box ?? ""), path: String(row.path ?? ""),
                hpath: String(row.hpath ?? ""), content: String(row.content ?? ""),
            };
        },
        listDocIDs: async (notebook: string, dir: string) => {
            // 磁盘真相通道：code=-1（空/不存在目录）=files:[] → 不含卷 id=落点失配拦下；
            // 其余失败 null=同失配（□1 卷落点校验契约，语义见 splitCore）
            const resp = await listDocsByPathQuiet(notebook, dir, { maxListCount: 0, ignoreMaxListHint: true });
            if (!resp) return null;
            return (resp.files ?? []).map(f => String(f?.id ?? ""));
        },
        createDocWithMd: (notebook: string, hpath: string, md: string, attr?: Record<string, string>) =>
            siyuan.createDocWithMd(notebook, hpath, md, "", attr as any),
        sortDocs: async (notebook: string, paths: string[]) => {
            await siyuan.call("/api/filetree/changeSort", { notebook, paths });
        },
        removeDoc: async (id: string) => {
            await siyuan.removeDocByIDSiyuan(id);
        },
        deleteBlocks: async (ids: string[]) => {
            await siyuan.transactions(siyuan.transDeleteBlocks(ids));
        },
        recheckChildBlocks: async (id: string) => {
            // null/undefined=API 失败≠空文档（siyuan.call 两态吞错），-1 保守报错。
            // 滤空口径同 childBlocksToVolBlocks：删光后内核补的空 p 块不算残留
            const children = await siyuan.getChildBlocks(id);
            if (children == null) return -1;
            return children.filter(c => c.markdown || c.content).length;
        },
        log: (msg: string) => debugLog("splitvols", msg, "progressive"),
    } satisfies SplitVolsDeps;
}
