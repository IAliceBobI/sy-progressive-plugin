import { IProtyle, Plugin } from "siyuan";
import { getAttribute, isValidNumber, parseIAL, setAttribute, siyuan, } from "../../sy-tomato-plugin/src/libs/utils";
import { findAllInOneKeyDoc, findKeysDoc, findNewBookDoc, getAllInOneKeyDoc, getHPathByDocID, getKeysDoc, getNewBookDoc, isProtylePiece, pieceFilterSQL } from "./helper";
import { fetchWritingPieces } from "./writeBook";
import { progStorage } from "./ProgressiveStorage";
import { getBookIDByBlock } from "../../sy-tomato-plugin/src/libs/progressive";
import { openBuyDialog } from "../../sy-tomato-plugin/src/BuyDialog";
import { DATA_NODE_ID, PARAGRAPH_INDEX, PROG_ORIGIN_TEXT } from "../../sy-tomato-plugin/src/libs/gconst";
import { getDocBlocks, OpenSyFile2 } from "../../sy-tomato-plugin/src/libs/docUtils";
import { windowOpenStyle, extractAllNoBacktraceLink } from "../../sy-tomato-plugin/src/libs/stores";
import { events } from "../../sy-tomato-plugin/src/libs/Events";
import { DomParaBuilder } from "../../sy-tomato-plugin/src/libs/sydom";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import { winHotkey } from "../../sy-tomato-plugin/src/libs/winHotkey";
import { verifyKeyProgressive } from "../../sy-tomato-plugin/src/libs/user";
import { into } from "stonev5-utils";
import { lockWithLease } from "./lockLease";
import {
    buildNoteUnits, childrenToStream, cloneStream, filterStream, pickPieceNotes,
    DOC_NOTES_KEY, StreamBlock,
} from "./noteAssembly";

export const WC提取所有分片的笔记 = winHotkey("⌘F4", "提取所有分片的笔记", "iconCopy", () => tomatoI18n.提取所有分片的笔记, true) // □14 收费门恢复（提取整理族，Pro）
export const WC提取笔记到底部 = winHotkey("shift+alt+r", "提取笔记到底部", "iconCopy", () => tomatoI18n.提取笔记到底部, true) // □14 收费门恢复（提取整理族，Pro）
export const WC提取笔记 = winHotkey("⌘F5", "提取笔记", "iconCopy", () => tomatoI18n.提取笔记, true) // □30 补漏：提取整理族 Pro（□14 恢复门禁时漏标第五参，浮条钮漏灰档+命令通道漏拦）
export const WC去除笔记颜色 = winHotkey("⌥⌘F5", "去除笔记颜色", "iconTheme", () => tomatoI18n.去除笔记颜色, true) // □14 收费门恢复（提取整理族，Pro）
export const WC恢复笔记颜色 = winHotkey("⌥⌘F6", "恢复笔记颜色", "iconTheme", () => tomatoI18n.恢复笔记颜色, true) // □14 收费门恢复（提取整理族，Pro）
// v5 □7 修撞键：原 ⌥⌘F6 与「恢复笔记颜色」双绑（winHotkey 重复检测当时被注释未报），挪至 ⌥⌘F7
export const WC合并所有分片到新文件 = winHotkey("⌥⌘F7", "合并所有分片到新文件", "iconCopy", () => tomatoI18n.合并所有分片到新文件, true) // □14 收费门恢复（合并导出型，Pro）
// 「对比原文」（⌘F6）已退役（2026-08-29 浮条 UX 重设计 □9）：仿写对比由 recite 接管，keys 精读文档仍是可读写笔记容器

class WritingCompareBox {
    private plugin: Plugin;
    settings: TomatoSettings;

