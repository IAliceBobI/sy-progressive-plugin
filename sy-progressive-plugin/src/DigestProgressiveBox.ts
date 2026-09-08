import { IEventBusMap, IProtyle, Lute, Plugin } from "siyuan";
import { NewLute, siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import { ReviewKey, PdigestReviewKey, parseReview } from "./reviewQueue";
import { applyReviewAction, schedSubmenuItems } from "./reviewMenu";
import { events } from "../../sy-tomato-plugin/src/libs/Events";
import { SingleTab } from "../../sy-tomato-plugin/src/libs/docUtils";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import { DigestBuilder } from "./digestUtils";
import { blockIconMenu, digestmenu, wholeDigestMenu, reviewSchedMenu, revisitRhythmMenu } from "../../sy-tomato-plugin/src/libs/stores";
import { winHotkey } from "../../sy-tomato-plugin/src/libs/winHotkey";
import { verifyKeyProgressive } from "../../sy-tomato-plugin/src/libs/user";
import { kind, openDigestSubrank, show, toggleFreeFloat, digOpen, expanded, collapseFloatBar, freeFloatOff } from "./ProgressiveBtn";
import { cardModeFor, type DigestIntent } from "./digestCardMode";
import { PDIGEST_CTIME } from "../../sy-tomato-plugin/src/libs/gconst";

export const digest渐进阅读摘抄模式 = winHotkey("⌥z", "渐进阅读摘抄模式", "iconProgScissors", () => tomatoI18n.渐进阅读摘抄模式)
export const digest执行摘抄 = winHotkey("⇧⌥Z", "执行摘抄", "iconProgScissors", () => tomatoI18n.执行摘抄)
export const digest执行摘抄并断句 = winHotkey("⇧⌥X", "执行摘抄并断句", "iconSplitTB", () => tomatoI18n.执行摘抄并断句)
// 2026-09-02 用户反馈：留档/背诵此前只是浮条子排两按钮，快捷键通道唯一且行为跟 cardMode 设置
// 漂移；补两命令各带独立默认键，用户可在插件设置/思源键位设置里分别改。
// 2026-09-06 撞键清理换键：留档原 ⇧⌥P 撞官方 commandPanel、背诵原 ⌘⌥Z 撞 tomato GraphBox
// dock——当时定键只比对了全仓插件，官方 keymap 对照是静态注释态看不见（winHotkey 同款盲区）。
// 留档终键 ⌥⇧⌘P=原键同字母加 ⌘：⌥⇧ 字母段真满员（⌥⇧S 被 tomato AIBox「人工智能」占，
// 且 AIBox 开关关着的 keymap 扫描看不见——须靠 winHotkey globalThis 注册表告警兜底）
export const digest执行摘抄留档 = winHotkey("⌥⇧⌘P", "执行摘抄留档", "iconProgArchive", () => tomatoI18n.执行摘抄留档)
export const digest执行摘抄背诵 = winHotkey("⌥⌘8", "执行摘抄背诵", "iconProgRecite", () => tomatoI18n.执行摘抄背诵)

/**
 * □11 入口统一（设计共识 2）：⌥Z/右键/块图标「渐进阅读摘抄模式」全收——三态（含自由态）
 * 文档=聚焦浮条+展开摘抄子排；普通文档=自由态上岗+展开子排。三 tab Dialog、双击摘抄
 * 浮钮（FloatingButton 一族）、锁图标旁「执行摘抄/加书」两钮 2026-08-30 退役；快路径
 * 保留=选中+⇧⌥Z「执行摘抄」、右键「整篇摘抄」。
 */
class DigestProgressiveBox {
    plugin: Plugin;
    settings: TomatoSettings;
    lute: Lute;
    singleTab: SingleTab;

    /** ⌥Z 命令/右键/块图标三入口共用的改道出口。writebook-next □10（bear 拍板）：toggle 化——
     *  子排开着按=收起，且与 ✂ 状态栏钮同生命周期矩阵（free 无球=下班消失、三态收成球）；
     *  球态或子排未开=展开+开子排（打开摘抄模式）。「摘抄模式激活态」锚定 digOpen。 */
    private enterDigestMode() {
        if (show.get() && kind.get()) {
            if (digOpen.get() && expanded.get()) {
                if (kind.get() === "free") freeFloatOff();
                else collapseFloatBar();
            } else {
                openDigestSubrank();
            }
        } else {
            toggleFreeFloat(true);
        }
    }

    /** 「执行摘抄」族命令共用的回调工厂：intent 决定 cardMode 去向级覆盖
     *  （archive=强制不入卡 / recite=每摘必入卡 / auto=跟随书设置），与浮条
     *  子排「留档/背诵」按钮同构——不 saveCardMode 不改书全局。 */
    private execDigest(intent: DigestIntent, split = false) {
        return async (protyle: IProtyle) => {
            const s = await events.selectedDivs(protyle);
            const di = await initDi(s, protyle, this.settings);
            const cm = cardModeFor(intent);
            if (cm) di.cardMode = cm;
            await di.digest(split);
        };
    }

    blockIconEvent(detail: IEventBusMap["click-blockicon"]) {
        if (!this.plugin) return;
        // □7：块图标菜单换独立开关（digestmenu 继续只管右键 open-menu-content）
        if (blockIconMenu.get()) {
            detail.menu.addItem({
                label: digest渐进阅读摘抄模式.langText(),
                icon: digest渐进阅读摘抄模式.icon,
                accelerator: digest渐进阅读摘抄模式.m,
                click: () => {
                    this.enterDigestMode();
                }
            });
        }
    }

    async onload(plugin: Plugin, settings: TomatoSettings) {
        this.plugin = plugin;
        this.settings = settings;
        this.lute = NewLute();
        this.singleTab = new SingleTab(this.plugin);
        await verifyKeyProgressive()
        this.plugin.addCommand({
            langKey: digest渐进阅读摘抄模式.langKey,
            langText: digest渐进阅读摘抄模式.langText(),
            hotkey: digest渐进阅读摘抄模式.m,
            callback: () => {
                this.enterDigestMode();
            }
        });
        this.plugin.eventBus.on("open-menu-content", ({ detail }) => {
            const menu = detail.menu;
            if (digestmenu.get()) {
                menu.addItem({
                    label: digest渐进阅读摘抄模式.langText(),
                    icon: digest渐进阅读摘抄模式.icon,
                    accelerator: digest渐进阅读摘抄模式.m,
                    click: () => {
                        this.enterDigestMode();
                    },
                });
            }
            // 可见性期4 □4 B②：整篇摘抄从 digestmenu 一拖二拆独立开关（□16 整摘双通道之一：
            // 任意文档无浮条载体，右键整篇摘抄落札记匣/摘抄集；替代通道=⇧⌥D?命令面板）
            if (wholeDigestMenu.get()) {
                menu.addItem({
                    label: tomatoI18n.整篇摘抄,
                    icon: "iconProgContents",
                    click: () => { digestWholeDoc(detail.protyle); },
                });
            }
        });

        // v5 □12 重访调度右键（thinkQueue 推广为通用 reviewQueue）：调度态按模式分完成/推迟
        // 文案（曲线=已解决转心得/还没懂；日程=本轮完成/推迟到明天）；「重访调度…」子菜单设/改/移。
        // 菜单翻新（2026-09-02）：原一级「标为心得/取消心得标记」两项退役——心得=reviewQueue
        // done 终态语义同源，并入「重访调度…」子菜单（iconStar 项）；常驻噪音从两项减到一项。
        // 2026-09-02 撞见修复（此前右键重访调度在 3.9 内核静默失效，双重死因）：
        // ① 内核 open-menu-content detail={protyle, range, element}，blockElements 是
        //   click-blockicon 专属——原实现 ids 恒空早退；② emitToPlugins 同步收集菜单项，
        //   原 await getBlockAttrs 后 addItem 迟到不进菜单。修=目标块走 element/--select
        //   同步取，调度态改读块 DOM 的 custom-prog-think 属性（custom IAL 渲染为块 div
        //   同名属性，setBlockAttrs 即刷），全程零 await。
        this.plugin.eventBus.on("open-menu-content", ({ detail }) => {
            const menu = detail.menu;
            let els: HTMLElement[] = Object.values((detail as any).blockElements ?? {});
            if (els.length === 0) {
                els = [...(detail.protyle?.wysiwyg?.element?.querySelectorAll<HTMLElement>(".protyle-wysiwyg--select") ?? [])];
                if (els.length === 0 && (detail as any).element) els = [(detail as any).element];
            }
            const ids = els.map(el => el?.getAttribute("data-node-id")).filter(Boolean) as string[];
            if (ids.length === 0) return;
            // 可见性期4 □4 B①：摘抄文档内去重——摘抄文档（wysiwyg 容器挂 PDIGEST_CTIME，
            // 同 docReview 的 custom IAL 渲染通道）不显块级「重访调度」，只留文档级「复访节奏」
            const inDigestDoc = !!detail.protyle?.wysiwyg?.element?.getAttribute(PDIGEST_CTIME);
            const raw = els[0].getAttribute(ReviewKey) ?? "";
            const s = parseReview(raw);
            if (reviewSchedMenu.get() && !inDigestDoc && s && s.mode !== "done") {
                const curve = s.mode === "curve";
                menu.addItem({
                    label: curve ? tomatoI18n.问题已解决 : tomatoI18n.本轮已完成,
                    icon: "iconCheck",
                    click: () => applyReviewAction(ids, "complete", raw),
                });
                menu.addItem({
                    label: curve ? tomatoI18n.还没懂稍后再看 : tomatoI18n.推迟到明天,
                    icon: curve ? "iconProgThink" : "iconClock",
                    click: () => applyReviewAction(ids, "defer", raw),
                });
            }
            if (reviewSchedMenu.get() && !inDigestDoc) {
                menu.addItem({
                    label: tomatoI18n.重访调度,
                    icon: "iconProgSched",
                    submenu: schedSubmenuItems(ids, s, raw),
                });
            }
            // 期2 复访节奏：摘抄文档级 pdigest-review（custom IAL 渲染在 wysiwyg 容器属性上，
            // DigestBuilder.init 读 PDIGEST_CTIME 同款通道）——右键改 q 曲线/s 日程/移除；
            // 同步读 DOM 零 await（emitToPlugins 同步收集，await addItem 迟到不进菜单）
            const docReview = detail.protyle?.wysiwyg?.element?.getAttribute(PdigestReviewKey);
            if (revisitRhythmMenu.get() && docReview != null) {
                const docID = detail.protyle?.block?.rootID;
                menu.addItem({
                    label: tomatoI18n.复访节奏,
                    icon: "iconHistory",
                    submenu: schedSubmenuItems([docID], parseReview(docReview), docReview, PdigestReviewKey),
                });
            }
        });

        this.plugin.addCommand({
            langKey: digest执行摘抄.langKey,
            langText: digest执行摘抄.langText(),
            hotkey: digest执行摘抄.m,
            editorCallback: this.execDigest("auto")
        });

        this.plugin.addCommand({
            langKey: digest执行摘抄并断句.langKey,
            langText: digest执行摘抄并断句.langText(),
            hotkey: digest执行摘抄并断句.m,
            editorCallback: this.execDigest("auto", true)
        });

        this.plugin.addCommand({
            langKey: digest执行摘抄留档.langKey,
            langText: digest执行摘抄留档.langText(),
            hotkey: digest执行摘抄留档.m,
            editorCallback: this.execDigest("archive")
        });

        this.plugin.addCommand({
            langKey: digest执行摘抄背诵.langKey,
            langText: digest执行摘抄背诵.langText(),
            hotkey: digest执行摘抄背诵.m,
            editorCallback: this.execDigest("recite")
        });

        // □16 整摘命令通道（无默认热键；片态另有浮条子排按钮、任意文档另有右键项）
        this.plugin.addCommand({
            langKey: "整篇摘抄",
            langText: tomatoI18n.整篇摘抄,
            editorCallback: async (protyle) => { await digestWholeDoc(protyle); },
        });
    }
}

/** □16 整摘：全文档顶层块当一个全选 selection 走 initDi→digestWhole（复用现有复制管道）。
 *  返回新副本 docID（无效入参/空内容早退返 ""，□27 仿写本片副本链路消费）。
 *  forRecite（□28）：仿写副本链路传 true——标题加「仿写」前缀 + 副本前台打开（见 digestWhole）。 */
export async function digestWholeDoc(protyle: IProtyle, forRecite = false): Promise<string> {
    const welement: HTMLElement = protyle?.wysiwyg?.element;
    const docID = protyle?.block?.rootID;
    if (!welement || !docID) return "";
    const top = ([...welement.children] as HTMLElement[]).filter(el => el?.hasAttribute?.("data-node-id"));
    if (top.length === 0) {
        await siyuan.pushMsg(tomatoI18n.没有有效的摘抄内容);
        return "";
    }
    const s = {
        element: welement,
        selected: top,
        ids: top.map(el => el.getAttribute("data-node-id")),
        docID,
        boxID: protyle.notebookId,
        docName: protyle.title?.editElement?.textContent ?? "",
    };
    const di = await initDi(s as any, protyle, digestProgressiveBox.settings);
    return await di.digestWhole(forRecite);
}

export async function initDi(s: Awaited<ReturnType<typeof events.selectedDivs>>, protyle: IProtyle, settings: TomatoSettings) {    let di = new DigestBuilder();
    di.protyle = protyle;
    di.settings = settings;
    di.element = s.element;
    di.docID = s.docID;
    di.docName = s.docName;
    di.anchorID = s.ids[s.ids.length - 1];
    di.selected = s.selected;
    di.ids = s.ids;
    di.boxID = s.boxID;
    di.plugin = digestProgressiveBox.plugin;
    di.otab = digestProgressiveBox.singleTab;
    await di.init();
    return di;
}

export const digestProgressiveBox = new DigestProgressiveBox();
