// 期1 写作书建书链：IO 接线。纯函数在 outline.ts（parseOutlineLines/planWritingPieces，
// TDD 锁行为）；本文件走内核 API，行为由 dev 实例手验/e2e 覆盖。
// 设计共识：写作书=渐进阅读的姊妹形态（素材排列相位）——书=普通文档、片全复用
// custom-progmark 身份体系、索引恒空（运行时按 MarkKey SQL 拉片列表）、零数据迁移。
import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import { MarkBookKey, MarkKey, PROG_DONE_KEY, TEMP_CONTENT } from "../../sy-tomato-plugin/src/libs/gconst";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
import { writingPoolUnderBook } from "../../sy-tomato-plugin/src/libs/stores";
import { ProgressiveStorage, progStorage } from "./ProgressiveStorage";
import { parseOutlineLines, planWritingPieces, planAppendPiece } from "./outline";
import { pieceDocName, pieceAlias, getDocIalPieces, doneCtime, parseBookIDFromCtime, findDocByIal, getDocIalDigestDir } from "./progData";
import { refreshMaterialTraceFor } from "./materialTrace";
import { appendTailCard } from "./tailCardAppend";

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
        if (!r?.value?.startsWith(prefix) || r.value.length <= prefix.length) continue;
        const point = Number(r.value.slice(prefix.length));
        // 大数值=digest 防删护栏形态（TEMP#bookID,ctime 毫秒时间戳，newDigestDoc/直喂素材
        // 同款）不是片序号——不剔会把摘抄/直喂素材伪混入槽列表（matfeed e2e 实锤）。真片
        // point=书内槽序号（[00000] 五位形态，1e10 天花板富余三个量级）
        if (!Number.isInteger(point) || point < 0 || point >= 1e10) continue;
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

/** 期B 素材块净化（单块整块，含嵌套 sb 的内层）：块引用转实静态文本（设计共识——
 *  素材必须是普通块静态内容）；**所有** IAL 行剥 id/updated/riff-decks/progref
 *  （副本身份重生成；md 通道显式 id 被内核认领——dev 实测非重生成，嵌套 sb 内层
 *  IAL 同剥才不与源块同 id）；素材不挂 progref（片级「回原书」链拿片内 progref 跳
 *  原书，挂了会污染；素材的回原走 material 键跳摘抄）；用户其他 custom 属性保留；
 *  剥空的 IAL 空壳整行回收。⚠ 键名带词边界（custom-uuid 等含 id= 子串的属性不误伤）
 *  且不感知围栏代码块（素材域小说/剧本，fenced code 里的 {: 示例行概率可忽略） */
function stripMaterialBlock(kramdown: string): string {
    const derefed = kramdown.replace(BLOCK_REF_RE, (m) => {
        const texts = [...m.matchAll(/"((?:[^"\\]|\\.)*)"/g)];
        return (texts[0]?.[1] ?? "").replaceAll('\\"', '"');
    });
    return derefed
        .split("\n")
        .map(line => line.trimStart().startsWith("{:")
            ? line
                .replace(/(?<=[\s:{])(?:id|updated|custom-riff-decks|custom-progref)="[^"]*"\s*/g, "")
                .replace(/\}\s*$/, "")
                .trimEnd() + "}"
            : line)
        .filter(line => !/^\s*\{:\}?\s*$/.test(line))
        .join("\n");
}

/** 期B 超级块胶囊（TDD 见 tests/unit/writingBook.test.ts）：整篇素材实质块一次
 *  净化包裹为 row sb——**思源 row=纵向堆叠、col=横向并排**（app scss _wysiwyg
 *  flex-direction 实锤，首版 col 全反）；素材多段纵向阅读序用 row。material
 *  血缘挂 sb 自身 IAL（}}} 后单独一行=内核 kramdown 原生形态），一素材一锚。
 *  血缘值形态与散挂时代一致（源doc#锚块），期C 反查/徽标跳转零迁移兼容 */
export function materializeCapsule(kramdowns: string[], materialValue: string): string {
    const body = kramdowns.map(stripMaterialBlock).join("\n\n");
    return `{{{row\n${body}\n}}}\n{: ${MATERIAL_KEY}="${materialValue}"}`;
}

