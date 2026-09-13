import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import * as constants from "./constants";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
import { Plugin } from "siyuan";
import * as utils from "../../sy-tomato-plugin/src/libs/utils";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import { ensureAnchoredDoc, findDocByIal, getDocIalProgData, getDocIalDigestDir, getDocIalDigestDirUnder, getDocIalDigestDirHub, getDocIalDigestHub, getDocIalFreeDigestDir, getDocIalNoteBox, getDocIalNoteDir, getDocIalReadLog, getDocIalWords } from "./progData";
import { MarkKey } from "../../sy-tomato-plugin/src/libs/gconst";
import type { ReadingOrder } from "./roller";
import type { VolEntry } from "./volIndex";
import { osFs } from "../../sy-tomato-plugin/src/libs/globals";
import { events } from "../../sy-tomato-plugin/src/libs/Events";

export class ProgressiveStorage {
    private plugin: Plugin;
    // □13 门闩：onLayoutReady 的 loadData 往返窗口内，思源 loadData 先占位 data=""、
    // booksInfos() 见 "" 会重置 {}，此时任何写路径落盘 = 空/单条目覆盖磁盘全部旧书
    // （e2e 连续重载实丢过一次 books.json）。窗口内的写只改内存且随即被 loadData
    // 回调覆盖，丢弃即可；loadData 完成前的整体落盘（books/reading-order）一律不放行
    private storageReady = false;

    async onLayoutReady(plugin: Plugin) {
        this.plugin = plugin;
        // load only need once, save many
        await utils.tryFixCfg(this.plugin.name, constants.STORAGE_BOOKS);
        await this.plugin.loadData(constants.STORAGE_BOOKS);
        await this.plugin.loadData(constants.STORAGE_PROGDATA);
        // reading-order 此前只写不读，重载即丢书序/lastServed（由 mergeMissingBooks 重排兜底）
        await this.plugin.loadData(constants.STORAGE_READING_ORDER);
        // revtrace enrollment 基线（加载即可用；写入走 enrollRevTrace 门闩）
        await this.plugin.loadData(constants.STORAGE_REVTRACE);
        Object.entries(this.booksInfos()).forEach(([_k, v]) => {
            if (typeof v.autoCard === "string") {
                if (v.autoCard === "yes") v.autoCard = true;
                else v.autoCard = false;
            }
            if (typeof v.ignored === "string") {
                if (v.ignored === "yes") v.ignored = true;
                else v.ignored = false;
            }
        });
        this.storageReady = true;
        // □1 半注册自愈（治历史存量）：断在 saveIndex 与 resetBookInfo 之间的加书在此补注册；
        // 移动端/浏览器端读不到 fs 时内部静默跳过
        await this.healHalfRegistered();
    }

    async updateBookInfoTime(docID: string) {
        this.updateBookInfo(docID, {} as any);
    }

    async resetBookReadingPoint(docID: string) {
        this.updateBookInfo(docID, { point: 0 } as any);
    }

    async setIgnoreBook(bookID: string, v?: boolean) {
        if (v === undefined) {
            const info = await this.booksInfo(bookID);
            if (!info.ignored) {
                await this.updateBookInfo(bookID, { ignored: true } as any);
                await siyuan.pushMsg(tomatoI18n.已经忽略本书);
            } else {
                await this.updateBookInfo(bookID, { ignored: false } as any);
                await siyuan.pushMsg(tomatoI18n.重新推送本书);
            }
        } else {
            await this.updateBookInfo(bookID, { ignored: v } as any);
            if (v) {
                await siyuan.pushMsg(tomatoI18n.已经忽略本书);
            } else {
                await siyuan.pushMsg(tomatoI18n.重新推送本书);
            }
        }
    }

    /** 舰队管理 □2：置顶/取消置顶（纯视觉排序，调度零改动） */
    async setPinnedBook(bookID: string, v: boolean) {
        await this.updateBookInfo(bookID, { pinned: v } as any);
        await siyuan.pushMsg(v ? tomatoI18n.已置顶本书 : tomatoI18n.已取消置顶本书);
    }

    /** 期2 写作书：续转指针（开片/入槽/拆分时写；轮到优先开它）。静默不 toast——
     *  高频后台写，用户可见反馈由「打开的片」本身承担 */
    async setActivePoint(bookID: string, point: number) {
        await this.updateBookInfo(bookID, { activePoint: point } as any);
    }

