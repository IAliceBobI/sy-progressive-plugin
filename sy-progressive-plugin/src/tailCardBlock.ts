// □2（3.8.3 升级战役）渐进片尾收束卡——纯函数层。
// 设计拍板（handoff 2026-09-07-1941 □2 分叉记录，09-08 用户逐项拍板）：
// - 形态=片尾收束卡（custom 块，纯动作零输入零存储）；片/digest 两 kind 分支；
// - 片级动作上卡（翻片族/重插/清理原文/回看/原书/换书/加书+胶囊加菜），选中类不上卡
//   （摘抄/制卡族/多行/移片/收集——归宿=快捷键+浮条，浮条不退役）；
// - digest 尾卡=同类一期：动作全文档级（送仿写/回原书/路线图/汇总/再摘抄）；
// - 卡只落渐进生产的文档（片/摘抄），永不碰用户原文档；新摘抄建时带卡，
//   存量摘抄打开时幂等补插（doc IAL custom-prog-tail 防重插/防删后复活）；
// - 重分片存活=跟片死（纯动作卡无内容损失）；新片 createPiece→fullfilContent 尾插带卡；
// - 写作书片尾卡一期不做（fullfilContent 挂点带 writing 守卫）；
// - 片闪卡概念出清不做；唯一防御守卫=闪卡预览宿主（card__block）同源渲染时隐动作钮。
// 内核契约（exp/apirenew-report.md）：content 含纯 ;;; 行拒写（isCustomBlockContentValid）——
// JSON.stringify 单行天然满足；旧内核无 customBlockRenders→不建卡不注册（<pre> 降级不触发）。

export const TAIL_CARD_BLOCK_TYPE = "tail-card";
export const TAIL_CARD_FENCE = ";;;sy-progressive-plugin/tail-card";
/** 宿主文档 IAL：置位=已带卡（幂等判据；用户手删卡后不复活——flag 在卡不在，跳过补插） */
export const TAIL_CARD_DOC_FLAG = "custom-prog-tail";

// 注册态存纯函数层（渲染器注册时置位）：建卡通道（tailCardAppend）在轻量模块里判支持，
// 不 import 渲染器——渲染器带 .svelte 依赖，helper.ts（fastCopyBlock 等单测的 import 链）
// 不得转译到 .svelte（vitest 无 svelte 插件，2026-09-08 e2e 前全量单测实锤）。
let registered = false;
export function markTailCardRegistered(v: boolean): void {
    registered = v;
}
export function isTailCardRegistered(): boolean {
    return registered;
}

export interface TailCardBlockData {
    v: 1;
    kind: "piece" | "digest";
    /** 源书 ID（动作对象：翻片/原书/换书/附属卡/汇总/路线图） */
    bookID: string;
    /** 片号（kind=piece；digest 恒 0） */
    point: number;
    /** 宿主文档 ID（翻片/删片的 noteID；digest 回原书的四级链锚） */
    docID: string;
}

export function buildTailCardContent(data: TailCardBlockData): string {
    const clean: TailCardBlockData = {
        v: 1,
        kind: data.kind === "digest" ? "digest" : "piece",
        bookID: typeof data.bookID === "string" ? data.bookID : "",
        point: typeof data.point === "number" && Number.isFinite(data.point) ? data.point : 0,
        docID: typeof data.docID === "string" ? data.docID : "",
    };
    return JSON.stringify(clean);
}

export function buildTailCardBlockMD(content: string): string {
    return `${TAIL_CARD_FENCE}\n${content}`;
}

/** 容错解析：坏 JSON/版本不符/字段缺失 → null（渲染层显占位）；脏数据洗默认 */
export function parseTailCardContent(content: string): TailCardBlockData | null {
    let raw: unknown;
    try {
        raw = JSON.parse(content);
    } catch {
        return null;
    }
    if (typeof raw !== "object" || raw === null) return null;
    const o = raw as Record<string, unknown>;
    if (o.v !== 1) return null;
    if (o.kind !== "piece" && o.kind !== "digest") return null;
    if (typeof o.bookID !== "string" || typeof o.docID !== "string") return null;
    return {
        v: 1,
        kind: o.kind,
        bookID: o.bookID,
        point: typeof o.point === "number" && Number.isFinite(o.point) ? o.point : 0,
        docID: o.docID,
    };
}
