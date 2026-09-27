// need-0926-01 提取产物统一装配层（四链路共用：提取到底部/keys/提取全部/合并汇编）。
// 纯函数层：无 .svelte / siyuan IO / Lute 依赖（DOM 构造走 happy-dom 单测直测，
// tailCardBlock 同款分层红线）。六子项映射：
// ① 一条笔记一个单元 = 单条无序列表（DomListBuilder 一 append 一 li）；
//    **need-0926-05 B 混合案：非段落笔记（列表/引用/代码块/标题）原样直出不套
//    li 壳**（用户原文列表被强套=双层列表痛点，bear 拍板 B 案）——直出形态下
//    key-note/doc-notes 标记挂块自身、星号挂行尾（列表=末项行尾；代码块内容区
//    是纯文本通道塞 span 会被内核拍平成字面 * 污染代码=跳过不挂）
// ② 条间空行 = 单元间空段断链（零 CSS；末单元后不插，产物无尾空行）——li 单元
//    与直出单元同款（B 案对齐 li 形态条间空段断链做法）
// ③ 留言/用户补充与笔记一体 = 挂当前单元，**排笔记本体上方（need-0926-05 bear
//    拍板，全形态统一）**：li 形态=li 内二级嵌套子列表置前（○+层级线视觉区分）；
//    直出形态=留言块裸平铺在笔记块前。物理序就近归属——visit-note 留言是文档级
//    feed 无笔记锚（单笔记片天然对应，多笔记挂最后一条）；**同 pidx 连续块=笔记后
//    回车续写的补充（内核续块继承 pidx）同挂当前单元**（0926 尾巴修复：曾被误判
//    新笔记=keys 产物平级+双圆点+条间空行三症状）；**留言排上方后产物往返流里
//    留言物理序在笔记前=流首/边界后无 pidx 块先攒缓冲挂到下一个 pidx 单元**
//    （groupNoteUnits 前向归属，产物形态不动点；流终仍无 pidx=独立单元兜底不丢块）
// ④ 星号超链接行尾（add_href atEnd=true；现状提取到底部在行首=四链路唯一行首源）
// ⑤ 底部产物优先取数 = pickPieceNotes（片底部有 custom-doc-notes 产物→取其内容流，
//    含用户补充；没有才取片内原笔记）——extractNotes/extractAllNotes 共用
// ⑥ 星号开关由调用方传 withHref（□2 设置键，默认带=现状行为）
// 另修：JSON 游标泄漏根因=尾卡 custom 块被装配层收进产物（getAllBlocks m1/m2/m3 与
// extractNotes SQL 过滤均无 custom 块刀）——filterStream 统一滤尾卡（6809 实测判据：
// data-type="NodeCustomBlock" + data-info=围栏名，2026-09-26）。

import {
    DATA_NODE_INDEX, DATA_TYPE, BlockNodeEnum, CONTENT_EDITABLE, PARAGRAPH_INDEX, WEB_ZERO_SPACE,
} from "../../sy-tomato-plugin/src/libs/gconst";
import { DomListBuilder, DomParaBuilder } from "../../sy-tomato-plugin/src/libs/sydom";
import { add_href, cloneCleanDiv, removeAttribute } from "../../sy-tomato-plugin/src/libs/utils";
import { TAIL_CARD_FENCE } from "./tailCardBlock";
import { VISIT_NOTE_FENCE } from "./visitNoteBlock";

/** 底部提取产物标记（新格式挂每单元 list 容器+条间空段，删旧=删所有带标记块；
 *  旧格式 sb 挂容器，同一判据通吃——extractNotes2bottom 删旧逻辑无需分叉） */
export const DOC_NOTES_KEY = "custom-doc-notes";
/** 提取笔记样式标记（need-0926-02 起三路提取链路统一挂单元首块——帮助文档
 *  「提取的笔记」CSS 片段的命中锚；stripAttrs 剥源块旧标防跨轮残留） */
export const KEY_NOTE_KEY = "custom-prog-key-note";
const TAIL_CARD_INFO = TAIL_CARD_FENCE.replace(/^;;;/, "");
const VISIT_NOTE_INFO = VISIT_NOTE_FENCE.replace(/^;;;/, "");
const CUSTOM_BLOCK_TYPE = "NodeCustomBlock";

/** 装配输入流：div=净化后的块 DOM（克隆态，id 已换新）；srcID=星号链接指向的块 id
 *  （溯源策略归调用方：片内块 id 或 custom-progref 链，装配层不问语义） */
