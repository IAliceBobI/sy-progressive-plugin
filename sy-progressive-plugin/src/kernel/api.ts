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

/** 建文档（HTTP 直调 custom- 字段不落 IAL——09-13 实测，建后须补 setBlockAttrs）；data 空时按 hpath 直查兜底（前端两态同款） */
export async function createDocWithMd(notebook: string, path: string, markdown: string): Promise<string> {
  let id = await call("/api/filetree/createDocWithMd", { notebook, path, markdown });
  if (!id) id = (await call("/api/filetree/getIDsByHPath", { notebook, path }))?.[0];
  return id ?? "";
}

/** 块整块替换（dataType=markdown；返回事务数组，块 id 恒不变无需回读） */
export async function updateBlock(id: string, data: string, dataType = "markdown"): Promise<any> {
  return call("/api/block/updateBlock", { id, data, dataType });
}

/** 块尾追加（返回事务数组——形态同 appendBlock：读块 id 走 doOperations[0].id） */
export async function insertBlock(parentID: string, data: string, dataType = "markdown"): Promise<any> {
  return call("/api/block/insertBlock", { parentID, data, dataType, previousID: "" });
}

/** 文件树目录枚举（直查无索引窗；maxListCount:0 防截断）。空/不存在目录内核返
 *  code=-1+data=null（09-13 6808 实测）——语义化为 [] 返；其余 code!=0 与网络 reject
 *  上抛（progtree □2 P1-2：fail-open 会把瞬断当空树，apply 误建重复槽） */
export async function listDocsByPath(notebook: string, path: string): Promise<any[]> {
  const d = await call("/api/filetree/listDocsByPath", { notebook, path, maxListCount: 0 })
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

/** hpath → doc id 数组（建前同名预检防劫持；⚠ 端点 P 大写，小写 p=404 静默空——前端 docIDAtPath 注释） */
export async function getIDsByHPath(notebook: string, path: string): Promise<string[]> {
  const ids = await call("/api/filetree/getIDsByHPath", { notebook, path });
  return Array.isArray(ids) ? ids.map(String) : [];
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
