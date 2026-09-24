<script lang="ts">
    // need-0924-01 到期复访卡片流（鸟 09-24 拍板形态）：单张到期待办卡，完成/推迟/看原文
    // 三动作就地处理，处理完自动推下一张（最早到期在前=逾期最久先清），最后一张处理完
    // toast+自动关（「清空即走」）；看原文只滚动定位不聚焦（bear 拍板）且弹窗保持开着
    // 等回来。组装纯函数 dueCardsOf（单测在 tests/unit/dueCardFlow.test.ts）；动作复用
    // applyReviewAction（think/pdigest 键分流）；⋯=复访节奏/移除（schedSubmenuItems 复用）。
    import { onMount } from "svelte";
    import { Menu } from "siyuan";
    import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
    import { OpenSyFile2 } from "../../sy-tomato-plugin/src/libs/docUtils";
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
    import { dueReviewSQLFor, mergeDueRows, parseReview, ReviewKey, PdigestReviewKey } from "./reviewQueue";
    import type { DueRow } from "./reviewQueue";
    import { dueCardsOf } from "./dueCardFlow";
    import type { DueCard } from "./dueCardFlow";
    import { applyReviewAction, schedSubmenuItems } from "./reviewMenu";
    import { setDigestDueOverride } from "./fleet";

    let { plugin, onClose }: { plugin: any; onClose: () => any } = $props();

    let loading = $state(true);
    let cards = $state<DueCard[]>([]);
    let busy = $state(false);
    const cur = $derived(cards[0] ?? null); // 当前卡=最早到期；处理后重拉自动换下张
    const kindIcon = $derived(!cur ? "" : cur.kind === "digest" ? "#iconProgQuill"
        : cur.kind === "curve" ? "#iconProgThink" : "#iconCalendar");
    const dueText = $derived(!cur ? ""
        : cur.overdueDays === 0 ? tomatoI18n.今天到期 : tomatoI18n.逾期N天(cur.overdueDays));

    /** 打开时拉真值（重开弹窗即校准；处理中不重拉——索引窗内旧值会回魂，乐观 drop 管流程） */
    async function load() {
        const now = Date.now();
        const [think, pd] = await Promise.all([
            siyuan.sql(dueReviewSQLFor(ReviewKey, now)) as Promise<DueRow[]>,
            siyuan.sql(dueReviewSQLFor(PdigestReviewKey, now)) as Promise<DueRow[]>,
        ]);
        cards = dueCardsOf(mergeDueRows(think ?? [], pd ?? []), now);
        loading = false;
    }
    onMount(() => void load());

    /** 乐观出队：当前卡移出+角标计数同步（fleet 乐观窗：refreshFlame 信号轮在 SQL 索引
     *  窗内拿旧值回写覆盖计数——dv 实测竞速不可赌，setDigestDueOverride 让信号轮让位 8s，
     *  过期/30s 定时轮自然校准真值） */
    function drop() {
        cards = cards.slice(1);
        setDigestDueOverride(cards.length);
        if (cards.length === 0) {
            void siyuan.pushMsg(tomatoI18n.复访已清空);
            onClose();
        }
    }

    async function act(action: "complete" | "defer") {
        if (!cur || busy) return;
        busy = true;
        try {
            await applyReviewAction([cur.id], action, cur.v, cur.key);
            // 乐观推下一张：动作已落盘但 SQL 索引秒级窗内重查会拿旧值（dv 实测重拉卡面
            // 残留/回魂），本地 shift 立即换卡；重开弹窗时 load 再取真值
            drop();
        } finally {
            busy = false;
        }
    }

    function jump() {
        // 只滚动定位禁聚焦（bear 09-15 拍板）；弹窗保持——看完回来继续处理这张
        if (cur && plugin) void OpenSyFile2(plugin, cur.id, "front", ["cb-get-context", "cb-get-hl"]);
    }

    function openMore(e: MouseEvent) {
        if (!cur) return;
        // 节奏子菜单项（曲线/日程/心得/移除）全是「出队」语义：改完 next=未来或移除键，
        // 当前卡即离队——包 drop 乐观出队（索引窗内 reload 拿旧值会回魂，不走 reload）；
        // click 签名=(element,event) 两参，转发原参勿吞（wrapApplied 同款包法）
        const sub = schedSubmenuItems([cur.id], parseReview(cur.v), cur.v, cur.key)
            .map(it => it.click
                ? { ...it, click: async (el: HTMLElement, ev: MouseEvent) => { await it.click!(el, ev); drop(); } }
                : it);
        const menu = new (Menu as any)("progDueCardMore", undefined, true) as Menu;
        // 只挂节奏 submenu（ReviewPlanDialog openRowMenu 同构）：schedSubmenuItems 自带
        // 心得（think 专属）与移除项，顶级再放移除会重复（dv 实测菜单冗余）
        menu.addItem({ icon: "iconProgSched", label: tomatoI18n.复访节奏, submenu: sub });
        setTimeout(() => menu.open({ x: e.clientX, y: e.clientY }), 0);
    }
