// □7 知识地图节点池——纯函数层（零依赖，前端/kernel/vitest 三端单一事实源，reviewQueue 模式）。
// 池子=一书一份的客观账本（bear 拍板：节点/边全收，主观切法留给视图层 □8）：
//   - 节点={id,name,aliases,type,summary,anchors(证据锚=片 point 列表，可跳原文)}
//   - AI 提交宽松形态（IncomingNode/IncomingEdge），mergeIntoPool 做确定性对齐校验
//     （「AI 管语义、渐进管账」：撞名强制重用已有 id/anchor 越界剔除/悬空边丢弃，回执全量）。
// 落盘形态=专用文档内单块围栏 ;;;sy-progressive-plugin/book-map + 池子 JSON 单行
// （visit-note 同通道；JSON 单行天然过内核 isCustomBlockContentValid）。
// siyuan IO 面（找/建/读/写专用文档+素材收集）在 src/kernel/bookMapIo.ts——分层红线同
// visitNoteBlock/visitNoteAppend 族：本文件禁 import 任何带 siyuan/window 依赖的模块。

export const BOOK_MAP_BLOCK_TYPE = "book-map";
export const BOOK_MAP_FENCE = ";;;sy-progressive-plugin/book-map";

/** 节点类型五枚举（数据层英文键；i18n 显示面在 □8） */
export type MapNodeType = "person" | "concept" | "event" | "place" | "theme";
const NODE_TYPES: ReadonlySet<string> = new Set(["person", "concept", "event", "place", "theme"]);

export interface MapNode {
    id: string;            // "n1" 起池内自增
    name: string;
    aliases: string[];
    type: MapNodeType;
    summary: string;
    anchors: number[];     // 证据锚=该书片 point（0 起全局连续，越界在合并/洗池时剔除）
}

export interface MapEdge {
    from: string;          // 节点 id
    to: string;
    relation: string;
    anchors?: number[];    // 空则不设属性（往返一致）；非空升序去重
}

/** □8 视图留位：主观切法（name+nodeIDs+布局）；□7 只保字段存在，不实现写入 */
export interface BookMapView { name: string; nodeIDs: string[]; layout?: Record<string, unknown> }

export interface BookMap { v: 1; nodes: MapNode[]; edges: MapEdge[]; views: BookMapView[] }

/** AI 提交的宽松形态（map_save 入参；id/aliases/type/summary/anchors 全可缺省） */
export interface IncomingNode { id?: string; name: string; aliases?: unknown; type?: unknown; summary?: unknown; anchors?: unknown }
export interface IncomingEdge { from: string; to: string; relation: string; anchors?: unknown }

// ============ 构造助手（测试与 □8 前端用；直接产出合法形态） ============

export function node(id: string, name: string, extra?: Partial<Pick<MapNode, "aliases" | "type" | "summary" | "anchors">>): MapNode {
    return {
        id, name,
        aliases: extra?.aliases ?? [],
        type: (extra?.type && NODE_TYPES.has(String(extra.type)) ? extra.type : "theme") as MapNodeType,
        summary: extra?.summary ?? "",
        anchors: [...(extra?.anchors ?? [])],
    };
}

export function edge(from: string, to: string, relation: string, extra?: { anchors?: number[] }): MapEdge {
    const anchors = washAnchors(extra?.anchors, Infinity);
    return anchors.length ? { from, to, relation, anchors } : { from, to, relation };
}

// ============ 围栏 build/parse ============

export function buildBookMapMD(map: BookMap): string {
    return `${BOOK_MAP_FENCE}\n${JSON.stringify(map)}\n;;;`;
}

/** 围栏块 markdown（围栏头+JSON 行+闭合 ;;;）→ 池子；头不符/坏 JSON → null（行级扫描同 parseVisitNoteMarkdown 先例） */
export function parseBookMapMarkdown(md: string): BookMap | null {
    const lines = md.split("\n");
    if (!lines[0]?.trim().startsWith(BOOK_MAP_FENCE)) return null;
    for (let i = 1; i < lines.length; i++) {
        const t = lines[i].trim();
        if (!t || t === ";;;") continue;
        return parseBookMapContent(t);
    }
    return null;
}

