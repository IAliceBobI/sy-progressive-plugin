import { Menu, Plugin, openTab, confirm, getFrontend, IProtyle, IEventBusMap, Protyle } from "siyuan";
import "./index.scss";
import { EventType, events } from "../../sy-tomato-plugin/src/libs/Events";
import { closeTabByTitle, getActiveDocID, getActiveProtyle, getNotebookFirstOne, siyuan, } from "../../sy-tomato-plugin/src/libs/utils";
import * as utils from "../../sy-tomato-plugin/src/libs/utils";
import * as help from "./helper";
import { winHotkey } from "../../sy-tomato-plugin/src/libs/winHotkey";
import * as constants from "./constants";
import { invalidateRevTrace, revTraceOnAppear } from "./revTrace";
import {
    BlockNodeEnum, DATA_NODE_ID, DATA_TYPE, IN_BOOK_INDEX, MarkKey,
    PARAGRAPH_INDEX, PDIGEST_CTIME, PDIGEST_PARENT_ID, PROG_PIECE_PREVIOUS, RefIDKey
} from "../../sy-tomato-plugin/src/libs/gconst";
import AddBookSvelte from "./AddBook.svelte";
import SplitVolsDialogSvelte from "./SplitVolsDialog.svelte";
import AddWritingBookSvelte from "./AddWritingBook.svelte";
import MaterialPickerSvelte from "./MaterialPicker.svelte";
import SplitPieceDialogSvelte from "./SplitPieceDialog.svelte";
import AppendSlotDialogSvelte from "./AppendSlotDialog.svelte";
import DigestAllDialogSvelte from "./DigestAllDialog.svelte";
import ShowAllBooksSvelte from "./ShowAllBooks.svelte";
import { ProgressiveStorage, progStorage } from "./ProgressiveStorage";
import { ensureVolTableFresh, volRebuildDeps } from "./volRebuild";
import { rollerNextBook, rollerMarkRead, rollerArchiveBook } from "./roller";
import { invalidateTailToday } from "./tailCardAppend";
import { notifyFleetChanged } from "./fleetNotify";
import { addToReadingCurve, buildReadingCard, disposeReadCurve, initReadCurveTriggers, removeFromReadingCurve, sweepReadCurve } from "./readCurve";
import { openReadCardMenu } from "./readCardMenu";
import { cadenceDays, cadenceOpts, plusDays, READCARD_KEY } from "./readCurveCore";
import { disposeRevCardUI, revCardOnAppear } from "./readCurveCardUI";
import { HtmlCBType } from "./constants";
import { lockWithLease, type LockLeaseResult } from "./lockLease";
import { findDocByIal, getDocIalDigestDir, parseBookIDFromCtime } from "./progData";
import { PIECE_IDX_KEY, resolveOriginTarget } from "./originTrace";
import { OpenSyFile2 } from "../../sy-tomato-plugin/src/libs/docUtils";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
import { mobileSelectBtns, readCurveCadMaterial, readCurveMaterial, readCurveTakeover } from "../../sy-tomato-plugin/src/libs/stores";
import { addClickEvent, progressiveBtnFloating, yieldFloatbarForMenu, restoreFloatbarAfterMenu } from "./ProgressiveBtn";
import { blockIconMenu, cardLanding, flashcardNotebook, piecesmenu, ProgressiveJumpMenu, ProgressiveStart2learn, storeNoteBox_selectedNotebook, windowOpenStyle } from "../../sy-tomato-plugin/src/libs/stores";
import { getDailyCardDocID, getDailyPath } from "./FlashBox";
import { getBookID } from "../../sy-tomato-plugin/src/libs/progressive";
import { findPieceByCandidates } from "./contentsJump";
import { queryDigestTree } from "./digestUtils";
import { fetchWritingPieces, pickWritingDispatch, listWritingSlotTargets, insertBlocksIntoPiece, insertDigestIntoPiece, moveDigestIntoPiece, pickWritingFlameBook, feedBlocksToPool, type WritingSlotTarget } from "./writeBook";
import { escapeHtml } from "./progData";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import { loadBookStatuses, invalidateBookStatusCache, type BookStatusInfo } from "./bookStatus";
import { pieceRowsNoneInsertable, pieceUnbuildable } from "./pieceEmpty";
import { mount, } from "svelte";
import { fullfilContent } from "./helper";
import { showDialog } from "../../sy-tomato-plugin/src/libs/DialogText";
import { pressSkip, showCardAnswer } from "../../sy-tomato-plugin/src/libs/cardUtils";
import { addSelectionMLButtons, disposeSelectionML, getSelectionML } from "../../sy-tomato-plugin/src/libs/selectionML";
import { collectSelectedBlocks, resolveSeedRange } from "../../sy-tomato-plugin/src/libs/selection";
import { getCursorElement } from "../../sy-tomato-plugin/src/libs/domUtils";

