// need-0926-01 提取产物统一装配层（四链路共用：提取到底部/keys/提取全部/合并汇编）。
// 纯函数层：无 .svelte / siyuan IO / Lute 依赖（DOM 构造走 happy-dom 单测直测，
// tailCardBlock 同款分层红线）。六子项映射：
// ① 一条笔记一个单元 = **全块型原样直出（need-0927-04，放弃 li 嵌套产物形态）**：
//    段落/列表/引述/超级块/代码块/标题按源形态落（源自有的列表子层级保留，
//    「原样」非「无嵌套」；用户拍板「提取就该像复制粘贴：什么块落什么格式」，
//    v3.31.0 B 混合案不够——段落/超级块仍走 li 路径格式乱）——key-note/doc-notes
//    标记**随每块挂**（均匀命中，颜色不再只作用于首块）、星号挂行尾（列表=末项
//    行尾/引述与超级块=末子块行尾；代码块内容区是纯文本通道塞 span 会被内核拍平
//    成字面 * 污染代码=跳过不挂）
// ② 条间空行 = 单元间空段断链（零 CSS；末单元后不插，产物无尾空行）；开关由调用方
//    传 blankLine（need-0927-04 楼20 拍板：默认加+给开关可关，store=extractNoteNoBlankLine）
// ③ 留言/用户补充=**独立块**排笔记本体上方（need-0926-05 拍板维持现状；全直出形态
//    下不再有子列表嵌套），且**留言每条只出现一次**：装配入口按 visit-note
//    data-content 载荷去重——历史 B 混合形态的直出块不挂 doc-notes，旧轮留言拷贝在
//    片文档顶层残留、提取到底整文档取数逐轮再收=同留言重复进产物（陆杰 v3.31.0 复测
//    实锤，vision 图 3b84d7a4）。物理序就近归属——visit-note 留言是文档级 feed 无
//    笔记锚（单笔记片天然对应，多笔记挂最后一条）；**同 pidx 连续块=笔记后回车续写
//    的补充（内核续块继承 pidx）同挂当前单元**（0926 尾巴修复：曾被误判新笔记=keys
//    产物平级+双圆点+条间空行三症状）；**留言排上方后产物往返流里留言物理序在笔记
//    前=流首/边界后无 pidx 块先攒缓冲挂到下一个 pidx 单元**（groupNoteUnits 前向
//    归属，产物形态不动点；流终仍无 pidx=独立单元兜底不丢块）
// ④ 星号超链接行尾（add_href atEnd=true；现状提取到底部在行首=四链路唯一行首源）
// ⑤ 底部产物优先取数 = pickPieceNotes（片底部有 custom-doc-notes 产物→取其内容流，
//    含用户补充；没有才取片内原笔记）——extractNotes/extractAllNotes 共用
// ⑥ 星号开关由调用方传 withHref（need-0927-04 楼20 拍板开关化自由选择：提取到底/
//    keys 读 extractNoteNoBacktraceLink 默认带；提取全部沿用 extractAllNoBacktraceLink）
// 另修：JSON 游标泄漏根因=尾卡 custom 块被装配层收进产物（getAllBlocks m1/m2/m3 与
// extractNotes SQL 过滤均无 custom 块刀）——filterStream 统一滤尾卡（6809 实测判据：
// data-type="NodeCustomBlock" + data-info=围栏名，2026-09-26）。

import {
    DATA_TYPE, BlockNodeEnum, CONTENT_EDITABLE, PARAGRAPH_INDEX, WEB_ZERO_SPACE,
} from "../../sy-tomato-plugin/src/libs/gconst";
import { DomParaBuilder } from "../../sy-tomato-plugin/src/libs/sydom";
import { add_href, cloneCleanDiv, removeAttribute } from "../../sy-tomato-plugin/src/libs/utils";
import { TAIL_CARD_FENCE } from "./tailCardBlock";
import { VISIT_NOTE_FENCE } from "./visitNoteBlock";

/** 底部提取产物标记（need-0927-04 起随单元每块挂+条间空段，删旧=删所有带标记块；
 *  存量 li 壳格式挂容器/旧 sb 挂容器，同一判据通吃——extractNotes2bottom 删旧逻辑
 *  无需分叉） */
