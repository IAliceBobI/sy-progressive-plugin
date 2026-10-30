// kernel 侧思源 API 薄封装：一律走 siyuan.client.fetch（内核代理 REST + 插件 JWT 自鉴权）。
// 端点与参数同前端 siyuanApi 逐一对齐；勿 import 前端 siyuanApi——其依赖 window/fetch/Lute 全局。
// （照 sy-recite-plugin/src/kernel/api.ts 精简，只留查询面。）
export async function call(path: `/${string}`, payload?: Record<string, any>): Promise<any> {
  const resp = await siyuan.client.fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  });
  const d = await resp.json();
  if (d && typeof d.code === "number" && d.code !== 0) {
    throw new Error(`API ${path} code=${d.code} ${String(d.msg ?? "").slice(0, 120)}`.trim());
  }
  return d?.data ?? d;
}

export async function sql<T = any>(stmt: string): Promise<T[]> {
  return (await call("/api/query/sql", { stmt })) ?? [];
}

export async function getBlockAttrs(id: string): Promise<Record<string, string>> {
  return (await call("/api/attr/getBlockAttrs", { id })) ?? {};
}

export async function setBlockAttrs(id: string, attrs: Record<string, string>): Promise<void> {
  await call("/api/attr/setBlockAttrs", { id, attrs });
}

// ============ □7 知识地图 IO 面新增（端点参数对齐前端 siyuanApi 逐一核实） ============

/** 文档内容块直读（文件树通道，无 SQL 索引窗；type='custom' 的围栏块 content=纯 JSON） */
export async function getChildBlocks(id: string): Promise<any[]> {
  return (await call("/api/block/getChildBlocks", { id })) ?? [];
}

/** 块/文档归属信息（box/path）；书壳定位建图文档用 */
export async function getBlockInfo(id: string): Promise<any> {
  return call("/api/block/getBlockInfo", { id });
}

/** 可读路径（如 /目录书T）；createDocWithMd 的 path 参数形态 */
export async function getHPathByID(id: string, notebook: string): Promise<string> {
  return call("/api/filetree/getHPathByID", { id, notebook });
}

/** 建文档（HTTP 直调 custom- 字段不落 IAL——09-13 实测，建后须补 setBlockAttrs）。
 *  addr-adapt（思源 3.8.9 结构化寻址，事实源=docs/addr-adapt/master-spec.md §2）：旧端点
 *  优先、legacy 类报错自动切 createDocByParent+逐级补建父级，穷尽两通道后显式 throw
 *  DocCreateError（原 throw 型 call 语义升级为携 reason 的建档专用错误）；data:null 索引窗
 *  仍返 ""（旧静默契约）。可选第 4 参 parentID（B0 传参：bookMapIo/structureIo 父 id 在手
 *  直传跳过解析；不传=A 档 resolveParentChain 全段解析+同名认领）。attr 两步 IAL 由调用方
 *  自理（kernel 惯例，bookConvertIo:157 先例）。 */
export async function createDocWithMd(notebook: string, path: string, markdown: string, parentID?: string): Promise<string> {
  return createDocSmart(notebook, path, markdown, { parentID });
}

/** 块整块替换（dataType=markdown；返回事务数组，块 id 恒不变无需回读） */
export async function updateBlock(id: string, data: string, dataType = "markdown"): Promise<any> {
  return call("/api/block/updateBlock", { id, data, dataType });
}

/** 块尾追加（返回事务数组——形态同 appendBlock：读块 id 走 doOperations[0].id）。
 *  previousID 非空=插在该块之后（成文续写钉文档尾：getDocLastID 传入）；空=首子位 */
export async function insertBlock(parentID: string, data: string, dataType = "markdown", previousID = ""): Promise<any> {
  return call("/api/block/insertBlock", { parentID, data, dataType, previousID });
}

/** 文件树目录枚举（磁盘直查无索引窗；maxListCount:0 防截断；sort=15 生效序=文档
 *  自定义序——不传则吃用户全局排序档，字母序用户会把槽序/changeSort 钉序碾错
 *  〔review P2-7：注释宣称 sort=15 实未传，按 doctree-order 通道契约补上〕）。
 *  空或不存在目录内核返 code=-1+data=null（09-13 6808 实测）——语义化为 [] 返；
 *  其余 code!=0 与网络 reject 上抛（progtree □2 P1-2：fail-open 会把瞬断当空树，
 *  apply 误建重复槽） */
