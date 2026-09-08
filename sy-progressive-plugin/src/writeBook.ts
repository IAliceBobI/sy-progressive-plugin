// 期1 写作书建书链：IO 接线。纯函数在 outline.ts（parseOutlineLines/planWritingPieces，
// TDD 锁行为）；本文件走内核 API，行为由 dev 实例手验/e2e 覆盖。
// 设计共识：写作书=渐进阅读的姊妹形态（素材排列相位）——书=普通文档、片全复用
// custom-progmark 身份体系、索引恒空（运行时按 MarkKey SQL 拉片列表）、零数据迁移。
import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import { MarkBookKey, MarkKey, PROG_DONE_KEY, TEMP_CONTENT } from "../../sy-tomato-plugin/src/libs/gconst";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
import { ProgressiveStorage, progStorage } from "./ProgressiveStorage";
import { parseOutlineLines, planWritingPieces } from "./outline";
import { pieceDocName, pieceAlias, getDocIalPieces } from "./progData";

export interface WritingBookResult {
    bookID: string;
    pieceIDs: string[];
}

/** 路径占位检查：createDocWithMd 内置 getIDsByHPath 兜底会把同名已有文档静默
 *  认领（返回旧 id）——重名建书=劫持用户普通文档挂书 IAL，故一切创建前显式预检。
 *  ⚠ 端点大小写敏感：getIDsByHPath（P 大写，kernel/api/router.go:188；小写 p=404 静默空） */
async function docIDAtPath(boxID: string, path: string): Promise<string> {
    const ids = await siyuan.call("/api/filetree/getIDsByHPath", { notebook: boxID, path });
    return Array.isArray(ids) ? (ids[0] ?? "") : "";
}

// ============ 期2 调度判定（纯函数，TDD 见 tests/unit/writingBook.test.ts） ============

/** 写作书片（槽位）运行时状态：point 序号 + 文档 id + 定稿位 */
export interface WritingPieceState {
    point: number;
    docID: string;
    done: boolean;
}

/** MarkKey attributes 查询行 → 本书片状态列表（point 升序）。
 *  只认 `TEMP#bookID,point` 前缀（书本身=book#TEMP、外书片天然排除）；乱值静默剔除 */
export function parseWritingPieceRows(
    rows: { block_id: string; value: string; done?: string | null }[],
    bookID: string,
): WritingPieceState[] {
    const prefix = `${TEMP_CONTENT}#${bookID},`;
    const out: WritingPieceState[] = [];
    for (const r of rows ?? []) {
        if (!r?.value?.startsWith(prefix)) continue;
        const point = Number(r.value.slice(prefix.length));
        if (!Number.isInteger(point) || point < 0) continue;
        out.push({ point, docID: r.block_id, done: r.done === "1" });
    }
    return out.sort((a, b) => a.point - b.point);
}

/** 轮到=开哪片：activePoint 命中未定稿片开它（续转指针）；指向已定稿/越界/未设
 *  → 首个未定稿片；空列表/全定稿 → null（调用方提示建槽或书已完稿） */
export function pickWritingTarget(
    pieces: WritingPieceState[],
    activePoint?: number,
): { docID: string; point: number } | null {
    const open = pieces.filter(p => !p.done);
    if (open.length === 0) return null;
    const hit = activePoint != null ? open.find(p => p.point === activePoint) : undefined;
    const t = hit ?? open[0];
    return { docID: t.docID, point: t.point };
}

/** 滚筒 finished 判定：全片定稿=退役。空片列表不算完（0 槽书要提示建槽，
 *  不能被 unreadable 集合误伤）——与阅读书 isFinished(point>=len) 语义分家 */
export function isWritingFinished(pieces: WritingPieceState[]): boolean {
    return pieces.length > 0 && pieces.every(p => p.done);
}

/** 运行时拉写作书片列表（MarkKey+PROG_DONE_KEY 双 attributes join，显式 limit
 *  防内核 64 截尾）。索引恒空的设计共识在此兑现：不维护预存索引 */
