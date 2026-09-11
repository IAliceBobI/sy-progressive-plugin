// v5 □5 浮条三态纯逻辑：出场识别 + 按钮组构造（视觉方案 docs/prog-v5-floatbar-design.md §3.1）。
// 可单测纯逻辑，UI 层（ProgressiveBtn/ProgressiveFloatBtns）只消费这里的结果（□12 起识别
// 函数经 progData 复用 ctime 解析，依赖链经 vitest siyuan stub 可进单测，见 fleetData 先例）。
import { MarkKey, PDIGEST_CTIME } from "../../sy-tomato-plugin/src/libs/gconst";
import { parseBookIDFromCtime } from "./progData";

/** 四态：book=原书 / piece=分片 / digest=摘抄文档 / free=自由态（□11 普通文档摘抄上岗） */
export type FloatDocKind = "book" | "piece" | "digest" | "free";

/** 识别结果载荷：出场链除了 kind 还要 bookID/point 驱动按钮动作 */
export interface FloatDocIdentity {
    kind: FloatDocKind;
    /** digest=源书 / piece=所属书 / book=书自身 */
    bookID: string;
    /** 片号（仅 piece 态有意义，其余为 0） */
    point: number;
}

/**
 * 识别当前文档属于哪态并提取载荷（浮条出场链唯一识别入口，ProgressiveBtn 旧内联已收编）：
 * - digest：文档 IAL custom-pdigest-ctime（兼容已完成的 🔨#bookID#ct 形态，书 ID 取首段）
 * - 片：文档 IAL custom-progmark（TEMP#bookID,point）
 * - 书：docID 命中注册书（isRegisteredBook 回调，生产侧注入 progStorage.isRegisteredBook）
 * 判据优先级 pdigest > mark > book：真实 digest 文档自带片形状 custom-progmark
 * （2024 起防删护栏 TEMP_CONTENT#bookID,ctime），mark 优先会把摘抄误判成片（□16 e2e 实锤）。
 * 载荷不完整（mark 缺书 ID/片号、ctime 解析空书 ID）= 该态不成立——出场按钮动作
 * 靠载荷驱动，缺载荷的态无法出场（沿用旧内联语义）。
 * □12：片 IAL 两步后补的窗口期内 attrs 快照可能读不到 mark（本函数返回 null 并非
 * 真非三态），调用方以 getBlockAttrs 重查内核真值再识别一次兜底；本函数自身无 I/O。
 */
export function detectFloatDoc(
    attrs: Record<string, string> | undefined,
    docID: string,
    isRegisteredBook: (id: string) => boolean,
): FloatDocIdentity | null {
    const ctime = attrs?.[PDIGEST_CTIME];
    if (ctime) {
        const bookID = parseBookIDFromCtime(ctime);
        if (bookID) return { kind: "digest", bookID, point: 0 };
    }
    const mark = attrs?.[MarkKey]?.split("#")?.at(1)?.split(",") ?? [];
    const point = parseInt(mark[1]);
    if (mark[0] && Number.isInteger(point)) return { kind: "piece", bookID: mark[0], point };
    if (docID && isRegisteredBook(docID)) return { kind: "book", bookID: docID, point: 0 };
    return null;
}

/**
 * 出场展开求值（2026-09-02 浮条展开偏好持久化）：pref=用户最后一次显式意志
 * （点球展开/点 ✕ 收起，petal 落盘；null=从未表达）。有偏好跟偏好、无偏好维持
 * 出厂默认（片/free 展开、书/摘抄收球——与旧 userCollapsed 时代行为逐位一致，
 * 老用户升级零迁移）。free 恒展开不看偏好（□11 上岗即展开拍板不被偏好推翻）。
 */
export function expandAtAppear(pref: boolean | null, kind: FloatDocKind): boolean {
    if (kind === "free") return true;
    return pref ?? kind === "piece";
}

/**
 * 附属卡到期刷新守卫：digest 态出场载荷 bookID 可能是非书摘抄的源文档 ID（札记匣/
 * 源下夹摘抄），其「digest-源名」夹子树永远无卡——ensure 只会建 100% 空夹污染总夹
 * （期1 □2 Task 6 dev e2e 实锤）。到期数只对注册书刷新。
 */
export function shouldRefreshDue(bookID: string, isRegisteredBook: (id: string) => boolean): boolean {
    if (!bookID) return false;
    return isRegisteredBook(bookID);
}