/** 单行 JSON（getChildBlocks content 形态）→ 池子；容错 null */
export function parseBookMapContent(line: string): BookMap | null {
    let raw: unknown;
    try { raw = JSON.parse(line); } catch { return null; }
    if (typeof raw !== "object" || raw === null) return null;
    const o = raw as Record<string, unknown>;
    if (o.v !== 1) return null;
    return normalizePool(o);
}

/** 键序归一 JSON（验真比对专用）：goja 与 V8 的对象属性枚举序不同（09-13 □9 实锤：
 *  views.layout 嵌套对象两序列化路径 x,y / y,x 漂移=writePool 验真假阴性 1/5 偶发；
 *  nodes/edges 全标量数组无此面）。比对前双侧递归排序键，内容等价即真；数组序保留 */
export function canonicalJSON(v: unknown): string {
    const s = (x: unknown): string => {
        if (x === null || typeof x !== "object") return JSON.stringify(x) ?? "null";
        if (Array.isArray(x)) return `[${x.map(s).join(",")}]`;
        const o = x as Record<string, unknown>;
        return `{${Object.keys(o).sort().filter(k => o[k] !== undefined)
            .map(k => `${JSON.stringify(k)}:${s(o[k])}`).join(",")}}`;
    };
    return s(v);
}

// ============ 洗池/对齐合并 ============

/** anchors 洗整：保 0..limit-1 整数、去重、升序（越界与垃圾值丢弃；limit=Infinity 不校上界） */
function washAnchors(v: unknown, limit: number): number[] {
    const arr = Array.isArray(v) ? v : [];
    const out = arr.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n < limit);
    return [...new Set(out)].sort((a, b) => a - b);
}

/** 字符串数组洗：只留非空字符串、trim 后去重（与 name 的 trim 对齐——别名带首尾空白
 *  会在六面撞名的精确比较里失配，且 Set 去重视 "x"/" x" 为两条落盘）；
 *  条数封顶 50（复评备忘：单条 200 字符已 cap，数万条别名仍可撑出 MB 级池 JSON） */
const CAP_ALIAS_COUNT = 50;
function washStrings(v: unknown): string[] {
    const arr = Array.isArray(v) ? v : [];
    return [...new Set(arr.filter((x): x is string => typeof x === "string")
        .map(x => x.trim()).filter(x => x.length > 0))].slice(0, CAP_ALIAS_COUNT);
}

/**
 * 脏数据洗成合法池子：重复 id 保留首个/缺 id 补自增/坏 anchor 剔除（limit=pieceCount）/
 * 悬空边丢弃/非法 type 归 theme/缺字段补默认。读池子与 normalize 中间态共用。
 */
