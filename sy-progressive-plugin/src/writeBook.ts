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
import { pieceAlias, getDocIalPieces, doneCtime, parseBookIDFromCtime, findDocByIal, getDocIalDigestDir } from "./progData";
import { refreshMaterialTraceFor } from "./materialTrace";
import { appendTailCard } from "./tailCardAppend";
import { fetchWritingTreeSlots, invalidateWritingTreeCache, insertDocAfter, appendDocToEnd } from "./writeTree";

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

/** □4② 写作书槽内导航：当前槽 docID 在 point 序里前后移动（含定稿槽——回看历史
 *  写作现场合法）。首/尾越界或当前文档非本书槽 → null（调用方给「已是第一/最后
 *  一个槽」提示）。不信任输入序（防御排序，同 pickWritingDispatch 口径） */
export function neighborWritingSlot(
    pieces: WritingPieceState[],
    currentDocID: string,
    step: number,
): WritingPieceState | null {
    const sorted = [...pieces].sort((a, b) => a.point - b.point);
    const i = sorted.findIndex(p => p.docID === currentDocID);
    if (i < 0) return null;
    return sorted[i + step] ?? null;
}

/** 运行时拉写作书片列表（progtree □1 起权威=文件树序：point=树序深度优先展开
 *  平铺 index、树形/白名单/存量一次性整理在 writeTree.fetchWritingTreeSlots；
 *  done=PROG_DONE_KEY attributes 直查 join。索引恒空的设计共识保持——不维护预
 *  存索引。下游消费方（调度/滚筒/火苗/舰队/导航/菜单）接口零变化跟随树序） */