/**
 * 出场摘抄痕迹求值（群反馈 650189 根治，2026-09-05 深夜）：返回 markDigests 的 bookID
 * 实参（空串=不打标）。片/书态用出场载荷 bookID（片=所属书、书=自身）；free 态载荷
 * bookID 恒空（detectFloatDoc 对普通文档返回 null），按 docID 自指查 refMap——free
 * 摘抄 ctime=`docID#ct`（resolveDigestOrigin 三链落空自指同源）。digest 态恒空串：
 * 卡片拷贝块自带 progref 指向原块，按源 refMap 查询全命中会满挂卡片（用户报障
 * 「摘抄后整篇变色」根因，v3.4.1 出场链使它从概率性一次变每次出场幂等重打）——
 * 痕迹只挂源文档，卡片零痕迹（出场残留清理见 clearDigestMarks）。
 */
export function digestMarkBookID(kind: FloatDocKind, bookID: string, docID: string): string {
    if (kind === "digest") return "";
    if (kind === "free") return docID;
    return bookID;
}

/**
 * 摘抄动作链挂载 gate（群反馈 650189 根治）：宿主文档是 digest 卡片时不当场挂痕——
 * 卡片里再摘/整摘时当前 protyle=卡片，拷贝块 progref 指向原块全命中源 refMap 会满挂
 * 卡片（v3.4.0 时代「偶发大片」即此链）。摘抄数据照常落库（ctime+progref），源文档
 * （书/free 态）出场自然挂出。ctime=宿主 wysiwyg 的 custom-pdigest-ctime
 * （DigestBuilder.init 直读，同 markDigestTag 判据）。
 */
export function isDigestHostDoc(ctime: string | null | undefined): boolean {
    return !!ctime;
}

export type FloatBtnKind = "common" | "primary" | "normal" | "ghost";

export interface FloatButtonSpec {
    /** 动作 id（跨态稳定：公共组同 id 必同 icon 同动作） */
    id: string;
    /** progIcons.ts 的 symbol 名 */
    icon: string;
    kind: FloatBtnKind;
    group: "common" | "scene";
}

// 场景组按钮（方案 §3.1：primary=本态主推进，normal=次操作，ghost=退出/弱化类）
const SCENE: Record<FloatDocKind, FloatButtonSpec[]> = {
    book: [
        { id: "continue", icon: "iconProgPlay", kind: "primary", group: "scene" },     // ▶继续读（断点开片）
        { id: "toPiece", icon: "iconProgPiece", kind: "normal", group: "scene" },      // 📄跳到分片（□2 选中/光标块就地定位，≠continue 全局断点）
        { id: "summary", icon: "iconProgQuill", kind: "normal", group: "scene" },      // ✒摘抄汇总
        { id: "addBook", icon: "iconProgAddBook", kind: "ghost", group: "scene" },     // 📥加书（□18 各态常驻；已是书=AddBook 重复注册路径现成）
        { id: "archive", icon: "iconProgArchive", kind: "ghost", group: "scene" },     // 📦归档
    ],
    piece: [
        { id: "next", icon: "iconProgNext", kind: "primary", group: "scene" },         // ➡下一片·删本片
        { id: "prev", icon: "iconProgPrev", kind: "normal", group: "scene" },          // ⬅纯回看
        { id: "origin", icon: "iconProgBook", kind: "ghost", group: "scene" },         // 📖原书
        { id: "addBook", icon: "iconProgAddBook", kind: "ghost", group: "scene" },     // 📥加书（□18 各态常驻）
    ],
    digest: [
        { id: "recite", icon: "iconProgSend", kind: "primary", group: "scene" },       // ✍送仿写（未装不显示）
        { id: "revisit", icon: "iconProgSched", kind: "normal", group: "scene" },      // ✧复访动作组（□7：两态菜单+到期红点；id 不用 review——子排 review 是创建语境）
        // □6 摘抄顺序遍历（bear 拍板双向纯浏览不删）：iconProgNext=删后走专属形（右上箭头
        // +×角标）不适用，纯走位走 prev/nextPure 双向对家族（iconProgPrev/iconProgFFast）
        { id: "prev", icon: "iconProgPrev", kind: "normal", group: "scene" },          // ⬅上一条摘抄
        { id: "next", icon: "iconProgFFast", kind: "normal", group: "scene" },         // ➡下一条摘抄
        { id: "origin", icon: "iconProgBook", kind: "normal", group: "scene" },        // 📖回原书（定位原文块）
        { id: "tree", icon: "iconProgTree", kind: "normal", group: "scene" },          // 🌳路线图浮层（□11）
        { id: "summary", icon: "iconProgQuill", kind: "ghost", group: "scene" },       // ✒摘抄汇总
    ],
    // □11 自由态（普通文档摘抄上岗）：✂ 子排 + 📥 加书两键起步，无公共组
    free: [
        { id: "digest", icon: "iconProgScissors", kind: "primary", group: "scene" },   // ✂摘抄子排（非书文本落札记匣）
        { id: "addBook", icon: "iconProgAddBook", kind: "normal", group: "scene" },    // 📥加书（AddBook 弹窗，加完变书态）
    ],
};

