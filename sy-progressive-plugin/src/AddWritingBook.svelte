<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { writable } from "svelte/store";
    import { events } from "../../sy-tomato-plugin/src/libs/Events";
    import { getActiveDocID, siyuan } from "../../sy-tomato-plugin/src/libs/utils";
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
    import { DestroyManager } from "../../sy-tomato-plugin/src/libs/destroyer";
    import NotebookSelect from "../../sy-tomato-plugin/src/NotebookSelect.svelte";
    import { notifyFleetChanged } from "./fleetNotify";
    import { prog } from "./Progressive";
    import { parseOutlineLines } from "./outline";
    import { createWritingBook } from "./writeBook";

    interface Props {
        dm: DestroyManager;
    }

    let { dm }: Props = $props();
    export function destroy() {
        dm.destroyBy();
    }
    onDestroy(destroy);

    let bookName = $state("");
    let outline = $state("");
    let busy = $state(false);
    // 落点笔记本：默认=当前打开文档所在笔记本，兜底留空让用户自选（NotebookSelect
    // 空选项语义）；建书走所选笔记本根，建完用户可随意拖动（身份锚 IAL 不随位置变）
    const nbStore = writable("");

    const slots = $derived(parseOutlineLines(outline));
    // 期A：大纲空=纯收集书（0 槽），不再兜底默认槽
    const slotCount = $derived(slots.length);
    const canSubmit = $derived(
        !busy && bookName.trim().length > 0 && !!$nbStore,
    );

    onMount(async () => {
        try {
            // 当前文档所在笔记本优先（用户视角「就近」，getActiveDocID 与加书链同源），
            // 查询失败留空自选（NotebookSelect 空选项语义）
            const docID = getActiveDocID() || events.docID;
            const box = docID ? (await siyuan.sqlOne(`select box from blocks where id='${docID}'`))?.box : "";
            nbStore.set(box ?? "");
        } catch { /* 就近探测失败留空自选 */ }
    });

    async function process() {
        if (!canSubmit) return;
        busy = true;
        try {
            const { bookID } = await createWritingBook($nbStore, bookName, outline);
            // 注册落定才关弹窗（AddBook 同款：失败弹窗保留可重试）
            destroy();
            notifyFleetChanged(); // Dock 即时见新书，不等 30s 定时器
            await siyuan.pushMsg(tomatoI18n.写作书创建成功, 2500);
            await prog.openOriginBook(bookID);
        } catch (e) {
            console.error("AddWritingBook process failed", e);
            // 重名预检（writeBook.ts docIDAtPath）给对症文案；其余走通用失败
            const dup = String((e as Error)?.message ?? "").includes("name exists");
            await siyuan.pushMsg(dup ? tomatoI18n.写作书名已存在 : tomatoI18n.写作书创建失败请重试);
        } finally {
            busy = false;
        }
    }
</script>