    async onload(plugin: Plugin, settings: TomatoSettings) {
        this.plugin = plugin;
        this.settings = settings;
        await verifyKeyProgressive();
        this.plugin.addCommand({
            langKey: WC提取所有分片的笔记.langKey,
            langText: WC提取所有分片的笔记.langText(),
            hotkey: WC提取所有分片的笔记.m,
            editorCallback: async (protyle) => {
                if (WC提取所有分片的笔记.cmd()) {
                    const { isPiece, markKey } = isProtylePiece(protyle);
                    if (isPiece) {
                        await this.extractAllNotes(protyle, markKey);
                    }
                }
            },
        });
        this.plugin.addCommand({
            langKey: WC提取笔记到底部.langKey,
            langText: WC提取笔记到底部.langText(),
            hotkey: WC提取笔记到底部.m,
            editorCallback: async (protyle) => {
                if (WC提取笔记到底部.cmd()) {
                    const { isPiece } = isProtylePiece(protyle);
                    if (isPiece) {
                        await this.extractNotes2bottom(protyle);
                    }
                }
            }
        });
        this.plugin.addCommand({
            langKey: WC提取笔记.langKey,
            langText: WC提取笔记.langText(),
            hotkey: WC提取笔记.m,
            editorCallback: async (protyle) => {
                // □30 补漏：vip 补标时成对漏掉的 cmd() 守卫（未激活 ⌘F5 曾照跑全功能）
                if (WC提取笔记.cmd()) {
                    const { isPiece, markKey } = isProtylePiece(protyle);
                    if (isPiece) {
                        await this.extractNotes(protyle.block?.rootID, protyle.notebookId, markKey);
                    }
                }
            },
        });
        this.plugin.addCommand({
            langKey: WC合并所有分片到新文件.langKey,
            langText: WC合并所有分片到新文件.langText(),
            hotkey: WC合并所有分片到新文件.m,
            editorCallback: async (protyle) => {
                if (WC合并所有分片到新文件.cmd()) {
                    const { isPiece, markKey } = isProtylePiece(protyle);
                    if (isPiece) {
                        await this.extractAsBook(protyle.notebookId, protyle.block?.rootID, protyle.notebookId, markKey);
                    }
                }
            },
        });
        this.plugin.addCommand({
            langKey: WC去除笔记颜色.langKey,
            langText: WC去除笔记颜色.langText(),
            hotkey: WC去除笔记颜色.m,
            editorCallback: async (protyle) => {
                if (WC去除笔记颜色.cmd()) await this.noColor(protyle);
            },
        });
        this.plugin.addCommand({
            langKey: WC恢复笔记颜色.langKey,
            langText: WC恢复笔记颜色.langText(),
            hotkey: WC恢复笔记颜色.m,
            editorCallback: async (protyle) => {
                if (WC恢复笔记颜色.cmd()) await this.noColor(protyle, false);
            },
        });
        // 期5 汇编成稿（写作书语义入口，Pro；无默认键留自绑——winHotkey m 空 throw
        // 故直传 langKey，resume doc cards 同款）：当前片属 writing 书才汇编；书骨架
        // 文档上 mark 解析得 bookID=""（book#TEMP 无逗号尾段），补 isRegisteredBook
        // 第二刀认回（书文档恰是命令最自然的触发位，静默 no-op 违直觉）
        this.plugin.addCommand({
            langKey: "compile writing book",
            langText: tomatoI18n.汇编成稿,
            editorCallback: (protyle) => {
                void getBookIDByBlock(protyle.block?.rootID ?? "").then(async ({ bookID }) => {
                    const rootID = protyle.block?.rootID ?? "";
                    if (!bookID && rootID && progStorage.isRegisteredBook(rootID)
                        && progStorage.peekBookInfo(rootID)?.writing) {
                        bookID = rootID;
                    }
                    if (!bookID) return;
                    if (!progStorage.peekBookInfo(bookID)?.writing) return;
                    const box = bookID === rootID
                        ? (progStorage.peekBookInfo(bookID)?.boxID ?? protyle.notebookId)
                        : protyle.notebookId;
                    void this.compileWritingBook(bookID, box);
                });
            },
        });
    }

    // v5 □7：提取/整理族入口收进浮条 [+] 高级功能 + 命令面板（右键菜单退役），方法转 public 供浮条调用

