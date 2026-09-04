import { Menu, Plugin, openTab, confirm, IProtyle, IEventBusMap, Protyle } from "siyuan";
import "./index.scss";
import { EventType, events } from "../../sy-tomato-plugin/src/libs/Events";
import { closeTabByTitle, getActiveDocID, getActiveProtyle, siyuan, } from "../../sy-tomato-plugin/src/libs/utils";
import * as utils from "../../sy-tomato-plugin/src/libs/utils";
import * as help from "./helper";
import { winHotkey } from "../../sy-tomato-plugin/src/libs/winHotkey";
import * as constants from "./constants";
import {
    BlockNodeEnum, DATA_NODE_ID, DATA_TYPE, IN_BOOK_INDEX, MarkKey,
    PARAGRAPH_INDEX, PDIGEST_CTIME, PDIGEST_PARENT_ID, PROG_PIECE_PREVIOUS, RefIDKey
} from "../../sy-tomato-plugin/src/libs/gconst";
import AddBookSvelte from "./AddBook.svelte";
import ShowAllBooksSvelte from "./ShowAllBooks.svelte";
import { ProgressiveStorage, progStorage } from "./ProgressiveStorage";
import { rollerNextBook, rollerMarkRead, rollerArchiveBook } from "./roller";
import { notifyFleetChanged } from "./fleetNotify";
import { HtmlCBType } from "./constants";
import { findDocByIal, getDocIalDigestDir, parseBookIDFromCtime } from "./progData";
import { PIECE_IDX_KEY, resolveOriginTarget } from "./originTrace";
import { OpenSyFile2 } from "../../sy-tomato-plugin/src/libs/docUtils";
import { addClickEvent, progressiveBtnFloating } from "./ProgressiveBtn";
import { blockIconMenu, card2dailycard, flashcardNotebook, piecesmenu, ProgressiveJumpMenu, ProgressiveStart2learn, windowOpenStyle } from "../../sy-tomato-plugin/src/libs/stores";
import { getDailyCardDocID, getDailyPath } from "./FlashBox";
import { getBookID } from "../../sy-tomato-plugin/src/libs/progressive";
import { findPieceByCandidates } from "./contentsJump";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import { loadBookStatuses, invalidateBookStatusCache, type BookStatusInfo } from "./bookStatus";
import { mount, } from "svelte";
import { fullfilContent } from "./helper";
import { showDialog } from "../../sy-tomato-plugin/src/libs/DialogText";
import { pressSkip, showCardAnswer } from "../../sy-tomato-plugin/src/libs/cardUtils";

export const progSettingsOpenHK = winHotkey("alt+shift+,", "progSettingsOpenHK", "iconSettingsProg", () => tomatoI18n.渐进学习的设置)
export const Progressive开始学习 = winHotkey("⌥-", "Progressive startToLearn", "iconProgPlay", () => tomatoI18n.开始今日阅读)
export const Progressive开始随机学习 = winHotkey("⌥⇧-", "Progressive startToLearnRand", "iconProgShuffle", () => tomatoI18n.开始随机学习)
export const Progressive上一页 = winHotkey("ctrl+left", "上一页", "iconProgPrev", () => tomatoI18n.上一页)
export const Progressive下一页 = winHotkey("ctrl+right", "下一页", "iconProgFFast", () => tomatoI18n.下一页)
export const Progressive跳到分片或回到原文 = winHotkey("⇧⌥w", "跳到分片或回到原文", "iconProgSwap", () => tomatoI18n.跳到分片或回到原文)
export const Progressive添加当前文档到渐进阅读分片模式 = winHotkey("⇧⌥m", "添加当前文档到渐进阅读(分片模式)", "iconProgAddBook", () => tomatoI18n.添加当前文档到渐进阅读分片模式)

class Progressive {
    plugin: Plugin;
    settings: TomatoSettings;
    private docID: string;
    private observer: MutationObserver;
    private welement: any;
    private jumpSeq = 0; // □3 跳片轮询 latest-wins 序号（review P2-2）

    /** 顶栏按钮（2026-08-31 起仅移动端注册——桌面顶栏入口退役，见 index.ts 注册处）：
     *  移动端无浮条 hover 生态，顶栏是加书/跳转/开始学习的唯一常驻入口 */
    addTopbar(plugin: Plugin, position: "left" | "right") {
        const tb = plugin.addTopBar({
            icon: "iconFilesRoot",
            title: tomatoI18n.渐进学习菜单,
            position,
            callback: () => this.addMenu(),
        });
        return tb;
    }

    onunload() {
        this.observer?.disconnect();
        this.observer = null;
    }

