<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { prog } from "./Progressive";
    import {
        addCardSetDueTime,
        isValidNumber,
        siyuan,
    } from "../../sy-tomato-plugin/src/libs/utils";
    import { buildContentBlocks, computePieceIndex } from "./Split2Pieces";
    import { MarkBookKey } from "../../sy-tomato-plugin/src/libs/gconst";
    import { getDocBlocks } from "../../sy-tomato-plugin/src/libs/docUtils";
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
    import { DestroyManager } from "../../sy-tomato-plugin/src/libs/destroyer";
    import { createAllPieces } from "./helper";
    import { progStorage, ProgressiveStorage } from "./ProgressiveStorage";
    import { readableDuration, validateNum } from "stonev5-utils";
    import { verifyKeyProgressive } from "../../sy-tomato-plugin/src/libs/user";

    interface Props {
        bookID: string;
        bookName: string;
        dm: DestroyManager;
    }

    let { bookID, bookName, dm }: Props = $props();
    export function destroy() {
        dm.destroyBy();
    }
    onDestroy(destroy);

    let hasCalcPiece = $state(false);
    let wordCount = $state(0);
    let textLen = $state(0);
    let headCount = $state(1);
    let headingsText = $state("1");
    let showLastBlock = $state(false);
    let autoCard = $state(true);
    let createPiecesNow = $state(false);
    let addIndex = $state(false);
    let splitWordNum = $state(0);
    let finishDays = $state(0);
    let splitType: AsList = $state("no" as any);
    let disabled = $state(true);
    let pieceCount = $state(1);
    let contentBlocks: WordCountType[] = $state([]);
    let contentBlockLen = $derived(
        contentBlocks.length === 0 ? 1 : contentBlocks.length,
    );
    let timePerPiece = $derived(
        readableDuration((finishDays * 24 * 60 * 60) / pieceCount, 2),
    );
    let peicePerDay = $derived((pieceCount / finishDays).toFixed(1));
    let tips = $derived.by(() => {
        const schedule = `你已愉快地计划用 ${finishDays} 天读完《${bookName}》的 ${pieceCount} 个分片，每天阅读 ${peicePerDay} 个分片。`;
        const howCard = `你已了解，分片创建和加入闪卡的时机由插件自动控制。`;
        const process = `换算下来，你将有 ${timePerPiece} 的时间来学习每个分片。
第一个分片创建超过 ${timePerPiece} 后，系统才会创建第二个分片。
若第一个分片尚未进行任何复习，第二个分片将暂不创建。
待复习完第一个分片，第二个分片将立即创建并加入闪卡队列。`;
        if (autoCard && finishDays > 0 && createPiecesNow) {
            return `${schedule}虽然会一次性创建所有分片，但${howCard}${process}`;
        } else if (autoCard && finishDays > 0) {
            return `${schedule}${howCard}${process}`;
        } else if (autoCard && createPiecesNow) {
            return `你选择一次性创建《${bookName}》的所有分片，并全部加入闪卡。
该方案适用于可乱序阅读的文档，如单词本、金句集、错题集等。
一次性复习 ${pieceCount} 个闪卡可能会带来压力，你可以使用番茄工具箱的均匀推迟功能，
将 ${pieceCount} 个闪卡均匀分散在指定时间范围内。`;
        } else if (autoCard) {
            return `你已设置《${bookName}》的每个分片创建时自动加入闪卡。`;
        }
    });

    onMount(async () => {
        disabled = true;
        await verifyKeyProgressive();
        await doCount();
        disabled = false;
    });

    async function doCount() {
        siyuan.getBlocksWordCount([bookID]).then((c) => {
            wordCount = c.stat.wordCount;
        });
        contentBlocks = await buildContentBlocks(bookID, bookName);
        // headCount 是 UI 派生状态，副作用留在组件（不放纯函数里）。
        headCount = 1 + contentBlocks.filter(b => b.type == "h").length;
        const { div } = await getDocBlocks(bookID, bookName, false, true, 1);
        textLen = div.textContent.length;
    }

    async function countPieces() {
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

        if (!isValidNumber(splitWordNum)) {
            splitWordNum = 0;
            return;
        }
        if (!isValidNumber(finishDays)) {
            finishDays = 0;
            return;
        }

        // heading
        const groups = await computePieceIndex(contentBlocks, headings, bookID, splitWordNum);
        pieceCount = groups.length;
        hasCalcPiece = true;
        return groups;
    }

    async function process() {
        const groups = await countPieces();
        {
            const attrs = {} as AttrType;
            attrs["custom-sy-readonly"] = "true";
            attrs["custom-progmark"] = MarkBookKey;
            await siyuan.setBlockAttrs(bookID, attrs);
        }
        if (!groups) return;
        destroy();

        // 保存大索引
        await progStorage.saveIndex(bookID, groups);

        // 保存 bookinfo
        const block = await siyuan.getRowByID(bookID);
        const info = ProgressiveStorage.defaultBookInfo();
        info.time = await siyuan.currentTimeMs();
        info.boxID = block.box;
        info.bookID = bookID;
        info.autoCard = autoCard;
        info.showLastBlock = showLastBlock;
        info.addIndex2paragraph = addIndex;
        info.finishDays = finishDays;
        info.bookName = bookName;
        info.finishTimeSecs = await siyuan.currentTimeSec();
        await progStorage.resetBookInfo(bookID, info);

        // 断句
        if (splitType == "i" || splitType == "p" || splitType == "t") {
            await progStorage.setAutoSplitSentence(bookID, true, splitType);
        }

        // 实际执行拆分书籍
        if (createPiecesNow) {
            const ids = await createAllPieces(bookID);
            if (autoCard && ids.length > 0 && finishDays > 0) {
                addCardSetDueTime(ids.at(0), 1000);
            }
        }
        await prog.startToLearnWithLock(bookID);
    }