export interface StreamBlock {
    div: HTMLElement;
    srcID: string;
}

export interface NoteUnitOpts {
    /** 笔记块行尾星号超链接（默认 true=现状行为；提取全部受 □2 开关门控） */
    withHref?: boolean;
    /** 星号文案（默认 " * "） */
    hrefText?: string;
    /** 单元标记挂 list 容器+条间空段（底部产物传 ["custom-doc-notes","1"]；null=不挂） */
    markAttr?: readonly [string, string] | null;
    /** 笔记样式标记挂**单元首块**（笔记本体；need-0926-02 起三路提取链路统一传
     *  ["custom-prog-key-note","1"]——帮助文档「提取的笔记」CSS 片段的命中锚，此前
     *  仅 keys 链路挂=提取到底/提取全部产物改该 CSS 无反应）。合并汇编不传（产物含
     *  原文块，语义归 need-0926-05 拍板）。挂点=首块 div（分组规则 groupNoteUnits
     *  单一事实源，与 keys 旧 heads 逻辑同判据；B 案直出形态同挂块自身）；同 pidx
     *  续写补充不挂=留言灰字形态 */
    noteHeadAttr?: readonly [string, string];
    /** 直通判定：返回 true 的块不进 li 平铺输出（合并/汇编链路的原文块），并充当
     *  分组边界（前后笔记分属不同单元）；直通块自身不清旧星号不挂标记 */
    passthrough?: (div: HTMLElement) => boolean;
}

export interface PickOpts {
    /** 滤 custom-prog-origin-text（提取全部/keys 的笔记态；合并汇编全量传 false） */
    noteOnly?: boolean;
}

// ---- custom 块判据（6809 实测：data-type=NodeCustomBlock，围栏名在 data-info）----

export function customBlockInfo(div: HTMLElement): string {
    if (!div?.getAttribute) return "";
    if (div.getAttribute(DATA_TYPE) !== CUSTOM_BLOCK_TYPE) return "";
    return div.getAttribute("data-info") ?? "";
}

/** 尾卡（JSON 游标本体）——提取产物永不收 */
export function isTailCardBlock(div: HTMLElement): boolean {
    return customBlockInfo(div) === TAIL_CARD_INFO;
}

/** 留言块——保留进产物（现状行为），装配时挂对应笔记单元 */
export function isVisitNoteBlock(div: HTMLElement): boolean {
    return customBlockInfo(div) === VISIT_NOTE_INFO;
}

/** 底部产物块（旧格式 sb / 新格式 list，custom-doc-notes 标记） */
export function isBottomProduct(div: HTMLElement): boolean {
    return !!div?.getAttribute?.(DOC_NOTES_KEY);
}

/** 零宽空格免疫的空段判定（空块 textContent=\u200b，trim 剔不掉——helper rmBadThings 同款） */
export function isEmptyPara(div: HTMLElement): boolean {
    return div?.getAttribute?.(DATA_TYPE) === BlockNodeEnum.NODE_PARAGRAPH
        && !(div.textContent ?? "").replace(/\u200B/g, "").trim();
}

const VERBATIM_NOTE_TYPES = new Set<string>([
    BlockNodeEnum.NODE_LIST, BlockNodeEnum.NODE_BLOCKQUOTE,
    BlockNodeEnum.NODE_CODE_BLOCK, BlockNodeEnum.NODE_HEADING,
]);

/** need-0926-05 B 混合案直出判据：非段落笔记（DOM data-type ∈ NodeList/NodeBlockquote/
 *  NodeCodeBlock/NodeHeading 四类）原样直出不套 li 壳——用户原文列表被强套=双层列表
 *  痛点本体；段落笔记（主流）保持 li 形态零变化。判别对象=单元 head（笔记本体）。 */
export function isVerbatimNoteBlock(div: HTMLElement): boolean {
    return VERBATIM_NOTE_TYPES.has(div?.getAttribute?.(DATA_TYPE) ?? "");
}

/** 通用流净化（四链路过滤语义的单一事实源）：滤 progmark/previous/底部产物标记块/
 *  空段/尾卡；noteOnly 再滤 origin-text。留言块保留。 */
export function filterStream(blocks: StreamBlock[], opts: PickOpts = {}): StreamBlock[] {
    return blocks.filter(({ div }) =>
        !div.getAttribute("custom-progmark")
        && !div.getAttribute("custom-prog-piece-previous")
        && !isBottomProduct(div)
        && !isEmptyPara(div)
        && !isTailCardBlock(div)
        && !(opts.noteOnly && div.getAttribute("custom-prog-origin-text")));
}

