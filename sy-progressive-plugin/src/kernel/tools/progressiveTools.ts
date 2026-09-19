// progressive MCP 工具实现：单工具 progressive + action 枚举（一期实验面）。
// tpmcp □2：list_books/get_due/get_schedule 三查询——纯读零副作用，返回结构化数据
// （ISO 时间戳/书 ID+书名/布尔/计数），不做渲染文案；AI 面向 bear 转述自己会说话。
// 语义函数单一事实源=src/reviewQueue.ts（零依赖纯模块直 import）；petal/SQL 数据面
// 见 ../progData.ts（前端模块依赖链进不了 goja，复刻处已逐个标注）。
import { objectSchema, successResponse, errorResponse, wrapHandler, type ToolDefinition, type ToolResponse } from "./common";
import * as api from "../api";
import {
  PDIGEST_CTIME, DEFAULT_QUOTA, DAY_MS,
  readBooksInfos, readReadingOrder, readBookIndex, bookEntries,
  bookOfDocFrom, digestCountsFrom, mergeMissingBooks, pickNextBook, isFinished,
  summarizeDebt, loadAllDays, readDayData, todayStr, endOfISODate,
  type KBookInfo,
} from "../progData";
import {
  ReviewKey, PdigestReviewKey, parseReview, isDue, scheduleSQLFor, mergeDueRows,
  deferReview, type DueRow,
} from "../../reviewQueue";
import {
  readPool, readPoolExisting, writePool, collectMapContext, readPieceCount, runExclusive,
} from "../bookMapIo";
import { convertPlan, convertApply, DEFAULT_MAX_CHARS, DEFAULT_SPLIT_WORDS } from "../bookConvertIo";
import {
  structurePlan, structureApply, structureDistill, structureRead, structureCompose, MATERIAL_LIMIT, DISTILL_HEADING_LIMIT,
} from "../structureIo";
import type { SkeletonNode, Placement } from "../../structureCore";
import {
  mergeIntoPool, neighborhood, deleteFromPool, updateNodes, viewsDigest, tidyViews,
  buildBookMapMD,
  type IncomingNode, type IncomingEdge, type BookMapView, type EdgeRef, type NodeUpdate,
} from "../../bookMapCore";

// ============ 公共件 ============

/** 书名批量查（type='d' 的 content 列）；查空的书=已删（lost 判定依据） */
async function bookTitles(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const inList = ids.map(i => `'${i}'`).join(",");
  const rows = await api.sql(`select id, content from blocks where type='d' and id in (${inList}) limit 10000000`);
  return new Map((rows ?? []).map(r => [r.id, String(r.content ?? "")]));
}

function iso(ts: number): string {
  return new Date(ts).toISOString();
}

/** 双源调度全量行（think 块级+pdigest 文档级，归书后的扩展行） */
interface SchedRow extends DueRow {
  src: "think" | "pdigest";
  bookID: string;
  bookTitle: string;
}

/** 双源 SQL+ctime 归书+书名一次拉齐（get_due/get_schedule 共用） */
async function loadScheduleRows(): Promise<SchedRow[]> {
  const [thinkRows, pdigestRows, ctimeRows] = await Promise.all([
    api.sql<DueRow>(scheduleSQLFor(ReviewKey)),
    api.sql<DueRow>(scheduleSQLFor(PdigestReviewKey)),
    api.sql<{ block_id: string; value: string }>(
      `select block_id, value from attributes where name='${PDIGEST_CTIME}' limit 10000000`),
  ]);
  const merged = mergeDueRows(thinkRows ?? [], pdigestRows ?? []);
  const bookOfDoc = bookOfDocFrom(ctimeRows ?? []);
  const ids = [...new Set(merged.map(r => bookOfDoc.get(r.root_id)).filter(Boolean) as string[])];
  const titles = await bookTitles(ids);
  return merged.map(r => {
    const bookID = bookOfDoc.get(r.root_id) ?? "";
    return {
      ...r,
      src: r.id === r.root_id ? "pdigest" as const : "think" as const,
      bookID,
      bookTitle: titles.get(bookID) ?? "",
    };
  });
}

/** 调度行 → AI 可判读条目（done/垃圾值已在 SQL/parseReview 双层滤掉） */
function schedItem(r: SchedRow, now: number) {
  const s = parseReview(r.v)!;
  return {
    id: r.id,
    docID: r.root_id,
    bookID: r.bookID,
    bookTitle: r.bookTitle,
    src: r.src,
    mode: s.mode === "sched" ? "sched" : "curve",
    nextISO: iso(s.mode === "done" ? 0 : s.next),
    due: s.mode !== "done" && isDue(s, now),
    overdueDays: s.mode !== "done" && s.next <= now ? Math.max(1, Math.ceil((now - s.next) / DAY_MS)) : 0,
    ...(s.mode === "curve" ? { reviewCount: s.count } : s.mode === "sched" ? { everyDays: s.every } : {}),
    excerpt: (r.content ?? "").replace(/\s+/g, " ").trim().slice(0, 120),
  };
}

// ============ list_books ============

/** 书状态推导（bookStatus.ts 语义的查询面子集）：lost>ignored>archived>writing>manual>finished>reading */
function bookStatus(info: KBookInfo, pieceCount: number, lost: boolean): string {
  if (lost) return "lost";
  if (info.ignored) return "ignored";
  if (info.archived) return "archived";
  if (info.writing) return "writing";
  if (info.manualMode) return "manual";
  if (isFinished(info.point ?? 0, pieceCount)) return "finished";
  return "reading";
}

async function listBooks() {
  const infos = await readBooksInfos();
  const entries = bookEntries(infos);
  const [ro, ctimeRows] = await Promise.all([
    readReadingOrder(),
    api.sql<{ value: string }>(`select value from attributes where name='${PDIGEST_CTIME}' limit 10000000`),
  ]);
  const titles = await bookTitles(entries.map(([id]) => id));
  const digests = digestCountsFrom(ctimeRows ?? []);
  const books = [];
  for (const [id, info] of entries) {
    const pieceCount = info.writing || info.manualMode ? 0 : (await readBookIndex(id)).length;
    const lost = !titles.has(id);
    books.push({
      bookID: id,
      title: titles.get(id) ?? "",
      boxID: info.boxID ?? "",
      status: bookStatus(info, pieceCount, lost),
      point: info.point ?? 0,
      pieceCount,
      unread: Math.max(0, pieceCount - (info.point ?? 0)),
      digestCount: digests.get(id) ?? 0,
      pinned: !!info.pinned,
      hidden: !!info.hidden,
      activePoint: info.activePoint ?? 0,
      lastTouchISO: info.time ? iso(info.time) : "",
    });
  }
  return successResponse({
    books,
    readingOrder: ro.order,
    lastServed: ro.lastServed,
    hint: "status: reading=在读/finished=片已读完/ignored=忽略/archived=归档/writing=写作书/manual=手动分片/lost=文档已删；point=当前片序号（0 起），unread=pieceCount-point",
  });
}