export async function fetchWritingPieces(bookID: string): Promise<WritingPieceState[]> {
    const rows = await siyuan.sql(
        `select a.block_id, a.value, b.value as done from attributes a` +
        ` left join attributes b on b.block_id = a.block_id and b.name = '${PROG_DONE_KEY}'` +
        ` where a.name = '${MarkKey}' and a.value like '${TEMP_CONTENT}#${bookID},%' limit 10000000`) as any[];
    return parseWritingPieceRows(rows ?? [], bookID);
}

// ============ 期3 素材入槽（拉式/推式共用核心；TDD 见 tests/unit/writingBook.test.ts） ============

/** 素材血缘键（值=来源文档ID#锚块ID——摘抄转实锚摘抄文档、直接入槽锚原文档；
 *  渲染徽标跳回出处用它） */
export const MATERIAL_KEY = "custom-prog-material";

/** 块引用静态形态：((id "text")) / ((id "text" "title"))——转实取锚文本 */
const BLOCK_REF_RE = /\(\([0-9]{14}-[a-z0-9]+ "(?:[^"\\]|\\.)*"(?: "[^"]*")?\)\)/g;

/** 素材副本 kramdown 净化（纯函数）：块引用转实静态文本（设计共识——素材必须是
 *  普通块静态内容）；剥 id/updated/riff-decks（副本身份重生成）与 custom-progref
 *  （素材不挂 progref——片级「回原书」链拿片内 progref 跳原书，挂了会污染；素材的
 *  回原走 material 键跳摘抄）；注入 material 血缘；IAL 空壳整行回收 */
export function materializeKramdown(kramdown: string, materialValue: string): string {
    const lines = kramdown.split("\n");
    let attrs = lines.pop() ?? "";
    if (!attrs.trimStart().startsWith("{:")) {
        // 无 IAL 行（kramdown 块理论恒有，防御倒挂）：原样拼回
        lines.push(attrs);
        attrs = "";
    }
    const body = lines.join("\n").replace(BLOCK_REF_RE, (m) => {
        const texts = [...m.matchAll(/"((?:[^"\\]|\\.)*)"/g)];
        return (texts[0]?.[1] ?? "").replaceAll('\\"', '"');
    });
    const kept = attrs
        .replace(/(?:id|updated|custom-riff-decks|custom-progref)="[^"]*"/g, "")
        .replace(/^\s*\{:/, "")
        .replace(/\}\s*$/, "")
        .trim();
    return `${body}\n{: ${kept ? `${kept} ` : ""}${MATERIAL_KEY}="${materialValue}"}`;
}

/** 把来源文档内一锚块转实入槽尾（期3 拉式选择器/推式浮条/直送共用；来源=摘抄文档
 *  或任意原文档——血缘值=来源doc#锚块）。尾插：片有尾块走 previousID（parentID 是
 *  头插——kernel doInsert0 语义）；片空走 parentID（头尾等价）。返回新块 id；
 *  锚块失效抛错由调用方 toast */
export async function insertMaterialToPiece(pieceDocID: string, sourceDocID: string, anchorBlockID: string): Promise<string> {
    const { kramdown } = await siyuan.getBlockKramdown(anchorBlockID);
    if (!kramdown?.trim()) throw new Error("insertMaterial: anchor kramdown empty");
    const md = materializeKramdown(kramdown, `${sourceDocID}#${anchorBlockID}`);
    const children = (await siyuan.getChildBlocks(pieceDocID)) ?? [];
    const tail = children.at(-1);
    const resp = tail
        ? await siyuan.call("/api/block/insertBlock", { data: md, dataType: "markdown", previousID: tail.id })
        : await siyuan.insertBlockAsChildOf(md, pieceDocID);
    const newID = ((resp as any[])?.[0])?.doOperations?.[0]?.id ?? "";
    if (!newID) throw new Error("insertMaterial: no new block id");
    return newID;
}

/** 入槽成功后标记片活跃（activePoint 跟随——入槽=活跃，与移片/拆分写点同语义） */
async function markPieceActive(pieceDocID: string, bookID: string) {
    const point = (await fetchWritingPieces(bookID)).find(p => p.docID === pieceDocID)?.point;
    if (point != null) await progStorage.setActivePoint(bookID, point);
}

