<script lang="ts">
    // 渐进设置页域组件（2026-09-03 双栏改造）：自 Settings.svelte 整块搬运，卡片内部一行不动；
    // 本组件=「基础设置」域的卡片
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
    import {
        windowOpenStyle,
        flashcardNotebook,
        initProgFloatBtnsDisable,
    } from "../../sy-tomato-plugin/src/libs/stores";
    import NotebookSelect from "../../sy-tomato-plugin/src/NotebookSelect.svelte";
</script>

<div class="settingBox">
    <div class="section-title">{tomatoI18n.基础设置}</div>
    <div>
        <!-- □2 选择化：原 0-6 裸数字输入改下拉，存量值原样兼容；脏值兜底失效占位 -->
        <select class="b3-select" bind:value={$windowOpenStyle}>
            <option value="0">{tomatoI18n.打开方式不打开}</option>
            <option value="1">{tomatoI18n.打开方式前台页签}</option>
            <option value="2">{tomatoI18n.打开方式后台页签}</option>
            <option value="3">{tomatoI18n.打开方式右侧分屏}</option>
            <option value="4">{tomatoI18n.打开方式底部分屏}</option>
            <option value="5">{tomatoI18n.打开方式独立窗口}</option>
            <option value="6">{tomatoI18n.打开方式瞄一眼自动返回}</option>
            {#if !["0", "1", "2", "3", "4", "5", "6"].includes($windowOpenStyle)}
                <option value={$windowOpenStyle}>{$windowOpenStyle} {tomatoI18n.已失效请重新选择}</option>
            {/if}
        </select>
        {tomatoI18n.新开窗口如何打开}
    </div>

    <div>
        <!-- □2 选择化：原裸 ID 输入改笔记本选择器，lsNotebooks 实时取（禁缓存） -->
        <NotebookSelect
            bare
            store={flashcardNotebook}
            emptyLabel={() => tomatoI18n.未设置跟随当前文档}
            emptyTitle={() => tomatoI18n.未设置跟随当前文档}
        />
        {tomatoI18n.新闪卡存入的笔记本}
    </div>

    <div>
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$initProgFloatBtnsDisable}
        />
        <span class="b3-tooltips b3-tooltips__n" aria-label={tomatoI18n.tip设置禁用浮条}>{tomatoI18n.禁用初始化渐进学习浮动按钮}</span>
    </div>
</div>