// ============ get_due(date) ============

async function getDue(input: Record<string, any>) {
  const date = String(input.date ?? "today").trim();
  let now: number;
  let dayStr: string;
  if (date === "today") {
    now = Date.now();
    dayStr = todayStr(now);
  } else {
    const t = endOfISODate(date);
    if (t == null) return errorResponse(`date 非法：${date}（用 'today' 或 'YYYY-MM-DD'）`);
    now = t;
    dayStr = date;
  }
  const rows = await loadScheduleRows();
  const due = rows.map(r => ({ r, s: parseReview(r.v), next: (parseReview(r.v) as any)?.next ?? 0 }))
    .filter(x => x.s && x.s.mode !== "done" && x.next <= now)
    .sort((a, b) => a.next - b.next);
  const items = due.map(x => schedItem(x.r, now));

  // 片队列面（只读）：当日账（q=档位）+欠债+滚筒接下来会轮到的书（模拟，不落盘）
  const dayData = await readDayData(dayStr);
  const isToday = dayStr === todayStr(Date.now());
  let pieces: Record<string, any> = { date: dayStr };
  if (dayData || isToday) {
    const quotaToday = dayData?.q ?? DEFAULT_QUOTA;
    const readToday = dayData ? Object.values(dayData.b).reduce((s, n) => s + n, 0) : 0;
    pieces.quotaToday = quotaToday;
    pieces.readToday = readToday;
    pieces.readByBook = dayData?.b ?? {};
    if (isToday) {
      const summary = summarizeDebt(await loadAllDays(), dayStr, quotaToday);
      pieces.debt = summary.debt;
      pieces.debtState = summary.state; // ok=无欠债/warn=欠债<2×档位/over=欠债≥2×档位
      const next = await simulateNextBooks(quotaToday - readToday, dayData, quotaToday);
      if (next.length) pieces.nextBooks = next;
    }
  }
  return successResponse({
    date: dayStr,
    revisit: {
      dueCount: items.length,
      items,
    },
    pieces,
    hint: "revisit=到期重访（think=块级思考/pdigest=文档级复访；id 可跳转：think 为块 id、pdigest 为摘抄文档 id）；pieces=渐进阅读片队列（quotaToday=今日档位/readToday=今日已读/debt=累积欠债/nextBooks=滚筒接下来会轮到的书·只读模拟非精确承诺，不含手动分片书与写作书——前端滚筒已纳入手动书，本模拟面未跟随；当日读满档位的书同样不再列入，与前端选书口一致）",
  });
}

/** 滚筒只读模拟：从 lastServed 起模拟轮转 n 次会推出的书（不写 reading-order.json）。
 *  dayData/quotaToday 由调用点传入（当日账）：当日读满档位的书不再列入（rollerquota
 *  □1，与前端选书口剔除同语义——kernel 面用手动/写作双排除本就不含两类豁免书） */
async function simulateNextBooks(
  n: number,
  dayData: { q: number; b: { [bookID: string]: number } } | null,
  quotaToday: number,
): Promise<{ bookID: string; title: string; point: number; unread: number }[]> {
  if (n <= 0) return [];
  const count = Math.min(n, 5);
  const infos = await readBooksInfos();
  const entries = bookEntries(infos);
  if (!entries.length) return [];
  const [ro, titles] = await Promise.all([
    readReadingOrder(),
    bookTitles(entries.map(([id]) => id)),
  ]);
  // 索引长度逐书读（petal 本地读，书数量级 IO 可接受；手动/写作书恒空=滚筒本就不推）
  // 索引长度逐书读（petal 本地读，书数量级 IO 可接受）；手动/写作书不进本模拟
  // （readable 双排除）——fbfeat □2 后前端滚筒已纳入手动书，kernel 模拟面维持不
  // 跟随（bookStatus 报身份态同理；hint 已注明），真需求出现再对齐
  const pieceCounts = new Map<string, number>();
  for (const [id, info] of entries) {
    pieceCounts.set(id, (info.writing || info.manualMode) ? 0 : (await readBookIndex(id)).length);
  }
  // 当日达量集（粗条件 reads>=quota；quotaToday=当日块 q 快照，与前端「当前设置」
  // 口径在当日未记账时略有偏差——模拟面非精确承诺，hint 已声明）
  const full = new Set(Object.entries(dayData?.b ?? {})
    .filter(([, reads]) => reads >= quotaToday).map(([id]) => id));
  const readable = new Set(entries.filter(([id, info]) =>
    titles.has(id) && !info.ignored && !info.archived && !info.writing && !info.manualMode
    && !isFinished(info.point ?? 0, pieceCounts.get(id) ?? 0) && !full.has(id),
  ).map(([id]) => id));
  const merged = mergeMissingBooks(ro, [...pieceCounts.keys()]);
  const out: { bookID: string; title: string; point: number; unread: number }[] = [];
  let sim = merged;
  for (let i = 0; i < count; i++) {
    const pick = pickNextBook(sim, readable);
    if (!pick) break;
    const info = infos[pick];
    const pc = pieceCounts.get(pick) ?? 0;
    out.push({ bookID: pick, title: titles.get(pick) ?? "", point: info?.point ?? 0, unread: Math.max(0, pc - (info?.point ?? 0)) });
    sim = { order: merged.order, lastServed: pick };
  }
  return out;
}

// ============ get_schedule(days) ============