    async onload(plugin: Plugin, settings: TomatoSettings) {
        this.plugin = plugin;
        this.settings = settings;

        this.plugin.addCommand({
            langKey: Progressive开始学习.langKey,
            langText: Progressive开始学习.langText(),
            hotkey: Progressive开始学习.m,
            callback: async () => {
                await this.startToLearnWithLock();
            },
        });
        this.plugin.addCommand({
            langKey: Progressive开始随机学习.langKey,
            langText: Progressive开始随机学习.langText(),
            hotkey: Progressive开始随机学习.m,
            callback: async () => {
                await this.startToLearnWithLock("", true);
            },
        });
        this.plugin.addCommand({
            langKey: Progressive上一页.langKey,
            langText: Progressive上一页.langText(),
            hotkey: Progressive上一页.m,
            callback: () => this.gotoPage(-1),
        });
        this.plugin.addCommand({
            langKey: Progressive下一页.langKey,
            langText: Progressive下一页.langText(),
            hotkey: Progressive下一页.m,
            callback: () => this.gotoPage(1),
        });
        this.plugin.addCommand({
            langKey: Progressive跳到分片或回到原文.langKey,
            langText: Progressive跳到分片或回到原文.langText(),
            hotkey: Progressive跳到分片或回到原文.m,
            callback: () => {
                this.readThisPiece();
            }
        });
        this.plugin.addCommand({
            langKey: Progressive添加当前文档到渐进阅读分片模式.langKey,
            langText: Progressive添加当前文档到渐进阅读分片模式.langText(),
            hotkey: Progressive添加当前文档到渐进阅读分片模式.m,
            callback: () => {
                this.addProgressiveReadingWithLock();
            }
        });
        this.plugin.eventBus.on("open-menu-content", ({ detail }) => {
            const menu = detail.menu;
            if (piecesmenu.get()) {
                menu.addItem({
                    icon: Progressive添加当前文档到渐进阅读分片模式.icon,
                    label: Progressive添加当前文档到渐进阅读分片模式.langText(),
                    accelerator: Progressive添加当前文档到渐进阅读分片模式.m,
                    click: async () => {
                        await this.addProgressiveReadingWithLock();
                    }
                });
            }
            if (ProgressiveJumpMenu.get()) {
                menu.addItem({
                    icon: Progressive跳到分片或回到原文.icon,
                    label: Progressive跳到分片或回到原文.langText(),
                    accelerator: Progressive跳到分片或回到原文.m,
                    click: () => {
                        this.readThisPiece();
                    },
                });
            }
            // □11 盘点整改 A 类：右键「开始学习」退役——火苗点击=startReading 全局出片 +
            // 书态 ▶ + 🔄 三重覆盖，右键不再重复占位
        });
        events.addListener("ProgressiveBox", (eventType, detail: Protyle) => {
            if (eventType == EventType.loaded_protyle_static || eventType == EventType.loaded_protyle_dynamic || eventType == EventType.click_editorcontent || eventType == EventType.switch_protyle) {
                navigator.locks.request(constants.TryAddStarsLock, { ifAvailable: true }, async (lock) => {
                    const protyle: IProtyle = detail.protyle;
                    const welement = protyle?.wysiwyg?.element as HTMLElement;
                    const element = protyle?.element as HTMLElement;
                    if (!protyle || !welement || !element) return;
                    const nextDocID = protyle?.block?.rootID;
                    const { isPiece } = help.isProtylePiece(protyle);
                    if (lock && nextDocID && isPiece) {
                        if (this.docID != nextDocID || this.welement !== welement) {
                            this.docID = nextDocID;
                            this.welement = welement;
                            this.observer?.disconnect();
                            this.observer = new MutationObserver((mutationsList) => {
                                const es = mutationsList
                                    .map(i => [...i.addedNodes.values()]).flat();
                                this.tryAddRefAttr(es as any);
                            });
                            this.observer.observe(welement, { childList: true, subtree: true });
                        }
                    }
                });
                navigator.locks.request(constants.ProgressiveAddBtnListenersLock, { ifAvailable: true }, async (lock) => {
                    const protyle: IProtyle = detail.protyle;
                    if (!protyle) return;
                    const notebookId = protyle.notebookId;
                    const nextDocID = protyle?.block?.rootID;
                    const element = protyle?.wysiwyg?.element as HTMLElement;
                    if (lock && element && nextDocID && notebookId) {
                        addClickEvent(element);
                    }
                });
            }
        });

        events.addListener("ProgressiveBox 2025-07-16 10:33:25", (eventType, detail: Protyle) => {
            if (eventType == EventType.loaded_protyle_static
                || eventType == EventType.loaded_protyle_dynamic
                || eventType == EventType.destroy_protyle
                || eventType == EventType.click_editorcontent || eventType == EventType.switch_protyle) {
                navigator.locks.request("ProgressiveBox 2025-07-16 10:33:20", { ifAvailable: true }, async (lock) => {
                    const protyle: IProtyle = detail.protyle;
                    if (!protyle) return;
                    const notebookId = protyle.notebookId;
                    const nextDocID = protyle?.block?.rootID;
                    const element = protyle?.wysiwyg?.element as HTMLElement;
                    if (lock && element && nextDocID && notebookId) {
                        await progressiveBtnFloating(protyle, eventType == EventType.destroy_protyle);
                    }
                });
            }
        });
    }

    private async gotoPage(step: number) {
        const docID = events.docID
        const { bookID, pieceNum } = await getBookID(docID)
        await progStorage.gotoBlock(bookID, pieceNum + step);
        await this.startToLearnWithLock(bookID);
        this.closePeices(bookID);
    }

    private async tryAddRefAttr(elements: HTMLElement[]) {
        return navigator.locks.request(constants.TryAddStarsLock + "tryAddRefAttr", { mode: "exclusive" }, async (lock) => {
            if (lock) {
                elements
                    .filter(e => e.getAttribute && e.querySelectorAll)
                    .filter((e: HTMLElement) => !e.getAttribute(RefIDKey))
                    .filter((e: HTMLElement) => {
                        const a = e.getAttribute(DATA_TYPE);
                        return a == BlockNodeEnum.NODE_PARAGRAPH
                            || a == BlockNodeEnum.NODE_LIST
                            || a == BlockNodeEnum.NODE_LIST_ITEM
                            || a == BlockNodeEnum.NODE_HEADING
                            || a == BlockNodeEnum.NODE_BLOCKQUOTE
                            || a == BlockNodeEnum.NODE_CODE_BLOCK;
                    }).forEach(e => {
                        const { ref, idx, bIdx } = help.findBack(e) || help.findForward(e);
                        if (ref) {
                            const attr = {} as AttrType;
                            attr["custom-progref"] = ref;
                            if (idx) attr["custom-paragraph-index"] = idx;
                            if (bIdx) attr["custom-in-book-index"] = bIdx;
                            setTimeout(() => {
                                siyuan.setBlockAttrs(e.getAttribute(DATA_NODE_ID), attr);
                            }, 4000);
                            e.setAttribute(RefIDKey, ref);
                            if (bIdx) e.setAttribute(IN_BOOK_INDEX, bIdx);
                            if (idx) e.setAttribute(PARAGRAPH_INDEX, idx);
                            e.querySelectorAll(`div[${DATA_NODE_ID}]`).forEach(e => {
                                e.setAttribute(RefIDKey, ref);
                                if (bIdx) e.setAttribute(IN_BOOK_INDEX, bIdx);
                                if (idx) e.setAttribute(PARAGRAPH_INDEX, idx);
                            });
                        }
                    });
            }
        });
    }

