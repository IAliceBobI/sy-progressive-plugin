<script lang="ts">
    import { icon } from "../../sy-tomato-plugin/src/libs/utils";
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
    import type { FloatDocKind } from "./progFloatState";

    // □11 🗺 路线指引浮层（□8 拍板 B+A 组合的 A 侧）：「你在这里，能去哪」的当前态
    // 出边列表（四态各一），纯 pull 无 push；数据=静态路线表（docs/prog-floatbar-ux-redesign.md
    // 「使用路线图」章的用户语言版，与飞书帮助文档同源）。
    // routemap □2：片态按意图分三组（读完这片/留点什么/去别处）——「读完这片」里删/不删
    // 两条平级呈现（routemap □1 计数解耦：翻页留片与下片删同权计入今日阅读），把「多
    // 条使用路径」的地图感做出来；其余态条目少保持单组平铺（无组头渲染不变）。
    // 仿写联动页脚（书态专属，父层按态注入）：说明行 + 动作按钮——未装仿写 toast 引导、
    // 已装转发 reciteTogglePractice 命令把本书设为仿写原文（已在练习中则按钮换删除语义）。
    let {
        kind,
        reciteOn = false,
        onSendRecite,
    }: { kind: FloatDocKind; reciteOn?: boolean; onSendRecite?: () => void } = $props();

    interface RouteItem { icon: string; text: () => string }
    interface RouteGroup { title?: () => string; items: RouteItem[] }
    const ROUTE: Record<FloatDocKind, { title: () => string; groups: RouteGroup[] }> = {
        book: {
            title: () => tomatoI18n.路线指引书,
            groups: [{
                items: [
                    { icon: "iconProgPlay", text: () => tomatoI18n.路线书继续读 },
                    { icon: "iconProgScissors", text: () => tomatoI18n.路线书摘抄 },
                    { icon: "iconProgCard", text: () => tomatoI18n.路线书附属卡 },
                    { icon: "iconProgContents", text: () => tomatoI18n.路线书目录 },
                    { icon: "iconProgTraceUp", text: () => tomatoI18n.路线书追溯 },
                    { icon: "iconProgSwap", text: () => tomatoI18n.路线书换书 }, // □2 common 组既有能力补列
                    { icon: "iconProgAddBook", text: () => tomatoI18n.路线书加书 }, // □18 各态常驻
                    { icon: "iconProgArchive", text: () => tomatoI18n.路线书归档 },
                ],
            }],
        },
        piece: {
            title: () => tomatoI18n.路线指引片,
            groups: [
                {
                    title: () => tomatoI18n.路线组读完这片,
                    items: [
                        { icon: "iconProgNext", text: () => tomatoI18n.路线片下一片 },
                        { icon: "iconProgFFast", text: () => tomatoI18n.路线片下一片纯 },
                    ],
                },
                {
                    title: () => tomatoI18n.路线组留点什么,
                    items: [
                        { icon: "iconProgScissors", text: () => tomatoI18n.路线片摘抄 },
                        { icon: "iconProgCardAdd", text: () => tomatoI18n.路线片制卡 },
                        { icon: "iconProgInbox", text: () => tomatoI18n.路线片收集提取 },
                        { icon: "iconProgSend", text: () => tomatoI18n.路线片仿写 }, // □2 低频提示组尾
                    ],
                },
                {
                    title: () => tomatoI18n.路线组去别处,
                    items: [
                        { icon: "iconProgPrev", text: () => tomatoI18n.路线片回看 },
                        { icon: "iconProgBook", text: () => tomatoI18n.路线片原书 },
                        { icon: "iconProgSwap", text: () => tomatoI18n.路线片换书 },
                        { icon: "iconProgAddBook", text: () => tomatoI18n.路线片加书 }, // □18 各态常驻
                    ],
                },
            ],
        },
        digest: {
            title: () => tomatoI18n.路线指引摘抄,
            groups: [{
                // □2 翻新 5→10：补 □1 池扩容后的能力面。排序=去源书（继续读/回原书）→
                // 卡与记忆（附属卡/复访/制卡与收集）→ 转化产出（送仿写/再摘抄）→ 总览 → 离开。
                // 归档有意不列（bear 定稿「不进」：退出语义，路指引进场用户还不需要）
                items: [
                    { icon: "iconProgPlay", text: () => tomatoI18n.路线摘抄继续读 },
                    { icon: "iconProgBook", text: () => tomatoI18n.路线摘抄回原书 },
                    { icon: "iconProgCard", text: () => tomatoI18n.路线摘抄附属卡 },
                    { icon: "iconProgSched", text: () => tomatoI18n.路线摘抄复访 },
                    { icon: "iconProgCardAdd", text: () => tomatoI18n.路线摘抄制卡与收集 },
                    { icon: "iconProgSend", text: () => tomatoI18n.路线摘抄送仿写 },
                    { icon: "iconProgScissors", text: () => tomatoI18n.路线摘抄再摘抄 },
                    { icon: "iconProgTree", text: () => tomatoI18n.路线摘抄路线图 },
                    { icon: "iconProgQuill", text: () => tomatoI18n.路线摘抄汇总 },
                    { icon: "iconProgSwap", text: () => tomatoI18n.路线摘抄换书 },
                ],
            }],
        },
        free: {
            title: () => tomatoI18n.路线指引自由,
            groups: [{
                // □2 翻新 2→6：freepool 后真实能力面（整摘/断句/关联摘抄/目录）
                items: [
                    { icon: "iconProgScissors", text: () => tomatoI18n.路线自由摘抄 },
                    { icon: "iconProgWhole", text: () => tomatoI18n.路线自由整摘 },
                    { icon: "iconSplitTB", text: () => tomatoI18n.路线自由断句 },
                    { icon: "iconProgTraceUp", text: () => tomatoI18n.路线自由关联摘抄 },
                    { icon: "iconProgContents", text: () => tomatoI18n.路线自由目录 },
                    { icon: "iconProgAddBook", text: () => tomatoI18n.路线自由加书 },
                ],
            }],
        },
    };
</script>

<div class="prog-popover-group prog-route-here">{ROUTE[kind].title()}</div>
{#each ROUTE[kind].groups as g, gi (gi)}
    {#if g.title}
        <div class="prog-popover-group prog-route-sub" class:prog-route-sub-first={gi === 0}>{g.title()}</div>
    {/if}
    <div class="prog-popover-list">
        {#each g.items as it, i (i)}
            <!-- title 兜底截断后的全文（vision review P1：nowrap+ellipsis 必须配 title） -->
            <div class="prog-popover-item prog-route-item" title={it.text()}>
                {@html icon(it.icon, 12)}
                <span class="prog-popover-item-text">{it.text()}</span>
            </div>
        {/each}
    </div>
{/each}

{#if onSendRecite}
    <div class="prog-popover-group prog-route-here">{tomatoI18n.仿写联动}</div>
    <div class="prog-route-recite-hint">{tomatoI18n.仿写联动说明}</div>
    <button class="prog-route-recite-btn" onclick={onSendRecite}>
        {@html icon("iconProgQuill", 12)}
        <span>{reciteOn ? tomatoI18n.删除仿写模式 : tomatoI18n.设为仿写原文}</span>
    </button>
{/if}