/** 整条摘抄入槽（拉式选择器/推式菜单共用聚合）：逐块转实尾插，单块失败续插不中断；
 *  摘抄文档内核自带的空段落跳过（勿入槽成噪音）；成功≥1 块即写 activePoint（入槽=活跃）。
 *  返回入块数 */
export async function insertDigestIntoPiece(pieceDocID: string, bookID: string, digestDocID: string): Promise<number> {
    const children = ((await siyuan.getChildBlocks(digestDocID)) ?? [])
        .filter(c => (c.content ?? "").trim() !== "" || c.type !== "p");
    let n = 0;
    for (const c of children) {
        try {
            await insertMaterialToPiece(pieceDocID, digestDocID, c.id);
            n++;
        } catch (e) {
            console.error("insertDigestIntoPiece block failed", c.id, e);
        }
    }
    if (n > 0) await markPieceActive(pieceDocID, bookID);
    return n;
}

/** 直接入槽：任意原文档的选中块转实尾插进槽（不经摘抄池、不建摘抄本体——素材即
 *  普通文本无卡语义；血缘=源doc#块ID，徽标点击跳回原文出处）。逐块转实尾插，
 *  单块失败续插不中断；成功≥1 块写 activePoint。返回入块数 */
export async function insertBlocksIntoPiece(pieceDocID: string, bookID: string, sourceDocID: string, blockIDs: string[]): Promise<number> {
    let n = 0;
    for (const id of blockIDs) {
        try {
            await insertMaterialToPiece(pieceDocID, sourceDocID, id);
            n++;
        } catch (e) {
            console.error("insertBlocksIntoPiece block failed", id, e);
        }
    }
    if (n > 0) await markPieceActive(pieceDocID, bookID);
    return n;
}

/** 推式「入槽」菜单数据：writing 且未完稿的书（最近活跃在前）+ 各书未定稿槽
 *  （槽名=片文档 content，含 [N] 序号前缀恰好可用） */
export interface WritingSlotTarget {
    bookID: string;
    name: string;
    slots: { point: number; docID: string; title: string }[];
    lastActive: number;
}

export async function listWritingSlotTargets(): Promise<WritingSlotTarget[]> {
    const infos = progStorage.booksInfos();
    const entries = Object.entries(infos).filter(([id, info]) =>
        info.writing && !info.ignored && !info.archived && progStorage.isRegisteredBook(id));
    if (entries.length === 0) return [];
    const out: WritingSlotTarget[] = [];
    for (const [bookID, info] of entries) {
        const pieces = await fetchWritingPieces(bookID);
        if (isWritingFinished(pieces)) continue; // 完稿书不列（无槽可入）
        const open = pieces.filter(p => !p.done);
        const rows = await siyuan.sql(
            `select id, content from blocks where type='d' and id in (${open.map(p => `'${p.docID}'`).join(",")}) limit 10000000`) as any[] ?? [];
        const titleMap = new Map(rows.map(r => [r.id, r.content ?? ""]));
        out.push({
            bookID,
            name: info.bookName || bookID,
            slots: open.map(p => ({ point: p.point, docID: p.docID, title: titleMap.get(p.docID) || `[${p.point}]` })),
            lastActive: info.time ?? 0,
        });
    }
    out.sort((a, b) => b.lastActive - a.lastActive);
    return out;
}

// ============ 期4 片管理：拆分重排纯函数（TDD 见 tests/unit/writingBook.test.ts） ============

/** 片名 [NNNNN]槽名 → 槽名（无前缀原样返回；用户手改过片名也容错） */
export function slotNameFromTitle(title: string): string {
    return title.replace(/^\[\d+\]/, "");
}

/** 拆分重排计划项：point 后移一位的片（MarkKey 改值+片名序号换，槽名不变）。
 *  fromTitle 供失败回滚（reasoning P1-1：移位循环半途失败逆序恢复原名+原值） */
export interface PieceShiftItem {
    docID: string;
    fromPoint: number;
    toPoint: number;
    mark: string;
    title: string;
    fromTitle: string;
}

/** 在 afterPoint 后插入新片 → 原 point>afterPoint 的片整体 +1。输出从大到小排：
 *  执行序先移大 point——内核 renameDoc 不拒绝同名（file.go renameDoc0），但从大到小
 *  逐格腾挪保 hpath 中间态唯一，docIDAtPath 预检与文件树 UI 不被瞬时重名误伤 */
