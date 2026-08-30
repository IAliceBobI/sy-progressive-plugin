<script lang="ts">
    import { icon } from "../../sy-tomato-plugin/src/libs/utils";
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
    import type { FloatDocKind } from "./progFloatState";

    // □11 🗺 路线指引浮层（□8 拍板 B+A 组合的 A 侧）：「你在这里，能去哪」的当前态
    // 出边列表（四态各一），纯 pull 无 push；数据=静态路线表（docs/prog-floatbar-ux-redesign.md
    // 「使用路线图」章的用户语言版，与飞书帮助文档同源）。
    // 仿写联动页脚（书态专属，父层按态注入）：说明行 + 动作按钮——未装仿写 toast 引导、
    // 已装转发 reciteTogglePractice 命令把本书设为仿写原文（已在练习中则按钮换删除语义）。
    let {
        kind,
        reciteOn = false,
        onSendRecite,
    }: { kind: FloatDocKind; reciteOn?: boolean; onSendRecite?: () => void } = $props();

    interface RouteItem { icon: string; text: () => string }
    const ROUTE: Record<FloatDocKind, { title: () => string; items: RouteItem[] }> = {
        book: {
            title: () => tomatoI18n.路线指引书,
            items: [
                { icon: "iconProgPlay", text: () => tomatoI18n.路线书继续读 },
                { icon: "iconProgScissors", text: () => tomatoI18n.路线书摘抄 },
                { icon: "iconProgCard", text: () => tomatoI18n.路线书附属卡 },
                { icon: "iconProgContents", text: () => tomatoI18n.路线书目录 },
                { icon: "iconProgTraceUp", text: () => tomatoI18n.路线书追溯 },
                { icon: "iconProgAddBook", text: () => tomatoI18n.路线书加书 }, // □18 各态常驻
                { icon: "iconProgArchive", text: () => tomatoI18n.路线书归档 },
            ],
        },
        piece: {
            title: () => tomatoI18n.路线指引片,
            items: [
                { icon: "iconProgNext", text: () => tomatoI18n.路线片下一片 },
                { icon: "iconProgPrev", text: () => tomatoI18n.路线片回看 },
                { icon: "iconProgScissors", text: () => tomatoI18n.路线片摘抄 },
                { icon: "iconProgBook", text: () => tomatoI18n.路线片原书 },
                { icon: "iconProgCardAdd", text: () => tomatoI18n.路线片制卡 },
                { icon: "iconProgInbox", text: () => tomatoI18n.路线片收集提取 },
                { icon: "iconProgSwap", text: () => tomatoI18n.路线片换书 },
                { icon: "iconProgAddBook", text: () => tomatoI18n.路线片加书 }, // □18 各态常驻
            ],
        },
        digest: {
            title: () => tomatoI18n.路线指引摘抄,
            items: [
                { icon: "iconProgSend", text: () => tomatoI18n.路线摘抄送仿写 },
                { icon: "iconProgBook", text: () => tomatoI18n.路线摘抄回原书 },
                { icon: "iconProgTree", text: () => tomatoI18n.路线摘抄路线图 },
                { icon: "iconProgQuill", text: () => tomatoI18n.路线摘抄汇总 },
                { icon: "iconProgScissors", text: () => tomatoI18n.路线摘抄再摘抄 },
            ],
        },
        free: {
            title: () => tomatoI18n.路线指引自由,
            items: [
                { icon: "iconProgScissors", text: () => tomatoI18n.路线自由摘抄 },
                { icon: "iconProgAddBook", text: () => tomatoI18n.路线自由加书 },
            ],
        },
    };
</script>

<div class="prog-popover-group prog-route-here">{ROUTE[kind].title()}</div>
<div class="prog-popover-list">
    {#each ROUTE[kind].items as it, i (i)}
        <!-- title 兜底截断后的全文（vision review P1：nowrap+ellipsis 必须配 title） -->
        <div class="prog-popover-item prog-route-item" title={it.text()}>
            {@html icon(it.icon, 12)}
            <span class="prog-popover-item-text">{it.text()}</span>
        </div>
    {/each}
</div>

{#if onSendRecite}
    <div class="prog-popover-group prog-route-here">{tomatoI18n.仿写联动}</div>
    <div class="prog-route-recite-hint">{tomatoI18n.仿写联动说明}</div>
    <button class="prog-route-recite-btn" onclick={onSendRecite}>
        {@html icon("iconProgQuill", 12)}
        <span>{reciteOn ? tomatoI18n.删除仿写模式 : tomatoI18n.设为仿写原文}</span>
    </button>
{/if}