<div class="container">
    <!-- 卡1 基本信息：书名 + 存放笔记本 -->
    <section class="prog-card">
        <div class="prog-card-title">{tomatoI18n.写作书基本信息}</div>
        <div class="prog-field-label">{tomatoI18n.书名}</div>
        <input
            class="b3-text-field prog-bookname"
            type="text"
            bind:value={bookName}
            placeholder={tomatoI18n.写作书名占位}
            aria-label={tomatoI18n.书名}
        />
        <div class="prog-field-label prog-nb-label">{tomatoI18n.存放笔记本}</div>
        <NotebookSelect bare store={nbStore} emptyLabel={() => tomatoI18n.请选择笔记本} emptyTitle={() => tomatoI18n.请选择笔记本} />
        <div class="prog-field-hint">{tomatoI18n.写作书落点说明}</div>
    </section>

    <!-- 卡2 大纲：可选粘贴，一行一槽 -->
    <section class="prog-card">
        <div class="prog-card-title">{tomatoI18n.大纲槽位可选}</div>
        <textarea
            class="b3-text-field prog-outline"
            bind:value={outline}
            rows="8"
            placeholder={tomatoI18n.大纲占位}
            aria-label={tomatoI18n.大纲槽位可选}
        ></textarea>
        <div class="prog-piece-bar">
            <div class="prog-piece-row">
                <span class="prog-piece-value">{slotCount}</span>
                <span class="prog-piece-label">{tomatoI18n.槽位}</span>
                {#if slots.length > 0}
                    <span class="prog-piece-stats">
                        <span class="prog-piece-stat">
                            <span class="prog-piece-stat-label">{tomatoI18n.首槽}</span>
                            <span class="prog-piece-stat-value">{slots[0]}</span>
                        </span>
                        <span class="prog-piece-stat">
                            <span class="prog-piece-stat-label">{tomatoI18n.末槽}</span>
                            <span class="prog-piece-stat-value">{slots.at(-1)}</span>
                        </span>
                    </span>
                {/if}
            </div>
            {#if slots.length === 0}
                <!-- 期A vision P2-1：0 槽态说明并进槽位条第二行（条内 flex-column 多行配方），
                     小视口下外置 hint 会被不透明 sticky footer 盖住——用户看到 0 却看不到解释 -->
                <div class="prog-piece-hint">{tomatoI18n.大纲说明}</div>
            {/if}
        </div>
        {#if slots.length > 0}
            <div class="prog-field-hint">{tomatoI18n.大纲已识别说明}</div>
        {/if}
    </section>

    <!-- 卡3 工作流程：五步玩法速览（帮助篇同口径，术语与浮条按钮一致） -->
    <section class="prog-card">
        <div class="prog-card-title">{tomatoI18n.写作流程标题}</div>
        <ol class="prog-flow">
            <li class="prog-flow-step">
                <span class="prog-flow-dot">1</span>
                <div class="prog-flow-text">
                    <span class="prog-flow-name">{tomatoI18n.写作流程1名}</span>
                    <span class="prog-flow-desc">{tomatoI18n.写作流程1说明}</span>
                </div>
            </li>
            <li class="prog-flow-step">
                <span class="prog-flow-dot">2</span>
                <div class="prog-flow-text">
                    <span class="prog-flow-name">{tomatoI18n.写作流程2名}</span>
                    <span class="prog-flow-desc">{tomatoI18n.写作流程2说明}</span>
                </div>
            </li>
            <li class="prog-flow-step">
                <span class="prog-flow-dot">3</span>
                <div class="prog-flow-text">
                    <span class="prog-flow-name">{tomatoI18n.写作流程3名}</span>
                    <span class="prog-flow-desc">{tomatoI18n.写作流程3说明}</span>
                </div>
            </li>
            <li class="prog-flow-step">
                <span class="prog-flow-dot">4</span>
                <div class="prog-flow-text">
                    <span class="prog-flow-name">{tomatoI18n.写作流程4名}</span>
                    <span class="prog-flow-desc">{tomatoI18n.写作流程4说明}</span>
                </div>
            </li>
            <li class="prog-flow-step">
                <span class="prog-flow-dot">5</span>
                <div class="prog-flow-text">
                    <span class="prog-flow-name">{tomatoI18n.汇编成稿}</span>
                    <span class="prog-flow-desc">{tomatoI18n.写作流程5说明}</span>
                </div>
            </li>
        </ol>
    </section>

    <!-- 底部操作栏：主操作实心 primary，sticky 恒在 -->
    <div class="prog-footer">
        <button class="b3-button prog-primary-btn" disabled={!canSubmit} onclick={process}
            >{busy ? tomatoI18n.创建中 : tomatoI18n.创建}</button
        >
        <button
            class="b3-button b3-button--outline tomato-button"
            onclick={destroy}>{tomatoI18n.退出}</button
        >
    </div>
</div>

<style>
    /* 卡片壳/hint/结果条配方照抄 AddBook.svelte（prog- 前缀防撞，--b3-* 明暗自适应） */
    .container {
        display: flex;
        flex: auto;
        flex-direction: column;
        gap: 10px;
        min-width: 0;
        padding: 12px 14px 0;
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
    .prog-field-label {
        margin: 6px 0 4px;
        font-size: 13px;
        font-weight: 500;
        color: var(--b3-theme-on-surface);
    }
    .prog-nb-label {
        margin-top: 10px;
    }
    .prog-bookname {
        width: 100%;
    }
    /* vision P2-3：与书名输入同宽（NotebookSelect 的 b3-select 默认内容自适应，右缘参差） */
    .prog-card :global(select.b3-select) {
        width: 100%;
    }
    .prog-outline {
        width: 100%;
        /* vision N1：92vh 视效下内容超高 ~40px，hint 被挤出首屏——textarea 收矮保
           「卡1+卡2+hint+footer」一屏内（rows=8 已给足输入空间，min-height 只兜底） */
        min-height: 80px;
        resize: vertical;
        font-family: inherit;
    }
    /* 期A vision P2-1 二轮：≤720px 视口下卡1+卡2 超出「滚动口−footer」预算，槽位条
       第二行说明被不透明 sticky footer 切掉下半截——压 textarea 默认高度补预算
       （rows=8 的默认高 ~184px 压到 126px，输入空间仍足，可手拉） */
    @media (max-height: 720px) {
        .prog-outline {
            height: 126px;
        }
    }
    .prog-field-hint {
        margin-top: 6px;
        font-size: 12px;
        line-height: 1.5;
        color: var(--b3-theme-on-surface);
        opacity: 0.64;
    }
    .prog-piece-bar {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 6px;
        margin-top: 8px;
        padding: 8px 12px;
        background-color: var(--b3-theme-primary-lightest);
        border: 1px solid var(--b3-theme-primary-light);
        border-radius: 6px;
    }
    .prog-piece-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 4px 12px;
    }
    /* 期A 0 槽态第二行说明（vision P2-1）：与外置 hint 同视觉档但随条走 */
    .prog-piece-hint {
        font-size: 12px;
        line-height: 1.5;
        color: var(--b3-theme-on-surface);
        opacity: 0.64;
    }
    .prog-piece-value {
        min-width: 34px;
        font-size: 28px;
        font-weight: 700;
        line-height: 1;
        color: var(--b3-theme-primary);
        text-align: center;
        font-variant-numeric: tabular-nums;
    }
    .prog-piece-label {
        flex: 1;
        font-size: 13px;
        font-weight: 500;
        color: var(--b3-theme-on-background);
    }
    .prog-piece-stats {
        display: flex;
        align-items: baseline;
        gap: 10px;
        margin-left: auto;
    }
    .prog-piece-stat {
        display: flex;
        align-items: baseline;
        gap: 3px;
        max-width: 40%;
        /* vision P1-1：CJK 标签无 nowrap 时可被压到逐字断行（「末槽」拆成「末/槽」）；
           收窄由 value 侧 ellipsis 吸收，标签整块不折 */
        white-space: nowrap;
    }
    .prog-piece-stat-label {
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        opacity: 0.64;
    }
    .prog-piece-stat-value {
        overflow: hidden;
        font-size: 13px;
        font-weight: 600;
        color: var(--b3-theme-on-background);
        white-space: nowrap;
        text-overflow: ellipsis;
    }
    /* 工作流程五步：编号圆点 + 竖向连线，名粗体+说明同段灰字（说明换行时连线自然延长） */
    .prog-flow {
        margin: 0;
        padding: 0;
        list-style: none;
    }
    .prog-flow-step {
        position: relative;
        display: flex;
        align-items: flex-start;
        gap: 8px;
        padding-bottom: 7px;
    }
    .prog-flow-step:not(:last-child)::before {
        content: "";
        position: absolute;
        left: 9px;
        top: 20px;
        bottom: 0;
        width: 1px;
        background-color: var(--b3-border-color);
    }
    .prog-flow-dot {
        flex-shrink: 0;
        width: 18px;
        height: 18px;
        line-height: 16px;
        border: 1px solid var(--b3-theme-primary-light);
        border-radius: 50%;
        background-color: var(--b3-theme-primary-lightest);
        color: var(--b3-theme-primary);
        font-size: 11px;
        font-weight: 600;
        text-align: center;
    }
    .prog-flow-text {
        min-width: 0;
        line-height: 1.55;
    }
    .prog-flow-name {
        margin-right: 6px;
        font-size: 13px;
        font-weight: 600;
        color: var(--b3-theme-on-surface);
    }
    .prog-flow-desc {
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        opacity: 0.64;
    }
    .prog-footer {
        position: sticky;
        bottom: 0;
        z-index: 2;
        display: flex;
        gap: 10px;
        align-items: center;
        padding: 10px 0 12px;
        background-color: var(--b3-theme-surface);
        border-top: 1px solid var(--b3-border-color);
        /* vision P2-4：矮视口内容滚动中间态，贴 footer 的半行字被分界线横穿呈
           「删除线」视效——上抛轻阴影过渡（静止终点态不显现，无副作用） */
        box-shadow: 0 -6px 8px -6px rgba(0, 0, 0, 0.18);
    }
    .prog-footer button {
        margin: 0;
    }
    .prog-primary-btn {
        flex: 1;
        padding: 8px 18px;
        font-weight: 500;
        white-space: normal;
    }
</style>