export async function fetchWritingPieces(bookID: string): Promise<WritingPieceState[]> {
    const slots = await fetchWritingTreeSlots(bookID);
    if (slots.length === 0) return [];
    const rows = await siyuan.sql(
        `select block_id, value from attributes where name = '${PROG_DONE_KEY}'` +
        ` and block_id in (${slots.map(s => `'${s.docID}'`).join(",")}) limit 10000000`) as any[];
    const done = new Set((rows ?? []).filter(r => r.value === "1").map(r => r.block_id));
    return slots.map(s => ({ point: s.point, docID: s.docID, done: done.has(s.docID) }));
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

/** progtail □1 池副本逐块净化（TDD 见 tests/unit/writingBook.test.ts）：与
 *  stripMaterialBlock 的纪律分野——胶囊素材要「普通块静态内容」（块引用转实+剥
 *  progref）；池副本仍是摘抄域文档，血缘锚（custom-progref）与块引用活性必须保留
 *  （回原书链/徽标跳转照常，入槽转实时才走 stripMaterialBlock）。剥的是身份与曲线
 *  标记：id/updated（md 通道显式 id 被内核认领→与源块同 id 冲突，嵌套 sb 内层同剥）、
 *  custom-riff-decks（池素材无卡语义，riff 归属不随行）、custom-prog-think（块级问题
 *  曲线标记——副本进池从零开始，不复读源曲线）。键名带词边界（custom-uuid 不误伤） */
export function stripDigestCopyBlock(kramdown: string): string {
    return kramdown
        .split("\n")
        .map(line => line.trimStart().startsWith("{:")
            ? line
                .replace(/(?<=[\s:{])(?:id|updated|custom-riff-decks|custom-prog-think)="[^"]*"\s*/g, "")
                .replace(/\}\s*$/, "")
                .trimEnd() + "}"
            : line)
        .filter(line => !/^\s*\{:\}?\s*$/.test(line))
        .join("\n");
}

/** progtail □1 池副本 doc IAL 重定向（纯函数，TDD 见 tests/unit/writingBook.test.ts）：
 *  ctime/index/progmark 换目标书+新鲜 ct——锤态(🔨)刻意剥掉（与 moveDigestToPool 的
 *  retargetCtime 保锤分野：副本=新素材以**未读**进池，countUnreadMaterial 的
 *  LIKE `bookID#%` 才命中、滚筒才会推它）；保回原书锚（parent-id/last-id/piece-idx/
 *  card-priority/off-tomatobacklink）；剥身份与曲线标记（id/updated/riff-decks/
 *  pdigest-review/prog-for-recite——副本的卡/复访/仿写状态不复读源文档） */
export function digestCopyAttrs(srcAttrs: Record<string, string>, targetBookID: string, ct: number): AttrType {
    const a: Record<string, string> = { ...srcAttrs };
    delete a.id;
    delete a.updated;
    delete a["custom-riff-decks"];
    delete a["custom-pdigest-review"];
    delete a["custom-prog-for-recite"];
    a["custom-pdigest-ctime"] = `${targetBookID}#${ct}`;
    a["custom-pdigest-index"] = `${targetBookID}#0000000000`;
    a["custom-progmark"] = `${TEMP_CONTENT}#${targetBookID},${ct}`;
    return a as AttrType;
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
    let attrs = await siyuan.getBlockAttrs(digestDocID);
    // getBlockAttrs 单发空读闪烁（cache×BlockTree 竞态，踩坑索引）——批量壳逐篇
    // moveDocs+setBlockAttrs 搅树，下一篇首读易落竞态窗：空读 150ms 复检一次再判
    // 「非摘抄」，防真摘抄被误标 skipped（copyToPool 同款同修）
    if (!attrs?.["custom-pdigest-ctime"]) {
        await new Promise(r => setTimeout(r, 150));
        attrs = await siyuan.getBlockAttrs(digestDocID);
    }
    const ctime = attrs?.["custom-pdigest-ctime"] ?? "";
    const fromBookID = parseBookIDFromCtime(ctime);
    if (!fromBookID) throw new Error(`moveToPool: ${NOT_A_DIGEST_MSG}`);
    if (fromBookID === targetBookID) return 0;
    // matfeed □4：写作书池夹档跟设置（true=新建挂书下，已有夹按 IAL 原位认回不受影响）
    const dirID = await progStorage.ensureDigestDir(targetBookID, writingPoolUnderBook.get());
    if (!dirID) throw new Error("moveToPool: digest dir not ready");
    const from = await docBoxPath(digestDocID);
    const to = await docBoxPath(dirID);
    if (!from.box || !from.path || !to.box || !to.path) throw new Error("moveToPool: path missing");
    // 形态守卫前移到零副作用阶段（review P2-1）：脏 ctime（缺 # 段等）在 moveDocs 前
    // 爆=failed 修好可重试；搬后才爆=物理在目标夹+IAL 归旧书的搁浅态、重试永远再抛
    const newCtime = retargetCtime(ctime, targetBookID);
    // 顺序不可倒（reasoning P2-6 反证）：必须先 move 后重写 ctime——倒序的失败态（ctime
    // 已迁、物理未迁）会被下方 fromBookID===targetBookID 幂等短路永远搬不动；正序的失败
    // 态（物理已迁、ctime 归属旧书）可重试自愈——内核对「移到自身父目录」幂等 return，
    // 重试 moveDocs 无害、setBlockAttrs 补上即闭环，期间池查询按 IAL 归属旧书仍可见
    await siyuan.moveDocs([from.path], to.path, to.box);
    debugLog("matfeed", `moveToPool moved doc=${digestDocID} to book=${targetBookID} dir=${dirID}（ctime 重写前——若此后无「done」行=半搬态，重试自愈）`);
    await siyuan.setBlockAttrs(digestDocID, {
        "custom-pdigest-ctime": newCtime,
        "custom-pdigest-index": `${targetBookID}#0000000000`,
    } as any);
    debugLog("matfeed", `moveToPool done doc=${digestDocID} book=${targetBookID}`);
    return 1;
}

/** progtail □1 复制留底：摘抄文档整篇**复制**进目标书的池（移入素材池的留底档——一片
 *  摘抄可能喂多本书，原文档原地不动）。kramdown 通道建副本文档：块级净化走
 *  stripDigestCopyBlock（保 progref/块引用=血缘锚完整，回原书链照常；refMap 按 ctime
 *  归属书圈——副本归目标书，源书原文不多挂痕迹）；doc IAL 走 digestCopyAttrs（未读
 *  进池+回原书锚随行）。只复制顶层内容块，源文档的子文档支路不带（子树复制是独立
 *  需求，需者再提）。标题=源标题（同夹重名缀 ct 防默认劫持），尾卡照挂（收束动作在位）。
 *  返回 1；无实质内容块返回 0（菜单层 toast 无内容） */
export async function copyDigestToPool(targetBookID: string, digestDocID: string): Promise<number> {
    let attrs = (await siyuan.getBlockAttrs(digestDocID)) ?? {};
    // 空读闪烁复检（同 moveDigestToPool：批量壳搅树后下一篇首读易落竞态窗，150ms 再读
    // 一次才判「非摘抄」）
    if (!attrs["custom-pdigest-ctime"]) {
        await new Promise(r => setTimeout(r, 150));
        attrs = (await siyuan.getBlockAttrs(digestDocID)) ?? {};
    }
    const ctime = attrs["custom-pdigest-ctime"] ?? "";
    if (!parseBookIDFromCtime(ctime)) throw new Error(`copyToPool: ${NOT_A_DIGEST_MSG}`);
    const kds: string[] = [];
    for (const c of (await siyuan.getChildBlocks(digestDocID)) ?? []) {
        if (!isSubstanceChild(c)) continue;
        const { kramdown } = (await siyuan.getBlockKramdown(c.id)) ?? {};
        if (kramdown?.trim() && !kramdown.trimStart().startsWith(PLUGIN_CUSTOM_FENCE)) kds.push(kramdown);
    }
    if (kds.length === 0) return 0;
    // matfeed □4：写作书池夹档跟设置（true=新建挂书下，已有夹按 IAL 原位认回不受影响）
    const dirID = await progStorage.ensureDigestDir(targetBookID, writingPoolUnderBook.get());
    if (!dirID) throw new Error("copyToPool: digest dir not ready");
    const dir = await docBoxPath(dirID);
    if (!dir.box || !dir.path) throw new Error("copyToPool: digest dir path missing");
    const dirHPath = await siyuan.getHPathByID(dirID, dir.box);
    if (!dirHPath) throw new Error("copyToPool: digest dir hpath missing");
    // 源标题取物理 path 末段（getBlockInfo 无标题字段；SQL content 列有索引延迟）；
    // 同夹重名预检同 feedBlocksToPool 纪律（createDocWithMd 同名静默认领旧文档）
    const from = await docBoxPath(digestDocID);
    let title = decodeURIComponent(from.path.split("/").filter(Boolean).at(-1)?.replace(/\.sy$/, "") || "素材");
    if (await docIDAtPath(dir.box, `${dirHPath}/${title}`)) title = `${title}-${Date.now()}`;
    const ct = new Date().getTime();
    const docID = await siyuan.createDocWithMd(dir.box, `${dirHPath}/${title}`,
        kds.map(stripDigestCopyBlock).join("\n\n"), "", digestCopyAttrs(attrs, targetBookID, ct));
    if (!docID) throw new Error("copyToPool: doc not created");
    await appendTailCard({ v: 1, kind: "digest", bookID: targetBookID, point: 0, docID });
    debugLog("matfeed", `copyToPool done doc=${digestDocID} → copy=${docID} book=${targetBookID}`);
    return 1;
}

/** □3 批量入槽结果：copied=成功进池数；skipped=输入问题（非摘抄文档/无实质内容块）；
 *  failed=链路错误（池夹未就绪/建文档失败等）。 */
export interface DigestsToPoolResult {
    total: number;
    copied: number;
    skipped: { id: string; reason: string }[];
    failed: { id: string; error: string }[];
}

/** 「非摘抄文档」错误标识（copyDigestToPool 抛出侧与批量壳归类侧共用同一来源，
 *  review P1-1：裸字面量两处零关联，改词即静默把 skipped 误归 failed） */
export const NOT_A_DIGEST_MSG = "not a digest doc";

/** □3 素材批量入槽批量壳（群反馈 650189：500+ 篇摘抄批量进池；正式 API 挂
 *  window.syProgressive.copyDigestsToPool，见 index.ts）。串行防写盘风暴；失败跳过
 *  最后汇总；单批上限 100（用户分批建议 50~100）；进度逐篇 console.log（用户在控制台
 *  调用，这是 API 的回报输出非运行时埋点，不走 debugLog 门控）。批内 id 去重（复制
 *  非幂等，重复=双份副本）；跨批重复管不到，重试请只传 failed 里的 id。executor/log
 *  注入供单测，默认绑单篇真链路 copyDigestToPool。 */
export async function copyDigestsToPool(
    targetBookID: string, digestDocIDs: string[],
    execOne: (bookID: string, docID: string) => Promise<number> = copyDigestToPool,
    log: (line: string) => void = (l) => console.log(`[copyDigestsToPool] ${l}`),
): Promise<DigestsToPoolResult> {
    if (digestDocIDs.length > 100) {
        throw new Error(`copyDigestsToPool: 单批上限 100 篇（本次 ${digestDocIDs.length}），请分批调用`);
    }
    const ids = [...new Set(digestDocIDs)];
    const res: DigestsToPoolResult = { total: ids.length, copied: 0, skipped: [], failed: [] };
    if (ids.length < digestDocIDs.length) log(`已去重 ${digestDocIDs.length - ids.length} 篇重复 id`);
    for (const [i, id] of ids.entries()) {
        const n = i + 1;
        try {
            const r = await execOne(targetBookID, id);
            if (r === 1) { res.copied++; log(`${n}/${res.total} ✓ ${id}`); }
            else { res.skipped.push({ id, reason: "无实质内容块" }); log(`${n}/${res.total} - 跳过（无实质内容块） ${id}`); }
        } catch (e) {
            const msg = String((e as Error)?.message ?? e);
            if (msg.includes(NOT_A_DIGEST_MSG)) {
                res.skipped.push({ id, reason: "非摘抄文档" });
                log(`${n}/${res.total} - 跳过（非摘抄文档） ${id}`);
            } else {
                res.failed.push({ id, error: msg });
                log(`${n}/${res.total} ✗ 失败 ${id}: ${msg}`);
            }
        }
    }
    log(`完成：成功 ${res.copied} / 跳过 ${res.skipped.length} / 失败 ${res.failed.length}（共 ${res.total}）`);
    if (res.failed.length) log("有失败篇：重试请只传返回值 failed 里的 id（复制非幂等，整批重跑会双份）");
    debugLog("matfeed", `copyDigestsToPool book=${targetBookID} copied=${res.copied} skipped=${res.skipped.length} failed=${res.failed.length}`, "progressive");
    return res;
}

/** 素材批量换籍结果：moved=成功换籍数；skipped=输入问题（已在目标书池〔幂等〕/非摘抄
 *  文档）；failed=链路错误（池夹未就绪/路径缺失等）。 */
export interface DigestsMovePoolResult {
    total: number;
    moved: number;
    skipped: { id: string; reason: string }[];
    failed: { id: string; error: string }[];
}

/** 素材批量换籍批量壳（群反馈 650189：批量移动进写作书素材池；正式 API 挂
 *  window.syProgressive.moveDigestsToPool，见 index.ts）。copyDigestsToPool 同款壳换
 *  executor=moveDigestToPool。与复制版的语义差异：move 幂等——单篇返回 0=源已归目标
 *  书，归 skipped「已在目标书池」，失败后整批重跑无害（无须像 copy 只挑 failed 的 id
 *  重试）；批内 id 去重（不去重则首条之后全落幂等 skipped，计数虚胖）。单批上限 100；
 *  串行防写盘风暴；进度逐篇 console.log（用户在控制台调用，这是 API 的回报输出非运行
 *  时埋点，不走 debugLog 门控）。executor/log 注入供单测，默认绑单篇真链路
 *  moveDigestToPool。 */
export async function moveDigestsToPool(
    targetBookID: string, digestDocIDs: string[],
    execOne: (bookID: string, docID: string) => Promise<number> = moveDigestToPool,
    log: (line: string) => void = (l) => console.log(`[moveDigestsToPool] ${l}`),
): Promise<DigestsMovePoolResult> {
    if (digestDocIDs.length > 100) {
        throw new Error(`moveDigestsToPool: 单批上限 100 篇（本次 ${digestDocIDs.length}），请分批调用`);
    }
    const ids = [...new Set(digestDocIDs)];
    const res: DigestsMovePoolResult = { total: ids.length, moved: 0, skipped: [], failed: [] };
    if (ids.length < digestDocIDs.length) log(`已去重 ${digestDocIDs.length - ids.length} 篇重复 id`);
    for (const [i, id] of ids.entries()) {
        const n = i + 1;
        try {
            const r = await execOne(targetBookID, id);
            if (r === 1) { res.moved++; log(`${n}/${res.total} ✓ ${id}`); }
            else { res.skipped.push({ id, reason: "已在目标书池" }); log(`${n}/${res.total} - 跳过（已在目标书池，幂等） ${id}`); }
        } catch (e) {
            const msg = String((e as Error)?.message ?? e);
            if (msg.includes(NOT_A_DIGEST_MSG)) {
                res.skipped.push({ id, reason: "非摘抄文档" });
                log(`${n}/${res.total} - 跳过（非摘抄文档） ${id}`);
            } else {
                res.failed.push({ id, error: msg });
                log(`${n}/${res.total} ✗ 失败 ${id}: ${msg}`);
            }
        }
    }
    log(`完成：换籍 ${res.moved} / 跳过 ${res.skipped.length} / 失败 ${res.failed.length}（共 ${res.total}）`);
    if (res.failed.length) log("有失败篇：换籍幂等，整批重跑安全（已在目标书的自动跳过，不会重复搬）");
    debugLog("matfeed", `moveDigestsToPool book=${targetBookID} moved=${res.moved} skipped=${res.skipped.length} failed=${res.failed.length}`, "progressive");
    return res;
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

// ============ matflow（0914 □2+□5 合拍）素材池出口三件+翻素材轮转 ============

/** 翻素材轮转（纯函数，TDD 见 tests/unit/writingBook.test.ts）：candidates=未消化
 *  素材 id 序（调用方传 queryDigestTree.flat 滤 done 的 ctime 降序族）；current 在册
 *  →环形取「更新」方向下一条（头方向 i-1，与 digest 态 prev/next 的 next 同向——翻
 *  过去后「下一条摘抄」同一条走承接）；不在册（槽/原书起翻）→随机起点（洗牌轮转=
 *  随机感+不重复遍历，nextOfOrderedIDs 同款环形机制）。单条且=当前→""（调用方对症
 *  提示）。rand 注入供单测。 */
export function nextFlipMaterial(candidates: string[], current: string, rand: () => number = Math.random): string {
    const n = candidates.length;
    if (n === 0) return "";
    const i = candidates.indexOf(current);
    if (i < 0) return candidates[Math.floor(rand() * n) % n];
    if (n === 1) return "";
    return candidates[(i - 1 + n) % n];
}

/** 消化标记（解除关联·可逆档，🔨# 前缀 toggle）：true=前插锤、false=剥锤；幂等
 *  （已锤再锤/未锤再剥原值不动）。非素材/已删文档静默跳过不计数。 */
export async function setMaterialsDigested(docIDs: string[], digested: boolean): Promise<number> {
    let n = 0;
    for (const id of docIDs) {
        const attrs = await siyuan.getBlockAttrs(id).catch(() => null);
        const raw = attrs?.["custom-pdigest-ctime"] ?? "";
        if (!parseBookIDFromCtime(raw)) continue;
        if ((doneCtime(raw) != null) === digested) { n++; continue; }
        await siyuan.setBlockAttrs(id, {
            "custom-pdigest-ctime": digested ? `🔨#${raw}` : (doneCtime(raw) ?? raw),
        } as any);
        n++;
    }
    return n;
}

/** 转出为摘抄（解除关联·物理档）：归属自指改写（ctime/index 的 bookID→docID，锤态
 *  随行 retargetCtime）+ moveDocs 落「摘抄」总夹。自指=free 摘抄同款身份形态——写作
 *  书池查询（ctime like bookID#%）自然少一条、文档 id 不变=已入槽胶囊 MATERIAL_KEY
 *  血缘不断（与删除的分野）。顺序纪律同 moveDigestToPool：先 move 后改写（失败态可
 *  重试自愈）。非素材 docID 抛错由调用方兜底 toast。 */
export async function transferMaterialOut(docID: string): Promise<void> {
    const attrs = await siyuan.getBlockAttrs(docID);
    const raw = attrs?.["custom-pdigest-ctime"] ?? "";
    if (!parseBookIDFromCtime(raw)) throw new Error("transferOut: not a digest doc");
    const from = await docBoxPath(docID);
    const hubID = await progStorage.ensureDigestHub();
    if (!hubID) throw new Error("transferOut: hub not ready");
    const to = await docBoxPath(hubID);
    if (!from.box || !from.path || !to.box || !to.path) throw new Error("transferOut: path missing");
    await siyuan.moveDocs([from.path], to.path, to.box);
    // idxTail 形态守卫（review P2-3，与 retargetCtime 段数守卫对称）：非 10 位数字的
    // 脏值落未索引占位，不透传污染排序展示
    const idxRaw = String(attrs?.["custom-pdigest-index"] ?? "").split("#").at(-1) ?? "";
    const idxTail = /^\d{10}$/.test(idxRaw) ? idxRaw : "0000000000";
    await siyuan.setBlockAttrs(docID, {
        "custom-pdigest-ctime": retargetCtime(raw, docID),
        "custom-pdigest-index": `${docID}#${idxTail}`,
    } as any);
    debugLog("matflow", `transferOut doc=${docID} → hub=${hubID}`, "progressive");
}

/** 批量删除素材（removeDocByID 一发即删，调用方必须先 confirm）：逐篇删并计数。
 *  子摘抄守卫（review P1-4，moveDigestIntoPiece 同款纪律）：素材下可有物理子文档
 *  （挂源文档下再摘抄/用户手挂笔记），removeDocByID 一发删整棵子树——删前 path 层
 *  反查（blocks 表文档行 parent_id 恒空，父子在 path；子文档物理目录=父 id 不带 .sy），
 *  有子文档的单篇跳过不删。端点无逐篇失败信号（code 0 假成功坑族）——清单生命周期
 *  内不复核（doSend 先例），重开 Dialog 自然重查拿真态；真 throw 不计数（toast 已删
 *  N 篇=n 真实删成数，失败可见）。已入槽胶囊血缘死链=首版容忍（跳转失败 toast 兜底）。 */
export async function removeMaterialDocs(docIDs: string[]): Promise<number> {
    let n = 0;
    for (const id of docIDs) {
        try {
            const path = String((await siyuan.getBlockInfo(id))?.path ?? "").replace(/\.sy$/, "");
            if (path) {
                const kids = await siyuan.sql(
                    `select count(*) as c from blocks where path like '${path}/%' limit 1`) as any;
                if (Number(kids?.[0]?.c ?? 0) > 0) continue; // 有子摘抄：跳过保树
            }
            await siyuan.removeDocByID(id);
            n++;
        } catch { /* 单篇失败不计——n=真实删成数 */ }
    }
    return n;
}

/** 推式「入槽」菜单数据（progtree □1 树形版）：writing 且未完稿的书（最近活跃
 *  在前）+ 各书未定稿槽（树序展开、depth 缩进依据、parentID=同层判定；槽名=
 *  剥 [N] 前缀后的纯槽名） */
export interface WritingSlotTarget {
    bookID: string;
    name: string;
    slots: { point: number; docID: string; title: string; depth: number; parentID: string }[];
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
        const slots = await fetchWritingTreeSlots(bookID);
        const openIDs = new Set(pieces.filter(p => !p.done).map(p => p.docID));
        out.push({
            bookID,
            name: info.bookName || bookID,
            slots: slots.filter(s => openIDs.has(s.docID))
                .map(s => ({ point: s.point, docID: s.docID, title: slotNameFromTitle(s.title), depth: s.depth, parentID: s.parentID })),
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
    const writing = await orderedWritingBooks();
    if (writing.length === 0) return null;
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

/** □4③ 写作书子集（过滤+滚筒序排序）：pickWritingFlameBook 与写作语境换书共用，
 *  防两处选择逻辑漂移（fleet 刷新与打开侧共用同款纪律） */
export async function orderedWritingBooks(): Promise<[string, NonNullable<ReturnType<typeof progStorage.booksInfos>[string]>][]> {
    const infos = progStorage.booksInfos();
    const writing = Object.entries(infos).filter(([id, info]) =>
        info.writing && !info.ignored && !info.archived && progStorage.isRegisteredBook(id));
    const order = (await progStorage.loadReadingOrder()).order;
    const rank = new Map(order.map((id, i) => [id, i]));
    return writing.sort((a, b) => (rank.get(a[0]) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b[0]) ?? Number.MAX_SAFE_INTEGER));
}

/** □4③ 写作语境换一本：已排序写作书 id 序里取当前的下一本（环形）。当前不在序中
 *  （刚归档/状态刷新间隙）回落序首；单本返回自身（调用方判同 id 给对症提示） */
export function nextOfOrderedIDs(ids: string[], current: string): string {
    if (ids.length === 0) return "";
    const i = ids.indexOf(current);
    return ids[(i + 1) % ids.length];
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

// ============ 期4 片管理（progtree □1 树序版：改号循环整体退役——插入/删除靠
// changeSort 钉位与树自动收敛，纯函数只剩 outline 的建片计划） ============

/** 片名 [NNNNN]槽名 → 槽名（无前缀原样返回；用户手改过片名也容错） */
export function slotNameFromTitle(title: string): string {
    return title.replace(/^\[\d+\]/, "");
}

// ============ 期4 片管理：IO 接线 ============

/** 定稿/解除（可逆）：定稿件调度跳过、进度计数；解除=删属性回队
 *  （setBlockAttrs 空串=删属性，期2 已验）。空属性值有 SQL 索引延迟窗口，
 *  调度侧 fetchWritingPieces 走 attributes join 同延迟，自洽 */
export async function setPieceDoneState(pieceDocID: string, done: boolean) {
    await siyuan.setBlockAttrs(pieceDocID, { [PROG_DONE_KEY]: done ? "1" : "" } as any);
}

/** 拆为新片（progtree □1 树序版）：选中块移入新片，新片钉到当前槽**同层**其后
 *  （insertDocAfter=同层 changeSort 插位，无全片改号循环）。顺序：①只读预检（槽
 *  名/选中块/当前槽在树内/同父无同名——最可能的失败点在改数据前消灭）→②建新片
 *  （物理默认插顶）→③钉位（失败不回滚：新片留在层顶可手动拖正，重试被同名预检
 *  拦住不扩散）→④搬块 →⑤activePoint=新片树 index（markPieceActive 跟视点）。
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

    // ① 只读预检（全部不依赖写入结果，先行；失败零副作用；invalidate 同 merge——
    // 缓存窗口内槽被拖走/拖入会让 parentID 判错层）
    invalidateWritingTreeCache(bookID);
    const slots = await fetchWritingTreeSlots(bookID);
    const cur = slots.find(s => s.docID === pieceDocID);
    if (!cur) throw new Error("splitPiece: piece not in book");
    const info = await progStorage.booksInfo(bookID);
    const box = info.boxID || (await docBoxPath(pieceDocID)).box;
    if (!box) throw new Error("splitPiece: box missing");
    const parentHPath = await siyuan.getHPathByID(cur.parentID, box);
    if (!parentHPath) throw new Error("splitPiece: parent hpath missing");
    const path = `${parentHPath}/${slotName}`;
    if (await docIDAtPath(box, path)) throw new Error("splitPiece: piece name conflict");

    // ② 建新片（嵌套槽内拆分=新片落当前槽同父，树形结构自然生长）
    const attrs = {
        "custom-card-priority": "50",
        [MarkKey]: getDocIalPieces(bookID, 0),
        alias: pieceAlias(info.bookName || "", slotName),
    } as AttrType;
    const newDocID = await siyuan.createDocWithMd(box, path, "", "", attrs);
    if (!newDocID) throw new Error("splitPiece: piece doc not created");
    // ③ 钉位（失败容忍——层顶新片可手动归位，树序权威下无身份损伤）
    try {
        await insertDocAfter(box, newDocID, pieceDocID);
    } catch (e) {
        debugLog("progtree", `split insertAfter failed doc=${newDocID}（新片留层顶，可手动归位）: ${e}`);
    }
    // ④ 搬块 ⑤ activePoint 跟视点（markPieceActive=树 index 反查，失败 best-effort）
    await siyuan.moveBlocksAsChild(selectedIDs, newDocID);
    invalidateWritingTreeCache(bookID);
    await markPieceActive(newDocID, bookID);
    return newDocID;
}

/** 期D 书尾新建空槽（progtree □1 树序版）：建片（纯槽名+身份标记 0）→
 *  appendDocToEnd 钉书下层尾（物理默认插顶的逆操作）。路径占用预检同建书纪律
 *  （拒劫持）。返回新槽 docID；失败抛错由弹窗层 catch 给 toast。槽数变化由调用方
 *  notifyFleetChanged */
export async function appendEmptyPiece(bookID: string, slotNameRaw: string): Promise<string> {
    const info = await progStorage.booksInfo(bookID);
    const bookRow = await siyuan.sqlOne(`select box, hpath from blocks where type='d' and id='${bookID}'`);
    if (!bookRow?.box || !bookRow?.hpath) throw new Error("appendPiece: book not found");
    const plan = planAppendPiece(bookID, info.bookName || "", slotNameRaw);
    const path = `${bookRow.hpath}/${plan.title}`;
    if (await docIDAtPath(bookRow.box, path)) throw new Error("appendPiece: piece name conflict");
    const docID = await siyuan.createDocWithMd(bookRow.box, path, "", "", plan.attrs);
    if (!docID) throw new Error("appendPiece: piece doc not created");
    await appendDocToEnd(bookRow.box, docID, bookID);
    invalidateWritingTreeCache(bookID);
    return docID;
}

/** 与邻槽合并（progtree □1 树序版）：邻居=**同 parentID 的同层相邻槽**（跨层不并
 *  ——嵌套结构下子槽并叔槽不自然，同层才是语义邻居；「已是第一/最后一个槽」=
 *  同层无邻居）。序号收敛循环退役（树里少一行自动收敛）。
 *  顺序（风险重心=删文档不可逆，故删后置+删前空校验）：
 *  ① 只读预检（书/两槽在树、同层邻居存在）→ ② 定稿双向拦（PieceMovingBox 语义：
 *    保留槽已定稿=不可移入；被删槽已定稿=不可移出。错误 message 约定 "kept
 *    done"/"removed done" 供调用方映射 i18n）→ ②b **子槽守卫（树形化独有）**：
 *    被删槽有子槽=抛错（removeDocByID 连删整棵子树不可接受，先处理子槽再并；
 *    "has sub-slots"）→ ③ 搬块（被删槽全部子块尾插保留槽，保序）→ ④ 删源槽
 *    （删前 getChildBlocks 复核源已空——搬块残留=中止不删防丢数据）→ ⑤ 无收敛
 *    循环；activePoint=保留槽树 index（markPieceActive）。
 *  重试幂等：已搬走的块在保留槽尾部，重试续搬剩余 */
export async function mergePieceIntoNeighbor(
    bookID: string,
    pieceDocID: string,
    dir: -1 | 1,
): Promise<{ keptDocID: string; keptPoint: number; removedPoint: number }> {
    // ① 只读预检（P1-3：破坏性操作强制实拉——30s 缓存窗口内手动建的子槽对守卫不可见
    // 会被 removeDocByID 连坐整棵子树；split 预检同款）
    invalidateWritingTreeCache(bookID);
    const slots = await fetchWritingTreeSlots(bookID);
    const cur = slots.find(s => s.docID === pieceDocID);
    if (!cur) throw new Error("mergePiece: piece not in book");
    const sameLayer = slots.filter(s => s.parentID === cur.parentID);
    const i = sameLayer.findIndex(s => s.docID === pieceDocID);
    const neighbor = sameLayer[i + dir];
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
    // ②b 子槽守卫：被删槽的子槽（同 parentID 命中）连坐整棵子树不可接受
    if (slots.some(s => s.parentID === removedDocID)) {
        throw new Error("mergePiece: removed piece has sub-slots");
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
    invalidateWritingTreeCache(bookID);
    await markPieceActive(keptDocID, bookID);
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

    // 注册书身份（books.json）；索引恒空——写作书不维护预存索引（设计共识）。
    // progtree □1：出生即树序语义（treeAligned 置位，永不走存量整理）
    const info = ProgressiveStorage.defaultBookInfo();
    info.time = await siyuan.currentTimeMs();
    info.boxID = boxID;
    info.bookID = bookID;
    info.bookName = bookName;
    info.writing = true;
    info.treeAligned = true;
    await progStorage.resetBookInfo(bookID, info);

    // 期A 素材并行：大纲空=纯收集书（无槽，只进素材池；滚筒分派走素材优先链），
    // 不再兜底建默认槽——老书已建的默认槽不受影响（存量数据不动）
    const slots = parseOutlineLines(outlineRaw);
    const pieceIDs: string[] = [];
    for (const p of planWritingPieces(bookID, bookName, slots)) {
        const path = `/${bookName}/${p.title}`;
        const existing = await docIDAtPath(boxID, path);
        if (existing) {
            // 同名子文档仅在带本题 MarkKey 前缀时认领（删记录重建场景的旧槽——
            // 真值/统一 0 值都认，树序权威下不比值）；撞上普通文档则拒绝，防二次劫持
            const attrs = await siyuan.getBlockAttrs(existing);
            if (!attrs?.[MarkKey]?.startsWith(`${TEMP_CONTENT}#${bookID},`)) {
                throw new Error("createWritingBook: piece name conflict");
            }
            pieceIDs.push(existing);
            continue;
        }
        pieceIDs.push(await siyuan.createDocWithMd(boxID, path, "", "", p.attrs));
    }
    // 建后按大纲序钉位（createDocWithMd 逐个默认插顶=物理倒序，一次 changeSort 钉正）
    if (pieceIDs.length > 1) {
        const paths: string[] = [];
        for (const id of pieceIDs) {
            const info2 = await siyuan.getBlockInfo(id).catch(() => null);
            const p = (info2 as any)?.path;
            if (!p) throw new Error("createWritingBook: piece path missing");
            paths.push(p);
        }
        await siyuan.call("/api/filetree/changeSort", { notebook: boxID, paths });
        debugLog("progtree", `createWritingBook pinned ${paths.length} slots（大纲序）`);
    }
    return { bookID, pieceIDs };
}
