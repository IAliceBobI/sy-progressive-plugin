import { IProtyle, Plugin } from "siyuan";
import { BlockNodeEnum, DATA_NODE_ID, DATA_NODE_INDEX, DATA_TYPE, IN_BOOK_INDEX, MarkKey, PARAGRAPH_INDEX, PDIGEST_CTIME, PDIGEST_LAST_ID, PROG_ORIGIN_TEXT, RefIDKey, TEMP_CONTENT } from "../../sy-tomato-plugin/src/libs/gconst";
import { cleanDiv, get_siyuan_lnk_md, parseIAL, replaceAll, addCardSetDueTime, siyuan, getAllContentEditableText, getAllText } from "../../sy-tomato-plugin/src/libs/utils";
import { getBookID } from "../../sy-tomato-plugin/src/libs/progressive";
import { digestProgressiveBox } from "./DigestProgressiveBox";
import { invalidateDigestMarker, markDigests } from "./digestMarker";
import { splitLines } from "./SplitSentence";
import { isMultiLineElement, SingleTab } from "../../sy-tomato-plugin/src/libs/docUtils";
import { digestLanding, digestAddReadingpoint, digestGlobalSigle, windowOpenStyle } from "../../sy-tomato-plugin/src/libs/stores";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import { getDailyPath } from "./FlashBox";
import { readingPointBox } from "../../sy-tomato-plugin/src/ReadingPointBox";
import { progStorage } from "./ProgressiveStorage";
import { ReviewKey, PdigestReviewKey, markQuestion, nextIntervalDays } from "./reviewQueue";
import { notifyFleetChanged } from "./fleetNotify";
import { PIECE_IDX_KEY, buildPieceIdx, piecePointFromMark, resolveDigestOrigin, validDigestMd, validDigestIdx } from "./originTrace";
import { isDigestHostDoc } from "./progFloatState";
import { bookCommentsFromRows, type BookCommentItem, type BookCommentRow } from "./digestComments";

// □12 摘抄标记零触碰统一（2026-08-30）：+ 链接（addPlusLnk）与写 style 背景（changeBG）
// 两个动正文路径退役，原文痕迹唯一机制=digestMarker span 渲染态（digestMarker.ts），
// 背景色并入 CSS div:has(> .prog-digest-mark)（index.scss，body 类总开关）。
// 存量正文里的 + 链接与 style 背景不清理（老政策：用户数据不动）。

export class DigestBuilder {
    protyle: IProtyle;
    element: HTMLElement;
    selected: HTMLElement[] = [];
    docID: string;
    docName: string;
    boxID: string;
    ids: string[];
    anchorID: string;
    plugin: Plugin;
    ctime: string;
    cardMode: string;
    bookID: string;
    allText: string;
    otab: SingleTab;
    attrs: AttrType;
    settings: TomatoSettings;
    /** □16：摘抄发起文档是片时的片序号（写片序号键用；null=非片发起） */
    piecePoint: number | null = null;
    /** v5：getBookID 结果是否为已注册的书——非书文本（含札记摘抄再摘抄）落札记匣 */
    inBook: boolean;
    /** writebook-next □4：落点去向级覆盖（"source"=书/源侧夹、"central"=总夹/札记匣）——
     *  浮条子排「挂书侧/归总夹」两钮逐次指定，不落盘不改 digestLanding 全局档（同
     *  cardMode 覆盖模式：intent 决定去向，saveCardMode 都不调）；undefined=跟全局档 */
    landingOverride?: "source" | "central";

    /** 落点档求值唯一入口（□4 收口）：override 优先于全局设置——daily 档下显式点了
     *  落点变体钮也一样走指定侧（显式意志胜出），故三处读值点全走这里 */
    private landing(): string {
        return this.landingOverride ?? digestLanding.get();
    }