async function getSchedule(input: Record<string, any>) {
  const days = Number(input.days ?? 7);
  if (!Number.isFinite(days) || days < 1 || days > 90) {
    return errorResponse(`days 非法：${input.days}（1~90 的数字）`);
  }
  const now = Date.now();
  const rows = await loadScheduleRows();
  const buckets: { due: any[]; within: any[]; later: any[] } = { due: [], within: [], later: [] };
  const bookAgg = new Map<string, { bookID: string; bookTitle: string; due: number; within: number; later: number; unassigned?: boolean }>();
  for (const r of rows) {
    const item = schedItem(r, now);
    const s = parseReview(r.v)!;
    const next = s.mode === "done" ? 0 : s.next;
    const slot = next <= now ? buckets.due : next <= now + days * DAY_MS ? buckets.within : buckets.later;
    slot.push(item);
    const key = r.bookID || "(unassigned)";
    const agg = bookAgg.get(key) ?? {
      bookID: r.bookID, bookTitle: r.bookTitle,
      due: 0, within: 0, later: 0, ...(r.bookID ? {} : { unassigned: true }),
    };
    if (slot === buckets.due) agg.due++;
    else if (slot === buckets.within) agg.within++;
    else agg.later++;
    bookAgg.set(key, agg);
  }
  const byBook = [...bookAgg.values()].sort((a, b) =>
    (b.due - a.due) || (b.due + b.within + b.later - (a.due + a.within + a.later)));
  return successResponse({
    nowISO: iso(now),
    windowDays: days,
    buckets,
    byBook,
    hint: `due=已到期/within=未来 ${days} 天内/later=更远；byBook 按书聚合（unassigned=札记匣等无书归属）；mode: curve=间隔拉长曲线/sched=每 N 天日程`,
  });
}

// ============ defer(ids, to) 写动作（③层数据面操作实验品，tpmcp □3） ============

/** defer 目标时间戳：to 缺省=null（规则式 deferReview，前端「推迟到明天」同款）；
 *  'tomorrow'=now+1d / 数字 N=now+N*d / 'YYYY-MM-DD'=该日 12:00 本地 */
function deferTargetTs(to: unknown, now: number): number | null {
  if (to == null || to === "") return null;
  if (to === "tomorrow") return now + DAY_MS;
  const n = Number(to);
  if (Number.isFinite(n) && n > 0 && n <= 365) return now + n * DAY_MS;
  const day = endOfISODate(String(to));
  if (day == null) return NaN; // 非法形态：调用方报错
  return new Date(`${String(to)}T12:00:00`).getTime();
}

/**
 * 重访调度推迟：think 块级/pdigest 文档级自动判键（读 IAL 有哪个调度键），
 * keep mode 改 next。守卫=写前逐块复核读（新鲜值算新值，读写窗口毫秒级）+
 * 写后 IAL 复核读——前端 applyReviewAction 本就无锁（navigator.locks 进不了 goja，
 * 且 defer 短链无 hang 风险面，见 □3 结论记档）。批量上限 20 防写盘风暴。
 */
async function deferAction(input: Record<string, any>) {
  const ids = Array.isArray(input.ids) ? input.ids.map(String).filter(Boolean) : [];
  if (!ids.length) return errorResponse("ids 必填：要推迟的块/文档 id 数组（get_due/get_schedule 返回的 id）");
  if (ids.length > 20) return errorResponse(`批量上限 20（收到 ${ids.length}）——分多批调用`);
  if (new Set(ids).size !== ids.length) return errorResponse("ids 有重复");
  const now = Date.now();
  const toTs = deferTargetTs(input.to, now);
  if (Number.isNaN(toTs)) {
    return errorResponse(`to 非法：${input.to}（用 'tomorrow' / 天数数字 / 'YYYY-MM-DD'，或省略=按曲线规则顺延）`);
  }
  const deferred: any[] = [];
  const skipped: { id: string; reason: string }[] = [];
  for (const id of ids) {
    // 写前复核读：以当前 IAL 新鲜值定键与 prev（防陈旧 prevValue 错算）
    const attrs = await api.getBlockAttrs(id).catch(() => null);
    if (!attrs) { skipped.push({ id, reason: "块不存在或不可读" }); continue; }
    const pv = attrs[PdigestReviewKey] || attrs[ReviewKey] || "";
    const key = attrs[PdigestReviewKey] ? PdigestReviewKey : attrs[ReviewKey] ? ReviewKey : "";
    const prev = parseReview(pv);
    if (!key || !prev || prev.mode === "done") {
      skipped.push({ id, reason: "无有效重访调度（先 get_due/get_schedule 拿带调度的 id）" });
      continue;
    }
    const next = toTs == null
      ? deferReview(pv, now) // 规则式：曲线 ×2 拉长 / 日程 +1 天
      : prev.mode === "sched" ? `s#${toTs}#${prev.every}` : `q#${toTs}#${prev.count}`;
    await api.setBlockAttrs(id, { [key]: next });
    // 写后验真=IAL 复核读（非 SQL，即时）
    const after = await api.getBlockAttrs(id);
    const ok = after?.[key] === next;
    (ok ? deferred : skipped).push(ok ? {
      id,
      src: key === PdigestReviewKey ? "pdigest" : "think",
      mode: prev.mode,
      nextISO: iso(next === "done" ? now : (parseReview(next) as any).next),
    } : { id, reason: "写后复核读不一致（重试或查内核日志）" });
  }
  return successResponse({
    deferred, skipped,
    requested: ids.length, deferredCount: deferred.length,
    hint: "deferred=已推迟（属性落盘已复核，ws 自动同步前端，无需刷新）；skipped=跳过及原因；规则式（省略 to）=曲线 ×2 拉长/日程 +1 天，指定 to=保持节奏改到目标日",
  });
}

// ============ 知识地图三 action（□7：建图素材/对齐合并落盘/读图邻域） ============

/** map_save 入参上限（防一次性巨 payload 写盘风暴；建图分批是常态） */
const MAP_SAVE_NODE_LIMIT = 200;
const MAP_SAVE_EDGE_LIMIT = 400;

/** 思源块 id 形状（同 kernel/progData BLOCK_ID_RE；兼收 SQL 元字符防注入——review P1-2） */
const BLOCK_ID_RE = /^\d{14}-[a-z0-9]{7}$/;

/** map_* 三入口共用守卫：bookID 形态 + 书在册（review P1-2/P2-8：裸拼 SQL 注入面 +
 * 任意块 id 可过 getBlockInfo 在无辜文档下建「知识地图」） */