export async function listDocsByPath(notebook: string, path: string): Promise<any[]> {
  const d = await call("/api/filetree/listDocsByPath", { notebook, path, maxListCount: 0, sort: 15 })
    .catch((e: any) => {
      if (/code=-1(?!\d)/.test(String(e?.message ?? e))) return null;
      throw e;
    });
  return (d && Array.isArray(d.files)) ? d.files : [];
}

// ============ 老书转目录成书（convert）新增：写面端点 ============

/** 文件树钉序（全量新序数组提交；与前端 splitVolsDeps.sortDocs 同端点同参） */
export async function changeSort(notebook: string, paths: string[]): Promise<void> {
  await call("/api/filetree/changeSort", { notebook, paths });
}

/** 删文档（入参单字段 id；调用方自行负责可恢复性——历史走 -delete- 即时生成） */
export async function removeDocByID(id: string): Promise<void> {
  await call("/api/filetree/removeDocByID", { id });
}

/** 批量删块（事务通道，与前端 siyuan.deleteBlocks 同构——payload 须包 transactions
 *  数组〔裸 operations 报 Field required〕；reqId 须数字〔HTTP 事务假成功坑族〕——
 *  code 0≠落盘，调用方须复核读兜底，勿据回执判成功） */
export async function deleteBlocks(ids: string[]): Promise<any> {
  if (!ids?.length) return null;
  return call("/api/transactions", {
    session: "sy-progressive-plugin-kernel",
    app: "sy-progressive-plugin-kernel",
    transactions: [{ doOperations: ids.map(id => ({ action: "delete", id })) }],
    reqId: Date.now(),
  });
}

/** 清文档闪卡（内核 removeDoc 不清 riff，删片前先行——deleteAllPieces 同语义） */
export async function removeRiffCards(ids: string[]): Promise<void> {
  await call("/api/riff/removeRiffCards", { ids });
}

// ============ □2 结构树（structure）新增：移动/预检/尾块端点 ============

/** 文档物理移动（保 id 整树搬；参数名与前端 siyuanApi.moveDocs 逐字对齐） */
export async function moveDocs(fromPaths: string[], toPath: string, toNotebook: string): Promise<void> {
  await call("/api/filetree/moveDocs", { fromPaths, toPath, toNotebook });
}

/** hpath → doc id 数组（建前同名预检防劫持）。addr-adapt：旧端点 getIDsByHPath 被 3.8.9
 *  限制（throw 型 call 会直接报错、前端侧吞错返 null=恒「无同名」预检失明），统一换 SQL
 *  单通道（master-spec §2.2：全版本可用、不经被禁端点）。签名/throw 形态不变（调用方
 *  structureIo 预检两处零改动）；值内 " → "" 双写转义（评审#3：/api/query 只收语句串无
 *  参数化通道，hpath 输入面含回读真实标题）。边界：同名多行返数组同旧行为；异步索引滞后
 *  ——刚建文档查不到，只服务「找既有文档」。 */
export async function getIDsByHPath(notebook: string, path: string): Promise<string[]> {
  return docIDsByHPath(notebook, path);
}

/** 文档尾块 id（复刻自前端 getDocLastID：getTailChildBlocks n=1） */
export async function getDocLastID(id: string): Promise<string> {
  const rows = await call("/api/block/getTailChildBlocks", { id, n: 1 }).catch(() => null);
  return String((rows as any[])?.[0]?.id ?? "");
}

/** 块尾插移动（事务通道：op.action="move"+previousID；假成功坑→调用方复核读兜底） */
export async function transMoveBlocksAfter(ids: string[], previousID: string): Promise<any> {
  if (!ids?.length) return null;
  return call("/api/transactions", {
    session: "sy-progressive-plugin-kernel",
    app: "sy-progressive-plugin-kernel",
    transactions: [{ doOperations: ids.map(id => ({ action: "move", id, previousID })) }],
    reqId: Date.now(),
  });
}

