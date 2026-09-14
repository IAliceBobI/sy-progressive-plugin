// progtree □2 结构引擎纯函数核（TDD 锁行为）：现状×骨架×归位表 → 增量动作清单。
// 零依赖纯模块——kernel 侧直接 import（splitCore 先例：单一事实源，前端单测同源锁定）。
// 增量铁律（handoff □2 mini-spec）：零删除/零重排/零改名；reparent 仅非 sacred 非 done；
// 新建槽钉父层尾（执行序语义）；同层同名=匹配（手动建的不分 AI/用户，plan 当既成事实）；
// 跨层同名=全树唯一命中才认领（多同名歧义=按新建+报告）；骨架内同层同名二节点加序号；
// 幂等=同方案二跑零变更动作（skips 回执不算变更）。
// 匹配两级：①同层标题精确匹配（[N] 前缀剥后）②未命中→全树唯一未认领同名槽→matched+
// reparent 候选（用户拖层后骨架仍指旧位的「改形」语义；sacred/done 拦下只报告）。
/** 槽现状行（kernel 树拉取产物平铺；形态照前端 WritingTreeSlot+□2 判定层扩展） */
export interface StructSlot {
    docID: string;
    /** 纯槽名（树行 name；老书 [NNNNN] 前缀由 slotNameFromTitle 容错剥） */
    title: string;
    /** 0=书根直属 */
    depth: number;
    /** 书根直属=BOOK_ROOT_ID（约定常量，非真实书 docID） */
    parentID: string;
    /** custom-prog-done="1"=已定稿 */
    done: boolean;
    /** 有非素材实质块（人动过正文）——不挪不入 */
    sacred: boolean;
    /** 挂 MarkKey（TEMP#bookID,* 前缀）=体系认领的槽 */
    marked: boolean;
    /** 槽内素材胶囊数（MATERIAL_KEY 块） */
    materialCount: number;
}

/** 素材行（箱内盘点：ctime 归属=位置无关权威） */
export interface StructMaterial {
    id: string;
    title: string;
    /** pool=六锚子树/root=书根直属散文档/inSlot=已在槽树（既成事实）/elsewhere=其他位置 */
    location: "pool" | "root" | "inSlot" | "elsewhere";
    /** 🔨 锤态=已推过 */
    done: boolean;
    blockCount: number;
    charCount: number;
}

/** 骨架节点（AI 产出） */
export interface SkeletonNode { title: string; children?: SkeletonNode[] }

/** 归位表行：slotPath="/“ 分隔标题路径（顶级=单段），按骨架原始 title 解析 */
export interface Placement { materialID: string; slotPath: string }

export interface StructureDiff {
    /** 新建槽（DFS 骨架序；parentPath=""=书根直属；seqTitle=同层同名序号形态） */
    creates: { title: string; parentPath: string; seqTitle?: string }[];
    /** 既有槽改挂（物理父≠骨架父；sacred/done 已在 diff 层拦下不进此列） */
    reparents: { docID: string; title: string; fromParentTitle: string; toParentPath: string }[];
    /** 素材归位（targetDocID=""=目标为本轮将建槽，apply 建完回填） */
    placements: { materialID: string; slotPath: string; targetTitle: string; targetDocID: string }[];
    /** 跳过项及原因（回执全量纪律：素材消失/sacred·done 拦/既成事实/路径不存在） */
    skips: { ref: string; reason: string }[];
    /** 报告（骨架外槽/同名歧义——不动只说） */
    reports: string[];
    /** 骨架全节点解析表（DFS 序；docID=""=本轮将建）——执行层建槽/reparent/归位的
     *  寻址单一事实源，免二次匹配漂移 */
    resolved: { path: string; docID: string; title: string }[];
}

/** 槽名 [NNNNN] 前缀容错剥（复刻自 writeBook.slotNameFromTitle；老书历史形态） */
export function slotNameFromTitle(title: string): string {
    return title.replace(/^\[\d+\]/, "");
}

/** 骨架节点名 ↔ 既有槽名匹配（review P1-4）：剥前缀相等，或「名-序号」形态等价
 *  （同层同名二节点一跑建出 X 与 X-2，二跑骨架 X 须认领 X-2——否则逐跑增殖
 *  X-2-时间戳怪名槽；用户真名恰为「X-2」被骨架 X 认领=同层等价不重复建，可辩护） */