    /** 舰队管理 □2：从总览隐匿/取消隐匿（纯视觉，滚筒照推；不 toast——面板/管理页
     *  即时变化即反馈，取消隐匿侧由调用方给「已在总览显示」提示） */
    async setHiddenBook(bookID: string, v: boolean) {
        await this.updateBookInfo(bookID, { hidden: v } as any);
    }

    async setShowLastBlock(bookID: string, v: boolean) {
        await this.updateBookInfo(bookID, { showLastBlock: v } as any);
        if (v) {
            await siyuan.pushMsg(tomatoI18n.显示上一分片最后一个内容块);
        } else {
            await siyuan.pushMsg(tomatoI18n.cancel取消 + tomatoI18n.显示上一分片最后一个内容块);
        }
    }

    async disableAutoSplitSentence(bookID: string) {
        await this.updateBookInfo(bookID, { autoSplitSentenceP: false } as any);
        await this.updateBookInfo(bookID, { autoSplitSentenceT: false } as any);
        await this.updateBookInfo(bookID, { autoSplitSentenceI: false } as any);
    }

    async setAutoSplitSentence(bookID: string, v: boolean, t: AsList) {
        const info = await this.booksInfo(bookID);
        info.autoSplitSentenceP = false;
        info.autoSplitSentenceT = false;
        info.autoSplitSentenceI = false;
        if (t == "p") {
            await this.updateBookInfo(bookID, { autoSplitSentenceP: v } as any);
            if (v) {
                await siyuan.pushMsg(tomatoI18n.自动断句 + "P");
            } else {
                await siyuan.pushMsg(tomatoI18n.cancel取消 + tomatoI18n.自动断句 + "P");
            }
        } else if (t == "t") {
            await this.updateBookInfo(bookID, { autoSplitSentenceT: v } as any);
            if (v) {
                await siyuan.pushMsg(tomatoI18n.自动断句 + "T");
            } else {
                await siyuan.pushMsg(tomatoI18n.cancel取消 + tomatoI18n.自动断句 + "T");
            }
        } else if (t == "i") {
            await this.updateBookInfo(bookID, { autoSplitSentenceI: v } as any);
            if (v) {
                await siyuan.pushMsg(tomatoI18n.自动断句 + "I");
            } else {
                await siyuan.pushMsg(tomatoI18n.cancel取消 + tomatoI18n.自动断句 + "I");
            }
        }
    }

    async setAddingIndex2paragraph(bookID: string, opt: boolean) {
        await this.updateBookInfo(bookID, { addIndex2paragraph: opt } as BookInfo);
        await siyuan.pushMsg(`${tomatoI18n.给分片内段落标上序号}：${opt}`);
    }

    // v5 □7：计划流（finishDays/finishTimeSecs/finishPieceID/finishIgnore/finishShowInput）与
    // autoCard 写入口整体退役；BookInfo 类型字段保留读兼容（旧 books.json 数据不迁移）
    static defaultBookInfo(): BookInfo {
        return {
            time: 0,
            boxID: "",
            point: 0,
            bookID: "",
            ignored: false,
            autoCard: false,
            showLastBlock: false,
            autoSplitSentenceP: false,
            autoSplitSentenceI: false,
            autoSplitSentenceT: false,
            addIndex2paragraph: false,
            manualMode: false,
            writing: false,
            activePoint: 0,
        }
    }

    async resetBookInfo(docID: string, opt: BookInfo) {
        this.booksInfos()[docID] = opt;
        return this.saveBookInfos();
    }

    async healHalfRegistered(extern?: {
        listPetalFiles?: () => Promise<string[] | null>;
        bookExists?: (id: string) => Promise<boolean>;
    }): Promise<string[]> {
        try {
            const listFiles = extern?.listPetalFiles ?? (() => this.listPetalFiles());
            const bookExists = extern?.bookExists ?? ((id: string) => siyuan.checkBlockExist(id));
            const files = await listFiles();
            if (!files) return [];
            const healed: string[] = [];
            for (const id of halfRegisteredIDs(files, Object.keys(this.booksInfos()))) {
                if (!(await bookExists(id))) continue;
                const info = ProgressiveStorage.defaultBookInfo();
                info.bookID = id;
                info.time = await siyuan.currentTimeMs();
                // review P2-4：petal 存在卷表文件=目录书（写库先表后索引的半注册态也
                // 带表）——补 dirMode 防 heal 后退化单篇语义（locatePiece 失效挂书壳兜底）
                if (files.includes(ProgressiveStorage.volTableFileKey(id))) info.dirMode = true;
                await this.resetBookInfo(id, info);
                healed.push(id);
            }
            return healed;
        } catch (e) {
            console.error("healHalfRegistered failed", e);
            return [];
        }
    }