    blockIconEvent(detail: IEventBusMap["click-blockicon"]) {
        if (!this.plugin) return;
        const menu = detail.menu;
        // □7：块图标菜单换独立开关（右键默认关不再连带这里）。click-blockicon 的
        // detail 无 blockId 字段（官方类型={menu,protyle,blockElements}，handoff □8-B
        // 原记载 open-menu-blockicon 自带 blockId 系误记），从首个块元素取 id——点哪块
        // 跳哪块，消掉「按全局选中块跳」的错位（□8-B）
        if (blockIconMenu.get()) {
            menu.addItem({
                icon: Progressive跳到分片或回到原文.icon,
                label: Progressive跳到分片或回到原文.langText(),
                accelerator: Progressive跳到分片或回到原文.m,
                click: () => {
                    const el = detail.blockElements?.[0];
                    this.readThisPiece(el?.getAttribute(DATA_NODE_ID) || undefined);
                }
            });
        }
    }

    /** 移动端顶栏全屏菜单：加书 + 跳到分片 + 开始学习（□11 盘点：开始学习桌面归火苗，
     *  移动端无火苗 hover 生态故保留常驻入口；桌面同款能力走右键块菜单+浮条+命令面板） */
    private addMenu() {
        const menu = new Menu("progressiveMenu");
        menu.addItem({
            icon: Progressive添加当前文档到渐进阅读分片模式.icon,
            label: Progressive添加当前文档到渐进阅读分片模式.langText(),
            accelerator: Progressive添加当前文档到渐进阅读分片模式.m,
            click: async () => {
                await this.addProgressiveReadingWithLock();
            }
        });
        menu.addItem({
            icon: Progressive跳到分片或回到原文.icon,
            label: Progressive跳到分片或回到原文.langText(),
            accelerator: Progressive跳到分片或回到原文.m,
            click: () => {
                this.readThisPiece();
            }
        });
        if (ProgressiveStart2learn.get()) {
            menu.addItem({
                icon: Progressive开始学习.icon,
                label: Progressive开始学习.langText(),
                accelerator: Progressive开始学习.m,
                click: () => {
                    this.startToLearnWithLock();
                }
            });
        }
        menu.fullscreen();
    }

    async addProgressiveReadingWithLock(bookID?: string) {
        return navigator.locks.request(constants.AddProgressiveReadingLock, { ifAvailable: true }, async (lock) => {
            if (lock) {
                await this.addProgressiveReading(bookID);
                await utils.sleep(constants.IndexTime2Wait);
            } else {
                await siyuan.pushMsg(tomatoI18n.请等待索引建立 + " [1]");
            }
        });
    }

    private async addProgressiveReading(bookID: string = "") {
        if (!bookID) {
            // events.docID 只在点击编辑器内容后更新——从文档树点开文档还没点内容时
            // 取不到，先取当前激活页签的文档（用户眼前的文档）
            bookID = getActiveDocID() || events.docID;
            // □8 P2-3 备案（评估后不改）：命令通道无浮条上下文，身份只能取激活页签/全局
            // 态。已知漂移面：① 闪卡页签激活时预览 protyle 也在 getAllEditor 且 data-id 祖先
            // 即闪卡页签，getActiveDocID 会取到预览文档；② getActiveDocID 空（面板全关等
            // 怪态）时回退 events.docID，它会被块引浮窗/搜索预览劫持；③ 在块引浮窗/搜索预览
            // 内右键时无参取激活页签文档而非右键所在文档（旧版 events.protyle=右键文档能
            // 就近）。三者均罕见（按钮链传 $noteID 已免，见 ProgressiveFloatBtns onBtn
            // addBook 注释），且 addProgressiveReadingDialog 弹窗标题即书名、跳片 toast
            // 兜底，用户可见可退；不加布局依赖校验（会误伤无页签 DOM 的移动端）。
        }
        if (!bookID) {
            await siyuan.pushMsg(tomatoI18n.请先打开一个文档);
            return;
        }
        const row = await siyuan.sqlOne(`select content from blocks where type='d' and id='${bookID}'`);
        if (!row) {
            siyuan.pushMsg(tomatoI18n.似乎书本已被删除.replace("{bookID}", bookID));
            return;
        }
        await this.addProgressiveReadingDialog(bookID, row["content"]);
    }

    private async addProgressiveReadingDialog(bookID: string, bookName: string,) {
        showDialog((target, dm) => {
            return mount(AddBookSvelte, {
                target,
                props: {
                    bookID, bookName, dm,
                }
            });
        }, {
            title: bookName,
            width: events.isMobile ? "90vw" : undefined,
            height: events.isMobile ? "180vw" : undefined,
        });
    }