/** 把来源文档的实质块集合转实入槽尾为超级块胶囊（期B：整篇一次插入替代逐块散挂，
 *  拉式/推式/直送/命令共用核心）。锚=首块（血缘值=源doc#首块ID，跳转定位素材开头；
 *  首块拉失败的跳过场景锚仍指首块——锚只管跳不要求在胶囊内）。本插件 custom 块
 *  （围栏前缀）在拉取处同源剔除——直送选区无 content/markdown 字段，isSubstanceChild
 *  行级过滤覆盖不到，下沉到 kramdown 侧兜底。尾插：片有尾块走 previousID（parentID
 *  是头插——kernel doInsert0 语义）；片空走 parentID。返回 { id: sb 新块 id,
 *  n: 实际入胶囊块数 }（请求块拉空/被剔除时 n<请求数，toast 口径=真实入块数） */
export async function insertCapsuleToPiece(pieceDocID: string, sourceDocID: string, blockIDs: string[]): Promise<{ id: string; n: number }> {
    const kds: string[] = [];
    for (const id of blockIDs) {
        const { kramdown } = (await siyuan.getBlockKramdown(id)) ?? {};
        if (kramdown?.trim() && !kramdown.trimStart().startsWith(PLUGIN_CUSTOM_FENCE)) kds.push(kramdown);
    }
    if (kds.length === 0) throw new Error("insertCapsule: no kramdown");
    const md = materializeCapsule(kds, `${sourceDocID}#${blockIDs[0]}`);
    const children = (await siyuan.getChildBlocks(pieceDocID)) ?? [];
    const tail = children.at(-1);
    const resp = tail
        ? await siyuan.call("/api/block/insertBlock", { data: md, dataType: "markdown", previousID: tail.id })
        : await siyuan.insertBlockAsChildOf(md, pieceDocID);
    const newID = ((resp as any[])?.[0])?.doOperations?.[0]?.id ?? "";
    if (!newID) throw new Error("insertCapsule: no new block id");
    // 期C 反查即时刷新（reasoning P1-1）：源文档可能已被负缓存（用户开着它点的推式/
    // 直送），不清则痕迹徽标本会话永不出；正开着还立即重打（e2e 实锤：无出场事件
    // 时 invalidate 只保证下次事件新数，静止用户看不到）。四路写点唯一汇合处。
    // 循环引用（materialTrace↔writeBook）两侧均运行时函数引用，ESM 环安全
    refreshMaterialTraceFor(sourceDocID);
    return { id: newID, n: kds.length };
}

/** 入槽成功后标记片活跃（activePoint 跟随——入槽=活跃，与移片/拆分写点同语义）。
 *  best-effort：指针写入失败只 console 留痕不拖垮已成功的入槽（吞错防调用方
 *  误报失败——reasoning P1-1） */
async function markPieceActive(pieceDocID: string, bookID: string) {
    try {
        const point = (await fetchWritingPieces(bookID)).find(p => p.docID === pieceDocID)?.point;
        if (point != null) await progStorage.setActivePoint(bookID, point);
    } catch (e) {
        console.error("markPieceActive failed", pieceDocID, e);
    }
}

/** 期B 本插件 custom 块（片尾卡等 UI 附件）的 kramdown 围栏前缀——素材转实不带
 *  运行时挂件（尾卡 docID 引用源文档，搬进槽指错）；getChildBlocks 行（markdown
 *  字段）与 kramdown 拉取两路判据同源 */
const PLUGIN_CUSTOM_FENCE = ";;;sy-progressive-plugin/";

/** 期B 实质素材块判定（TDD 见 tests/unit/writingBook.test.ts；getChildBlocks 行 →
 *  入槽胶囊/移动是否带上）：空段落剔除（内核恒补占位，勿入槽成噪音）；**本插件**
 *  custom 块（围栏前缀=片尾卡等 UI 附件）剔除；用户/他插件 custom 块是内容保留 */
export function isSubstanceChild(c: { type?: string; content?: string; markdown?: string }): boolean {
    if (c.type === "p" && (c.content ?? "").trim() === "") return false;
    if (c.type === "custom" && (c.markdown ?? "").startsWith(PLUGIN_CUSTOM_FENCE)) return false;
    return true;
}

/** 摘抄文档实质块过滤：拉式选择器/推式菜单/移动入槽共用 */
async function digestSubstanceBlocks(digestDocID: string) {
    return ((await siyuan.getChildBlocks(digestDocID)) ?? []).filter(isSubstanceChild);
}

