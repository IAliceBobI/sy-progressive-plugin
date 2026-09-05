import { IProtyle } from "siyuan";
import { getAllEditor } from "siyuan";
import { CONTENT_EDITABLE } from "../../sy-tomato-plugin/src/libs/gconst";
import { getActiveDocID, getContenteditableElement, getSyElement, isEditor, siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import { HtmlCBType } from "./constants";
import { prog } from "./Progressive";
import { events } from "../../sy-tomato-plugin/src/libs/Events";
import { setGlobal } from "stonev5-utils";
import { mount, unmount } from "svelte";
import ProgressiveFloatBtns from "./ProgressiveFloatBtns.svelte";
import { digestLanding, digSubrankOpen, floatbarExpandPref, hideBtnsInFlashCard, initProgFloatBtnsDisable, writableWithGet } from "../../sy-tomato-plugin/src/libs/stores";
import { FloatDocKind, detectFloatDoc, expandAtAppear, shouldRefreshDue, digestMarkBookID } from "./progFloatState";
import { progStorage } from "./ProgressiveStorage";
import { formatDueCount } from "./progFloatState";
import { markDigests, markDigestTag, clearDigestMarks } from "./digestMarker";

const Prog_BUTTON = "custom-prog-button";
const Prog_BUTTON_NoteID = "custom-prog-button-noteID";
const Prog_BUTTON_BookID = "custom-prog-button-bookID";
const Prog_BUTTON_Point = "custom-prog-button-point";

// v5 □5 浮条三态 stores：show=体系内文档在场（球或浮条），expanded=浮条展开（false 时收起为球）。
// 出场展开态走 expandAtAppear（2026-09-02）：floatbarExpandPref 持久偏好优先，无偏好时
// 维持出厂默认（片/free 展开、书/摘抄收球——旧 userCollapsed〔session 级〕随之退役，其
// 「本会话收过片态也出球」语义被持久偏好覆盖）。
let show = writableWithGet(false)
let expanded = writableWithGet(false)
let kind = writableWithGet<FloatDocKind | null>(null)
let title = writableWithGet("")
let point = writableWithGet(0)
let noteID = writableWithGet("")
let bookID = writableWithGet("")
let zIndexPlus = writableWithGet(false)
let dueText = writableWithGet("")        // 附属卡到期胶囊文案（空=不渲染，formatDueCount 产出）
const digOpen = digSubrankOpen          // □2 摘抄子排开合：持久记忆（digSubrankOpen，收起跨分片/
                                         // 跨会话记住）；开合只归 ✂ 管与显式命令（⌥Z 改道），出场链不再强制展开

export function progFloatStores() {
    return { show, expanded, kind, title, point, noteID, bookID, zIndexPlus, dueText, digOpen };
}

// DigestProgressiveBox ⌥z 改道需要读出场态（show+kind=当前文档在三态内）
export { show, kind };

/** 展开浮条（球点击 / 命令通道）；显式意志落盘（2026-09-02 起跨会话记忆）。子排不
 *  联动——□2 起开合持久记忆只归 ✂ 与显式命令管，点球展开浮条尊重用户上次的子排状态 */
export function expandFloatBar() {
    floatbarExpandPref.set(true);
    void floatbarExpandPref.write();
    expanded.set(true);
}

/** 收起为球（浮条 ✕）；显式意志落盘——之后一切态出场都收球，直到再次展开。
 *  digOpen 不清——子排开合只归 ✂ 管，且随 digSubrankOpen 持久记忆 */
export function collapseFloatBar() {
    floatbarExpandPref.set(false);
    void floatbarExpandPref.write();
    expanded.set(false);
}

/** 展开浮条并打开摘抄子排（⌥z 摘抄模式命令在三态文档内的改道出口）。
 *  write 与 ✂ 对称（review P1-1）：显式展开也是「对子排的一次意志」，落盘防被
 *  settingCfg 搭车写反转——set 只写内存，任何整文件 saveData 都会带走它 */
export function openDigestSubrank() {
    expandFloatBar();
    digOpen.set(true);
    void digSubrankOpen.write();
}

// □11 自由态（第四态）：会话级上岗/下班——上岗后本会话所有普通文档浮条都到场，
// 浮条 ✕=本会话下班（不写 floatbarExpandPref——下班是退出自由态，非展开偏好意志）。
let freeSession = false;

// □12 窗口期兜底的负结果缓存（review P1-1）：重查内核真值仍识别不出的 docID=真普通
// 文档，记住后本会话不再对它兜底重查（防出场锁被 await 拖过内核往返丢兄弟事件）。
// 只增不清，插件 reload 自然清零；安全性论证见识别段注释。
const verifiedNormalDoc = new Set<string>();

/** 自由态上岗（状态栏 ✂ 钮 / ⌥Z 在普通文档的改道出口）。三态文档在场=聚焦浮条+
 *  展开子排；普通文档=自由态上岗并立刻出场（withSubrank=⌥Z 通道顺手展开摘抄子排）。
 *  编辑器解析不出时只置上岗位，下次出场事件（点击编辑器/切页签）自然带出浮条。 */
export async function toggleFreeFloat(withSubrank = false) {
    if (show.get() && kind.get()) {
        openDigestSubrank();
        return;
    }
    freeSession = true;
    // 出场求值：优先最近交互的编辑器，兜底按激活页签文档 ID 匹配
    // （文档树点开还没点内容时 events.protyle 为空，同 addProgressiveReading 先例）
    let protyle = events.protyle?.protyle ?? null;
    if (!protyle) {
        const docID = getActiveDocID();
        if (docID) {
            protyle = getAllEditor().find(p => p?.protyle?.block?.rootID === docID)?.protyle ?? null;
        }
    }
    if (protyle) {
        await progressiveBtnFloating(protyle);
        if (withSubrank && kind.get() === "free") {
            digOpen.set(true);
            void digSubrankOpen.write(); // 同 openDigestSubrank：显式意志落盘（review P1-1）
        }
    }
}

/** 自由态下班（浮条 ✕）：本会话普通文档不再出浮条；可随时再上岗（✂ 钮/⌥Z） */
export function freeFloatOff() {
    freeSession = false;
    show.set(false);
}

// 子排常驻后无需「不可见即清」兜底（旧订阅防 ⇧⌥Z 开子排后跨文档带旧开合态）——开是默认态，
// 出场 docChanged 恒重置为开，✂ 收起只在同文档会话内生效（2026-08-31 随子排转常驻移除）。

export function initProgFloatBtns() {
    if (initProgFloatBtnsDisable.get()) {
        return;
    }
    const btns = setGlobal("initProgFloatBtns 2025-07-15 23:47:53", mount(ProgressiveFloatBtns, {
        target: document.body,
        props: {
            show, expanded, kind, title, point, noteID, bookID, zIndexPlus, dueText, digOpen,
        }
    }));
    if (btns != null) {
        unmount(btns);
    }
}

/** 附属卡到期数：doc deck 挂 digest-书名 夹，getTreeRiffDueCards 按子树查（出场时异步刷新，防抖 bookID） */
let lastDueKey = "";
async function refreshDue(dirKey: string) {
    if (dirKey === lastDueKey) return;
    lastDueKey = dirKey;
    try {
        const dirID = await progStorage.ensureDigestDir(dirKey, digestLanding.get() === "source");
        if (!dirID || lastDueKey !== dirKey) return;
        const ret = await siyuan.getTreeRiffDueCards(dirID);
        if (lastDueKey !== dirKey) return;
        dueText.set(formatDueCount(ret?.unreviewedCount ?? 0));
    } catch (e) {
        console.error("prog float due refresh failed", e);
    }
}

/** 浮条系统总开关（设置项+命令共用）：关=不出球不出浮条（出场 gate） */
export function toggleFloatBarSystem() {
    const next = !initProgFloatBtnsDisable.get();
    initProgFloatBtnsDisable.set(next);
    if (next) {
        show.set(false);
    } else expanded.set(expandAtAppear(floatbarExpandPref.get(), kind.get() ?? "book")); // 重开后与出场同款求值（对齐偏好）
}
// （□11.1「片内双色」.prog-piece-live 挂类/清类逻辑已随 2026-08-30 用户实测反馈退役——
// 原文灰显+笔记继承属性同色没法分清，回归原文不做色彩修饰的老形态，CSS 与本体同批移除）

export async function progressiveBtnFloating(protyle: IProtyle, closed = false) {
    if (closed) {
        // destroy_protyle 只收浮条、不做任何全局态清理：被销毁视图的 DOM 随页签消亡，全局
        // 清理会误伤仍存活的视图（□20 实锤：读下一篇链新片挂载态被旧片 destroy 抹掉；分屏
        // 关一方同理——「派发点紧跟 DOM 移除」已逐族核验 /opt/projects/siyuan
        // app/src/protyle/util/destroy.ts，思源升级若改 destroy 语义需复核此处）。
        // 宿主 gate：noteID 只可能被编辑器或闪卡预览宿主写入，其它 protyle（块引浮窗/搜索
        // 预览/历史版本视图）销毁时宿主页签还开着，不收浮条。
        const canHost = isEditor(protyle) || protyle.element.classList.contains("card__block");
        if (canHost && events.getInfo(protyle).docID == noteID.get()) {
            show.set(false)
        }
        return;
    }
    if (initProgFloatBtnsDisable.get()) {
        show.set(false);
        return;
    }
    let { attrs, docID, name } = events.getInfo(protyle)
    let attrsIsFinal = false;   // attrs 已直查内核（闪卡预览分支）——识别落空也无需兜底重查
    zIndexPlus.set(false);
    if (protyle.element.classList.contains("card__block")) {
        // 闪卡预览里显示的是分片：维持片态出场（hideBtnsInFlashCard 可关）；
        // □11 free 态不进闪卡预览（普通文档的卡预览弹 free 浮条违反直觉，review P2）
        if (events.isMobile || hideBtnsInFlashCard.get() || freeSession) {
            show.set(false);
            return;
        }
        attrs = await siyuan.getBlockAttrs(docID)
        attrsIsFinal = true;
        name = attrs.title;
        zIndexPlus.set(true);
    } else {
        if (!isEditor(protyle)) {
            return;
        }
    }

    // v5 三态识别（progFloatState.detectFloatDoc：判据优先级 pdigest > mark > books，
    // 真实 digest 文档自带片形状 custom-progmark 防删护栏，mark 优先会误判成片）。
    // □12 窗口期兜底：attrs 是 events.getInfo 的 protyle IAL 快照，片/digest 刚创建时
    // custom-progmark 两步后补（createDocWithMd→setBlockAttrs）尚未反映进快照（巨书实测
    // 24s+ 才随事件刷新），识别落空会把刚开的片误判成 free 态出场（或直接不出场）。
    // 落空≠不存在——识别不出时用 getBlockAttrs 查内核真值再识别一次（书态不依赖 attrs，
    // 首轮即命中，不触发重查），仍识别不出才是真的普通文档。
    // 负缓存（review P1-1）：重查仍落空的 docID 记住，后续出场事件不再重查——出场链五事件
    // 走 ifAvailable 锁（拿不到即丢弃不排队），await 重查会把锁拖过一次内核往返，普通文档
    // 的事件高频面会在毫秒窗内丢兄弟事件。缓存安全性：mark/ctime 全仓只随新建文档写入
    // （无给既有文档后补的 flow），片/digest 恒新 docID 不命中，普通→书走 book 分支首轮
    // 即判；插件 reload 自然清零。
    const isBook = (id: string) => progStorage.isRegisteredBook(id);
    let id = detectFloatDoc(attrs, docID ?? "", isBook);
    if (!id && docID && !attrsIsFinal && !verifiedNormalDoc.has(docID)) {
        id = detectFloatDoc(await siyuan.getBlockAttrs(docID), docID, isBook);
        if (!id) verifiedNormalDoc.add(docID);
    }
    const nextBookID = id?.bookID ?? "";
    const nextPoint = id?.point ?? 0;
    let nextKind: FloatDocKind | null = id?.kind ?? null;

    // □11 自由态：普通文档（非三态）在自由态上岗时以 free 态出场（✂📥 两键）
    if (docID == null || (nextKind == null && !freeSession)) {
        // 痕迹只挂源文档（群反馈 650189 根治）：普通文档出场补挂摘抄痕迹——markDigests
        // 自指 docID（free 摘抄 ctime=docID#ct 命中 refMap），不看自由态是否上岗（用户
        // 日常打开/复习流打开同权补挂）；digestMarker 空结果负缓存防高频 SQL。浮条
        // 语义不变：普通文档不出场（show=false 原样）。
        if (docID != null && nextKind == null) {
            markDigests(protyle, docID).catch(() => { });
        }
        show.set(false);
        return;
    }
    if (nextKind == null) nextKind = "free";

    // 同文档重复触发（click-editorcontent 等）不重置展开态；跨文档按态重置
    const docChanged = docID !== noteID.get() || nextKind !== kind.get();
    show.set(true);
    noteID.set(docID);
    kind.set(nextKind);
    title.set(name);
    point.set(nextPoint);
    bookID.set(nextBookID);
    if (docChanged) {
        // □2（2026-09-01）：digOpen 不再强制置开——子排开合随 digSubrankOpen 持久记忆，
        // 用户收起后切分片/换文档保持收起（原「每次出场重新展开」拍板随用户反馈推翻）
        // 展开态同款持久化（2026-09-02）：expandAtAppear 偏好优先——书/摘抄态出场不再
        // 无条件收球，跟随用户最后一次显式意志；无意志维持出厂默认（片/free 展开）
        expanded.set(expandAtAppear(floatbarExpandPref.get(), nextKind));
        if (nextBookID && shouldRefreshDue(nextBookID, isBook)) refreshDue(nextBookID);
    }
    // 摘抄痕迹：四态出场求值（digestMarkBookID）——片态（块 custom-progref 命中）与
    // 书态原文（块 ID 即 ref 值）双侧打标；free 态自指 docID；digest 态恒不打（卡片
    // 零痕迹，群反馈 650189 根治：拷贝块 progref 全命中源 refMap=满挂「整篇变色」
    // 根因，痕迹只挂源文档——v3.4.1 出场链使满挂从概率性一次变每次出场幂等重打）。
    // □15 移出 docChanged：出场链由五种事件驱动（含 loaded_protyle_dynamic），protyle
    // 懒加载双向窗口（向下滚出新块 + 顶部折叠重展开）都会丢标须重打；幂等清旧重打，
    // refMap 60s 缓存+空结果负缓存兜底开销。
    const markBookID = digestMarkBookID(nextKind, nextBookID, docID ?? "");
    if (markBookID) {
        markDigests(protyle, markBookID).catch(() => { });
    } else if (nextKind === "digest") {
        // 卡片只清不打：剥掉修复前版本满挂的残留 span（纯 DOM 零落盘，但插件热升级
        // reload 不重建已开文档 DOM，须出场主动清；零 SQL）
        clearDigestMarks(protyle);
    }
    // 摘抄文档身份徽章（progpolish □4）：title 区注入「✒ 摘抄」胶囊（零落盘），
    // 同出场链反复调用，markDigestTag 幂等清旧重挂；title 重渲染丢注入由下次事件补挂
    if (nextKind === "digest") {
        markDigestTag(protyle);
    }
}

export function addClickEvent(element: HTMLElement) {
    element?.querySelectorAll(`div[${Prog_BUTTON}]`).forEach((e: HTMLElement) => {
        e.addEventListener("click", btnProcessor);
        e.style.backgroundColor = "var(--b3-font-background11)";
        getContenteditableElement(e)?.setAttribute(CONTENT_EDITABLE, "false");
    });
}

export function btn(btnID: HtmlCBType, icon: string, tips: string, bookID: string, noteID: string, point: number, show: boolean) {
    if (!show) {
        return "";
    }
    return `${icon}
{: ${Prog_BUTTON}="${btnID}" memo="${tips}" ${Prog_BUTTON_NoteID}="${noteID}" ${Prog_BUTTON_BookID}="${bookID}" ${Prog_BUTTON_Point}="${point}"}`;
}

async function btnProcessor(ev: MouseEvent) {
    ev.stopPropagation();
    const e = getSyElement(ev.target as HTMLElement);
    if (!e) return;
    const cbType = Number(e.getAttribute(Prog_BUTTON)) as HtmlCBType;
    const bookID = e.getAttribute(Prog_BUTTON_BookID);
    if (cbType == HtmlCBType.nop) {
        //
    } else if (cbType == HtmlCBType.readThisBlock) {
        const blockID = bookID;
        await prog.readThisPiece(blockID);
    } else {
        const noteID = e.getAttribute(Prog_BUTTON_NoteID);
        const point = Number(e.getAttribute(Prog_BUTTON_Point));
        await prog.htmlBlockReadNextPeice(bookID, noteID, cbType, point);
    }
}

export function getContentPrefix(level: number) {
    const h = level > 1 ? "|" : "";
    const s = "　　".repeat(level - 1);
    const d = ["", "", "", "", "", "", "", "", ""][level];
    // const d = ["[Z]", "[A]", "[B]", "[C]", "[D]", "[E]", "[F]", "[G]", "[H]"][level];
    return h + s + d;
}

/** 滚筒换书（公共组 🔄）：无参 startToLearn 走滚筒出下一本（出片即轮转） */
export async function floatSwapBook() {
    await prog.startToLearnWithLock();
}