    /** 提取笔记到底部（⇧⌥R）need-0926-01 新装配：一笔记一单元（无序列表）+条间空段+
     *  星号行尾；产物=list+空段交替序列，全部挂 custom-doc-notes（删旧=删所有带标记块，
     *  旧格式 sb 同判据通吃）。尾卡/空段/previous 块随统一净化滤除（旧版漏滤 previous
     *  顺手修正——片首复述辅助块不是笔记）。 */
    async extractNotes2bottom(protyle: IProtyle) {
        siyuan.pushMsg(tomatoI18n.提取笔记到底部, 1000);
        const docInfo = events.getInfo(protyle);
        // emptyContent=true：root.children 兼任删旧清单——新格式条间空段带 custom-doc-notes
        // 标记但 content 空，走空内容丢弃闸（fillChildren !emptyContent 分支）会被跳过→每轮
        // 重提取漏删旧空段累积（need-0926-01 □4 e2e 揪出）；装配流自身由 filterStream 滤空段
        const { root } = await getDocBlocks(docInfo.docID, docInfo.name, true, true, 1);
        const lastID = await siyuan.getDocLastID(docInfo.docID)
        const stream = cloneStream(filterStream(childrenToStream(root.children), { noteOnly: true }));
        const units = buildNoteUnits(stream, { withHref: true, markAttr: [DOC_NOTES_KEY, "1"] });
        const ops = units.length > 0
            ? siyuan.transInsertBlocksBefore(units.map(u => u.outerHTML), lastID)
            : [];
        root.children
            .filter(c => getAttribute(c.div, DOC_NOTES_KEY))
            .forEach(c => ops.push(...siyuan.transDeleteBlocks([c.id])));
        await siyuan.transactions(ops);
        // 定位首单元（list 容器预挂合规 id，事务通道保留）；无产物（片内无笔记）退回文档
        const firstID = units[0]?.getAttribute(DATA_NODE_ID) ?? docInfo.docID;
        OpenSyFile2(this.plugin, firstID);
    }

    async noColor(protyle: IProtyle, rm = true) {
        const { docID } = events.getInfo(protyle)
        const { root } = await getDocBlocks(docID, "", false, true, 1)
        const attrs: AttrType = into(() => {
            if (rm) {
                return { "custom-prog-key-no-color": "1" };
            } else {
                return { "custom-prog-key-no-color": "" };
            }
        });
        const param = root.children
            .filter(c => !getAttribute(c.div, "custom-prog-origin-text"))
            .map(c => {
                return { id: c.id, attrs }
            });
        await siyuan.batchSetBlockAttrs(param);
    }

    /** 提取所有分片的笔记（⌘F4）need-0926-01 新装配：per 片 pickPieceNotes（需求 5
     *  底部产物优先——有提取到底的片取底部版本含用户补充）→统一装配落 collection
     *  文档；星号受 □2 开关门控（默认带=旧行为）；尾卡滤除=JSON 游标泄漏修复。 */
    async extractAllNotes(protyle: IProtyle, markKey: string) {
        siyuan.pushMsg(tomatoI18n.提取所有分片的笔记)
        const docInfo = events.getInfo(protyle);

        const { pieceIDs, bookID } = await getAllPieces(markKey);
        const docs = await Promise.all(pieceIDs.map(id => getDocBlocks(id, "", true, false, 1)));
        const stream = docs.flatMap(doc => {
            const picked = pickPieceNotes(childrenToStream(doc?.root?.children ?? []), { noteOnly: true });
            return cloneStream(picked.stream);
        });
        const units = buildNoteUnits(stream, { withHref: !extractAllNoBacktraceLink.get() });

        let keysDocID = await findAllInOneKeyDoc(bookID);
        if (!keysDocID) {
            const hpath = await getHPathByDocID(bookID, "collection");
            if (hpath) {
                keysDocID = await getAllInOneKeyDoc(bookID, docInfo.notebookId, hpath);
            }
        }
        if (!keysDocID) return;
        await siyuan.clearAll(keysDocID);
        await siyuan.insertBlocksAsChildOf(units.map(u => u.outerHTML), keysDocID);
        OpenSyFile2(this.plugin, keysDocID, windowOpenStyle.get() as any);
    }