/** 整条摘抄入槽（拉式选择器/推式菜单共用聚合；期B 胶囊化）：整篇实质块一次净化
 *  包裹为 sb 胶囊尾插（血缘挂 sb 一素材一锚）；成功写 activePoint（入槽=活跃）。
 *  返回胶囊内实质块数（真实入块数，非请求数）；失败向上抛由调用方 toast（拉式
 *  MaterialPicker 自带 catch；推式菜单链的兜底在 openSlotMenuCommon） */
export async function insertDigestIntoPiece(pieceDocID: string, bookID: string, digestDocID: string): Promise<number> {
    const children = await digestSubstanceBlocks(digestDocID);
    if (children.length === 0) return 0;
    const { n } = await insertCapsuleToPiece(pieceDocID, digestDocID, children.map(c => c.id));
    await markPieceActive(pieceDocID, bookID);
    return n;
}

/** 直接入槽：任意原文档的选中块转实尾插进槽（不经摘抄池、不建摘抄本体——素材即
 *  普通文本无卡语义；血缘=源doc#首块ID，徽标点击跳回原文出处）。期B 胶囊化：选中
 *  块一次包裹为 sb 胶囊；失败向上抛（与 insertDigest 同语义，reasoning P1-1 统一）
 *  返回胶囊内块数 */
export async function insertBlocksIntoPiece(pieceDocID: string, bookID: string, sourceDocID: string, blockIDs: string[]): Promise<number> {
    if (blockIDs.length === 0) return 0;
    const { n } = await insertCapsuleToPiece(pieceDocID, sourceDocID, blockIDs);
    await markPieceActive(pieceDocID, bookID);
    return n;
}

/** 期B 移动入槽（数据层；期D 池管理界面接 UI——批量+移动放池管理，浮条保持单素材
 *  复制）：整篇实质块 moveBlocks 进槽尾保 id（本体搬运非复制，块上既有属性原样
 *  随行——已在槽内有副本血缘的块移动后天然不断）。mergePiece ③④ 同构：尾插
 *  moveBlocksAfter 保序；搬后复核源无残留实质块才删源素材文档（removeDocByID 无
 *  confirm 一发即删，调用方须自带确认；残留=中止不删防丢数据，可重试续搬）。
 *  子文档守卫（期D reasoning P0-1）：摘抄支路（「摘抄上再摘抄」source 落点）或用户
 *  手动挂的物理子文档不在本次搬运范围（getChildBlocks 只收正文块），删源会连坐
 *  整棵子树——有子文档=抛错留池（计入 failed），先处理子文档再移。
 *  移动=池清理（素材文档消失），不挂新血缘（本体非副本）。成功写 activePoint。
 *  返回搬入块数 */
export async function moveDigestIntoPiece(pieceDocID: string, bookID: string, digestDocID: string): Promise<number> {
    const moved = await digestSubstanceBlocks(digestDocID);
    if (moved.length === 0) {
        // 空壳续收（□13-2）：源已无实质块（历史移动半途删块/用户手清）再移=永久僵尸
        // 池条目——与「移动=池清理」语义一致直接删源收口（守卫前置：子文档仍拦）
        const subDocs = await siyuan.sql(
            `select id from blocks where type='d' and path like replace((select path from blocks where id='${digestDocID}'), '.sy', '') || '/%' limit 1`);
        if ((subDocs as any[])?.length) throw new Error("moveDigest: digest has sub-docs");
        await siyuan.removeDocByID(digestDocID);
        return 0;
    }
    // 思源 path 层父子形态：父 `/a/d.sy` ↔ 子 `/a/d/child.sy`（父目录化去掉 .sy 后缀，
    // 非 `/a/d.sy/` 下——首版照此写恒空漏判，e2e 连坐删了带子文档的素材实锤）
    const subDocs = await siyuan.sql(
        `select id from blocks where type='d' and path like replace((select path from blocks where id='${digestDocID}'), '.sy', '') || '/%' limit 1`);
    if ((subDocs as any[])?.length) throw new Error("moveDigest: digest has sub-docs");
    const tailID = await siyuan.getDocLastID(pieceDocID);
    if (tailID) {
        await siyuan.moveBlocksAfter(moved.map(b => b.id), tailID);
    } else {
        await siyuan.moveBlocksAsChild(moved.map(b => b.id), pieceDocID);
    }
    const remain = await digestSubstanceBlocks(digestDocID);
    if (remain.length > 0) throw new Error("moveDigest: source not empty after move");
    await siyuan.removeDocByID(digestDocID);
    await markPieceActive(pieceDocID, bookID);
    return moved.length;
}