export function normalizePool(raw: Record<string, unknown>, pieceCount = Infinity): BookMap {
    const seen = new Set<string>();
    const nodes: MapNode[] = [];
    const rawNodes = Array.isArray(raw.nodes) ? raw.nodes : [];
    for (const r of rawNodes) {
        if (typeof r !== "object" || r === null) continue;
        const o = r as Record<string, unknown>;
        const name = typeof o.name === "string" ? o.name.trim() : "";
        if (!name) continue;
        let id = typeof o.id === "string" && /^n\d+$/.test(o.id) ? o.id : "";
        if (id && seen.has(id)) continue;       // 重复 id 保留首个（后来者丢弃，其边引用自然悬空被剔）
        if (!id) id = nextNodeID({ nodes });
        seen.add(id);
        nodes.push({
            id, name,
            aliases: washStrings(o.aliases),
            type: (typeof o.type === "string" && NODE_TYPES.has(o.type) ? o.type : "theme") as MapNodeType,
            summary: typeof o.summary === "string" ? o.summary : "",
            anchors: washAnchors(o.anchors, pieceCount),
        });
    }
    const ids = new Set(nodes.map(n => n.id));
    const edges: MapEdge[] = [];
    const edgeKey = (e: MapEdge) => `${e.from}→${e.to}▸${e.relation}`;
    const edgeMap = new Map<string, MapEdge>();
    const rawEdges = Array.isArray(raw.edges) ? raw.edges : [];
    for (const r of rawEdges) {
        if (typeof r !== "object" || r === null) continue;
        const o = r as Record<string, unknown>;
        const from = typeof o.from === "string" ? o.from : "";
        const to = typeof o.to === "string" ? o.to : "";
        const relation = typeof o.relation === "string" ? o.relation.trim() : "";
        if (!from || !to || !relation || !ids.has(from) || !ids.has(to)) continue;
        const anchors = washAnchors(o.anchors, pieceCount);
        const key = edgeKey({ from, to, relation });
        const prev = edgeMap.get(key);
        if (prev) prev.anchors = washAnchors([...(prev.anchors ?? []), ...anchors], pieceCount);
        else edgeMap.set(key, anchors.length ? { from, to, relation, anchors } : { from, to, relation });
    }
    edgeMap.forEach(e => { if (!e.anchors?.length) delete e.anchors; edges.push(e); });
    const views: BookMapView[] = Array.isArray(raw.views)
        ? raw.views.filter((v): v is BookMapView =>
            typeof v === "object" && v !== null && typeof (v as BookMapView).name === "string"
            && Array.isArray((v as BookMapView).nodeIDs))
        : [];
    return { v: 1, nodes, edges, views };
}

/** 下一个节点 id：池内 max(nN)+1（不填洞——洞是历史，自增向前） */
export function nextNodeID(map: Pick<BookMap, "nodes">): string {
    let max = 0;
    for (const n of map.nodes) {
        const m = /^n(\d+)$/.exec(n.id);
        if (m) max = Math.max(max, Number(m[1]));
    }
    return `n${max + 1}`;
}

/** 合并回执：AI 提交批的确定性审计账（map_save 原样返回给 AI 自查） */
export interface MergeReport {
    map: BookMap;            // 合并后的新池子（不改入参，immutable）
    created: string[];       // 新建节点 id
    reused: string[];        // 正常对齐重用（name 与池内一致）
    forcedReuses: { incoming: string; existingID: string; reason: string }[];  // 强制合并（alias 撞名/同 id 异名）
    droppedAnchors: { id: string; anchors: number[] }[];   // 越界证据锚（id 或 e:from->to）
    droppedEdges: { from: string; to: string; relation: string; reason: string }[];
    invalid: string[];       // 整条拒收的入参节点及原因
}

/** 名字/别名匹配：incoming 的 name+aliases 对 existing 节点六面撞（name×name/name×alias/alias×name/alias×alias） */
function matchKey(names: string[], aliases: string[]): string {
    return [...names, ...aliases].map(s => s.trim()).filter(Boolean).join("\u0000");
}

function hits(existing: MapNode, name: string, aliases: string[]): "name" | "alias" | null {
    if (name === existing.name) return "name";
    const ea = existing.aliases;
    if (ea.includes(name)) return "alias";
    if (aliases.includes(existing.name)) return "alias";
    if (aliases.some(a => ea.includes(a))) return "alias";
    return null;
}

/**
 * 对齐合并（确定性核心）：AI 批量提交 → 并进现有池子。
 * 对齐契约：能对上必须重用已有 id；对不上 AI 又硬用了已有 id（同 id 异名）或撞了
 * 别名 → 我方兜底强制合并（池内 name 优先、AI 名进 aliases），全记 forcedReuses。
 */
/** 字段长度上限（review P2-7：失控 AI 可把单块 JSON 撑到 MB 级；确定性截断不拒整批） */
export const CAP_NAME = 200, CAP_ALIAS = 200, CAP_SUMMARY = 2000, CAP_RELATION = 100, CAP_ANCHORS = 100;
const cap = (s: string, n: number) => s.length > n ? s.slice(0, n) : s;