/** 底部产物内容展开（取数目标）：sb=直接子块；list=每个 li 的内容子块（跳过
 *  .protyle-action 圆点钮与 .protyle-attr 属性行，li 根自身不是内容块）；
 *  **带 pidx 的 list=need-0926-05 B 案直出列表笔记，整块返回不拆**（pidx 挂 l 容器
 *  =markdown 插列表自然形态，拆到 li 叶子会把 pidx 丢在壳上=笔记本体降格成无主
 *  补充块，deepContentBlocks 同款判据）；其他容器原样返回。产物块序=文档序，
 *  物理序就近归属依赖此序保持。 */
export function flattenProductChildren(div: HTMLElement): HTMLElement[] {
    const kids = [...div.children].filter(c =>
        !c.classList.contains("protyle-action") && !c.classList.contains("protyle-attr"));
    const t = div.getAttribute(DATA_TYPE);
    if (t === BlockNodeEnum.NODE_SUPER_BLOCK || t === BlockNodeEnum.NODE_LIST_ITEM) {
        return kids as HTMLElement[];
    }
    if (t === BlockNodeEnum.NODE_LIST) {
        if (div.getAttribute(PARAGRAPH_INDEX)) return [div];
        return kids
            .filter(c => c.getAttribute(DATA_TYPE) === BlockNodeEnum.NODE_LIST_ITEM)
            .flatMap(li => flattenProductChildren(li as HTMLElement));
    }
    return [div];
}

/** 深展开到内容块叶子（容器 List/li/sb 全拆，跳圆点钮/属性行）：keys 散块保全用
 *  ——装配层写入的留言子列表容器自身无 pidx，整容器回收会连其内片源克隆（带
 *  pidx 的续写补充/visit-note 留言）一起回流，与片流叠加逐轮翻倍（0926 dev 三轮
 *  实测）；拆到叶子粒度后 pidx/visit-note 刀才滤得干净。用户手写列表同样拆平
 *  （旧版 content 纯文本同语义，内容不丢；装配层重新包 li）。
 *  带 pidx 的容器不拆整块返回：pidx 挂 List 容器（markdown 插列表自然形态）时
 *  转移进了拆出的 li（appendMessageItem），li 整体=片源单元，extras 的 pidx 刀
 *  直接跳过——再拆会把 li 层的 pidx 丢掉滤不干净。 */
export function deepContentBlocks(div: HTMLElement): HTMLElement[] {
    if (div.getAttribute(PARAGRAPH_INDEX)) return [div];
    const t = div.getAttribute(DATA_TYPE);
    if (t === BlockNodeEnum.NODE_LIST || t === BlockNodeEnum.NODE_LIST_ITEM
        || t === BlockNodeEnum.NODE_SUPER_BLOCK) {
        return [...div.children]
            .filter(c => !c.classList.contains("protyle-action") && !c.classList.contains("protyle-attr"))
            .flatMap(c => deepContentBlocks(c as HTMLElement));
    }
    return [div];
}

/** 片笔记取数（需求 5 优先级）：片顶层子块里存在底部产物（custom-doc-notes 标记，
 *  新旧格式通吃）→ 取产物内容流（含用户补充，flatten 后按文档序）；没有 → 片内
 *  原笔记流。两路都过 filterStream 净化（产物流同样滤尾卡/空段）。
 *  bottom 流 srcID 溯源：产物块是克隆体（容器 id 随删旧消亡），从块内旧星号链接
 *  （span[data-href] 指向片内原块）穿透取原块 id；无星号（上次装配 withHref=false）
 *  → 空串=本次也不加星号（buildNoteUnits 空值跳过），不断链不猜。
 *  need-0926-05：bottom 展开=消费产物容器标记——B 案直出块（标题/代码块/引用，
 *  flatten 原样返回）身上还带着 doc-notes 标记，不剥会被 filterStream 的
 *  isBottomProduct 刀当产物残留滤掉（直出块整体蒸发，6809 e2e CF1 实锤）；展开
 *  后逐块剥，内容块以「无标记内容」身份进流。 */
export function pickPieceNotes(children: StreamBlock[], opts: PickOpts = {}): {
    source: "bottom" | "inline";
    stream: StreamBlock[];
} {
    const products = children.filter(b => isBottomProduct(b.div));
    if (products.length > 0) {
        const stream = products.flatMap(b =>
            flattenProductChildren(b.div).map(div => {
                div.removeAttribute(DOC_NOTES_KEY);
                return { div, srcID: starHrefID(div) };
            }));
        return { source: "bottom", stream: filterStream(stream, opts) };
    }
    return { source: "inline", stream: filterStream(children, opts) };
}

