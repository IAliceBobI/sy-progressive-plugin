<script lang="ts">
    // v5 □6 状态栏火苗（docs/prog-v5-visual-design.md §2）：恒暖琥珀壳（身份层）+
    // 可变芯焰/辉光（状态层，绿=欠0 黄=欠≤档位 红=欠≥2×档位），形态冗余色盲可读
    // （黄态瘦 15%、红态加宽+慢呼吸）。长驻无动画，仅状态切换时 1.2s 一次性辉光渐入。
    // v5 □8 火苗形态皮肤：path 按 theme.ts 注册表换形（classic 免费 / quill·lantern·
    // twin·wave Pro）；unpaid 且选中 Pro 形态时强制回落 classic（CSS 门禁同款兜底）。
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
    import type { DebtSummary } from "./roller";
    import type { Writable } from "svelte/store";
    import { PROG_FLAMES, DEFAULT_FLAME_SLUG, FLAME_CORE_D, progFlameSkin, progPaid, PROG_GATE_OPEN } from "./theme";
    import { digestDueState } from "./fleet";

    let { flame, onStart }: { flame: Writable<DebtSummary | null>; onStart: () => any } = $props();

    const state = $derived($flame?.state ?? "ok");
    const debt = $derived($flame?.debt ?? 0);
    // 期2 复访通道：火苗 tooltip 尾行非阻塞提示（不占 quota 不进欠债），无到期不占行
    const tooltip = $derived(
        $flame == null
            ? tomatoI18n.今日阅读 + ($digestDueState > 0 ? `\n${tomatoI18n.今日还有N条到期摘抄($digestDueState)}` : "")
            : tomatoI18n.火苗提示($flame.readToday, $flame.quotaToday, $flame.debt, $digestDueState),
    );
    const skin = $derived(
        PROG_FLAMES.find(s => s.slug === $progFlameSkin)
        ?? PROG_FLAMES.find(s => s.slug === DEFAULT_FLAME_SLUG),
    );
    const paid = $derived($progPaid !== false || PROG_GATE_OPEN); // □14a 拆门：Pro 形态回落门同步放开
    const flameD = $derived(paid || !skin.pro ? skin.d : PROG_FLAMES[0].d);
    const coreD = $derived(paid || !skin.pro ? (skin.coreD ?? FLAME_CORE_D) : FLAME_CORE_D);
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<button
    class="prog-flame b3-tooltips b3-tooltips__n"
    data-state={state}
    aria-label={tooltip}
    onclick={() => onStart()}
>
    <svg class="prog-flame-svg" viewBox="0 0 24 32" aria-hidden="true">
        <!-- 外轮廓：恒暖琥珀壳（身份层，Pro 皮肤换形态） -->
        <path class="prog-flame-base" d={flameD} />
        <!-- 芯焰：状态色渲染区（绿/黄/红） -->
        <path class="prog-flame-core" d={coreD} />
    </svg>
    <span class="prog-flame-label">{tomatoI18n.火苗欠债标签}</span>
    <span class="prog-flame-num">{$flame == null ? "–" : debt}</span>
</button>
