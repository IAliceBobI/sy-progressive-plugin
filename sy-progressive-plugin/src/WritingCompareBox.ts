import { IProtyle, Plugin } from "siyuan";
import { getAttribute, isValidNumber, parseIAL, siyuan, } from "../../sy-tomato-plugin/src/libs/utils";
import { findAllInOneKeyDoc, findKeysDoc, findNewBookDoc, getAllInOneKeyDoc, getHPathByDocID, getKeysDoc, getNewBookDoc, isProtylePiece, pieceFilterSQL } from "./helper";
import { fetchWritingPieces } from "./writeBook";
import { progStorage } from "./ProgressiveStorage";
import { getBookIDByBlock } from "../../sy-tomato-plugin/src/libs/progressive";
import { openBuyDialog } from "../../sy-tomato-plugin/src/BuyDialog";
import { DATA_NODE_ID, PARAGRAPH_INDEX, PROG_ORIGIN_TEXT } from "../../sy-tomato-plugin/src/libs/gconst";
import { getDocBlocks, OpenSyFile2 } from "../../sy-tomato-plugin/src/libs/docUtils";
import { windowOpenStyle, extractAllNoBacktraceLink, extractNoteNoBacktraceLink, extractNoteNoBlankLine } from "../../sy-tomato-plugin/src/libs/stores";
import { events } from "../../sy-tomato-plugin/src/libs/Events";
import { DomParaBuilder } from "../../sy-tomato-plugin/src/libs/sydom";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import { winHotkey } from "../../sy-tomato-plugin/src/libs/winHotkey";
import { verifyKeyProgressive } from "../../sy-tomato-plugin/src/libs/user";
import { into } from "stonev5-utils";
import { lockWithLease } from "./lockLease";
import {
    buildNoteUnits, childrenToStream, cloneStream, deepContentBlocks, filterStream,
    flattenProductChildren, isEmptyPara, isVisitNoteBlock, pickPieceNotes,
    DOC_NOTES_KEY, KEY_NOTE_KEY, StreamBlock,
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

    /** 提取笔记到底部（⇧⌥R）need-0926-01 新装配：一笔记一单元；**need-0927-04 全块型
     *  原样直出**——单元每块独立挂 custom-doc-notes（删旧=删所有带标记块，旧格式 sb/list
     *  同判据通吃），条间空段同标记（blankLine 开关可关）。尾卡/空段/previous 块随统一
     *  净化滤除（旧版漏滤 previous 顺手修正——片首复述辅助块不是笔记）。 */
    async extractNotes2bottom(protyle: IProtyle) {
        siyuan.pushMsg(tomatoI18n.提取笔记到底部, 1000);
        const docInfo = events.getInfo(protyle);
        // emptyContent=true：root.children 兼任删旧清单——新格式条间空段带 custom-doc-notes
        // 标记但 content 空，走空内容丢弃闸（fillChildren !emptyContent 分支）会被跳过→每轮
        // 重提取漏删旧空段累积（need-0926-01 □4 e2e 揪出）；装配流自身由 filterStream 滤空段
        const { root } = await getDocBlocks(docInfo.docID, docInfo.name, true, true, 1);
        const lastID = await siyuan.getDocLastID(docInfo.docID)
        const stream = cloneStream(filterStream(childrenToStream(root.children), { noteOnly: true }));
        // noteHeadAttr（need-0926-02）：底部产物同挂 key-note——「提取的笔记」CSS 对三路
        // 提取产物（keys/底部/提取全部）统一生效，不再是 keys 独享；need-0927-04：全块型
        // 原样直出（装配层内聚），星号/条间空行走楼20 拍板两开关，标记随每块挂
        const units = buildNoteUnits(stream, {
            withHref: !extractNoteNoBacktraceLink.get(),
            markAttr: [DOC_NOTES_KEY, "1"],
            noteHeadAttr: [KEY_NOTE_KEY, "1"],
            blankLine: !extractNoteNoBlankLine.get(),
        });
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
        // need-0927-04 全块型直出（装配层内聚）；星号沿用本链路自有开关（need-0926-01
        // □2），条间空行走楼20 拍板新开关
        const units = buildNoteUnits(stream, {
            withHref: !extractAllNoBacktraceLink.get(),
            noteHeadAttr: [KEY_NOTE_KEY, "1"],
            blankLine: !extractNoteNoBlankLine.get(),
        });

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
            blankLine: !extractNoteNoBlankLine.get(),
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
     *  手修正）；**need-0927-04 全块型原样直出**（留言独立块+载荷去重+标记随每块挂）；
     *  星号行尾默认带（陆杰帖文点名，楼20 起开关可关）；key-note 样式标记随每块挂。 */
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

        // keys 文档散块保全：pidx 块=旧笔记/片内续写补充（一律丢弃——片流每轮自带，
        // 旧版 noteMap 同语义），visit-note 留言=片源 custom 块（片流自带）同跳过；
        // 无 pidx 普通块=用户补充（clone 后挂回流对应笔记单元）。
        // 0926 尾巴修复：顶层 List（v3.30.0 起产物=list 单元，容器无 pidx）不展开则
        // extras 恒空=二轮提取用户补充全丢（dev 实测）——flattenProductChildren 统一
        // 展开（旧平级/v3.30.0 list/嵌套子列表三形态归一）；反之展开后若把片源克隆
        // （带 pidx/留言）也回收，与片流叠加逐轮翻倍（dev 两轮实测），故双刀跳过。
        // need-0926-05 留言排上方：产物里用户补充物理序在笔记**前**（li 子列表置前/
        // 直出裸平铺前置），curIdx 尚空（首笔记前）时先攒缓冲挂到下一个 pidx——
        // 旧 !curIdx continue 会把前置补充整体丢掉（首单元补充二轮全丢）
        const keysDoc = await getDocBlocks(keysDocID, "", true, false, 1);
        const extras = new Map<string, HTMLElement[]>();
        let curIdx = "";
        let pendings: HTMLElement[] = [];
        for (const c of keysDoc?.root?.children ?? []) {
            for (const block of flattenProductChildren(c.div)) {
                // 深展开到内容块叶子：装配层写入的留言子列表容器无 pidx，整容器
                // 回收会连其内片源克隆（pidx/visit-note 刀滤不到容器内部）一起
                // 回流=与片流叠加逐轮翻倍（dev 三轮实测）
                for (const div of deepContentBlocks(block)) {
                    if (isEmptyPara(div)) continue;
                    const pidx = getAttribute(div, PARAGRAPH_INDEX);
                    if (pidx) {
                        curIdx = pidx;
                        if (pendings.length > 0) {
                            const arr = extras.get(pidx) ?? [];
                            arr.push(...pendings);
                            pendings = [];
                            extras.set(pidx, arr);
                        }
                        continue;
                    }
                    if (isVisitNoteBlock(div)) continue;
                    const cloned = cloneStream([{ div, srcID: "" }])[0].div;
                    if (!curIdx) { pendings.push(cloned); continue; } // 首笔记前散块=前置补充形态
                    const arr = extras.get(curIdx) ?? [];
                    arr.push(cloned);
                    extras.set(curIdx, arr);
                }
            }
        }
        // extras 回流：每 pidx 段只插一次（首现**前**）——同 pidx 连续块（片内续写
        // 补充）会逐块触发插装，旧产物补充被复制多份（dev 验收实测）；pidx 交替=
        // 就近挂首段。插在笔记前=留言/补充排上方形态（need-0926-05），装配层分组
        // 前向归属挂该笔记单元（产物往返不动点）
        const merged: StreamBlock[] = [];
        const consumed = new Set<string>();
        for (const b of stream) {
            const pidx = getAttribute(b.div, PARAGRAPH_INDEX);
            if (pidx && !consumed.has(pidx)) {
                consumed.add(pidx);
                for (const div of extras.get(pidx) ?? []) merged.push({ div, srcID: "" });
            }
            merged.push(b);
        }
        // keys 笔记样式标记收进装配层（noteHeadAttr）：need-0927-04 起随单元每块挂
        // （颜色均匀命中），分组判据单一事实源；全块型原样直出+星号/条间空行开关在装配层
        const units = buildNoteUnits(merged, {
            withHref: !extractNoteNoBacktraceLink.get(),
            noteHeadAttr: [KEY_NOTE_KEY, "1"],
            blankLine: !extractNoteNoBlankLine.get(),
        });
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