/**
 * 首行可勾的托盘动作 id（设置面板 checkbox 池的额外三项）：
 * ⏩纯前进/⬅🗑后退删/🕺关闭分片。未勾 = 平铺区小格。
 */
export const PIECE_TRAY_POOL = ["nextPure", "delBack", "quit"];

/** 托盘动作的主排 spec（勾选后按此进主排，kind 沿用场景组语义） */
const TRAY_SCENE: FloatButtonSpec[] = [
    { id: "nextPure", icon: "iconProgFFast", kind: "normal", group: "scene" },
    { id: "delBack", icon: "iconProgDelBack", kind: "normal", group: "scene" },
    { id: "quit", icon: "iconProgQuit", kind: "ghost", group: "scene" },
];

/**
 * 构造某态的主按钮组（不含 [+]——它是恒定 affordance 由 UI 直接渲染）。
 * 公共组：书+片 = ✂摘抄/🗂附属卡/🔄换书；三态 = 🗂附属卡（摘抄态无 ✂ 无 🔄）；
 * 自由态 = 无公共组（✂📥 两键起步，附属卡/换书无书可挂）。
 * opts.mainIds：首行有序清单（□14c 拖拽 B 档升级——全量池任意可入，顺序即渲染序；
 * 设置面板 checkbox 与浮条拖拽双通道共写；free/digest/book 态同机制独立清单独立池
 * ——650189 两轮反馈：2026-09-09 自由态、2026-09-10 书/摘抄态，四态行为一致）。
 * mainIds 缺省走固有编排（兼容未初始化路径）。
 */
export function buildFloatButtons(
    kind: FloatDocKind,
    opts: { reciteInstalled: boolean; mainIds?: string[] },
): FloatButtonSpec[] {
    const common: FloatButtonSpec[] = [];
    if (kind === "book" || kind === "piece") {
        common.push({ id: "digest", icon: "iconProgScissors", kind: "common", group: "common" });
        common.push({ id: "swap", icon: "iconProgSwap", kind: "common", group: "common" });
        // cards 插在 digest 之后（视觉顺序：✂ 🗂 🔄）
        common.splice(1, 0, { id: "cards", icon: "iconProgCard", kind: "common", group: "common" });
    } else if (kind === "digest") {
        // □11 digest 态开子排（bear「浮条应与分片差不多」）：✂ 钮=子排开合+收起通道
        //（与 book/piece 公共组同款），视觉顺序 ✂ 🗂
        common.push({ id: "digest", icon: "iconProgScissors", kind: "common", group: "common" });
        common.push({ id: "cards", icon: "iconProgCard", kind: "common", group: "common" });
    }
    // 拷贝再改（review P2：直接改 SCENE 常量对象是不可逆突变——recite 装上后双 primary）
    const scene = SCENE[kind].map(b => ({ ...b })).filter(b => b.id !== "recite" || opts.reciteInstalled);
    // recite 未装时 primary 落到回原书
    if (kind === "digest" && !opts.reciteInstalled) {
        const origin = scene.find(b => b.id === "origin")!;
        origin.kind = "primary";
    }
    if (kind === "piece" && opts.mainIds) {
        // □14c：mainIds 有序清单——顺序即首行渲染序（拖拽落子/设置面板追加都产有序数组）；
        // 未知 id（未来退役动作的存量配置）静默跳过不渲染
        const map = new Map(PIECE_ALL_MAIN.map(b => [b.id, b]));
        return opts.mainIds.map(id => map.get(id)).filter(b => b != null);
    }
    if (kind === "free" && opts.mainIds) {
        // 自由态同机制（650189 拖动排序反馈）：独立清单独立池，与片态互不投影
        const map = new Map(FREE_ALL_MAIN.map(b => [b.id, b]));
        return opts.mainIds.map(id => map.get(id)).filter(b => b != null);
    }
    if (kind === "digest" && opts.mainIds) {
        // 摘抄态同机制（650189 第二轮「片摘处的浮窗也无法拖动排序」）：recite 未装的
        // 滤除+origin 升 primary 与上面 SCENE 分支同语义（拷贝再改，同 review P2 纪律）
        const pool = DIGEST_ALL_MAIN.map(b => ({ ...b })).filter(b => b.id !== "recite" || opts.reciteInstalled);
        if (!opts.reciteInstalled) {
            const origin = pool.find(b => b.id === "origin");
            if (origin) origin.kind = "primary";
        }
        const map = new Map(pool.map(b => [b.id, b]));
        return opts.mainIds.map(id => map.get(id)).filter(b => b != null);
    }
    if (kind === "book" && opts.mainIds) {
        // 书态同机制（四态补全）：无 reciteInstalled 分叉（recite 只在 digest/片态池）
        const map = new Map(BOOK_ALL_MAIN.map(b => [b.id, b]));
        return opts.mainIds.map(id => map.get(id)).filter(b => b != null);
    }
    return [...common, ...scene];
}

