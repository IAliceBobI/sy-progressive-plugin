<script lang="ts">
    // need-0924-01 状态栏 ✧ 到期复访角标（鸟「它来找你」拍板）：计数从火苗 tooltip 尾行
    // （悬停才见）升级为常驻可见+点击直达卡片流；0 条灰淡不隐藏——状态栏不抖、入口
    // 稳定、「点一下确认没欠账」也是价值。计数=digestDueState（refreshFlame 30s+操作
    // 信号同链，think/pdigest 双源）；样式在 index.scss .prog-duebell（火苗同骨架）。
    import { onDestroy } from "svelte";
    import type { Writable } from "svelte/store";
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
    import { showFloatTip, hideFloatTip, destroyFloatTip } from "./floatTip";

    onDestroy(destroyFloatTip); // 自建 tip 单例收尾（与火苗同款纪律）

    let { due, onOpen }: { due: Writable<number>; onOpen: () => any } = $props();

    const num = $derived($due > 99 ? "99+" : String($due)); // >99 截断（浮条到期胶囊同款）
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<button
    class="prog-duebell"
    data-on={$due > 0}
    onmouseenter={(e) => showFloatTip(e.currentTarget)}
    onmouseleave={hideFloatTip}
    aria-label={tomatoI18n.到期复访N条($due)}
    onclick={() => onOpen()}
>
    <svg class="prog-duebell-svg" viewBox="0 0 24 24" aria-hidden="true"><use href="#iconProgSched" /></svg>
    <span class="prog-duebell-num">{num}</span>
</button>