    /** petal 存储目录文件名列表；移动端/无 dataDir（浏览器端）返回 null = 自愈降级跳过 */
    private async listPetalFiles(): Promise<string[] | null> {
        try {
            if (events.isMobile) return null;
            const dataDir = window.siyuan?.config?.system?.dataDir;
            if (!dataDir) return null;
            const path = require("path");
            return (await osFs().readdir(path.join(dataDir, "storage", "petal", this.plugin.name))) as string[];
        } catch {
            return null;
        }
    }

    private async updateBookInfo(docID: string, opt: BookInfo) {
        if (docID?.length !== "20231218000645-9aaaltd".length) return;

        const info = await this.booksInfo(docID);
        if (typeof opt.addIndex2paragraph === "boolean") info.addIndex2paragraph = opt.addIndex2paragraph;
        if (typeof opt.manualMode === "boolean") info.manualMode = opt.manualMode;
        if (typeof opt.writing === "boolean") info.writing = opt.writing;
        if (typeof opt.ignored === "boolean") info.ignored = opt.ignored;
        if (typeof opt.showLastBlock === "boolean") info.showLastBlock = opt.showLastBlock;
        if (typeof opt.autoSplitSentenceP === "boolean") info.autoSplitSentenceP = opt.autoSplitSentenceP;
        if (typeof opt.autoSplitSentenceT === "boolean") info.autoSplitSentenceT = opt.autoSplitSentenceT;
        if (typeof opt.autoSplitSentenceI === "boolean") info.autoSplitSentenceI = opt.autoSplitSentenceI;
        if (typeof opt.pinned === "boolean") info.pinned = opt.pinned;
        if (typeof opt.hidden === "boolean") info.hidden = opt.hidden;
        if (typeof opt.dirMode === "boolean") info.dirMode = opt.dirMode;
        if (utils.isValidNumber(opt.point)) info.point = opt.point;
        if (utils.isValidNumber(opt.activePoint)) info.activePoint = opt.activePoint;

        info.time = await siyuan.currentTimeMs();
        this.booksInfos()[docID] = info;
        return this.saveBookInfos();
    }

    async booksInfo(docID: string): Promise<BookInfo> {
        if (!docID) return {} as BookInfo;
        let info = this.booksInfos()[docID];
        if (!info) {
            info = ProgressiveStorage.defaultBookInfo();
            info.bookID = docID;
            info.time = await siyuan.currentTimeMs();
            this.booksInfos()[docID] = info;
        }
        if (!info.boxID) {
            const row = await siyuan.sqlOne(`select box from blocks where id="${docID}"`);
            if (!row) {
                siyuan.pushMsg(tomatoI18n.找不到文档对应的笔记本 + docID); // maybe the index is building
                info.boxID = "";
            } else {
                info.boxID = row["box"];
            }
            this.booksInfos()[docID] = info;
        }
        return info;
    }

    booksInfos(): BookInfos {
        const data = this.plugin.data[constants.STORAGE_BOOKS];
        if (!data || typeof data == "string") {
            this.plugin.data[constants.STORAGE_BOOKS] = {};
        }
        return this.plugin.data[constants.STORAGE_BOOKS];
    }

    /** 是否已注册书：键存在且形状为块 id（_cache 等历史污染键不算书）。
     *  全库唯一判定谓词（□11 统一）——digestUtils / ProgressiveBtn / AddBook 等
     *  一律调此，勿再裸查 booksInfos()（此前真值/hasOwnProperty/形状过滤三种写法并存） */
    isRegisteredBook(docID: string): boolean {
        return !!docID && BLOCK_ID_RE.test(docID)
            && Object.prototype.hasOwnProperty.call(this.booksInfos(), docID);
    }

    /** 只读查书档：命中返回现有条目，未命中返回 null——不注册、不补 boxID、不落盘。
     *  rebuild 等容错路径专用（□11）：书可能已删/记录已清，booksInfo() 的自增注册
     *  会造死书键且 time=now 骗过 bookStatus 新书保护期（lost 误判 ok）。
     *  与 isRegisteredBook 同闸（形状不过关的脏键不返回，防 _cache 键以类型谎言命中）。
     *  注：重建成功时 fullfilContent 仍会经单数版重注册活书（等价旧行为，重锚语义） */
    peekBookInfo(docID: string): BookInfo | null {
        if (!this.isRegisteredBook(docID)) return null;
        return this.booksInfos()[docID] ?? null;
    }

