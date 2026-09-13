<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
    import { DestroyManager } from "../../sy-tomato-plugin/src/libs/destroyer";
    import { listVolIDs } from "./Split2Pieces";
    import { splitIntoVols, childBlocksToVolBlocks, volDocTitle } from "./splitVols";
    type VolBlockT = import("./splitVols").VolBlock;
    type VolPlanT = import("./splitVols").VolPlan;
    import { runSplitVols, splitVolsDeps } from "./splitVolsRun";
    import { countHeadingLevels } from "./piecePreview";
    import { prog } from "./Progressive";

    interface Props { docID: string; dm: DestroyManager }
    let { docID, dm }: Props = $props();
    export function destroy() { dm.destroyBy(); }
    onDestroy(destroy);

    // 每卷上限档（字符）：默认 50 万——300 万字巨书→6 卷，落在「拆 3~6 片」区间；
    // 首档 10 万照顾中等书（10 万字书拆 2 卷也有查阅价值）
    const MAX_TIERS: number[] = [10_0000, 20_0000, 30_0000, 50_0000, 80_0000, 100_0000];
    const DEFAULT_MAX_IDX = 3;

    let blocks = $state<VolBlockT[]>([]);
    let selectedLevels = $state<string[]>([]);
    let maxIdx = $state(DEFAULT_MAX_IDX);
    let vols = $state<VolPlanT[]>([]);
    let loading = $state(true);
    let busy = $state(false);
    let blocked = $state(""); // 已有子文档守卫（空串=放行）——同款兼重跑残留保护
    let totalLen = $state(0);
    let calcToken = 0;

    const levelStats = $derived(countHeadingLevels(blocks));
    // 1 卷=无需分卷（工具无意义）；busy/blocked/加载中均禁
    const canSubmit = $derived(!busy && !loading && !blocked && vols.length > 1);

    // 预览重算：级选/上限变化即算（纯函数毫秒级；token 丢过期结果）
    $effect(() => {
        const levels = [...selectedLevels];
        const mc = MAX_TIERS[maxIdx];
        const token = ++calcToken;
        void (async () => {
            const out = await splitIntoVols(blocks, levels, mc);
            if (token === calcToken) vols = out;
        })();
    });

    onMount(async () => {
        try {
            const children = await listVolIDs(docID);
            if (children.length > 0) blocked = tomatoI18n.本文档已有子文档;
            const raw = await siyuan.getChildBlocks(docID);
            if (raw == null) throw new Error("getChildBlocks null");
            blocks = childBlocksToVolBlocks(raw);
            totalLen = blocks.reduce((s, b) => s + b.count, 0);
            // 默认=最粗实存级（h1 有则 ["1"]——小说卷级；粗级先切、超限自动下切）
            const lv = countHeadingLevels(blocks).map(s => s.level);
            selectedLevels = lv.length > 0
                ? [lv.reduce((a, b) => (Number(a) <= Number(b) ? a : b))]
                : [];
        } catch (e) {
            console.error("SplitVolsDialog init failed", e);
            await siyuan.pushMsg(tomatoI18n.加书失败请重试);
        } finally { loading = false; }
    });

    async function process() {
        if (!canSubmit) return;
        busy = true;
        try {
            await runSplitVols(docID, vols, blocks.map(b => b.id), splitVolsDeps());
            // 新卷 SQL 索引有延迟窗口（实测秒级）：AddBook 的子文档检测走 listVolIDs
            // （SQL ial 通道），索引未追上会把「N 篇」显示成少篇、秒确认=漏卷书——
            // 等卷全可见再拉起（上限 20s，超时放行+toast，重开加书弹窗自愈）
            for (let i = 0; i < 40; i++) {
                const ids = await listVolIDs(docID);
                if (ids.length >= vols.length) break;
                await new Promise(r => setTimeout(r, 500));
            }
            await siyuan.pushMsg(tomatoI18n.切分完成即将加书, 2500);
            destroy();
            // 拉起 AddBook（切分工具不接管分片参数——分片决策留给既有 UI）；
            // preselectDir=直接预选目录成书（切完的卷即文章池）
            await prog.addProgressiveReadingWithLock(docID, true);
        } catch (e) {
            console.error("SplitVols process failed", e);
            await siyuan.pushMsg(tomatoI18n.加书失败请重试, 4000);
        } finally { busy = false; }
    }
