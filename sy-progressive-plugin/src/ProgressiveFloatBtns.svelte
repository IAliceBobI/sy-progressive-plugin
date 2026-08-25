<script lang="ts">
    import FloatBar from "../../sy-tomato-plugin/src/libs/FloatBar.svelte";
    import PieceTopBar from "./PieceTopBar.svelte";
    import type { Writable } from "svelte/store";
    import { getFrontend } from "siyuan";
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
    import { getProgressivePluginConfig } from "../../sy-tomato-plugin/src/libs/utils";
    import { prog } from "./Progressive";
    import { HtmlCBType } from "./constants";

    interface PropsType {
        zIndexPlus: Writable<boolean>;
        show: Writable<boolean>;
        title: Writable<string>;
        point: Writable<number>;
        noteID: Writable<string>;
        bookID: Writable<string>;
    }
    let { zIndexPlus, show, title, point, noteID, bookID }: PropsType =
        $props();

    // 与 events.isMobile 同源（getFrontend 的移动分支）；app 会话内不变，顶层求一次即可。
    // 不 import events 单例——progressive 组件多引入 tomato 内部模块会扰动 bundle 模块序
    // （2026-08-25 实测：经 events 判分叉后移动端浮条不渲染），siyuan 官方导出无此问题。
    const isMobile = getFrontend() === "mobile" || getFrontend() === "browser-mobile";

    // 移动端形态开关（默认 true 顶部固定；false 回退可拖拽浮条）。配置改动经设置面板
    // 确认后整页 reload 生效，顶层读一次即可。
    const useTopBar = isMobile && getProgressivePluginConfig().mobileTopBar !== false;
</script>

