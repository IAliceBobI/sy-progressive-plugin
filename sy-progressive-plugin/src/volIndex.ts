// □1 目录成书：卷表纯函数（书=文档集，卷=子文档，point 一维=各卷片索引前缀和）。
// 零 siyuan 依赖——vitest 链不拖 .svelte/window；生产接线在 ProgressiveStorage/
// volRebuild.ts/Progressive.ts。设计共识：索引文件格式不动（一维全局连续），卷结构
// 旁挂 petal <bookID>.vols.json；卷增删/重排重组只动索引数据不动片文档（可恢复红线）。

/** 卷表条目：d=卷文档 id，n=该卷片数（0 片卷占位保序） */
export interface VolEntry { d: string; n: number }

/** petal 文件 <bookID>.vols.json 的内容（v=1 格式版本） */
export interface VolTable { v: 1; vols: VolEntry[] }

/** 前缀和：vols[i] 的全局片起点 = offsets[i]；末位=全书总片数 */
export function volOffsets(vols: VolEntry[]): number[] {
    const out = [0];
    for (const v of vols) out.push(out[out.length - 1] + v.n);
    return out;
}

/** point → 所在卷与卷内偏移；越界/负数返回 null（0 片卷不占 point 槽，天然跳过） */
export function locatePiece(vols: VolEntry[], point: number): { volIndex: number; inVol: number } | null {
    if (point < 0) return null;
    const off = volOffsets(vols);
    if (point >= off[off.length - 1]) return null;
    // off 单调不减，从后向前找第一个 off[i] <= point 的 i（该卷拥有 [off[i], off[i+1]) 槽）
    for (let i = vols.length - 1; i >= 0; i--) {
        if (off[i] <= point) return { volIndex: i, inVol: point - off[i] };
    }
    return null;
}

/** 卷增删/重排重组：老卷按 id 取回自己的片段、新卷空段占位、消失卷丢弃段。
 *  卷表与索引的同点重写由调用方保证（AddBook.process / ensureVolTableFresh）。 */
export function rebuildVolIndex(oldVols: VolEntry[], oldPieces: string[][], newVolIDs: string[]): { vols: VolEntry[]; pieces: string[][] } {
    const off = volOffsets(oldVols);
    const byVol = new Map<string, string[][]>();
    oldVols.forEach((v, i) => byVol.set(v.d, oldPieces.slice(off[i], off[i] + v.n)));
    const vols: VolEntry[] = [];
    const pieces: string[][] = [];
    for (const id of newVolIDs) {
        const seg = byVol.get(id) ?? [];
        vols.push({ d: id, n: seg.length });
        pieces.push(...seg);
    }
    return { vols, pieces };
}

/** 重组后的 point 映射（读断点跟随内容走）：
 *  旧 point → (所在卷, 卷内偏移) → 新序同卷起点+偏移；所在卷被删 → 旧序中其后
 *  第一存活卷的新起点（接着读下一卷）；向后全灭 → 新总片数（毕业语义）。 */
export function mapPoint(oldVols: VolEntry[], newVols: VolEntry[], oldPoint: number): number {
    const newOff = volOffsets(newVols);
    const total = newOff[newOff.length - 1];
    const loc = locatePiece(oldVols, oldPoint);
    if (!loc) return total;
    for (let i = loc.volIndex; i < oldVols.length; i++) {
        const ni = newVols.findIndex(v => v.d === oldVols[i].d);
        if (ni >= 0) {
            return newOff[ni] + (i === loc.volIndex ? loc.inVol : 0);
        }
    }
    return total;
}

/** 分片落库时从卷 id 序+逐卷片数构造卷表 */
export function volsFromCounts(volIDs: string[], perVol: number[]): VolEntry[] {
    return volIDs.map((d, i) => ({ d, n: perVol[i] ?? 0 }));
}

/** dirbook □1：多书卷表合并成「卷文档 id → 书根 id」反向映射（locatePiece 是正向
 *  point→卷，卷 id 反查书根此前无原语）。0 片占位卷同样在册——占位卷上也要出 book 态。
 *  空 d 损坏条目跳过（review P2-5：docBookID("") 不得返回书 id）。
 *  同卷 id 撞车先者胜：卷文档物理上只属一本书，撞=卷表脏数据，取稳定结果不抛错。 */
export function volOwnerMap(entries: { bookID: string; vols: VolEntry[] }[]): Map<string, string> {
    const out = new Map<string, string>();
    for (const { bookID, vols } of entries) {
        for (const v of vols) {
            if (!v.d) continue;
            if (!out.has(v.d)) out.set(v.d, bookID);
        }
    }
    return out;
}

/** □10 同 point 双片竞态防线①：片文件树直查的纯逻辑核（IO 注入式——listDir 由调用方
 *  供 siyuan.listDocsByPath 适配层）。背景=出场 createPiece 建片后 blocks.ial 索引滞后
 *  24s+（□29 实测），sweep 对同 point 再跑 createPiece 时 findPieceDoc SQL miss →
 *  间歇建出第二张同内容片。目录决策与 createPiece 同款：dirMode 卷定位优先、卷表
 *  失配/非目录书落书壳根（双查兜底）；片名=[NNNNN] 前缀（7 字符定长，邻点不撞）。
 *  返回全部前缀命中（review P2-1：同目录用户复制的同名前缀文档也会命中——上层逐个
 *  IAL 复核取真正在册的那张，勿把副本当片）。 */
export async function pieceTreeLookup(
    box: string, shellPath: string, vols: VolEntry[] | null, point: number,
    listDir: (box: string, path: string) => Promise<{ id: string; name: string }[] | null>,
): Promise<string[]> {
    if (point < 0) return [];
    const out: string[] = [];
    const prefix = `[${String(point).padStart(5, "0")}]`;
    const dirs: string[] = [];
    if (vols?.length) {
        const loc = locatePiece(vols, point);
        if (loc) dirs.push(`${shellPath}/${vols[loc.volIndex].d}`);
    }
    dirs.push(shellPath); // 非目录书=书壳根；目录书卷表失配窗兜底（createPiece 挂书壳同款）
    for (const dir of dirs) {
        const docs = await listDir(box, dir).catch(() => null);
        for (const d of docs ?? []) {
            if (String(d?.name ?? "").startsWith(prefix)) out.push(String(d?.id ?? ""));
        }
    }
    return out;
}
