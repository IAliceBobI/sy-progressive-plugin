<script lang="ts">
    import { onMount } from "svelte";
    import { prog } from "./Progressive";
    import {
        isValidNumber,
        siyuan,
    } from "../../sy-tomato-plugin/src/libs/utils";
    import { Dialog, Plugin } from "siyuan";
    import { ContentLenGroup, HeadingGroup } from "./Split2Pieces";
    import { MarkBookKey } from "../../sy-tomato-plugin/src/libs/gconst";
    import { getDocBlocks } from "../../sy-tomato-plugin/src/libs/docUtils";
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";

    export let bookID: string;
    export let bookName: string;
    export let boxID: string;
    export let dialog: Dialog;
    export let plugin: Plugin;

    boxID;
    plugin;

    let wordCount = 0;
    let textLen = 0;
    let headCount = 1;
    let headingsText = "1";
    let showLastBlock = false;
    let autoCard = false;
    let addIndex = false;
    let splitWordNum = 0;
    let splitType: AsList = "no" as any;
    let disabled = true;
    let contentBlocks: WordCountType[] = [];
    $: contentBlockLen = contentBlocks.length === 0 ? 1 : contentBlocks.length;

    onMount(doCount);

    async function doCount() {
        disabled = true;

        siyuan.getBlocksWordCount([bookID]).then((c) => {
            wordCount = c.stat.wordCount;
        });

        const { root, div } = await getDocBlocks(
            bookID,
            bookName,
            false,
            true,
            1,
        ); // 6.716s
        contentBlocks = root.children.map((block) => {
            if (block.type == "h") headCount++;
            return {
                id: block.id,
                count: 0,
                type: block.type,
                subType: block.subtype,
                div: block.div,
            };
        });

        textLen = div.textContent.length; // calcWords(div.textContent); //0.1s
        disabled = false;
    }

    async function process() {
        const headings =
            headingsText
                ?.trim()
                ?.replace(/，/g, ",")
                ?.split(",")
                ?.map((i) => i.trim())
                ?.filter((i) => !!i) ?? [];
        if (
            !headings.reduce((ret, i) => {
                if (i == "b") return ret;
                const j = Number(i);
                return ret && isValidNumber(j) && j >= 1 && j <= 6;
            }, true)
        ) {
            headingsText = "1,2,3,4,5,6,b";
            return;
        }
        headings.sort();

        if (splitWordNum == null) {
            splitWordNum = 0;
        } else if (!isValidNumber(splitWordNum)) {
            splitWordNum = 300;
            return;
        }

        dialog.destroy();

        {
            const attrs = {} as AttrType;
            attrs["custom-sy-readonly"] = "true";
            attrs["custom-progmark"] = MarkBookKey;
            await siyuan.setBlockAttrs(bookID, attrs);
        }

        if (splitWordNum > 0) {
            contentBlocks.forEach((b) => {
                b.count = b.div.textContent.length; // calcWords(b.div.textContent);
            });
        }

        await siyuan.pushMsg(prog.plugin.i18n.splitByHeadings);

        // heading
        let groups = (
            await new HeadingGroup(contentBlocks, headings, bookID).init()
        ).split();

        // word num
        if (splitWordNum > 0) {
            await siyuan.pushMsg(
                prog.plugin.i18n.splitByWordCount + ":" + splitWordNum,
            );
            groups = new ContentLenGroup(groups, splitWordNum).split();
        }

        await prog.storage.saveIndex(bookID, groups);
        await prog.storage.resetBookReadingPoint(bookID);
        await prog.storage.toggleAutoCard(bookID, autoCard);
        await prog.storage.setShowLastBlock(bookID, showLastBlock);
        await prog.storage.setAddingIndex2paragraph(bookID, addIndex);
        if (splitType == "i" || splitType == "p" || splitType == "t") {
            await prog.storage.setAutoSplitSentence(bookID, true, splitType);
        } else {
            await prog.storage.disableAutoSplitSentence(bookID);
        }
        prog.startToLearnWithLock(bookID);
    }
</script>

<!-- https://learn.svelte.dev/tutorial/if-blocks -->
<div class="fn__hr"></div>
<div class="prog-style__id">《{bookName}》</div>
<div class="fn__hr"></div>
<div class="prog-style__id">
    {tomatoI18n.总字数} : {wordCount}<br />
    {tomatoI18n.总文本长度} : {textLen}<br />
    {tomatoI18n.各级标题数} : {headCount}<br />
    {tomatoI18n.总内容块数} : {contentBlockLen}<br />
    {tomatoI18n.平均每个标题下有x块(Math.ceil(contentBlockLen / headCount))}<br
    />
    {tomatoI18n.平均每个块的字数(Math.ceil(wordCount / contentBlockLen))}<br />
    {tomatoI18n.平均每个块的文本长度(Math.ceil(textLen / contentBlockLen))}
</div>
{#if disabled}
    <p class="notice">🫸🫸🫸{tomatoI18n.请耐心等待}🫷🫷🫷</p>
{:else}
    <div class="fn__hr"></div>
    <div class="prog-style__id">1、{prog.plugin.i18n.splitByHeadings}</div>
    <input
        type="text"
        class="prog-style__input"
        placeholder="1,2,3,4,5,6,b"
        bind:value={headingsText}
    />
    <div class="fn__hr"></div>
    <div class="prog-style__id">2、{tomatoI18n.按文本长度拆分}</div>
    <input
        type="number"
        class="prog-style__input"
        placeholder="300"
        min="0"
        bind:value={splitWordNum}
    />
    <div class="fn__hr"></div>
    <label title={prog.plugin.i18n.autoCard}>
        {tomatoI18n.把阅读到的分片设置为闪卡}
        <input
            type="checkbox"
            class="prog-style__checkbox"
            bind:checked={autoCard}
        />
    </label>
    <div class="fn__hr"></div>
    <label>
        {tomatoI18n.显示上一个分片的最后一个块}
        <input
            type="checkbox"
            class="prog-style__checkbox"
            bind:checked={showLastBlock}
        />
    </label>
    <div class="fn__hr"></div>
    <label>
        {tomatoI18n.新建分片时给段落标上序号}
        <input
            type="checkbox"
            class="prog-style__checkbox"
            bind:checked={addIndex}
        />
    </label>
    <div class="fn__hr"></div>
    {#each ["p", "t", "i", "no"] as t}
        <label>
            <input
                type="radio"
                name="scoops"
                value={t}
                bind:group={splitType}
            />
            {t == "no" ? tomatoI18n.不断句 : ""}
            {t == "p" ? tomatoI18n.断句为段落块 : ""}
            {t == "t" ? tomatoI18n.断句为任务块 : ""}
            {t == "i" ? tomatoI18n.断句为无序表 : ""}
        </label><br />
    {/each}
    <div class="fn__hr"></div>
    <button class="prog-style__button" on:click={process}
        >{prog.plugin.i18n.addOrReaddDoc}</button
    >
    <div class="fn__hr"></div>
{/if}

<style>
    .notice {
        font-size: larger;
    }
</style>