    async readThisPiece(blockID?: string) {
        if (!blockID) {
            // □8 P2-2：命令/菜单通道无参解析加身份校验。原 selectedDivsSync() 无参回退全局
            // events.protyle——会被块引浮窗/搜索预览劫持（setReadingPointMap 对一切带 .event 的
            // loaded 都写），光标兜底又是全局 selection——不校验会拿别文档的块去跳片、甚至
            // 改写别书的断点。解析器统一走 getActiveProtyle()（页签宿主匹配，浮窗/预览天然
            // 排除——review P1-1：初版 own 快速路径只比 rootID，浮窗预览恰为同文档时会把主
            // 编辑器的合法选择误拒成 toast）；拿不到合格块按无选中处理。移动端
            // getActiveProtyle 恒 null（无页签 DOM），保持全局解析现状。
            const protyle = getActiveProtyle();
            if (protyle?.block?.rootID) {
                const info = events.selectedDivsSync(protyle);
                const sel0 = info?.selected?.[0];
                // contains 二验：光标兜底取的是全局 selection 所在块（可能在别的编辑器/
                // 浮窗），不在本文档容器内即丢弃
                blockID = sel0 && info.element?.contains(sel0) ? info.ids.at(0) : undefined;
            } else {
                blockID = events.selectedDivsSync().ids?.at(0);
            }
        }
        // 命令/菜单通道无块可依时给反馈（□4 review P2-1：静默 return 让按 ⇧⌥W 的用户
        // 以为键失效；按钮链 toPiece 同款提示在前端层）
        if (!blockID) {
            await siyuan.pushMsg(tomatoI18n.请选择段落块进行跳转);
            return;
        }
        // □21 旧逻辑一律上爬顶层祖先再匹配（前提=「索引只收顶层块、嵌套标题没有自己的
        // progref」，对超块/列表容器成立）；但思源 heading 容器化书（h2 挂 h1 下的
        // parent_id 链）getChildBlocks 平铺连嵌套 h2 一起进索引、副本有自己的 progref
        // ——一律上爬把大纲章节匹配成卷级祖先的分片，片内目录点 h2 章「跳不过去/错跳
        // 卷片」（2026-09-01 dev 复现）。改候选链就近匹配：先试自身命中再逐级上爬
        // （findPieceByCandidates），两类嵌套语义都成立；块菜单选嵌套块同享。
        let rootID = "";
        const candidates = [blockID];
        let cur = blockID;
        for (let i = 0; i < 20; i++) {
            const row = await siyuan.sqlOne(`select parent_id, root_id from blocks where id="${cur}"`);
            if (!row?.root_id) {
                rootID = "";
                break;
            }
            rootID = row.root_id;
            if (!row.parent_id || row.parent_id === row.root_id) break;
            cur = row.parent_id;
            candidates.push(cur);
        }
        if (rootID) {
            const bookID = rootID;
            const idx = await progStorage.loadBookIndexIfNeeded(bookID);
            if (idx?.length <= 0) {
                // not a book
                // 期3 手动分片书：注册书+空索引，原提示「请先将此文档加入渐进学习列表」
                // 不对症——放行为手动语义提示（片由摘抄产生，⇧⌥W/块菜单/浮条 📄 三通道共用）
                if (progStorage.isRegisteredBook(bookID) && progStorage.peekBookInfo(bookID)?.manualMode) {
                    await siyuan.pushMsg(tomatoI18n.手动分片书请直接摘抄);
                    return;
                }
                for (const div of document.querySelectorAll(`div[${DATA_NODE_ID}="${blockID}"]`)) {
                    const refID = utils.getAttribute(div as any, RefIDKey)
                    if (refID) {
                        OpenSyFile2(this.plugin, refID, "front", ["cb-get-context", "cb-get-focus", "cb-get-hl"]);
                        return;
                    }
                }
                await siyuan.pushMsg(tomatoI18n.请先将此文档加入渐进学习列表);
            } else {
                const hit = findPieceByCandidates(idx, candidates);
                if (hit) {
                    await progStorage.gotoBlock(bookID, hit.point);
                    await this.startToLearnWithLock(bookID);//创建分片
                    // □3：1200ms 固定时延不等片真就绪（删片重建链索引追赶远超
                    // 1.2s），改轮询 findPieceDoc 命中后再查副本跳块（不阻塞菜单回调）。
                    // seq latest-wins（review P2-2）：重入时旧轮询晚命中不得拉走用户
                    this.jumpToPieceBlockWhenReady(bookID, hit.point, hit.id, ++this.jumpSeq)
                        .catch(() => siyuan.pushMsg(tomatoI18n.请等待索引建立));
                    return;
                }
                await siyuan.pushMsg(tomatoI18n.请选择段落块进行跳转);
            }
        } else {
            await siyuan.pushMsg(tomatoI18n.未找到文档请等待索引);
        }
    }

    /** □3：等片文档就绪后跳到片内对应块——轮询替代 1200ms 固定时延（片已存在的正常路径
     * 首轮即命中零等待；删片重建时兜索引追赶，最多 ~60s 后提示重试）。refID=命中索引的
     * 候选块 id（自身或祖先——分片按索引块拷贝，副本 custom-progref 与之一致）。
     * seq latest-wins：新一轮跳转发起后旧轮询静默退场（review P2-2）。 */
    private async jumpToPieceBlockWhenReady(bookID: string, point: number, refID: string, seq: number) {
        let missAfterHit = 0; // 片已在但副本属性持续 miss 的轮数（review P2-3）
        for (let i = 0; i < 60; i++) {
            const pieceDocID = await help.findPieceDoc(bookID, point);
            if (pieceDocID) {
                const pieceBlockID = await this.getPiecesByRefID(refID, pieceDocID);
                if (pieceBlockID) {
                    if (seq !== this.jumpSeq) return;
                    await OpenSyFile2(this.plugin, pieceBlockID);//跳到分片内的块
                    return;
                }
                // 片文档已在但块副本属性持续未入索引：多半副本真无 progref（HTML 块拷贝
                // 丢 IAL/用户手删），烧满 60s 只会误报索引慢——10 轮即收（review P2-3）
                if (++missAfterHit >= 10) {
                    await siyuan.pushMsg(tomatoI18n.请选择段落块进行跳转);
                    return;
                }
            }
            await utils.sleep(1000);
        }
        await siyuan.pushMsg(tomatoI18n.请等待索引建立);
    }