</script>

<div class="container">
    {#if loading}
        <div class="prog-loading-row">
            <span class="prog-spinner" aria-hidden="true"></span>
            {tomatoI18n.请耐心等待}
        </div>
    {:else}
        {#if blocked}
            <div class="prog-addbook-warn prog-addbook-blocked" role="alert">{blocked}</div>
        {:else}
            <div class="prog-field-hint prog-lede">{tomatoI18n.物理分卷说明}</div>

            <section class="prog-card">
                <div class="prog-card-title">{tomatoI18n.切分设置}</div>
                {#if levelStats.length === 0}
                    <div class="prog-no-heading">{tomatoI18n.本书没有大纲标题}</div>
                {:else}
                    <div class="prog-chips" role="group" aria-label={tomatoI18n.标题级别}>
                        {#each levelStats as s (s.level)}
                            <label class="prog-chip">
                                <input type="checkbox" value={s.level} bind:group={selectedLevels} />
                                <span class="prog-chip-token">H{s.level}</span>
                                <span class="prog-chip-count">×{s.count}</span>
                            </label>
                        {/each}
                    </div>
                    <div class="prog-field-hint">{tomatoI18n.切分级别提示}</div>
                {/if}
                <div class="prog-slider-row">
                    <span class="prog-field-label">{tomatoI18n.每卷字数上限}</span>
                    <span class="prog-slider-val">{MAX_TIERS[maxIdx] / 10000}{tomatoI18n.万字}</span>
                </div>
                <input
                    type="range"
                    class="b3-slider prog-slider"
                    min="0"
                    max={MAX_TIERS.length - 1}
                    step="1"
                    bind:value={maxIdx}
                    aria-label={tomatoI18n.每卷字数上限}
                />
                <div class="prog-slider-scale">
                    {#each MAX_TIERS as t (t)}
                        <span>{t / 10000}{tomatoI18n.万字}</span>
                    {/each}
                </div>
            </section>

            <section class="prog-card">
                <div class="prog-card-title">{tomatoI18n.卷预览}</div>
                {#if vols.length <= 1}
                    <div class="prog-no-heading">{tomatoI18n.无需分卷}</div>
                {:else}
                    <div class="vol-list">
                        {#each vols as v, i (i)}
                            <div class="vol-row" class:vol-over={v.overLimit}>
                                <span class="vol-name">{volDocTitle(i, v)}</span>
                                <span class="vol-nums">{v.charCount} 字 · {v.blocks.length} 块</span>
                            </div>
                        {/each}
                    </div>
                    <div class="vol-total">
                        {tomatoI18n.共N卷C字.replace("{n}", String(vols.length)).replace("{c}", String(totalLen))}
                    </div>
                {/if}
            </section>

            <div class="prog-addbook-warn" role="alert">{tomatoI18n.切分须知}</div>
        {/if}

        <div class="footer">
            <button
                class="b3-button prog-primary-btn"
                disabled={!canSubmit}
                onclick={process}
            >{busy ? tomatoI18n.切分中 : tomatoI18n.切分为N卷.replace("{n}", String(vols.length))}</button>
            <button class="b3-button b3-button--outline tomato-button" onclick={destroy}>{tomatoI18n.退出}</button>
        </div>
    {/if}
</div>

<style>
    /* 类配方照抄 AddBook.svelte（prog- 前缀族）；只用 --b3-* 变量明暗自适应 */
    .container {
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-width: 0;
        padding: 12px 14px 0;
    }
    .prog-lede {
        margin: 0;
    }
    .prog-loading-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 20px 0;
        font-size: 13px;
        color: var(--b3-theme-on-surface);
    }
    .prog-spinner {
        width: 14px;
        height: 14px;
        border: 2px solid var(--b3-border-color);
        border-top-color: var(--b3-theme-primary);
        border-radius: 50%;
        animation: prog-spin 0.8s linear infinite;
    }
    @keyframes prog-spin {
        to { transform: rotate(360deg); }
    }
    .prog-addbook-warn {
        padding: 6px 10px;
        border-radius: var(--b3-border-radius, 4px);
        font-size: 12px;
        line-height: 1.5;
        background-color: color-mix(in srgb, var(--b3-theme-warning, #d25f00) 12%, transparent);
        color: var(--b3-theme-on-surface);
        box-shadow: inset 2px 0 0 var(--b3-theme-warning, #d25f00);
    }
    .prog-addbook-warn.prog-addbook-blocked {
        background-color: color-mix(in srgb, var(--b3-theme-error, #d23f31) 12%, transparent);
        box-shadow: inset 2px 0 0 var(--b3-theme-error, #d23f31);
    }
    .prog-card {
        padding: 10px 12px 12px;
        background-color: var(--b3-theme-surface);
        border: 1px solid var(--b3-theme-surface-lighter);
        border-radius: var(--b3-border-radius);
    }
    .prog-card-title {
        margin: 0 0 8px;
        font-size: 15px;
        font-weight: 600;
        color: var(--b3-theme-on-surface);
    }
    .prog-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
    }
    .prog-chip {
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 6px 10px;
        font-size: 13px;
        color: var(--b3-theme-on-background);
        cursor: pointer;
        background-color: var(--b3-theme-background);
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        transition: var(--b3-transition);
    }
    .prog-chip:has(input:checked) {
        font-weight: 500;
        color: var(--b3-theme-primary);
        background-color: var(--b3-theme-primary-lightest);
        border-color: var(--b3-theme-primary);
    }
    .prog-chip:has(input:focus-visible) {
        outline: 2px solid var(--b3-theme-primary-light);
    }
    .prog-chip input {
        margin: 0;
        accent-color: var(--b3-theme-primary);
    }
    .prog-chip-token {
        font-weight: 600;
    }
    .prog-chip-count {
        font-size: 12px;
        color: inherit;
        opacity: 0.64;
        font-variant-numeric: tabular-nums;
    }
    .prog-no-heading {
        padding: 8px 10px;
        font-size: 13px;
        color: var(--b3-theme-on-surface);
        opacity: 0.64;
        border: 1px dashed var(--b3-border-color);
        border-radius: 6px;
    }
    .prog-slider-row {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        margin: 10px 0 6px;
    }
    .prog-field-label {
        font-size: 13px;
        font-weight: 500;
        color: var(--b3-theme-on-surface);
    }
    .prog-slider-val {
        min-width: 40px;
        font-size: 13px;
        font-weight: 600;
        color: var(--b3-theme-primary);
        text-align: right;
        font-variant-numeric: tabular-nums;
    }
    /* accent-color 勿写：会压过 b3-slider 官方 ::-webkit-slider-thumb 定制（vision P2-4） */
    .prog-slider {
        width: 100%;
        margin: 0;
    }
    .prog-slider-scale {
        display: flex;
        justify-content: space-between;
        margin-top: 2px;
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        opacity: 0.64;
    }
    .prog-field-hint {
        font-size: 12px;
        line-height: 1.5;
        color: var(--b3-theme-on-surface);
        opacity: 0.64;
    }
    /* 卷预览列表：平铺直读（信息平铺不藏 hover），超限卷 warning 色行内标黄 */
    .vol-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
        max-height: 220px;
        overflow-y: auto;
    }
    .vol-row {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 10px;
        padding: 5px 10px;
        font-size: 13px;
        background-color: var(--b3-theme-background);
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
    }
    .vol-row.vol-over {
        background-color: color-mix(in srgb, var(--b3-theme-warning, #d25f00) 10%, transparent);
    }
    .vol-name {
        overflow: hidden;
        min-width: 0;
        white-space: nowrap;
        text-overflow: ellipsis;
    }
    .vol-nums {
        flex-shrink: 0;
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        opacity: 0.64;
        font-variant-numeric: tabular-nums;
    }
    .vol-total {
        margin-top: 8px;
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        opacity: 0.8;
        text-align: right;
        font-variant-numeric: tabular-nums;
    }
    .footer {
        position: sticky;
        bottom: 0;
        display: flex;
        gap: 10px;
        /* -14px 负 margin 抵掉 container 水平 padding：分隔线贴弹窗两缘贯通（SplitPieceDialog 同款） */
        margin: 0 -14px;
        padding: 10px 14px 12px;
        background-color: var(--b3-theme-surface);
        border-top: 1px solid var(--b3-border-color);
    }
    .prog-primary-btn {
        flex: 1;
        padding: 8px 18px;
        font-weight: 500;
        white-space: normal; /* b3-button 默认 nowrap，en 长文案防截断（AddBook 族同款） */
    }
</style>