export function planPieceShiftForInsert(
    pieces: { point: number; docID: string; title: string }[],
    afterPoint: number,
    bookID: string,
): PieceShiftItem[] {
    return pieces
        .filter(p => p.point > afterPoint)
        .sort((a, b) => b.point - a.point)
        .map(p => ({
            docID: p.docID,
            fromPoint: p.point,
            toPoint: p.point + 1,
            mark: getDocIalPieces(bookID, p.point + 1),
            title: pieceDocName(p.point + 1, slotNameFromTitle(p.title)),
            fromTitle: p.title,
        }));
}

/** 拆分后 activePoint 迁移（reasoning P2-2 定夺=跟随视点）：指向拆分点之后的片
 *  → +1（旧 point 跟随重排）；当前片/之前的片 → 新片（拆完 jumpTo 已把用户视点
 *  跳进新片，续转指针跟用户活跃片，与入槽/移片写点同语义） */
export function shiftActivePointForInsert(activePoint: number, afterPoint: number): number {
    return activePoint > afterPoint ? activePoint + 1 : afterPoint + 1;
}

/** 删 removedPoint 槽 → 原 point>removedPoint 的片整体 -1。输出从小到大排（与插入
 *  的从大到小相反）：被删位已腾空，从小到大逐格落位每步目标皆空，hpath 中间态
 *  唯一性同样成立 */
export function planPieceShiftForRemove(
    pieces: { point: number; docID: string; title: string }[],
    removedPoint: number,
    bookID: string,
): PieceShiftItem[] {
    return pieces
        .filter(p => p.point > removedPoint)
        .sort((a, b) => a.point - b.point)
        .map(p => ({
            docID: p.docID,
            fromPoint: p.point,
            toPoint: p.point - 1,
            mark: getDocIalPieces(bookID, p.point - 1),
            title: pieceDocName(p.point - 1, slotNameFromTitle(p.title)),
            fromTitle: p.title,
        }));
}

/** 删槽后 activePoint 迁移：>removedPoint → -1 跟随重排；==removedPoint → keptPoint
 *  （向上并=视点所在槽被删，视点跳保留槽；向下并视点本就在保留槽，keptPoint 与
 *  -1 结果同值）；<removedPoint → 不变 */
export function shiftActivePointForRemove(activePoint: number, removedPoint: number, keptPoint: number): number {
    if (activePoint > removedPoint) return activePoint - 1;
    if (activePoint === removedPoint) return keptPoint;
    return activePoint;
}

// ============ 期4 片管理：IO 接线 ============

/** 定稿/解除（可逆）：定稿件调度跳过、进度计数；解除=删属性回队
 *  （setBlockAttrs 空串=删属性，期2 已验）。空属性值有 SQL 索引延迟窗口，
 *  调度侧 fetchWritingPieces 走 attributes join 同延迟，自洽 */
export async function setPieceDoneState(pieceDocID: string, done: boolean) {
    await siyuan.setBlockAttrs(pieceDocID, { [PROG_DONE_KEY]: done ? "1" : "" } as any);
}

/** 拆为新片：selectedIDs 块移入新片（point=当前片+1），后续片整体后移。
 *  顺序（reasoning P1-1 加固）：① 全部只读预检前置（书/落点/同名/重复 point——
 *  最可能的失败点在改数据前消灭）→ ② 旧片移位（从大到小 rename+MarkKey 改值，
 *  半途失败逆序回滚后 rethrow，重试拿到干净现场）→ ③ 建新片（终名直接落）→
 *  ④ 搬块 → ⑤ activePoint 迁移（跟视点=新片/后片跟随重排）。
 *  返回新片 docID；失败抛错由调用方 toast */