async function mapBookGuard(bookID: string): Promise<KBookInfo | string> {
  if (!BLOCK_ID_RE.test(bookID)) return `bookID 形态非法：${bookID.slice(0, 40)}（list_books 返回的书壳文档 id）`;
  const infos = await readBooksInfos();
  const info = infos[bookID];
  if (!info) return `书未注册（bookID=${bookID}，先 list_books 拿在册书）`;
  return info;
}

async function mapContext(input: Record<string, any>) {
  const bookID = String(input.bookID ?? "").trim();
  const guard = await mapBookGuard(bookID);
  if (typeof guard === "string") return errorResponse(guard);
  const scope = {
    vols: Array.isArray(input.vols) ? input.vols.map(String).filter(Boolean) : undefined,
    points: Array.isArray(input.points) ? input.points.map(Number).filter(Number.isInteger) : undefined,
  };
  const data = await collectMapContext(bookID, scope);
  return successResponse({
    ...data,
    hint: "建图素材=卷结构+片标题+片首段摘录。工作流：本工具拿素材与现有池子→你分析产出节点/边→map_save 提交（对齐规则见 alignment）→map_read 验收。anchors=片 point（pieces 里出现过的数字）。",
  });
}

async function mapSave(input: Record<string, any>) {
  const bookID = String(input.bookID ?? "").trim();
  const guard = await mapBookGuard(bookID);
  if (typeof guard === "string") return errorResponse(guard);
  const nodes: IncomingNode[] = Array.isArray(input.nodes) ? input.nodes : null;
  const edges: IncomingEdge[] = Array.isArray(input.edges) ? input.edges : [];
  if (!nodes || !nodes.length) return errorResponse("nodes 必填：节点数组 [{name, aliases?, type?, summary?, anchors?, id?}]（type=person/concept/event/place/theme）");
  if (nodes.length > MAP_SAVE_NODE_LIMIT) return errorResponse(`nodes 上限 ${MAP_SAVE_NODE_LIMIT}（收到 ${nodes.length}）——分批提交`);
  if (edges.length > MAP_SAVE_EDGE_LIMIT) return errorResponse(`edges 上限 ${MAP_SAVE_EDGE_LIMIT}（收到 ${edges.length}）——分批提交`);
  const pieceCount = await readPieceCount(bookID);
  // review P0-1：卷表缺失/损坏时 pieceCount=0，washAnchors 上界 0 会把存量节点 anchors
  // 一并洗空落盘且零回执——拒绝合并防误清（与 map_context「无卷表暂不支持」语义对齐）
  if (pieceCount <= 0) return errorResponse(`卷表为空或不可读（pieceCount=0），拒绝合并防证据锚误清（bookID=${bookID}）`);
  const report = await runExclusive(bookID, async () => {
    const existing = await readPool(bookID);
    const merged = mergeIntoPool(existing, nodes, edges, pieceCount);
    if (!merged.map.nodes.length) return merged;
    const ok = await writePool(bookID, merged.map);
    if (!ok) throw new Error("落盘失败（写后回读不一致，可重试）");
    return merged;
  });
  if (!report.map.nodes.length) {
    return errorResponse(`有效节点为零（invalid=${JSON.stringify(report.invalid)}）`);
  }
  return successResponse({
    saved: true,
    poolSize: { nodes: report.map.nodes.length, edges: report.map.edges.length },
    // 打磨批（□7 P2「大池子单行 JSON 块大小监控」）：池子单行块字符量随写透出（巨池
    // 趋势可观测——超 ~256KB 进内核单块性能危险区，该分书/整理）
    poolBytes: buildBookMapMD(report.map).length,
    created: report.created,
    reused: report.reused,
    forcedReuses: report.forcedReuses,
    droppedAnchors: report.droppedAnchors,
    droppedEdges: report.droppedEdges,
    invalid: report.invalid,
    hint: "created=新建 id/reused=对齐重用/forcedReuses=撞名强制合并进现有节点（池内名优先，AI 名入别名）/dropped*=被剔除项及原因。map_read 验收全图。",
  });
}

async function mapRead(input: Record<string, any>) {
  const bookID = String(input.bookID ?? "").trim();
  const guard = await mapBookGuard(bookID);
  if (typeof guard === "string") return errorResponse(guard);
  const nameOrId = input.nameOrId != null ? String(input.nameOrId).trim() : "";
  const pool = await readPoolExisting(bookID);
  if (!pool) return successResponse({ bookID, nodes: [], edges: [], views: [], hint: "池子未建——先 map_context 拿素材建图" });
  const sub = nameOrId ? neighborhood(pool, nameOrId) : { nodes: pool.nodes, edges: pool.edges };
  return successResponse({
    bookID,
    full: !nameOrId,
    ...(nameOrId && !sub.nodes.length ? { miss: nameOrId } : {}),
    nodes: sub.nodes,
    edges: sub.edges,
    views: pool.views,
    hint: nameOrId ? "邻域子图=命中节点+1 跳邻居（nameOrId 支持 id/name/别名）" : "池子全集；anchors=证据锚（片 point，docID 见 map_context.pieces 可跳原文）",
  });
}

// ============ 知识地图整理域四 action（□9：删点删边/节点纠错/整理素材/视图归并） ============

/** 整理域写操作批量上限（防一次性巨 payload；对齐 MAP_SAVE_* 量级） */
const MAP_DELETE_NODE_LIMIT = 100;
const MAP_DELETE_EDGE_LIMIT = 200;
const MAP_UPDATE_LIMIT = 100;
const MAP_TIDY_VIEW_LIMIT = 50;
const MAP_TIDY_NODE_PER_VIEW = 500;

/** 写池子的公共骨架：守卫→串行闸内读改写验真；池子未建明确报错（整理域前提=已有图） */
async function mutatePool(
  bookID: string,
  fn: (pool: NonNullable<Awaited<ReturnType<typeof readPoolExisting>>>) => Promise<{ ok: boolean; data?: Record<string, any> }>,
): Promise<ToolResponse> {
  const guard = await mapBookGuard(bookID);
  if (typeof guard === "string") return errorResponse(guard);
  const pool = await readPoolExisting(bookID);
  if (!pool) return errorResponse(`池子未建（bookID=${bookID}）——整理域先 map_context/map_save 建图`);
    return await runExclusive(bookID, async () => {
    const fresh = await readPoolExisting(bookID);
    if (!fresh) throw new Error("池子在整理期间被清空（重试）");
    const r = await fn(fresh);
    if (!r.ok) throw new Error("落盘失败（写后回读不一致，可重试）");
    return successResponse(r.data ?? { saved: true });
  });
}