    // ============ v5 prog-data 锚定链 ============
    // 根目录：storage ID + IAL 双锚（换设备/清存储靠 IAL 认回）；
    // digest 夹/札记匣：无 storage ID，认回=IAL 全库搜 + 刚建缓存（□1：索引延迟窗口
    // 防重复建，命中经 checkBlockExist 校验活死，见 progData.ts ensureAnchoredDoc）。

    private async saveProgDataID(id: string) {
        this.plugin.data[constants.STORAGE_PROGDATA] = id;
        await this.plugin.saveData(constants.STORAGE_PROGDATA, id);
    }

    /** prog-data 根：惰性建于排序第一的开着笔记本根下；用户可改名/移动，引用永不断 */
    async ensureProgDataRoot(): Promise<string> {
        return ensureAnchoredDoc(getDocIalProgData(), {
            storedID: this.plugin.data[constants.STORAGE_PROGDATA],
            checkBlockExist: (id) => siyuan.checkBlockExist(id),
            findByIal: () => findDocByIal(getDocIalProgData()),
            create: async () => {
                const notebooks = await siyuan.lsNotebooks(false);
                const nb = notebooks?.[0];
                if (!nb) {
                    await siyuan.pushMsg(tomatoI18n.找不到文档对应的笔记本);
                    return "";
                }
                return siyuan.createDocWithMd(nb.id, "/prog-data", "", "", { [MarkKey]: getDocIalProgData() });
            },
            onResolved: (id) => this.saveProgDataID(id),
        });
    }

    /** 任意父文档下建子文档夹（实时取父的 box+hpath 做落点，ID 锚定与位置无关） */
    private async createChildUnder(parentID: string, name: string, ialValue: string): Promise<string> {
        // 首次建父后立即取 box：SQL 索引未进会查空导致整链静默失败，走 getBlockInfo 文件树直查
        const info = await siyuan.getBlockInfo(parentID);
        if (!info?.box) return "";
        const hpath = await siyuan.getHPathByID(parentID, info.box);
        if (!hpath) return "";
        return siyuan.createDocWithMd(info.box, `${hpath}/${name}`, "", "", { [MarkKey]: ialValue });
    }

    /** prog-data 根下建子文档夹 */
    private async createChildUnderRoot(name: string, ialValue: string): Promise<string> {
        const rootID = await this.ensureProgDataRoot();
        if (!rootID) return "";
        return this.createChildUnder(rootID, name, ialValue);
    }

    /** digest-书名 夹：书名只是初始皮，之后认 IAL（书改名不追改夹名）。
     *  underBook（源文档下方档）= 新建时挂源书下（老版行为回归）；默认集中档=挂摘抄总夹下。
     *  已存在的夹按 IAL 原位认回（位置无关），档位只决定「新建」落点 */
    async ensureDigestDir(bookID: string, underBook = false): Promise<string> {
        return ensureAnchoredDoc(getDocIalDigestDir(bookID), {
            findByIal: () => findDocByIal(getDocIalDigestDir(bookID)),
            checkBlockExist: (id) => siyuan.checkBlockExist(id),
            create: async () => {
                const name = `digest-${await this.bookName(bookID)}`;
                return underBook
                    ? this.createChildUnder(bookID, name, getDocIalDigestDir(bookID))
                    : this.createChildUnder(await this.ensureDigestHub(), name, getDocIalDigestDir(bookID));
            },
            onResolved: async () => { },
        });
    }

    /** writebook-next □4 双夹并存（逐次 override 方向专用）：方向锚认回 → 主力夹恰在该
     *  方向则复用（防同位置双夹）→ 方向锚新建。方向锚见 progData（首段独立防 LIKE 前缀污染） */
    async ensureDigestDirUnder(bookID: string): Promise<string> {
        const ial = getDocIalDigestDirUnder(bookID);
        const byDir = await ensureAnchoredDoc(ial, {
            findByIal: () => findDocByIal(ial),
            checkBlockExist: (id) => siyuan.checkBlockExist(id),
            create: async () => {
                // 主力夹（现锚）已在书下：复用它，不再建（幂等——每次 override 都走这条认回）
                const mainDir = await this.digestDirParentOf(getDocIalDigestDir(bookID), bookID);
                if (mainDir) return mainDir;
                return this.createChildUnder(bookID, `digest-${await this.bookName(bookID)}`, ial);
            },
            onResolved: async () => { },
        });
        return byDir;
    }