export const progSettingsOpenHK = winHotkey("alt+shift+,", "progSettingsOpenHK", "iconSettingsProg", () => tomatoI18n.渐进学习的设置)
export const Progressive开始学习 = winHotkey("⌥-", "Progressive startToLearn", "iconProgPlay", () => tomatoI18n.开始今日阅读)
export const Progressive开始随机学习 = winHotkey("⌥⇧-", "Progressive startToLearnRand", "iconProgShuffle", () => tomatoI18n.开始随机学习)
export const Progressive上一页 = winHotkey("ctrl+left", "上一页", "iconProgPrev", () => tomatoI18n.上一页)
export const Progressive下一页 = winHotkey("ctrl+right", "下一页", "iconProgFFast", () => tomatoI18n.下一页)
export const Progressive跳到分片或回到原文 = winHotkey("⇧⌥w", "跳到分片或回到原文", "iconProgSwap", () => tomatoI18n.跳到分片或回到原文)
export const Progressive添加当前文档到渐进阅读分片模式 = winHotkey("⇧⌥m", "添加当前文档到渐进阅读(分片模式)", "iconProgAddBook", () => tomatoI18n.添加当前文档到渐进阅读分片模式)
// □1-③ 直接入槽（鸟 09-08 反馈③）：dev 实测 keymap 全量扫描 ⌥⌘ 字母已全占（官方+四插件；
// 初选 ⌥⌘O 撞 recite 练靶实锤后弃）、⇧⌥ 仅剩 S 且有 AIBox 关态暗雷（keymap 扫描盲区在案），
// 落 ⌥;——纯 ⌥ 符号键全 keymap 无占用、无 macOS 系统冲突，与 ⌥-（开始阅读）同族单修饰风格
export const Progressive直接入槽 = winHotkey("⌥;", "直接入槽", "iconProgMaterial", () => tomatoI18n.直接入槽)

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
        disposeReadCurve();
        disposeRevCardUI();
        delete (window as any).__progReadCurve;
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
        // □1-③ 直接入槽：编辑器选区直送进槽（与浮条直送钮同菜单；锚点=选中首块下方）
        this.plugin.addCommand({
            langKey: Progressive直接入槽.langKey,
            langText: Progressive直接入槽.langText(),
            hotkey: Progressive直接入槽.m,
            callback: () => {
                void this.directSlotCommand();
            }
        });
        // □2 物理分卷：低频工具（一本书用一次）不占默认键，命令面板可触达
        this.plugin.addCommand({
            langKey: "progSplitVolsCurrent",
            langText: tomatoI18n.物理分卷,
            hotkey: "",
            callback: () => {
                void this.splitVolsDialogFromActive();
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
            // matfeed □2 槽片右键「管理素材池」（入口前移第二面；恒显不设开关——场景
            // 判定窄=只在写作书片内出现，文档树右键「加入渐进阅读」同款拍板）。片身份
            // 同步判读零 await（emitToPlugins 同步收集菜单项，重访调度 2026-09-02 实锤
            // await 后 addItem 迟到不进菜单）：custom IAL 渲染为 wysiwyg 根 DOM 同名
            // 属性——digest 宿主（素材文档，挂 PDIGEST_CTIME）先排除（detectFloatDoc
            // pdigest>mark 优先级同判据），再从 mark（TEMP#bookID,point）取书 ID 判
            // writing；booksInfos 未加载窗口 peek 空=不加（冷启动即右键的低频场景）
            const wysiwygEl = detail.protyle?.wysiwyg?.element;
            const markRaw = wysiwygEl?.getAttribute(MarkKey) ?? "";
            const poolBookID = markRaw.split("#")?.at(1)?.split(",")?.[0] ?? "";
            debugLog("prog.managemenu", `mark=${markRaw} book=${poolBookID} writing=${!!(poolBookID && progStorage.peekBookInfo(poolBookID)?.writing)}`, "progressive");
            if (wysiwygEl && !wysiwygEl.getAttribute(PDIGEST_CTIME) && poolBookID && progStorage.peekBookInfo(poolBookID)?.writing) {
                menu.addItem({
                    label: tomatoI18n.管理素材池,
                    icon: "iconProgPoolManage",
                    click: () => { this.openManagePoolDialog(poolBookID); },
                });
            }
            // 阅读曲线 □4：右键「阅读推送…」（状态行+全动作集：不再推/每 N 天/再来一轮/
            // 推迟/转记忆卡/加入推送）。目标块=托管文档内右键时收编到文档卡（片/槽/摘抄
            // 整卡管理；item 级收编与整卡双计——□3 addToReadingCurve 备案的场景过滤）；
            // 未托管=右键块本身（单卡 opt-in，□3 语义保留）。菜单体 async 组配（独立
            // Menu，emitToPlugins 同步窗口只加壳项——await 后 addItem 迟到不进菜单实锤）。
            if (readCurveTakeover.get()) {
                const nodeID = (detail.element as HTMLElement | undefined)?.getAttribute?.("data-node-id") ?? "";
                const rootID = (detail.protyle as any)?.block?.rootID ?? "";
                const rootKeyed = !!(detail.protyle?.wysiwyg?.element as HTMLElement | undefined)?.getAttribute?.(READCARD_KEY);
                const target = rootKeyed && rootID ? rootID : nodeID;
                if (target) {
                    menu.addItem({
                        label: tomatoI18n.阅读推送,
                        icon: "iconRiffCard",
                        click: (_el: HTMLElement, ev: MouseEvent) => {
                            debugLog("readcurve.ui", `ctx menu block=${target} rootKeyed=${rootKeyed}`, "progressive");
                            void openReadCardMenu(target, {
                                clientX: ev?.clientX ?? 0,
                                clientY: ev?.clientY ?? 0,
                            });
                        },
                    });
                }
            }
        });
        // 文档树右键/行内 ⋯「加入渐进阅读」（bear 2026-09-08 拍板：恒显不设开关；多选/笔记本行
        // 不给）。type="doc" 单文档行——右键与行内 ⋯ 内核同走 initFileMenu，一个分支覆盖两面；
        // 多选 docs/文档笔记本混合 items/笔记本 notebook(s) 天然排除。传准确 items[0].id 加书，
        // 根治无参通道身份漂移（□8 P2-3 备案的激活页签劫持面）；已在读守卫由 AddBook 弹窗
        // onMount 知情警告承担（重加书=重置进度+重分片，合法路径），入口不重复设防
        this.plugin.eventBus.on("open-menu-doctree", ({ detail }) => {
            if (detail.type !== "doc" || !detail.items?.[0]?.id) return;
            const docID = detail.items[0].id;
            detail.menu?.addItem({
                icon: Progressive添加当前文档到渐进阅读分片模式.icon,
                label: tomatoI18n.加入渐进阅读,
                click: () => {
                    debugLog("prog.doctree", `add-book via doctree menu doc=${docID}`, "progressive");
                    void this.addProgressiveReadingWithLock(docID);
                },
            });
            // □2 物理分卷：巨文档粗切工具（低频，刀 icon=剪刀）；切完自动拉起 AddBook
            detail.menu?.addItem({
                icon: "iconProgScissors",
                label: tomatoI18n.物理分卷,
                click: () => {
                    debugLog("prog.doctree", `split-vols via doctree menu doc=${docID}`, "progressive");
                    void this.splitVolsDialog(docID);
                },
            });
        });
        // 阅读曲线接管（1530 期1，实验默认关）：开关边缘/频率档/定时兜底接线 + onload
        // 只对账拉平不建片（开关一开凭空多 N 个预建片=惊扰，建片延迟到首个非 onload 触发点）
        initReadCurveTriggers();
        // takeover 关闭顺手撤复习界面注入物（review P2-7）；接线在本侧静态 import
        // 两模块——readCurve.ts 若动态 import CardUI 会重排 CJS 打包图致 svelte
        // internal 循环初始化崩（EFFECT_TRANSPARENT of undefined，插件 run 不加载）
        readCurveTakeover.subscribe(v => { if (!v) disposeRevCardUI(); });
        // 互转通道命令位（1530 期3 预留：window 挂点供 e2e/外挂脚本，无 UI；
        // reload 重挂容忍重注册〔window.eval 无模块缓存，挂点整对象重赋值〕）
        (window as any).__progReadCurve = {
            add: addToReadingCurve,
            remove: removeFromReadingCurve,
            sweep: (reason = "manual") => void sweepReadCurve(reason),
        };
        void sweepReadCurve("onload", { noCreate: true });
        events.addListener("ProgressiveBox", (eventType, detail: Protyle) => {
            if (eventType == EventType.loaded_protyle_static || eventType == EventType.loaded_protyle_dynamic || eventType == EventType.click_editorcontent || eventType == EventType.switch_protyle) {
                // 阅读曲线期2：阅读卡换皮「下一张」主钮+徽标——四事件全挂（翻卡=loaded
                // /switch、点击=click；复习容器判定在 revCardOnAppear 内做，普通文档自短路）
                revCardOnAppear((detail.protyle as any)?.element as HTMLElement | undefined);
                // 阅读曲线：官方复习界面翻卡触发对账（容器判定=CardBox 同款 card__block；
                // 普通编辑器点击不触发——全量巡查太重。纯键盘空格流无此事件=期2 主钮补）
                if (eventType == EventType.click_editorcontent) {
                    const el = (detail.protyle as any)?.element as HTMLElement | undefined;
                    if (el?.classList?.contains("card__block")) {
                        void sweepReadCurve("cardflip");
                    }
                }
                // revtrace 修订痕迹（□8 修）：出场链独立挂点，解耦浮条四态链——普通文档
                // （自由态未上岗）开新档/懒加载滚入新块同样要染（enrollment 基线门控自带
                // 防满屏，域外无特殊化）；浮条总开关关也不影响（revTraceEnabled 自管）。
                // 与 ProgressiveBtn 四态挂点幂等并存（那边另覆盖闪卡预览宿主）
                revTraceOnAppear(detail.protyle, detail.protyle?.block?.rootID ?? "").catch(() => { });
                void lockWithLease(constants.TryAddStarsLock, async () => {
                    const protyle: IProtyle = detail.protyle;
                    const welement = protyle?.wysiwyg?.element as HTMLElement;
                    const element = protyle?.element as HTMLElement;
                    if (!protyle || !welement || !element) return;
                    const nextDocID = protyle?.block?.rootID;
                    const { isPiece } = help.isProtylePiece(protyle);
                    if (nextDocID && isPiece) {
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
                void lockWithLease(constants.ProgressiveAddBtnListenersLock, async () => {
                    const protyle: IProtyle = detail.protyle;
                    if (!protyle) return;
                    const notebookId = protyle.notebookId;
                    const nextDocID = protyle?.block?.rootID;
                    const element = protyle?.wysiwyg?.element as HTMLElement;
                    if (element && nextDocID && notebookId) {
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
                void lockWithLease("ProgressiveBox 2025-07-16 10:33:20", async () => {
                    const protyle: IProtyle = detail.protyle;
                    if (!protyle) return;
                    const notebookId = protyle.notebookId;
                    const nextDocID = protyle?.block?.rootID;
                    const element = protyle?.wysiwyg?.element as HTMLElement;
                    if (element && nextDocID && notebookId) {
                        await progressiveBtnFloating(protyle, eventType == EventType.destroy_protyle);
                    }
                });
            }
        });
        this.initSelectionMLMobile();
    }

    /** □8 期4（2026-09-09）：移动端逐块多选三钮——复用 □9 升格的 SelectionML（向上/
     *  向下/取消最后一次，挂内核同款 protyle-wysiwyg--select 类，选完摘抄/制卡经
     *  collectSelectedBlocks 一级链直接读走）。移动端无浮条 hover 生态、触屏拖蓝难，
     *  三钮=选中工具的移动端输入法；桌面不挂（浮条 Ctrl 多选已在）。分叉判定用
     *  getFrontend 勿 events.isMobile（2026-08-25 浮条 bundle 模块序坑纪律）。
     *  data-type 复用 tomato-prev/next/cancel：与 tomato 同装时 addCustomButton 幂等
     *  去重（先挂者赢），labels 同源 tomatoI18n——三插件同一套钮同一套文案。 */
    private initSelectionMLMobile() {
        const frontend = getFrontend();
        if (frontend !== "mobile" && frontend !== "browser-mobile") return;
        events.addListener("prog-selml □8期4", (eventType, detail: Protyle) => {
            const protyle: IProtyle = detail?.protyle;
            if (!protyle) return;
            if (eventType == EventType.destroy_protyle) {
                const wysiwyg = protyle.wysiwyg?.element;
                if (wysiwyg) disposeSelectionML(wysiwyg);
                return;
            }
            if (eventType == EventType.loaded_protyle_static || eventType == EventType.loaded_protyle_dynamic
                || eventType == EventType.click_editorcontent || eventType == EventType.switch_protyle) {
                // 设置关=不再挂钮（destroy 清残留分支不受门控；已挂钮随切文档/reload 退场）
                if (!mobileSelectBtns.get()) return;
                void lockWithLease("prog selml lock", async () => {
                    // destroy 后 debounce 尾巴可能在 detached protyle 上复活实例+挂按钮（□9 P2-3 同款守卫）
                    if (!protyle.element?.isConnected) return;
                    const wysiwyg = protyle.wysiwyg?.element as HTMLElement;
                    if (!wysiwyg) return;
                    // seed 与 tomato selectedDivsSync 对齐：活选区优先/toolbar.range 回退
                    // （resolveSeedRange）+光标块兜底（顶层流语义=共享函数默认，点块后立即可向上连选）
                    const sel = document.getSelection();
                    const live = sel?.rangeCount ? sel.getRangeAt(0) : undefined;
                    const range = resolveSeedRange(wysiwyg, live, protyle.toolbar?.range);
                    const s = getSelectionML(wysiwyg, () => collectSelectedBlocks(wysiwyg, { range, cursorEl: getCursorElement() }).blocks);
                    debugLog("selml", `evt=${eventType} root=${protyle.block?.rootID ?? ""} trace=${s.state.trace.length}`, "progressive");
                    addSelectionMLButtons(protyle, wysiwyg, {
                        prev: tomatoI18n.向上选择,
                        next: tomatoI18n.向下选择,
                        cancel: tomatoI18n.取消最后一次选择的内容,
                    });
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
        return lockWithLease(constants.TryAddStarsLock + "tryAddRefAttr", async () => {
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

    async addProgressiveReadingWithLock(bookID?: string, preselectDir = false): Promise<void> {
        await this.withProgLock(constants.AddProgressiveReadingLock, async () => {
            await this.addProgressiveReading(bookID, preselectDir);
            await utils.sleep(constants.IndexTime2Wait);
        });
    }

    private async addProgressiveReading(bookID: string = "", preselectDir = false) {
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
        await this.addProgressiveReadingDialog(bookID, row["content"], preselectDir);
    }

    private async addProgressiveReadingDialog(bookID: string, bookName: string, preselectDir = false) {
        showDialog((target, dm) => {
            return mount(AddBookSvelte, {
                target,
                props: {
                    bookID, bookName, dm, preselectDir,
                }
            });
        }, {
            title: bookName,
            width: events.isMobile ? "90vw" : undefined,
            // 矮视口自适应（vision P1，tomato 设置战役同款先例）：桌面默认高 700px 在
            // <700px 视口下 footer 溢出画面，min() 钳回视口内、弹窗体内部滚动
            // vision P1：700px 初始视口截断切分设置卡（spark/stat 已紧凑化，760 补齐）
            height: events.isMobile ? "180vw" : "min(760px, 92vh)",
        });
    }

    // □2 物理分卷 Dialog（文档树右键/命令面板/AddBook 巨书建议条三入口共用）
    async splitVolsDialog(docID: string) {
        const row = await siyuan.sqlOne(`select content from blocks where type='d' and id='${docID}'`);
        const docName = row?.["content"] ?? "";
        showDialog((target, dm) => {
            return mount(SplitVolsDialogSvelte, {
                target,
                props: { docID, dm },
            });
        }, {
            title: `${tomatoI18n.物理分卷}·${docName}`,
            width: events.isMobile ? "90vw" : undefined,
            height: events.isMobile ? "180vw" : "min(620px, 92vh)",
        });
    }

    async splitVolsDialogFromActive() {
        const docID = getActiveDocID() || events.docID;
        if (!docID) {
            await siyuan.pushMsg(tomatoI18n.请先打开一个文档);
            return;
        }
        await this.splitVolsDialog(docID);
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
                    // □7：出片链对空片会跳点前进（books.json point 已≠hit.point）——
                    // 该片永远不建，60 轮轮询必然空烧后弹误导的「请等待索引建立」，
                    // point 漂移即跳过轮询（用户已落在跳过后的可读片上）
                    if ((await progStorage.booksInfo(bookID))?.point === hit.point) {
                        // □3：1200ms 固定时延不等片真就绪（删片重建链索引追赶远超
                        // 1.2s），改轮询 findPieceDoc 命中后再查副本跳块（不阻塞菜单回调）。
                        // seq latest-wins（review P2-2）：重入时旧轮询晚命中不得拉走用户
                        this.jumpToPieceBlockWhenReady(bookID, hit.point, hit.id, ++this.jumpSeq)
                            .catch(() => siyuan.pushMsg(tomatoI18n.请等待索引建立));
                    }
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

    /** □1 锁治理：读片链持锁入口（加书/出片/跳片删片/重插）共用的租约包装。
     *  unavailable=上一操作持锁中（对齐真实语义的提示，替代旧「请等待索引建立 [n]」）；
     *  lease-expired=锁内链路 hang 触发租约放锁（操作已弃置，提示可重试）。
     *  返回结果供内部调用方门控结算动作（review P2-1）；公开入口一律用 void 包装版 */
    private async withProgLock(name: string, body: () => Promise<unknown>): Promise<LockLeaseResult> {
        const r = await lockWithLease(name, body);
        if (r === "unavailable") await siyuan.pushMsg(tomatoI18n.上一操作仍在进行中);
        else if (r === "lease-expired") await siyuan.pushMsg(tomatoI18n.操作超时未完成);
        return r;
    }

    /** 内层结果版：InLock 各分支据此决定关页签/闪卡结算——租约孤儿窗口里内层没跑完
     *  就不关用户当前页签（review P2-1）。对外签名仍是 void 的 startToLearnWithLock */
    private async startToLearnLeased(bookID = "", isRand = false): Promise<LockLeaseResult> {
        return this.withProgLock(constants.StartToLearnLock, async () => {
            // □2 文案梳理：删「正在为您打开文档片段」——每次出片必弹但结果自可见（片
            // 页签即开），异常慢路径已由重试首轮的「分片索引建立中」覆盖
            // □3 review P1：false=createPiece 落空（索引追赶窗口，可重试）；undefined=各
            // 终态（已带对症提示，不重试不叠弹）。重试间隔防连发，烧完仍 false 才弹失效。
            // □7："skipped"=空片跳点（point 已前进，下一轮新 point 续建）——自带跳过
            // 提示、不弹「分片索引建立中」（非索引追赶）、重置计数不烧 30 轮预算（跳点
            // 每轮推进 point 有限步必然终结，连环空片书也走不完索引长度）。
            // □1：重试首轮补一次中间反馈（原 ~15s 全静默）；updateBookInfoTime 挪出重试
            // 路径——成功出片由 startToLearn 成功点/fullfilContent 落 time，失败重试不再
            // 每 500ms 刷 books.json（触发内核 dataChanges 广播风暴，事故实锤 3 分钟每秒 2 条）
            let ok: boolean | undefined | "skipped" = false;
            let i = 0;
            while ((ok = await this.startToLearn(bookID, isRand)) === false || ok === "skipped") {
                if (ok === "skipped") {
                    i = 0;
                } else if (i === 0) {
                    await siyuan.pushMsg(tomatoI18n.分片索引建立中);
                }
                if (i++ > 30) break;
                await utils.sleep(500);
            }
            if (ok === false) await siyuan.pushMsg(tomatoI18n.该分片内容已失效);
            await utils.sleep(constants.IndexTime2Wait);
        });
    }

    async startToLearnWithLock(bookID = "", isRand = false): Promise<void> {
        // digestpool：continue/swap 池钮点击链留痕（e2e 断言查 Loki：digest 态 continue 的
        // bookID 应=源书；空=滚筒轮转）
        debugLog("floatbar", `startToLearn book=${bookID || "(滚筒)"} rand=${isRand}`, "progressive");
        await this.startToLearnLeased(bookID, isRand);
        // 阅读曲线：推片后该书投影即时刷新（锁已释放，巡查避让判定不撞自己持有的
        // StartToLearnLock——这是它必须放在锁外 fire 的原因）
        void sweepReadCurve("dispatch");
    }

    /** □5 写作火苗点击=直达当前写作书的写作现场。书的选择与火苗数据同源
     *  （pickWritingFlameBook：滚筒序第一本有未定稿槽的写作书，全完稿回落序首），
     *  打开走 startToLearnWithLock 指定书路径——与滚筒轮转/书卡续读同一条调度链
     *  （片选择/状态判定/计数同权），写作侧只多一步「限定写作书集」。 */
    async openWritingFlameTarget() {
        try {
            const hit = await pickWritingFlameBook();
            if (!hit) {
                // 火苗渲染由 writingFlameState 门控，正常点不到 null；此处=书集在刷新
                // 间隙被清空（如刚归档最后一本）的兜底，给反馈不静默（review P1-1）
                debugLog("wflame", "open skipped: no writing book", "progressive");
                await siyuan.pushMsg(tomatoI18n.暂无可用写作书, 2500);
                return;
            }
            debugLog("wflame", `open book=${hit.bookName}(${hit.bookID}) target=${hit.target ? `point#${hit.target.point}` : "none"}`, "progressive");
            await this.startToLearnWithLock(hit.bookID);
        } catch (e) {
            // SQL 抖动等异常兜底：onclick 的 promise 无人接，不包=unhandled rejection
            console.error("openWritingFlameTarget failed", e);
            await siyuan.pushMsg(tomatoI18n.请稍后再试, 2500);
        }
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
        // 期3 手动分片书：无自动片，统一拦截（Dock 书卡/管理页/浮条 ▶ 全入口）。manualbook □3
        //  起：片=摘抄，点击直达最早一篇摘抄（鸟 09-08 17:41：手动书无续读指针，原 flat[0]
        //  =ctime 最新的「续读」只是静态近似；自动书从第一片推进，跳最早才语义统一）；
        //  0 片回落原行为（开原书+「请直接摘抄」引导）。无参滚筒路径不会选中手动书（空索引恒
        //  finished），无需再判
        if (bookInfo.manualMode) {
            const tree = await queryDigestTree(bookID);
            if (tree.flat.length > 0) {
                // flat 经 byCtimeDesc 全局降序（digestUtils queryDigestTree 尾部 flat.sort），
                // 末位即全局 ctime 最早；DigestAllDialog 同源此序
                const earliest = tree.flat.at(-1)!;
                await OpenSyFile2(this.plugin, earliest.id);
                return;
            }
            await siyuan.pushMsg(tomatoI18n.手动分片书请直接摘抄);
            await this.openOriginBook(bookID);
            return;
        }
        // 期A 写作书调度（素材优先、清空转槽，设计共识 memory material-parallel-design）：
        // 素材池（digest-书名 夹）有未读素材→推最老未读，推过即打 🔨 锤（ctime 锤前缀=
        // 手动书完成态同款格式，读侧 queryDigestTree/DigestAllDialog 已弱化显示），
        // 素材对标分片计数同权（鸟 09-08 模型）；池清空→activePoint 槽（期2 原行为）；
        // 两者皆空（0 槽纯收集书空池/全定稿）=终态提示（开书给建槽/摘抄现场）。
        // 索引恒空不走 createPiece 链
        if (bookInfo.writing) {
            const flat = (await queryDigestTree(bookID)).flat;
            const pieces = await fetchWritingPieces(bookID);
            const dispatch = pickWritingDispatch(flat, pieces, bookInfo.activePoint);
            if (!dispatch) {
                // 终态分态（review P2-5）：0 槽纯收集书池空=先摘素材；有槽全定稿=从槽开始
                await siyuan.pushMsg(
                    pieces.length === 0 ? tomatoI18n.纯收集书还没有素材 : tomatoI18n.写作书请从槽位开始, 2500);
                await this.openOriginBook(bookID);
                return;
            }
            if (dispatch.kind === "material") {
                // ctime 节点值=「bookID#ct」整串（queryDigestTree 原样剥 🔨 前缀），锤=前插 🔨#
                // 即得 🔨#bookID#ct（doneCtime 循环自洽；单测用例同形态锁行为）。
                // 锤后复核：setBlockAttrs 端点 data 恒 null（返回值不可判成败——首版判 null
                // 100% 误判触发重试环，09-09 e2e 实锤），改读 IAL 验真；文档已被删=复核不中
                // → false 交 WithLock 重试环重跑分派（已删素材自然消失改推下条），防死开+幻计数
                const hammer = `🔨#${dispatch.ctime}`;
                await siyuan.setBlockAttrs(dispatch.id, { [PDIGEST_CTIME]: hammer } as any);
                const attrsAfter = (await siyuan.getBlockAttrs(dispatch.id)) ?? {};
                const after = attrsAfter[PDIGEST_CTIME] ?? "";
                if (after !== hammer) {
                    debugLog("wdispatch", `hammer miss doc=${dispatch.id} after=${after}`, "progressive");
                    return false;
                }
                // □2 锤后挂曲线（编辑器读完=第 1 见已消耗）：3 天后 ×2 曲线重现，5 轮毕业。
                // 已有键（复习链先建了首推卡 x#0 在弹）不动——卡链自管，此处只是预读；
                // 存量已锤无键（v3.7.0 消费过）不追溯（老数据不动）。键读复用锤复核的
                // attrs（review P2-3：省一次 getBlockAttrs 往返）
                if (readCurveTakeover.get() && readCurveMaterial.get() && !String(attrsAfter[READCARD_KEY] ?? "")) {
                    const cad = readCurveCadMaterial.get();
                    await buildReadingCard(dispatch.id, plusDays(new Date(), cadenceDays(cad)), cadenceOpts(cad) ?? { mode: "grow", count: 1 });
                }
                debugLog("wdispatch", `material book=${bookID} doc=${dispatch.id} ct=${dispatch.ctime}`, "progressive");
                events.setDocID(dispatch.id);
                await OpenSyFile2(this.plugin, dispatch.id);
                await this.markReadSafe(bookID);
                return true;
            }
            await progStorage.setActivePoint(bookID, dispatch.point);
            events.setDocID(dispatch.docID);
            await OpenSyFile2(this.plugin, dispatch.docID);
            // 计数同权：轮到写作书开片=今日阅读 +1（与阅读书翻片同 quota 池）。补传
            // slotPoint 锚（1530 期1 配套修正）：官方复习评分回写走同锚——双入口同锚
            // 互斥零双计，同日重复开同 slot 不再重复计（旧语义与阅读书不对称，顺手修正）
            await this.markReadSafe(bookID, dispatch.point);
            return true;
        }
        // □1 目录书：出场前校验卷表新鲜度（卷增删/重排→按卷 id 重组索引+point 映射；
        // 一次一发 listDocsByPath 磁盘直查。重组会改 point，须在下面读 point 之前完成；
        // review P0-1：也必须在 loadBookIndexIfNeeded 之前——重组换掉缓存数组，先取的
        // 局部引用持旧序=createPiece 内容与 point 张冠李戴；ensure 内部 deps.loadIndex
        // 自会加载，未重组零额外开销。校验失败不阻断出场（按盘上索引继续，review P2-5）
        if (bookInfo.dirMode) {
            try {
                await ensureVolTableFresh(bookID, volRebuildDeps());
            } catch (e) {
                debugLog("volbook", `ensure failed book=${bookID}: ${e}`, "progressive");
            }
        }
        const bookIndex = await progStorage.loadBookIndexIfNeeded(bookInfo.bookID);
        let point = (await progStorage.booksInfo(bookInfo.bookID)).point;
        if (isRand) point = utils.getRandInt0tox(bookIndex.length); // 随机创建书籍的某个分片，适用于单词集合。
        // □1：updateBookInfoTime 原在此处（startToLearn 每次重试都执行——books.json
        // 写盘风暴+dataChanges 广播）。挪除：成功出片由 fullfilContent 落 time，
        // 失败重试/终态路径不再记活跃时间
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
            // □7 空片自愈：片永久不可建（存活块全无内容=空段落占片槽；或全数悬空=
            // 书阅读中途被编辑、索引残留死 ID，2026-09-09 主实例两形态同症状：重试
            // 30 轮烧完弹「内容已失效」，point 卡死书砖住）≠ 索引未就绪——跳点前进
            // （books.json 每轮重读 point，重试循环下一轮自动在新 point 续建）；跳到
            // 索引尾则下一轮走「已经是最后一页」终态。缺行者用内核实时通道判死活：
            // SQL 行缺失在索引追赶窗口≠块已删，checkBlockExist 不吃索引延迟（P1-4）。
            // 随机模式不跳（P1-1）：gotoBlock 会污染顺序断点 + 每轮重掷使跳点无界，
            // 重试=重新摇号已有界。已知边缘（review P2-6 备案）：deleteAndBack 的
            // 目标片恰为空片时跳点向前弹回当前片，net=「返回」no-op——无挂死无数据
            // 损坏，优于修复前的卡死，不为极罕见场景传方向上下文。
            const pBlocks = bookIndex[point] ?? [];
            if (!isRand && pBlocks.length > 0) {
                const rows = await siyuan.getRows(pBlocks, "id,markdown");
                if (!rows.some(r => r.markdown)) {
                    const missing = pBlocks.filter(id => !rows.some(r => r.id === id));
                    const dead = await Promise.all(missing.map(id =>
                        siyuan.checkBlockExist(id).then(exist => !exist).catch(() => false)));
                    if (pieceUnbuildable(rows, dead)) {
                        await siyuan.pushMsg(tomatoI18n.分片无内容已跳过(`[${String(point).padStart(5, "0")}]`));
                        await progStorage.gotoBlock(bookID, point + 1);
                        return "skipped";
                    }
                }
            }
            // 可重试失败：返回 false 交 startToLearnWithLock 重试（□3 review P1：原裸
            // return 使 while 重试循环死代码，索引追赶窗口一次机会都不给；终态提示上抛
            // 由 WithLock 统一弹防 30 连发）
            return false;
        }
        if (openPiece && this.settings.openCardsOnOpenPiece) {
            const landing = cardLanding.get();
            if (landing === "dailynote") {
                // 制卡落点跟随（三档化 2026-09-07）：dailynote 档打开当天日记（createDailyNote
                // 幂等；笔记本解析与制卡侧 FlashBox.doInsertCard 同款）
                const nb = storeNoteBox_selectedNotebook.getOr() || getNotebookFirstOne()?.id;
                if (nb) {
                    const { id: dailyDocID } = await siyuan.createDailyNote(nb);
                    OpenSyFile2(this.plugin, dailyDocID, windowOpenStyle.get() as any);
                }
            } else if (landing !== "cards") {
                // □3 制卡统一归置：新卡落当日 dailycard 文档，「开片同步开卡」跟随打开它
                // （语义保持：边读边看新卡汇合；cards 档才回落旧 cards 夹）。
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
        // □1 P2-2：成功出片记活跃时间（新书复用/滚筒命中已存在片时 createPiece 早退
        // 不进 fullfilContent，books.json time 断刷会丢 bookStatus 的 2min 新书保护期）。
        // 成功点单次写：重试失败轮不触发，无风暴回归
        await progStorage.updateBookInfoTime(bookID);
        return true;
    }

    async htmlBlockReadNextPeice(bookID: string, noteID: string, cbType: HtmlCBType, point: number): Promise<void> {
        await this.withProgLock(constants.HtmlBlockReadNextPeiceLock, async () => {
            await this.htmlBlockReadNextPeiceInLock(bookID, noteID, cbType, point);
            await utils.sleep(constants.IndexTime2Wait);
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
            case HtmlCBType.previous: {
                await progStorage.gotoBlock(bookID, point - 1);
                const r = await this.startToLearnLeased(bookID);
                if (r === "done") {
                    this.closePeices(bookID);
                    showCardAnswer();
                    pressSkip()
                }
                break;
            }
            case HtmlCBType.next: {
                await progStorage.gotoBlock(bookID, point + 1);
                // routemap □1 计数解耦：读到新片即前进——翻页不删片与下片删同权计数
                // （片可留作草稿，point+1 为去重锚判新高的新 point）
                await this.markReadSafe(bookID, point + 1);
                const r = await this.startToLearnLeased(bookID);
                if (r === "done") {
                    this.closePeices(bookID);
                    showCardAnswer();
                    pressSkip()
                }
                break;
            }
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
                    const r = await this.startToLearnLeased(bookID);
                    siyuan.removeDocByID(noteID);
                    if (r === "done") {
                        this.closePeices(bookID);
                        showCardAnswer();
                        pressSkip()
                    }
                });
                break;
            case HtmlCBType.deleteAndNext: {
                // v5「读完即删」：分片是一次性餐具（原文档还在、误删可重分片），主循环高频动作不再 confirm
                await siyuan.removeRiffCards([noteID]);
                await progStorage.gotoBlock(bookID, point + 1);
                // routemap □1：已读=读到新片那一刻（翻页/删片同权；锚防回看后再删重复计）
                await this.markReadSafe(bookID, point + 1);
                const r = await this.startToLearnLeased(bookID);
                siyuan.removeDocByID(noteID);
                if (r === "done") {
                    this.closePeices(bookID);
                    showCardAnswer();
                    pressSkip()
                }
                break;
            }
            case HtmlCBType.nextBook: {
                const r = await this.startToLearnLeased();
                if (r === "done") {
                    showCardAnswer();
                    pressSkip()
                }
                break;
            }
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
    async refillPiece(bookID: string, noteID: string, point: number, stype: AsList | "no" | null): Promise<void> {
        await this.withProgLock(constants.HtmlBlockReadNextPeiceLock, async () => {
            const index = await progStorage.loadBookIndexIfNeeded(bookID);
            const piecePre = index[point - 1] ?? [];
            const rows = await siyuan.getRows(index[point] ?? [], "id,markdown");
            const piece = rows.map(r => r.id);
            if (piece.length === 0) {
                await siyuan.pushMsg(tomatoI18n.该分片内容已失效);
                return;
            }
            // □7 空片前置拦截（P1-3 口径=存活行无一可插）：混合悬空+空片时上面的
            // id 守卫过、幸存块全无 markdown——clearAll 后 fullfilContent 滤空插不
            // 进任何内容，终态=确认过、清空了、片废了（clearAll 不可逆）。fail-closed：
            // SQL markdown 列延迟最多误拦一次可重试，绝不误放行不可逆操作
            if (pieceRowsNoneInsertable(rows)) {
                await siyuan.pushMsg(tomatoI18n.该分片没有可重插的内容);
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
            // revtrace「拆装不算修订」：重插=清空重建，新块 updated=插入时刻会整片
            // 误报「刚改」——推基线到操作后（新块≤基线全无色）+作废 updated 快照缓存
            await progStorage.bumpRevTraceBaseline(noteID);
            invalidateRevTrace(noteID);
            await utils.sleep(constants.IndexTime2Wait);
        });
    }

    /** 已读记账；附属动作失败只降级不阻断开片。routemap □1：point=前进后的新 point，
     * 传给 roller 当日去重锚（回看后再前进到旧高度不重复计） */
    private async markReadSafe(bookID: string, point?: number) {
        try {
            await rollerMarkRead(bookID, point);
            invalidateTailToday(); // □2 片尾卡「今日 n/q」胶囊即时刷新（review P1-3：TTL 内恒旧值）
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

    /** 附属卡（三态公共组）：doc deck 挂 digest-书名 夹。bookcards □2 起为清单浮层
     *  的兜底快道（整夹一键复习钮）——原直开行为平移于此 */
    async openBookCards(bookID: string) {
        const dirID = await this.findDigestDir(bookID);
        if (!dirID) {
            await siyuan.pushMsg(tomatoI18n.本书还没有摘抄);
            return;
        }
        openTab({ app: this.plugin.app, card: { type: "doc", id: dirID } });
    }

    /** bookcards □2：单篇摘抄复习（清单行点击）——openTab card doc 换 id 即单篇，
     *  与整夹同通道（官方 tree 复习按文档子树，单篇子树=它自己的卡） */
    openDocReview(docID: string) {
        openTab({ app: this.plugin.app, card: { type: "doc", id: docID } });
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
            // confirm 落定后即时通知（□5 review P1-1：原本只靠 30s 刷新兜底，归档最后一本
            // 写作书后写作火苗残留旧书 ≤30s，期间点击静默无反应）
            notifyFleetChanged();
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
            // min() 自适应：定高 800px 在矮视口裁掉顶栏（✍/♻ 入口不可达，vision P1-2）
            height: events.isMobile ? "180vw" : "min(800px, 92vh)",
        });
    }

    /** 期1 写作书：新建弹窗（书名+落点笔记本+可选大纲+工作流程向导），入口=舰队总览/管理页。
     *  高度随视口自适应（vision P1-2：定高 700px 在矮视口上下裁顶，标题不可见）；
     *  流程卡入驻后 880px 桌面常规一屏，矮视口仍由 92vh 收口+内容滚动兜底 */
    openAddWritingBookDialog() {
        showDialog((target, dm) => {
            return mount(AddWritingBookSvelte, {
                target,
                props: { dm },
            });
        }, {
            title: tomatoI18n.新建写作书,
            width: events.isMobile ? "90vw" : undefined,
            height: events.isMobile ? "180vw" : "min(880px, 92vh)",
        });
    }

    /** 期3 拉式素材选择器：全库摘抄池按源书分组，点击=整条摘抄转实尾插进当前片 */
    openMaterialPicker(pieceDocID: string, bookID: string) {
        showDialog((target, dm) => {
            return mount(MaterialPickerSvelte, {
                target,
                props: { dm, pieceDocID, bookID },
            });
        }, {
            title: tomatoI18n.插入素材,
            width: events.isMobile ? "90vw" : undefined,
            height: events.isMobile ? "180vw" : "min(700px, 88vh)",
        });
    }

    /** matfeed □2 管理素材池直开通道（manage 态挂载单一事实源）：浮条平铺区格/槽片
     *  右键/OriginDigestPopover 底部旧入口三面共用。原浮条内联版（openDigestAllDialog
     *  的 manage 支路）随本通道收编退役。onSend 链=期D 原样（listWritingSlotTargets
     *  空目标 toast + 锚下方弹批量槽菜单）。bookID 开菜单前由调用方捕获（切页签漂移
     *  防护同 openSlotMenuForDigest 的 P1-2 纪律） */
    openManagePoolDialog(bookID: string) {
        if (!bookID) return;
        showDialog((target, dm) => {
            return mount(DigestAllDialogSvelte, {
                target,
                props: {
                    dm,
                    bookID,
                    freeDoc: false,
                    manage: true,
                    onJumpDoc: (id: string) => {
                        dm.destroyBy();
                        void this.jumpTo(id);
                    },
                    onSend: async (ids: string[], mode: "copy" | "move", anchor: HTMLElement) => {
                        const targets = await listWritingSlotTargets();
                        if (targets.length === 0) {
                            await siyuan.pushMsg(tomatoI18n.还没有可入槽的写作书, 2500);
                            return null;
                        }
                        const r = anchor.getBoundingClientRect();
                        return await this.openBatchSlotMenu(Math.round(r.left), Math.round(r.bottom + 6), targets, ids, mode);
                    },
                },
            });
        }, {
            title: tomatoI18n.管理素材池,
            width: events.isMobile ? "90vw" : undefined,
            height: events.isMobile ? "180vw" : "min(700px, 90vh)",
        });
    }

    /** 期4 拆为新片：选中块已在调用前捕获（弹窗聚焦后编辑器选区不可靠） */
    openSplitPieceDialog(pieceDocID: string, bookID: string, blockIDs: string[]) {
        showDialog((target, dm) => {
            return mount(SplitPieceDialogSvelte, {
                target,
                props: { dm, pieceDocID, bookID, blockIDs },
            });
        }, {
            title: tomatoI18n.拆为新片,
            width: events.isMobile ? "90vw" : "460px",
            height: "auto", // 单字段弹窗内容自适应（showDialog 默认 700px 定高会撑出大片空白）
        });
    }

    /** 期D 新建空槽（管理页写作书卡）：槽名小弹窗（SplitPieceDialog 同形态），
     *  appendEmptyPiece 书尾建片；成功 notifyFleetChanged 槽数 +1 即时刷新 */
    openAppendSlotDialog(bookID: string) {
        showDialog((target, dm) => {
            return mount(AppendSlotDialogSvelte, {
                target,
                props: { dm, bookID },
            });
        }, {
            title: tomatoI18n.新建槽,
            width: events.isMobile ? "90vw" : "460px",
            height: "auto",
        });
    }

    /** 期D 池管理批量发送菜单（DigestAllDialog manage 模式「复制入槽/移动入槽」）：
     *  两级书→槽同 openSlotMenuCommon 形态（皮肤/让路共用）。点槽后循环 digestIDs
     *  逐篇执行——单篇失败不阻断（失败计数续跑，源未空的篇目留在池里数据无损）；
     *  汇总 {ok, skipped, failed, movedIds} 交 Dialog（movedIds=move 成功删除源的
     *  篇目，Dialog 按它精准剔除列表行——skipped/failed 篇源还在池里不能剔，
     *  reasoning P1-1）。用户关菜单不点=resolve(null)（Dialog 保持选择集不动）。
     *  Mode 由调用方确认（移动须先 confirm） */
    openBatchSlotMenu(x: number, y: number, targets: WritingSlotTarget[],
        digestIDs: string[], mode: "copy" | "move"): Promise<{ ok: number; skipped: number; failed: number; movedIds: string[] } | null> {
        const yielded = yieldFloatbarForMenu();
        let settle: (s: { ok: number; skipped: number; failed: number; movedIds: string[] } | null) => void;
        const done = new Promise<{ ok: number; skipped: number; failed: number; movedIds: string[] } | null>(r => { settle = r; });
        // closeCB null 结算竞态双保险（reasoning 复核内核 Menu.ts：点项路径=先同步调
        // click 再 menu.remove()，closeCB 的 setTimeout 在 click 同步段之后才创建）。
        // 胜负手不是「closeCB vs click」而是「closeCB 的同步 settle vs click 循环的
        // async 尾」——click 同步段置 settledByClick（早于定时器触发），closeCB 延迟
        // 结算时被标志压住：纯关闭（外点/Esc 无 click）照常 resolve null，点项下
        // summary 不被竞态 null 冻结（循环多 await，纯时序推迟必输——勿据「click 先
        // 于 close」简化掉标志位）
        let settledByClick = false;
        const menu = new (Menu as any)("progBatchSlotMenu", () => {
            restoreFloatbarAfterMenu(yielded);
            setTimeout(() => { if (!settledByClick) settle(null); }, 0);
        }, true) as Menu;
        menu.element.classList.add("prog-slot-menu");
        for (const t of targets) {
            menu.addItem({
                label: escapeHtml(t.name),
                submenu: t.slots.map(s => ({
                    label: escapeHtml(s.title),
                    click: async () => {
                        // Menu click 自带兜底纪律（openSlotMenuCommon 同款：内核不接 promise）
                        settledByClick = true;
                        try {
                            const summary = { ok: 0, skipped: 0, failed: 0, movedIds: [] as string[] };
                            for (const id of digestIDs) {
                                try {
                                    const n = mode === "copy"
                                        ? await insertDigestIntoPiece(s.docID, t.bookID, id)
                                        : await moveDigestIntoPiece(s.docID, t.bookID, id);
                                    if (n > 0) {
                                        summary.ok++;
                                        if (mode === "move") summary.movedIds.push(id);
                                    } else {
                                        summary.skipped++;
                                    }
                                } catch (e) {
                                    summary.failed++;
                                    console.error("batch slot send failed", id, e);
                                }
                            }
                            settle(summary);
                            await siyuan.pushMsg(tomatoI18n.批量入槽汇总(summary.ok, summary.skipped, summary.failed), 2500);
                            notifyFleetChanged(); // activePoint 可能迁移（markPieceActive）
                        } catch (e) {
                            console.error("batch slot menu failed", e);
                            await siyuan.pushMsg(tomatoI18n.插入素材失败请重试, 2500);
                            settle(null);
                        }
                    },
                })),
            });
        }
        menu.open({ x, y });
        return done;
    }

    /** □1 入槽菜单统一开口（浮条推式/直送两钮 + 直接入槽命令三入口共用）：两级
     *  书→未定稿槽。①视觉对齐浮条（鸟 09-08 反馈①）：挂 prog-slot-menu 类，样式
     *  在 index.scss（surface/6px/point-shadow，覆盖容器/菜单项/子菜单三处自画背景）；
     *  ②遮挡让路（反馈②）：弹前降层、closeCB 还原（ProgressiveBtn yieldFloatbarForMenu）。
     *  onPicked=入槽动作，返回入块数（toast 口径统一：已入槽/该摘抄无内容块）。
     *  □1 定向喂池：poolItems 传入时逐项排进每本书 submenu 首部（划词直喂「→ 收进
     *  素材池」单项/整篇搬运「移入素材池」+「复制入素材池」双项——progtail □1 从单档
     *  扩为数组）；无槽空书 submenu=池项序列 唯一目标（此前空行）。excludeBookID=
     *  digest 侧源书不列池项（移入=自搬 no-op、复制=同书重复，皆无意义；槽项照常——
     *  同书素材入自己书的槽是正当操作）。池动作 toast 口径=done(书名)，成功后
     *  notifyFleetChanged（池未读数变化，火苗/舰队即时刷新） */
    openSlotMenuCommon(x: number, y: number, targets: WritingSlotTarget[],
        onPicked: (slot: WritingSlotTarget["slots"][number], target: WritingSlotTarget) => Promise<number>,
        poolItems?: {
            label: string;
            icon?: string;
            done: (book: string) => string;
            run: (target: WritingSlotTarget) => Promise<number>;
        }[],
        excludeBookID?: string) {
        const yielded = yieldFloatbarForMenu();
        const menu = new (Menu as any)("progSlotMenu", () => restoreFloatbarAfterMenu(yielded), true) as Menu;
        menu.element.classList.add("prog-slot-menu");
        for (const t of targets) {
            // label=用户书名/槽名，Menu label 走 innerHTML 须转义（□12 存量补——
            // openBatchSlotMenu 期D 起已转义，此收口点补齐同款）
            const poolMenu = excludeBookID === t.bookID ? [] : (poolItems ?? []).map(p => ({
                label: escapeHtml(p.label),
                icon: p.icon,
                click: async () => {
                    // Menu click 兜底纪律同槽项（内核 Menu.ts 丢弃 async click 的 rejection）
                    try {
                        const n = await p.run(t);
                        if (n > 0) {
                            notifyFleetChanged();
                            await siyuan.pushMsg(p.done(t.name), 2500);
                        } else {
                            await siyuan.pushMsg(tomatoI18n.该摘抄无内容块, 2500);
                        }
                    } catch (e) {
                        console.error("pool feed failed", e);
                        await siyuan.pushMsg(tomatoI18n.插入素材失败请重试, 2500);
                    }
                },
            }));
            menu.addItem({
                label: escapeHtml(t.name),
                submenu: [...poolMenu, ...t.slots.map(s => ({
                    label: escapeHtml(s.title),
                    click: async () => {
                        // 思源 Menu click 既不 catch 也不接 promise——入槽动作自带
                        // 兜底（reasoning P1-1：内核 Menu.ts 丢弃 async click 的
                        // rejection，胶囊链失败=零 toast 静默）
                        try {
                            const n = await onPicked(s, t);
                            await siyuan.pushMsg(n > 0
                                ? tomatoI18n.已入槽本书该槽(n, t.name)
                                : tomatoI18n.该摘抄无内容块, 2500);
                        } catch (e) {
                            console.error("slot insert failed", e);
                            await siyuan.pushMsg(tomatoI18n.插入素材失败请重试, 2500);
                        }
                    },
                }))],
            });
        }
        menu.open({ x, y });
    }

    /** □1-③ 直接入槽命令体（⌥;）：激活编辑器选区直送进槽——与浮条直送钮同菜单，
     *  选区空时光标兜底块算数（直送宽松语义，宁顺勿拦）。锚点=选中首块正下方（命令
     *  通道无鼠标坐标），限定激活编辑器内查（P2-3：分屏/双页签同 id 块取全局第一份
     *  会锚到非激活屏），块不在 DOM（罕见）兜底屏幕中上。
     *  移动端备案（P2-2）：getActiveProtyle 恒 null → toast 拦截（宁 toast 勿错插，
     *  readThisPiece 式全局回退待移动端命令面板实测需要时再补） */
    private async directSlotCommand() {
        const protyle = getActiveProtyle();
        if (!protyle) {
            await siyuan.pushMsg(tomatoI18n.分片编辑器未就绪, 2500);
            return;
        }
        const { ids } = await events.selectedDivs(protyle);
        if (!ids || ids.length === 0) {
            await siyuan.pushMsg(tomatoI18n.请先选中要入槽的内容, 2500);
            return;
        }
        const captured = [...ids];
        const targets = await listWritingSlotTargets();
        if (targets.length === 0) {
            await siyuan.pushMsg(tomatoI18n.还没有可入槽的写作书, 2500);
            return;
        }
        const r = protyle.wysiwyg?.element?.querySelector(`[data-node-id="${captured[0]}"]`)?.getBoundingClientRect();
        this.openSlotMenuCommon(
            r ? Math.round(r.left) : Math.round(innerWidth / 2),
            r ? Math.round(r.bottom + 6) : Math.round(innerHeight / 3),
            targets,
            (s, t) => insertBlocksIntoPiece(s.docID, t.bookID, protyle.block?.rootID ?? "", captured),
            // □1 划词直喂：同菜单每本书首项「→ 收进素材池」（选中块建新素材文档进目标书池）
            [{
                label: tomatoI18n.收进素材池,
                icon: "iconProgMaterial",
                done: book => tomatoI18n.已收进素材池书名(book),
                run: t => feedBlocksToPool(t.bookID, protyle.block?.rootID ?? "", captured).then(id => id ? 1 : 0),
            }]);
    }
}

export const prog = new Progressive();

