// 就地断句执行层（2026-09-09 立项，bear 拍板：独立功能/任意文档选中块原地拆/挂 Pro/
// 只拆段落一钮直断）：浮条子排「就地断句」钮的执行体；0914 □4 起另有命令通道
// （⌥= 快捷键/命令面板，splitInPlaceCommand 态位守卫同口径）。与摘抄断句（getDigestMd
// split 分支）的差异=零产物语义——不摘抄、不产 * 回链、不挂渐进属性，句子块 markdown
// 通道插回原位后删原块（每块两个事务）。⚠️API 事务不进前端 undo 栈（思源行为，e2e 实测
// 焦点在编辑器 ⌘Z 也不撤，与重插清空同族）——恢复通道=文档历史，改的是用户原文档
// 故只在含行内样式时 confirm 警告。书态浮条不给此钮（README 初版警告：分片后改原书
// 会让渐进找不到块）。0914 □5 起分片放开（鸟：重插必然全断，要只断选中几段）——挂
// 闪卡的段落护卡拦截；写作槽仍拒（拆槽内块断素材胶囊血缘）。Pro 口径=断句整体付费
// （splitAndInsert 同款兜底门禁+toast 引导）。
import { confirm, IProtyle } from "siyuan";
import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import { events } from "../../sy-tomato-plugin/src/libs/Events";
import { getAllContentEditableText } from "../../sy-tomato-plugin/src/libs/domUtils";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import { lastVerifyResult } from "../../sy-tomato-plugin/src/libs/user";
import { winHotkey } from "../../sy-tomato-plugin/src/libs/winHotkey";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
import { hasInlineStyles, isSplittableInPlace, splitInPlaceSentences } from "./splitInPlaceCore";
import { progStorage } from "./ProgressiveStorage";
import { invalidateRevTrace } from "./revTrace";
import { lockWithLease } from "./lockLease";
import { detectFloatDoc, splitInPlaceGuard, correctStaleSlot } from "./progFloatState";
import { detectWritingTreeDoc } from "./writeTree";

interface SplitPlan { id: string; sentences: string[] }

// 0914 □4 命令通道（鸟申请不依赖浮窗的快捷键）：默认键 ⌥=——纯 ⌥ 符号键最后空闲位
// （⌥; 已被「直接入槽」09-09 占用，⌥- / ⌥` / ⌥/ 同占）；matchHotkey 走 keyCode 物理键
// 跨布局稳（⌥; 同族先例）。langKey 沿用中文直名（与「直接入槽」「整篇摘抄」同款）。
export const split就地断句 = winHotkey("⌥=", "就地断句", "iconSplitTB", () => tomatoI18n.就地断句)

/** 护卡拦截（0914 □5 拍板「放开+护卡」）：分片内块可能被制成附属卡——就地拆=删旧块
 *  断卡链。探测通道=getTreeRiffCardsAll（卡 id=块 id；rootID 过滤限本片树，防池夹里
 *  子文档的卡误伤）。失败降级空集：探测通道不可用时不拦不误拦（探测恒败属部署级异常，
 *  由 e2e/dev 验证兜住，不在用户路径上弹警告噪音）。 */
async function cardBoundIDs(docID: string): Promise<Set<string>> {
    try {
        const cards = await siyuan.getTreeRiffCardsAll(docID);
        return new Set((cards ?? []).filter((c: any) => c.rootID === docID).map((c: any) => c.id));
    } catch {
        return new Set();
    }
}

/**
 * 命令通道入口（快捷键/命令面板，editorCallback 直收聚焦编辑器）：浮条钮同款执行体
 * 前置态位守卫——书/写作槽拒绝并给引导（理由见 splitInPlaceGuard 注释）。识别链与
 * 浮条出场同源（detectFloatDoc 判据优先级+写作树槽兜底），但命令通道低频一次性：
 * 直查内核 attrs 真值（无出场链的快照窗口期问题），不加负缓存；树槽兜底只判态不懒
 * 补标（补标是出场链的职责）。
 */