export async function splitPieceAsNew(
    bookID: string,
    pieceDocID: string,
    selectedIDs: string[],
    slotNameRaw: string,
): Promise<string> {
    const slotName = parseOutlineLines(slotNameRaw)[0] ?? "";
    if (!slotName) throw new Error("splitPiece: empty slot name");
    if (selectedIDs.length === 0) throw new Error("splitPiece: no blocks selected");

    // ① 只读预检（全部不依赖移位结果，先行；失败零副作用）
    const pieces = await fetchWritingPieces(bookID);
    const seen = new Set<number>();
    for (const p of pieces) {
        if (seen.has(p.point)) throw new Error("splitPiece: duplicate piece point");
        seen.add(p.point);
    }
    const cur = pieces.find(p => p.docID === pieceDocID);
    if (!cur) throw new Error("splitPiece: piece not in book");
    const info = await progStorage.booksInfo(bookID);
    const bookRow = await siyuan.sqlOne(`select box, hpath from blocks where type='d' and id='${bookID}'`);
    if (!bookRow?.box || !bookRow?.hpath) throw new Error("splitPiece: book not found");
    const newPoint = cur.point + 1;
    const title = pieceDocName(newPoint, slotName);
    const path = `${bookRow.hpath}/${title}`;
    if (await docIDAtPath(bookRow.box, path)) throw new Error("splitPiece: piece name conflict");

    // ② 旧片移位（从大到小）+ 失败回滚（逆序恢复原名+原 MarkKey；回滚自身失败不
    // 掩盖原错误，console 留痕——数据仍可自愈：重算 plan 再拆一次即收敛）
    const rows = await siyuan.sql(
        `select id, content from blocks where type='d' and id in (${pieces.map(p => `'${p.docID}'`).join(",")}) limit 10000000`) as any[] ?? [];
    const titleMap = new Map(rows.map(r => [r.id, r.content ?? ""]));
    const plan = planPieceShiftForInsert(
        pieces.map(p => ({ point: p.point, docID: p.docID, title: titleMap.get(p.docID) ?? "" })),
        cur.point, bookID,
    );
    const doneShifts: PieceShiftItem[] = [];
    let newDocID = "";
    try {
        for (const it of plan) {
            await siyuan.renameDocByID(it.docID, it.title);
            await siyuan.setBlockAttrs(it.docID, { [MarkKey]: it.mark } as any);
            doneShifts.push(it);
        }
        // ③ 建新片也在 try 内（reasoning 复评：建片失败回滚完全干净——此刻无新片
        // 无搬块；只把 ③ 包进来，④ 搬块若也入 try，回滚后旧片与新片会短暂同
        // MarkKey=身份腐坏，故 ④⑤ 必须留在 try 外）
        const attrs = {
            "custom-card-priority": "50",
            [MarkKey]: getDocIalPieces(bookID, newPoint),
            alias: pieceAlias(info.bookName || "", slotName),
        } as AttrType;
        newDocID = await siyuan.createDocWithMd(bookRow.box, path, "", "", attrs);
        if (!newDocID) throw new Error("splitPiece: piece doc not created");
    } catch (e) {
        for (const it of doneShifts.reverse()) {
            try {
                await siyuan.renameDocByID(it.docID, it.fromTitle);
                await siyuan.setBlockAttrs(it.docID, { [MarkKey]: getDocIalPieces(bookID, it.fromPoint) } as any);
            } catch (rollbackErr) {
                console.error("splitPiece rollback failed", it.docID, rollbackErr);
            }
        }
        throw e;
    }

    // ④ 搬块 ⑤ activePoint 迁移（try 外：失败态自洽——片已顺延+新片在位只是块
    // 没搬，用户「移到下一分片」可补；同名重试被预检拦住不扩散）
    await siyuan.moveBlocksAsChild(selectedIDs, newDocID);
    const curPoint = (await progStorage.booksInfo(bookID)).activePoint ?? 0;
    await progStorage.setActivePoint(bookID, shiftActivePointForInsert(curPoint, cur.point));
    return newDocID;
}

