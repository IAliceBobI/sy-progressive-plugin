<script lang="ts">
    import { DestroyManager } from "../../sy-tomato-plugin/src/libs/destroyer";
    import { onDestroy, onMount, tick } from "svelte";
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
        digest2dailycard,
        digest2Trace,
        digestNoBacktraceLink,
        doubleClick2DigestDesktop,
        doubleClick2DigestMobile,
        flashcardAddRefs,
        flashcardMultipleLnks,
        flashcardNotebook,
        flashcardUseLink,
        getAllPieceNotesEnable,
        hideBtnsInFlashCard,
        initProgFloatBtnsDisable,
        makeCardEnable,
        makeCardHereEnable,
        digestmenu,
        PieceSummaryBoxmenu,
        markOriginText,
        markOriginTextBG,
        merg2newBookEnable,
        multilineMarkEnable,
        openCardsOnOpenPiece,
        pieceNoBacktraceLink,
        send2dailyCardEnable,
        send2dailyCardNoRefEnable,
        summary2dailynote,
        userToken,
        windowOpenStyle,
        words2dailycard,
        PieceMovingDown,
        PieceMovingUp,
        send2exctract2bottomEnable,
        send2exctractNoteEnable,
        send2removeNoteColor,
        send2compareNoteEnable,
        ProgressiveStart2learn,
        piecesmenu,
        ProgressiveJumpMenu,
        ProgressiveViewAllMenu,
        digestAddReadingpoint,
        add2piecesBtn2lockIcon,
        add2digBtn2lockIcon,
        hideVIP,
        finishPieceCreateAt,
    } from "../../sy-tomato-plugin/src/libs/stores";
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
    import TomatoVIP from "../../sy-tomato-plugin/src/TomatoVIP.svelte";
    import BuyTomato from "../../sy-tomato-plugin/src/BuyTomato.svelte";
    import {
        expStore,
        resetKey,
        verifyKeyProgressive,
    } from "../../sy-tomato-plugin/src/libs/user";
    import { saveRestorePagePosition } from "../../sy-tomato-plugin/src/libs/utils";
    import {
        digest渐进阅读摘抄模式,
        digest执行摘抄,
        digest执行摘抄并断句,
    } from "./DigestProgressiveBox";
    import { PieceSummaryBox收集内容到文件 } from "./PieceSummaryBox";
    import {
        flashBox制卡,
        flashBox制卡并发到dailycard,
        flashBox制卡并发到dailycard无引用,
        flashBox原地制卡,
        flashBox多行标记,
    } from "./FlashBox";
    import {
        WC对比原文,
        WC提取所有分片的笔记,
        WC提取笔记到底部,
        WC提取笔记,
        WC去除笔记颜色,
        WC合并所有分片到新文件,
        WC恢复笔记颜色,
    } from "./WritingCompareBox";
    import {
        PieceMovingBox移动到上一分片内,
        PieceMovingBox移动到下一分片内,
    } from "./PieceMovingBox";
    import { FrontEnds, SPACE } from "../../sy-tomato-plugin/src/libs/gconst";
    import {
        Progressive开始学习,
        Progressive开始随机学习,
        Progressive查看所有渐进学习文档,
        Progressive添加当前文档到渐进阅读分片模式,
        Progressive跳到分片或回到原文,
        progSettingsOpenHK,
    } from "./Progressive";
    import { searchSettings } from "../../sy-tomato-plugin/src/libs/ui";

    export function destroy() {
        dm.destroyBy("2");
        localStorage.setItem(SearchKeyItemKey, searchKey);
    }
    interface Props {
        dm: DestroyManager;
        plugin: BaseTomatoPlugin;
    }

    let { dm, plugin = $bindable() }: Props = $props();
    let settingsDiv: HTMLElement = $state();
    let searchInput: HTMLElement = $state();
    let buyDIV: HTMLElement = $state();
    let searchKey = $state("");
    let codeValid = $state(false);
    let codeNotValid = $derived(!codeValid);
    const SearchKeyItemKey =
        "progressive_settings_SearchKeyItemKey_RfrUm9VLS4GehTzg5ygRrNT";

    onDestroy(destroy);

    onMount(async () => {
        window.tomato_zZmqus5PtYRi.save = save;
        codeValid = await verifyKeyProgressive();

        saveRestorePagePosition(
            "progressive_settings_scrollPosition_YELnPikKNirXyQqzIHNB",
            dm,
            settingsDiv?.parentElement?.parentElement,
            true,
        );

        const savedSearchKey = localStorage.getItem(SearchKeyItemKey);
        if (savedSearchKey) {
            searchKey = savedSearchKey;
            await tick();
            if (settingsDiv) {
                searchSettings(settingsDiv, searchKey);
            }
        }
        searchInput.focus();
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

<div class="container" bind:this={settingsDiv}>
    {#if codeNotValid || !$hideVIP}
        <div class="alert contentCenter" data-hide>
            <span>
                {tomatoI18n.大部分功能不需要激活}
            </span>
        </div>

        <div class="settingBox" data-hide>
            <label>
                {tomatoI18n.激活码}
                <textarea
                    class="b3-text-field activeCode"
                    bind:value={$userToken}
                    placeholder="1656000000123_22000101_ldID_siyuanTomatoCode_3044022018c8d8bca......"
                    spellcheck="false"
                ></textarea>
            </label>
            <button
                class="b3-button b3-button--outline tomato-button"
                onclick={active}
            >
                {tomatoI18n.激活}
            </button>
            <button
                class="b3-button b3-button--outline tomato-button"
                onclick={() => {
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
    {/if}

    <!-- search -->
    <div class="settingBox search-bar" data-search>
        <input
            class="b3-text-field"
            bind:this={searchInput}
            bind:value={searchKey}
            oninput={() => {
                localStorage.setItem(SearchKeyItemKey, searchKey);
                searchSettings(settingsDiv, searchKey);
            }}
        />
        {tomatoI18n.search搜索配置}
    </div>

    <div class="settingBox">
        <div>{tomatoI18n.快捷键如有冲突请调整}</div>
        <div>
            {progSettingsOpenHK.icon}
            {progSettingsOpenHK.langText()}<strong
                >{progSettingsOpenHK.w()}</strong
            >
        </div>
        <div>
            {Progressive开始随机学习.icon}
            {Progressive开始随机学习.langText()}<strong
                >{Progressive开始随机学习.w()}</strong
            >
        </div>
        <div>
            {digest执行摘抄.icon}
            {digest执行摘抄.langText()}<strong>{digest执行摘抄.w()}</strong>
        </div>
        <div>
            {digest执行摘抄并断句.icon}
            {digest执行摘抄并断句.langText()}<strong
                >{digest执行摘抄并断句.w()}</strong
            >
        </div>
        <div class:codeNotValid>
            <input
                type="checkbox"
                disabled={codeNotValid}
                class:codeNotValid
                class="b3-switch"
                bind:checked={$hideVIP}
            />
            {tomatoI18n.隐藏vip图标}<TomatoVIP {codeValid}></TomatoVIP>
        </div>
    </div>
    <div class="settingBox">
        <div>{tomatoI18n.menu不显示菜单不影响快捷键的使用}</div>
        <div>
            <input
                type="checkbox"
                class="b3-switch"
                bind:checked={$piecesmenu}
            />
            {tomatoI18n.menu添加右键菜单}:
            {Progressive添加当前文档到渐进阅读分片模式.langText()}<strong
                >{Progressive添加当前文档到渐进阅读分片模式.w()}</strong
            >
        </div>
        <div>
            <input
                type="checkbox"
                class="b3-switch"
                bind:checked={$digestmenu}
            />
            {tomatoI18n.menu添加右键菜单}:
            {digest渐进阅读摘抄模式.langText()}<strong
                >{digest渐进阅读摘抄模式.w()}</strong
            >
        </div>

        <div class:codeNotValid>
            <input
                disabled={codeNotValid}
                class:codeNotValid
                type="checkbox"
                class="b3-switch"
                bind:checked={$PieceSummaryBoxmenu}
            />
            {tomatoI18n.menu添加右键菜单}:
            {PieceSummaryBox收集内容到文件.langText()}
            <TomatoVIP {codeValid}></TomatoVIP><strong
                >{PieceSummaryBox收集内容到文件.w()}</strong
            >
        </div>
        <div class:codeNotValid>
            <input
                disabled={codeNotValid}
                class:codeNotValid
                type="checkbox"
                class="b3-switch"
                bind:checked={$summary2dailynote}
            />
            {tomatoI18n.收集内容到文件功能总是收集到dailynote}<TomatoVIP
                {codeValid}
            ></TomatoVIP>
        </div>

        <div>
            <input
                type="checkbox"
                class="b3-switch"
                bind:checked={$ProgressiveViewAllMenu}
            />
            {tomatoI18n.menu添加右键菜单}:{Progressive查看所有渐进学习文档.icon}
            {Progressive查看所有渐进学习文档.langText()}
            <strong>{Progressive查看所有渐进学习文档.w()}</strong>
        </div>

        <div>
            <input
                type="checkbox"
                class="b3-switch"
                bind:checked={$ProgressiveStart2learn}
            />
            {tomatoI18n.menu添加右键菜单}:{Progressive开始学习.icon}
            {Progressive开始学习.langText()}
            <strong>{Progressive开始学习.w()}</strong>
        </div>

        <div>
            <input
                type="checkbox"
                class="b3-switch"
                bind:checked={$ProgressiveJumpMenu}
            />
            {tomatoI18n.menu添加右键菜单}:{Progressive跳到分片或回到原文.icon}
            {Progressive跳到分片或回到原文.langText()}
            <strong>{Progressive跳到分片或回到原文.w()}</strong>
        </div>

        <div class:codeNotValid>
            <input
                disabled={codeNotValid}
                class:codeNotValid
                type="checkbox"
                class="b3-switch"
                bind:checked={$PieceMovingUp}
            />
            {tomatoI18n.menu添加右键菜单}:{PieceMovingBox移动到上一分片内.icon}
            {PieceMovingBox移动到上一分片内.langText()}
            <TomatoVIP {codeValid}></TomatoVIP><strong
                >{PieceMovingBox移动到上一分片内.w()}</strong
            >
        </div>
        <div class:codeNotValid>
            <input
                disabled={codeNotValid}
                class:codeNotValid
                type="checkbox"
                class="b3-switch"
                bind:checked={$PieceMovingDown}
            />
            {tomatoI18n.menu添加右键菜单}:{PieceMovingBox移动到下一分片内.icon}
            {PieceMovingBox移动到下一分片内.langText()}
            <TomatoVIP {codeValid}></TomatoVIP><strong
                >{PieceMovingBox移动到下一分片内.w()}</strong
            >
        </div>

        <div>
            <input
                type="checkbox"
                class="b3-switch"
                bind:checked={$makeCardEnable}
            />
            {tomatoI18n.menu添加右键菜单}:{flashBox制卡.icon}
            {flashBox制卡.langText()}<strong>{flashBox制卡.w()}</strong>
        </div>
        <div>
            <input
                type="checkbox"
                class="b3-switch"
                bind:checked={$makeCardHereEnable}
            />
            {tomatoI18n.menu添加右键菜单}:{flashBox原地制卡.icon}
            {flashBox原地制卡.langText()}<strong>{flashBox原地制卡.w()}</strong>
        </div>
        <div>
            <input
                type="checkbox"
                class="b3-switch"
                bind:checked={$send2dailyCardEnable}
            />
            {tomatoI18n.menu添加右键菜单}:{flashBox制卡并发到dailycard.icon}
            {flashBox制卡并发到dailycard.langText() + SPACE}<strong
                >{flashBox制卡并发到dailycard.w()}</strong
            >
        </div>
        <div class:codeNotValid>
            <input
                disabled={codeNotValid}
                class:codeNotValid
                type="checkbox"
                class="b3-switch"
                bind:checked={$send2dailyCardNoRefEnable}
            />
            {tomatoI18n.menu添加右键菜单}:{flashBox制卡并发到dailycard无引用.icon}
            {flashBox制卡并发到dailycard无引用.langText()}<TomatoVIP {codeValid}
            ></TomatoVIP><strong>{flashBox制卡并发到dailycard无引用.w()}</strong
            >
        </div>
        <div>
            <input
                type="checkbox"
                class="b3-switch"
                bind:checked={$multilineMarkEnable}
            />
            {tomatoI18n.menu添加右键菜单}:{flashBox多行标记.icon}
            {flashBox多行标记.langText()}<strong>{flashBox多行标记.w()}</strong
            >（{tomatoI18n.二次使用为取消效果}）
        </div>
        <div class:codeNotValid>
            <input
                type="checkbox"
                class="b3-switch"
                disabled={codeNotValid}
                class:codeNotValid
                bind:checked={$getAllPieceNotesEnable}
            />
            {tomatoI18n.menu添加右键菜单}:
            {WC提取所有分片的笔记.langText()}<TomatoVIP {codeValid}
            ></TomatoVIP><strong>{WC提取所有分片的笔记.w()}</strong>
        </div>
        <div class:codeNotValid>
            <input
                disabled={codeNotValid}
                class:codeNotValid
                type="checkbox"
                class="b3-switch"
                bind:checked={$send2exctract2bottomEnable}
            />
            {tomatoI18n.menu添加右键菜单}:
            {WC提取笔记到底部.langText()}<TomatoVIP {codeValid}
            ></TomatoVIP><strong>{WC提取笔记到底部.w()}</strong>
        </div>
        <div class:codeNotValid>
            <input
                disabled={codeNotValid}
                class:codeNotValid
                type="checkbox"
                class="b3-switch"
                bind:checked={$send2removeNoteColor}
            />
            {tomatoI18n.menu添加右键菜单}:
            {WC去除笔记颜色.langText()}
            <TomatoVIP {codeValid}></TomatoVIP>
            <strong>{WC去除笔记颜色.w()}</strong>
            {WC恢复笔记颜色.langText()}
            <TomatoVIP {codeValid}></TomatoVIP>
            <strong>{WC恢复笔记颜色.w()}</strong>
        </div>
        <div class:codeNotValid>
            <input
                disabled={codeNotValid}
                class:codeNotValid
                type="checkbox"
                class="b3-switch"
                bind:checked={$merg2newBookEnable}
            />
            {tomatoI18n.menu添加右键菜单}:
            {WC合并所有分片到新文件.langText()}<TomatoVIP {codeValid}
            ></TomatoVIP><strong>{WC合并所有分片到新文件.w()}</strong>
        </div>
        <div>
            <input
                type="checkbox"
                class="b3-switch"
                bind:checked={$send2exctractNoteEnable}
            />
            {tomatoI18n.menu添加右键菜单}:
            {WC提取笔记.langText()}<strong>{WC提取笔记.w()}</strong>
        </div>
        <div>
            <input
                type="checkbox"
                class="b3-switch"
                bind:checked={$send2compareNoteEnable}
            />
            {tomatoI18n.menu添加右键菜单}:
            {WC对比原文.langText()}<strong>{WC对比原文.w()}</strong>
        </div>
    </div>

    <div class="settingBox">
        <input
            spellcheck="false"
            class="b3-text-field"
            bind:value={$windowOpenStyle}
        />
        {tomatoI18n.新开窗口如何打开}
    </div>

    <div class="settingBox">
        <input
            spellcheck="false"
            class="b3-text-field"
            bind:value={$flashcardNotebook}
        />
        {tomatoI18n.新闪卡存入的笔记本ID}
    </div>

    <div class="settingBox">
        <input
            spellcheck="false"
            class="b3-text-field"
            bind:value={$finishPieceCreateAt}
            onblur={() => {
                $finishPieceCreateAt = $finishPieceCreateAt.trim();
                if (!FrontEnds.includes($finishPieceCreateAt)) {
                    $finishPieceCreateAt = "desktop";
                }
            }}
        />
        <p>
            all, desktop, desktop-window, mobile, browser-desktop,
            browser-mobile
        </p>
        {tomatoI18n.计划读书的分片由哪个前端自动创建}
    </div>

    <div class="settingBox">
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$initProgFloatBtnsDisable}
        />
        {tomatoI18n.禁用初始化渐进学习浮动按钮}
    </div>

    <div class="settingBox">
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$doubleClick2DigestMobile}
        />
        {tomatoI18n.移动端编辑器右上角添加多行选择菜单}
    </div>

    <div class="settingBox">
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$doubleClick2DigestDesktop}
        />
        {tomatoI18n.桌面端编辑器右上角添加多行选择菜单}
    </div>

    <div class="settingBox">
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$add2piecesBtn2lockIcon}
        />
        {tomatoI18n.在编辑器右上角添加加入渐进阅读分片模式按钮}
    </div>

    <div class="settingBox">
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$add2digBtn2lockIcon}
        />
        {tomatoI18n.在编辑器右上角添加摘抄按钮}
    </div>

    <div class:codeNotValid class="settingBox">
        <input
            disabled={codeNotValid}
            class:codeNotValid
            type="checkbox"
            class="b3-switch"
            bind:checked={$flashcardAddRefs}
        />
        {tomatoI18n.卡片最上面添加相关概念}<TomatoVIP {codeValid}></TomatoVIP>
    </div>

    <div class="settingBox">
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$flashcardUseLink}
        />
        {tomatoI18n.闪卡的回溯使用链接}
    </div>

    <div class="settingBox">
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$pieceNoBacktraceLink}
        />
        {tomatoI18n.分片不加入回溯链接}
    </div>

    <div class="settingBox">
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$digestNoBacktraceLink}
        />
        {tomatoI18n.摘抄不加入回溯链接}
    </div>

    <div class:codeNotValid class="settingBox">
        <input
            disabled={codeNotValid}
            class:codeNotValid
            type="checkbox"
            class="b3-switch"
            bind:checked={$words2dailycard}
        />
        {tomatoI18n.摘抄的单词加入到dailycard中}<TomatoVIP {codeValid}
        ></TomatoVIP>
    </div>

    <div class:codeNotValid class="settingBox">
        <input
            disabled={codeNotValid}
            class:codeNotValid
            type="checkbox"
            class="b3-switch"
            bind:checked={$digest2dailycard}
        />
        {tomatoI18n.摘抄加入到dailycard当天目录下}<TomatoVIP {codeValid}
        ></TomatoVIP>
    </div>

    <div class:codeNotValid class="settingBox">
        <input
            disabled={codeNotValid}
            class:codeNotValid
            type="checkbox"
            class="b3-switch"
            bind:checked={$digest2Trace}
        />
        {tomatoI18n.摘抄时生成摘抄轨迹}<TomatoVIP {codeValid}></TomatoVIP>
    </div>

    <div class="settingBox">
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$markOriginText}
        />
        {tomatoI18n.制卡摘抄在原文处做标记}
    </div>

    <div class="settingBox">
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$markOriginTextBG}
        />
        {tomatoI18n.制卡摘抄改变原文背景}
    </div>

    <div class="settingBox">
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$digestAddReadingpoint}
        />
        {tomatoI18n.摘抄后加入阅读点}
    </div>

    <div class="settingBox">
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$cardAppendTime}
        />
        {tomatoI18n.制卡后追加时间与标题路径}
    </div>

    <div class="settingBox">
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$flashcardMultipleLnks}
        />
        {tomatoI18n.对分片制卡额外链接到分片}
    </div>

    <div class="settingBox">
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$openCardsOnOpenPiece}
        />
        {tomatoI18n.打开分片的同时打开cards文档}
    </div>

    <div class="settingBox">
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$cardUnderPiece}
        />
        {tomatoI18n.分片内制卡放于分片的子文档内}
    </div>

    <div class="settingBox">
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$hideBtnsInFlashCard}
        />
        {tomatoI18n.复习闪卡时隐藏分片按钮组}
    </div>

    <div class="settingBox">
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$btnViewContents}
        />
        {tomatoI18n.打开目录}📜
    </div>

    <div class="settingBox">
        <input type="checkbox" class="b3-switch" bind:checked={$btnPrevious} />
        {tomatoI18n.上一个分片}⬅
    </div>

    <div class="settingBox">
        <input type="checkbox" class="b3-switch" bind:checked={$btnNext} />
        {tomatoI18n.下一个分片}➡
    </div>

    <div class="settingBox">
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$btnCleanOriginText}
        />
        {tomatoI18n.删除原文}🧹
    </div>

    <div class="settingBox">
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$btnFullfilContent}
        />
        {tomatoI18n.重新插入分片内容}⬇
    </div>

    <div class="settingBox">
        <input type="checkbox" class="b3-switch" bind:checked={$btnStop} />
        {tomatoI18n.关闭分片}🕺
    </div>

    <div class="settingBox">
        <input type="checkbox" class="b3-switch" bind:checked={$btnNextBook} />
        {tomatoI18n.换一本书看}📚📖
    </div>

    <div class="settingBox">
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$btnOpenFlashcardTab}
        />
        {tomatoI18n.打开本书的闪卡}⚡
    </div>

    <div class="settingBox">
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$btnDeleteBack}
        />
        {tomatoI18n.删除分片看上一个分片}⬅🗑
    </div>

    <div class="settingBox">
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$btnDeleteNext}
        />
        {tomatoI18n.删除分片看下一个分片}🗑➡
    </div>

    <div class="settingBox">
        <input type="checkbox" class="b3-switch" bind:checked={$btnSaveCard} />
        {tomatoI18n.将文档加入闪卡}＋🗃
    </div>

    <div class="settingBox">
        <input type="checkbox" class="b3-switch" bind:checked={$btnDelCard} />
        {tomatoI18n.删除文档闪卡}－🗃
    </div>

    <div class="settingBox">
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$btnDeleteExit}
        />
        {tomatoI18n.删除分片并退出}🗑🕺
    </div>

    <div class="settingBox">
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$btnIgnoreBook}
        />
        {tomatoI18n.不再推送本书}🚫
    </div>

    <div class="settingBox">
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$btnSplitByPunctuations}
        />
        {tomatoI18n.按标点断句}✂📜<TomatoVIP {codeValid}></TomatoVIP>
    </div>

    <div class="settingBox">
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$btnSplitByPunctuationsListCheck}
        />
        {tomatoI18n.按标点断句Checkbox}✂✅<TomatoVIP {codeValid}></TomatoVIP>
    </div>

    <div class="settingBox">
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$btnSplitByPunctuationsList}
        />
        {tomatoI18n.按标点断句列表}✂📌<TomatoVIP {codeValid}></TomatoVIP>
    </div>

    <div class="settingBox">
        <button
            class="b3-button b3-button--outline tomato-button"
            onclick={save}>{tomatoI18n.保存}</button
        >
    </div>
</div>

<style>
    .search-bar {
        position: sticky;
        top: 0;
        background-color: var(--b3-theme-surface);
        z-index: 10;
    }
    .settingBox {
        margin: 5px;
        padding: 5px;
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
