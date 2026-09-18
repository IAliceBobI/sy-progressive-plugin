// 老书转目录成书——kernel 侧 IO 面（goja）。纯逻辑复用 src/splitCore.ts（与前端
// 物理分卷/加书同源）；petal 写面与前端 ProgressiveStorage 落盘形态逐一对齐
// （books.json=对象 JSON、索引=JSON.stringify({data})、卷表={v:1,vols}）。
// 物理建片**不在此链**（fastCopyBlock 断句/回链/收束卡是前端 DOM/Lute 依赖，goja 无
// DOM）——片留给阅读链惰性出场建（createPiece），知识地图素材走 bookMapIo 的索引+
// 块直读回退，转完立即可建图。
// 中断安全（对齐 AddBook「先卷表后索引」哲学）：先切卷后注册——中断态=卷文档在+卷表
// 无，可检测；重入由「非片子文档守卫」拦下并报出路（清残留卷再转）。
import * as api from "./api";
import { readBooksInfos, readBookIndex, bookEntries, type KBookInfo } from "./progData";
import { readVolTable, runExclusive } from "./bookMapIo";
import {
    childBlocksToVolBlocks, splitIntoVols, runSplitVols, buildVolsContent, computePieceIndexVolsCore,
    type VolPlan,
} from "../splitCore";

/** 同前端 gconst（本地声明防拖依赖链，progData PLOG_* 先例；改源头须同步） */
const MarkKey = "custom-progmark";
const MarkBookKey = "book#插件管理勿改managedByPluginDoNotModify";
const PDIGEST_CTIME = "custom-pdigest-ctime";

/** 片文档过滤 SQL（复刻自 originTrace.ts pieceFilterSQL——digest 摘抄文档靠 ctime
 *  属性存在性一刀切，误删摘抄=2026-09-04 实锤事故） */
function pieceFilterSQL(bookID: string) {
    return `type='d' and ial like '%${MarkKey}="插件管理勿改managedByPluginDoNotModify#${bookID},%' and ial not like '%${PDIGEST_CTIME}="%'`;
}

/** 物理分卷每卷上限默认档（SplitVolsDialog MAX_TIERS[DEFAULT_MAX_IDX] 同值） */
export const DEFAULT_MAX_CHARS = 50_0000;
/** 分片每片字数默认（AddBook SPLIT_TIERS[DEFAULT_SPLIT_IDX] 同值） */
export const DEFAULT_SPLIT_WORDS = 500;

// ============ convert_plan（纯读） ============

export interface ConvertPlanData {
    book: { bookID: string; title: string; status: string; pieceCount: number; point: number; dirMode: boolean };
    content: { textLen: number; rawBlockCount: number; headingLevels: { level: string; count: number }[] };
    children: { total: number; pieces: number; others: { id: string; name: string }[] };
    suggestion: { levels: string[]; maxChars: number; headings: string[]; splitWordNum: number };
    notes: string[];
}

