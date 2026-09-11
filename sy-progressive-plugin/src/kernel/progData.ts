// 渐进 kernel 侧数据面（tpmcp □2）：petal JSON（books/reading-order）+ attributes/blocks 轻查询。
// import 纪律：reviewQueue 是零依赖纯模块直接 import（单一事实源）；roller/fleetData/progData
// 前端模块混 progStorage→siyuanApi→window/fetch/Lute 依赖链，import 任意符号=拖全链进 bundle
// 在 goja 崩——涉及处一律精简复刻并标注「复刻自 <模块>」（改源头须同步此处）。
import { DAY } from "../reviewQueue";
import * as api from "./api";

// ============ 常量（值同前端 constants.ts / tomato gconst.ts，本地声明防拖依赖链） ============

export const STORAGE_BOOKS = "books.json";
export const STORAGE_READING_ORDER = "reading-order.json";
const PLOG_DATE = "custom-proglog-date";
const PLOG_DATA = "custom-proglog-data";
/** 摘抄文档 ctime（值=bookID#ct，🔨 前缀=素材已推完） */
export const PDIGEST_CTIME = "custom-pdigest-ctime";
/** 每日档位默认值（前端 dailyQuota settingFactory 默认 "3"） */
export const DEFAULT_QUOTA = 3;

/** 思源块 id 形状（books.json 书键过滤用，同 ProgressiveStorage.BLOCK_ID_RE） */
const BLOCK_ID_RE = /^\d{14}-[a-z0-9]{7}$/;

// ============ petal JSON 读取（siyuan.storage 根=前端 loadData 同目录） ============

/** 读 petal JSON；文件不存在/解析失败=null（kernel storage.get 对缺失文件 reject） */
async function readStorageText(file: string): Promise<string | null> {
  try {
    return await (await siyuan.storage.get(file)).text();
  } catch {
    return null;
  }
}

/** BookInfo（types/utils.d.ts 同源，只列 kernel 侧消费字段；books.json 值=Record<bookID, BookInfo>） */
export interface KBookInfo {
  bookID?: string;
  boxID?: string;
  point?: number;
  activePoint?: number;
  ignored?: boolean;
  archived?: boolean;
  pinned?: boolean;
  hidden?: boolean;
  writing?: boolean;
  manualMode?: boolean;
  time?: number;
}

/** 全部注册书（脏键过滤：只认块 id 形状键，_cache 等历史污染键不算书） */
export function bookEntries(infos: Record<string, KBookInfo>): [string, KBookInfo][] {
  return Object.entries(infos).filter(([k]) => BLOCK_ID_RE.test(k));
}

export async function readBooksInfos(): Promise<Record<string, KBookInfo>> {
  const text = await readStorageText(STORAGE_BOOKS);
  if (!text) return {};
  try {
    const d = JSON.parse(text);
    return d && typeof d === "object" ? d : {};
  } catch {
    return {};
  }
}

/** 滚筒书序（roller.ts ReadingOrder 同构；缺文件/残缺=空序） */
export interface ReadingOrder { order: string[]; lastServed: string; }

export async function readReadingOrder(): Promise<ReadingOrder> {
  const text = await readStorageText(STORAGE_READING_ORDER);
  if (!text) return { order: [], lastServed: "" };
  try {
    const ro = JSON.parse(text);
    return Array.isArray(ro?.order) ? { order: ro.order, lastServed: String(ro.lastServed ?? "") } : { order: [], lastServed: "" };
  } catch {
    return { order: [], lastServed: "" };
  }
}

/** 索引文件文本 → string[][]（复刻自 ProgressiveStorage.afterLoad；手动/写作书索引恒空=[]) */
export function parseBookIndex(text: string): string[][] {
  return text.split("#").map(piece => piece.split(","));
}

/** 某书片索引（petal 文件名=<bookID>；不存在/空串=空数组——afterLoad("") 产 [[""]]，此处清洗） */
export async function readBookIndex(bookID: string): Promise<string[][]> {
  const text = await readStorageText(bookID);
  if (!text) return [];
  return parseBookIndex(text).map(i => i.filter(j => j?.length > 0)).filter(i => i.length > 0);
}

// ============ ctime 归书（复刻自 progData.parseBookIDFromCtime / fleetData） ============

/** 解析 ctime 值里的 bookID（兼容 🔨#bookID#ct 完成态前缀；slice 按 code unit 同源坑） */
export function parseBookIDFromCtime(value: string): string {
  const v = value.startsWith("🔨#") ? value.slice("🔨#".length) : value;
  return v.split("#")[0] ?? "";
}

function bookIDOfCtime(value: string): string {
  return value?.includes("#") ? parseBookIDFromCtime(value) : "";
}

/** 摘抄文档 → 书 映射（ctime 行 block_id=摘抄文档 ID；复刻自 fleetData.bookOfDocFrom） */
export function bookOfDocFrom(rows: { block_id: string; value: string }[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of rows) {
    const id = bookIDOfCtime(r.value);
    if (id) m.set(r.block_id, id);
  }
  return m;
}