    private async getPiecesByRefID(oriID: string, pieceDocID: string) {
        // □3：限定 root_id=目标片文档——digest 文档的摘抄拷贝同样带 progref 指向原块，
        // 无过滤时 limit 1 无序命中谁看缘分（e2e 实锤跳到 digest 文档）；空结果回 ""
        // （原 rows.at(0).block_id 对空集 TypeError 且在 setTimeout 内未捕获）。
        // 取舍：副本被用户移出片文档后不再命中（旧版会跳到移动后的位置）。
        const rows = await siyuan.sqlAttr(
            `select * from attributes where name="${RefIDKey}" and value="${oriID}" and root_id="${pieceDocID}" limit 1`)
        return rows.at(0)?.block_id ?? "";
    }

    async startToLearnWithLock(bookID = "", isRand = false) {
        return navigator.locks.request(constants.StartToLearnLock, { ifAvailable: true }, async (lock) => {
            if (lock) {
                await siyuan.pushMsg(tomatoI18n.正在为您打开文档片段);
                // □3 review P1：false=createPiece 落空（索引追赶窗口，可重试）；undefined=各
                // 终态（已带对症提示，不重试不叠弹）。重试间隔防连发，烧完仍 false 才弹失效。
                let ok: boolean | undefined = false;
                let i = 0;
                while ((ok = await this.startToLearn(bookID, isRand)) === false) {
                    if (i++ > 30) break;
                    await utils.sleep(500);
                }
                if (ok === false) await siyuan.pushMsg(tomatoI18n.该分片内容已失效);
                await utils.sleep(constants.IndexTime2Wait);
            } else {
                await siyuan.pushMsg(tomatoI18n.请等待索引建立 + " [2]");
            }
        });
    }

    /** ⏸/⚠ 书的统一处理：闭笔记本=提示开箱恢复（书可能只是暂不可见，绝不清理）；
     * 丢失=confirm 引导清理（只清 books.json 记录+索引文件，prog-data 沉淀物不动） */
    private async handleUnreadableBook(bookID: string, st: BookStatusInfo) {
        if (st.status === "closed") {
            await siyuan.pushMsg(tomatoI18n.书在已关闭的笔记本中(st.name));
            return;
        }
        await siyuan.pushMsg(tomatoI18n.书原文档已不存在(st.name, st.fsUnavailable));
        // 无文件层兜底的前端（移动端/浏览器）误判概率高且无法二次确认，不提供清理出口
        if (st.fsUnavailable) return;
        const id = bookID || ([...(await loadBookStatuses())].find(([, s]) => s.status === "lost")?.[0] ?? "");
        if (!id) return;
        confirm("⚠️", tomatoI18n.清理该书渐进记录确认(st.name), async () => {
            await progStorage.removeIndex(id);
            invalidateBookStatusCache();
            notifyFleetChanged();
            await siyuan.pushMsg(tomatoI18n.已清理该书记录);
        });
    }

    private async startToLearn(bookID = "", isRand = false) {
        let noteID = "";
        if (!bookID) {
            // 滚筒出片：order 中 lastServed 之后第一个可读书（跳过忽略/归档/读完），出片即轮转
            bookID = await rollerNextBook();
        if (!bookID) {
            // 出不了片：真空书架 vs 有书但全被 ⏸/⚠ 挡住（全跳光给对症提示，不再误报「没添加文档」）
            const statuses = await loadBookStatuses();
            const blocked = [...statuses.values()].find(s => s.status !== "ok");
            if (blocked) {
                await this.handleUnreadableBook("", blocked);
            } else if (Object.values(progStorage.booksInfos()).some(i => i?.manualMode && !i.ignored && !i.archived)) {
                // 期3 手动分片书：书架可读书只剩手动书（空索引恒 finished 被滚筒排除），
                // 给手动书对症指引，不再误报「您还没添加任何文档」
                await siyuan.pushMsg(tomatoI18n.手动书不参与推送请点击书卡打开);
            } else {
                siyuan.pushMsg(tomatoI18n.您还没添加任何文档);
            }
            return;
        }
        }
        // 书籍状态判定（2026-08-28 设计共识）：⏸ 闭笔记本/⚠ 文档丢失的书不出片——
        // 死书曾是「点了没反应」的根因（toast 一闪而过、无窗口打开）
        const statuses = await loadBookStatuses();
        const st = statuses.get(bookID);
        if (st && st.status !== "ok") {
            await this.handleUnreadableBook(bookID, st);
            return;
        }
        const bookInfo = await progStorage.booksInfo(bookID);
        // 期3 手动分片书：无自动片，统一拦截（Dock 书卡/管理页/浮条 ▶ 全入口）——开原书
        //  +「摘抄即片」提示。无参滚筒路径不会选中手动书（空索引恒 finished），无需再判
        if (bookInfo.manualMode) {
            await siyuan.pushMsg(tomatoI18n.手动分片书请直接摘抄);
            await this.openOriginBook(bookID);
            return;
        }
        const bookIndex = await progStorage.loadBookIndexIfNeeded(bookInfo.bookID);
        let point = (await progStorage.booksInfo(bookInfo.bookID)).point;
        if (isRand) point = utils.getRandInt0tox(bookIndex.length); // 随机创建书籍的某个分片，适用于单词集合。
        await progStorage.updateBookInfoTime(bookID);
        if (bookIndex.length === 0) {
            // 0 片 ≠ 最后一页（旧文案误导）：未分片的书引导去分片
            await siyuan.pushMsg(tomatoI18n.本书还未分片(st.name));
            confirm("", tomatoI18n.本书还未分片立即重新分片吗(st.name), async () => {
                await this.addProgressiveReadingWithLock(bookID);
            });
            return;
        }
        if (point >= bookIndex.length) {
            await siyuan.pushMsg(tomatoI18n.已经是最后一页了);
            return;
        } else if (point < 0) {
            await siyuan.pushMsg(tomatoI18n.已经是第一页了);
            return;
        }
        let openPiece = false;
        noteID = await help.createPiece(bookInfo, bookIndex, point)
        if (noteID) {
            events.setDocID(noteID);
            openPiece = true;
            await OpenSyFile2(this.plugin, noteID)
        } else {
            // 分片源块失效/索引未就绪（createPiece 返回 ""）——可重试失败：返回 false 交
            // startToLearnWithLock 重试（□3 review P1：原裸 return 使 while 重试循环死代码，
            // 索引追赶窗口一次机会都不给；终态提示上抛由 WithLock 统一弹防 30 连发）
            return false;
        }
        if (openPiece && this.settings.openCardsOnOpenPiece) {
            if (card2dailycard.get()) {
                // □3 制卡统一归置：新卡落当日 dailycard 文档，「开片同步开卡」跟随打开它
                // （语义保持：边读边看新卡汇合；关掉制卡并入开关才回落旧 cards 夹）。
                // boxID 与制卡侧同款分叉：闪卡专用笔记本优先，回落书所在笔记本
                const boxID = flashcardNotebook.get(a => a || bookInfo.boxID);
                const targetDocID = await getDailyCardDocID(boxID, getDailyPath());
                OpenSyFile2(this.plugin, targetDocID, windowOpenStyle.get() as any);
            } else {
                let hpath = "";
                let docID: string;
                if (this.settings.cardUnderPiece) {
                    hpath = await help.getHPathByDocID(noteID, "cards");
                    docID = noteID;
                } else {
                    hpath = await help.getHPathByDocID(bookID, "cards");
                    docID = bookID;
                }
                if (hpath && docID) {
                    const targetDocID = await help.getCardsDoc(docID, bookInfo.boxID, hpath);
                    OpenSyFile2(this.plugin, targetDocID, windowOpenStyle.get() as any);
                }
            }
        }
        return true;
    }