export async function splitInPlaceCommand(protyle: IProtyle) {
    const docID = protyle?.block?.rootID ?? "";
    if (!docID) {
        await siyuan.pushMsg(tomatoI18n.分片编辑器未就绪);
        return;
    }
    const attrs = await siyuan.getBlockAttrs(docID).catch(() => undefined);
    // 书/卷判据依赖 books.json 与 volOwner 内存映射，冷启动窗口未就绪会把原书误判
    // null 放行——低频按键动作同步等一次读盘再查（幂等，readThisPiece 同款先例）
    if (!progStorage.volOwnerReady()) await progStorage.warmVolOwner().catch(() => { });
    let id = detectFloatDoc(attrs, docID, bid => progStorage.docBookID(bid));
    let writingSlot = false;
    if (!id) {
        // 手动建的书下槽（无 MarkKey，progtree □1 同款兜底）——按写作槽引导；unknown
        // （拉取失败/休眠书）不拦：识别不确定时放行，让执行层的选块校验兜底
        const wBookID = await detectWritingTreeDoc(docID).catch(() => "unknown" as const);
        if (wBookID && wBookID !== "unknown") {
            id = { kind: "piece", bookID: wBookID, point: 0 };
            writingSlot = true;
        }
    }
    if (id?.kind === "piece" && !writingSlot) {
        // 拖出写作书的槽文档 MarkKey 残留：出场链靠「拖出剥标」降级 free，关浮条的
        // 用户无此自愈通道——读式校正（不落盘剥标，出场链职责不动）：树验 null=已
        // 拖出降级放行；仍挂树=真写作槽走槽文案（重插对写作槽被拦，指路即死路）
        const bi = progStorage.peekBookInfo(id.bookID);
        if (bi?.writing && !bi.ignored && !bi.archived) {
            const inTree = await detectWritingTreeDoc(docID).catch(() => "unknown" as const);
            const c = correctStaleSlot("piece", bi, inTree);
            if (c.kind === null) id = null;
            writingSlot = c.writingSlot;
        }
    }
    debugLog("prog.splitinplace", `command doc=${docID} kind=${id?.kind ?? "free"}${writingSlot ? "(writingSlot)" : ""}`, "progressive");
    if (writingSlot) {
        // 引导类文案走默认时长（完成类短 toast 才用 2500，长文案读不完）
        await siyuan.pushMsg(tomatoI18n.写作槽不能就地断句);
        return;
    }
    const guard = splitInPlaceGuard(id?.kind ?? null);
    if (guard === "book") {
        await siyuan.pushMsg(tomatoI18n.原书不能就地断句);
        return;
    }
    // 0914 □5 护卡：选中段落挂闪卡的拦下（riff 卡链），其余照拆；全态探测——
    // 制卡族 09-13 起全态放开（digest/free 也能给本篇段落制卡），拆=同样断卡链
    // （review P1-2：注释旧前提「digest/free 无卡面」已过期，只护 piece 是不对称防护）
    const blocked = await cardBoundIDs(docID);
    await splitInPlaceRun(protyle, blocked);
}

export async function splitInPlaceRun(protyle: IProtyle, blocked?: Set<string>) {
    // 断句整体 Pro（□14 口径）：浮条钮不带锁角标（子排视觉统一），执行层兜底+toast 引导
    if (!lastVerifyResult()) {
        await siyuan.pushMsg(tomatoI18n.断句Pro提示, 2500);
        return;
    }
    return lockWithLease("prog.splitInPlace", async () => {
        const s = await events.selectedDivs(protyle);
        if (!s || s.ids.length === 0) {
            await siyuan.pushMsg(tomatoI18n.请先选择要断句的块);
            return;
        }
        // 收集阶段同步完成（DOM 只在此时读，事务删除后失活无害）：非 p 块与单句块跳过；
        // 护卡档（0914 □5）：blocked 命中的块跳过并计数（toast 交代，静默跳过=用户
        // 以为断完了回头找不到半拆现场）
        const plans: SplitPlan[] = [];
        let styled = false;
        let cardSkipped = 0;
        for (let i = 0; i < s.ids.length; i++) {
            if (blocked?.has(s.ids[i])) { cardSkipped++; continue; }
            const el = s.selected[i];
            if (!el || !isSplittableInPlace(el.getAttribute("data-type"))) continue;
            const text = getAllContentEditableText(el);
            const sentences = splitInPlaceSentences(text);
            if (sentences.length <= 1) continue;
            if (!styled) styled = hasInlineStyles(text);
            plans.push({ id: s.ids[i], sentences });
        }
        if (plans.length === 0) {
            await siyuan.pushMsg(cardSkipped > 0 ? tomatoI18n.选中段落都挂闪卡 : tomatoI18n.没有可断句的内容);
            return;
        }
        const run = async () => {
            // styled-confirm 悬置窗内连按会叠第二笔收集，迟到确认的那笔块可能已被
            // 先跑的一笔删掉——执行前重筛存活（亡块跳过，全亡静默收场）
            const live: SplitPlan[] = [];
            for (const p of plans) {
                if (await siyuan.getBlockAttrs(p.id).catch(() => null)) live.push(p);
            }
            if (live.length === 0) return;
            let made = 0;
            for (const p of live) {
                await siyuan.insertBlockAfter(p.sentences.join("\n\n"), p.id, "markdown");
                await siyuan.deleteBlock(p.id);
                made += p.sentences.length;
            }
            // revtrace「拆装不算修订」：断句=插新句块+删原块，句子块 updated=断句时刻
            // 会整批误报「刚改」——推基线到操作后（句子块≤基线全无色）+作废 updated
            // 快照缓存。未纳入文档 bump 自动 no-op（首次 enroll 必晚于此刻，本就无色）
            const docID = protyle?.block?.rootID ?? "";
            if (docID) {
                await progStorage.bumpRevTraceBaseline(docID);
                invalidateRevTrace(docID);
            }
            await siyuan.pushMsg(cardSkipped > 0
                ? tomatoI18n.断句完成N块M句跳K段(live.length, made, cardSkipped)
                : tomatoI18n.断句完成N块M句(live.length, made), 2500);
        };
        // 断句产物是纯文本句子：原文里的行内样式会以字面量保留，含样式块先警告；
        // confirm 不 await（lock body 即返放锁），cb 里 catch 防 HTTP 失败成 unhandled
        if (styled) {
            confirm(tomatoI18n.断句样式警告标题, tomatoI18n.断句样式警告内容, () => { void run().catch(() => { }); });
        } else {
            await run();
        }
    });
}