async function mapDelete(input: Record<string, any>) {
  const bookID = String(input.bookID ?? "").trim();
  const nodeIDs: string[] = Array.isArray(input.nodeIDs) ? input.nodeIDs.map(String).filter(Boolean) : [];
  const edges: EdgeRef[] = Array.isArray(input.edges)
    ? input.edges.filter((e: any) => e && typeof e === "object")
        .map((e: any) => ({ from: String(e.from ?? ""), to: String(e.to ?? ""), relation: String(e.relation ?? "") }))
        .filter(e => e.from && e.to && e.relation)
    : [];
  if (!nodeIDs.length && !edges.length) return errorResponse("nodeIDs/edges 至少给一个：nodeIDs=要删的节点 id 数组，edges=要删的边 [{from,to,relation}]（端点支持 id/name/别名）");
  if (nodeIDs.length > MAP_DELETE_NODE_LIMIT) return errorResponse(`nodeIDs 上限 ${MAP_DELETE_NODE_LIMIT}（收到 ${nodeIDs.length}）——分多批调用`);
  if (edges.length > MAP_DELETE_EDGE_LIMIT) return errorResponse(`edges 上限 ${MAP_DELETE_EDGE_LIMIT}（收到 ${edges.length}）——分多批调用`);
  return await mutatePool(bookID, async fresh => {
    const r = deleteFromPool(fresh, nodeIDs, edges);
    const ok = await writePool(bookID, r.map);
    return { ok, data: {
      deletedNodes: r.deletedNodes,
      cascadeEdges: r.cascadeEdges,
      deletedEdges: r.deletedEdges,
      removedFromViews: r.removedFromViews,
      removedEmptyViews: r.removedEmptyViews,
      missedNodes: r.missedNodes,
      missedEdges: r.missedEdges,
      poolSize: { nodes: r.map.nodes.length, edges: r.map.edges.length, views: r.map.views.length },
      hint: "deletedNodes=删掉的节点/cascadeEdges=端点被删级联的边/deletedEdges=显式删掉的边/removedEmptyViews=剔空一并移除的视图/missed*=未命中项。删除节点前若想保留其关系，可先把边改挂别的节点。",
    } };
  });
}

async function mapUpdate(input: Record<string, any>) {
  const bookID = String(input.bookID ?? "").trim();
  const updates: NodeUpdate[] = Array.isArray(input.updates)
    ? input.updates.filter((u: any) => u && typeof u === "object")
        .map((u: any) => ({ id: String(u.id ?? ""), type: u.type, summary: u.summary }))
    : [];
  // review P2-3：空 id 静默丢弃违背「回执全量」纪律——进 missed（纯函数层持 id="" 未命中语义）
  if (!updates.filter(u => u.id).length) return errorResponse("updates 必填：[{id, type?, summary?}]（id 支持 id/name/别名；type=person/concept/event/place/theme）");
  if (updates.length > MAP_UPDATE_LIMIT) return errorResponse(`updates 上限 ${MAP_UPDATE_LIMIT}（收到 ${updates.length}）——分多批调用`);
  return await mutatePool(bookID, async fresh => {
    const r = updateNodes(fresh, updates);
    const ok = await writePool(bookID, r.map);
    return { ok, data: {
      updated: r.updated,
      missed: r.missed,
      hint: "updated=改到的节点及字段/missed=拒收项及原因（type 只收五枚举；纠错通道不静默兜底）。",
    } };
  });
}

/** 整理契约（pull 红线：AI 只给建议，执行=用户确认后走 map_tidy_apply） */
const TIDY_TEXT = [
  "整理工作流：下方 views 是该书全部视图的清单（含每张的节点名），nodes 是池子名册。",
  "你分析视图级冗余（节点集高度重叠/切法过时），给用户归并建议：哪几张可合成、合成后的视图形态。",
  "用户确认后，用 map_tidy_apply 提交归并后的视图全集（views 全量替换——未合并的视图原样带上，别丢）。",
  "绝不自动整理：建议只在用户点头后执行。节点级冗余已被池子对齐解决，这里只整视图级。",
].join("");

async function mapTidy(input: Record<string, any>) {
  const bookID = String(input.bookID ?? "").trim();
  const guard = await mapBookGuard(bookID);
  if (typeof guard === "string") return errorResponse(guard);
  const pool = await readPoolExisting(bookID);
  if (!pool) return successResponse({ bookID, views: [], nodes: [], hint: "池子未建——先 map_context 建图再谈整理" });
  return successResponse({
    bookID,
    views: viewsDigest(pool),
    nodes: pool.nodes.map(n => ({ id: n.id, name: n.name, type: n.type })),
    tidy: TIDY_TEXT,
    hint: "views.name=视图名/nodeNames=成员节点名/missing=悬空引用数。少于 2 张视图通常无需整理。",
  });
}

async function mapTidyApply(input: Record<string, any>) {
  const bookID = String(input.bookID ?? "").trim();
  const views: BookMapView[] = Array.isArray(input.views)
    ? input.views.filter((v: any) => v && typeof v === "object")
        .map((v: any) => ({ name: String(v.name ?? ""), nodeIDs: Array.isArray(v.nodeIDs) ? v.nodeIDs.map(String) : [], ...(v.layout && typeof v.layout === "object" ? { layout: v.layout } : {}) }))
    : [];
  if (!views.length) return errorResponse("views 必填：归并后的视图全集 [{name, nodeIDs, layout?}]（全量替换——未合并的视图原样带上；清空全部视图是危险操作，本工具不做，删节点用 map_delete）");
  if (views.length > MAP_TIDY_VIEW_LIMIT) return errorResponse(`views 上限 ${MAP_TIDY_VIEW_LIMIT}（收到 ${views.length}）`);
  const oversize = views.filter(v => v.nodeIDs.length > MAP_TIDY_NODE_PER_VIEW).map(v => v.name);
  if (oversize.length) return errorResponse(`单视图 nodeIDs 上限 ${MAP_TIDY_NODE_PER_VIEW}（超限：${oversize.join("、")}）`);
  return await mutatePool(bookID, async fresh => {
    const r = tidyViews(fresh, views);
    // review P1-1：全无效名入参（AI 字段名写错高频面）会静默落盘空视图集——穿透
    // 「清空全部视图不做」红线；存量非空且产物为空=全拒收，拒绝落盘（同 mapSave 拒
    // pieceCount=0 的 handler 层守卫位）
    if (fresh.views.length > 0 && r.map.views.length === 0) {
      throw new Error(`提交视图全部被拒（invalid=${JSON.stringify(r.invalid).slice(0, 120)}）——拒绝落盘防视图全清；检查 name 字段，未合并的视图须原样带上`);
    }
    const ok = await writePool(bookID, r.map);
    return { ok, data: {
      applied: r.applied,
      droppedDupNames: r.droppedDupNames,
      droppedNodeRefs: r.droppedNodeRefs,
      droppedLayouts: r.droppedLayouts,
      invalid: r.invalid,
      poolSize: { nodes: r.map.nodes.length, edges: r.map.edges.length, views: r.map.views.length },
      hint: "applied=采纳的视图名（重名保首）/droppedDupNames=重名被丢的/droppedNodeRefs=悬空节点引用剔除/droppedLayouts=layout 超限剔除/invalid=空名拒收。map_read 验收 views。",
    } };
  });
}