    async extractAsBook(boxID: string, pieceID: string, notebookId: string, markKey: string, titleMsg = tomatoI18n.合并所有分片到新文件, direct?: { pieceIDs: string[]; bookID: string }) {
        // progtree □1 树序直通：写作书编译由调用方喂树序 pieces（markKey 认领链退役，
        // markKey 参数可空）；阅读书命令链（isProtylePiece 入口）不传 direct 走原
        // getAllPieces 路径——默认参不传=原行为逐字节等价（阅读书链零变化红线）
        if (!pieceID || !notebookId) return;
        siyuan.pushMsg(titleMsg)

        const got = direct ?? await getAllPieces(markKey);
        const gotIDs = got.pieceIDs;
        const realBookID = direct ? direct.bookID : got.bookID;
        if (!gotIDs || gotIDs.length === 0) return;

        // need-0926-01 新装配：全量合并（原文块 passthrough 直通平铺、笔记块单元化）
        // +片间空行+留言（无 pidx）挂该片最后笔记单元；星号保持旧行为不带；尾卡滤除
        const docs = await Promise.all(gotIDs.map(id => getDocBlocks(id, "", true, false, 1)));
        const out: HTMLElement[] = [];
        docs.forEach((doc, i) => {
            if (i > 0) out.push(new DomParaBuilder().build());
            const stream = cloneStream(filterStream(childrenToStream(doc?.root?.children ?? [])));
            out.push(...buildNoteUnits(stream, {
                withHref: false,
                passthrough: d => !!getAttribute(d, PROG_ORIGIN_TEXT),
            }));
        });

        let newBookID = await findNewBookDoc(realBookID);
        if (!newBookID) {
            const hpath = await getHPathByDocID(realBookID, "merged");
            if (hpath) {
                newBookID = await getNewBookDoc(realBookID, boxID, hpath);
            }
        }
        if (!newBookID) return;

        await siyuan.clearAll(newBookID);
        await siyuan.insertBlocksAsChildOf(out.map(d => d.outerHTML), newBookID);
        OpenSyFile2(this.plugin, newBookID, windowOpenStyle.get() as any);
    }

    /** 期5 汇编成稿（Pro，写作书语义入口）：复用 extractAsBook 内核通道（片序数字序
     *  合并到 merged-书名 落点、幂等重生成、素材 custom-prog-material 血缘随块带入）。
     *  门禁=运行时 verifyKeyProgressive（入口不隐藏；无 Pro toast+购买引导）。
     *  markKey 取首片（getAllPieces 只解析 bookID 前缀，与片无关）；书级签名供
     *  浮条（bookID+box）与管理页（无编辑器）共用。
     *  navigator.locks ifAvailable 防双击交错（取数段秒级+无钮禁用，A.clear→B.clear→
     *  A.insert→B.insert 会双份；拿不到锁静默 return=已有一次在跑，StartToLearnLock 同款） */
    async compileWritingBook(bookID: string, boxID: string) {
        if (!bookID || !boxID) return;
        if (!(await verifyKeyProgressive())) {
            await siyuan.pushMsg(tomatoI18n.Pro功能尾注, 2500);
            openBuyDialog("progressive", tomatoI18n.购买页, false);
            return;
        }
        return lockWithLease("prog-compile-writing", async () => {
            // progtree □1 树序直通：pieces=树序（含定稿槽——汇编全稿语义保持），
            // extractAsBook 的 direct 分支跳过 MarkKey 认领
            const pieces = await fetchWritingPieces(bookID);
            if (pieces.length === 0) {
                await siyuan.pushMsg(tomatoI18n.该书还没有分片, 2500);
                return;
            }
            await this.extractAsBook(boxID, pieces[0].docID, boxID, "", tomatoI18n.汇编成稿,
                { pieceIDs: pieces.map(p => p.docID), bookID });
        });
    }

