// □2 物理分卷编排：建卷（markdown 复制）→ 清空原文档正文 → 复核。写序=先建后清——
// 中断窗口=半成品卷+原文完好（内容零丢失），重跑守卫在 Dialog（D 已有子文档禁确认）。
// deps 注入（volRebuild.ts 同款模式）：纯编排可单测；生产实现 splitVolsDeps()。
// 「原文进回收站」的实测修正：思源无回收站（RemoveDoc=history 拷贝+物理删），通道定为
// 卷挂原文档下+正文清空（块级历史可恢复）——原文档转世书壳，补切（已注册书）零迁移。
import { volDocTitle, volDocMarkdown } from "./splitVols";
import type { VolPlan } from "./splitVols";
import { MarkKey } from "../../sy-tomato-plugin/src/libs/gconst";

export interface SplitVolsDeps {
    getDocRow(id: string): Promise<{ box: string; path: string; hpath: string; content: string } | null>;
    createDocWithMd(notebook: string, hpath: string, md: string, attr?: Record<string, string>): Promise<string>;
    /** 文件树钉序（全量新序数组提交——新文档默认插顶，不钉则卷序颠倒） */
    sortDocs(notebook: string, paths: string[]): Promise<void>;
    removeDoc(id: string): Promise<void>;
    deleteBlocks(ids: string[]): Promise<void>;
    /** 复核读：清空后剩余**非空**子块数（删光后内核补一个空 p 块=自然形态不算残留）；
     *  API 失败返回 -1（调用方按未清空报错） */
    recheckChildBlocks(id: string): Promise<number>;
    log(msg: string): void;
}

/** 切分执行：plan=确认后的卷计划，blockIDs=枚举期原文档顶层块序（清空原料，markdown
 *  拼接的原料），blocksMd=原文全文（备份文档正文）。
 *  写序=先建卷后清空（中断窗口内容零丢失）；清空前先建「切分前备份」文档并删除——
 *  块删除事务的历史是 30 分钟批量生成的（generateHistoryInterval），且 API 事务不进
 *  前端 undo 栈；文档级删除历史即时生成——「原文可恢复」承诺由此即时成立。 */
export async function runSplitVols(bookID: string, plan: VolPlan[], blockIDs: string[], deps: SplitVolsDeps): Promise<string[]> {
    const row = await deps.getDocRow(bookID);
    if (!row?.box || !row?.hpath || !row?.path) throw new Error(`splitvols: doc row missing book=${bookID}`);
    const volIDs: string[] = [];
    for (let i = 0; i < plan.length; i++) {
        const name = volDocTitle(i, plan[i]);
        const id = await deps.createDocWithMd(row.box, `${row.hpath}/${name}`, volDocMarkdown(plan[i]));
        volIDs.push(id);
        deps.log(`vol created ${i + 1}/${plan.length} name=${name} id=${id}`);
    }
    // 新文档默认插顶部：按建卷序钉文件树序（读序=文件树序，颠倒=倒着读）
    const dir = row.path.endsWith(".sy") ? row.path.slice(0, -3) : row.path;
    await deps.sortDocs(row.box, volIDs.map(id => `${dir}/${id}.sy`));
    deps.log(`sort pinned vols=${volIDs.length}`);
    // 原文备份→立即删除=即时可恢复（-delete- 历史；备份带 MarkKey 挂书壳下不进卷枚举）
    const backupMd = plan.reduce((md, p) => md + (md ? "\n\n" : "") + volDocMarkdown(p), "");
    const backupID = await deps.createDocWithMd(
        row.box, `${row.hpath}/${row.content}·切分前备份`, backupMd, { [MarkKey]: "backup" });
    await deps.removeDoc(backupID);
    deps.log(`backup snapshotted+removed id=${backupID} chars=${backupMd.length}`);
    if (blockIDs.length > 0) {
        await deps.deleteBlocks(blockIDs);
        const remain = await deps.recheckChildBlocks(bookID);
        if (remain !== 0) throw new Error(`splitvols: recheck after delete failed, remain=${remain} book=${bookID}`);
    }
    deps.log(`done book=${bookID} vols=${volIDs.length} blocksCleared=${blockIDs.length}`);
    return volIDs;
}

// ============ 生产侧（真实 siyuan/storage） ============
import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";

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