// ============ 老书转目录成书（convert_plan/convert_apply） ============

/** 标题级参数清洗："1"~"6" 数字串；越界/非数字静默丢弃。allowEmpty=false（切卷级）
 *  丢弃后为空=报错；true（分片段级）允许空=纯字数切分（AddBook 同语义） */
function levelList(v: any, field: string, allowEmpty = false): string[] {
  const arr = Array.isArray(v) ? v.map(String) : [];
  const ok = arr.filter(s => /^[1-6]$/.test(s));
  if (!ok.length && !allowEmpty) {
    throw new Error(`${field} 须为 "1"~"6" 标题级数组（如 ["1"] 切卷用 h1、["1","2"] 分片按 h1+h2）`);
  }
  return [...new Set(ok)];
}

async function convertPlanAction(input: Record<string, any>): Promise<ToolResponse> {
  const bookID = String(input.bookID ?? "").trim();
  if (!bookID) return errorResponse("bookID 必填：书壳文档 id（list_books 返回的 bookID）");
  return successResponse(await convertPlan(bookID));
}

async function convertApplyAction(input: Record<string, any>): Promise<ToolResponse> {
  const bookID = String(input.bookID ?? "").trim();
  if (!bookID) return errorResponse("bookID 必填：书壳文档 id");
  let levels: string[], headings: string[];
  try {
    levels = levelList(input.levels, "levels");
    headings = levelList(input.headings, "headings", true);
  } catch (e: any) {
    return errorResponse(String(e?.message ?? e));
  }
  const maxChars = Number(input.maxChars ?? DEFAULT_MAX_CHARS);
  const splitWordNum = Number(input.splitWordNum ?? DEFAULT_SPLIT_WORDS);
  if (!(maxChars >= 1_000 && maxChars <= 10_000_000)) {
    return errorResponse(`maxChars 每卷字数上限须在 1 千~1000 万（默认 ${DEFAULT_MAX_CHARS}；convert_plan.suggestion 有建议值）`);
  }
  if (!(splitWordNum >= 0 && splitWordNum <= 100_000)) {
    return errorResponse(`splitWordNum 每片字数须在 0~10 万（0=不按字数切；默认 ${DEFAULT_SPLIT_WORDS}）`);
  }
  return successResponse(await convertApply(bookID, { levels, maxChars, headings, splitWordNum }));
}

// ============ 结构树三 action（progtree □2：structure_plan/apply/distill） ============

/** 骨架入参清洗：[{title, children?}] 递归——空名节点剔除（AI 笔误防御），全空=报错；
 *  名字剥 [N] 前缀（review P2-5：AI 回传带前缀骨架名走序号增殖路径） */
function parseSkeleton(v: any): SkeletonNode[] {
  const clean = (nodes: any[]): SkeletonNode[] =>
    (Array.isArray(nodes) ? nodes : [])
      .filter(n => n && typeof n === "object" && String(n.title ?? "").trim())
      .map(n => ({ title: String(n.title).trim().replace(/^\[\d+\]/, ""), children: clean(n.children) }));
  const out = clean(v);
  if (!out.length) return [];
  return out;
}

function parsePlacements(v: any): Placement[] {
  return (Array.isArray(v) ? v : [])
    .filter(p => p && typeof p === "object")
    .map(p => ({ materialID: String(p.materialID ?? ""), slotPath: String(p.slotPath ?? "") }))
    .filter(p => p.materialID && p.slotPath);
}

async function structurePlanAction(input: Record<string, any>): Promise<ToolResponse> {
  const bookID = String(input.bookID ?? "").trim();
  if (!bookID) return errorResponse("bookID 必填：写作书书壳文档 id（list_books 返回 status=writing 的书）");
  const slots = parseSkeleton(input.slots);
  const placements = parsePlacements(input.placements);
  if (input.slots != null && !slots.length) return errorResponse("slots 非法：骨架树 [{title(必填), children?}]（同层同名自动加序号；空名剔除后须非空）");
  if (slots.length && input.placements != null && !placements.length && Array.isArray(input.placements)) {
    return errorResponse("placements 非法：[{materialID, slotPath}]（materialID=盘点返回的素材 id，slotPath=骨架标题路径 / 分隔）");
  }
  const offset = Math.max(0, Number(input.offset ?? 0) || 0);
  return successResponse(await structurePlan(bookID, { slots: slots.length ? slots : undefined, placements, offset }));
}

async function structureApplyAction(input: Record<string, any>): Promise<ToolResponse> {
  const bookID = String(input.bookID ?? "").trim();
  if (!bookID) return errorResponse("bookID 必填：写作书书壳文档 id");
  const slots = parseSkeleton(input.slots);
  if (!slots.length) return errorResponse("slots 必填：骨架树 [{title, children?}]（structure_plan 预演与用户确认后原样传入）");
  const placements = parsePlacements(input.placements);
  return successResponse(await structureApply(bookID, slots, placements));
}

async function structureDistillAction(input: Record<string, any>): Promise<ToolResponse> {
  const out = await structureDistill({
    docID: input.docID != null ? String(input.docID) : undefined,
    bookID: input.bookID != null && input.docID == null ? String(input.bookID) : undefined,
    vols: Array.isArray(input.vols) ? input.vols.map(String).filter(Boolean) : undefined,
  });
  if (out && typeof out.error === "string") return errorResponse(out.error);
  return successResponse(out);
}

