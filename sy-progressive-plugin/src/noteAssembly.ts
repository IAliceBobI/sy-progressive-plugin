// need-0926-01 提取产物统一装配层（四链路共用：提取到底部/keys/提取全部/合并汇编）。
// 纯函数层：无 .svelte / siyuan IO / Lute 依赖（DOM 构造走 happy-dom 单测直测，
// tailCardBlock 同款分层红线）。六子项映射：
// ① 一条笔记一个单元 = 单条无序列表（DomListBuilder 一 append 一 li）
// ② 条间空行 = 单元间空段断链（零 CSS；末单元后不插，产物无尾空行）
// ③ 留言/用户补充与笔记一体 = 无 pidx 块挂当前单元 li 内子块（物理序就近归属：
//    visit-note 留言是文档级 feed 无笔记锚——单笔记片天然对应，多笔记挂最后一条）
// ④ 星号超链接行尾（add_href atEnd=true；现状提取到底部在行首=四链路唯一行首源）
// ⑤ 底部产物优先取数 = pickPieceNotes（片底部有 custom-doc-notes 产物→取其内容流，
//    含用户补充；没有才取片内原笔记）——extractNotes/extractAllNotes 共用
// ⑥ 星号开关由调用方传 withHref（□2 设置键，默认带=现状行为）
// 另修：JSON 游标泄漏根因=尾卡 custom 块被装配层收进产物（getAllBlocks m1/m2/m3 与
// extractNotes SQL 过滤均无 custom 块刀）——filterStream 统一滤尾卡（6809 实测判据：
// data-type="NodeCustomBlock" + data-info=围栏名，2026-09-26）。

import {
    DATA_TYPE, BlockNodeEnum, PARAGRAPH_INDEX,
} from "../../sy-tomato-plugin/src/libs/gconst";
import { DomListBuilder, DomParaBuilder } from "../../sy-tomato-plugin/src/libs/sydom";
import { add_href, cloneCleanDiv, removeAttribute } from "../../sy-tomato-plugin/src/libs/utils";
import { TAIL_CARD_FENCE } from "./tailCardBlock";
import { VISIT_NOTE_FENCE } from "./visitNoteBlock";

/** 底部提取产物标记（新格式挂每单元 list 容器+条间空段，删旧=删所有带标记块；
 *  旧格式 sb 挂容器，同一判据通吃——extractNotes2bottom 删旧逻辑无需分叉） */
export const DOC_NOTES_KEY = "custom-doc-notes";
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
 *  其他容器原样返回。产物块序=文档序，物理序就近归属依赖此序保持。 */
export function flattenProductChildren(div: HTMLElement): HTMLElement[] {
    const kids = [...div.children].filter(c =>
        !c.classList.contains("protyle-action") && !c.classList.contains("protyle-attr"));
    const t = div.getAttribute(DATA_TYPE);
    if (t === BlockNodeEnum.NODE_SUPER_BLOCK || t === BlockNodeEnum.NODE_LIST_ITEM) {
        return kids as HTMLElement[];
    }
    if (t === BlockNodeEnum.NODE_LIST) {
        return kids
            .filter(c => c.getAttribute(DATA_TYPE) === BlockNodeEnum.NODE_LIST_ITEM)
            .flatMap(li => flattenProductChildren(li as HTMLElement));
    }
    return [div];
}

/** 片笔记取数（需求 5 优先级）：片顶层子块里存在底部产物（custom-doc-notes 标记，
 *  新旧格式通吃）→ 取产物内容流（含用户补充，flatten 后按文档序）；没有 → 片内
 *  原笔记流。两路都过 filterStream 净化（产物流同样滤尾卡/空段）。
 *  bottom 流 srcID 溯源：产物块是克隆体（容器 id 随删旧消亡），从块内旧星号链接
 *  （span[data-href] 指向片内原块）穿透取原块 id；无星号（上次装配 withHref=false）
 *  → 空串=本次也不加星号（buildNoteUnits 空值跳过），不断链不猜。 */
export function pickPieceNotes(children: StreamBlock[], opts: PickOpts = {}): {
    source: "bottom" | "inline";
    stream: StreamBlock[];
} {
    const products = children.filter(b => isBottomProduct(b.div));
    if (products.length > 0) {
        const stream = products.flatMap(b =>
            flattenProductChildren(b.div).map(div => ({ div, srcID: starHrefID(div) })));
        return { source: "bottom", stream: filterStream(stream, opts) };
    }
    return { source: "inline", stream: filterStream(children, opts) };
}

/** 装配主函数：块流 → 「单条无序列表+空段」交替序列。
 *  分组规则=物理序：带 custom-paragraph-index 的块开新单元（笔记本体），无 pidx 块
 *  （留言/用户补充）挂当前单元 li 内；流首块无 pidx 时独立单元承载（不丢块）。
 *  星号=每单元首块行尾（withHref，装配前清块内旧星号防双星号）；markAttr 挂 list
 *  与空段（删旧语义）；passthrough 块（原文块）平铺直通并充当分组边界——空段只插
 *  在相邻两个单元 list 之间（直通块紧贴邻居，片间空行由调用方处理）。 */
export function buildNoteUnits(stream: StreamBlock[], opts: NoteUnitOpts = {}): HTMLElement[] {
    const { withHref = true, hrefText = " * ", markAttr = null, passthrough } = opts;
    // 分组：直通块=独立输出项+分组边界；pidx 块开新单元；其余挂当前单元
    const items: { kind: "pass" | "unit"; block?: StreamBlock; group?: StreamBlock[] }[] = [];
    let cur: StreamBlock[] | null = null;
    const closeUnit = () => { cur = null; };
    for (const b of stream) {
        if (passthrough?.(b.div)) {
            items.push({ kind: "pass", block: b });
            closeUnit();
            continue;
        }
        if (cur === null || b.div.getAttribute(PARAGRAPH_INDEX)) {
            cur = [];
            items.push({ kind: "unit", group: cur });
        }
        cur.push(b);
    }
    const out: HTMLElement[] = [];
    for (const it of items) {
        if (it.kind === "pass") {
            out.push(it.block.div);
            continue;
        }
        const u = it.group;
        u.forEach(b => cleanStarLinks(b.div));
        const list = new DomListBuilder();
        if (withHref && u[0]?.srcID) add_href(u[0].div, u[0].srcID, hrefText, true);
        // append 一次调用=一个 li：整组一次传入（逐块调用会拆成每块一个 li）
        list.append(...u.map(b => b.div));
        if (markAttr) list.setAttr(markAttr[0] as AttrKey, markAttr[1]);
        // 相邻两单元之间才插空段（直通块紧贴）
        const prev = out[out.length - 1];
        if (prev && prev.getAttribute(DATA_TYPE) === BlockNodeEnum.NODE_LIST) {
            const gap = new DomParaBuilder();
            if (markAttr) gap.setAttr(markAttr[0] as AttrKey, markAttr[1]);
            out.push(gap.build());
        }
        out.push(list.build());
    }
    return out;
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
 *  key-note 由 keys 链路按需重新挂） */
export function cloneStream(
    stream: StreamBlock[],
    stripAttrs: string[] = ["custom-progmark", "custom-in-book-index", "custom-progref", "custom-prog-key-note"],
): StreamBlock[] {
    return stream.map(b => {
        const { div } = cloneCleanDiv(b.div);
        stripAttrs.forEach(a => removeAttribute(div, a as AttrKey));
        return { div, srcID: b.srcID };
    });
}