// ============ □1 定向喂池（matfeed：划词直喂 + 整篇搬运；素材来源=在读的所有书，写作书只是目的地） ============

/** ctime 换归属书前缀（保锤状态与 ct——ct 是池排序键，保插入时刻语义不重排）。
 *  锤态拼接走整串 "🔨#"（slice 按 code unit 的地雷见 doneCtime 注释）。
 *  形态守卫（reasoning P2-2）：段数异常（🔨#bookID 无 ct / 三段脏值）直接抛——生成
 *  垃圾 ctime 是静默数据错，抛错由调用方 toast 后重试比脏值安全；真实写点恒两/三段 */
export function retargetCtime(value: string, targetBookID: string): string {
    const done = doneCtime(value) != null;
    const parts = value.split("#");
    if (parts.length !== (done ? 3 : 2)) throw new Error(`retargetCtime: bad shape "${value}"`);
    return `${done ? "🔨#" : ""}${targetBookID}#${parts.at(-1)}`;
}

/** 直喂素材标题的取文：首块 kramdown 里第一条可读内容行，剥行首 markdown 记号
 *  （标题/列表/引用）与围栏行（sb 胶囊 {{{row/}}}、代码块 ```——直取成乱码标题，
 *  reasoning P1-2），取前 10 字（对齐摘抄标题 allText.slice(0,10) 形态）；全空兜底「素材」 */