export function mergeIntoPool(
    existing: BookMap | null,
    incomingNodes: IncomingNode[],
    incomingEdges: IncomingEdge[],
    pieceCount: number,
): MergeReport {
    const report: MergeReport = {
        map: existing ? { ...existing, nodes: existing.nodes.map(n => ({ ...n, aliases: [...n.aliases], anchors: [...n.anchors] })), edges: existing.edges.map(e => ({ ...e, ...(e.anchors ? { anchors: [...e.anchors] } : {}) })) } : { v: 1, nodes: [], edges: [], views: [] },
        created: [], reused: [], forcedReuses: [], droppedAnchors: [], droppedEdges: [], invalid: [],
    };
    const limit = Number.isFinite(pieceCount) && pieceCount > 0 ? pieceCount : 0;

    // AI 提交内先自对齐：同批同名/同别名撞 → 并作一条（AI 批内重复不该建重复节点）
    const byIdentity = new Map<string, IncomingNode>();
    for (const inc of incomingNodes) {
        const name = typeof inc?.name === "string" ? cap(inc.name.trim(), CAP_NAME) : "";
        if (!name) { report.invalid.push(`name 空：${JSON.stringify(inc).slice(0, 60)}`); continue; }
        const aliases = washStrings(inc.aliases).map(a => cap(a, CAP_ALIAS)).filter(a => a !== name);
        const id = typeof inc.id === "string" && /^n\d+$/.test(inc.id) ? inc.id : "";
        const key = matchKey([name], aliases) + (id ? `\u0000#${id}` : "");
        const prev = byIdentity.get(key);
        if (prev) {
            prev.aliases = washStrings([...((prev.aliases as string[]) ?? []), ...aliases]).map(a => cap(a, CAP_ALIAS));
            if (!prev.id && id) prev.id = id;
            const prevAnchors: unknown[] = Array.isArray(prev.anchors) ? prev.anchors : [];
            const incAnchors: unknown[] = Array.isArray(inc.anchors) ? inc.anchors.slice(0, CAP_ANCHORS) : [];
            if (inc.anchors !== undefined) prev.anchors = [...prevAnchors, ...incAnchors];
        } else byIdentity.set(key, { ...inc, name, aliases, id });
    }

    // 逐条对齐进池
    const incomingResolved: { name: string; id: string }[] = [];  // AI 名字 → 池内 id（边解析用）
    for (const inc of byIdentity.values()) {
        const aliases = washStrings(inc.aliases);
        // 对齐优先级：①id 直查 ②六面撞名
        let target: MapNode | undefined;
        let how: "id" | "name" | "alias" | null = null;
        if (inc.id) {
            target = report.map.nodes.find(n => n.id === inc.id);
            if (target) how = "id";
        }
        if (!target) {
            for (const n of report.map.nodes) {
                const h = hits(n, inc.name, aliases);
                if (h) { target = n; how = h; break; }
            }
        }
        if (target) {
            const newAliases = aliases.filter(a => !target!.aliases.includes(a) && a !== target!.name);
            if (newAliases.length) target.aliases.push(...newAliases);
            if (typeof inc.summary === "string" && inc.summary.trim()) target.summary = cap(inc.summary.trim(), CAP_SUMMARY);
            if (how === "id" && inc.name !== target.name) {
                if (!target.aliases.includes(inc.name)) target.aliases.push(inc.name);
                report.forcedReuses.push({ incoming: inc.name, existingID: target.id, reason: `同 id 异名（池内名「${target.name}」优先，AI 名入别名）` });
            } else if (how === "alias") {
                // 回填 AI 名进别名（review P1-1）：alias 通道三张匹配面里两张（AI 别名=池内名/
                // 别名撞别名）AI 的 name 都不在池内——不回填则下批同名提交六面全空=重复建点
                if (inc.name !== target.name && !target.aliases.includes(inc.name)) target.aliases.push(inc.name);
                report.forcedReuses.push({ incoming: inc.name, existingID: target.id, reason: `撞现有别名（池内名「${target.name}」优先，AI 名入别名）` });
            } else {
                report.reused.push(target.id);
            }
            incomingResolved.push({ name: inc.name, id: target.id });
            mergeAnchors(target, inc.anchors, target.id, report, limit);
            continue;
        }
        // 新建
        const id = nextNodeID(report.map);
        const anchors = washAnchors(Array.isArray(inc.anchors) ? inc.anchors.slice(0, CAP_ANCHORS) : inc.anchors, limit);
        collectDroppedAnchors(inc.anchors, anchors, id, report);
        const nn: MapNode = {
            id, name: inc.name,
            aliases,
            type: (typeof inc.type === "string" && NODE_TYPES.has(inc.type) ? inc.type : "theme") as MapNodeType,
            summary: typeof inc.summary === "string" ? cap(inc.summary.trim(), CAP_SUMMARY) : "",
            anchors,
        };
        report.map.nodes.push(nn);
        report.created.push(id);
        incomingResolved.push({ name: inc.name, id });
    }

    // 边：端点先 id 直查（合并后节点集）再名字解析；去重并集
    const edgeMap = new Map<string, MapEdge>();
    for (const e of report.map.edges) edgeMap.set(`${e.from}→${e.to}▸${e.relation}`, e);
    for (const inc of incomingEdges) {
        const relation = typeof inc?.relation === "string" ? cap(inc.relation.trim(), CAP_RELATION) : "";
        // 端点与 name 同 cap：节点名入库时截 200，端点不截=同名超长引用解析失配（单测 l 实锤）
        const rawFrom = typeof inc?.from === "string" ? cap(inc.from.trim(), CAP_NAME) : "";
        const rawTo = typeof inc?.to === "string" ? cap(inc.to.trim(), CAP_NAME) : "";
        if (!relation) { report.droppedEdges.push({ from: rawFrom, to: rawTo, relation, reason: "relation 空" }); continue; }
        const from = resolveEndpoint(rawFrom, report.map.nodes, incomingResolved);
        const to = resolveEndpoint(rawTo, report.map.nodes, incomingResolved);
        if (!from || !to) {
            report.droppedEdges.push({ from: rawFrom, to: rawTo, relation, reason: `端点未命中：${!from ? rawFrom : rawTo}` });
            continue;
        }
        const key = `${from}→${to}▸${relation}`;
        const kept = washAnchors(Array.isArray(inc.anchors) ? inc.anchors.slice(0, CAP_ANCHORS) : inc.anchors, limit);
        collectDroppedAnchors(inc.anchors, kept, `e:${from}->${to}`, report);
        const prev = edgeMap.get(key);
        if (prev) {
            // 并集可能为空（双方均无合法锚）——空数组不落属性，防池 JSON 形态漂移（review P2-6）
            prev.anchors = washAnchors([...(prev.anchors ?? []), ...kept], limit);
            if (!prev.anchors.length) delete prev.anchors;
        } else {
            const ne: MapEdge = kept.length ? { from, to, relation, anchors: kept } : { from, to, relation };
            edgeMap.set(key, ne);
            report.map.edges.push(ne);
        }
    }
    report.map.nodes.forEach(n => n.anchors.sort((a, b) => a - b));
    return report;
}