</script>

<div class="prog-dueflow">
    {#if loading}
        <div class="dueflow-empty">{tomatoI18n.加载中}</div>
    {:else if !cur}
        <div class="dueflow-empty">
            <svg viewBox="0 0 24 24" aria-hidden="true"><use href="#iconProgSched" /></svg>
            <span>{tomatoI18n.无到期复访}</span>
        </div>
    {:else}
        <div class="dueflow-meta">
            <svg class="dueflow-kind" viewBox="0 0 24 24" aria-hidden="true"><use href={kindIcon} /></svg>
            <span class="dueflow-due">{dueText}</span>
            <span class="dueflow-count">{tomatoI18n.剩N张(cards.length)}</span>
        </div>
        <div class="dueflow-card">{cur.label}</div>
        <div class="dueflow-actions">
            <button class="dueflow-act dueflow-act--primary" disabled={busy} onclick={() => void act("complete")}>{cur.completeLabel}</button>
            <button class="dueflow-act" disabled={busy} onclick={() => void act("defer")}>{cur.deferLabel}</button>
            <button class="dueflow-act" onclick={jump}>{tomatoI18n.看原文}</button>
            <button class="dueflow-more" aria-label={tomatoI18n.更多操作} onclick={openMore}>⋯</button>
        </div>
    {/if}
</div>

<style lang="scss">
    .prog-dueflow {
        min-height: 150px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 12px 16px 16px;
        box-sizing: border-box;
    }
    .dueflow-empty {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        color: var(--b3-theme-on-surface);
        opacity: 0.55;
        padding: 26px 0;

        svg {
            width: 18px;
            height: 18px;
        }
    }
    .dueflow-meta {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;

        .dueflow-kind {
            width: 14px;
            height: 14px;
            opacity: 0.7;
            color: var(--b3-theme-on-surface);
        }
        // warning 系必须带 fallback（--b3-theme-warning 不存在=整条声明静默失效，css.md 坑）
        .dueflow-due {
            color: var(--b3-card-warning-color, #d25f00);
        }
        .dueflow-count {
            margin-left: auto;
            opacity: 0.62;
        }
    }
    .dueflow-card {
        flex: 1;
        display: flex;
        align-items: center;
        padding: 14px 16px;
        border-radius: 6px;
        border: 1px solid var(--b3-border-color, rgba(0, 0, 0, 0.1));
        background: var(--b3-theme-surface);
        font-size: 15px;
        line-height: 1.6;
        word-break: break-word;
    }
    .dueflow-actions {
        display: flex;
        align-items: center;
        gap: 8px;

        .dueflow-act {
            flex: 1;
            height: 30px;
            border-radius: 4px;
            border: 1px solid var(--b3-border-color, rgba(0, 0, 0, 0.1));
            background: var(--b3-theme-background);
            color: var(--b3-theme-on-surface);
            font-size: 13px;
            cursor: pointer;

            &:hover {
                background: var(--b3-theme-surface);
            }
            &:disabled {
                opacity: 0.5;
                cursor: default;
            }
        }
        // 主操作 tonal 三件套（css.md：裸改字色与实心按钮打架=文字隐形，color-mix 带底）
        .dueflow-act--primary {
            border-color: color-mix(in srgb, var(--b3-theme-primary) 55%, transparent);
            color: var(--b3-theme-primary);
            background: color-mix(in srgb, var(--b3-theme-primary) 10%, var(--b3-theme-background));

            &:hover {
                background: color-mix(in srgb, var(--b3-theme-primary) 18%, var(--b3-theme-background));
            }
            &:disabled {
                opacity: 0.5;
            }
        }
        .dueflow-more {
            flex: none;
            width: 30px;
            height: 30px;
            border-radius: 4px;
            border: none;
            background: none;
            color: var(--b3-theme-on-surface);
            opacity: 0.7;
            cursor: pointer;

            &:hover {
                background: var(--b3-theme-surface);
                opacity: 1;
            }
        }
    }
</style>
