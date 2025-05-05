<script lang="ts">
    import { DestroyManager } from "../../sy-tomato-plugin/src/libs/destroyer";
    import { onDestroy, onMount } from "svelte";
    import { BaseTomatoPlugin } from "../../sy-tomato-plugin/src/libs/BaseTomatoPlugin";
    import { STORAGE_Prog_SETTINGS } from "../../sy-tomato-plugin/src/constants";
    import {
        btnCleanOriginText,
        btnDelCard,
        btnDeleteBack,
        btnDeleteExit,
        btnDeleteNext,
        btnFullfilContent,
        btnIgnoreBook,
        btnNext,
        btnNextBook,
        btnOpenFlashcardTab,
        btnPrevious,
        btnSaveCard,
        btnSplitByPunctuations,
        btnSplitByPunctuationsList,
        btnSplitByPunctuationsListCheck,
        btnStop,
        btnViewContents,
        cardAppendTime,
        cardUnderPiece,
        digestNoBacktraceLink,
        flashcardAddRefs,
        flashcardMultipleLnks,
        flashcardNotebook,
        flashcardUseLink,
        getAllPieceNotesEnable,
        hideBtnsInFlashCard,
        makeCardEnable,
        makeCardHereEnable,
        markOriginText,
        markOriginTextBG,
        merg2newBookEnable,
        multilineMarkEnable,
        openCardsOnOpenPiece,
        pieceMoveEnable,
        pieceNoBacktraceLink,
        send2dailyCardEnable,
        send2dailyCardNoRefEnable,
        summary2dailynote,
        summaryEnable,
        userToken,
        windowOpenStyle,
    } from "../../sy-tomato-plugin/src/libs/stores";
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
    import TomatoVIP from "../../sy-tomato-plugin/src/TomatoVIP.svelte";
    import BuyTomato from "../../sy-tomato-plugin/src/BuyTomato.svelte";
    import {
        expStore,
        resetKey,
        verifyKeyProgressive,
    } from "../../sy-tomato-plugin/src/libs/user";

    export let dm: DestroyManager;
    export let plugin: BaseTomatoPlugin;
    let buyDIV: HTMLElement;
    let codeValid = false;
    $: codeNotValid = !codeValid;

    onDestroy(() => {
        dm.destroyBy("2");
    });
    onMount(async () => {
        plugin.global.tomato_zZmqus5PtYRi.save = save;
        codeValid = await verifyKeyProgressive();
    });

    async function active() {
        resetKey();
        codeValid = await verifyKeyProgressive();
        await plugin.saveData(STORAGE_Prog_SETTINGS, plugin.settingCfg);
        if (codeValid) {
            window.location.reload();
        }
    }

    async function save() {
        dm.destroyBy();
        await plugin.saveData(STORAGE_Prog_SETTINGS, plugin.settingCfg);
        window.location.reload();
    }
</script>