/**
 * 片态首行可配置按钮池 id 集（设置面板 checkbox 清单同源）：
 * ✂摘抄/🗂附属卡/🔄换书/➡删+进/⬅回看/📖原书/📥加书（□18）。
 */
export const PIECE_MAIN_POOL = ["digest", "cards", "swap", "next", "prev", "origin", "addBook"];

/**
 * □14c 片态恒低频段（buildFlatCells 的 always 段独立成常量供设置面板池复用）。
 * □11 增 map（🗺 路线指引浮层，四态通用低频）；□27 增 recite（✍仿写本片——副本练习，
 * 恒可见不做未装过滤，未装点击 toast 引导=导流语义，同 □26 书态页脚口径）；
 * □29 增 traceUp（📋本书摘抄清单，片态复用书态浮层——用户点名「分篇也要能看」）。
 */
export const PIECE_LOW_POOL = ["contents", "refill", "clean", "delExit", "ignore", "map", "traceUp", "recite"];

/**
 * □14c 高级四组 14 项 id（设置面板池复用；顺序 = 制卡|收集|移动|提取整理 组语义序）。
 */
export const ADV_POOL = [
    "card", "cardHere", "cardDailyN", "multi",
    "collect",
    "movePrev", "moveNext",
    "extractAll", "extractEnd", "extract", "noColor", "reColor", "merge",
];

/**
 * □14c 首行全量池（32 项 = 7 池钮 + 3 托盘 + 8 低频 + 14 高级，VIP 门已拆）：mainIds 有序清单
 * 可引用的全部动作 spec。低频/高级项 kind：默认 normal，退出/弱化语义（删原文/删片
 * 退/不再推送）ghost 与 SCENE 家族同口径。icon 与 UI 层 ADV_GROUPS / FLAT_ICONS
 * 同源（改动须两处同步——纯逻辑层保单测覆盖，UI 层 icon 名历史在彼）。
 */
const EXTRA_MAIN: FloatButtonSpec[] = [
    // 低频段
    { id: "contents", icon: "iconProgContents", kind: "normal", group: "scene" },
    { id: "refill", icon: "iconProgRefill", kind: "normal", group: "scene" },
    { id: "clean", icon: "iconProgClean", kind: "ghost", group: "scene" },
    { id: "delExit", icon: "iconProgDelExit", kind: "ghost", group: "scene" },
    { id: "ignore", icon: "iconProgIgnore", kind: "ghost", group: "scene" },
    { id: "map", icon: "iconProgMap", kind: "normal", group: "scene" }, // □11 路线指引浮层
    // □27 仿写本片（片态副本练习）：icon 同 digest 态送仿写家族；跨态同 id 异义——
    // digest 态 recite=把摘抄送进仿写（SCENE），片态=本片副本开练，dispatch 层按 kind 分流
    { id: "recite", icon: "iconProgSend", kind: "normal", group: "scene" },
    { id: "traceUp", icon: "iconProgTraceUp", kind: "normal", group: "scene" }, // □11 原文侧追溯浮层（书态）
    // 高级 14（组语义序同 ADV_POOL）
    { id: "card", icon: "iconProgCardAdd", kind: "normal", group: "scene" },
    { id: "cardHere", icon: "iconProgCardHere", kind: "normal", group: "scene" },
    { id: "cardDailyN", icon: "iconProgCardDailyN", kind: "normal", group: "scene" },
    { id: "multi", icon: "iconProgMulti", kind: "normal", group: "scene" },
    { id: "collect", icon: "iconProgCollect", kind: "normal", group: "scene" },
    { id: "movePrev", icon: "iconProgMoveUp", kind: "normal", group: "scene" },
    { id: "moveNext", icon: "iconProgMoveDown", kind: "normal", group: "scene" },
    { id: "extractAll", icon: "iconProgExtractAll", kind: "normal", group: "scene" },
    { id: "extractEnd", icon: "iconProgExtractEnd", kind: "normal", group: "scene" },
    { id: "extract", icon: "iconProgExtract", kind: "normal", group: "scene" },
    { id: "noColor", icon: "iconProgNoColor", kind: "normal", group: "scene" },
    { id: "reColor", icon: "iconProgRecolor", kind: "normal", group: "scene" },
    { id: "merge", icon: "iconProgMerge", kind: "normal", group: "scene" },
];