    async init() {
        this.allText = getAllText(this.selected);
        this.ctime = this.element.getAttribute(PDIGEST_CTIME);

        const fallbackID = this.element.getAttribute(PDIGEST_LAST_ID);
        if (fallbackID) this.anchorID = fallbackID;

        const { bookID: markBookID } = await getBookID(this.docID);
        let refHit: { bookID: string; point: number } | null = null;
        if (!markBookID) {
            // □29 属性窗口兜底：片文档 IAL custom-progmark 走 createDocWithMd 两步后补，
            // 巨书出片后实测 24s+ 仍读不到 → 此处解析空、旧逻辑 fallback 片 id 会让摘抄
            // ctime 挂错归属（清单查空）。片内容块的 custom-progref（书原文块 id，随
            // insert 事务内联落盘、无后补窗口）在 DOM 上直读可靠，用它扫本地分片索引
            // 反查归属书与片序号。书态原书块无 progref 不命中，行为不变；自由态同。
            // 光标态 selected 可能是嵌套块（列表项内段等），progref 只挂 wysiwyg 直接
            // 子级的复制块上——沿父链爬到直接子级再取（reasoning P2-1）
            const refOf = (el: HTMLElement): string | null => {
                let n: HTMLElement | null = el;
                while (n && n.parentElement && !n.parentElement.classList.contains("protyle-wysiwyg")) {
                    n = n.parentElement;
                }
                return n?.getAttribute?.(RefIDKey) ?? null;
            };
            const refID = (this.selected ?? []).map(refOf).find(v => !!v) ?? "";
            if (refID) refHit = await progStorage.findPieceByBlockID(refID);
        }
        // 归属判定链（mark → progref 反查 → □8 书态兜底 → 自指）收拢为纯函数，
        // 优先级语义与 inBook（含「书已删记录已清落札记匣」）见 originTrace.resolveDigestOrigin
        const origin = resolveDigestOrigin({
            markBookID: markBookID ?? "",
            refHit,
            docID: this.docID,
            isRegistered: (id) => progStorage.isRegisteredBook(id),
        });
        this.inBook = origin.inBook;
        this.bookID = origin.bookID;

        this.attrs = await siyuan.getBlockAttrs(this.bookID);
        // 获取当前文档的属性，用于继承优先级等设置
        const currentDocAttrs = await siyuan.getBlockAttrs(this.docID);
        this.cardMode = this.attrs["custom-book-single-card"] ?? digestGlobalSigle.get();
        // 优先继承当前文档的优先级（如果在分片/摘抄文档内）
        if (currentDocAttrs["custom-card-priority"]) {
            this.attrs["custom-card-priority"] = currentDocAttrs["custom-card-priority"];
        }
        // □16 片序号键：发起文档是片（IAL custom-progmark）时记下片序号，
        // digest 里 parent-id 锚的片删掉后按它重切同片（片=一次性餐具可领新的）；
        // mark 同在两步属性窗口内读不到（□29）→ 反查所得 origin.point 兜底
        this.piecePoint = piecePointFromMark(currentDocAttrs[MarkKey]) ?? origin.point;
    }

    async saveCardMode() {
        const newAttrs = {} as AttrType;
        newAttrs["custom-book-single-card"] = this.cardMode;
        if (this.cardMode == "0") {
            siyuan.pushMsg(tomatoI18n.摘抄不加入闪卡);
        } else if (this.cardMode == "1") {
            siyuan.pushMsg(tomatoI18n.只有最新的一个摘抄加入闪卡);
        } else {
            siyuan.pushMsg(tomatoI18n.每个摘抄都加入闪卡);
        }
        await siyuan.setBlockAttrs(this.bookID, newAttrs);
    }

    /** 期1 □2 非日记档落点解析：书→digest 夹（源下档新建挂书下/集中档挂总夹下，已有夹 IAL 原位认回）；
     *  非书→源下档挂源文档下 digest-源文档名 夹/集中档进札记匣（□3 起匣内按源文档建夹归集，
     *  同 source 档命名法：札记匣/digest-源文档名/摘抄文档 三层） */
    private async landingDirID(): Promise<string> {
        const landing = this.landing();
        const source = landing === "source";
        if (this.inBook) {
            // □4 逐次 override：方向锚双夹（主力夹恰在该方向时 ensure 内复用，同位置不建双夹）
            if (this.landingOverride === "source") return progStorage.ensureDigestDirUnder(this.bookID);
            if (this.landingOverride === "central") return progStorage.ensureDigestDirHub(this.bookID);
            return progStorage.ensureDigestDir(this.bookID, source);
        }
        return source ? progStorage.ensureFreeDigestDir(this.docID) : progStorage.ensureNoteDir(this.docID);
    }

