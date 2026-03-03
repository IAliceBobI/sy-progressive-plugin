<script lang="ts">
    import DialogSvelte from "../../sy-tomato-plugin/src/libs/DialogSvelte.svelte";
    import type { Writable } from "svelte/store";
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
</script>

<DialogSvelte
    show={$show}
    title={$title}
    savePositionKey="ProgressiveFloatBtns 2025-07-16 00:06:03"
    isProgressive={true}
    zIndexPlus={$zIndexPlus}
    minHeight={50}
    minWidth={50}
>
    {#snippet dialogInner()}
        <div class="container" title={tomatoI18n.如果无法拖动}>
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

            <!-- ${btn(HtmlCBType.splitByPunctuations, "✂📜👑", tomatoI18n.按标点断句 + "VIP", bookID, noteID, point, prog.settings.btnSplitByPunctuations)} -->
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
                    }}>✂📜</button
                >
            {/if}

            <!-- ${btn(HtmlCBType.splitByPunctuationsListCheck, "✂✅👑", tomatoI18n.按标点断句Checkbox + "VIP", bookID, noteID, point, prog.settings.btnSplitByPunctuationsListCheck)} -->
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
                    }}>✂✅👑</button
                >
            {/if}

            <!-- ${btn(HtmlCBType.splitByPunctuationsList, "✂📌👑", tomatoI18n.按标点断句列表 + "VIP", bookID, noteID, point, prog.settings.btnSplitByPunctuationsList)} -->
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
                    }}>✂📌👑</button
                >
            {/if}
        </div>
    {/snippet}
</DialogSvelte>

<style>
    .container {
        flex: auto;
        min-width: 50px;
        min-height: 50px;
    }
</style>