    async ensureDigestDirHub(bookID: string): Promise<string> {
        const ial = getDocIalDigestDirHub(bookID);
        return ensureAnchoredDoc(ial, {
            findByIal: () => findDocByIal(ial),
            checkBlockExist: (id) => siyuan.checkBlockExist(id),
            create: async () => {
                const mainDir = await this.digestDirParentOf(getDocIalDigestDir(bookID), await this.ensureDigestHub());
                if (mainDir) return mainDir;
                return this.createChildUnder(await this.ensureDigestHub(), `digest-${await this.bookName(bookID)}`, ial);
            },
            onResolved: async () => { },
        });
    }

    /** 锚值找夹并核对其直接父是否恰为 parentID（文档父子在 path 层——blocks 表文档行
     *  parent_id 恒空，见踩坑）：夹即目标方向时 override 复用主力夹，同位置不建双夹 */
    private async digestDirParentOf(ialValue: string, parentID: string): Promise<string> {
        if (!parentID) return "";
        const dirID = await findDocByIal(ialValue);
        if (!dirID) return "";
        const row = await siyuan.sqlOne(`select path from blocks where id='${dirID}'`);
        const parent = row?.path?.split("/").filter(Boolean).at(-2);
        return parent === parentID ? dirID : "";
    }

    /** 摘抄总夹（期1 □2）：prog-data 根下名「摘抄」，集中归档档所有 digest-书名 夹的父 */
    async ensureDigestHub(): Promise<string> {
        return ensureAnchoredDoc(getDocIalDigestHub(), {
            findByIal: () => findDocByIal(getDocIalDigestHub()),
            checkBlockExist: (id) => siyuan.checkBlockExist(id),
            create: () => this.createChildUnderRoot("摘抄", getDocIalDigestHub()),
            onResolved: async () => { },
        });
    }

    /** words-书名 单词文档：长期背诵资产，v5 □4 起进 prog-data（旧书下文档按 IAL 原位认回） */
    async ensureWordsDoc(bookID: string): Promise<string> {
        return ensureAnchoredDoc(getDocIalWords(bookID), {
            findByIal: () => findDocByIal(getDocIalWords(bookID)),
            checkBlockExist: (id) => siyuan.checkBlockExist(id),
            create: async () => this.createChildUnderRoot(`words-${await this.bookName(bookID)}`, getDocIalWords(bookID)),
            onResolved: async () => { },
        });
    }

    async bookName(bookID: string): Promise<string> {
        const nameRow = await siyuan.sqlOne(`select content from blocks where type='d' and id='${bookID}'`);
        return nameRow?.content ?? bookID;
    }

    /** 札记匣：无书文本的沉淀落点 */
    async ensureNoteBox(): Promise<string> {
        return ensureAnchoredDoc(getDocIalNoteBox(), {
            findByIal: () => findDocByIal(getDocIalNoteBox()),
            checkBlockExist: (id) => siyuan.checkBlockExist(id),
            create: () => this.createChildUnderRoot("札记匣", getDocIalNoteBox()),
            onResolved: async () => { },
        });
    }

    /** 札记匣内源文档夹（□3 分组）：central+非书档的摘抄按源文档归集进
     *  札记匣/digest-源文档名/ 三层；夹名初始皮=源文档名（走 getBlockInfo 实时通道，
     *  bookName 的 SQL content 列对刚建文档有索引延迟会落 id 形态丑名），认 IAL 位置无关 */
    async ensureNoteDir(sourceDocID: string): Promise<string> {
        return ensureAnchoredDoc(getDocIalNoteDir(sourceDocID), {
            findByIal: () => findDocByIal(getDocIalNoteDir(sourceDocID)),
            checkBlockExist: (id) => siyuan.checkBlockExist(id),
            create: async () => {
                const info = await siyuan.getBlockInfo(sourceDocID);
                const name = info?.rootTitle ? `digest-${info.rootTitle}` : `digest-${sourceDocID}`;
                const box = await this.ensureNoteBox();
                if (!box) return "";
                return this.createChildUnder(box, name, getDocIalNoteDir(sourceDocID));
            },
            onResolved: async () => { },
        });
    }