export function slotMatches(title: string, name: string): boolean {
    const t = slotNameFromTitle(title);
    return t === name || new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-\\d+$`).test(t);
}

/** 书根直属槽的 parentID 约定值（IO 层 fetchStructureSlots 与 diff 层共用） */
export const BOOK_ROOT_ID = "book";

export function planStructureActions(
    slots: StructSlot[],
    materials: StructMaterial[],
    skeleton: SkeletonNode[],
    placements: Placement[],
): StructureDiff {
    const diff: StructureDiff = { creates: [], reparents: [], placements: [], skips: [], reports: [], resolved: [] };
    const byParent = new Map<string, StructSlot[]>();
    for (const s of slots) {
        const list = byParent.get(s.parentID) ?? [];
        list.push(s);
        byParent.set(s.parentID, list);
    }
    const titleOf = new Map(slots.map(s => [s.docID, s.title]));
    const matched = new Set<string>();
    /** 骨架路径（原始 title 拼接）→ 既有槽 docID（""=本轮将建）；validPaths=合法路径全集 */
    const pathToDoc = new Map<string, string>();
    const validPaths = new Set<string>();
    const ambiguousReported = new Set<string>();

    /** 全树唯一未认领同名槽（多个=歧义按 null+报告一次；P1-4 序号等价类同认） */
    const findGlobal = (title: string): StructSlot | null => {
        const cands = slots.filter(s => !matched.has(s.docID) && slotMatches(s.title, title));
        if (cands.length === 1) return cands[0];
        if (cands.length > 1 && !ambiguousReported.has(title)) {
            ambiguousReported.add(title);
            diff.reports.push(`同名槽「${title}」×${cands.length} 歧义，骨架该节点按新建处理`);
        }
        return null;
    };

    const walk = (nodes: SkeletonNode[], parentPath: string, parentID: string) => {
        const layer = byParent.get(parentID) ?? [];
        const usedTitles = new Map<string, number>();
        for (const node of nodes) {
            const name = String(node?.title ?? "").trim();
            if (!name) continue; // 空名节点静默跳过（AI 笔误防御）
            const path = parentPath ? `${parentPath}/${name}` : name;
            validPaths.add(path);
            const exist = layer.find(s => !matched.has(s.docID) && slotMatches(s.title, name))
                ?? findGlobal(name);
            if (exist) {
                matched.add(exist.docID);
                pathToDoc.set(path, exist.docID);
                diff.resolved.push({ path, docID: exist.docID, title: name });
                if (exist.parentID !== parentID) {
                    const fromParentTitle = exist.parentID === BOOK_ROOT_ID || !titleOf.has(exist.parentID)
                        ? "(书根)" : titleOf.get(exist.parentID)!;
                    if (exist.sacred) diff.skips.push({ ref: `槽「${name}」`, reason: "sacred（有正文）不静默挪" });
                    else if (exist.done) diff.skips.push({ ref: `槽「${name}」`, reason: "已定稿不挪" });
                    else diff.reparents.push({ docID: exist.docID, title: name, fromParentTitle, toParentPath: parentPath });
                }
                walk(node.children ?? [], path, exist.docID);
                continue;
            }
            // 新建：同层同名二节点→序号（物理建名；路径键仍用原名，AI 引用按原名）
            const seen = usedTitles.get(name) ?? 0;
            usedTitles.set(name, seen + 1);
            diff.creates.push({ title: name, parentPath, ...(seen >= 1 ? { seqTitle: `${name}-${seen + 1}` } : {}) });
            pathToDoc.set(path, "");
            diff.resolved.push({ path, docID: "", title: name });
            // 虚拟父段：byParent 无此键→子孙同层恒空（子孙靠全局匹配或新建），语义正确
            walk(node.children ?? [], path, `\u0000virtual:${path}`);
        }
    };
    walk(skeleton, "", BOOK_ROOT_ID);

    // 骨架外既有槽（未被认领，含整棵子树语义——报告逐槽一行汇总）
    const orphans = slots.filter(s => !matched.has(s.docID)).map(s => s.title);
    if (orphans.length) diff.reports.push(`骨架外既有槽 ${orphans.length} 个（保留不动）：${orphans.join("、")}`);

    // 归位表解析：路径合法性 → 素材在箱 → 目标槽保护
    const matByID = new Map(materials.map(m => [m.id, m]));
    for (const p of placements) {
        const m = matByID.get(String(p?.materialID ?? ""));
        if (!m) { diff.skips.push({ ref: String(p?.materialID ?? ""), reason: "素材已不在箱（已归位或被删）" }); continue; }
        if (m.location === "inSlot") { diff.skips.push({ ref: m.id, reason: "素材已在槽树内（既成事实，不自动处理）" }); continue; }
        const seg = String(p?.slotPath ?? "").split("/").map(s => s.trim()).filter(Boolean);
        const probe = seg.join("/");
        if (!seg.length || !validPaths.has(probe)) {
            diff.skips.push({ ref: m.id, reason: `目标槽路径「${p?.slotPath}」在骨架中不存在` });
            continue;
        }
        const targetDoc = pathToDoc.get(probe) ?? "";
        const targetSlot = targetDoc ? slots.find(s => s.docID === targetDoc) : undefined;
        if (targetSlot?.sacred) { diff.skips.push({ ref: m.id, reason: `目标槽「${seg.at(-1)}」sacred（有正文）不入素材` }); continue; }
        if (targetSlot?.done) { diff.skips.push({ ref: m.id, reason: `目标槽「${seg.at(-1)}」已定稿不入素材` }); continue; }
        diff.placements.push({ materialID: m.id, slotPath: probe, targetTitle: seg.at(-1)!, targetDocID: targetDoc });
    }
    return diff;
}

/** 幂等断言 helper（仅测试用）：把 diff 应用到现状产新现状——建槽挂 marked、reparent 改挂。
 * IO 语义的纯镜像；素材出箱=调用方从 materials 数组剔除（不在此函数职责内） */
export function simulateApply(slots: StructSlot[], diff: StructureDiff): StructSlot[] {
    const next = slots.map(s => ({ ...s }));
    for (const c of diff.creates) {
        const parentTitle = c.parentPath ? c.parentPath.split("/").at(-1) : "";
        const parent = next.find(s => s.title === parentTitle);
        const depth = c.parentPath ? (parent?.depth ?? 0) + 1 : 0;
        next.push({
            docID: `new:${c.parentPath}/${c.seqTitle ?? c.title}`,
            title: c.seqTitle ?? c.title,
            depth,
            parentID: parent?.docID ?? BOOK_ROOT_ID,
            done: false, sacred: false, marked: true, materialCount: 0,
        });
    }
    for (const r of diff.reparents) {
        const s = next.find(x => x.docID === r.docID);
        const to = next.find(x => x.title === r.toParentPath.split("/").at(-1));
        if (s && to) { s.parentID = to.docID; s.depth = to.depth + 1; }
    }
    return next;
}