/** 单元分组（buildNoteUnits 分组规则的单一事实源，接线处判「单元首块」同用）：
 *  直通块=独立输出项+分组边界；pidx 块开新单元；**同 pidx 连续块不开新单元**——
 *  用户在笔记后回车续写的补充被内核续块继承 pidx（0926 陆杰 keys 双圆点根因：
 *  继承块被误判新笔记=独立单元+单元内容 List 容器再渲染成双层圆点）。
 *  无 pidx 块（留言/用户补充）**一律攒缓冲挂下一个 pidx 块开启的单元**（组内序
 *  前置=排笔记本体上方）：need-0926-05 留言排上方后，产物里留言块物理序在笔记
 *  **前**（li 子列表置前/直出裸平铺前置），旧「挂前面开着的单元」会把前置留言
 *  错挂到**前一条**笔记（6809 e2e B3 实测：留言跑上笔记1A）——前向归属让产物
 *  往返成不动点；流终/边界到来仍无 pidx=挂**最近开着的单元**（片内留言物理序
 *  在片尾=挂该片最后一条笔记，等价旧就近归属；无任何单元=独立单元承载不丢块）。 */
export interface UnitGroup {
    kind: "pass" | "unit";
    block?: StreamBlock;
    group?: StreamBlock[];
    /** unit 专用：首块=笔记本体（pidx 段的第一块；无 pidx 独立单元=该块自身） */
    head?: StreamBlock;
}

export function groupNoteUnits(
    stream: StreamBlock[],
    passthrough?: (div: HTMLElement) => boolean,
): UnitGroup[] {
    const items: UnitGroup[] = [];
    let cur: StreamBlock[] | null = null;
    let curPidx = "";
    let pending: StreamBlock[] | null = null;
    const attachPending = () => {
        if (pending && pending.length > 0) {
            if (cur) cur.push(...pending); // 兜底挂最近单元（组尾=物理序）
            else items.push({ kind: "unit", group: pending, head: pending[0] }); // 无单元=独立承载
        }
        pending = null;
    };
    for (const b of stream) {
        if (passthrough?.(b.div)) {
            attachPending();
            items.push({ kind: "pass", block: b });
            cur = null;
            curPidx = "";
            continue;
        }
        const pidx = b.div.getAttribute(PARAGRAPH_INDEX) ?? "";
        if (pidx && pidx !== curPidx) {
            // 开新单元：前置留言缓冲并入组首（排笔记本体上方），head=本 pidx 块
            cur = pending ?? [];
            pending = null;
            curPidx = pidx;
            items.push({ kind: "unit", group: cur, head: b });
            cur.push(b);
        } else if (!pidx) {
            (pending ??= []).push(b);
        } else {
            // 同 pidx 连续块（续写补充）挂当前
            cur!.push(b);
        }
    }
    attachPending();
    return items;
}

/** custom 块（visit-note 留言）净化成空壳 data-* 形态：getBlockDOM 序列化带内核
 *  custom-block__content 包装+渲染卡、cleanDivOnly 又把根 contenteditable 化，这
 *  种形态二次落库（bottom 产物→提取全部往返）被内核拍平成 li 纯文本；空壳+三
 *  件套（data-type/data-info/data-content）才是内核认的规范形态——contenteditable/
 *  class/updated 一并剥（editable 化的 custom 根内核走内容块解析路径=落库成空 li，
 *  0926 微实验对照：纯属性空壳落库成功）+attr 结尾子节点重建（innerHTML 全清=块尾
 *  无 protyle-attr 事务 HTML 结构非法）。 */
function sanitizeCustomBlock(div: HTMLElement) {
    div.removeAttribute(CONTENT_EDITABLE);
    div.removeAttribute("class");
    div.removeAttribute("updated");
    div.innerHTML = "";
    const attr = document.createElement("div");
    attr.classList.add("protyle-attr");
    attr.setAttribute(CONTENT_EDITABLE, "false");
    attr.textContent = WEB_ZERO_SPACE;
    div.appendChild(attr);
}

function isCustomBlock(div: HTMLElement): boolean {
    return !!div?.getAttribute && div.getAttribute(DATA_TYPE) === CUSTOM_BLOCK_TYPE;
}