    async htmlBlockReadNextPeice(bookID: string, noteID: string, cbType: HtmlCBType, point: number) {
        return navigator.locks.request("htmlBlockReadNextPeiceLock", { ifAvailable: true }, async (lock) => {
            if (lock) {
                await this.htmlBlockReadNextPeiceInLock(bookID, noteID, cbType, point);
                await utils.sleep(constants.IndexTime2Wait);
            } else {
                await siyuan.pushMsg(tomatoI18n.请等待索引建立 + " [3]");
            }
        });
    }

    private closePeices(bookID: string) {
        const tabs = utils.getOpenedEditors()
        for (const tab of tabs.map(t => t.ial)) {
            if (tab?.["custom-progmark"]?.includes(bookID)) {
                closeTabByTitle([tab], events.docID)
            }
        }
    }

    private async htmlBlockReadNextPeiceInLock(bookID: string, noteID: string, cbType: HtmlCBType, point: number) {
        switch (cbType) {
            case HtmlCBType.previous:
                await progStorage.gotoBlock(bookID, point - 1);
                await this.startToLearnWithLock(bookID);
                this.closePeices(bookID);
                showCardAnswer();
                pressSkip()
                break;
            case HtmlCBType.next:
                await progStorage.gotoBlock(bookID, point + 1);
                // routemap □1 计数解耦：读到新片即前进——翻页不删片与下片删同权计数
                // （片可留作草稿，point+1 为去重锚判新高的新 point）
                await this.markReadSafe(bookID, point + 1);
                await this.startToLearnWithLock(bookID);
                this.closePeices(bookID);
                showCardAnswer();
                pressSkip()
                break;
            case HtmlCBType.deleteAndExit:
                confirm("⚠️", "🏃 🗑", async () => {
                    await siyuan.removeRiffCards([noteID]);
                    siyuan.removeDocByID(noteID);
                    showCardAnswer();
                    pressSkip()
                });
                break;
            case HtmlCBType.deleteAndBack:
                confirm("⚠️", tomatoI18n.删除并返回, async () => {
                    await siyuan.removeRiffCards([noteID]);
                    await progStorage.gotoBlock(bookID, point - 1);
                    await this.startToLearnWithLock(bookID);
                    siyuan.removeDocByID(noteID);
                    this.closePeices(bookID);
                    showCardAnswer();
                    pressSkip()
                });
                break;
            case HtmlCBType.deleteAndNext: {
                // v5「读完即删」：分片是一次性餐具（原文档还在、误删可重分片），主循环高频动作不再 confirm
                await siyuan.removeRiffCards([noteID]);
                await progStorage.gotoBlock(bookID, point + 1);
                // routemap □1：已读=读到新片那一刻（翻页/删片同权；锚防回看后再删重复计）
                await this.markReadSafe(bookID, point + 1);
                await this.startToLearnWithLock(bookID);
                siyuan.removeDocByID(noteID);
                this.closePeices(bookID);
                showCardAnswer();
                pressSkip()
                break;
            }
            case HtmlCBType.nextBook:
                await this.startToLearnWithLock();
                showCardAnswer();
                pressSkip()
                break;
            case HtmlCBType.quit: {
                const t = await OpenSyFile2(this.plugin, noteID);
                await utils.sleep(200);
                t?.close();
                showCardAnswer();
                pressSkip()
                break;
            }
            case HtmlCBType.ignoreBook:
                await progStorage.setIgnoreBook(bookID);
                break;
            case HtmlCBType.cleanOriginText:
                await help.cleanNote(noteID);
                break;
            case HtmlCBType.openFlashcardTab:
                // v5：附属卡 deck 目标从原书改为 digest-书名 夹（摘抄产生的卡才是附属卡）
                if (bookID) await this.openBookCards(bookID);
                else openTab({ app: this.plugin.app, card: { type: "all" } });
                break;
            default:
                throw "Invalid HtmlCBType " + cbType;
        }
    }

