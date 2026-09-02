import { IEventBusMap, IProtyle, Lute, Plugin } from "siyuan";
import { NewLute, siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import { ReviewKey, parseReview } from "./reviewQueue";
import { applyReviewAction, schedSubmenuItems } from "./reviewMenu";
import { events } from "../../sy-tomato-plugin/src/libs/Events";
import { SingleTab } from "../../sy-tomato-plugin/src/libs/docUtils";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import { DigestBuilder } from "./digestUtils";
import { blockIconMenu, digestmenu } from "../../sy-tomato-plugin/src/libs/stores";
import { winHotkey } from "../../sy-tomato-plugin/src/libs/winHotkey";
import { verifyKeyProgressive } from "../../sy-tomato-plugin/src/libs/user";
import { kind, openDigestSubrank, show, toggleFreeFloat } from "./ProgressiveBtn";
import { cardModeFor, type DigestIntent } from "./digestCardMode";

export const digest渐进阅读摘抄模式 = winHotkey("⌥z", "渐进阅读摘抄模式", "＋🍕", () => tomatoI18n.渐进阅读摘抄模式)
export const digest执行摘抄 = winHotkey("⇧⌥Z", "执行摘抄", "🍕", () => tomatoI18n.执行摘抄)
export const digest执行摘抄并断句 = winHotkey("⇧⌥X", "执行摘抄并断句", "✂", () => tomatoI18n.执行摘抄并断句)
// 2026-09-02 用户反馈：留档/背诵此前只是浮条子排两按钮，快捷键通道唯一且行为跟 cardMode 设置
// 漂移；补两命令各带独立默认键，用户可在插件设置/思源键位设置里分别改。
// 键位按 winHotkey 规范化后形态比对过全仓（ctrl+alt+X 写法会归一成 ⌘⌥X）：⇧⌥P/⌘⌥Z 均无冲突
// （⌘⌥P 曾人选，与 recite reciteCopyPrompt=alt+ctrl+p 规范化后撞键，dev 实例 console 实锤）
export const digest执行摘抄留档 = winHotkey("⇧⌥P", "执行摘抄留档", "🍕", () => tomatoI18n.执行摘抄留档)
export const digest执行摘抄背诵 = winHotkey("⌘⌥Z", "执行摘抄背诵", "＋🗃️", () => tomatoI18n.执行摘抄背诵)

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

    /** ⌥Z 命令/右键/块图标三入口共用的改道出口 */
    private enterDigestMode() {
        if (show.get() && kind.get()) {
            openDigestSubrank();
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
                iconHTML: digest渐进阅读摘抄模式.icon,
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
                    iconHTML: digest渐进阅读摘抄模式.icon,
                    accelerator: digest渐进阅读摘抄模式.m,
                    click: () => {
                        this.enterDigestMode();
                    },
                });
                // □16 整摘双通道之一：任意文档（剧本等）无浮条载体，右键整篇摘抄落札记匣/摘抄集
                menu.addItem({
                    label: tomatoI18n.整篇摘抄,
                    iconHTML: "📋",
                    click: () => { digestWholeDoc(detail.protyle); },
                });
            }
        });

        // v5 □12 重访调度右键（thinkQueue 推广为通用 reviewQueue）：调度态按模式分完成/推迟
        // 文案（曲线=问题已解决/还没懂；日程=本轮完成/推迟到明天）；「重访调度…」子菜单设/改/移。
        this.plugin.eventBus.on("open-menu-content", async ({ detail }) => {
            const menu = detail.menu;
            const ids = Object.keys((detail as any).blockElements ?? {});
            if (ids.length === 0) return;
            const attrs = await siyuan.getBlockAttrs(ids[0]);
            const s = parseReview(attrs[ReviewKey]);
            if (s && s.mode !== "done") {
                const curve = s.mode === "curve";
                menu.addItem({
                    label: curve ? tomatoI18n.问题已解决 : tomatoI18n.本轮已完成,
                    iconHTML: "✅",
                    click: () => applyReviewAction(ids, "complete", attrs[ReviewKey]),
                });
                menu.addItem({
                    label: curve ? tomatoI18n.还没懂稍后再看 : tomatoI18n.推迟到明天,
                    iconHTML: curve ? "❓" : "⏰",
                    click: () => applyReviewAction(ids, "defer", attrs[ReviewKey]),
                });
            }
            if (s?.mode === "done") {
                menu.addItem({
                    label: tomatoI18n.取消心得标记,
                    iconHTML: "✱",
                    click: async () => {
                        for (const id of ids) await siyuan.setBlockAttrs(id, { [ReviewKey]: "" } as AttrType);
                    },
                });
            } else {
                menu.addItem({
                    label: tomatoI18n.标为心得,
                    iconHTML: "✱",
                    click: async () => {
                        for (const id of ids) await siyuan.setBlockAttrs(id, { [ReviewKey]: "done" } as AttrType);
                    },
                });
            }
            menu.addItem({
                label: tomatoI18n.重访调度,
                iconHTML: "⏱",
                submenu: schedSubmenuItems(ids, s),
            });
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