/** 片态首行全量池（buildFloatButtons 的 mainIds 查表源） */
const PIECE_ALL_MAIN: FloatButtonSpec[] = [
    { id: "digest", icon: "iconProgScissors", kind: "common", group: "common" },
    { id: "cards", icon: "iconProgCard", kind: "common", group: "common" },
    { id: "swap", icon: "iconProgSwap", kind: "common", group: "common" },
    { id: "next", icon: "iconProgNext", kind: "primary", group: "scene" },
    { id: "prev", icon: "iconProgPrev", kind: "normal", group: "scene" },
    { id: "origin", icon: "iconProgBook", kind: "ghost", group: "scene" },
    { id: "addBook", icon: "iconProgAddBook", kind: "ghost", group: "scene" }, // □18 各态常驻（存量 mainIds 未含 → 平铺区兜底可见）
    ...TRAY_SCENE,
    ...EXTRA_MAIN,
];

/** 全量池 id 集（消费方载入/落盘前过滤未知 id，保证显示序≡数据序——reasoning review P2） */
export const PIECE_ALL_MAIN_IDS = new Set(PIECE_ALL_MAIN.map(b => b.id));

/**
 * 自由态首行全量池（650189 拖动排序反馈，2026-09-09）：6 项 = SCENE.free 两键 + 平铺区
 * 低频四项。icon 与片态全量池同源同值（digest=✂/addBook=📥/contents/map/traceUp/ignore），
 * kind 档按 free 语义：✂ 是本态唯一 primary（子排开合锚点），ignore=ghost（弱化语义）。
 * 片态专属动作（next/prev/origin 等）不入池——free 无片可推进。
 */
const FREE_ALL_MAIN: FloatButtonSpec[] = [
    { id: "digest", icon: "iconProgScissors", kind: "primary", group: "scene" },
    { id: "addBook", icon: "iconProgAddBook", kind: "normal", group: "scene" },
    { id: "contents", icon: "iconProgContents", kind: "normal", group: "scene" },
    { id: "traceUp", icon: "iconProgTraceUp", kind: "normal", group: "scene" },
    { id: "map", icon: "iconProgMap", kind: "normal", group: "scene" },
    { id: "ignore", icon: "iconProgIgnore", kind: "ghost", group: "scene" },
];

/** 自由态全量池 id 集（mainIds 载入/落盘过滤面，同 PIECE_ALL_MAIN_IDS 语义） */
export const FREE_ALL_MAIN_IDS = new Set(FREE_ALL_MAIN.map(b => b.id));

/**
 * 摘抄态首行全量池（650189 第二轮反馈，2026-09-10）：10 项 = common 两键 + SCENE.digest
 * 7 键 + 平铺区低频 map。kind/icon 与 SCENE 段同源同值（recite=primary，summary=ghost）；
 * recite 未装的滤除/origin 升 primary 在 buildFloatButtons mainIds 分支处理（与 SCENE
 * 分支同语义）。片/书态专属动作（swap/toPiece/continue 等）不入池。
 */
const DIGEST_ALL_MAIN: FloatButtonSpec[] = [
    { id: "digest", icon: "iconProgScissors", kind: "common", group: "common" },
    { id: "cards", icon: "iconProgCard", kind: "common", group: "common" },
    { id: "recite", icon: "iconProgSend", kind: "primary", group: "scene" },
    { id: "revisit", icon: "iconProgSched", kind: "normal", group: "scene" },
    { id: "prev", icon: "iconProgPrev", kind: "normal", group: "scene" },
    { id: "next", icon: "iconProgFFast", kind: "normal", group: "scene" },
    { id: "origin", icon: "iconProgBook", kind: "normal", group: "scene" },
    { id: "tree", icon: "iconProgTree", kind: "normal", group: "scene" },
    { id: "summary", icon: "iconProgQuill", kind: "ghost", group: "scene" },
    { id: "map", icon: "iconProgMap", kind: "normal", group: "scene" },
];