/** 与邻槽合并（dir=-1「与上一槽」=当前槽内容上移、当前槽被删；dir=+1「与下一槽」
 *  =吸收下一槽内容、下一槽被删）。保留槽名，被删槽名丢弃（在意可先改名）。
 *  顺序（风险重心=删文档不可逆，故删后置+删前空校验）：
 *  ① 只读预检（书/两槽在册、邻槽存在、无重复 point——镜像 splitPiece ① 的
 *    前置消灭失败点思路）→ ② 定稿双向拦（PieceMovingBox 语义：保留槽已定稿=
 *    不可移入；被删槽已定稿=不可移出。错误 message 约定 "kept done"/"removed done"
 *    供调用方映射 i18n）→ ③ 搬块（被删槽全部子块尾插保留槽，保序同 splitPiece ④
 *    通道；空槽天然零块免搬=免费覆盖「删空槽」）→ ④ 删源槽（删前 getChildBlocks
 *    复核源片已空——搬块残留=中止不删防丢数据；removeDocByID 无 confirm 一发即删）
 *  → ⑤ 序号收敛（被删槽之后的片 point-1 从小到大 rename+MarkKey，rename 失败逆序
 *    回滚镜像 splitPiece ②，回滚自身失败 console 留痕）+ activePoint 迁移
 *    （==removedPoint 跳保留槽）。
 *  重试幂等：已搬走的块在保留槽尾部，重试续搬剩余；收敛计划每次从
 *  fetchWritingPieces 重算自适应（半途收敛态重跑=按当前 point 重排）。
 *  被删槽的 PROG_DONE_KEY 属性随文档删除消失，无需迁移 */
export async function mergePieceIntoNeighbor(
    bookID: string,
    pieceDocID: string,
    dir: -1 | 1,
): Promise<{ keptDocID: string; keptPoint: number; removedPoint: number }> {
    // ① 只读预检
    const pieces = await fetchWritingPieces(bookID);
    const seen = new Set<number>();
    for (const p of pieces) {
        if (seen.has(p.point)) throw new Error("mergePiece: duplicate piece point");
        seen.add(p.point);
    }
    const cur = pieces.find(p => p.docID === pieceDocID);
    if (!cur) throw new Error("mergePiece: piece not in book");
    const neighbor = pieces.find(p => p.point === cur.point + dir);
    if (!neighbor) throw new Error("mergePiece: no neighbor piece");
    const keptDocID = dir === -1 ? neighbor.docID : cur.docID;
    const removedDocID = dir === -1 ? cur.docID : neighbor.docID;
    const keptPoint = dir === -1 ? neighbor.point : cur.point;
    const removedPoint = dir === -1 ? cur.point : neighbor.point;

    // ② 定稿双向拦（getBlockAttrs HTTP 直查无索引延迟，刚定稿也拦得住）
    if (await siyuan.getBlockAttrs(keptDocID).then(a => a?.[PROG_DONE_KEY] === "1")) {
        throw new Error("mergePiece: kept piece done");
    }
    if (await siyuan.getBlockAttrs(removedDocID).then(a => a?.[PROG_DONE_KEY] === "1")) {
        throw new Error("mergePiece: removed piece done");
    }

    // ③ 搬块：只搬实质内容块（空段落是内核恒补占位，随源片删除消失——insertDigest
    //    同款过滤）；保留槽有尾块走 moveBlocksAfter 尾插保序——move op 实为头插
    //    语义，挂子通道会把新块顶到保留槽原内容之前（空槽才头尾等价；既有调用方
    //    全是空片场景掩盖了这一点，slotmerge 非空槽实测倒序根修）
    const moved = ((await siyuan.getChildBlocks(removedDocID)) ?? [])
        .filter(c => (c.content ?? "").trim() !== "" || c.type !== "p");
    debugLog("slotmerge", `merge dir=${dir} movedBlocks=${moved.length}`);
    if (moved.length > 0) {
        const tailID = await siyuan.getDocLastID(keptDocID);
        debugLog("slotmerge", `merge tailAnchor=${tailID ? "tail" : "empty-kept"}`);
        if (tailID) {
            await siyuan.moveBlocksAfter(moved.map(b => b.id), tailID);
        } else {
            await siyuan.moveBlocksAsChild(moved.map(b => b.id), keptDocID);
        }
    }

    // ④ 删源槽：删前复核无实质内容块（内核空文档恒补空 p，严格空判恒 false 中止；
    //    残留实质块=搬块异常中止不删防丢数据，用户可重试续搬）
    const remain = ((await siyuan.getChildBlocks(removedDocID)) ?? [])
        .filter(c => (c.content ?? "").trim() !== "" || c.type !== "p");
    debugLog("slotmerge", `merge remainNonBlank=${remain.length}`);
    if (remain.length > 0) throw new Error("mergePiece: source not empty after move");
    await siyuan.removeDocByID(removedDocID);

    // ⑤ 序号收敛+回滚（从小到大：被删位已腾空，每步落位皆空）
    const rows = await siyuan.sql(
        `select id, content from blocks where type='d' and id in (${pieces.map(p => `'${p.docID}'`).join(",")}) limit 10000000`) as any[] ?? [];
    const titleMap = new Map(rows.map(r => [r.id, r.content ?? ""]));
    const plan = planPieceShiftForRemove(
        pieces.map(p => ({ point: p.point, docID: p.docID, title: titleMap.get(p.docID) ?? "" })),
        removedPoint, bookID,
    );
    const doneShifts: PieceShiftItem[] = [];
    try {
        for (const it of plan) {
            await siyuan.renameDocByID(it.docID, it.title);
            await siyuan.setBlockAttrs(it.docID, { [MarkKey]: it.mark } as any);
            doneShifts.push(it);
        }
    } catch (e) {
        for (const it of doneShifts.reverse()) {
            try {
                await siyuan.renameDocByID(it.docID, it.fromTitle);
                await siyuan.setBlockAttrs(it.docID, { [MarkKey]: getDocIalPieces(bookID, it.fromPoint) } as any);
            } catch (rollbackErr) {
                console.error("mergePiece rollback failed", it.docID, rollbackErr);
            }
        }
        throw e;
    }
    const activePoint = (await progStorage.booksInfo(bookID)).activePoint ?? 0;
    await progStorage.setActivePoint(bookID, shiftActivePointForRemove(activePoint, removedPoint, keptPoint));
    return { keptDocID, keptPoint, removedPoint };
}