    /** □22 重插翻新：清空片内全部子块（含手写笔记——refillMenu 的 confirm 已警告）后按
     * 所选断句方式重插原文。与 htmlBlockReadNextPeice 共锁防并发；先验源块存活再清空
     * （同 createPiece 口径），防索引悬空时「清了旧内容却插不进新内容」。 */
    async refillPiece(bookID: string, noteID: string, point: number, stype: AsList | "no" | null) {
        return navigator.locks.request("htmlBlockReadNextPeiceLock", { ifAvailable: true }, async (lock) => {
            if (!lock) {
                await siyuan.pushMsg(tomatoI18n.请等待索引建立 + " [3]");
                return;
            }
            const index = await progStorage.loadBookIndexIfNeeded(bookID);
            const piecePre = index[point - 1] ?? [];
            const piece = (await siyuan.getRows(index[point] ?? [], "id")).map(r => r.id);
            if (piece.length === 0) {
                await siyuan.pushMsg(tomatoI18n.该分片内容已失效);
                return;
            }
            await siyuan.clearAll(noteID);
            try {
                await fullfilContent(point, bookID, piecePre, piece, noteID, stype);
            } catch (e) {
                // clearAll 不可逆（笔记已删），重插中途失败必须让用户知道可重试自愈——
                // 静默的话最终态=确认过、清空了、什么都没插回（reasoning review P1-1）
                console.error("refillPiece fullfilContent failed", e);
                await siyuan.pushMsg(tomatoI18n.重插失败提示, 4000);
                return;
            }
            await utils.sleep(constants.IndexTime2Wait);
        });
    }

    /** 已读记账；附属动作失败只降级不阻断开片。routemap □1：point=前进后的新 point，
     * 传给 roller 当日去重锚（回看后再前进到旧高度不重复计） */
    private async markReadSafe(bookID: string, point?: number) {
        try {
            await rollerMarkRead(bookID, point);
            notifyFleetChanged(); // □6 火苗/面板即时联动（fleet.ts 不 import 本类，单向无环）
        } catch (e) {
            console.error("roller markRead failed", e);
        }
    }

    // ============ v5 □5 浮条三态动作（docs/prog-v5-floatbar-design.md §3） ============

    /** digest-书名 夹「查不建」：附属卡/摘抄汇总入口没摘过书时不建空夹 */
    private async findDigestDir(bookID: string): Promise<string> {
        return findDocByIal(getDocIalDigestDir(bookID));
    }

    /** 附属卡（三态公共组）：doc deck 挂 digest-书名 夹 */
    async openBookCards(bookID: string) {
        const dirID = await this.findDigestDir(bookID);
        if (!dirID) {
            await siyuan.pushMsg(tomatoI18n.本书还没有摘抄);
            return;
        }
        openTab({ app: this.plugin.app, card: { type: "doc", id: dirID } });
    }

    /** 摘抄汇总（书态/摘抄态）：打开 digest-书名 夹 */
    async openDigestSummary(bookID: string) {
        const dirID = await this.findDigestDir(bookID);
        if (!dirID) {
            await siyuan.pushMsg(tomatoI18n.本书还没有摘抄);
            return;
        }
        await OpenSyFile2(this.plugin, dirID);
    }

    /** 归档（书态 ghost，confirm）：原书退出一切推送，摘抄永久留存 */
    async archiveBookWithConfirm(bookID: string) {
        const name = await progStorage.bookName(bookID);
        confirm("📦", tomatoI18n.归档本书确认.replace("{name}", name ?? bookID), async () => {
            await rollerArchiveBook(bookID);
            await siyuan.pushMsg(tomatoI18n.已归档本书);
        });
    }

    /** 回原书（片态=打开原书；摘抄态传 focusBlockID 定位原文块）。focusBlockID 悬空
     *  兜底（□1 review P2-3）：片态目录大纲有 5min TTL 缓存，窗口内书被编辑删了标题，
     *  点旧行回落整书打开，不给 openTab 喂悬空 id 静默无反应。 */
    async openOriginBook(bookID: string, focusBlockID?: string) {
        let target = focusBlockID || bookID;
        if (focusBlockID && focusBlockID !== bookID
            && !(await siyuan.checkBlockExist(focusBlockID))) {
            target = bookID;
        }
        await OpenSyFile2(this.plugin, target);
    }

    /**
     * 片态浮条「回原书」（2026-08-31 升级，原=仅打开原书文档）：按文档序取片内首个带
     * custom-progref 的块定位跳原文位置——⌥⇧W 回程同款块级体验且免选块；旧片无 progref
     * /SQL 落空回落打开原书文档本身。attributes 表无序，序从 blocks.sort 带出。
     * 开启「显示上一分片最后块」时片首的 previous 副本同样带 progref（copyBlock 对 mark
     * 块统一打标）——不排除会跳到上一片末尾而非本片开头（2026-08-31 跳转链路体检修）。
     */
    async returnToOriginFromPiece(noteID: string, bookID: string) {
        let refID = "";
        try {
            const row = await siyuan.sqlOne(
                `select a.value as ref from blocks b join attributes a on a.block_id = b.id and a.name = '${RefIDKey}'` +
                ` where b.root_id = '${noteID}' and b.id not in` +
                ` (select block_id from attributes where name = '${PROG_PIECE_PREVIOUS}' and root_id = '${noteID}')` +
                ` order by b.sort limit 1`);
            refID = (row as any)?.ref ?? "";
        } catch { /* 查询异常回落打开原书 */ }
        await this.openOriginBook(bookID, refID);
    }