// ============ 成文整理两 action（loosemat □7：structure_read/structure_compose） ============

async function structureReadAction(input: Record<string, any>): Promise<ToolResponse> {
  const bookID = String(input.bookID ?? "").trim();
  if (!bookID) return errorResponse("bookID 必填：写作书书壳文档 id（list_books 返回 status=writing 的书）");
  return successResponse(await structureRead(bookID, {
    docID: input.docID != null ? String(input.docID) : undefined,
    offset: input.offset != null ? Number(input.offset) : undefined,
  }));
}

async function structureComposeAction(input: Record<string, any>): Promise<ToolResponse> {
  const bookID = String(input.bookID ?? "").trim();
  if (!bookID) return errorResponse("bookID 必填：写作书书壳文档 id");
  const markdown = input.markdown != null ? String(input.markdown) : "";
  if (!markdown.trim()) return errorResponse("markdown 必填：成稿正文（Markdown 文本，≤10 万字符/次；长稿分节 appendTo 续写）");
  return successResponse(await structureCompose(bookID, {
    title: input.title != null ? String(input.title) : undefined,
    markdown,
    appendTo: input.appendTo != null ? String(input.appendTo) : undefined,
  }));
}

// ============ 工具定义 ============

const progressiveDescription = [
    "渐进学习插件（渐进阅读/渐进写作的排期与调度中枢）的 MCP 通道（一期实验，全免费）。",
    "查询：list_books=书单+进度+状态；get_due(date)=某日到期重访+今日片队列（欠债/档位/滚筒接下来推什么书）；",
    "get_schedule(days)=未来排期三段分桶（已到期/N 天内/更远，按书聚合）。",
    "写操作：defer(ids, to)=重访调度推迟（③层实验品）——「这周赶稿，复习挪周末」就批量 defer 到周六。",
    "知识地图（□7）：map_context(bookID)=拿建图素材（卷结构+片摘录+现有节点池+对齐契约）→",
    "AI 分析产出节点/边→map_save(bookID,nodes,edges) 对齐合并落盘（确定性校验回执全量）→",
    "map_read(bookID[,nameOrId]) 读全图或邻域子图。",
    "地图整理（□9）：map_tidy(bookID)=视图整理素材（视图清单+池子名册+归并建议契约）→",
    "你给用户归并建议、用户确认后 map_tidy_apply(bookID,views) 落盘（全量替换）；",
    "map_delete(bookID,nodeIDs,edges)=删节点/删边（级联悬空边+视图剔引用）；",
    "map_update(bookID,updates)=节点纠错（type/summary）。",
    "老书转目录成书：convert_plan(bookID)=现状盘点+建议参数（纯读）→用户确认后",
    "convert_apply(bookID,levels,maxChars,headings,splitWordNum)=清旧片+按标题切卷+重分片+注册",
    "（写操作：书壳正文清空前自动建备份快照；转完知识地图即可用——片文档读书出场时逐片生成）。",
    "写作结构树（0→1 管道）：structure_plan(bookID[,slots,placements])=写作书素材盘点+槽树+缺口",
    "（纯读；带 slots=增量预演返回动作清单不落盘；每槽报素材篇数+手写块数=盘点平权）→与用户确认骨架后 structure_apply(bookID,slots,placements)",
    "=建槽+改挂+素材归位（增量幂等：不删槽不重排不改名；含手写内容的槽=用户原创默认保护只报告不动，已定稿槽同；素材=内容搬进槽+删源）；",
    "structure_distill(docID|bookID)=拆范文出叙事骨架（标题层级+首段摘录），做写作骨架参考。",
    "成文整理（内容为王血缘让路）：structure_read(bookID[,docID,offset])=取槽内容全文（素材+手写一视同仁，",
    "预算分页 nextOffset 续读；docID=单文档全文皆可取）→你按骨架自由改写成稿（段落可拆散穿插）→",
    "structure_compose(bookID,markdown[,title,appendTo])=落成稿文档（书下独立文档：不挂素材血缘、",
    "不占槽位；长稿分节 appendTo 续写只认成稿）——改写断血缘不补不挡；structure_apply 照旧只管搬运永不动成稿与手写。",
    "给 AI 当学习管家的数据底座：先 list_books 看书单，get_due 看今天该复习什么/该读什么，",
    "get_schedule 看未来节奏，defer 执行推迟；读书理解面走知识地图三 action。日期参数支持 'today'/'tomorrow' 语义值与 'YYYY-MM-DD'。",
].join("");

