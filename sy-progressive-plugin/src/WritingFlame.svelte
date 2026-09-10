<script lang="ts">
    // □5 写作小火焰：与阅读火苗（FleetFlame）并排的写作侧入口（鸟 09-08 17:35：素材对标
    // 分片、成书对标书目，写作该有独立的火苗与点击直达）。差异：壳=品牌青（阅读=琥珀）、
    // 数字=今日已写片数（滚筒计数同权拆出显示）、芯两态（写过=绿/未写=中性灰，无欠债
    // 概念不设惩罚色）；皮肤跟阅读火苗同 store 换形（Pro 门禁同款兜底）。无写作书=不渲染。
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
    import type { Writable } from "svelte/store";
    import { PROG_FLAMES, DEFAULT_FLAME_SLUG, FLAME_CORE_D, progFlameSkin, progPaid, PROG_GATE_OPEN } from "./theme";
    import type { WritingFlameData } from "./fleet";

    let { flame, onOpen }: { flame: Writable<WritingFlameData | null>; onOpen: () => any } = $props();

    const state = $derived(($flame?.today ?? 0) > 0 ? "wrote" : "idle");
    const tooltip = $derived(
        $flame == null ? "" : tomatoI18n.写作火苗提示($flame.today, $flame.bookName, $flame.slotTitle, $flame.materialUnread),
    );
    const skin = $derived(
        PROG_FLAMES.find(s => s.slug === $progFlameSkin)
        ?? PROG_FLAMES.find(s => s.slug === DEFAULT_FLAME_SLUG),
    );
    const paid = $derived($progPaid !== false || PROG_GATE_OPEN);
    const flameD = $derived(paid || !skin.pro ? skin.d : PROG_FLAMES[0].d);
    const coreD = $derived(paid || !skin.pro ? (skin.coreD ?? FLAME_CORE_D) : FLAME_CORE_D);
</script>

{#if $flame}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <button
        class="prog-flame prog-wflame b3-tooltips b3-tooltips__n"
        data-state={state}
        aria-label={tooltip}
        onclick={() => onOpen()}
    >
        <svg class="prog-flame-svg" viewBox="0 0 24 32" aria-hidden="true">
            <path class="prog-flame-base" d={flameD} />
            <path class="prog-flame-core" d={coreD} />
        </svg>
        <span class="prog-flame-label">{tomatoI18n.写作火苗标签}</span>
        <span class="prog-flame-num">{$flame.today}</span>
    </button>
{/if}
