// □4 回访留言——落盘通道（visitNoteBlock 纯函数层的 siyuan 面拆出：libs/utils 顶层
// Lute.New 模块级求值，vitest 链 import 即炸 suite）。薄层仅一个函数。
import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import { buildVisitNoteBlockMD } from "./visitNoteBlock";

/** 对象文档尾部追加一条留言（多留言=多块追加）。渲染器未注册也落块（<pre> 降级内容
 *  仍在，注册后即渲染）——与 tail-card「不注册不建卡」取舍不同：留言是用户写的数据
 *  本体，宁可降级展示也不丢。返回块 id（appendBlock 响应 op.id），失败/空文本 null。
 *  响应形态=siyuan.call 已解包 json.data → 事务数组 [{doOperations}]（e2e 09-12 实锤；
 *  兼容对象形态防内核差异——读错=id 恒 null → 成功也走「失败留窗」分支+重按重复写块） */
export async function appendVisitNote(docID: string, text: string, ts = Date.now()): Promise<string | null> {
    if (!docID || !text.trim()) return null;
    const r = await siyuan.appendBlock(buildVisitNoteBlockMD(text.trim(), ts), docID);
    const tx = Array.isArray(r) ? r[0] : r;
    const id = (tx as any)?.doOperations?.[0]?.id ?? null;
    return id ? String(id) : null;
}