</script>

<div class="container">
    <div>
        {tomatoI18n.总字数} : {wordCount}<br />
        {tomatoI18n.总文本长度} : {textLen}<br />
        {tomatoI18n.各级标题数} : {headCount}<br />
        {tomatoI18n.总内容块数} : {contentBlockLen}<br />
        {tomatoI18n.平均每个标题下有x块(
            Math.ceil(contentBlockLen / headCount),
        )}<br />
        {tomatoI18n.平均每个块的字数(Math.ceil(wordCount / contentBlockLen))}<br
        />
        {tomatoI18n.平均每个块的文本长度(
            Math.ceil(textLen / contentBlockLen),
        )}<br />
        {tomatoI18n.分片数量} : {pieceCount}
        <button
            class="b3-button b3-button--outline tomato-button"
            onclick={countPieces}>{tomatoI18n.计算分片数量}</button
        >
    </div>
    {#if disabled}
        <div>
            <p class="notice">🫸🫸🫸{tomatoI18n.请耐心等待}🫷🫷🫷</p>
        </div>
    {:else}
        <!-- 标题拆分 -->
        <div>
            <label>
                <p>{prog.plugin.i18n.splitByHeadings}</p>
                <input
                    type="text"
                    class="b3-text-field"
                    placeholder="1,2,3,4,5,6,b"
                    bind:value={headingsText}
                    oninput={() => (hasCalcPiece = false)}
                />
            </label>
        </div>
        <!-- length拆分 -->
        <div>
            <label>
                <p>{tomatoI18n.按文本长度拆分}</p>
                <input
                    type="number"
                    required
                    class="b3-text-field"
                    placeholder="300"
                    min="0"
                    bind:value={splitWordNum}
                    onblur={() => (splitWordNum = validateNum(splitWordNum, 0))}
                    oninput={() => (hasCalcPiece = false)}
                />
            </label>
        </div>
        <!-- 计划阅读 -->
        {#if autoCard}
            <div>
                <label>
                    <p>{tomatoI18n.计划读完本书的天数}</p>
                    <input
                        type="number"
                        required
                        class="b3-text-field"
                        placeholder="30"
                        min="0"
                        bind:value={finishDays}
                        onblur={() => {
                            finishDays = validateNum(finishDays, 0);
                            if (!hasCalcPiece) {
                                countPieces();
                            }
                        }}
                    />
                    <p class="kbd">{tips}</p>
                    {#if createPiecesNow && !(finishDays > 0)}
                        <a
                            href="https://awx9773btw.feishu.cn/docx/KwZJdW9BeoHkiRxVg6jcLUnanqf"
                            >相关：番茄工具箱的均匀推迟功能，重新规划当前文档和其子文档中，所有闪卡的划复习时间。</a
                        >
                    {/if}
                </label>
            </div>
        {/if}

        <!-- 开关 -->
        <div class="container">
            <!-- 一次性创建分片 -->
            <label>
                <input
                    type="checkbox"
                    class="b3-switch"
                    bind:checked={createPiecesNow}
                />
                {tomatoI18n.立刻创建所有的分片}
            </label>
            <!-- 闪卡 -->
            <label title={prog.plugin.i18n.autoCard}>
                <input
                    type="checkbox"
                    class="b3-switch"
                    bind:checked={autoCard}
                />
                {tomatoI18n.分片都加入闪卡}
            </label>
            <!-- 末尾块 -->
            <label>
                <input
                    type="checkbox"
                    class="b3-switch"
                    bind:checked={showLastBlock}
                />
                {tomatoI18n.显示上一个分片的最后一个块}
            </label>
            <!-- 标号 -->
            <label>
                <input
                    type="checkbox"
                    class="b3-switch"
                    bind:checked={addIndex}
                />
                {tomatoI18n.新建分片时给段落标上序号}
            </label>
        </div>

        <!-- 单选 -->
        <div class="container">
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
                </label>
            {/each}
        </div>

        <!-- 保存 -->
        <div class="btns">
            <button
                class="b3-button b3-button--outline tomato-button"
                onclick={process}>{prog.plugin.i18n.addOrReaddDoc}</button
            >
            <button
                class="b3-button b3-button--outline tomato-button"
                onclick={destroy}>{tomatoI18n.退出}</button
            >
        </div>
    {/if}
</div>

<style>
    .btns {
        display: flex;
        justify-content: space-between;
    }
    .container {
        margin: 2px;
        flex: auto;
        display: flex;
        flex-direction: column;
    }
    .container > div {
        margin: 10px;
    }
    .notice {
        font-size: larger;
    }
    .kbd {
        padding: 2px 4px;
        font:
            100% Consolas,
            "Liberation Mono",
            Menlo,
            Courier,
            monospace,
            var(--b3-font-family);
        line-height: 1;
        color: var(--b3-theme-on-surface);
        vertical-align: middle;
        background-color: var(--b3-theme-surface);
    }
</style>