    /** 源文档下方档的非书摘抄夹：digest-源文档名 挂源文档下（按源文档 IAL 锚定，位置无关） */
    async ensureFreeDigestDir(sourceDocID: string): Promise<string> {
        return ensureAnchoredDoc(getDocIalFreeDigestDir(sourceDocID), {
            findByIal: () => findDocByIal(getDocIalFreeDigestDir(sourceDocID)),
            checkBlockExist: (id) => siyuan.checkBlockExist(id),
            create: async () => this.createChildUnder(sourceDocID, `digest-${await this.bookName(sourceDocID)}`, getDocIalFreeDigestDir(sourceDocID)),
            onResolved: async () => { },
        });
    }

    /** 阅读日志：prog-data 下每日一子块（火苗/热力图/书卡今日点的唯一数据源） */
    async ensureReadLog(): Promise<string> {
        return ensureAnchoredDoc(getDocIalReadLog(), {
            findByIal: () => findDocByIal(getDocIalReadLog()),
            checkBlockExist: (id) => siyuan.checkBlockExist(id),
            create: () => this.createChildUnderRoot("阅读日志", getDocIalReadLog()),
            onResolved: async () => { },
        });
    }

    // ============ v5 滚筒状态（reading-order.json） ============

    async loadReadingOrder(): Promise<ReadingOrder> {
        const ro = this.plugin.data[constants.STORAGE_READING_ORDER] as ReadingOrder;
        return ro?.order ? ro : { order: [], lastServed: "" };
    }

    async saveReadingOrder(ro: ReadingOrder) {
        if (!this.storageReady) return; // □13 门闩：窗口内基于空默认重建的 order 会覆盖磁盘书序
        this.plugin.data[constants.STORAGE_READING_ORDER] = ro;
        await this.plugin.saveData(constants.STORAGE_READING_ORDER, ro);
    }

    // ============ 修订痕迹 enrollment（revtrace.json，revtrace □2）============
    // 纯视图零档案设计的唯一持久化：{docID: 14位内核同构时间戳}。首次纳入=当时状态全无色
    // （基线规则②防满屏）；此后 updated>基线且在色窗内的块才上色（revTrace.shouldColor）。
    // 跨设备各自独立（petal 不同步），v1 接受；残留条目量级 KB/年不做主动清扫（刻意小 v1）。

    /** 读 docID 的 enrollment 基线；未纳入/存储损坏 → 空串（shouldColor 恒 false） */
    revTraceEnrolledAt(docID: string): string {
        const m = this.plugin?.data?.[constants.STORAGE_REVTRACE];
        return (m && typeof m === "object" ? m[docID] : "") ?? "";
    }

    /** 首次纳入（幂等）：写入当下时刻为基线并落盘；返回有效基线（门闩窗口内返回空串=下轮再试） */
    async enrollRevTrace(docID: string): Promise<string> {
        const cur = this.revTraceEnrolledAt(docID);
        if (cur) return cur;
        if (!this.storageReady) return ""; // □13 门闩同款：loadData 往返窗口内不写
        // loadData 对不存在的文件落 "" 占位（?? 不兜空串），空串/损坏一律重起干净对象
        const raw = this.plugin.data[constants.STORAGE_REVTRACE];
        const m = (raw && typeof raw === "object" ? raw : {}) as Record<string, string>;
        m[docID] = utils.timeUtil.kernelTimeNow();
        this.plugin.data[constants.STORAGE_REVTRACE] = m;
        await this.plugin.saveData(constants.STORAGE_REVTRACE, m);
        return m[docID];
    }

    /** 重置基线为当下（revtrace「拆装不算修订」修复，bear 2026-09-09 拍板）：重插/就地
     *  断句等「删旧插新」操作会把块整体换成新块——内核插块事务 updated=创建时刻，色条
     *  整片误报「全部刚改」。操作完成后调此=把基线推到操作时刻，新块 updated≤基线全无色，
     *  之后的真改动从零重新染色；代价=同窗口内的真手改一并无色（测试期数据可接受）。
     *  区别于 enrollRevTrace 首次幂等语义，此处对已纳入文档无条件覆盖；未纳入文档不动
     *  （其首次 enroll 必晚于操作时刻，新块本就无色，预写反而留无谓条目）。
     *  门闩窗口内返回空串（调用方无需重试——下轮出场 enroll 会补上较晚基线，同向安全） */
    async bumpRevTraceBaseline(docID: string): Promise<string> {
        if (!this.revTraceEnrolledAt(docID)) return "";
        if (!this.storageReady) return "";
        const raw = this.plugin.data[constants.STORAGE_REVTRACE];
        const m = (raw && typeof raw === "object" ? raw : {}) as Record<string, string>;
        m[docID] = utils.timeUtil.kernelTimeNow();
        this.plugin.data[constants.STORAGE_REVTRACE] = m;
        await this.plugin.saveData(constants.STORAGE_REVTRACE, m);
        return m[docID];
    }