/** 建一本写作书：书=普通文档（挂所选笔记本根，身份 IAL 与手动书同款）+ writing
 *  注册；槽=大纲逐行建空片（片名 [N]槽名，IAL 与阅读书 createNote 同款）。
 *  无大纲=建 1 片默认槽（名=书名）。失败抛错由弹窗层 catch 给 toast、弹窗保留可重试 */
export async function createWritingBook(boxID: string, bookNameRaw: string, outlineRaw: string): Promise<WritingBookResult> {
    const bookName = bookNameRaw.replace(/[　/\u200B]+/g, "").trim();
    if (!boxID || !bookName) throw new Error("createWritingBook: invalid args");
    if (await docIDAtPath(boxID, `/${bookName}`)) {
        throw new Error("createWritingBook: book name exists");
    }

    const bookAttrs = {} as AttrType;
    bookAttrs["custom-sy-readonly"] = "true";
    bookAttrs["custom-progmark"] = MarkBookKey;
    const bookID = await siyuan.createDocWithMd(boxID, `/${bookName}`, "", "", bookAttrs);
    if (!bookID) throw new Error("createWritingBook: book doc not created");

    // 注册书身份（books.json）；索引恒空——写作书不维护预存索引（设计共识）
    const info = ProgressiveStorage.defaultBookInfo();
    info.time = await siyuan.currentTimeMs();
    info.boxID = boxID;
    info.bookID = bookID;
    info.bookName = bookName;
    info.writing = true;
    await progStorage.resetBookInfo(bookID, info);

    const slots = parseOutlineLines(outlineRaw);
    if (slots.length === 0) slots.push(bookName);
    const pieceIDs: string[] = [];
    for (const p of planWritingPieces(bookID, bookName, slots)) {
        const path = `/${bookName}/${p.title}`;
        const existing = await docIDAtPath(boxID, path);
        if (existing) {
            // 同名子文档仅在带本题 MarkKey 时认领（删记录重建场景的旧槽）；
            // 撞上普通文档则拒绝，防二次劫持
            const attrs = await siyuan.getBlockAttrs(existing);
            if (attrs?.[MarkKey] !== p.attrs[MarkKey]) {
                throw new Error("createWritingBook: piece name conflict");
            }
            pieceIDs.push(existing);
            continue;
        }
        pieceIDs.push(await siyuan.createDocWithMd(boxID, path, "", "", p.attrs));
    }
    return { bookID, pieceIDs };
}
