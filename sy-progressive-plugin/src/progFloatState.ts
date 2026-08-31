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
 * opts.mainIds：片态首行有序清单（□14c 拖拽 B 档升级——全量 28 项任意可入，顺序即
 * 渲染序；设置面板 checkbox 与浮条拖拽双通道共写）。mainIds 缺省走固有编排（兼容
 * 未初始化路径）。非片态不受 mainIds 影响（书/摘抄态 4 键无精简空间）。
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
    "card", "cardHere", "cardDaily", "cardDailyN", "multi",
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
    { id: "cardDaily", icon: "iconProgCardDaily", kind: "normal", group: "scene" },
    { id: "cardDailyN", icon: "iconProgCardDailyN", kind: "normal", group: "scene" },
    { id: "multi", icon: "iconProgMulti", kind: "normal", group: "scene" },
    { id: "collect", icon: "iconProgInbox", kind: "normal", group: "scene" },
    { id: "movePrev", icon: "iconProgMoveUp", kind: "normal", group: "scene" },
    { id: "moveNext", icon: "iconProgMoveDown", kind: "normal", group: "scene" },
    { id: "extractAll", icon: "iconProgExtractAll", kind: "normal", group: "scene" },
    { id: "extractEnd", icon: "iconProgExtractEnd", kind: "normal", group: "scene" },
    { id: "extract", icon: "iconProgExtract", kind: "normal", group: "scene" },
    { id: "noColor", icon: "iconProgClean", kind: "normal", group: "scene" },
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
 * □10 平铺区低频段动作清单（id 对接旧 HtmlCBType 通道 + □11 浮层族）：
 * 片=未勾池钮 + 目录/重插/清理原文/删片退/忽略本书/路线指引；
 * 书=目录/原文侧追溯/忽略本书/路线指引；摘抄=路线指引；自由态=路线指引。
 * contents（□11 起改弹目录浮层）、map（🗺 路线指引）、traceUp（原文侧追溯）走浮层族，
 * 不再产维护型文档。
 * opts.mainIds（片态）：全量池中未进首行的落平铺区首段（排在固有低频动作前）——
 * □14c 后低频/高级钮也可能被拖上首行，一律从平铺区滤除（任何按钮都不会彻底消失，
 * 拖出首行即落回固有段位）。高级组的过滤在 UI 层 advVisible（组语义渲染）。
 */
export function buildFlatCells(kind: FloatDocKind, opts?: { mainIds?: string[] }): string[] {
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
    if (kind === "book") return ["contents", "traceUp", "ignore", "map"];
    if (kind === "digest") return ["map"];
    return ["map"];
}

/** 附属卡到期胶囊文案：无到期零占位（不渲染）、>99 截断 */
export function formatDueCount(n: number): string {
    if (n <= 0) return "";
    return n > 99 ? "99+" : String(n);
}