function mergeAnchors(target: MapNode, incoming: unknown, id: string, report: MergeReport, limit: number): void {
    // 既有 anchors 被 limit 收紧剔除的部分也进回执（review P2-3：书重建卷 pieceCount 缩小后
    // 存量越界锚不该静默消失）
    collectDroppedAnchors(target.anchors, washAnchors(target.anchors, limit), id, report);
    const kept = washAnchors([...target.anchors, ...(Array.isArray(incoming) ? incoming : [])], limit);
    collectDroppedAnchors(incoming, kept, id, report);
    target.anchors = kept;
}

function collectDroppedAnchors(incoming: unknown, kept: number[], id: string, report: MergeReport): void {
    if (!Array.isArray(incoming)) return;
    const dropped = [...new Set(incoming.map(Number).filter(n => !kept.includes(n)))];
    if (dropped.length) report.droppedAnchors.push({ id, anchors: dropped });
}

/** 边端点解析：id → 名字/别名（含本批新建节点的 AI 名） */
function resolveEndpoint(raw: string, poolNodes: MapNode[], incomingResolved: { name: string; id: string }[]): string {
    if (poolNodes.some(n => n.id === raw)) return raw;
    const hit = incomingResolved.find(x => x.name === raw);
    if (hit) return hit.id;
    return poolNodes.find(n => n.name === raw || n.aliases.includes(raw))?.id ?? "";
}