/** 块挂子移动（move op 实为头插语义——reverse 保序，前端 transMoveBlocksAsChild 同构） */
export async function transMoveBlocksAsChild(ids: string[], parentID: string): Promise<any> {
  if (!ids?.length) return null;
  return call("/api/transactions", {
    session: "sy-progressive-plugin-kernel",
    app: "sy-progressive-plugin-kernel",
    transactions: [{ doOperations: ids.slice().reverse().map(id => ({ action: "move", id, parentID })) }],
    reqId: Date.now(),
  });
}

// ============ 建档双通道（思源 3.8.9 结构化寻址适配；事实源=docs/addr-adapt/ ============
// master-spec.md §2 + contract-createDocByParent.md；镜像 tomato siyuanApi.ts createDocSmart，
// 前端/kernel 各写一份共享策略不共享代码——本仓三家 kernel/api.ts 本是独立拷贝）。
// kernel 侧差异（goja 运行时边界，master-spec §2.1）：无 navigator.locks/Lute/debugLog——
// ⚠️ 无锁=残留并发窗口：新链路 resolve+create 多次往返，两个并发对同一缺失父链会各建
// 一份中间层（与旧通道内核 createDocLock 全局锁的差距，nameConditions 乐观锁缓解不消除，
// 跨插件/跨端并发同样锁不住——诚实接受，kernel 侧建档均为 MCP 单调用低频面）；NodeID
// 自实现（newNodeID）；日志走 siyuan.logger（kernel 打点唯一通道，前端才走 debugLog）。

/** 建档穷尽两通道后的显式失败。commitState=committed 时文档已落盘（排序/模板阶段失败但
 *  源已提交），调用方勿盲目重试——会建重复文档；unknown=请求可能已落地（网络中断形态），
 *  docID 尽量携带供调用方复核。 */
export class DocCreateError extends Error {
  constructor(
    public reason: string, // 内核 data.reason（legacyPathUnsupported/parentUnavailable/…）或封内合成码
    public lastMsg: string,
    public commitState: "none" | "committed" | "unknown" = "none",
    public docID?: string,
  ) {
    super(`doc create failed [${reason}] ${lastMsg}`.trim());
    this.name = "DocCreateError";
  }
}

/** callFull 传输/响应形态层异常（区别于内核业务 {code,msg,data}）：http=HTTP 404（端点被删
 *  形态=legacy 信号切新通道，附加加固）、badJson=2xx 响应非 JSON（同上）、network=请求本身
 *  失败（瞬态，不作 legacy 信号）。 */
class EndpointTransportError extends Error {
  constructor(msg: string, public kind: "network" | "http" | "badJson", public status = 0) {
    super(msg);
    this.name = "EndpointTransportError";
  }
}

/** 旧端点拒绝集（按 "notebook|path" 记，决策 §4.2）：同路径后续建档直走新通道、异路径仍
 *  先试旧通道（contract §6 判定是路径级，全局置位会把一次脏路径事件放大成全会话切新，
 *  评审#8）。≤128 条、模块级随 kernel.js 生命周期、不持久化。 */
const legacyPathRejects = new Set<string>();
function markLegacyRejected(key: string) {
  if (legacyPathRejects.size >= 128) legacyPathRejects.clear();
  legacyPathRejects.add(key);
}

/** createDocByParent/resolveDocPath 的同名乐观锁条件（内核 DocumentNameCondition，
 *  contract §2/§7：三键必在、title 非 null、parentID/expectedID 可 null） */
interface DocNameCondition {
  parentID: string | null;
  title: string;
  expectedID: string | null;
}

/** 新端点链路中间态重试信号（resolveParentChain 补建中间段遇 parentUnavailable/planChanged
 *  时上抛，由 createDocSmart 清缓存整链重试一次） */
class ChainRetrySignal extends Error {
  constructor(public reason: string, public msg: string) {
    super(reason);
  }
}

/** kernel 侧打点（[addr] 前缀对齐前端 debugLog("addr") 口径，Loki 观察位：createDocByParent
 *  首现=新通道启用信号、legacyPathUnsupported 计数=旧通道被拒频率） */