    private async setDigestCard(digestID: string) {
        if (this.landing() === "daily") {
            addCardSetDueTime(digestID)
        } else {
            if (this.cardMode == "0") {
                return;
            } else if (this.cardMode == "1") {
                // v5：digest 夹位置无关（IAL 锚定），子树旧卡直接按夹 ID 取；
                // 非书文本没有书夹，按札记匣子树清卡
                const dirID = await this.landingDirID();
                if (dirID) {
                    const cards = await siyuan.getTreeRiffCardsAll(dirID);
                    await siyuan.removeRiffCards(cards.map(card => card.id));
                }
            }
            addCardSetDueTime(digestID)
        }
    }

    private async newDigestDoc(idx: string, md: string, question = false, whole = false, forRecite = false) {
        const attr = {} as AttrType;
        const ct = new Date().getTime();
        attr["custom-pdigest-index"] = `${this.bookID}#${idx.padStart(10, "0")}`;
        attr["custom-pdigest-parent-id"] = this.docID;
        attr["custom-pdigest-last-id"] = this.anchorID;
        attr["custom-pdigest-ctime"] = `${this.bookID}#${ct}`;
        // □16：片发起的摘抄顺手写片序号键（parent-id 锚片 ID，片删后悬空；序号才可再生）
        if (this.piecePoint != null) attr[PIECE_IDX_KEY] = buildPieceIdx(this.bookID, this.piecePoint);
        attr["custom-card-priority"] = this.attrs["custom-card-priority"] ?? "60";
        attr["custom-off-tomatobacklink"] = "1";
        attr["custom-progmark"] = `${TEMP_CONTENT}#${this.bookID},${ct}`;
        // 期1 □2 落点三档：daily=当天日记（原 digest2dailycard）；source=书下/源文档下（老版回归）；
        // central=书→摘抄总夹/digest-书名，非书→札记匣（夹均按 IAL 锚定，位置无关）
        let boxID = this.boxID;
        let dirPath: string;
        if (this.landing() === "daily") {
            dirPath = getDailyPath().split("/").slice(0, -1).join("/");
        } else {
            const dirID = await this.landingDirID();
            if (!dirID) return "";
            // digest 夹可能刚建（首次摘抄），SQL 索引未进查空 box，走 getBlockInfo 文件树直查
            const info = await siyuan.getBlockInfo(dirID);
            if (!info?.box) return "";
            boxID = info.box;
            dirPath = await siyuan.getHPathByID(dirID, info.box);
            if (!dirPath) return "";
        }
        // 「仿写」前缀仅仿写副本链路（□28）：整摘副本无仿写语义不加，用户靠前缀一眼认出练习文档
        const title = `${forRecite ? "仿写" : ""}${question ? "❓" : ""}[${whole ? "整" : idx}]${this.allText.slice(0, 10)}`;
        const digestID = await siyuan.createDocWithMd(boxID, `${dirPath}/${title}`, md, "", attr);
        // 新摘抄即失效痕迹缓存：refMap 有 60s TTL，不失效则当前文档 ≤60s 内重出场不打新痕迹
        if (digestID) invalidateDigestMarker(this.bookID);
        return digestID;
    }

    /** 问题摘抄：给文档首个内容块打 custom-prog-think（曲线重访入口，见 reviewQueue.ts） */
    private async markQuestionOn(digestID: string) {
        if (!digestID) return;
        const rows = await siyuan.getChildBlocks(digestID);
        const first = rows.find(r => r.type !== "h");
        if (!first) return;
        await siyuan.setBlockAttrs(first.id, { [ReviewKey]: markQuestion(Date.now()) } as AttrType);
    }