/** 按书摘抄计数（复刻自 fleetData.digestCountsFrom） */
export function digestCountsFrom(rows: { value: string }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const id = bookIDOfCtime(r.value);
    if (!id) continue;
    m.set(id, (m.get(id) ?? 0) + 1);
  }
  return m;
}

// ============ 滚筒纯函数（复刻自 roller.ts，只读模拟不落盘） ============

export function mergeMissingBooks(ro: ReadingOrder, knownBookIDs: string[]): ReadingOrder {
  const known = new Set(knownBookIDs.filter(id => !id.endsWith("_cache")));
  const kept = ro.order.filter(id => known.has(id));
  const inOrder = new Set(kept);
  const missing = [...known].filter(id => !inOrder.has(id));
  if (missing.length === 0 && kept.length === ro.order.length) return ro;
  return { order: [...kept, ...missing], lastServed: ro.lastServed };
}

export function pickNextBook(ro: ReadingOrder, readable: Set<string>): string | null {
  const n = ro.order.length;
  if (n === 0) return null;
  const start = ro.lastServed ? ro.order.indexOf(ro.lastServed) : -1;
  for (let k = 1; k <= n; k++) {
    const idx = start < 0 ? k - 1 : (start + k) % n;
    if (readable.has(ro.order[idx])) return ro.order[idx];
  }
  return null;
}

/** 片读完判定（roller.isFinished：point≥片数；手动/写作书索引恒空=恒真，滚筒不推） */
export function isFinished(point: number, indexLength: number): boolean {
  return point >= indexLength;
}

/** 阅读欠债（roller.summarizeDebt 同源语义；quotaToday 由调用方定：当日账块 q 或默认档） */
export function summarizeDebt(
  days: { date: string; q: number; read: number }[],
  today: string,
  quotaToday: number,
): { readToday: number; quotaToday: number; debt: number; state: "ok" | "warn" | "over" } {
  let debt = 0;
  let readToday = 0;
  for (const d of days) {
    const q = d.date === today ? quotaToday : d.q;
    if (d.date === today) readToday = d.read;
    debt += Math.max(0, q - d.read);
  }
  const state = debt === 0 ? "ok" : debt >= 2 * quotaToday ? "over" : "warn";
  return { readToday, quotaToday, debt, state };
}

// ============ 阅读日志（plog 块 IAL 双键；roller.parseDayLogData 同源防御） ============

/** 全量每日账（PLOG_DATE/PLOG_DATA 两属性全查合成；显式 limit 防内核 64 截尾） */
export async function loadAllDays(): Promise<{ date: string; q: number; read: number }[]> {
  const rows = await api.sql<{ block_id: string; value: string }>(
    `select block_id, value from attributes where name='${PLOG_DATE}' limit 10000000`) ?? [];
  if (!rows.length) return [];
  const inList = rows.map(r => `'${r.block_id}'`).join(",");
  const dataRows = await api.sql<{ block_id: string; value: string }>(
    `select block_id, value from attributes where name='${PLOG_DATA}' and block_id in (${inList}) limit 10000000`) ?? [];
  const dataOf = new Map(dataRows.map(r => [r.block_id, String(r.value ?? "")]));
  const days: { date: string; q: number; read: number }[] = [];
  for (const r of rows as { block_id: string; value: string }[]) {
    const d = parseDayLogData(dataOf.get(r.block_id));
    days.push({ date: String(r.value), q: d.q, read: Object.values(d.b).reduce((s, n) => s + n, 0) });
  }
  return days;
}

/** 某日账块原始数据（无块=null；b=各书已读片数） */
export async function readDayData(date: string): Promise<{ q: number; b: { [bookID: string]: number } } | null> {
  const rows = await api.sql<{ block_id: string }>(
    `select block_id from attributes where name='${PLOG_DATE}' and value='${date}' limit 1`) ?? [];
  if (!rows.length) return null;
  const attrs = await api.getBlockAttrs(rows[0].block_id);
  return parseDayLogData(attrs?.[PLOG_DATA] ?? "");
}

function parseDayLogData(raw: string): { q: number; b: { [bookID: string]: number } } {
  try {
    const d = JSON.parse(raw);
    if (typeof d?.q === "number" && d?.b && typeof d.b === "object") return d;
  } catch { }
  return { q: DEFAULT_QUOTA, b: {} };
}

// ============ 日期工具（timezone 安全：以本地日界切日） ============

/** 'YYYY-MM-DD' 本地日串（todayStr 同源） */
export function todayStr(now: number): string {
  const d = new Date(now);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** ISO 日期串 → 当日 23:59:59.999 的毫秒时间戳（「那天的到期」全含语义）；非法输入 null */
export function endOfISODate(s: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T23:59:59.999`);
  return isNaN(d.getTime()) ? null : d.getTime();
}

export const DAY_MS = DAY;