<div class="container">
    <div class="alert contentCenter">
        <span>
            {tomatoI18n.大部分功能不需要激活}
        </span>
    </div>
    <div>
        <label>
            {tomatoI18n.激活码}
            <textarea
                class="b3-text-field settingBox activeCode"
                bind:value={$userToken}
                placeholder="1656000000123_22000101_ldID_siyuanTomatoCode_3044022018c8d8bca......"
                spellcheck="false"
            />
        </label>
        <button class="b3-button" on:click={active}>
            {tomatoI18n.激活}
        </button>
        <button
            class="b3-button settingBox"
            on:click={() => {
                if (buyDIV.style.display) buyDIV.style.display = "";
                else buyDIV.style.display = "none";
            }}
        >
            {tomatoI18n.购买}
        </button>
        <TomatoVIP {codeValid}></TomatoVIP>
        <span title={tomatoI18n.过期时间 + ": " + $expStore}>
            {$expStore.replaceAll(" ", "")}
        </span>
        <div bind:this={buyDIV} style="display: none;">
            <BuyTomato isTomato={false}></BuyTomato>
        </div>
    </div>
    <label>
        <input
            spellcheck="false"
            class="b3-text-field settingBox"
            bind:value={$windowOpenStyle}
        />
        {tomatoI18n.新开窗口如何打开}
    </label>

    <label>
        <input
            spellcheck="false"
            class="b3-text-field settingBox"
            bind:value={$flashcardNotebook}
        />
        {tomatoI18n.新闪卡存入的笔记本ID}
    </label>

    <label class:codeNotValid>
        <input
            disabled={codeNotValid}
            class:codeNotValid
            type="checkbox"
            class="b3-switch settingBox"
            bind:checked={$pieceMoveEnable}
        />
        {tomatoI18n.右键菜单把内容移动到相邻分片中}<TomatoVIP {codeValid}
        ></TomatoVIP>
    </label>

    <label class:codeNotValid>
        <input
            disabled={codeNotValid}
            class:codeNotValid
            type="checkbox"
            class="b3-switch settingBox"
            bind:checked={$summaryEnable}
        />
        {tomatoI18n.收集内容到文件}<TomatoVIP {codeValid}></TomatoVIP>
    </label>

    <label class:codeNotValid>
        <input
            disabled={codeNotValid}
            class:codeNotValid
            type="checkbox"
            class="b3-switch settingBox"
            bind:checked={$summary2dailynote}
        />
        {tomatoI18n.收集内容到文件功能总是收集到dailynote}<TomatoVIP {codeValid}
        ></TomatoVIP>
    </label>

    <label class:codeNotValid>
        <input
            disabled={codeNotValid}
            class:codeNotValid
            type="checkbox"
            class="b3-switch settingBox"
            bind:checked={$flashcardAddRefs}
        />
        {tomatoI18n.卡片最上面添加相关概念}<TomatoVIP {codeValid}></TomatoVIP>
    </label>

    <label>
        <input
            type="checkbox"
            class="b3-switch settingBox"
            bind:checked={$flashcardUseLink}
        />
        {tomatoI18n.闪卡的回溯使用链接}
    </label>

    <label>
        <input
            type="checkbox"
            class="b3-switch settingBox"
            bind:checked={$pieceNoBacktraceLink}
        />
        {tomatoI18n.分片不加入回溯链接}
    </label>

    <label>
        <input
            type="checkbox"
            class="b3-switch settingBox"
            bind:checked={$digestNoBacktraceLink}
        />
        {tomatoI18n.摘抄不加入回溯链接}
    </label>

    <label>
        <input
            type="checkbox"
            class="b3-switch settingBox"
            bind:checked={$makeCardEnable}
        />
        {tomatoI18n.启用菜单 + "：＋🗃️" + tomatoI18n.制卡}
    </label>

    <label>
        <input
            type="checkbox"
            class="b3-switch settingBox"
            bind:checked={$makeCardHereEnable}
        />
        {tomatoI18n.启用菜单 + "：＋🗃️⬇️" + tomatoI18n.原地制卡}
    </label>

    <label>
        <input
            type="checkbox"
            class="b3-switch settingBox"
            bind:checked={$send2dailyCardEnable}
        />
        {tomatoI18n.启用菜单 + "：🗓️🗃️⭐" + tomatoI18n.制卡并发到dailycard}
    </label>

    <label>
        <input
            type="checkbox"
            class="b3-switch settingBox"
            bind:checked={$send2dailyCardNoRefEnable}
        />
        {tomatoI18n.启用菜单 + "：🗓️🗃️" + tomatoI18n.制卡并发到dailycard无引用}
    </label>

    <label>
        <input
            type="checkbox"
            class="b3-switch settingBox"
            bind:checked={$multilineMarkEnable}
        />
        {tomatoI18n.启用菜单 +
            "：" +
            tomatoI18n.多行标记 +
            "（" +
            tomatoI18n.二次使用为取消效果 +
            "）"}
    </label>

    <label class:codeNotValid>
        <input
            disabled={codeNotValid}
            class:codeNotValid
            type="checkbox"
            class="b3-switch settingBox"
            bind:checked={$getAllPieceNotesEnable}
        />
        {tomatoI18n.分片功能 + "：" + tomatoI18n.提取所有分片的笔记}<TomatoVIP
            {codeValid}
        ></TomatoVIP>
    </label>

    <label class:codeNotValid>
        <input
            disabled={codeNotValid}
            class:codeNotValid
            type="checkbox"
            class="b3-switch settingBox"
            bind:checked={$merg2newBookEnable}
        />
        {tomatoI18n.分片功能 + "：" + tomatoI18n.合并所有分片到新文件}<TomatoVIP
            {codeValid}
        ></TomatoVIP>
    </label>

    <label>
        <input
            type="checkbox"
            class="b3-switch settingBox"
            bind:checked={$markOriginText}
        />
        {tomatoI18n.制卡摘抄在原文处做标记}
    </label>

    <label>
        <input
            type="checkbox"
            class="b3-switch settingBox"
            bind:checked={$markOriginTextBG}
        />
        {tomatoI18n.制卡摘抄改变原文背景}
    </label>

    <label>
        <input
            type="checkbox"
            class="b3-switch settingBox"
            bind:checked={$cardAppendTime}
        />
        {tomatoI18n.制卡后追加时间与标题路径}
    </label>

    <label>
        <input
            type="checkbox"
            class="b3-switch settingBox"
            bind:checked={$flashcardMultipleLnks}
        />
        {tomatoI18n.对分片制卡额外链接到分片}
    </label>

    <label>
        <input
            type="checkbox"
            class="b3-switch settingBox"
            bind:checked={$openCardsOnOpenPiece}
        />
        {tomatoI18n.打开分片的同时打开cards文档}
    </label>

    <label>
        <input
            type="checkbox"
            class="b3-switch settingBox"
            bind:checked={$cardUnderPiece}
        />
        {tomatoI18n.分片内制卡放于分片的子文档内}
    </label>

    <label>
        <input
            type="checkbox"
            class="b3-switch settingBox"
            bind:checked={$hideBtnsInFlashCard}
        />
        {tomatoI18n.在闪卡内复习整个分片时隐藏分片下方按钮}
    </label>

    <label>
        <input
            type="checkbox"
            class="b3-switch settingBox"
            bind:checked={$btnViewContents}
        />
        {tomatoI18n.打开目录}📜
    </label>

    <label>
        <input
            type="checkbox"
            class="b3-switch settingBox"
            bind:checked={$btnPrevious}
        />
        {tomatoI18n.上一个分片}⬅
    </label>

    <label>
        <input
            type="checkbox"
            class="b3-switch settingBox"
            bind:checked={$btnNext}
        />
        {tomatoI18n.下一个分片}➡
    </label>

    <label>
        <input
            type="checkbox"
            class="b3-switch settingBox"
            bind:checked={$btnCleanOriginText}
        />
        {tomatoI18n.删除原文}🧹
    </label>

    <label>
        <input
            type="checkbox"
            class="b3-switch settingBox"
            bind:checked={$btnFullfilContent}
        />
        {tomatoI18n.重新插入分片内容}⬇
    </label>

    <label>
        <input
            type="checkbox"
            class="b3-switch settingBox"
            bind:checked={$btnStop}
        />
        {tomatoI18n.关闭分片}🕺
    </label>

    <label>
        <input
            type="checkbox"
            class="b3-switch settingBox"
            bind:checked={$btnNextBook}
        />
        {tomatoI18n.换一本书看}📚📖
    </label>

    <label>
        <input
            type="checkbox"
            class="b3-switch settingBox"
            bind:checked={$btnOpenFlashcardTab}
        />
        {tomatoI18n.打开本书的闪卡}⚡
    </label>

    <label>
        <input
            type="checkbox"
            class="b3-switch settingBox"
            bind:checked={$btnDeleteBack}
        />
        {tomatoI18n.删除分片看上一个分片}⬅🗑
    </label>

    <label>
        <input
            type="checkbox"
            class="b3-switch settingBox"
            bind:checked={$btnDeleteNext}
        />
        {tomatoI18n.删除分片看下一个分片}🗑➡
    </label>

    <label>
        <input
            type="checkbox"
            class="b3-switch settingBox"
            bind:checked={$btnSaveCard}
        />
        {tomatoI18n.将文档加入闪卡}＋🗃
    </label>

    <label>
        <input
            type="checkbox"
            class="b3-switch settingBox"
            bind:checked={$btnDelCard}
        />
        {tomatoI18n.删除文档闪卡}－🗃
    </label>

    <label>
        <input
            type="checkbox"
            class="b3-switch settingBox"
            bind:checked={$btnDeleteExit}
        />
        {tomatoI18n.删除分片并退出}🗑🕺
    </label>

    <label>
        <input
            type="checkbox"
            class="b3-switch settingBox"
            bind:checked={$btnIgnoreBook}
        />
        {tomatoI18n.不再推送本书}🚫
    </label>

    <label>
        <input
            type="checkbox"
            class="b3-switch settingBox"
            bind:checked={$btnSplitByPunctuations}
        />
        {tomatoI18n.按标点断句}✂📜
    </label>

    <label>
        <input
            type="checkbox"
            class="b3-switch settingBox"
            bind:checked={$btnSplitByPunctuationsListCheck}
        />
        {tomatoI18n.按标点断句Checkbox}✂✅
    </label>

    <label>
        <input
            type="checkbox"
            class="b3-switch settingBox"
            bind:checked={$btnSplitByPunctuationsList}
        />
        {tomatoI18n.按标点断句列表}✂📌
    </label>

    <button class="b3-button" on:click={save}>{tomatoI18n.保存}</button>
</div>

<style>
    label {
        margin: 10px;
    }
    .container {
        margin: 2px;
        flex: auto;
        display: flex;
        flex-direction: column;
    }
    .activeCode {
        width: 50%;
        line-height: 2;
    }
    .codeNotValid {
        pointer-events: none;
        opacity: 30%;
    }
    .contentCenter {
        display: flex;
        justify-content: center;
        align-items: center;
    }
    .alert {
        padding: 2px 4px;
        font:
            /* 75% Consolas, */ "Liberation Mono", Menlo, Courier,
            monospace, var(--b3-font-family);
        line-height: 1;
        color: var(--b3-theme-on-surface);
        vertical-align: middle;
        background-color: var(--b3-theme-surface);
        border: solid 1px var(--b3-theme-surface-lighter);
        border-radius: var(--b3-border-radius);
        box-shadow: inset 0 -1px 0 var(--b3-theme-surface-lighter);
    }
</style>