    /** 期2 复访档：摘抄文档 IAL 打 pdigest-review（文档级滚动复习永不 done，见 reviewQueue.ts）。
     *  toast 顺带报首访间隔；notifyFleetChanged 即时刷 ✧ 徽章/火苗。 */
    private async markReviewOn(digestID: string) {
        if (!digestID) return;
        await siyuan.setBlockAttrs(digestID, { [PdigestReviewKey]: markQuestion(Date.now()) } as AttrType);
        await siyuan.pushMsg(tomatoI18n.已加入复访N天后回来(nextIntervalDays(0)));
        notifyFleetChanged();
    }

    async digest(split = false, question = false, review = false) {
        const { idx, md } = await getDigestMd(this.settings, this.selected, split, true, false);
        // 过滤空内容：移除空字符串、纯空白字符或仅包含属性行的条目（□16 抽出与整摘共用）
        const validMd = validDigestMd(md);
        if (validMd.length == 0) {
            siyuan.pushMsg(tomatoI18n.没有有效的摘抄内容);
            return;
        }
        const digestID = await this.newDigestDoc(idx, validMd.join("\n"), question);
        if (question) await this.markQuestionOn(digestID);
        if (review) await this.markReviewOn(digestID);
        // □12：摘抄后立即重打当前文档痕迹（竖条+背景渲染态）；缓存刚被 invalidate 失效，
        // 不必 force。不 await——otab.open 可能替换页签，fire-and-forget 持引用打标无害。
        // 卡片宿主 gate（群反馈 650189 根治）：在卡片里再摘时当前 protyle=卡片，拷贝块
        // progref 全命中源 refMap 会满挂卡片（「整篇变色」根因链）——数据照常落库，
        // 源文档出场自然挂出，卡片零痕迹。
        if (!isDigestHostDoc(this.ctime)) markDigests(this.protyle, this.bookID).catch(() => { });
        await this.otab.open(digestID, windowOpenStyle.get() as any, this.ids.at(0));
        await this.setDigestCard(digestID);
        if (digestAddReadingpoint.get()) {
            readingPointBox.addReadPointLock(this.ids[this.ids.length - 1], this.selected[this.selected.length - 1])
        }
    }

    /**
     * □16 整摘：一键整片/整文 → 新 digest 副本（用户在副本上挑拣删改成侧重化变形）。
     * 复用现有复制管道（getDigestMd+fastCopyBlock 同链路），IAL 属性行随块复制自动继承
     * progref——溯源/痕迹零额外工作。与 digest() 差异：selected=全文档顶层块、无选中态副作用
     * （不加原文标记/阅读点/trace）、cardMode 走书默认（"0" 不入卡）。
     * 返回新副本 docID（空内容早退返 ""——□27 仿写本片副本链路需要定向进仿写；
     * 现有整摘调用方忽略返回值无碍）。
     * forRecite（□28 仿写副本练习链路）：标题加「仿写」前缀 + 打开副本强制前台（"1" front）——
     * 练习对象就是副本本身，用户必须被带过去；windowOpenStyle 的 back/nop 档会把人留在原片，
     * 而后台副本加载事件会让 recite 背景跟角色错铺到原片。整摘链路不传，保持用户打开偏好。
     */
    async digestWhole(forRecite = false): Promise<string> {
        const { idx, md } = await getDigestMd(this.settings, this.selected, false, true, false);
        const validMd = validDigestMd(md);
        if (validMd.length == 0) {
            siyuan.pushMsg(tomatoI18n.没有有效的摘抄内容);
            return "";
        }
        const digestID = await this.newDigestDoc(idx, validMd.join("\n"), false, true, forRecite);
        if (!digestID) {
            // 摘抄目录解析失败（ensureDigestDir/getBlockInfo 瞬态空）——newDigestDoc 内部静默，
            // 此处补提示防「点了没反应」（review P2-2；副本链路据此知道已 toast）
            siyuan.pushMsg(tomatoI18n.摘抄目录未就绪请重试);
            return "";
        }
        // 整摘同享 invalidate 缓存失效，与 digest() 对称即时重打（review P2#4）；
        // 卡片宿主 gate 同 digest()（isDigestHostDoc，群反馈 650189 根治）
        if (!isDigestHostDoc(this.ctime)) markDigests(this.protyle, this.bookID).catch(() => { });
        await this.otab.open(digestID, (forRecite ? "front" : windowOpenStyle.get()) as any, this.ids.at(0));
        await this.setDigestCard(digestID);
        return digestID;
    }
}

