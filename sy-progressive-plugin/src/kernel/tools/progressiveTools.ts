// progressive MCP 工具实现：单工具 progressive + action 枚举（一期实验面）。
// tpmcp □2：list_books/get_due/get_schedule 三查询——纯读零副作用，返回结构化数据
// （ISO 时间戳/书 ID+书名/布尔/计数），不做渲染文案；AI 面向 bear 转述自己会说话。
// 语义函数单一事实源=src/reviewQueue.ts（零依赖纯模块直 import）；petal/SQL 数据面
// 见 ../progData.ts（前端模块依赖链进不了 goja，复刻处已逐个标注）。
import { objectSchema, successResponse, errorResponse, wrapHandler, type ToolDefinition } from "./common";
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
      const next = await simulateNextBooks(quotaToday - readToday);
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
    hint: "revisit=到期重访（think=块级思考/pdigest=文档级复访；id 可跳转：think 为块 id、pdigest 为摘抄文档 id）；pieces=渐进阅读片队列（quotaToday=今日档位/readToday=今日已读/debt=累积欠债/nextBooks=滚筒接下来会轮到的书·只读模拟非精确承诺）",
  });
}

/** 滚筒只读模拟：从 lastServed 起模拟轮转 n 次会推出的书（不写 reading-order.json） */
async function simulateNextBooks(n: number): Promise<{ bookID: string; title: string; point: number; unread: number }[]> {
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
  const pieceCounts = new Map<string, number>();
  for (const [id, info] of entries) {
    pieceCounts.set(id, (info.writing || info.manualMode) ? 0 : (await readBookIndex(id)).length);
  }
  const readable = new Set(entries.filter(([id, info]) =>
    titles.has(id) && !info.ignored && !info.archived && !info.writing && !info.manualMode
    && !isFinished(info.point ?? 0, pieceCounts.get(id) ?? 0),
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

// ============ 工具定义 ============

const progressiveDescription = [
    "渐进学习插件（渐进阅读/渐进写作的排期与调度中枢）的 MCP 通道（一期实验，全免费）。",
    "查询：list_books=书单+进度+状态；get_due(date)=某日到期重访+今日片队列（欠债/档位/滚筒接下来推什么书）；",
    "get_schedule(days)=未来排期三段分桶（已到期/N 天内/更远，按书聚合）。",
    "写操作：defer(ids, to)=重访调度推迟（③层实验品）——「这周赶稿，复习挪周末」就批量 defer 到周六。",
    "给 AI 当学习管家的数据底座：先 list_books 看书单，get_due 看今天该复习什么/该读什么，",
    "get_schedule 看未来节奏，defer 执行推迟。日期参数支持 'today'/'tomorrow' 语义值与 'YYYY-MM-DD'。",
].join("");

export function createProgressiveTool(): ToolDefinition {
    return {
        name: "progressive",
        config: objectSchema(progressiveDescription, {
            action: {
                type: "string",
                enum: ["list_books", "get_due", "get_schedule", "defer", "echo"],
                description: "list_books=书单+进度+状态；get_due=到期重访+片队列；get_schedule=未来排期分桶；defer=重访调度推迟（写）；echo=通道自检",
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
        }, ["action"]),
        handler: wrapHandler(async input => {
            switch (String(input.action ?? "")) {
                case "echo":
                    return successResponse({ echo: typeof input.message === "string" ? input.message : "pong", plugin: "sy-progressive-plugin" });
                case "list_books": return await listBooks();
                case "get_due": return await getDue(input);
                case "get_schedule": return await getSchedule(input);
                case "defer": return await deferAction(input);
                default:
                    return errorResponse(`未知 action：${input.action}（可用：list_books/get_due/get_schedule/defer/echo）`);
            }
        }),
    };
}