// ============ 查询/邻域 ============

/** nameOrId 三通道：id 精确/name 精确/alias 精确；未命中 null */
export function findNode(map: BookMap, nameOrId: string): MapNode | null {
    const key = nameOrId?.trim();
    if (!key) return null;
    return map.nodes.find(n => n.id === key) ?? map.nodes.find(n => n.name === key || n.aliases.includes(key)) ?? null;
}

/** 邻域子图：命中节点+1 跳邻居（边反查两端）；未命中=空集（不是 null——空是合法答案） */
export function neighborhood(map: BookMap, nameOrId: string): { nodes: MapNode[]; edges: MapEdge[] } {
    const seed = findNode(map, nameOrId);
    if (!seed) return { nodes: [], edges: [] };
    const ids = new Set<string>([seed.id]);
    const edges = map.edges.filter(e => e.from === seed.id || e.to === seed.id);
    for (const e of edges) { ids.add(e.from); ids.add(e.to); }
    return { nodes: map.nodes.filter(n => ids.has(n.id)), edges };
}

// ============ □9 整理工具域：删点删边/节点纠错/视图摘要/视图归并 ============

/** 边引用（map_delete 入参形态；端点支持 id/name/别名，同 map_save 解析面） */
export interface EdgeRef { from: string; to: string; relation: string }

export interface DeleteReport {
    map: BookMap;                                        // 删后的新池子（immutable）
    deletedNodes: string[];                              // 命中删除的节点 id
    cascadeEdges: { from: string; to: string; relation: string }[];   // 端点被删而级联的边
    deletedEdges: { from: string; to: string; relation: string }[];   // 显式删边命中
    removedFromViews: { view: string; nodeIDs: string[] }[];          // 各视图剔除的引用
    removedEmptyViews: string[];                         // 剔空后一并移除的视图名
    missedNodes: string[];                               // 池内未命中的 nodeIDs
    missedEdges: { from: string; to: string; relation: string }[];    // 未命中的边（端点已解析）
}

/** 删点删边（确定性）：删节点级联悬挂边+views 剔引用（剔空视图一并移除）；
 *  删边端点走 id→name/别名解析，relation 精确匹配（方向敏感——关系有向） */