// ============ □11 浮层族数据层（trace 文档机制的「拉」版替代，getDigestLnk SQL 链路复用） ============

/** 摘抄树节点：children=本摘抄上再摘抄的支路（支路→主干）；done=🔨 完成态（读侧保留） */
export interface DigestTreeNode {
    id: string;
    title: string;
    ctime: string;
    done: boolean;
    children: DigestTreeNode[];
}

export interface DigestTreeData {
    bookName: string;
    /** 顶层摘抄（parent 是书或不在摘抄集合内） */
    roots: DigestTreeNode[];
    /** 全部摘抄按 ctime 倒序（原文侧追溯浮层的清单形态用） */
    flat: DigestTreeNode[];
}

/** ctime 值剥 🔨 完成态前缀（finishDigest 写「🔨#bookID#ct」）；非完成态返回 null */
function doneCtime(v: string): string | null {
    return v.startsWith("🔨#") ? v.slice(2) : null;
}

/**
 * 查书的全摘抄树（路线图浮层/原文侧追溯浮层共用）：SQL 取书+全部摘抄文档（ctime
 * like `bookID#%` + 完成态 `🔨#bookID#%`——读侧保留 🔨 存量可见〔□11 review P1：写侧
 * 随三 tab Dialog 退役，完成态入口去留待拍板〕），parent-id 组树。环防护：挂树后先
 * 算完整不可达集（环+环上挂块）再统一提升进 roots——逐个提升会与已提升父重复挂载。
 */
export async function queryDigestTree(bookID: string): Promise<DigestTreeData> {
    // 外层显式 limit 防内核 64 截尾：内核只看最外层 SELECT 有无 LIMIT（block_query.go
    // getLimitClause），子查询自带的 limit 1000000 挡不住——摘抄 >64 篇的书整树丢节点
    const rows = await siyuan.sql(`select ial,content,id from blocks where id = "${bookID}" or id in
        (select block_id from attributes where name="${PDIGEST_CTIME}" and (value like "${bookID}#%" or value like "🔨#${bookID}#%") limit 1000000) limit 10000000`);
    let bookName = "";
    const nodes: DigestTreeNode[] = [];
    const parentOf = new Map<string, string>();
    for (const r of rows) {
        const a = parseIAL(r.ial);
        if (r.id === bookID) {
            bookName = r.content ?? "";
            continue;
        }
        const ct = a[PDIGEST_CTIME] ?? "";
        // 排序统一按剥前缀后的真实时间；done 单独记，弱化渲染用
        nodes.push({ id: r.id, title: r.content ?? "", ctime: doneCtime(ct) ?? ct, done: doneCtime(ct) != null, children: [] });
        parentOf.set(r.id, a["custom-pdigest-parent-id"] ?? "");
    }
    const byId = new Map(nodes.map(n => [n.id, n]));
    const roots: DigestTreeNode[] = [];
    for (const n of nodes) {
        const p = byId.get(parentOf.get(n.id) ?? "");
        if (p && p !== n) p.children.push(n);
        else roots.push(n);
    }
    // 环提升：先 DFS 收集从 roots 可达集，剩余完整不可达集一次性补进 roots（review P2）
    const seen = new Set<string>();
    const stack = [...roots];
    while (stack.length) {
        const n = stack.pop()!;
        if (seen.has(n.id)) continue;
        seen.add(n.id);
        stack.push(...n.children);
    }
    const unreachable = nodes.filter(n => !seen.has(n.id));
    if (unreachable.length > 0) {
        roots.push(...unreachable);
        stack.push(...unreachable);
        while (stack.length) {
            const m = stack.pop()!;
            if (seen.has(m.id)) continue;
            seen.add(m.id);
            stack.push(...m.children);
        }
    }
    const byCtimeDesc = (a: DigestTreeNode, b: DigestTreeNode) => -a.ctime.localeCompare(b.ctime);
    roots.sort(byCtimeDesc);
    const sortTree = (list: DigestTreeNode[]) => {
        list.sort(byCtimeDesc);
        list.forEach(n => sortTree(n.children));
    };
    sortTree(roots);
    const flat: DigestTreeNode[] = [];
    const collect = (list: DigestTreeNode[]) => {
        for (const n of list) {
            flat.push(n);
            collect(n.children);
        }
    };
    collect(roots);
    flat.sort(byCtimeDesc);
    return { bookName, roots, flat };
}