    /** 剔除 enrollment 条目已退役（□8：查询空≠已删——新建索引未就绪同形态，误删基线
     * 吞编辑；残留条目量级无害见上注，调用点已撤）；保留方法签名注释仅供考古，勿再调 */

    async gotoBlock(bookID: string, point: number) {
        if (point >= 0) {
            await this.updateBookInfo(bookID, { point } as any);
        }
    }

    async saveIndex(bookID: string, groups: WordCountType[][]) {
        const [ng, data] = preSave(groups);
        await this.plugin.saveData(bookID, { data });
        this.plugin.data[bookCacheKey(bookID)] = ng;
    }

    private async saveBookInfos() {
        if (!this.storageReady) return; // □13 门闩：防空对象/未初始化整体落盘覆盖旧书
        // □1 取证打点：窗口内被门闩丢弃的写只改内存不落盘（2026-09-09 事故：reload 后
        // 5s 点删片返回，gotoBlock(0) 的 point 落盘被拦=盘上 point 停旧值）。留 Loki 痕迹
        // 供下次事故对时间线，不改门闩语义（空覆盖防护优先）
        debugLog("storage", "saveBookInfos dropped by storageReady latch（写仅入内存）", "progressive");
        return this.plugin.saveData(constants.STORAGE_BOOKS, this.booksInfos());
    }

    // ============ □1 目录成书：卷表（petal <bookID>.vols.json） ============
    // 索引文件格式不动（一维 point 全局连续，kernel/滚筒/舰队消费面零改动），卷结构
    // 旁挂本文件：与索引同点写同点删。键含 "." 不匹配 BLOCK_ID_RE——booksInfos()/
    // halfRegisteredIDs 的书键谓词天然不认它（无脏键风险，storageVolTable.test 锁死）。

    static volTableFileKey(bookID: string) {
        return bookID + ".vols.json";
    }

    async saveVolTable(bookID: string, vols: VolEntry[]) {
        const table = { v: 1 as const, vols };
        this.plugin.data[ProgressiveStorage.volTableFileKey(bookID)] = table;
        await this.plugin.saveData(ProgressiveStorage.volTableFileKey(bookID), table);
    }

    /** 清卷表（盘+内存缓存）。复审 P2：loadVolTable 回写缓存后，删表不清缓存=同
     *  session 残留 stale；dir 书重加为 single 也走此清残留（防 heal 误补 dirMode） */
    async clearVolTable(bookID: string) {
        delete this.plugin.data[ProgressiveStorage.volTableFileKey(bookID)];
        await this.plugin.removeData(ProgressiveStorage.volTableFileKey(bookID));
    }

    /** 读卷表；缺省/损坏/非目录书=[]（空表=按单篇书处理，调用方须先判 dirMode） */
    async loadVolTable(bookID: string): Promise<VolEntry[]> {
        const key = ProgressiveStorage.volTableFileKey(bookID);
        let raw = this.plugin.data[key];
        if (raw == null) {
            raw = await this.plugin.loadData(key);
            // review P2-3：命中后回写缓存——session 内未写过卷表时每次出场免一发
            // loadData HTTP（loadBookIndexIfNeeded 同款缓存语义；null=无文件不缓存）
            if (raw != null) this.plugin.data[key] = raw;
        }
        try {
            const t = typeof raw === "string" ? JSON.parse(raw) : raw;
            return Array.isArray(t?.vols) ? t.vols : [];
        } catch {
            return [];
        }
    }

    async removeIndex(bookID: string) {
        // □2 删书同步清理：文档还在则解除只读+清书标（空串删 IAL 键；lost 书文档已删，
        // siyuan.call 吞错容错）。放在删条目前——此时 books.json 还有键，与 heal 的
        // diff 特征（petal 有文件+books.json 无键+文档在）无交集，不扩大并发窗口
        await siyuan.setBlockAttrs(bookID, {
            "custom-sy-readonly": "",
            [MarkKey]: "",
        } as any);
        delete this.booksInfos()[bookID];
        delete this.booksInfos()[bookCacheKey(bookID)];
        await this.saveBookInfos();
        // order 里的历史死键/_cache 污染键由 mergeMissingBooks（nextBook 出片路径）清洗
        const ro = await this.loadReadingOrder();
        if (ro.order.includes(bookID)) {
            await this.saveReadingOrder({
                order: ro.order.filter(id => id !== bookID),
                lastServed: ro.lastServed === bookID ? "" : ro.lastServed,
            });
        }
        // □1 目录书删书顺删卷表（键形状不过书键谓词，残留无害但清理干净；
        // 复审 P2：内存缓存同步清——loadVolTable 回写缓存后删盘不清缓存=同 session stale）
        await this.clearVolTable(bookID);
        return this.plugin.removeData(bookID);
    }