/** 补充块入子列表：List 容器（用户列表形态）拆其 li 提级为子列表项——整容器再包
 *  一层 li 会渲染出双层圆点（双圆点回潮）；其余块各自包一个子 li（一条留言一行）。
 *  拆壳时把容器的 pidx 转移到每个拆出的 li：pidx 挂 l 容器是 markdown 插列表的
 *  自然形态（片内续写补充），随壳丢弃=产物 li 无片源标记，keys 散块保全认不出
 *  逐轮回流翻倍（0926 dev 实测）。搬入的 li 子树内 custom 块就地净化（流级
 *  cloneStream 只看顶层容器，嵌套在 li 内的 custom 拍平根因在此）。 */
function appendMessageItem(sub: DomListBuilder, div: HTMLElement) {
    if (div.getAttribute(DATA_TYPE) === BlockNodeEnum.NODE_LIST) {
        const pidx = div.getAttribute(PARAGRAPH_INDEX);
        for (const li of [...div.children]) {
            if (li.getAttribute(DATA_TYPE) !== BlockNodeEnum.NODE_LIST_ITEM) continue;
            li.removeAttribute(DATA_NODE_INDEX);
            if (pidx) li.setAttribute(PARAGRAPH_INDEX, pidx);
            for (const c of li.querySelectorAll(`[${DATA_TYPE}="${CUSTOM_BLOCK_TYPE}"]`)) {
                sanitizeCustomBlock(c as HTMLElement);
            }
            sub.container.append(li);
        }
        return;
    }
    if (isCustomBlock(div)) sanitizeCustomBlock(div);
    sub.append(div);
}

/** 装配主函数：块流 → 单元序列，条间空段断链。
 *  分组规则=物理序（groupNoteUnits）；**need-0926-05 B 混合双形态**：段落笔记（主流）
 *  =单 li 形态零变化（多块单元=li 内留言二级嵌套子列表）；非段落笔记（列表/引用/
 *  代码块/标题，isVerbatimNoteBlock）=原样直出不套壳，留言块裸平铺在前——**留言/
 *  补充一律排笔记本体上方**（bear 拍板，li 形态=子列表置前，直出形态=裸平铺前置）。
 *  星号=单元首块行尾（withHref，装配前清块内旧星号防双星号；直出形态=列表末项
 *  行尾/引用末子块行尾/标题自身行尾，代码块纯文本通道跳过）；markAttr 挂 li 的
 *  list 容器或直出块自身+空段（删旧语义）；noteHeadAttr 恒挂 head（笔记本体）；
 *  passthrough 块（原文块）平铺直通并充当分组边界——空段只插在相邻两个单元产物
 *  之间（直通块紧贴邻居，片间空行由调用方处理）。 */
export function buildNoteUnits(stream: StreamBlock[], opts: NoteUnitOpts = {}): HTMLElement[] {
    const { withHref = true, hrefText = " * ", markAttr = null, noteHeadAttr, passthrough } = opts;
    const items = groupNoteUnits(stream, passthrough);
    const out: HTMLElement[] = [];
    // 条间空段判据=上一输出是单元产物（li list 或直出块）——data-type 判定在 B 案
    // 直出块（NodeList/原文块同类）下分不清单元与直通，改标志位（顺手修正：直通
    // 原文块若恰为 NodeList 时旧判定会误插空段）
    let afterUnit = false;
    for (const it of items) {
        if (it.kind === "pass") {
            out.push(it.block.div);
            afterUnit = false;
            continue;
        }
        const u = it.group!;
        // head=分组事实源的笔记本体（it.head）——前向归属后流首可能是前置留言
        // （u[0]≠head），挂点/形态判定一律以 head 为准；rest=其余块（留言/补充）
        const head = it.head!;
        const rest = u.filter(b => b !== head);
        u.forEach(b => cleanStarLinks(b.div));
        if (withHref && head.srcID) addStarToUnitHead(head, hrefText);
        if (noteHeadAttr) head.div.setAttribute(noteHeadAttr[0], noteHeadAttr[1]);
        if (afterUnit) {
            const gap = new DomParaBuilder();
            if (markAttr) gap.setAttr(markAttr[0] as AttrKey, markAttr[1]);
            out.push(gap.build());
        }
        if (isVerbatimNoteBlock(head.div)) {
            // B 案直出：留言（其余块）裸平铺在前，head 原样直出不套壳；markAttr 挂块自身
            for (const b of rest) out.push(b.div);
            if (markAttr) head.div.setAttribute(markAttr[0] as AttrKey, markAttr[1]);
            out.push(head.div);
        } else {
            const list = new DomListBuilder();
            // append 一次调用=一个 li：整组一次传入（逐块调用会拆成每块一个 li）；
            // 子列表置前=留言排笔记本体上方（need-0926-05 拍板，全形态统一）
            if (rest.length === 0) {
                list.append(head.div);
            } else {
                const sub = new DomListBuilder();
                for (const b of rest) appendMessageItem(sub, b.div);
                // 全 List 容器补充拆空时退单块（空子列表内核不收）
                if (sub.container.childElementCount > 0) list.append(sub, head.div);
                else list.append(head.div);
            }
            if (markAttr) list.setAttr(markAttr[0] as AttrKey, markAttr[1]);
            out.push(list.build());
        }
        afterUnit = true;
    }
    return out;
}