// □5 起批注属性模型切换：旧双键退役，改查 custom-tomato-annotations（JSON 数组，
// 选区=条目有 sel）；行→条目与净化语义在 digestComments.ts 纯函数层（单测锁定）
export type { BookCommentItem } from "./digestComments";

/** 查书子树内带批注属性的块（一块一属性键，点击跳原文块） */
export async function queryBookComments(bookID: string): Promise<BookCommentItem[]> {
    const rows = await siyuan.sql(`select a.block_id as id, a.value as v, b.content as c from attributes a
        left join blocks b on b.id = a.block_id
        where a.name = 'custom-tomato-annotations'
        and a.block_id in (select id from blocks where root_id = '${bookID}') limit 10000`);
    return bookCommentsFromRows((rows ?? []) as BookCommentRow[]);
}

export async function getDigestMd(settings: TomatoSettings, selected: HTMLElement[], split: boolean, ref = true, checkbox = false) {
    const md: string[] = [];
    if (selected == null || selected.length == 0) return { idx: "0", md };
    let idx: string;
    let i = 0;
    for (const div of selected) {
        // 序号清洗（[null] 标题根治，群反馈 650189 同场）：历史 setAttribute(key, null)
        // 落 "null" 字面量进块 IAL，真值脏值曾被当序号拼标题——validDigestIdx 兜底 "0"，
        // 且恒非空使下方 setAttribute(IN_BOOK_INDEX) 永不再产新脏值
        const inBookIdx = validDigestIdx(div.getAttribute(IN_BOOK_INDEX) ?? div.getAttribute(DATA_NODE_INDEX));

        let originID = div.getAttribute(RefIDKey);
        if (!originID) originID = div.getAttribute(DATA_NODE_ID);

        if (!idx) idx = inBookIdx;

        const cloned = div.cloneNode(true) as HTMLDivElement;
        // cloned.querySelectorAll(`div[${CONTENT_EDITABLE}="false"]`).forEach(e => e.setAttribute(CONTENT_EDITABLE, "true"));
        // const mOri = digestProgressiveBox.lute.BlockDOM2Md(cloned.outerHTML);

        await cleanDiv(cloned,
            !digestProgressiveBox.settings.digestNoBacktraceLink, // ref
            !digestProgressiveBox.settings.digestNoBacktraceLink, // ori
            settings.flashcardMultipleLnks, // more
            true, // ctx
        );
        cloned.setAttribute(RefIDKey, originID);
        cloned.setAttribute(IN_BOOK_INDEX, inBookIdx);
        cloned.setAttribute(PARAGRAPH_INDEX, String(i));
        cloned.setAttribute(PROG_ORIGIN_TEXT, "1");
        cloned.style.backgroundColor = "";

        const m = digestProgressiveBox.lute.BlockDOM2Md(cloned.outerHTML).trim();
        if (!split || cloned.getAttribute(DATA_TYPE) === BlockNodeEnum.NODE_LIST || isMultiLineElement(m)) {
            md.push(m);
        } else {
            const parts = m.trim().split("\n");
            let attrLine = parts.pop();
            // 确保 attrLine 是有效的属性行格式，否则恢复内容
            if (!attrLine || !attrLine.startsWith("{:")) {
                if (attrLine) parts.push(attrLine);
                attrLine = '{: id=""}';
            }
            const edit = getAllContentEditableText(cloned, "\n");
            let ps = [edit];
            ps = splitLines(ps);
            ps.map(p => replaceAll(p, "\u200b", "").trim())
                .filter(p => !!p)
                .filter(p => p != "@")
                .filter(p => p != "*")
                .filter(p => p != "@*")
                .filter(p => p != "*@")
                .forEach(p => {
                    if (ref) {
                        md.push(`${p}${get_siyuan_lnk_md(originID, "  *  ", digestProgressiveBox.settings.digestNoBacktraceLink)}\n${attrLine}`);
                    } else {
                        if (checkbox) {
                            md.push(`* [ ] ${p}\n${attrLine}`);
                        } else {
                            md.push(`${p}\n${attrLine}`);
                        }
                    }
                });
        }
        i++;
    }
    if (!idx) idx = "0";
    return { idx, md };
}
// ============ 期3 素材池（MaterialPicker 数据源） ============

