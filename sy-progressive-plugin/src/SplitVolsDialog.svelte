<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
    import { DestroyManager } from "../../sy-tomato-plugin/src/libs/destroyer";
    import { listVolIDs } from "./Split2Pieces";
    import { splitIntoVols, childBlocksToVolBlocks, volDocBaseTitle } from "./splitVols";
    type VolBlockT = import("./splitVols").VolBlock;
    type VolPlanT = import("./splitVols").VolPlan;
    import { runSplitVols, splitVolsDeps } from "./splitVolsRun";
    import { countHeadingLevels } from "./piecePreview";
    import { prog } from "./Progressive";

    interface Props { docID: string; dm: DestroyManager }
    let { docID, dm }: Props = $props();
    export function destroy() { dm.destroyBy(); }
    onDestroy(destroy);

    // 每卷上限档（字符）；首档 10 万照顾中等书（10 万字书拆 2 卷也有查阅价值）
    const MAX_TIERS: number[] = [10_0000, 20_0000, 30_0000, 50_0000, 80_0000, 100_0000];

    /** 默认档自适应（09-17 反馈改）：从低到高取第一个「全书字数 ≤ 档位×6」的档——
     *  300 万字巨书→50 万档（=旧写死默认的语义）、43 万字中型书→10 万档，首开即见
     *  卷列表而非空态（旧写死 50 万对中型书必空态，被用户误读成「预览坏了」）。
     *  小书（<10 万）落最低档仍 1 卷，走空态文案兜底；实际卷数以预览为准（标题
     *  边界可能比 ceil(total/档位) 多卷，×6 只是选档近似）。 */
    function defaultTierIdx(total: number): number {
        for (let i = 0; i < MAX_TIERS.length; i++) {
            if (total <= MAX_TIERS[i] * 6) return i;
        }
        return MAX_TIERS.length - 1;
    }

    let blocks = $state<VolBlockT[]>([]);
    let selectedLevels = $state<string[]>([]);
    let maxIdx = $state(MAX_TIERS.length - 1);
    // □4 结构切分模式：mode 会话态不持久化（默认体量=老用户零感知）；
    // structN=每 N 个切分段一卷（默认 1=一编一卷），钳制 1~99
    let mode = $state<"size" | "structure">("size");
    let structN = $state(1);
    let vols = $state<VolPlanT[]>([]);
    let loading = $state(true);
    let busy = $state(false);
    let blocked = $state(""); // 已有子文档守卫（空串=放行）——同款兼重跑残留保护
    let totalLen = $state(0);
    let calcToken = 0;

    const levelStats = $derived(countHeadingLevels(blocks));
    // 结构模式空态用：所选切分级标题块数（与 chips 上 ×N 同源口径）
    const selHeadCount = $derived(levelStats
        .filter(s => selectedLevels.includes(s.level))
        .reduce((a, s) => a + s.count, 0));
    // 1 卷=无需分卷（工具无意义）；busy/blocked/加载中均禁
    const canSubmit = $derived(!busy && !loading && !blocked && vols.length > 1);

    function clampN() {
        const v = Number(structN);
        structN = Number.isFinite(v) ? Math.min(99, Math.max(1, Math.round(v))) : 1;
    }

    // 预览重算：模式/级选/上限/N 变化即算（纯函数毫秒级；token 丢过期结果）
    $effect(() => {
        const levels = [...selectedLevels];
        const mc = MAX_TIERS[maxIdx];
        const opts = mode === "structure" ? { mode, n: structN } as const : undefined;
        const token = ++calcToken;
        void (async () => {
            const out = await splitIntoVols(blocks, levels, mc, opts);
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
            maxIdx = defaultTierIdx(totalLen);
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

<div class="container prog-splitvols-root">
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
                {#if levelStats.length > 0}
                    <div class="prog-slider-row">
                        <span class="prog-field-label">{tomatoI18n.切分方式}</span>
                        <div class="prog-mode-chips" role="radiogroup" aria-label={tomatoI18n.切分方式}>
                            <label class="prog-chip">
                                <input type="radio" name="prog-split-mode" value="size" bind:group={mode} />
                                <span class="prog-chip-token">{tomatoI18n.按体量}</span>
                            </label>
                            <label class="prog-chip">
                                <input type="radio" name="prog-split-mode" value="structure" bind:group={mode} />
                                <span class="prog-chip-token">{tomatoI18n.按结构}</span>
                            </label>
                        </div>
                    </div>
                {/if}
                {#if mode === "structure"}
                    <div class="prog-slider-row">
                        <span class="prog-field-label">{tomatoI18n.每卷标题数}</span>
                        <input
                            type="number"
                            class="b3-text-field prog-n-input"
                            min="1"
                            max="99"
                            step="1"
                            bind:value={structN}
                            onchange={clampN}
                            aria-label={tomatoI18n.每卷标题数}
                        />
                    </div>
                    <div class="prog-field-hint">{tomatoI18n.结构模式提示}</div>
                {:else}
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
                {/if}
            </section>

            <!-- 破坏性后果警示恒可见：置卷预览卡上方（勿放内容流末尾——7 卷态 body
                 内滚会把它裁出可视区，vision P1 两轮实锤） -->
            <div class="prog-addbook-warn" role="alert">{tomatoI18n.切分须知}</div>

            <section class="prog-card prog-vol-card">
                <div class="prog-card-title">{tomatoI18n.卷预览}</div>
                {#if vols.length <= 1}
                    <div class="prog-no-heading">
                        {#if mode === "structure"}
                            {tomatoI18n.无需分卷结构
                                .replace("{c}", String(selHeadCount))
                                .replace("{n}", String(structN))}
                        {:else}
                            {tomatoI18n.无需分卷
                                .replace("{t}", String(totalLen))
                                .replace("{m}", String(MAX_TIERS[maxIdx] / 10000))}{#if totalLen > MAX_TIERS[0]}{tomatoI18n.无需分卷调细提示}{/if}
                        {/if}
                    </div>
                {:else}
                    <div class="vol-list">
                        {#each vols as v, i (i)}
                            <div class="vol-row" class:vol-over={v.overLimit}>
                                <span class="vol-name">{volDocBaseTitle(i, v)}</span>
                                {#if v.suffix}<span class="vol-badge">{v.suffix.trim()}</span>{/if}
                                <span class="vol-nums">{v.charCount} 字 · {v.blocks.length} 块</span>
                            </div>
                        {/each}
                    </div>
                    <div class="vol-total">
                        {tomatoI18n.共N卷C字.replace("{n}", String(vols.length)).replace("{c}", String(totalLen))}
                    </div>
                {/if}
            </section>
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
        box-sizing: border-box;
        /* 打磨批（footer 贴底）：短内容撑满整高（min-height 100% 解析=包装层已被
           :has 规则 flex:1 接通）；长内容自然长高由 b3-dialog__body 滚动 */
        min-height: 100%;
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
    /* 切分方式 chips：右贴对齐（radio 语义，chip 选中态复用 :has(input:checked)） */
    .prog-mode-chips {
        display: flex;
        gap: 8px;
    }
    .prog-mode-chips .prog-chip {
        padding: 4px 10px;
    }
    /* N 输入：窄右贴（b3-text-field 帧线=outline 家族，宽高自管） */
    .prog-n-input {
        width: 72px;
        padding: 3px 8px;
        text-align: center;
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
    /* 卷预览卡拉伸吃掉短态空白（弹窗定高 790 为 9 卷态算的，5~6 卷态 footer 上方会
       裸空 ~100-140px——vision P2：卡片 flex 化让汇总行贴卡底，留白收进卡片语义内） */
    .prog-vol-card {
        display: flex;
        flex-direction: column;
        flex: 1 1 auto;
        min-height: 0;
    }
    /* 卷预览列表：平铺直读（信息平铺不藏 hover），超限卷 warning 色行内标黄。
       max-height 300=9 卷零内滚（行 ~33px；结构模式 7 编+前置+后记常态 9 卷，260 时
       卷09 沉滚动区外无提示）；更多卷内滚兜底 */
    .vol-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
        flex: 1 1 auto;
        min-height: 0;
        max-height: 300px;
        overflow-y: auto;
    }
    .vol-row {
        display: flex;
        align-items: baseline;
        /* 左贴分布：角标须紧跟主名（space-between 会把它悬在行中，vision 三轮 P1）——
           右侧数字列改 margin-left:auto 贴右，行内间距由 vol-badge 的 margin 承担 */
        justify-content: flex-start;
        gap: 0;
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

    /* □6 角标次要化：照 .vol-nums 范式（小字号+on-surface+低透明度）——vision P1 修；
       挪出 .vol-name 裁剪区作 flex 兄弟项（vol-name ellipsis 时角标最先被裁，review P2-1） */
    .vol-badge {
        flex-shrink: 0;
        margin-left: 4px;
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        opacity: 0.64;
    }
    .vol-nums {
        flex-shrink: 0;
        margin-left: auto;
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
        /* -14px 负 margin 抵掉 container 水平 padding：分隔线贴弹窗两缘贯通（SplitPieceDialog
           同款）；margin-top:auto 须在简写后（flex 尾行推底——短内容时按钮区贴 Dialog 底，
           sticky 兜长内容滚动态） */
        margin: 0 -14px;
        margin-top: auto;
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
