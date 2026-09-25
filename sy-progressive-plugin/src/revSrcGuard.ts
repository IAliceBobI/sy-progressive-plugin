// 源可达性判定（650189 09-23 帖 → need-0925-02 收编）：v3.25.0 落的复习界面
// 「来源不可达」提示长条（prog-revsrc-bar +「跳过/移除背诵卡」两钮）已按鸟反馈撤除
// ——与「源关着照常评分过掉」用法不符。两钮不补替（官方等价物口径：跳过=评分行 💤
// button[data-type="-3"]，摘卡=复习界面顶栏 ⋯ 菜单「移除闪卡」openCard.ts
// removeRiffCard）；内核原生 toast「请打开笔记本 X 后再试」拦不掉、撤条后照弹=已知
// 残留。本模块只剩 srcReachOf 判定，供来源胶囊 hover 小字提示复用（digestMarker
// markDigestTag 消费）——胶囊挂点在官方复习界面文档卡标题区同样成立（render.title:
// true），同一条渲染链，日常打开摘抄文档与复习界面同权显示，不做场景判别。
// 判定两态都算不可达（6807 造数实锤：刚关的笔记本 blocktree 未清，getBlockInfo
// 照常 code 0 返回；内核空闲清理已关笔记本块树后才 -1。用户截图的 -1=清理后的
// 硬失败，软失败态必须查 box 是否已关闭才判得出）：
// ① getBlockInfo null（blocktree 已清/已删）→ "gone"；
// ② box 在已关闭笔记本列表 → "closed"；可达 → "ok"（title=来源文档名）。
import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";

export type SrcReach =
    | { reason: "ok"; title: string }
    | { reason: "closed" }
    | { reason: "gone" };

/** 摘抄来源可达性（原 srcUnreachable 布尔判定升三态收编，判定逻辑原样） */
export async function srcReachOf(parentID: string): Promise<SrcReach> {
    const info = await siyuan.getBlockInfo(parentID).catch(() => null);
    if (!info?.box) return { reason: "gone" };
    const nbs = await siyuan.call("/api/notebook/lsNotebooks", {}) as any;
    const box = String(info.box);
    if ((nbs?.notebooks ?? []).some((n: any) => n.id === box && !!n.closed)) return { reason: "closed" };
    return { reason: "ok", title: String(info.rootTitle ?? "") };
}