export const DOC_NOTES_KEY = "custom-doc-notes";
/** 提取笔记样式标记（need-0926-02 起三路提取链路统一挂；need-0927-04 起随单元
 *  **每块**挂——颜色均匀命中不因块型/位置而异）——帮助文档「提取的笔记」CSS 片段
 *  的命中锚；stripAttrs 剥源块旧标防跨轮残留 */
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
    /** 笔记块行尾星号超链接（默认 true；need-0927-04 楼20 拍板开关化：提取到底/keys
     *  读 extractNoteNoBacktraceLink、提取全部沿用 extractAllNoBacktraceLink） */
    withHref?: boolean;
    /** 星号文案（默认 " * "） */
    hrefText?: string;
    /** 单元标记挂**每块**+条间空段（底部产物传 ["custom-doc-notes","1"]；null=不挂）。
     *  need-0927-04 起随每块挂：直出形态无容器壳可挂，只挂 head 会让留言/补充成
     *  删旧盲区——提取到底整文档取数把它们逐轮再收=留言重复提取的存量形态 */
    markAttr?: readonly [string, string] | null;
    /** 笔记样式标记挂**单元每块**（笔记本体+留言/补充；need-0927-04 楼20 拍板「随
     *  每块挂」=颜色均匀命中不因块型/位置而异，此前只挂首块=陆杰复测「颜色部分
     *  生效」）。need-0926-02 起三路提取链路统一传 ["custom-prog-key-note","1"]——
     *  帮助文档「提取的笔记」CSS 片段的命中锚。合并汇编不传（产物含原文块，语义归
     *  need-0926-05 拍板）。 */
    noteHeadAttr?: readonly [string, string];
    /** 条间空行开关（默认 true=单元间插空段断链；need-0927-04 楼20 拍板给开关可关，
     *  store=extractNoteNoBlankLine；末单元后恒不插，产物无尾空行） */
    blankLine?: boolean;
    /** 直通判定：返回 true 的块不进装配输出（合并/汇编链路的原文块），并充当
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

/** 留言去重键（need-0927-04「每条只出现一次」）：visit-note 的 data-content JSON
 *  载荷（{v,text,ts}——text+ts 双字段，克隆净化链路恒保持，用户真改过留言=载荷变=
 *  不误伤；ts 不同的新留言也各是各键）。缺 data-content（异常形态）退化 textContent。 */