/** 摘抄态全量池 id 集（mainIds 载入/落盘过滤面，同 PIECE_ALL_MAIN_IDS 语义） */
export const DIGEST_ALL_MAIN_IDS = new Set(DIGEST_ALL_MAIN.map(b => b.id));

/**
 * 书态首行全量池（650189 第二轮反馈，2026-09-10）：12 项 = common 三键 + SCENE.book
 * 5 键 + 平铺区低频四项（contents/traceUp/ignore/map）。kind 与 SCENE 段同源同值
 * （continue=primary，addBook/archive/ignore=ghost）。摘抄/片态专属动作不入池。
 */
const BOOK_ALL_MAIN: FloatButtonSpec[] = [
    { id: "digest", icon: "iconProgScissors", kind: "common", group: "common" },
    { id: "cards", icon: "iconProgCard", kind: "common", group: "common" },
    { id: "swap", icon: "iconProgSwap", kind: "common", group: "common" },
    { id: "continue", icon: "iconProgPlay", kind: "primary", group: "scene" },
    { id: "toPiece", icon: "iconProgPiece", kind: "normal", group: "scene" },
    { id: "summary", icon: "iconProgQuill", kind: "normal", group: "scene" },
    { id: "addBook", icon: "iconProgAddBook", kind: "ghost", group: "scene" },
    { id: "archive", icon: "iconProgArchive", kind: "ghost", group: "scene" },
    { id: "contents", icon: "iconProgContents", kind: "normal", group: "scene" },
    { id: "traceUp", icon: "iconProgTraceUp", kind: "normal", group: "scene" },
    { id: "ignore", icon: "iconProgIgnore", kind: "ghost", group: "scene" },
    { id: "map", icon: "iconProgMap", kind: "normal", group: "scene" },
];

/** 书态全量池 id 集（mainIds 载入/落盘过滤面，同 PIECE_ALL_MAIN_IDS 语义） */
export const BOOK_ALL_MAIN_IDS = new Set(BOOK_ALL_MAIN.map(b => b.id));

/**
 * 首行拖拽重排数学（□14c，四态共用）：renderIds=当前首行渲染序（data 序可能含被
 * 滤除不渲染的隐藏 id——digest 态 recite 未装；「显示序≡数据序」不变量在该分叉破缺，
 * 故事实源取渲染序，reasoning review P0-1）；dropIndex=显示序插入位（dragover 钮中点
 * 二分量得）。原位在插入位之前时移除后索引前移一格；从平铺区拖入 dragIdx0=-1 不修。
 * 隐藏 id 被顺带清出清单：渲染无感知，recite 装上后走平铺区兜底找回（不彻底消失）。
 */
export function reorderMainIds(renderIds: string[], dragId: string, dropIndex: number): string[] {
    const dragIdx0 = renderIds.indexOf(dragId);
    const adj = dragIdx0 >= 0 && dragIdx0 < dropIndex ? -1 : 0;
    const next = renderIds.filter(id => id !== dragId);
    next.splice(dropIndex + adj, 0, dragId);
    return next;
}

/**
 * □10 平铺区低频段动作清单（id 对接旧 HtmlCBType 通道 + □11 浮层族）：
 * 片=未勾池钮 + 目录/重插/清理原文/删片退/忽略本书/路线指引；
 * 书=目录/原文侧追溯/忽略本书/路线指引；摘抄=路线指引；自由态=目录/关联摘抄/路线指引
 * （群反馈 650189 补齐，无 ignore）。
 * contents（□11 起改弹目录浮层）、map（🗺 路线指引）、traceUp（原文侧追溯）走浮层族，
 * 不再产维护型文档。
 * opts.mainIds（四态）：全量池中未进首行的落平铺区——低频/高级钮被拖上首行即从平铺区
 * 滤除，拖出首行落回固有段位（任何按钮都不会彻底消失）。高级组的过滤在 UI 层
 * advVisible（组语义渲染）。
 */