/** 单元 head 星号挂点（need-0926-05 直出形态适配）：段落/标题=块自身行尾；列表=
 *  末项行尾；引用=末子块行尾；代码块=内容区纯文本通道（.hljs 以 textContent 落
 *  data-content，span 链接被内核拍平成字面 * 污染代码）——跳过不挂，cleanStarLinks
 *  照清防残留 */
function addStarToUnitHead(head: StreamBlock, hrefText: string) {
    const t = head.div.getAttribute(DATA_TYPE);
    if (t === BlockNodeEnum.NODE_CODE_BLOCK) return;
    let anchor = head.div;
    if (t === BlockNodeEnum.NODE_LIST) {
        const lis = [...head.div.children].filter(c =>
            c.getAttribute?.(DATA_TYPE) === BlockNodeEnum.NODE_LIST_ITEM);
        if (lis.length > 0) anchor = lis[lis.length - 1] as HTMLElement;
    } else if (t === BlockNodeEnum.NODE_BLOCKQUOTE) {
        const kids = [...head.div.children].filter(c =>
            c.getAttribute?.(DATA_TYPE) && !c.classList.contains("protyle-attr"));
        if (kids.length > 0) anchor = kids[kids.length - 1] as HTMLElement;
    }
    add_href(anchor, head.srcID, hrefText, true);
}

// ---- 链路侧 helpers ----

/** 块内星号回链（span[data-type=a] 文本 "*" 族）取其指向的块 id；无则空串。
 *  bottom 溯源（产物克隆体 → 片内原块）与 cleanStarLinks 配对使用。 */
export function starHrefID(div: HTMLElement): string {
    for (const s of div.querySelectorAll("span[data-type='a']")) {
        if ((s.textContent ?? "").trim() === "*") {
            const m = (s.getAttribute("data-href") ?? "").match(/blocks\/([0-9]{14}-[0-9a-z]{7})/);
            if (m) return m[1];
        }
    }
    return "";
}

/** 删块内旧星号回链（文本 "*" 族的超链接 span）——装配前清，防 withHref 叠双星号
 *  （用户开「分片带回链」时片内笔记自带星号，重提取叠加）。 */
export function cleanStarLinks(div: HTMLElement) {
    for (const s of [...div.querySelectorAll("span[data-type='a']")]) {
        if ((s.textContent ?? "").trim() === "*") s.parentElement?.removeChild(s);
    }
}

/** getDocBlocks 的 root.children → 装配流（srcID=原块 id） */
export function childrenToStream(children: Block[]): StreamBlock[] {
    return (children ?? []).map(c => ({ div: c.div, srcID: c.id }));
}

/** 流克隆净化：每块 cloneCleanDiv 换新 id+剥插件标记（pidx 保留=分组依据；
 *  stripAttrs 默认剥 progmark/in-book-index/progref/key-note——进产物无语义，
 *  key-note 由 keys 链路按需重新挂）。顶层 custom 块就地净化（嵌套在 List 容器
 *  li 内的由 appendMessageItem 搬运时补刀——净化动机见 sanitizeCustomBlock 注释）。 */
export function cloneStream(
    stream: StreamBlock[],
    stripAttrs: string[] = ["custom-progmark", "custom-in-book-index", "custom-progref", KEY_NOTE_KEY],
): StreamBlock[] {
    return stream.map(b => {
        const { div } = cloneCleanDiv(b.div);
        stripAttrs.forEach(a => removeAttribute(div, a as AttrKey));
        if (isCustomBlock(div)) sanitizeCustomBlock(div);
        return { div, srcID: b.srcID };
    });
}