/** 层级统计（getChildBlocks 直读一次；h1~h6 各计数，0 计数级不列） */
function headingLevelStats(blocks: { type: string; subType: string }[]) {
    const m = new Map<string, number>();
    for (const b of blocks) {
        if (b.type !== "h" || !b.subType) continue;
        const lv = String(b.subType).replace(/^h/, "");
        m.set(lv, (m.get(lv) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => Number(a[0]) - Number(b[0])).map(([level, count]) => ({ level, count }));
}

export async function convertPlan(bookID: string): Promise<ConvertPlanData> {
    const infos = await readBooksInfos();
    const info = bookEntries(infos).find(([id]) => id === bookID)?.[1];
    if (!info) throw new Error(`书未注册（bookID=${bookID}，先 list_books 拿在册书）`);
    if (info.writing || info.manualMode) throw new Error("写作书/手动分片书无卷结构语义，不支持转目录成书");
    const vols = await readVolTable(bookID);
    if (vols.length > 0) throw new Error(`书已是目录成书形态（${vols.length} 卷），勿重复转`);
    const shell = await api.sql<{ box: string; path: string; content: string }>(
        `select box, path, content from blocks where type='d' and id='${bookID}' limit 1`);
    if (!shell?.[0]?.box) throw new Error(`书壳不可读（bookID=${bookID} 可能已删）`);

    const children = await api.getChildBlocks(bookID).catch(() => null);
    if (children == null) throw new Error("书壳 getChildBlocks 失败（API 异常）");
    const volBlocks = childBlocksToVolBlocks(children);
    const textLen = volBlocks.reduce((s, b) => s + b.count, 0);
    if (volBlocks.length === 0) throw new Error("书壳无内容块（空文档无可转内容）");
    const levels = headingLevelStats(volBlocks);
    if (levels.length === 0) {
        throw new Error("书内无标题块——切卷按标题层级分段，无标题书请先在前端用加书弹窗单篇重分成小片书");
    }

    // 子文档盘点：磁盘直查全量 + SQL 片 IAL 识别（片=可清理对象；其余=守卫报告对象）
    const dirPath = String(shell[0].path ?? "").replace(/\.sy$/, "");
    // 空目录（书壳无子文档）listDocsByPath code=-1（kernel api.call 会 throw，前端是
    // 吞掉返 null——bookMapIo 同款 catch 落 [] 对齐）
    const docChildren = await api.listDocsByPath(String(shell[0].box), dirPath).catch(() => [] as any[]);
    const ids = (docChildren ?? []).map(d => String(d.id ?? "")).filter(Boolean);
    const pieceIDs = new Set<string>();
    if (ids.length > 0) {
        const inList = ids.map(i => `'${i}'`).join(",");
        const rows = await api.sql<{ id: string }>(
            `select id from blocks where id in (${inList}) and ${pieceFilterSQL(bookID)} limit 10000000`) ?? [];
        rows.forEach(r => pieceIDs.add(String(r.id)));
    }
    const others = (docChildren ?? [])
        .filter(d => !pieceIDs.has(String(d.id ?? "")))
        .map(d => ({ id: String(d.id ?? ""), name: String(d.name ?? "") }));

    const bookIndex = await readBookIndex(bookID);

    const suggestion = {
        // 切卷默认=最粗实存级（SplitVolsDialog 同逻辑：粗级先切、超限自动下切）
        levels: [levels[0].level],
        maxChars: DEFAULT_MAX_CHARS,
        // 分片默认=全部实存级（AddBook 目录态默认全勾）
        headings: levels.map(l => l.level),
        splitWordNum: DEFAULT_SPLIT_WORDS,
    };
    const notes = [
        "apply 将清空书壳正文（先建「·切分前备份」快照再删，-delete- 历史即时可恢复）",
        `旧片 ${pieceIDs.size} 张将被删除；旧读进度 point=${info.point ?? 0} 归零（片边界全变，无法映射）`,
        "物理片不预建：读书出场时逐片生成（前端链）；知识地图素材走索引+块直读，转完即可建图",
        "前端插件持有 books.json 内存缓存——转完建议尽快让用户 F5/重载插件，避免前端旧缓存覆盖注册",
    ];
    if (others.length > 0) {
        notes.unshift(`书壳下有 ${others.length} 个非片子文档，apply 会被守卫拦下——先移走或删除：${others.map(o => o.name).slice(0, 5).join("、")}${others.length > 5 ? " 等" : ""}`);
    }
    return {
        book: {
            bookID, title: String(shell[0].content ?? ""), status: info.archived ? "archived" : "reading",
            pieceCount: bookIndex.length, point: info.point ?? 0, dirMode: false,
        },
        content: { textLen, rawBlockCount: children.length, headingLevels: levels },
        children: { total: ids.length, pieces: pieceIDs.size, others },
        suggestion,
        notes,
    };
}

// ============ convert_apply（执行） ============

export interface ConvertOptions {
    /** 切卷标题级（"1"~"6" 子集，字符串数字） */
    levels: string[];
    /** 每卷字数上限（默认 50 万） */
    maxChars: number;
    /** 片内分块标题级（"1"~"6"，不含 "b"） */
    headings: string[];
    /** 每片字数（0=不按字数切；默认 500） */
    splitWordNum: number;
}

export interface ConvertApplyResult {
    bookID: string;
    volCount: number;
    vols: { id: string; name: string; pieceCount: number }[];
    pieceCount: number;
    piecesRemoved: number;
    warning: string;
}

/** kernel 版切卷 deps（splitVolsRun.splitVolsDeps 同构，HTTP 通道） */
function kernelSplitDeps() {
    return {
        getDocRow: async (id: string) => {
            const rows = await api.sql<{ box: string; path: string; hpath: string; content: string }>(
                `select box, path, hpath, content from blocks where type='d' and id='${id}' limit 1`);
            const row = rows?.[0];
            if (!row?.box) return null;
            return { box: String(row.box), path: String(row.path ?? ""), hpath: String(row.hpath ?? ""), content: String(row.content ?? "") };
        },
        createDocWithMd: async (notebook: string, hpath: string, md: string, attr?: Record<string, string>) => {
            const id = await api.createDocWithMd(notebook, hpath, md);
            if (id && attr) {
                // HTTP createDocWithMd 传 custom- 不落 IAL（实测）——建后补 setBlockAttrs 两步
                await api.setBlockAttrs(id, attr);
            }
            return id ?? "";
        },
        sortDocs: (notebook: string, paths: string[]) => api.changeSort(notebook, paths),
        removeDoc: (id: string) => api.removeDocByID(id),
        deleteBlocks: async (ids: string[]) => {
            // 巨书清空=数万 op 单事务有超时/假成功风险——分批 2000 提交（复核读兜底不变）
            for (let i = 0; i < ids.length; i += 2000) {
                await api.deleteBlocks(ids.slice(i, i + 2000));
            }
        },
        recheckChildBlocks: async (id: string) => {
            const children = await api.getChildBlocks(id).catch(() => null);
            if (children == null) return -1;
            return children.filter(c => c.markdown || c.content).length;
        },
        log: (msg: string) => { void siyuan.logger.info("[convert]", msg); },
    };
}

/** 转书执行（复用 bookMapIo 同书串行闸：与 map_save 共闸，转书中建图排队不并发） */
export async function convertApply(bookID: string, opts: ConvertOptions): Promise<ConvertApplyResult> {
    return runExclusive(bookID, () => doConvert(bookID, opts));
}

async function doConvert(bookID: string, opts: ConvertOptions): Promise<ConvertApplyResult> {
    const infos = await readBooksInfos();
    const info = bookEntries(infos).find(([id]) => id === bookID)?.[1];
    if (!info) throw new Error(`书未注册（bookID=${bookID}）`);
    if (info.writing || info.manualMode) throw new Error("写作书/手动分片书不支持转目录成书");
    if ((await readVolTable(bookID)).length > 0) throw new Error("书已是目录成书形态，勿重复转");

    const deps = kernelSplitDeps();
    const row = await deps.getDocRow(bookID);
    if (!row) throw new Error(`书壳不可读（bookID=${bookID}）`);

    // 守卫：书壳下非片子文档=拦（含上次中断的半转卷；未索引文档查不到 ial 也落此栏=保守拒）
    const dirPath = row.path.replace(/\.sy$/, "");
    const docChildren = await api.listDocsByPath(row.box, dirPath).catch(() => [] as any[]);
    const ids = (docChildren ?? []).map(d => String(d.id ?? "")).filter(Boolean);
    const others: { id: string; name: string }[] = [];
    if (ids.length > 0) {
        const inList = ids.map(i => `'${i}'`).join(",");
        const pieceRows = await api.sql<{ id: string }>(
            `select id from blocks where id in (${inList}) and ${pieceFilterSQL(bookID)} limit 10000000`) ?? [];
        const pieceIDs = new Set(pieceRows.map(r => String(r.id)));
        for (const d of docChildren ?? []) {
            if (!pieceIDs.has(String(d.id ?? ""))) others.push({ id: String(d.id ?? ""), name: String(d.name ?? "") });
        }
    }
    if (others.length > 0) {
        throw new Error(`书壳下有 ${others.length} 个非片子文档（卷残留请删除后重试）：` +
            others.map(o => `${o.name}(${o.id})`).slice(0, 5).join("、"));
    }

    // 1) 清旧片（先于切卷：旧片挂书壳根，切卷只删块不删片文档）
    const pieceRows = await api.sql<{ id: string }>(
        `select id from blocks where ${pieceFilterSQL(bookID)} limit 10000000`) ?? [];
    let piecesRemoved = 0;
    for (const r of pieceRows) {
        try {
            await api.removeRiffCards([String(r.id)]);
            await api.removeDocByID(String(r.id));
            piecesRemoved++;
        } catch { /* 单片失败不阻断（deleteAllPieces 同语义），残留片重转可再清 */ }
    }

    // 2) 切卷（childBlocksToVolBlocks→splitIntoVols→runSplitVols；书壳正文清空）
    const children = await api.getChildBlocks(bookID).catch(() => null);
    if (children == null) throw new Error("书壳 getChildBlocks 失败");
    const volBlocks = childBlocksToVolBlocks(children);
    if (volBlocks.length === 0) throw new Error("书壳无内容块");
    const plan: VolPlan[] = await splitIntoVols(volBlocks, opts.levels, opts.maxChars);
    const volIDs = await runSplitVols(bookID, plan, children.map(c => String(c.id)), deps);

    // 3) 分片计算（逐卷 getChildBlocks 直读无索引窗；卷 id 序=changeSort 钉过的读序）
    const content = await buildVolsContent(volIDs, id => api.getChildBlocks(id));
    const { groups, perVol } = await computePieceIndexVolsCore(
        content, opts.headings, opts.splitWordNum, stmt => api.sql(stmt));
    if (groups.length === 0) throw new Error("分片计算产出 0 片（参数过严或卷内容异常）");

    // 4) 注册（对齐 AddBook.process：书壳 attrs→卷表→索引→bookInfo；中断=新卷+老注册可检测）
    await api.setBlockAttrs(bookID, { "custom-sy-readonly": "true", [MarkKey]: MarkBookKey });
    await siyuan.storage.put(`${bookID}.vols.json`, JSON.stringify({
        v: 1, vols: volIDs.map((d, i) => ({ d, n: perVol[i] ?? 0 })),
    }));
    await siyuan.storage.put(bookID, JSON.stringify({ data: groups.map(g => g.map(wc => wc.id).join(",")).join("#") }));
    // books.json 紧凑读-改-写（重读最新盘态窄化前端整文件落盘的覆盖窗）；条目=全新默认
    // （AddBook resetBookInfo 同语义：旧 point 归零，片边界全变无法映射）
    const fresh = await readBooksInfos();
    const next: KBookInfo = {
        time: Date.now(),
        boxID: row.box,
        point: 0,
        bookID,
        dirMode: true,
        bookName: row.content,
        activePoint: 0,
    };
    fresh[bookID] = next;
    await siyuan.storage.put("books.json", JSON.stringify(fresh));

    return {
        bookID,
        volCount: volIDs.length,
        vols: plan.map((p, i) => ({ id: volIDs[i], name: (p.title || `卷${i + 1}`) + (p.suffix ?? ""), pieceCount: perVol[i] ?? 0 })),
        pieceCount: groups.length,
        piecesRemoved,
        warning: "前端插件持有 books.json 内存缓存，转完请让用户 F5 或重载插件（防旧缓存覆盖注册）；物理片不预建，读书出场逐片生成",
    };
}