export function buildFlatCells(kind: FloatDocKind, opts?: { mainIds?: string[]; reciteInstalled?: boolean }): string[] {
    if (kind === "piece") {
        if (opts?.mainIds) {
            const inMain = new Set(opts.mainIds);
            return [
                ...PIECE_MAIN_POOL.filter(id => !inMain.has(id)),
                ...PIECE_TRAY_POOL.filter(id => !inMain.has(id)),
                ...PIECE_LOW_POOL.filter(id => !inMain.has(id)),
            ];
        }
        return ["contents", "refill", "clean", ...PIECE_TRAY_POOL, "delExit", "ignore", "map", "traceUp", "recite"];
    }
    if (kind === "book") {
        // 书/摘抄态 mainIds（650189 第二轮，2026-09-10）：池内未进首行的一律落平铺区
        if (opts?.mainIds) {
            const inMain = new Set(opts.mainIds);
            return BOOK_ALL_MAIN.map(b => b.id).filter(id => !inMain.has(id));
        }
        return ["contents", "traceUp", "ignore", "map"];
    }
    if (kind === "digest") {
        // reciteInstalled 透传（reasoning review P2-1）：digest 态 recite 走 SCENE「未装
        // 不显示」政策（区别于片态恒可见导流），未装时平铺区也不给——否则拖上首行被
        // buildFloatButtons 滤除=两处都不渲染，违反「任何按钮不彻底消失」不变量。
        // 缺省按已装宽松显示（错显有害小=点击 toast 引导；漏显=入口消失）
        if (opts?.mainIds) {
            const inMain = new Set(opts.mainIds);
            return DIGEST_ALL_MAIN.map(b => b.id)
                .filter(id => !inMain.has(id) && !(id === "recite" && opts.reciteInstalled === false));
        }
        return ["map"];
    }
    // free（群反馈 650189）：书态基础入口——contents/traceUp 复用书态浮层（free 摘抄
    // ctime 自指 docID，清单浮层按 noteID 即查）；期2 ignore=不再推送（该源文档全部
    // 复访批量移除，与书忽略正交；free 不参与片推送调度，ignoreBook 语义不适用）。
    // 拖拽排序起 mainIds 生效：池内未进首行的一律落平铺区（digest/addBook 被拖出首行
    // 也兜底回平铺区，任何按钮不彻底消失——与片态 □14c 同口径）
    if (opts?.mainIds) {
        const inMain = new Set(opts.mainIds);
        return FREE_ALL_MAIN.map(b => b.id).filter(id => !inMain.has(id));
    }
    return ["contents", "traceUp", "map", "ignore"];
}

/** 附属卡到期胶囊文案：无到期零占位（不渲染）、>99 截断 */
export function formatDueCount(n: number): string {
    if (n <= 0) return "";
    return n > 99 ? "99+" : String(n);
}

// ============ □2 浮条二级编排（progtail：平铺区活界 manifest，纯函数 TDD 见 floatState.test.ts） ============

/** 平铺区 5 块稳定 id（manifest 键；index 0=低频段，1..4 对应 UI 层 ADV_GROUPS 组序
 *  制卡/收集/移动/提取整理）。段身份必须稳定——组员可跨段流动、组序不可漂移 */
export const FLAT_SEG_IDS = ["low", "card", "collect", "move", "extract"] as const;
export type FlatSegId = typeof FLAT_SEG_IDS[number];

/** 平铺区固有归属（UI 层算好传入）：low=低频段成员（buildFlatCells 产物，已过显隐滤）；
 *  adv=高级四组各自成员（advVisible 产物，已过 menu()/vip 滤） */
export interface FlatSegs {
    low: string[];
    adv: string[][];
}

/**
 * manifest → 各段成员+顺序合成（读侧唯一入口）：
 * - claim：id 出现在哪段清单=归哪段（跨段指派——A3 活界拍板）；不在任何清单=固有段
 * - 顺序：清单序在前 + 未记录成员按固有序垫尾（第一天无清单=完全现状，零迁移）
 * - 清单里的无效 id（退役钮/别态钮/menu() 关）静默忽略；未知段键忽略
 * - 空段照常产出空数组（UI 层滤空组连段界隐藏，与 advVisible 空组语义一致）
 */