{#snippet btns()}
        <div class="container">
            <!-- ${btn(HtmlCBType.viewContents, "📜", tomatoI18n.打开目录, bookID, noteID, point, prog.settings.btnViewContents)} -->
            {#if getProgressivePluginConfig().btnViewContents}
                <button
                    title={`《${$title}》${tomatoI18n.打开目录}`}
                    class="b3-button b3-button--outline tomato-button"
                    onclick={() => {
                        prog.htmlBlockReadNextPeice(
                            $bookID,
                            $noteID,
                            HtmlCBType.viewContents,
                            $point,
                        );
                    }}>📜</button
                >
            {/if}
            <!-- ${btn(HtmlCBType.previous, "⬅", tomatoI18n.上一个分片, bookID, noteID, point, prog.settings.btnPrevious)} -->
            {#if getProgressivePluginConfig().btnPrevious}
                <button
                    title={`《${$title}》${tomatoI18n.上一个分片}`}
                    class="b3-button b3-button--outline tomato-button"
                    onclick={() => {
                        prog.htmlBlockReadNextPeice(
                            $bookID,
                            $noteID,
                            HtmlCBType.previous,
                            $point,
                        );
                    }}>⬅</button
                >
            {/if}
            <!-- ${btn(HtmlCBType.next, "➡", tomatoI18n.下一个分片, bookID, noteID, point, prog.settings.btnNext)} -->
            {#if getProgressivePluginConfig().btnNext}
                <button
                    title={`《${$title}》${tomatoI18n.下一个分片}`}
                    class="b3-button b3-button--outline tomato-button"
                    onclick={() => {
                        prog.htmlBlockReadNextPeice(
                            $bookID,
                            $noteID,
                            HtmlCBType.next,
                            $point,
                        );
                    }}>➡</button
                >
            {/if}
            <!-- ${btn(HtmlCBType.cleanOriginText, "🧹", tomatoI18n.删除原文, bookID, noteID, point, prog.settings.btnCleanOriginText)} -->
            {#if getProgressivePluginConfig().btnCleanOriginText}
                <button
                    title={`《${$title}》${tomatoI18n.删除原文}`}
                    class="b3-button b3-button--outline tomato-button"
                    onclick={() => {
                        prog.htmlBlockReadNextPeice(
                            $bookID,
                            $noteID,
                            HtmlCBType.cleanOriginText,
                            $point,
                        );
                    }}>🧹</button
                >
            {/if}
            <!-- ${btn(HtmlCBType.fullfilContent, "⬇", tomatoI18n.重新插入分片内容, bookID, noteID, point, prog.settings.btnFullfilContent)} -->
            {#if getProgressivePluginConfig().btnFullfilContent}
                <button
                    title={`《${$title}》${tomatoI18n.重新插入分片内容}`}
                    class="b3-button b3-button--outline tomato-button"
                    onclick={() => {
                        prog.htmlBlockReadNextPeice(
                            $bookID,
                            $noteID,
                            HtmlCBType.fullfilContent,
                            $point,
                        );
                    }}>⬇</button
                >
            {/if}
            <!-- ${btn(HtmlCBType.quit, "🕺", tomatoI18n.关闭分片, bookID, noteID, point, prog.settings.btnStop)} -->
            {#if getProgressivePluginConfig().btnStop}
                <button
                    title={`《${$title}》${tomatoI18n.关闭分片}`}
                    class="b3-button b3-button--outline tomato-button"
                    onclick={() => {
                        prog.htmlBlockReadNextPeice(
                            $bookID,
                            $noteID,
                            HtmlCBType.quit,
                            $point,
                        );
                    }}>🕺</button
                >
            {/if}
            <!-- ${btn(HtmlCBType.nextBook, "📚📖", tomatoI18n.换一本书看, bookID, noteID, point, prog.settings.btnNextBook)} -->
            {#if getProgressivePluginConfig().btnNextBook}
                <button
                    title={`《${$title}》${tomatoI18n.换一本书看}`}
                    class="b3-button b3-button--outline tomato-button"
                    onclick={() => {
                        prog.htmlBlockReadNextPeice(
                            $bookID,
                            $noteID,
                            HtmlCBType.nextBook,
                            $point,
                        );
                    }}>📚📖</button
                >
            {/if}

            <!-- ${btn(HtmlCBType.openFlashcardTab, "⚡", tomatoI18n.打开本书的闪卡, bookID, noteID, point, prog.settings.btnOpenFlashcardTab)} -->
            {#if getProgressivePluginConfig().btnOpenFlashcardTab}
                <button
                    title={`《${$title}》${tomatoI18n.打开本书的闪卡}`}
                    class="b3-button b3-button--outline tomato-button"
                    onclick={() => {
                        prog.htmlBlockReadNextPeice(
                            $bookID,
                            $noteID,
                            HtmlCBType.openFlashcardTab,
                            $point,
                        );
                    }}>⚡</button
                >
            {/if}

            <!-- ${btn(HtmlCBType.deleteAndBack, "⬅🗑", tomatoI18n.删除分片看上一个分片, bookID, noteID, point, prog.settings.btnDeleteBack)} -->
            {#if getProgressivePluginConfig().btnDeleteBack}
                <button
                    title={`《${$title}》${tomatoI18n.删除分片看上一个分片}`}
                    class="b3-button b3-button--outline tomato-button"
                    onclick={() => {
                        prog.htmlBlockReadNextPeice(
                            $bookID,
                            $noteID,
                            HtmlCBType.deleteAndBack,
                            $point,
                        );
                    }}>⬅🗑</button
                >
            {/if}

            <!-- ${btn(HtmlCBType.deleteAndNext, "🗑➡", tomatoI18n.删除分片看下一个分片, bookID, noteID, point, prog.settings.btnDeleteNext)} -->
            {#if getProgressivePluginConfig().btnDeleteNext}
                <button
                    title={`《${$title}》${tomatoI18n.删除分片看下一个分片}`}
                    class="b3-button b3-button--outline tomato-button"
                    onclick={() => {
                        prog.htmlBlockReadNextPeice(
                            $bookID,
                            $noteID,
                            HtmlCBType.deleteAndNext,
                            $point,
                        );
                    }}>🗑➡</button
                >
            {/if}

            <!-- ${btn(HtmlCBType.AddDocCard, "＋🗃", tomatoI18n.将文档加入闪卡, bookID, noteID, point, prog.settings.btnSaveCard)} -->
            {#if getProgressivePluginConfig().btnSaveCard}
                <button
                    title={`《${$title}》${tomatoI18n.将文档加入闪卡}`}
                    class="b3-button b3-button--outline tomato-button"
                    onclick={() => {
                        prog.htmlBlockReadNextPeice(
                            $bookID,
                            $noteID,
                            HtmlCBType.AddDocCard,
                            $point,
                        );
                    }}>＋🗃</button
                >
            {/if}

            <!-- ${btn(HtmlCBType.DelDocCard, "－🗃", tomatoI18n.删除文档闪卡, bookID, noteID, point, prog.settings.btnDelCard)} -->
            {#if getProgressivePluginConfig().btnDelCard}
                <button
                    title={`《${$title}》${tomatoI18n.删除文档闪卡}`}
                    class="b3-button b3-button--outline tomato-button"
                    onclick={() => {
                        prog.htmlBlockReadNextPeice(
                            $bookID,
                            $noteID,
                            HtmlCBType.DelDocCard,
                            $point,
                        );
                    }}>－🗃</button
                >
            {/if}

            <!-- ${btn(HtmlCBType.deleteAndExit, "🗑🕺", tomatoI18n.删除分片并退出, bookID, noteID, point, prog.settings.btnDeleteExit)} -->
            {#if getProgressivePluginConfig().btnDeleteExit}
                <button
                    title={`《${$title}》${tomatoI18n.删除分片并退出}`}
                    class="b3-button b3-button--outline tomato-button"
                    onclick={() => {
                        prog.htmlBlockReadNextPeice(
                            $bookID,
                            $noteID,
                            HtmlCBType.deleteAndExit,
                            $point,
                        );
                    }}>🗑🕺</button
                >
            {/if}

            <!-- ${btn(HtmlCBType.ignoreBook, "🚫", tomatoI18n.不再推送本书, bookID, noteID, point, prog.settings.btnIgnoreBook)} -->
            {#if getProgressivePluginConfig().btnIgnoreBook}
                <button
                    title={`《${$title}》${tomatoI18n.不再推送本书}`}
                    class="b3-button b3-button--outline tomato-button"
                    onclick={() => {
                        prog.htmlBlockReadNextPeice(
                            $bookID,
                            $noteID,
                            HtmlCBType.ignoreBook,
                            $point,
                        );
                    }}>🚫</button
                >
            {/if}

            <!-- ${btn(HtmlCBType.splitByPunctuations, "✂", tomatoI18n.按标点断句 + "VIP", bookID, noteID, point, prog.settings.btnSplitByPunctuations)} -->
            {#if getProgressivePluginConfig().btnSplitByPunctuations}
                <button
                    title={`《${$title}》${tomatoI18n.按标点断句 + "VIP"}`}
                    class="b3-button b3-button--outline tomato-button"
                    onclick={() => {
                        prog.htmlBlockReadNextPeice(
                            $bookID,
                            $noteID,
                            HtmlCBType.splitByPunctuations,
                            $point,
                        );
                    }}>✂</button
                >
            {/if}

            <!-- ${btn(HtmlCBType.splitByPunctuationsListCheck, "✂✅", tomatoI18n.按标点断句Checkbox + "VIP", bookID, noteID, point, prog.settings.btnSplitByPunctuationsListCheck)} -->
            {#if getProgressivePluginConfig().btnSplitByPunctuationsListCheck}
                <button
                    title={`《${$title}》${tomatoI18n.按标点断句Checkbox + "VIP"}`}
                    class="b3-button b3-button--outline tomato-button"
                    onclick={() => {
                        prog.htmlBlockReadNextPeice(
                            $bookID,
                            $noteID,
                            HtmlCBType.splitByPunctuationsListCheck,
                            $point,
                        );
                    }}>✂✅</button
                >
            {/if}

            <!-- ${btn(HtmlCBType.splitByPunctuationsList, "✂📌", tomatoI18n.按标点断句列表 + "VIP", bookID, noteID, point, prog.settings.btnSplitByPunctuationsList)} -->
            {#if getProgressivePluginConfig().btnSplitByPunctuationsList}
                <button
                    title={`《${$title}》${tomatoI18n.按标点断句列表 + "VIP"}`}
                    class="b3-button b3-button--outline tomato-button"
                    onclick={() => {
                        prog.htmlBlockReadNextPeice(
                            $bookID,
                            $noteID,
                            HtmlCBType.splitByPunctuationsList,
                            $point,
                        );
                    }}>✂📌</button
                >
            {/if}
        </div>
{/snippet}

{#if $show}
    {#if useTopBar}
        <!-- 移动端：顶部固定栏钉在思源标题栏下 + 顶开正文（2026-08-25 防遮挡）；
             桌面浮条的拖拽/位置存储/clamp 在此形态不存在。
             snippet 传法用 prop 引用（children={btns}）——标签体内 {btns()} 调用式
             会丢渲染锚点（Svelte 5 实测抛 "reading 'before'"，两分支同崩） -->
        <PieceTopBar onClose={() => show.set(false)} children={btns} />
    {:else}
        <FloatBar
            posKey="prog-piece-floatbar-pos"
            title={$title}
            zIndex={$zIndexPlus ? 999 : 12}
            onClose={() => show.set(false)}
            children={btns}
        />
    {/if}
{/if}

<style>
    .container {
        flex: auto;
        min-width: 50px;
        min-height: 50px;
    }
</style>