export function deleteFromPool(existing: BookMap, nodeIDs: string[], edgeRefs: EdgeRef[]): DeleteReport {
    const report: DeleteReport = {
        map: { ...existing, nodes: existing.nodes.map(n => ({ ...n, aliases: [...n.aliases], anchors: [...n.anchors] })), edges: existing.edges.map(e => ({ ...e, ...(e.anchors ? { anchors: [...e.anchors] } : {}) })), views: existing.views.map(v => ({ ...v, nodeIDs: [...v.nodeIDs] })) },
        deletedNodes: [], cascadeEdges: [], deletedEdges: [], removedFromViews: [], removedEmptyViews: [],
        missedNodes: [], missedEdges: [],
    };
    const delSet = new Set<string>();
    for (const raw of nodeIDs) {
        const key = String(raw ?? "").trim();
        const hit = findNode(report.map, key)?.id;
        if (hit && !delSet.has(hit)) { delSet.add(hit); report.deletedNodes.push(hit); }
        else if (!hit) report.missedNodes.push(key);
    }
    // 显式删边端点先解析（id/name/别名→id；在删节点前做——引用被删节点的边
    // 该走级联判定，名字解析不能因节点已删而落空）。端点与 relation 同 map_save 的
    // cap 口径（review P2-4：不 cap=同一引用建图能命中、删边却 miss 的解析面分叉）
    const resolvedRefs = edgeRefs.map(ref => ({
        from: findNode(report.map, cap(String(ref?.from ?? "").trim(), CAP_NAME))?.id ?? cap(String(ref?.from ?? "").trim(), CAP_NAME),
        to: findNode(report.map, cap(String(ref?.to ?? "").trim(), CAP_NAME))?.id ?? cap(String(ref?.to ?? "").trim(), CAP_NAME),
        relation: cap(String(ref?.relation ?? "").trim(), CAP_RELATION),
    }));
    const delEdgeKey = (e: { from: string; to: string; relation: string }) => `${e.from}→${e.to}▸${e.relation}`;
    const explicit = new Set(resolvedRefs.map(delEdgeKey));
    // 级联先行：命中删除集的边归 cascade，显式请求只对幸存边匹配
    const survived: MapEdge[] = [];
    for (const e of report.map.edges) {
        if (delSet.has(e.from) || delSet.has(e.to)) report.cascadeEdges.push({ from: e.from, to: e.to, relation: e.relation });
        else survived.push(e);
    }
    const remain: MapEdge[] = [];
    for (const e of survived) {
        if (explicit.has(delEdgeKey(e))) report.deletedEdges.push({ from: e.from, to: e.to, relation: e.relation });
        else remain.push(e);
    }
    for (const ref of resolvedRefs) {
        const hit = report.deletedEdges.some(e => delEdgeKey(e) === delEdgeKey(ref))
            || report.cascadeEdges.some(e => delEdgeKey(e) === delEdgeKey(ref));
        if (!hit) report.missedEdges.push(ref);
    }
    report.map.edges = remain;
    report.map.nodes = report.map.nodes.filter(n => !delSet.has(n.id));
    // views 剔引用（剔空一并移除——空视图无渲染语义）
    const views: BookMapView[] = [];
    for (const v of report.map.views) {
        const kept = v.nodeIDs.filter(id => !delSet.has(id));
        const removed = v.nodeIDs.filter(id => delSet.has(id));
        if (removed.length) report.removedFromViews.push({ view: v.name, nodeIDs: removed });
        if (!kept.length) report.removedEmptyViews.push(v.name);
        else views.push({ ...v, nodeIDs: kept });
    }
    report.map.views = views;
    return report;
}

/** 节点纠错入参（map_update）：id 支持 id/name/别名；type/summary 至少给一个 */
export interface NodeUpdate { id: string; type?: unknown; summary?: unknown }

export interface UpdateReport {
    map: BookMap;
    updated: { id: string; name: string; fields: ("type" | "summary")[] }[];
    missed: { id: string; reason: string }[];
}

/** 节点字段纠错（type 五枚举/summary 截断）：非法 type 拒收记原因（纠错场景要明确
 *  回执，不静默归 theme——那是 AI 建图侧的兜底语义，两通道不同） */
export function updateNodes(existing: BookMap, updates: NodeUpdate[]): UpdateReport {
    const report: UpdateReport = {
        map: { ...existing, nodes: existing.nodes.map(n => ({ ...n, aliases: [...n.aliases], anchors: [...n.anchors] })), edges: existing.edges, views: existing.views },
        updated: [], missed: [],
    };
    for (const u of updates) {
        const rawID = String(u?.id ?? "").trim();
        if (!rawID) { report.missed.push({ id: "", reason: "id 空" }); continue; }
        const hit = findNode(report.map, rawID);
        if (!hit) { report.missed.push({ id: rawID, reason: "未命中（支持 id/name/别名）" }); continue; }
        const fields: ("type" | "summary")[] = [];
        // 先全字段校验后变异（review 复评新 P2：summary 校验若在 type 变异后 continue，
        // 混合「合法 type+非法 summary」=type 已落盘但 updated 账上消失，回执失真）
        const sumStr = typeof u.summary === "string" ? u.summary : null;
        if (u.summary !== undefined && sumStr === null) {
            report.missed.push({ id: hit.id, reason: `summary 类型非法：${typeof u.summary}（要 string）` });
            continue;
        }
        if (u.type !== undefined) {
            if (typeof u.type !== "string" || !NODE_TYPES.has(u.type)) {
                report.missed.push({ id: hit.id, reason: `type 非法：${String(u.type).slice(0, 20)}（person/concept/event/place/theme）` });
                continue;
            }
            if (hit.type !== u.type) { hit.type = u.type as MapNodeType; fields.push("type"); }
        }
        // 比较用规整后值（review P2-3：原始串带空白时 trim 后同值会虚报 fields）
        if (sumStr !== null) {
            const next = cap(sumStr.trim(), CAP_SUMMARY);
            if (next !== hit.summary) { hit.summary = next; fields.push("summary"); }
        }
        if (fields.length) report.updated.push({ id: hit.id, name: hit.name, fields });
        else report.missed.push({ id: hit.id, reason: "无可改字段（type/summary 至少给一个）" });
    }
    return report;
}