export interface MaterialPoolItem {
    id: string;
    title: string;
    /** 剥 🔨 前缀后的毫秒时间串（排序键） */
    ctime: string;
    done: boolean;
}

export interface MaterialPoolGroup {
    /** 源书/源文档 docID */
    key: string;
    name: string;
    items: MaterialPoolItem[];
}

/** 全库摘抄池按源书分组（ctime 反查；含自由态——源为普通文档的摘抄）。组内条目
 *  ctime 倒序，组间=组内最新在前（活跃源书优先）。外层显式 limit 防内核 64 截尾 */
export async function queryMaterialPool(): Promise<MaterialPoolGroup[]> {
    const rows = await siyuan.sql(
        `select a.block_id as id, a.value as ctime, b.content from attributes a` +
        ` join blocks b on b.id = a.block_id and b.type = 'd'` +
        ` where a.name = '${PDIGEST_CTIME}' limit 10000000`) as any[] ?? [];
    const groups = new Map<string, MaterialPoolGroup>();
    for (const r of rows) {
        const raw = r.ctime ?? "";
        const done = raw.startsWith("🔨#");
        const ct = (done ? raw.slice("🔨#".length) : raw).split("#").pop() ?? "";
        const key = raw.startsWith("🔨#") ? raw.slice("🔨#".length).split("#")[0] : raw.split("#")[0];
        if (!key) continue; // 脏值行（无源 ID）静默剔除
        let g = groups.get(key);
        if (!g) {
            g = { key, name: "", items: [] };
            groups.set(key, g);
        }
        g.items.push({ id: r.id, title: r.content ?? "", ctime: ct, done });
    }
    for (const g of groups.values()) {
        g.items.sort((a, b) => Number(b.ctime || 0) - Number(a.ctime || 0));
    }
    // 组名：booksInfos bookName 缓存优先，缺失批量 SQL（源可能是普通文档=自由态摘抄）
    const { progStorage } = await import("./ProgressiveStorage");
    const missing = [...groups.values()].filter(g => !g.name).map(g => g.key);
    const nameMap = new Map<string, string>();
    for (const g of groups.values()) {
        const cached = progStorage.booksInfos()[g.key]?.bookName;
        if (cached) nameMap.set(g.key, cached);
    }
    const noName = missing.filter(k => !nameMap.has(k));
    if (noName.length) {
        const nameRows = await siyuan.sql(
            `select id, content from blocks where type='d' and id in (${noName.map(k => `'${k}'`).join(",")}) limit 10000000`) as any[] ?? [];
        for (const r of nameRows) nameMap.set(r.id, r.content ?? "");
    }
    const out = [...groups.values()].map(g => ({ ...g, name: nameMap.get(g.key) || g.key }));
    out.sort((a, b) => Number(b.items[0]?.ctime || 0) - Number(a.items[0]?.ctime || 0));
    return out;
}