export function applyFlatManifest(inherent: FlatSegs, manifest: Record<string, string[]>): FlatSegs {
    const valid = new Set<string>([...inherent.low, ...inherent.adv.flat()]);
    const claim = new Map<string, FlatSegId>();
    for (const seg of FLAT_SEG_IDS) {
        for (const id of manifest[seg] ?? []) {
            if (valid.has(id)) claim.set(id, seg);
        }
    }
    const order = (seg: FlatSegId, members: string[], inherentSeq: string[]): string[] => {
        const listed = (manifest[seg] ?? []).filter(id => members.includes(id));
        const listedSet = new Set(listed);
        const tail = inherentSeq.filter(id => members.includes(id) && !listedSet.has(id));
        return [...listed, ...tail];
    };
    // low 成员=固有 low ∪ claim low；固有序垫尾=先 low 固有序再 adv 固有序（稳定序）
    const advFlat = inherent.adv.flat();
    const lowMembers = [...inherent.low, ...advFlat].filter(id => claim.get(id) === "low" || (claim.get(id) === undefined && inherent.low.includes(id)));
    const low = order("low", lowMembers, [...inherent.low, ...advFlat]);
    // adv 成员池=本组固有 ∪ 其它组固有 ∪ low 固有（活界语义：任何钮可被指派进任何段——
    // 池漏别组时跨高级组指派（如收集钮进制卡组）的钮会静默蒸发，e2e 实锤）；垫尾序=本组
    // 固有优先（保持本组现状序），再其它组、再 low（与 low 垫尾序同哲学）
    const adv = inherent.adv.map((g, gi) => {
        const seg = FLAT_SEG_IDS[gi + 1];
        const otherAdv = inherent.adv.filter((_, j) => j !== gi).flat();
        const members = [...g, ...otherAdv, ...inherent.low]
            .filter(id => claim.get(id) === seg || (claim.get(id) === undefined && g.includes(id)));
        return order(seg, members, [...g, ...otherAdv, ...inherent.low]);
    });
    return { low, adv };
}

/**
 * 落盘写（drop 时调用）：目标段按当前渲染序快照+插入落点位（reorderMainIds 同款
 * remove+insert+adj 语义），其他段清单移除 id（跨段搬）；搬空的清单不落盘（manifest
 * 紧凑）；renderedTarget=目标段当前渲染成员（已过显隐滤的有效集——快照天然洗掉无效 id）
 */
export function moveToFlatSeg(
    manifest: Record<string, string[]>, targetSeg: FlatSegId,
    renderedTarget: readonly string[], id: string, index: number,
): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const seg of FLAT_SEG_IDS) {
        if (seg === targetSeg) continue;
        const rest = (manifest[seg] ?? []).filter(x => x !== id);
        if (rest.length > 0) out[seg] = rest;
    }
    const next = reorderMainIds([...renderedTarget], id, index);
    if (next.length > 0) out[targetSeg] = next;
    return out;
}

/**
 * 摘抄子排 id 联合（□3 review P2-1 编译期收紧）：组件层 DIG_ICONS/DIG_TIPS 须以
 * Record<DigSubrankId, ...> 精确匹配——任一侧增删 id 都是编译错（make check 拦），
 * 防两源漂移（漂移的失效模式是 icon undefined 渲染期 TypeError，不是温和降级）。
 */
export type DigSubrankId = "inbox" | "tobook" | "tohub" | "splitinplace" | "think" | "card" | "review" | "word" | "wordai" | "write" | "sched" | "whole";

/**
 * 摘抄子排 id 清单（□3 起单一事实源，渲染序）：digest 态精简子排；whole（整篇摘抄）限
 * piece+free——书态整本复制不实用走选中摘抄，free 态是右键退役后任意文档的整摘兜底入口。
 * icon/tip 映射留 UI 层（ProgressiveFloatBtns 的 DIG_ICONS/DIG_TIPS），此处只管 id 序与
 * 按态过滤。
 */
export function digestSubrankIds(kind: FloatDocKind): DigSubrankId[] {
    // □4 tobook/tohub=落点变体（挂书侧/归总夹，去向级覆盖不落盘）紧跟主摘抄钮——
    // bear 试用拍板「落点都能选」：全局档（digestLanding）一刀切之外逐次指定。
    // □11 digest 态开精简子排（bear「与分片差不多」）：再摘抄三档落点+问题+强制卡+
    // 单词两钮；review/sched 与首行 ✧ 复访组重复、write 与首行送仿写重复、whole 对卡片
    // 无意义（整摘复制）——不收。再摘抄走非书链路（落源文档下/札记匣）。
    // splitinplace 就地断句（2026-09-09）限 free+digest——book 态不给（README 初版警告：
    // 分片后改原书会让渐进找不到块），piece 态不收（重插菜单已是断句入口）。
    if (kind === "digest") return ["inbox", "tobook", "tohub", "splitinplace", "think", "card", "word", "wordai"];
    const base: DigSubrankId[] = ["inbox", "tobook", "tohub", "think", "card", "review", "word", "wordai", "write", "sched"];
    if (kind === "book") return base;
    // □3 语义清理：piece 态砍 write（与低频段 recite「仿写本片」同调 runPieceRecite 纯重复；
    // book/free 首行无仿写钮保留不算重复）
    if (kind === "piece") return [...base.filter(id => id !== "write"), "whole"];
    return ["inbox", "tobook", "tohub", "splitinplace", ...base.slice(3), "whole"];
}