    /**
     * □16 摘抄态回原书智能链（形态一：单动作不加新按钮）：块级 progref → 片/任意文档
     * parent → 片序号键重切同片（静默重建+toast，confirm 反而打断心流）→ 兜底跳书。
     * 决策逻辑纯函数在 originTrace.resolveOriginTarget（有单测）。
     */
    async openOriginFromDigest(digestDocID: string, selectedIDs: string[]) {
        let refID = "";
        for (const id of selectedIDs) {
            const attrs = await siyuan.getBlockAttrs(id);
            refID = attrs?.[RefIDKey] ?? "";
            if (refID) break;
        }
        const docAttrs = await siyuan.getBlockAttrs(digestDocID);
        const refExists = refID ? await siyuan.checkBlockExist(refID) : false;
        const parentID = docAttrs?.[PDIGEST_PARENT_ID] ?? "";
        const parentExists = parentID ? await siyuan.checkBlockExist(parentID) : false;
        const parentIsPiece = parentExists && !!((await siyuan.getBlockAttrs(parentID))?.[MarkKey]);
        const target = resolveOriginTarget({
            refID, refExists, parentID, parentExists, parentIsPiece,
            pieceIdx: docAttrs?.[PIECE_IDX_KEY] ?? "",
            bookID: parseBookIDFromCtime(docAttrs?.[PDIGEST_CTIME] ?? ""),
        });
        if (target.action === "rebuild") {
            // 只读取档（□11）：书可能已删/记录已清，booksInfo() 的自增注册会造死书键
            // 且 time=now 骗过 bookStatus 新书保护期；createPiece 只消费 bookID，缺档给默认壳
            const info = progStorage.peekBookInfo(target.bookID)
                ?? { ...ProgressiveStorage.defaultBookInfo(), bookID: target.bookID };
            const index = await progStorage.loadBookIndexIfNeeded(target.bookID);
            const noteID = await help.createPiece(info, index, target.point);
            if (noteID) {
                await siyuan.pushMsg(tomatoI18n.分片已重建);
                await OpenSyFile2(this.plugin, noteID);
                return;
            }
            // 重建失败（书删了/索引空）落兜底跳书
            await OpenSyFile2(this.plugin, target.bookID);
            return;
        }
        if (target.action !== "none") {
            // 去向反馈（progpolish □2）：一级命中书内原文块时用户感知「一点就回原书」预期落空，
            // 四态 toast 只报实际去向，不动四级链判定本身
            const tip = target.action === "ref" ? tomatoI18n.已定位到原文块
                : target.action === "piece" ? tomatoI18n.已回到分片
                : target.action === "book" ? tomatoI18n.已回到原书
                : tomatoI18n.已回到发起文档;
            await siyuan.pushMsg(tip);
            await OpenSyFile2(this.plugin, target.id);
        }
    }

    /** recite 安装检测（app.plugins，送仿写按钮显隐；□6 Dock 导流图标复用） */
    isReciteInstalled(): boolean {
        return (this.plugin?.app as any)?.plugins?.some((p: any) => p?.name === "sy-recite-plugin") ?? false;
    }

    /** □11 浮层族通用跳转：文档/块 ID → OpenSyFile2（块 ID 会聚焦定位） */
    async jumpTo(id: string) {
        if (id) await OpenSyFile2(this.plugin, id);
    }

    /** □11 原文侧追溯浮层跳片：gotoBlock 置断点 + 出片（与目录浮层 readThisPiece 同链路） */
    async jumpToPiece(bookID: string, point: number) {
        await progStorage.gotoBlock(bookID, point);
        await this.startToLearnWithLock(bookID);
    }

    /**
     * □11 digest 态路径胶囊文案：显示降级后实际可达目标（不显示死链）——
     * parent 存活且是另一个摘抄 → 「书名 / 父摘抄标题」；parent 是片/书发起或已删
     * → 只显书名（书永远在：ctime 含 bookID）。点击行为走 openOriginFromDigest
     * 完整四级链（含块级 progref 优先，胶囊文案不含该层——它随选中实时变）。
     */
    async digestCrumbs(digestDocID: string): Promise<string> {
        const docAttrs = await siyuan.getBlockAttrs(digestDocID);
        if (!docAttrs) return "";
        const bookID = parseBookIDFromCtime(docAttrs[PDIGEST_CTIME] ?? "");
        if (!bookID) return "";
        const bookName = (await siyuan.getBlockAttrs(bookID))?.title ?? bookID;
        const parentID = docAttrs[PDIGEST_PARENT_ID] ?? "";
        if (parentID && parentID !== bookID && await siyuan.checkBlockExist(parentID)) {
            const pAttrs = await siyuan.getBlockAttrs(parentID);
            // 父是另一个摘抄（再摘抄链）才显示父段；父是片/原文发起文档则书名已足够
            if (pAttrs?.[PDIGEST_CTIME]) {
                return `${bookName} / ${pAttrs.title ?? parentID}`;
            }
        }
        return bookName;
    }

    /** 送仿写（摘抄态 primary）：触发 recite 仿写练习开关命令 */
    async sendToRecite() {
        const recite = (this.plugin?.app as any)?.plugins?.find((p: any) => p?.name === "sy-recite-plugin");
        const cmd = recite?.commands?.find((c: any) => c.langKey === "reciteTogglePractice");
        if (cmd?.callback) {
            await cmd.callback();
        } else {
            await siyuan.pushMsg(tomatoI18n.未找到仿写插件功能);
        }
    }

    /** 定向送仿写（□27 仿写本片副本链路）：对指定文档直接进仿写模式。命令通道
     *  togglePractice 只认最近交互文档无法定向，故走 recite 实例方法 enterPracticeFor；
     *  旧版 recite 无此方法时降级提示（副本已建好仍有整摘价值，文案写明版本过旧而非
     *  未安装——review P2-3） */
    async enterRecitePractice(docID: string) {
        const recite = (this.plugin?.app as any)?.plugins?.find((p: any) => p?.name === "sy-recite-plugin");
        if (typeof recite?.enterPracticeFor === "function") {
            await recite.enterPracticeFor(docID);
        } else {
            await siyuan.pushMsg(tomatoI18n.仿写插件版本过旧);
        }
    }

    async viewAllProgressiveBooks() {
        showDialog((target, dm) => {
            return mount(ShowAllBooksSvelte, {
                target,
                props: {
                    dm,
                }
            });
        }, {
            title: tomatoI18n.管理书目,
            width: events.isMobile ? "90vw" : undefined,
            height: events.isMobile ? "180vw" : "800px",
        });
    }
}

export const prog = new Progressive();