/** 视图清单摘要（map_tidy 素材）：nodeNames cap 30；missing=悬空引用数（脏数据曝光） */
export interface ViewDigest { name: string; nodeCount: number; nodeNames: string[]; missing: number; hasLayout: boolean }
const DIGEST_NAME_CAP = 30;

export function viewsDigest(map: BookMap): ViewDigest[] {
    const nameOf = new Map(map.nodes.map(n => [n.id, n.name]));
    return map.views.map(v => {
        const names = v.nodeIDs.filter(id => nameOf.has(id)).map(id => nameOf.get(id)!);
        return {
            name: v.name,
            nodeCount: names.length,
            nodeNames: names.slice(0, DIGEST_NAME_CAP),
            missing: v.nodeIDs.length - names.length,
            hasLayout: !!v.layout && typeof v.layout === "object" && Object.keys(v.layout as object).length > 0,
        };
    });
}

/** 视图归并回执（map_tidy_apply：AI 提交归并后的视图全集，全量替换） */
export interface TidyReport {
    map: BookMap;
    applied: string[];                                    // 采纳的视图名（trim 后）
    droppedDupNames: string[];                            // 重名丢弃（保首）
    droppedNodeRefs: { view: string; nodeIDs: string[] }[];   // 悬空 nodeIDs 剔除
    droppedLayouts: string[];                             // layout 超限剔除的视图名
    invalid: string[];                                    // 整条拒收（name 空）
}

/** 视图全量替换（确定性）：name trim+CAP_NAME、重名保首、nodeIDs 洗池内存在+去重保序、
 *  layout 透传（AI 可回传原坐标，无效坐标渲染侧自兜底）。layout 序列化超 64KB 剔除
 *  记 droppedLayouts（review P2-1：CAP 家族同型洞——自由结构无上限可撑出 MB 级单块 JSON） */
export function tidyViews(existing: BookMap, views: BookMapView[]): TidyReport {
    const report: TidyReport = {
        map: { ...existing, views: [] },
        applied: [], droppedDupNames: [], droppedNodeRefs: [], droppedLayouts: [], invalid: [],
    };
    const ids = new Set(existing.nodes.map(n => n.id));
    const seenNames = new Set<string>();
    for (const v of views) {
        if (typeof v !== "object" || v === null) continue;
        const name = typeof v.name === "string" ? cap(v.name.trim(), CAP_NAME) : "";
        const rawIDs = Array.isArray(v.nodeIDs) ? v.nodeIDs : [];
        if (!name) { report.invalid.push(`name 空：{nodeIDs:[${rawIDs.join(",")}]}`); continue; }
        if (seenNames.has(name)) { report.droppedDupNames.push(name); continue; }
        seenNames.add(name);
        const nodeIDs: string[] = [];
        const dropped: string[] = [];
        for (const id of rawIDs) {
            if (ids.has(String(id)) && !nodeIDs.includes(String(id))) nodeIDs.push(String(id));
            else if (!ids.has(String(id))) dropped.push(String(id));
        }
        if (dropped.length) report.droppedNodeRefs.push({ view: name, nodeIDs: dropped });
        let layout: Record<string, unknown> | undefined;
        if (v.layout && typeof v.layout === "object") {
            let size = 0;
            try { size = JSON.stringify(v.layout).length; } catch { size = Infinity; }
            if (size > 65536) report.droppedLayouts.push(name);
            else layout = { ...v.layout };
        }
        report.map.views.push(layout ? { name, nodeIDs, layout } : { name, nodeIDs });
        report.applied.push(name);
    }
    return report;
}