function logAddr(msg: string) {
  try { void siyuan.logger.info("[addr]", msg); } catch { /* logger 缺失（单测 stub）静默 */ }
}

/** 思源式块 id：yyyymmddhhmmss-xxxxxxx（14 位时间戳+随机 7 位 [0-9a-z]，内核 IsNodeIDPattern
 *  严校验）。前端用 Lute.NewNodeID 全局，goja 无 Lute——自实现（抄 recite kernel/api.ts）。 */
export function newNodeID(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  let rnd = "";
  for (let i = 0; i < 7; i++) rnd += Math.floor(Math.random() * 36).toString(36);
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${rnd}`;
}

/** 建档 hpath 末段（文档名）元字符 sanitize（复刻 tomato siyuanApi.sanitizePathTail，kernel
 *  bundle 勿 import 前端文件——其依赖 window/fetch/Lute 全局）：只净化最后一段（前缀段是
 *  调用方故意拼的层级）；末段 / → 全角／、\t\r\n\u2028\u2029 → 空格、反斜杠原样。幂等。 */
function sanitizePathTail(pathReadable: string): string {
  const idx = pathReadable.lastIndexOf("/");
  const head = idx < 0 ? "" : pathReadable.slice(0, idx + 1);
  const tail = (idx < 0 ? pathReadable : pathReadable.slice(idx + 1))
    .replace(/[\t\r\n\u2028\u2029]/g, " ").replace(/\//g, "／");
  return head + tail;
}

/** 用户字符串级 sanitize（复刻 tomato siyuanApi.sanitizeName）：新建中间段名先过此函数——
 *  含 / 标题会污染整条 hpath 旧寻址链=亲手造脏数据（contract §10）。已存在段按原段名查
 *  （净化会查不中既有落盘名）。幂等。 */
function sanitizeName(name: string): string {
  return name.replace(/[\t\r\n\u2028\u2029]/g, " ").replace(/\//g, "／");
}

/** 标题 512 rune 截断（对齐旧端点 filetree.go:958-963 静默截断语义，评审#7②：新端点
 *  invalidTitle 拒超长——封内截断防「截断建档」变 throw；rune 感知防 UTF-16 代理对劈半） */
function clampTitle512(title: string): string {
  const runes = Array.from(title);
  if (runes.length <= 512) return title;
  logAddr(`title ${runes.length} runes clipped to 512 (kernel legacy silent-truncation parity)`);
  return runes.slice(0, 512).join("");
}

/** 完整响应版 call（建档族封内专用，不动 call 的 throw 语义——决策 §4.1）：返
 *  {code,msg,data} 全量信封，内核业务失败（code≠0）原样返回供上层读 data.reason 分诊；
 *  传输/响应形态层异常以 EndpointTransportError throw：HTTP 404/非 JSON=端点被删形态
 *  （legacy 信号切新通道，附加加固），client.fetch 异常=瞬态不作 legacy 信号。 */
async function callFull(path: `/${string}`, payload?: Record<string, any>): Promise<{ code?: number; msg?: string; data?: any }> {
  let resp: import("siyuan/kernel").IFetchResponse;
  try {
    resp = await siyuan.client.fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload ?? {}),
    });
  } catch (e) {
    throw new EndpointTransportError(e instanceof Error ? e.message : String(e), "network");
  }
  if (resp.status === 404) throw new EndpointTransportError(`HTTP 404 ${path}`, "http", 404);
  if (!resp.ok) return { code: resp.status, msg: `HTTP ${resp.status} ${path}` }; // 5xx 等=普通 code≠0 失败
  try {
    return await resp.json() as { code?: number; msg?: string; data?: any };
  } catch {
    throw new EndpointTransportError(`non-JSON response from ${path}`, "badJson", resp.status);
  }
}

/** hpath→文档 id 定位（SQL 单通道，getIDsByHPath 的实体；样板=tomato siyuanApi docIDsByHPath）：
 *  select id from blocks where box=? and hpath=? and type='d'；失败/无命中返 []（sql call
 *  throw 形态由调用方承接，与旧端点 throw 语义一致）。 */
export async function docIDsByHPath(notebook: string, hpath: string): Promise<string[]> {
  const esc = (s: string) => s.replaceAll('"', '""');
  const rows = await sql<{ id: string }>(
    `select id from blocks where box="${esc(notebook)}" and hpath="${esc(hpath)}" and type='d'`);
  // Array.isArray 守卫：call() 的 data??d 兜底在 data:null 时返整个信封对象（非数组）
  return (Array.isArray(rows) ? rows : []).map(r => r?.id).filter((i): i is string => typeof i === "string");
}

/** createDocByParent 单发（未知字段零携带——内核 UnmarshalJSON DisallowUnknownFields，
 *  contract §2：旧接口的 path 等字段顺手传进来会直接解码失败）。返回成败结构不 throw，
 *  供 resolveParentChain（中间段）与 createDocSmart（叶子）各自按 reason 分诊。 */
async function createByParentOnce(
  notebook: string,
  parentID: string | null, // 根级固定 null（传笔记本 ID 不可靠：boxDocEnabled 默认关，contract §4）
  id: string,
  title: string,
  markdown: string, // 空串合法（建空文档）
  nameConditions?: DocNameCondition[],
): Promise<{ ok: boolean; id?: string; reason?: string; msg?: string; commitState?: string }> {
  const req: Record<string, unknown> = {
    notebook,
    parentID,
    id,
    title: { format: "plain", text: title },
    markdown,
  };
  if (nameConditions?.length) req.nameConditions = nameConditions;
  const resp = await callFull("/api/filetree/createDocByParent", req as Record<string, any>);
  if (resp.code === 0) {
    const dataID = resp.data?.id;
    return { ok: true, id: typeof dataID === "string" && dataID ? dataID : id };
  }
  const f = resp.data ?? {};
  return {
    ok: false,
    reason: typeof f.reason === "string" ? f.reason : `code=${resp.code}`,
    msg: resp.msg ?? "",
    commitState: typeof f.commitState === "string" ? f.commitState : "none",
    id: typeof f.id === "string" ? f.id : undefined,
  };
}

/** A 档全段解析+逐级补建（createDocSmart 新通道专用，3.8.9+）：resolveDocPath 逐级精确匹配
 *  标题（COLLATE BINARY）。resolved=全段命中（含末段）=**同名认领**——对齐旧端点 hpathBtMap
 *  复用语义（命中已有文档不建孪生，评审#7①）；ambiguous=取首候选+日志续解析余段（决策
 *  §4.5：中间层全是插件自管目录，不弹选择框）；missing=自 nextIndex（首个缺失段下标）起
 *  逐级补建**中间段**——叶子由调用方携真实 markdown 落。首个补建段带 missing 响应的
 *  nameConditions 乐观锁（并发改动链路内核报 planChanged，评审#7③）。已存在前缀按原段名查
 *  （不净化）；新建中间段先过 sanitizeName+512 rune 截断。 */
async function resolveParentChain(
  notebook: string,
  segments: string[], // 全段（含末段叶子，均非空）
): Promise<{ claimID?: string; parentID: string | null; nameConditions?: DocNameCondition[] }> {
  let start: { kind: "root" } | { kind: "document"; id: string } = { kind: "root" };
  let rest = segments;
  for (;;) {
    const resp = await callFull("/api/filetree/resolveDocPath", { notebook, start, segments: rest });
    if (resp.code !== 0) {
      // DocumentAddressingFailure{reason}（invalidTitle/indexUnavailable/…）或裸 {code,msg}
      const reason = resp.data?.reason;
      throw new DocCreateError(typeof reason === "string" ? reason : `code=${resp.code}`, resp.msg ?? "", "none");
    }
    const d = resp.data ?? {};
    if (d.status === "resolved") {
      const leafID = d.resolved?.id;
      if (leafID) return { claimID: leafID, parentID: null };
      // 空 segments+root start 形态 resolved=null（无段可解析=根）——交调用方根级建档
      return { parentID: null };
    }
    if (d.status === "ambiguous") {
      const first: string | undefined = d.candidates?.[0]?.id;
      logAddr(`resolveDocPath ambiguous at #${d.nextIndex} "${rest[d.nextIndex] ?? ""}" — 取首候选 ${first}（决策：不弹选择框）`);
      if (!first) throw new DocCreateError("pathAmbiguous", "ambiguous response carries no candidate", "none");
      start = { kind: "document", id: first };
      rest = rest.slice(d.nextIndex + 1);
      continue;
    }
    // missing：nextIndex=首个缺失段。resolved=已解析最深文档（nextIndex=0 时为 null=根）
    const from = typeof d.nextIndex === "number" ? d.nextIndex : 0;
    let parentID: string | null = d.resolved?.id ?? null;
    let conditions: DocNameCondition[] | undefined = Array.isArray(d.nameConditions) ? d.nameConditions : undefined;
    for (let i = from; i < rest.length - 1; i++) { // 只补中间段，叶子留给调用方
      const segTitle = clampTitle512(sanitizeName(rest[i]));
      if (!segTitle) throw new DocCreateError("invalidTitle", `empty segment #${i} in [${rest.join("/")}]`, "none");
      const nid = newNodeID();
      const r = await createByParentOnce(notebook, parentID, nid, segTitle, "", i === from ? conditions : undefined);
      if (!r.ok) {
        if (r.reason === "parentUnavailable" || r.reason === "planChanged") {
          throw new ChainRetrySignal(String(r.reason), r.msg ?? "");
        }
        throw new DocCreateError(r.reason ?? "writeFailed", r.msg ?? "", (r.commitState ?? "none") as "none" | "committed" | "unknown", r.id);
      }
      parentID = r.id ?? nid;
      conditions = undefined; // 乐观锁只挂首个补建段（后续段挂自建父下，独占无竞态）
    }
    // 末段即首个缺失段时，乐观锁随叶子建档；中间段全建完则叶子挂自建父下、无需锁
    return { parentID, nameConditions: from === rest.length - 1 ? conditions : undefined };
  }
}