export function feedPoolTitle(firstKramdown: string): string {
    for (const line of firstKramdown.split("\n")) {
        if (/^\s*(\{\{\{|\}\}\}|```)/.test(line)) continue;
        const t = line.replace(/^\s*[:#=>\-*+\s]+/, "").replace(/\*\*?/g, "").trim();
        if (t && !t.startsWith("{:")) return t.slice(0, 10);
    }
    return "素材";
}

/** getBlockInfo 文件树直查 box+path（物理 path，无 SQL 索引延迟——digest 夹可能刚建），
 *  失败兜 SQL。moveDocs 是物理 path 域，两路取值都为它服务 */
async function docBoxPath(docID: string): Promise<{ box: string; path: string }> {
    const info = await siyuan.getBlockInfo(docID).catch(() => null);
    if (info?.box && info?.path) return { box: info.box, path: info.path };
    const row = await siyuan.sqlOne(`select box, path from blocks where type='d' and id='${docID}'`);
    return { box: row?.box ?? "", path: row?.path ?? "" };
}

/** □1 划词直喂：任意文档的选中块建为一篇新素材文档，进目标书的 digest 夹（跨书——
 *  「打开写作书原文档边读边摘」对空书不成立，喂池通道补上这一环）。内容同胶囊净化纪律
 *  （md 通道显式 id 被内核认领，必须剥）；身份 IAL 与 DigestBuilder.newDigestDoc 同形态
 *  （ctime 归属目标书=index/parent/last 三锚随行），锤/已读机制按 ctime 自然生效；尾卡
 *  与摘抄素材同款（滚筒推到它时收束卡动作在位）。返回新文档 id；选中块全被滤掉返回 ""
 *  （调用方 toast 无内容），夹/路径瞬态缺失抛错由调用方兜底 */
export async function feedBlocksToPool(targetBookID: string, sourceDocID: string, blockIDs: string[]): Promise<string> {
    const kds: string[] = [];
    for (const id of blockIDs) {
        const { kramdown } = (await siyuan.getBlockKramdown(id)) ?? {};
        if (kramdown?.trim() && !kramdown.trimStart().startsWith(PLUGIN_CUSTOM_FENCE)) kds.push(kramdown);
    }
    if (kds.length === 0) return "";
    // matfeed □4：写作书池夹档跟设置（true=新建挂书下，已有夹按 IAL 原位认回不受影响）
    const dirID = await progStorage.ensureDigestDir(targetBookID, writingPoolUnderBook.get());
    if (!dirID) throw new Error("feedPool: digest dir not ready");
    const dir = await docBoxPath(dirID);
    if (!dir.box || !dir.path) throw new Error("feedPool: digest dir path missing");
    const dirHPath = await siyuan.getHPathByID(dirID, dir.box);
    if (!dirHPath) throw new Error("feedPool: digest dir hpath missing");
    const ct = new Date().getTime();
    const attrs = {
        "custom-pdigest-index": `${targetBookID}#0000000000`,
        "custom-pdigest-parent-id": sourceDocID,
        "custom-pdigest-last-id": blockIDs[0],
        "custom-pdigest-ctime": `${targetBookID}#${ct}`,
        "custom-card-priority": "60",
        "custom-off-tomatobacklink": "1",
        "custom-progmark": `${TEMP_CONTENT}#${targetBookID},${ct}`,
    } as AttrType;
    // 重名防劫持（createDocWithMd 同名静默认领旧文档——docIDAtPath 预检纪律）：短时间
    // 二喂同一段文本撞标题时缀 ct 保唯一，首喂不带缀保持标题干净
    let title = `[直]${feedPoolTitle(kds[0])}`;
    if (await docIDAtPath(dir.box, `${dirHPath}/${title}`)) title = `${title}-${ct}`;
    const docID = await siyuan.createDocWithMd(dir.box, `${dirHPath}/${title}`, kds.map(stripMaterialBlock).join("\n\n"), "", attrs);
    if (!docID) throw new Error("feedPool: doc not created");
    await appendTailCard({ v: 1, kind: "digest", bookID: targetBookID, point: 0, docID });
    return docID;
}

/** □1 整篇搬运：把一篇已有素材文档搬进目标书的池（moveDigestIntoPiece 的池版本）——
 *  moveDocs 物理移动保文档 id（已有入槽胶囊的血缘=源doc#首块ID 锚本文档，搬后天然
 *  不断）；ctime 前缀重写=池归属转移（原书池查询自然少一条、目标书池多一条），锤状态
 *  与 ct 随行（已读的不复活、排序键不变）。子文档随整树搬（物理 move 无孤儿风险）。
 *  返回 1；源已在目标书池返回 0（幂等，菜单层 excludeBookID 已拦常态点击） */
export async function moveDigestToPool(targetBookID: string, digestDocID: string): Promise<number> {
    const attrs = await siyuan.getBlockAttrs(digestDocID);
    const ctime = attrs?.["custom-pdigest-ctime"] ?? "";
    const fromBookID = parseBookIDFromCtime(ctime);
    if (!fromBookID) throw new Error("moveToPool: not a digest doc");
    if (fromBookID === targetBookID) return 0;
    // matfeed □4：写作书池夹档跟设置（true=新建挂书下，已有夹按 IAL 原位认回不受影响）
    const dirID = await progStorage.ensureDigestDir(targetBookID, writingPoolUnderBook.get());
    if (!dirID) throw new Error("moveToPool: digest dir not ready");
    const from = await docBoxPath(digestDocID);
    const to = await docBoxPath(dirID);
    if (!from.box || !from.path || !to.box || !to.path) throw new Error("moveToPool: path missing");
    // 顺序不可倒（reasoning P2-6 反证）：必须先 move 后重写 ctime——倒序的失败态（ctime
    // 已迁、物理未迁）会被下方 fromBookID===targetBookID 幂等短路永远搬不动；正序的失败
    // 态（物理已迁、ctime 归属旧书）可重试自愈——内核对「移到自身父目录」幂等 return，
    // 重试 moveDocs 无害、setBlockAttrs 补上即闭环，期间池查询按 IAL 归属旧书仍可见
    await siyuan.moveDocs([from.path], to.path, to.box);
    debugLog("matfeed", `moveToPool moved doc=${digestDocID} to book=${targetBookID} dir=${dirID}（ctime 重写前——若此后无「done」行=半搬态，重试自愈）`);
    await siyuan.setBlockAttrs(digestDocID, {
        "custom-pdigest-ctime": retargetCtime(ctime, targetBookID),
        "custom-pdigest-index": `${targetBookID}#0000000000`,
    } as any);
    debugLog("matfeed", `moveToPool done doc=${digestDocID} book=${targetBookID}`);
    return 1;
}

// ============ matfeed □4 写作书素材池位置档（书下/摘抄总夹） ============

/** 池夹位置态（管理界面搬迁钮显隐判定）：主力夹按 IAL 认回（不 ensure 不新建——
 *  无夹的空池不该因开了下管理界面就冒出一个夹）。返回 "book"=书下 / "hub"=非书下
 *  （总夹，含用户手挪去的任意位置）/ ""=无夹。父判定走 path 层（blocks 表文档行
 *  parent_id 恒空，踩坑纪律），digestDirParentOf 同构 */
export async function poolDirPlacement(bookID: string): Promise<"book" | "hub" | ""> {
    const dirID = await findDocByIal(getDocIalDigestDir(bookID));
    if (!dirID) return "";
    // 走 getBlockInfo 文件树直查（docBoxPath）而非 SQL——blocks.path 有「写后立读」
    // 索引延迟（reasoning P1-1：刚搬完重开 Dialog 会读旧 path 误判 hub→钮闪回）
    const from = await docBoxPath(dirID);
    const parent = from.path.split("/").filter(Boolean).at(-2) ?? "";
    return parent === bookID ? "book" : "hub";
}

/** 池夹显式搬迁（DigestAllDialog 搬迁钮）：moveDocs 保文档 id 整树搬、IAL 锚不变=
 *  认回链不断（设置档只决定新建落点，存量夹靠这里显式搬——改档不静默挪用户文档）。
 *  under=true 挂书下 / false 挂摘抄总夹。返回 1=已搬；0=幂等无需搬（无夹——之后
 *  喂池自然按档新建）；路径瞬态缺失抛错由调用方兜底 toast。 */
export async function movePoolDir(bookID: string, under: boolean): Promise<number> {
    const dirID = await findDocByIal(getDocIalDigestDir(bookID));
    if (!dirID) return 0;
    const from = await docBoxPath(dirID);
    if (!from.box || !from.path) throw new Error("movePoolDir: dir path missing");
    let toBox = "", toPath = "";
    if (under) {
        const book = await docBoxPath(bookID);
        if (!book.box || !book.path) throw new Error("movePoolDir: book path missing");
        toBox = book.box; toPath = book.path;
    } else {
        const hubID = await progStorage.ensureDigestHub();
        if (!hubID) throw new Error("movePoolDir: hub not ready");
        const hub = await docBoxPath(hubID);
        if (!hub.box || !hub.path) throw new Error("movePoolDir: hub path missing");
        toBox = hub.box; toPath = hub.path;
    }
    await siyuan.moveDocs([from.path], toPath, toBox);
    debugLog("matfeed", `movePoolDir moved dir=${dirID} book=${bookID} under=${under}`, "progressive");
    return 1;
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

/** 期A 书池未读素材计数（滚筒 finished 判定/舰队 finished 位/期B 火苗回落链共用）：
 *  未锤形态=未读（`bookID#ct`；推过即锤成 `🔨#bookID#ct` 天然不命中），定向 count 查询。
 *  修「全定稿书被滚筒退役→继续摘进来的素材饿死」（review P1-1） */
export async function countUnreadMaterial(bookID: string): Promise<number> {
    const rows = await siyuan.sql(
        `select count(*) as c from attributes where name='custom-pdigest-ctime' and value like '${bookID}#%' limit 1`) as any[];
    return Number(rows?.[0]?.c ?? 0);
}

export async function hasUnreadMaterial(bookID: string): Promise<boolean> {
    return (await countUnreadMaterial(bookID)) > 0;
}

/** □5 写作火苗的「当前写作书」：滚筒 reading-order 序里第一本有未定稿槽的写作书
 *  （恒取序首，非滚筒的 lastServed+1 环形轮转——火苗要稳定的「写作现场」锚点，
 *  不随阅读轮转漂移；不影响阅读侧 lastServed）；期B（review P2-6 兑现）：槽全定稿
 *  时回落找**有未读素材**的书（素材消化也是写作现场，纯收集书 0 槽有素材可中选，
 *  target=null+materialUnread=N → tooltip 素材态「N 篇待读」，点击走 startToLearn
 *  期A 分派素材优先天然直达）；都空回落序首写作书（终态口径）。无写作书 null
 *  （火苗不显示）。fleet 刷新与 Progressive 打开侧共用，防两处选择逻辑漂移 */
export interface WritingFlameBook {
    bookID: string;
    bookName: string;
    target: { docID: string; point: number } | null;
    /** 无未定稿槽选中时的未读素材数（target!=null 恒 0） */
    materialUnread: number;
}

export async function pickWritingFlameBook(): Promise<WritingFlameBook | null> {
    const infos = progStorage.booksInfos();
    const writing = Object.entries(infos).filter(([id, info]) =>
        info.writing && !info.ignored && !info.archived && progStorage.isRegisteredBook(id));
    if (writing.length === 0) return null;
    const order = (await progStorage.loadReadingOrder()).order;
    const rank = new Map(order.map((id, i) => [id, i]));
    writing.sort((a, b) => (rank.get(a[0]) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b[0]) ?? Number.MAX_SAFE_INTEGER));
    for (const [bookID, info] of writing) {
        const target = pickWritingTarget(await fetchWritingPieces(bookID), info.activePoint);
        if (target) return { bookID, bookName: info.bookName || bookID, target, materialUnread: 0 };
    }
    for (const [bookID, info] of writing) {
        const materialUnread = await countUnreadMaterial(bookID);
        if (materialUnread > 0) return { bookID, bookName: info.bookName || bookID, target: null, materialUnread };
    }
    const [bookID, info] = writing[0];
    return { bookID, bookName: info.bookName || bookID, target: null, materialUnread: 0 };
}

/** 期A 滚筒分派判定（纯函数，TDD 见 tests/unit/writingBook.test.ts）：素材优先、
 *  清空转槽（设计共识 memory material-parallel-design）。flat=queryDigestTree.flat
 *  （全局 ctime 降序=新→老，done=🔨 完成态=已读）：池有未读素材→最老未读（末位
 *  未读，末位已锤则向前找）；池清空→activePoint 槽（pickWritingTarget 续转语义）；
 *  两者皆空→null（0 槽纯收集书空池/全定稿，终态提示由调用方给）。参数用结构类型
 *  不引 DigestTreeNode，防 writeBook↔digestUtils 耦合面扩大 */
export function pickWritingDispatch(
    flat: { id: string; ctime: string; done: boolean }[],
    pieces: WritingPieceState[],
    activePoint?: number,
): { kind: "material"; id: string; ctime: string } | { kind: "slot"; docID: string; point: number } | null {
    const undone = flat.filter(n => !n.done && n.ctime.includes("#"));
    if (undone.length > 0) {
        // 不信任输入序（queryDigestTree 契约是全局降序，但静默选错比防御排序代价高）
        undone.sort((a, b) => a.ctime.localeCompare(b.ctime));
        const oldest = undone[0];
        return { kind: "material", id: oldest.id, ctime: oldest.ctime };
    }
    const t = pickWritingTarget(pieces, activePoint);
    return t ? { kind: "slot", docID: t.docID, point: t.point } : null;
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

/** 期D 书尾新建空槽（先建槽后放素材）：无移位无搬块，纯建片（attrs 与建书片同款，
 *  计划内核=planAppendPiece 纯函数单测锁定）。路径占用预检同 splitPiece ①（title 带
 *  序号前缀天然唯一，撞上=存量脏数据拒绝劫持）。返回新槽 docID；失败抛错由弹窗层
 *  catch 给 toast。槽数变化由调用方 notifyFleetChanged */
export async function appendEmptyPiece(bookID: string, slotNameRaw: string): Promise<string> {
    const pieces = await fetchWritingPieces(bookID);
    // duplicate-point 预检（split/merge ① 同款）：存量脏 point 静默加剧会让 split/
    // merge 永久抛错，前置消灭（reasoning P2-1）
    const seen = new Set<number>();
    for (const p of pieces) {
        if (seen.has(p.point)) throw new Error("appendPiece: duplicate piece point");
        seen.add(p.point);
    }
    const info = await progStorage.booksInfo(bookID);
    const bookRow = await siyuan.sqlOne(`select box, hpath from blocks where type='d' and id='${bookID}'`);
    if (!bookRow?.box || !bookRow?.hpath) throw new Error("appendPiece: book not found");
    const plan = planAppendPiece(bookID, info.bookName || "", pieces, slotNameRaw);
    const path = `${bookRow.hpath}/${plan.title}`;
    if (await docIDAtPath(bookRow.box, path)) throw new Error("appendPiece: piece name conflict");
    const docID = await siyuan.createDocWithMd(bookRow.box, path, "", "", plan.attrs);
    if (!docID) throw new Error("appendPiece: piece doc not created");
    return docID;
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
 *  无大纲=纯收集书（0 槽，期A）。失败抛错由弹窗层 catch 给 toast、弹窗保留可重试 */
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

    // 期A 素材并行：大纲空=纯收集书（无槽，只进素材池；滚筒分派走素材优先链），
    // 不再兜底建默认槽——老书已建的默认槽不受影响（存量数据不动）
    const slots = parseOutlineLines(outlineRaw);
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
