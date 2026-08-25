<script lang="ts">
    import { DestroyManager } from "../../sy-tomato-plugin/src/libs/destroyer";
    import { onDestroy, onMount, tick } from "svelte";
    import { BaseTomatoPlugin } from "../../sy-tomato-plugin/src/libs/BaseTomatoPlugin";
    import { STORAGE_Prog_SETTINGS } from "../../sy-tomato-plugin/src/constants";
    // 番茄工具箱设置页同款卡片体系（conf-group/section-title/kbd 键帽），根节点挂
    // .tomato-settings-dialog 类启用；样式按该类作用域限定，不会泄漏（2026-08-24 对齐改造）
    import "../../sy-tomato-plugin/src/IndexConf.css";
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
        finishPieceCreateAt,
    } from "../../sy-tomato-plugin/src/libs/stores";
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
    import HotkeyCap from "../../sy-tomato-plugin/src/HotkeyCap.svelte";
    import TomatoVIP from "../../sy-tomato-plugin/src/TomatoVIP.svelte";
    import ActivationCard from "../../sy-tomato-plugin/src/ActivationCard.svelte";
    import DevDeactivate from "../../sy-tomato-plugin/src/DevDeactivate.svelte";
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
    let searchKey = $state("");
    let codeValid = $state(false);
    let codeNotValid = $derived(!codeValid);
    const SearchKeyItemKey =
        "progressive_settings_SearchKeyItemKey_RfrUm9VLS4GehTzg5ygRrNT";

    onDestroy(destroy);

    onMount(async () => {
        window.tomato_zZmqus5PtYRi.save = save;
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

    async function save() {
        dm.destroyBy();
        await plugin.saveData(STORAGE_Prog_SETTINGS, plugin.settingCfg);
        window.location.reload();
    }
</script>

<div class="container tomato-settings-dialog" bind:this={settingsDiv}>
    <!-- 激活/购买共享卡（阶段 0+1）：verify 收进组件，结果经 bind:codeValid 回传父 -->
    <ActivationCard
        product="progressive"
        bind:codeValid
        showBuy={true}
        onActivated={() => plugin.saveData(STORAGE_Prog_SETTINGS, plugin.settingCfg)}
    ></ActivationCard>
    <!-- 开发者（isMe）专属取消激活入口：已激活后激活卡整卡隐藏，此处是唯一退出通道，
         普通用户不可见（2026-08-24 B 方案） -->
    {#if codeValid}
        <div class="settingBox dev-row">
            <DevDeactivate />
        </div>
    {/if}

    <!-- search：placeholder 化（对齐番茄），输入框宽度由 IndexConf.css 拉满自适应 -->
    <div class="settingBox search-bar" data-search>
        <input
            class="b3-text-field"
            bind:this={searchInput}
            bind:value={searchKey}
            placeholder={tomatoI18n.search搜索配置}
            oninput={() => {
                localStorage.setItem(SearchKeyItemKey, searchKey);
                searchSettings(settingsDiv, searchKey);
            }}
        />
    </div>

    <!-- 快捷键 -->
    <section class="conf-group">
        <div class="settingBox">
            <div class="section-title">{tomatoI18n.快捷键如有冲突请调整}</div>
            <div>
                {progSettingsOpenHK.icon}
                {progSettingsOpenHK.langText()}<HotkeyCap hk={progSettingsOpenHK} pluginName="sy-progressive-plugin"></HotkeyCap>
            </div>
            <div>
                {Progressive开始随机学习.icon}
                {Progressive开始随机学习.langText()}<HotkeyCap hk={Progressive开始随机学习} pluginName="sy-progressive-plugin"></HotkeyCap>
            </div>
            <div>
                {digest执行摘抄.icon}
                {digest执行摘抄.langText()}<HotkeyCap hk={digest执行摘抄} pluginName="sy-progressive-plugin"></HotkeyCap>
            </div>
            <div>
                {digest执行摘抄并断句.icon}
                {digest执行摘抄并断句.langText()}<HotkeyCap hk={digest执行摘抄并断句} pluginName="sy-progressive-plugin"></HotkeyCap>
            </div>
        </div>
    </section>

    <!-- 右键菜单 -->
    <section class="conf-group">
        <div class="settingBox">
            <div class="section-title">{tomatoI18n.右键菜单}</div>
            <div>{tomatoI18n.menu不显示菜单不影响快捷键的使用}</div>
            <div>
                <input
                    type="checkbox"
                    class="b3-switch"
                    bind:checked={$piecesmenu}
                />
                {tomatoI18n.menu添加右键菜单}:
                {Progressive添加当前文档到渐进阅读分片模式.langText()}<HotkeyCap hk={Progressive添加当前文档到渐进阅读分片模式} pluginName="sy-progressive-plugin"></HotkeyCap>
            </div>
            <div>
                <input
                    type="checkbox"
                    class="b3-switch"
                    bind:checked={$digestmenu}
                />
                {tomatoI18n.menu添加右键菜单}:
                {digest渐进阅读摘抄模式.langText()}<HotkeyCap hk={digest渐进阅读摘抄模式} pluginName="sy-progressive-plugin"></HotkeyCap>
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
                <TomatoVIP {codeValid}></TomatoVIP><HotkeyCap hk={PieceSummaryBox收集内容到文件} pluginName="sy-progressive-plugin"></HotkeyCap>
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
                <HotkeyCap hk={Progressive查看所有渐进学习文档} pluginName="sy-progressive-plugin"></HotkeyCap>
            </div>

            <div>
                <input
                    type="checkbox"
                    class="b3-switch"
                    bind:checked={$ProgressiveStart2learn}
                />
                {tomatoI18n.menu添加右键菜单}:{Progressive开始学习.icon}
                {Progressive开始学习.langText()}
                <HotkeyCap hk={Progressive开始学习} pluginName="sy-progressive-plugin"></HotkeyCap>
            </div>

            <div>
                <input
                    type="checkbox"
                    class="b3-switch"
                    bind:checked={$ProgressiveJumpMenu}
                />
                {tomatoI18n.menu添加右键菜单}:{Progressive跳到分片或回到原文.icon}
                {Progressive跳到分片或回到原文.langText()}
                <HotkeyCap hk={Progressive跳到分片或回到原文} pluginName="sy-progressive-plugin"></HotkeyCap>
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
                <TomatoVIP {codeValid}></TomatoVIP><HotkeyCap hk={PieceMovingBox移动到上一分片内} pluginName="sy-progressive-plugin"></HotkeyCap>
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
                <TomatoVIP {codeValid}></TomatoVIP><HotkeyCap hk={PieceMovingBox移动到下一分片内} pluginName="sy-progressive-plugin"></HotkeyCap>
            </div>

            <div>
                <input
                    type="checkbox"
                    class="b3-switch"
                    bind:checked={$makeCardEnable}
                />
                {tomatoI18n.menu添加右键菜单}:{flashBox制卡.icon}
                {flashBox制卡.langText()}<HotkeyCap hk={flashBox制卡} pluginName="sy-progressive-plugin"></HotkeyCap>
            </div>
            <div>
                <input
                    type="checkbox"
                    class="b3-switch"
                    bind:checked={$makeCardHereEnable}
                />
                {tomatoI18n.menu添加右键菜单}:{flashBox原地制卡.icon}
                {flashBox原地制卡.langText()}<HotkeyCap hk={flashBox原地制卡} pluginName="sy-progressive-plugin"></HotkeyCap>
            </div>
            <div>
                <input
                    type="checkbox"
                    class="b3-switch"
                    bind:checked={$send2dailyCardEnable}
                />
                {tomatoI18n.menu添加右键菜单}:{flashBox制卡并发到dailycard.icon}
                {flashBox制卡并发到dailycard.langText() + SPACE}<HotkeyCap hk={flashBox制卡并发到dailycard} pluginName="sy-progressive-plugin"></HotkeyCap>
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
                ></TomatoVIP><HotkeyCap hk={flashBox制卡并发到dailycard无引用} pluginName="sy-progressive-plugin"></HotkeyCap>
            </div>
            <div>
                <input
                    type="checkbox"
                    class="b3-switch"
                    bind:checked={$multilineMarkEnable}
                />
                {tomatoI18n.menu添加右键菜单}:{flashBox多行标记.icon}
                {flashBox多行标记.langText()}<HotkeyCap hk={flashBox多行标记} pluginName="sy-progressive-plugin"></HotkeyCap>（{tomatoI18n.二次使用为取消效果}）
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
                ></TomatoVIP><HotkeyCap hk={WC提取所有分片的笔记} pluginName="sy-progressive-plugin"></HotkeyCap>
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
                ></TomatoVIP><HotkeyCap hk={WC提取笔记到底部} pluginName="sy-progressive-plugin"></HotkeyCap>
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
                <HotkeyCap hk={WC去除笔记颜色} pluginName="sy-progressive-plugin"></HotkeyCap>
                {WC恢复笔记颜色.langText()}
                <TomatoVIP {codeValid}></TomatoVIP>
                <HotkeyCap hk={WC恢复笔记颜色} pluginName="sy-progressive-plugin"></HotkeyCap>
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
                ></TomatoVIP><HotkeyCap hk={WC合并所有分片到新文件} pluginName="sy-progressive-plugin"></HotkeyCap>
            </div>
            <div>
                <input
                    type="checkbox"
                    class="b3-switch"
                    bind:checked={$send2exctractNoteEnable}
                />
                {tomatoI18n.menu添加右键菜单}:
                {WC提取笔记.langText()}<HotkeyCap hk={WC提取笔记} pluginName="sy-progressive-plugin"></HotkeyCap>
            </div>
            <div>
                <input
                    type="checkbox"
                    class="b3-switch"
                    bind:checked={$send2compareNoteEnable}
                />
                {tomatoI18n.menu添加右键菜单}:
                {WC对比原文.langText()}<HotkeyCap hk={WC对比原文} pluginName="sy-progressive-plugin"></HotkeyCap>
            </div>
        </div>
    </section>

    <!-- 基础设置 -->
    <section class="conf-group">
        <div class="settingBox">
            <div class="section-title">{tomatoI18n.基础设置}</div>
            <div>
                <input
                    spellcheck="false"
                    class="b3-text-field"
                    bind:value={$windowOpenStyle}
                />
                {tomatoI18n.新开窗口如何打开}
            </div>

            <div>
                <input
                    spellcheck="false"
                    class="b3-text-field"
                    bind:value={$flashcardNotebook}
                />
                {tomatoI18n.新闪卡存入的笔记本ID}
            </div>

            <div>
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

            <div>
                <input
                    type="checkbox"
                    class="b3-switch"
                    bind:checked={$initProgFloatBtnsDisable}
                />
                {tomatoI18n.禁用初始化渐进学习浮动按钮}
            </div>

            <div>
                <input
                    type="checkbox"
                    class="b3-switch"
                    bind:checked={$doubleClick2DigestMobile}
                />
                {tomatoI18n.移动端编辑器右上角添加多行选择菜单}
            </div>

            <div>
                <input
                    type="checkbox"
                    class="b3-switch"
                    bind:checked={$doubleClick2DigestDesktop}
                />
                {tomatoI18n.桌面端编辑器右上角添加多行选择菜单}
            </div>

            <div>
                <input
                    type="checkbox"
                    class="b3-switch"
                    bind:checked={$add2piecesBtn2lockIcon}
                />
                {tomatoI18n.在编辑器右上角添加加入渐进阅读分片模式按钮}
            </div>

            <div>
                <input
                    type="checkbox"
                    class="b3-switch"
                    bind:checked={$add2digBtn2lockIcon}
                />
                {tomatoI18n.在编辑器右上角添加摘抄按钮}
            </div>
        </div>
    </section>

    <!-- 摘抄与制卡 -->
    <section class="conf-group">
        <div class="settingBox">
            <div class="section-title">{tomatoI18n.摘抄与制卡}</div>
            <div class:codeNotValid>
                <input
                    disabled={codeNotValid}
                    class:codeNotValid
                    type="checkbox"
                    class="b3-switch"
                    bind:checked={$flashcardAddRefs}
                />
                {tomatoI18n.卡片最上面添加相关概念}<TomatoVIP {codeValid}></TomatoVIP>
            </div>

            <div>
                <input
                    type="checkbox"
                    class="b3-switch"
                    bind:checked={$flashcardUseLink}
                />
                {tomatoI18n.闪卡的回溯使用链接}
            </div>

            <div>
                <input
                    type="checkbox"
                    class="b3-switch"
                    bind:checked={$pieceNoBacktraceLink}
                />
                {tomatoI18n.分片不加入回溯链接}
            </div>

            <div>
                <input
                    type="checkbox"
                    class="b3-switch"
                    bind:checked={$digestNoBacktraceLink}
                />
                {tomatoI18n.摘抄不加入回溯链接}
            </div>

            <div class:codeNotValid>
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

            <div class:codeNotValid>
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

            <div class:codeNotValid>
                <input
                    disabled={codeNotValid}
                    class:codeNotValid
                    type="checkbox"
                    class="b3-switch"
                    bind:checked={$digest2Trace}
                />
                {tomatoI18n.摘抄时生成摘抄轨迹}<TomatoVIP {codeValid}></TomatoVIP>
            </div>

            <div>
                <input
                    type="checkbox"
                    class="b3-switch"
                    bind:checked={$markOriginText}
                />
                {tomatoI18n.制卡摘抄在原文处做标记}
            </div>

            <div>
                <input
                    type="checkbox"
                    class="b3-switch"
                    bind:checked={$markOriginTextBG}
                />
                {tomatoI18n.制卡摘抄改变原文背景}
            </div>

            <div>
                <input
                    type="checkbox"
                    class="b3-switch"
                    bind:checked={$digestAddReadingpoint}
                />
                {tomatoI18n.摘抄后加入阅读点}
            </div>

            <div>
                <input
                    type="checkbox"
                    class="b3-switch"
                    bind:checked={$cardAppendTime}
                />
                {tomatoI18n.制卡后追加时间与标题路径}
            </div>

            <div>
                <input
                    type="checkbox"
                    class="b3-switch"
                    bind:checked={$flashcardMultipleLnks}
                />
                {tomatoI18n.对分片制卡额外链接到分片}
            </div>

            <div>
                <input
                    type="checkbox"
                    class="b3-switch"
                    bind:checked={$openCardsOnOpenPiece}
                />
                {tomatoI18n.打开分片的同时打开cards文档}
            </div>

            <div>
                <input
                    type="checkbox"
                    class="b3-switch"
                    bind:checked={$cardUnderPiece}
                />
                {tomatoI18n.分片内制卡放于分片的子文档内}
            </div>

            <div>
                <input
                    type="checkbox"
                    class="b3-switch"
                    bind:checked={$hideBtnsInFlashCard}
                />
                {tomatoI18n.复习闪卡时隐藏分片按钮组}
            </div>
        </div>
    </section>

    <!-- 分片按钮组 -->
    <section class="conf-group">
        <div class="settingBox">
            <div class="section-title">{tomatoI18n.分片按钮组}</div>
            <div>
                <input
                    type="checkbox"
                    class="b3-switch"
                    bind:checked={$btnViewContents}
                />
                {tomatoI18n.打开目录}📜
            </div>

            <div>
                <input type="checkbox" class="b3-switch" bind:checked={$btnPrevious} />
                {tomatoI18n.上一个分片}⬅
            </div>

            <div>
                <input type="checkbox" class="b3-switch" bind:checked={$btnNext} />
                {tomatoI18n.下一个分片}➡
            </div>

            <div>
                <input
                    type="checkbox"
                    class="b3-switch"
                    bind:checked={$btnCleanOriginText}
                />
                {tomatoI18n.删除原文}🧹
            </div>

            <div>
                <input
                    type="checkbox"
                    class="b3-switch"
                    bind:checked={$btnFullfilContent}
                />
                {tomatoI18n.重新插入分片内容}⬇
            </div>

            <div>
                <input type="checkbox" class="b3-switch" bind:checked={$btnStop} />
                {tomatoI18n.关闭分片}🕺
            </div>

            <div>
                <input type="checkbox" class="b3-switch" bind:checked={$btnNextBook} />
                {tomatoI18n.换一本书看}📚📖
            </div>

            <div>
                <input
                    type="checkbox"
                    class="b3-switch"
                    bind:checked={$btnOpenFlashcardTab}
                />
                {tomatoI18n.打开本书的闪卡}⚡
            </div>

            <div>
                <input
                    type="checkbox"
                    class="b3-switch"
                    bind:checked={$btnDeleteBack}
                />
                {tomatoI18n.删除分片看上一个分片}⬅🗑
            </div>

            <div>
                <input
                    type="checkbox"
                    class="b3-switch"
                    bind:checked={$btnDeleteNext}
                />
                {tomatoI18n.删除分片看下一个分片}🗑➡
            </div>

            <div>
                <input type="checkbox" class="b3-switch" bind:checked={$btnSaveCard} />
                {tomatoI18n.将文档加入闪卡}＋🗃
            </div>

            <div>
                <input type="checkbox" class="b3-switch" bind:checked={$btnDelCard} />
                {tomatoI18n.删除文档闪卡}－🗃
            </div>

            <div>
                <input
                    type="checkbox"
                    class="b3-switch"
                    bind:checked={$btnDeleteExit}
                />
                {tomatoI18n.删除分片并退出}🗑🕺
            </div>

            <div>
                <input
                    type="checkbox"
                    class="b3-switch"
                    bind:checked={$btnIgnoreBook}
                />
                {tomatoI18n.不再推送本书}🚫
            </div>

            <div>
                <input
                    type="checkbox"
                    class="b3-switch"
                    bind:checked={$btnSplitByPunctuations}
                />
                {tomatoI18n.按标点断句}✂📜<TomatoVIP {codeValid}></TomatoVIP>
            </div>

            <div>
                <input
                    type="checkbox"
                    class="b3-switch"
                    bind:checked={$btnSplitByPunctuationsListCheck}
                />
                {tomatoI18n.按标点断句Checkbox}✂✅<TomatoVIP {codeValid}></TomatoVIP>
            </div>

            <div>
                <input
                    type="checkbox"
                    class="b3-switch"
                    bind:checked={$btnSplitByPunctuationsList}
                />
                {tomatoI18n.按标点断句列表}✂📌<TomatoVIP {codeValid}></TomatoVIP>
            </div>
        </div>
    </section>

    <!-- save -->
    <div class="settingBox save-row">
        <button
            class="b3-button b3-button--outline tomato-button"
            onclick={save}>{tomatoI18n.保存}</button
        >
    </div>
</div>

<style>
    /* 仅保留渐进特有壳样式；search-bar/settingBox/kbd/conf-group/codeNotValid 等
       通用样式全部来自 IndexConf.css（.tomato-settings-dialog 作用域），勿在此重复 */
    .container {
        margin: 2px;
        flex: auto;
        display: flex;
        flex-direction: column;
    }
</style>