/** 建档双通道统一入口（思源 3.8.9 结构化寻址适配；镜像 tomato siyuanApi.createDocSmart）：
 *  旧端点 createDocWithMd 优先（3.8.8 全兼容+自动补建父级+同名静默认领），被内核以 legacy
 *  类 reason 拒或端点被删（404/非 JSON）→ 按路径记拒绝集、切新通道 createDocByParent：
 *  A 档 resolveParentChain 全段解析+逐级补建+同名认领；C 档 opts.parentID 直给（B0 传参）。
 *  穷尽后 throw DocCreateError（寻址被拒显式化）；data:null 索引窗返 ""（不 throw 不重试
 *  ——评审#2 旧静默契约：误判失败诱重试会建重复文档，兜底序=①回填 opts.id ②SQL 回查
 *  ③仍不中=索引窗返 ""）。parentUnavailable/planChanged（链路被并发改动）清拒绝集整链
 *  重试一次；commitState=committed 当成功。⚠️ kernel 侧无锁（goja 无 navigator.locks），
 *  并发窗口见文件头注释。 */
export async function createDocSmart(
  notebook: string,
  hpath: string,
  markdown: string,
  opts: { id?: string; parentID?: string } = {},
): Promise<string> {
  // 出口末段净化（幂等）：两通道共用净化后 path（查建同源）；末段即新端点 title
  const path = sanitizePathTail(hpath);
  const segs = path.split("/").filter(s => s !== "");
  const title = clampTitle512(segs.pop() ?? "");
  if (!title) throw new DocCreateError("invalidTitle", `empty document title in hpath "${path}"`, "none");
  // ""（非法值，封内拒绝）与 undefined（不传=A 档全段解析）显式区分（评审2轮#6 同款语义）
  if (opts.parentID === "") throw new DocCreateError("parentUnavailable", "parentID: empty string is not a valid parent (use null or omit)", "none");
  const rejectKey = `${notebook}|${path}`;

  // ── 旧通道：该路径不在拒绝集才试（干净路径 3.8.8/3.8.9-dev 照常，自动补建+同名静默
  //    认领是旧端点独有能力，故旧优先——决策 §4.3）──
  let id = "";
  if (!legacyPathRejects.has(rejectKey)) {
    try {
      const params: Record<string, unknown> = opts.id ? { notebook, path, markdown, id: opts.id } : { notebook, path, markdown };
      const resp = await callFull("/api/filetree/createDocWithMd", params as Record<string, any>);
      if (resp.code === 0) {
        id = typeof resp.data === "string" ? resp.data : "";
        if (!id) {
          // data 空兜底序（评审#2，承旧版 :49 getIDsByHPath 兜底语义）：①回填预生成 id
          // ②SQL 回查（索引窗内可能查不中）③仍不中=索引窗、文档已落盘——返 "" 不 throw
          // 不重试（显式 throw 只留寻址被拒）
          id = opts.id ?? (await docIDsByHPath(notebook, path))[0] ?? "";
          if (!id) {
            logAddr(`createDocWithMd code=0 but data empty (kernel data:null window) path=${path} — silent "" per legacy contract`);
            return "";
          }
        }
      } else {
        const reason = resp.data?.reason;
        if (reason === "legacyPathUnsupported" || reason === "pathAmbiguous" || reason === "indexUnavailable") {
          markLegacyRejected(rejectKey); // 记拒绝集，进新通道
        } else {
          throw new DocCreateError(typeof reason === "string" ? reason : `code=${resp.code}`, resp.msg ?? "", "none");
        }
      }
    } catch (e) {
      if (e instanceof DocCreateError) throw e;
      if (e instanceof EndpointTransportError && e.kind !== "network") {
        // HTTP 404/非 JSON=端点被删形态（附加加固）：legacy 信号，记拒绝集切新通道
        markLegacyRejected(rejectKey);
      }
      // network：瞬态不记拒绝集（下次仍先试旧通道），本轮落新通道兜底
    }
  }
  if (id) return id;

  // ── 新通道（3.8.9+；旧内核上 404 → EndpointTransportError 转 DocCreateError）──
  const newID = opts.id ?? newNodeID();
  for (let attempt = 0; ; attempt++) {
    try {
      let parentID: string | null;
      let leafConditions: DocNameCondition[] | undefined;
      if (opts.parentID !== undefined) {
        parentID = opts.parentID; // C 档：父 id 直给跳过解析；同名预检靠调用方 find-first
      } else {
        const chain = await resolveParentChain(notebook, [...segs, title]);
        if (chain.claimID) {
          // A 档全段命中=同名认领，直接复用不建孪生（等价旧 hpathBtMap 复用）
          return chain.claimID;
        }
        parentID = chain.parentID;
        leafConditions = chain.nameConditions;
      }
      const r = await createByParentOnce(notebook, parentID, newID, title, markdown, leafConditions);
      if (r.ok) return r.id ?? newID;
      if (r.commitState === "committed") {
        // 排序/模板阶段失败但源已提交——文档其实已建成，当成功防重复建档（contract §3.1）
        return r.id ?? newID;
      }
      if ((r.reason === "parentUnavailable" || r.reason === "planChanged") && attempt === 0) {
        // 链路被并发改动：清拒绝集（旧通道有机会复通）+整链重解析重试一次
        legacyPathRejects.clear();
        continue;
      }
      throw new DocCreateError(r.reason ?? "writeFailed", r.msg ?? "", (r.commitState ?? "none") as "none" | "committed" | "unknown", r.id);
    } catch (e) {
      if (e instanceof ChainRetrySignal) {
        if (attempt === 0) {
          legacyPathRejects.clear();
          continue;
        }
        throw new DocCreateError(e.reason, e.msg, "none");
      }
      if (e instanceof EndpointTransportError) {
        // 新端点不可达：404=旧内核无此端点（未落盘 none）；网络/非 JSON=请求可能已落地
        // （unknown，携 newID 供复核）
        const committed = e.kind === "http" ? "none" : "unknown";
        throw new DocCreateError(e.kind === "http" ? "newEndpointUnavailable" : "writeFailed", e.message, committed, e.kind === "http" ? undefined : newID);
      }
      throw e;
    }
  }
}