    /** 提取笔记（⌘F5→keys 文档）need-0926-01 新装配：取数走 pickPieceNotes（底部产物
     *  优先=修「提取到底的笔记被再次提取」重复面；尾卡滤除）；keys 文档已有内容保全
     *  （noteMap 语义迁新形态：pidx 块=旧笔记丢弃重提取、其后无 pidx 散块=用户补充
     *  clone 后挂回对应笔记单元——DOM 通道保格式，旧版 SQL content 列纯文本丢格式顺
     *  手修正）；星号行尾恒带（陆杰帖文点名）；key-note 样式标记挂笔记块。 */
    async extractNotes(pieceID: string, notebookId: string, markKey: string) {
        if (!pieceID || !notebookId || !markKey) return;
        siyuan.pushMsg("extract notes")

        const parts = markKey.split("#").pop()?.split(",");
        if (parts.length !== 2) return;

        const point = Number(parts[1]);
        if (!isValidNumber(point)) return;
        let keysDocID = await findKeysDoc(parts[0], point);
        if (!keysDocID) {
            const hpath = await getHPathByDocID(pieceID, "keys");
            if (hpath) {
                keysDocID = await getKeysDoc(parts[0], point, notebookId, hpath);
            }
        }
        if (!keysDocID) return;

        // 片取数（需求 5：底部产物优先）+克隆净化
        const pieceDoc = await getDocBlocks(pieceID, "", true, false, 1);
        const picked = pickPieceNotes(childrenToStream(pieceDoc?.root?.children ?? []), { noteOnly: true });
        const stream = cloneStream(picked.stream);

        // keys 文档散块保全：pidx 块=旧笔记（丢弃，由重提取产物替换），其后无 pidx
        // 块=用户补充（clone 后 splice 回流中对应笔记之后——装配分组挂进同单元）
        const keysDoc = await getDocBlocks(keysDocID, "", true, false, 1);
        const extras = new Map<string, HTMLElement[]>();
        let curIdx = "";
        for (const c of keysDoc?.root?.children ?? []) {
            const pidx = getAttribute(c.div, PARAGRAPH_INDEX);
            if (pidx) {
                curIdx = pidx;
                continue;
            }
            if (!curIdx) continue; // 首笔记前的散块（旧 noteMap 同语义丢弃）
            const arr = extras.get(curIdx) ?? [];
            arr.push(cloneStream([{ div: c.div, srcID: "" }])[0].div);
            extras.set(curIdx, arr);
        }
        const merged: StreamBlock[] = [];
        for (const b of stream) {
            merged.push(b);
            const pidx = getAttribute(b.div, PARAGRAPH_INDEX);
            if (pidx) {
                for (const div of extras.get(pidx) ?? []) merged.push({ div, srcID: "" });
            }
        }
        // keys 笔记样式标记（index.scss 消费）：pidx 块=笔记本体
        merged.forEach(b => {
            if (getAttribute(b.div, PARAGRAPH_INDEX)) setAttribute(b.div, "custom-prog-key-note", "1");
        });

        const units = buildNoteUnits(merged, { withHref: true });
        await siyuan.clearAll(keysDocID);
        await siyuan.insertBlocksAsChildOf(units.map(u => u.outerHTML), keysDocID);
        OpenSyFile2(this.plugin, keysDocID, "front");
    }
}

export const writingCompareBox = new WritingCompareBox();

async function getAllPieces(markKey: string) {
    // 插件管理勿改managedByPluginDoNotModify#20240130152919-exlnqci,7
    const [pmPreffix, pieceIdx] = markKey.split(",")
    const [_T, bookID] = pmPreffix.split("#")
    // need-0926-01 □4：where 换 pieceFilterSQL（MarkKey=" 前缀锚定）——原裸 like
    // '%pmPreffix,%' 会命中 keysDoc（IAL=keysDoc#…#bookID,1 含子串）→ keys 产物单元
    // 混进提取全部/合并流（vision P0 嵌套重复+裸 JSON 的根因，存量 bug 新格式显形）
    const pieceIDs = await siyuan.sql(`select id,ial from blocks where ${pieceFilterSQL(bookID)} limit 100000000`)
        .then(rows => {
            rows = rows
                .map(r => r.attrs = parseIAL(r.ial))
                // 片序=MarkKey 尾段 point 数字序。期4 修复：原 localeCompare 字典序在
                // point≥10 时乱序（"10"<"2"）——写作书槽位几十量级必踩，阅读书 10+ 片同中招。
                // 乱值尾段 NaN 按 0 兜底（旧码 undefined 比较直接 TypeError 崩，新码更稳）
                .sort((a, b) => (Number(String(a["custom-progmark"]).split(",").pop()) || 0)
                    - (Number(String(b["custom-progmark"]).split(",").pop()) || 0));
            return rows.map(r => r.id);
        });
    return { pieceIDs, pmPreffix, pieceIdx, bookID }
}