    /** 期3 手动分片书：索引恒空。自动书转手动时清旧索引（petal 文件+内存缓存）；
     *  全新书 removeData 落空无害——loadBookIndexIfNeeded 对无文件恒返回 []，
     *  isFinished(point,0) 恒真=滚筒/火苗自动不推（零改动语义锚） */
    async clearBookIndex(bookID: string) {
        delete this.plugin.data[bookCacheKey(bookID)];
        delete this.booksInfos()[bookCacheKey(bookID)]; // 历史污染键顺手清（removeIndex 同款）
        return this.plugin.removeData(bookID);
    }

    async loadBookIndexIfNeeded(bookID: string): Promise<string[][]> {
        let idx: string[][] = this.plugin.data[bookCacheKey(bookID)];
        if (!idx) {
            idx = afterLoad(await this.plugin.loadData(bookID));
            // 修复根因 1：首次 load 到空/残缺索引时不缓存。
            // 用与返回时相同的过滤逻辑判定"是否真的有分片"——
            // afterLoad("") 返回 [[""]]（非 []），直接看 .length 会误判，必须先 filter。
            const cleaned = idx
                .map(i => i.filter(j => j?.length > 0))
                .filter(i => i?.length > 0);
            if (cleaned.length > 0) {
                this.plugin.data[bookCacheKey(bookID)] = idx;
            }
        }
        return idx.map(i => i.filter(j => j?.length > 0)).filter(i => i?.length > 0);
    }

    /**
     * □29：块 id 反查归属书与片序号（遍历已注册书的本地分片索引，索引全本地存储、
     * 无内核属性窗口）。片发起摘抄时片文档 IAL custom-progmark 走 createDocWithMd
     * 两步后补，巨书上实测存在 24s+ 仍读不到的窗口 → getBookID 解析空会 fallback
     * 片 id，摘抄 ctime 挂错归属、清单查空。片内容块的 custom-progref（书原文块 id，
     * 随 insert 事务内联落盘、无后补窗口）在此窗口内仍可靠，用它扫索引反查。
     */
    async findPieceByBlockID(blockID: string): Promise<{ bookID: string; point: number } | null> {
        if (!blockID) return null;
        for (const bookID of Object.keys(this.booksInfos())) {
            // _cache 等历史污染键不是书（loadData 落空索引还要每次重试）——谓词见 isRegisteredBook
            if (!this.isRegisteredBook(bookID)) continue;
            const idx = await this.loadBookIndexIfNeeded(bookID);
            for (let p = 0; p < idx.length; p++) {
                if (idx[p].includes(blockID)) return { bookID, point: p };
            }
        }
        return null;
    }
}

export const progStorage = new ProgressiveStorage()

export function afterLoad(data: any): string[][] {
    data = data?.data ?? "";
    const group = [];
    for (const piece of data.split("#")) {
        const tp = [];
        for (const ti of piece.split(",")) {
            tp.push(ti);
        }
        group.push(tp);
    }
    return group;
}

/** 思源块 id 形状：14 位时间戳 + - + 7 位随机（books.json 等存储键不会撞上） */
const BLOCK_ID_RE = /^\d{14}-[a-z0-9]{7}$/;

/** □1 半注册 diff：petal 目录有 <bookID> 索引文件、books.json 无同名键（_cache 脏键不算书键） */
export function halfRegisteredIDs(petalFiles: string[], bookKeys: Iterable<string>): string[] {
    const registered = new Set<string>();
    for (const k of bookKeys) {
        if (!k.endsWith("_cache")) registered.add(k);
    }
    return petalFiles.filter((f) => BLOCK_ID_RE.test(f) && !registered.has(f));
}

export function preSave(groups: WordCountType[][]) {
    const pieces = [];
    const newGroups = [];
    for (const group of groups) {
        const parts = [];
        for (const wc of group) {
            parts.push(wc.id);
        }
        pieces.push(parts.join(","));
        newGroups.push(parts);
    }
    return [newGroups, pieces.join("#")];
}

export function bookCacheKey(bookID: string) {
    return bookID + "_cache";
}
