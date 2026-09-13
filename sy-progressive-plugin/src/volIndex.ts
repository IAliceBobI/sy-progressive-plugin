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