export function createProgressiveTool(): ToolDefinition {
    return {
        name: "progressive",
        config: objectSchema(progressiveDescription, {
            action: {
                type: "string",
                enum: ["list_books", "get_due", "get_schedule", "defer", "map_context", "map_save", "map_read", "map_delete", "map_update", "map_tidy", "map_tidy_apply", "convert_plan", "convert_apply", "structure_plan", "structure_apply", "structure_distill", "structure_read", "structure_compose", "echo"],
                description: "list_books=书单+进度+状态；get_due=到期重访+片队列；get_schedule=未来排期分桶；defer=重访调度推迟（写）；map_context=知识地图建图素材；map_save=建图落盘（对齐合并）；map_read=读图/邻域；map_delete=删节点/删边（级联）；map_update=节点纠错（type/summary）；map_tidy=视图整理素材（给归并建议）；map_tidy_apply=视图归并落盘（用户确认后）；convert_plan=老书转目录成书盘点（纯读+建议参数）；convert_apply=执行转书（写：清旧片+切卷+重分片+注册）；structure_plan=写作书结构盘点/预演（素材+槽树+增量动作清单）；structure_apply=结构落盘（建槽+改挂+素材归位，增量幂等）；structure_distill=拆范文出叙事骨架（标题层级+摘录）；structure_read=取槽/单文档全文（成文改写原料，预算分页）；structure_compose=落成稿文档（AI 自由改写出稿，appendTo 续写）；echo=通道自检",
            },
            bookID: {
                type: "string",
                description: "map_* 用：书壳文档 id（list_books 返回的 bookID）",
            },
            vols: {
                type: "array",
                description: "map_context/structure_distill(bookID 形态) 用：只收这些卷（卷 id 数组；大书分批省 token）",
                items: { type: "string" },
            },
            points: {
                type: "array",
                description: "map_context 用：只收这些 point 的片（片序号数组）",
                items: { type: "number" },
            },
            nodes: {
                type: "array",
                description: "map_save 用：节点数组 ≤200 [{name(必填), aliases?: string[], type?: person|concept|event|place|theme, summary?: string, anchors?: number[]（片 point）, id?: string（能对上现有池子就重用）}]",
                items: { type: "object" },
            },
            edges: {
                type: "array",
                description: "map_save 用：边数组 ≤400 [{from, to（节点 id 或 name）, relation, anchors?: number[]}]；map_delete 用：要删的边 ≤200 [{from, to, relation}]（relation 精确匹配、方向敏感）",
                items: { type: "object" },
            },
            nameOrId: {
                type: "string",
                description: "map_read 用：给=该节点的邻域子图（支持 id/name/别名）；省略=池子全集",
            },
            nodeIDs: {
                type: "array",
                description: "map_delete 用：要删的节点数组 ≤100（元素支持 id/name/别名；级联删悬挂边+视图剔引用）",
                items: { type: "string" },
            },
            updates: {
                type: "array",
                description: "map_update 用：节点纠错数组 ≤100 [{id(必填，支持 id/name/别名), type?: person|concept|event|place|theme, summary?: string}]",
                items: { type: "object" },
            },
            views: {
                type: "array",
                description: "map_tidy_apply 用：归并后的视图全集 ≤50 [{name, nodeIDs(池内节点 id), layout?}]（全量替换，未合并的视图原样带上）",
                items: { type: "object" },
            },
            ids: {
                type: "array",
                description: "defer 用：要推迟的块/文档 id 数组（≤20，get_due/get_schedule 返回的 id）",
                items: { type: "string" },
            },
            to: {
                type: "string",
                description: "defer 用：目标——'tomorrow'/天数数字/'YYYY-MM-DD'；省略=按曲线规则顺延（曲线 ×2、日程 +1 天）",
            },
            date: {
                type: "string",
                description: "get_due 用：'today'（默认）或 'YYYY-MM-DD'（那天的到期全含；历史日返回当日实读账）",
            },
            days: {
                type: "number",
                description: "get_schedule 用：分桶窗口天数（默认 7，1~90）",
            },
            message: {
                type: "string",
                description: "echo 用：回显文本，可省略",
            },
            levels: {
                type: "array",
                description: `convert_apply 用：切卷标题级 ["1"~"6"]（默认 ["1"]；convert_plan.suggestion.levels 有建议值——超限卷自动下切更深级）`,
                items: { type: "string" },
            },
            maxChars: {
                type: "number",
                description: `convert_apply 用：每卷字数上限（默认 ${DEFAULT_MAX_CHARS}）`,
            },
            headings: {
                type: "array",
                description: `convert_apply 用：片内分块标题级 ["1"~"6"]（缺省=空=纯按字数切；按标题分片从 convert_plan.suggestion.headings 拿建议值）`,
                items: { type: "string" },
            },
            splitWordNum: {
                type: "number",
                description: `convert_apply 用：每片字数（默认 ${DEFAULT_SPLIT_WORDS}；0=只按标题切不按字数）`,
            },
            slots: {
                type: "array",
                description: "structure_plan(预演)/structure_apply 用：骨架树 [{title(必填), children?: 递归同构}]（structure_plan 不带=盘点模式带=预演模式；同层同名第二个自动加序号 -2/-3）",
                items: { type: "object" },
            },
            placements: {
                type: "array",
                description: "structure_plan(预演)/structure_apply 用：素材归位表 [{materialID(盘点返回的素材 id), slotPath(骨架标题路径，/ 分隔)}]——素材内容搬进目标槽+删源，撤销=思源拖回",
                items: { type: "object" },
            },
            offset: {
                type: "number",
                description: `structure_plan 盘点模式用：素材页偏移（每页 ${MATERIAL_LIMIT} 篇，超出翻页）；structure_read 列表模式用：槽页偏移（预算分页，上页返回 nextOffset 续读）`,
            },
            docID: {
                type: "string",
                description: `structure_distill 用：范文文档 id（单文档形态：标题层级树+每级首段摘录，上限 ${DISTILL_HEADING_LIMIT} 标题超限报错分批）；structure_read 用：单文档全文模式（槽/素材/手写文档 id 皆可——改写原料）`,
            },
            markdown: {
                type: "string",
                description: "structure_compose 用：成稿正文 Markdown（必填；≤10 万字符/次，长稿分节 appendTo 续写）",
            },
            title: {
                type: "string",
                description: "structure_compose 用：成稿标题（可省略=成稿-书名-时间；多稿并存按时间辨）",
            },
            appendTo: {
                type: "string",
                description: "structure_compose 用：续写目标成稿 docID（首稿返回的 docID；只认本书成稿，槽/手写文档拒收）",
            },
        }, ["action"]),
        handler: wrapHandler(async input => {
            switch (String(input.action ?? "")) {
                case "echo":
                    return successResponse({ echo: typeof input.message === "string" ? input.message : "pong", plugin: "sy-progressive-plugin" });
                case "list_books": return await listBooks();
                case "get_due": return await getDue(input);
                case "get_schedule": return await getSchedule(input);
                case "defer": return await deferAction(input);
                case "map_context": return await mapContext(input);
                case "map_save": return await mapSave(input);
                case "map_read": return await mapRead(input);
                case "map_delete": return await mapDelete(input);
                case "map_update": return await mapUpdate(input);
                case "map_tidy": return await mapTidy(input);
                case "map_tidy_apply": return await mapTidyApply(input);
                case "convert_plan": return await convertPlanAction(input);
                case "convert_apply": return await convertApplyAction(input);
                case "structure_plan": return await structurePlanAction(input);
                case "structure_apply": return await structureApplyAction(input);
                case "structure_distill": return await structureDistillAction(input);
                case "structure_read": return await structureReadAction(input);
                case "structure_compose": return await structureComposeAction(input);
                default:
                    return errorResponse(`未知 action：${input.action}（可用：list_books/get_due/get_schedule/defer/map_context/map_save/map_read/map_delete/map_update/map_tidy/map_tidy_apply/convert_plan/convert_apply/structure_plan/structure_apply/structure_distill/structure_read/structure_compose/echo）`);
            }
        }),
    };
}
