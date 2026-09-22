// □2 删片子文档守卫（progfix0922）：v3.23.0 child 档曾把新摘抄挂片下（存量数据）+
// 用户手拖文档进片——删片四路径（Progressive.ts deleteAndExit/deleteAndSwap/
// deleteAndBack/deleteAndNext）removeDocByID 一发即删整棵子树=连坐删摘抄。
// 通道=父层磁盘直查读 subFileCount（matManualOps cleanupEmptyDigest 同款判据：
// 直列自身不可用——无子文档的档其目录物理不存在；SQL path-like 有单引号/索引窗/
// 拉取失败三向量绕过）。取向失败 fail-open：守卫是纵深防御（新摘抄已不再锚片下），
// 不该因瞬态故障废掉用户显式的删片动作——只拦「确证有子文档」。
import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import { fetchDocLayer } from "./writeTree";

export interface PieceGuardDeps {
    getBlockInfo: (id: string) => Promise<{ box?: string; path?: string } | null>;
    fetchLayer: (box: string, dirPath: string) => Promise<{ id: string; subFileCount: number }[] | null>;
}

const prodDeps: PieceGuardDeps = {
    getBlockInfo: (id) => siyuan.getBlockInfo(id),
    fetchLayer: (box, dirPath) => fetchDocLayer(box, dirPath),
};

/** 片下有物理子文档？（守卫为 true 时调用方应拦删并提示，勿 removeDocByID） */
export async function pieceHasChildDocs(docID: string, deps: PieceGuardDeps = prodDeps): Promise<boolean> {
    if (!docID) return false;
    const info = await deps.getBlockInfo(docID).catch(() => null);
    if (!info?.box || !info?.path) return false; // 取向失败=fail-open
    // path=BlockTree.Path 盒内路径（'/书id/片id.sy'，盒 id 不在其中——kernel getBlockInfo
    // 实测/源码同证；progfix0922 □11 e2e 实锤：按「带盒前缀」slice(1,-1) 会剥掉书段算出
    // 根层→查无此片→fail-open 恒放行=守卫失效）。剥自身段保留全部父段；片在根时落 "/"
    const segs = String(info.path).replace(/\.sy$/, "").split("/").filter(Boolean);
    const relParent = segs.slice(0, -1).join("/");
    const layer = await deps.fetchLayer(info.box, relParent ? `/${relParent}` : "/");
    if (layer == null) return false; // 父层拉取失败=fail-open
    const mine = layer.find(r => r.id === docID);
    return !!mine && mine.subFileCount > 0; // 瞬态不在父层=查无此行，不拦
}