export function visitNoteDedupKey(div: HTMLElement): string {
    const c = div?.getAttribute?.("data-content");
    if (c) return c;
    return (div?.textContent ?? "").replace(/\u200B/g, "").trim();
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

/** 底部产物内容展开（取数目标）：**带 pidx 的容器=直出块整块返回不拆**（need-0927-04：
 *  列表与超级块笔记的 pidx 挂容器=markdown 插列表/超级块自然形态，拆开=容器丢失拍平
 *  ——vision 基线差距面；旧格式壳（sb/list 旧容器）无 pidx 照拆兼容）；无 pidx 时
 *  list=每个 li 的内容子块（跳过 .protyle-action 圆点钮与 .protyle-attr 属性行，li 根
 *  自身不是内容块）、sb=直接子块；其他容器原样返回。产物块序=文档序，物理序就近
 *  归属依赖此序保持。 */
export function flattenProductChildren(div: HTMLElement): HTMLElement[] {
    if (div.getAttribute(PARAGRAPH_INDEX)) return [div];
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

/** 深展开到内容块叶子（容器 List/li/sb 全拆，跳圆点钮/属性行）：keys 散块保全用
 *  ——存量 li 壳产物（v3.30/3.31 形态）的留言子列表容器自身无 pidx，整容器回收会
 *  连其内片源克隆（带 pidx 的续写补充/visit-note 留言）一起回流，与片流叠加逐轮
 *  翻倍（0926 dev 三轮实测）；拆到叶子粒度后 pidx/visit-note 刀才滤得干净。用户
 *  手写列表同样拆平（内容不丢；need-0927-04 全直出后以独立块落出，列表形态不保）。
 *  带 pidx 的容器不拆整块返回：pidx 挂 List 容器（markdown 插列表自然形态）时
 *  容器自身=片源单元（直出列表笔记/续写列表补充），extras 的 pidx 刀直接跳过——
 *  再拆会把容器层 pidx 丢掉滤不干净。 */
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
 *  need-0927-04 标记随每块挂后，产物顶层每块（笔记+留言+补充）都是带 doc-notes 标记
 *  的独立产物块，本函数=逐块展开剥标记；存量 li 壳形态（v3.30/3.31 产物）照拆兼容。
 *  展开后逐块剥，内容块以「无标记内容」身份进流。 */
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

/** 装配主函数：块流 → 单元序列，条间空段断链。
 *  分组规则=物理序（groupNoteUnits）；**need-0927-04 全块型原样直出（放弃 li 嵌套
 *  产物形态）**：单元每块独立输出——留言/补充=独立块排笔记本体上方（need-0926-05
 *  拍板维持现状），head 按源形态直出（段落/列表/引述/超级块…什么块落什么格式，
 *  源列表子层级原样保留）。星号=单元首块行尾（withHref，装配前清块内旧星号防双
 *  星号；行尾挂点=列表末项/引述与超级块末子块/标题与段落自身，代码块纯文本通道
 *  跳过）；markAttr/noteHeadAttr **随单元每块挂**（直出形态无容器壳，标记挂首块
 *  =留言成删旧盲区逐轮残留再收=留言重复；key-note 均匀命中=颜色不因块型而异）；
 *  留言按 data-content 载荷去重（每条只出现一次）；passthrough 块（原文块）平铺
 *  直通并充当分组边界——空段只插在相邻两个单元产物之间（blankLine 可关；直通块
 *  紧贴邻居，片间空行由调用方处理）。 */
export function buildNoteUnits(stream: StreamBlock[], opts: NoteUnitOpts = {}): HTMLElement[] {
    const { withHref = true, hrefText = " * ", markAttr = null, noteHeadAttr, passthrough, blankLine = true } = opts;
    // 留言去重（need-0927-04）：同载荷留言只留首条。四链路各自一次装配=去重域一次
    // 产物；对提取到底的整文档取数链路，历史形态未挂标记的旧轮留言拷贝与片内原件
    // 同流并收，在此收敛为一条（标记随每块挂后新产物不再产生残留，此刀兜存量）
    const seenNotes = new Set<string>();
    const deduped = stream.filter(b => {
        if (!isVisitNoteBlock(b.div)) return true;
        const key = visitNoteDedupKey(b.div);
        if (seenNotes.has(key)) return false;
        seenNotes.add(key);
        return true;
    });
    const items = groupNoteUnits(deduped, passthrough);
    const out: HTMLElement[] = [];
    // 条间空段判据=上一输出是单元产物（直通块紧贴不算）——标志位而非 data-type
    // 判定（直通原文块若恰为同类块会误插空段）
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
        // 标记随每块挂（need-0927-04）：key-note 均匀命中；markAttr 每块都在删旧
        // 判据内（提取到底删旧=删所有带标记顶层块，留言漏挂=残留逐轮再收）
        if (noteHeadAttr) u.forEach(b => b.div.setAttribute(noteHeadAttr[0], noteHeadAttr[1]));
        if (afterUnit && blankLine) {
            const gap = new DomParaBuilder();
            if (markAttr) gap.setAttr(markAttr[0] as AttrKey, markAttr[1]);
            out.push(gap.build());
        }
        // 全块型原样直出：留言/补充独立块在前，head 源形态原样（零 li 壳零子列表）
        for (const b of rest) {
            if (markAttr) b.div.setAttribute(markAttr[0] as AttrKey, markAttr[1]);
            out.push(b.div);
        }
        if (markAttr) head.div.setAttribute(markAttr[0] as AttrKey, markAttr[1]);
        out.push(head.div);
        afterUnit = true;
    }
    return out;
}

/** 单元 head 星号挂点（need-0927-04 全直出形态）：段落/标题=块自身行尾；列表=末项
 *  行尾；引述/超级块=末内容子块行尾（容器根直挂 span 非内容块=内核拍平面）；代码
 *  块=内容区纯文本通道（.hljs 以 textContent 落 data-content，span 链接被内核拍平
 *  成字面 * 污染代码）——跳过不挂，cleanStarLinks 照清防残留 */
function addStarToUnitHead(head: StreamBlock, hrefText: string) {
    const t = head.div.getAttribute(DATA_TYPE);
    if (t === BlockNodeEnum.NODE_CODE_BLOCK) return;
    let anchor = head.div;
    if (t === BlockNodeEnum.NODE_LIST) {
        const lis = [...head.div.children].filter(c =>
            c.getAttribute?.(DATA_TYPE) === BlockNodeEnum.NODE_LIST_ITEM);
        if (lis.length > 0) anchor = lis[lis.length - 1] as HTMLElement;
    } else if (t === BlockNodeEnum.NODE_BLOCKQUOTE || t === BlockNodeEnum.NODE_SUPER_BLOCK) {
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
 *  key-note 由装配层按需重新挂）。顶层 custom 块就地净化（need-0927-04 全直出后
 *  留言/补充都是顶层独立块，无嵌套搬运路径）。 */
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
