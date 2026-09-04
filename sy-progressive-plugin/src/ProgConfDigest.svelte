<script lang="ts">
    // 渐进设置页域组件（2026-09-03 双栏改造）：自 Settings.svelte 整块搬运，卡片内部一行不动；
    // 本组件=「摘抄与制卡」域的卡片（导航首域：渐进的本体功能）
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
    import {
        cardAppendTime,
        card2dailycard,
        cardUnderPiece,
        digestLanding,
        digestNoBacktraceLink,
        flashcardAddRefs,
        flashcardMultipleLnks,
        flashcardUseLink,
        hideBtnsInFlashCard,
        markOriginTextBG,
        openCardsOnOpenPiece,
        pieceNoBacktraceLink,
        digestAddReadingpoint,
        digestGlobalSigle,
    } from "../../sy-tomato-plugin/src/libs/stores";
</script>

<!-- 摘抄与制卡（□23：术语型开关全部补 hover tip，语义见 tomatoI18n.tip设置* 家族） -->
<div class="settingBox">
    <div class="section-title">{tomatoI18n.摘抄与制卡}</div>
    <!-- v5 □8 功能全免费：旧 VIP 三开关（相关概念/日记摘抄/摘抄轨迹）解锁 -->
    <div>
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$flashcardAddRefs}
        />
        <span class="b3-tooltips b3-tooltips__n" aria-label={tomatoI18n.tip设置相关概念}>{tomatoI18n.卡片最上面添加相关概念}</span>
    </div>

    <div>
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$flashcardUseLink}
        />
        <span class="b3-tooltips b3-tooltips__n" aria-label={tomatoI18n.tip设置回溯链接}>{tomatoI18n.闪卡的回溯使用链接}</span>
    </div>

    <div>
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$pieceNoBacktraceLink}
        />
        <span class="b3-tooltips b3-tooltips__n" aria-label={tomatoI18n.tip设置分片回溯}>{tomatoI18n.分片不加入回溯链接}</span>
    </div>

    <div>
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$digestNoBacktraceLink}
        />
        <span class="b3-tooltips b3-tooltips__n" aria-label={tomatoI18n.tip设置摘抄回溯}>{tomatoI18n.摘抄不加入回溯链接}</span>
    </div>

    <div>
        <!-- 期1 □2 落点三档：digest2dailycard 开关并入（迁移见 index.ts loadStore）；脏值兜底失效占位。
             vision □5：与下行「摘抄制卡模式」select 统一 min-width，右侧标签起始对齐 -->
        <select class="b3-select" style="min-width: 160px" bind:value={$digestLanding}>
            <option value="central">{tomatoI18n.落点集中归档}</option>
            <option value="source">{tomatoI18n.落点源文档下方}</option>
            <option value="daily">{tomatoI18n.落点日记卡片}</option>
            {#if !["central", "source", "daily"].includes($digestLanding)}
                <option value={$digestLanding}>{$digestLanding} {tomatoI18n.已失效请重新选择}</option>
            {/if}
        </select>
        <span class="b3-tooltips b3-tooltips__n" aria-label={tomatoI18n.tip摘抄落点}>{tomatoI18n.摘抄落点}</span>
    </div>

    <div>
        <!-- 可见性期4 □4 A：cardMode 全局默认三档（digestGlobalSigle；书 IAL 优先级链不动）。
             飞书帖 1 同修：saveCardMode 死代码=设置入口缺失，此处补正面回答 -->
        <select class="b3-select" style="min-width: 160px" bind:value={$digestGlobalSigle}>
            <option value="0">{tomatoI18n.制卡不入卡}</option>
            <option value="1">{tomatoI18n.制卡只留最新}</option>
            <option value="2">{tomatoI18n.制卡每摘皆卡}</option>
            {#if !["0", "1", "2"].includes($digestGlobalSigle)}
                <option value={$digestGlobalSigle}>{$digestGlobalSigle} {tomatoI18n.已失效请重新选择}</option>
            {/if}
        </select>
        <span class="b3-tooltips b3-tooltips__n" aria-label={tomatoI18n.tip设置制卡模式}>{tomatoI18n.摘抄制卡模式}</span>
    </div>

    <div>
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$markOriginTextBG}
        />
        <span class="b3-tooltips b3-tooltips__n" aria-label={tomatoI18n.tip设置摘抄背景}>{tomatoI18n.已摘抄块显示背景色}</span>
    </div>

    <div>
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$digestAddReadingpoint}
        />
        <span class="b3-tooltips b3-tooltips__n" aria-label={tomatoI18n.tip设置阅读点}>{tomatoI18n.摘抄后加入阅读点}</span>
    </div>

    <div>
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$cardAppendTime}
        />
        <span class="b3-tooltips b3-tooltips__n" aria-label={tomatoI18n.tip设置制卡时间}>{tomatoI18n.制卡后追加时间与标题路径}</span>
    </div>

    <div>
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$flashcardMultipleLnks}
        />
        <span class="b3-tooltips b3-tooltips__n" aria-label={tomatoI18n.tip设置分片卡链接}>{tomatoI18n.对分片制卡额外链接到分片}</span>
    </div>

    <div>
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$openCardsOnOpenPiece}
        />
        <span class="b3-tooltips b3-tooltips__n" aria-label={tomatoI18n.tip设置同步开卡}>{tomatoI18n.打开分片的同时打开cards文档}</span>
    </div>

    <div>
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$card2dailycard}
        />
        <span class="b3-tooltips b3-tooltips__n" aria-label={tomatoI18n.tip设置制卡daily}>{tomatoI18n.制卡并入dailycard当天文档}</span>
    </div>

    <div>
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$cardUnderPiece}
        />
        <span class="b3-tooltips b3-tooltips__n" aria-label={tomatoI18n.tip设置卡位置}>{tomatoI18n.分片内制卡放于分片的子文档内}</span>
    </div>

    <div>
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$hideBtnsInFlashCard}
        />
        <span class="b3-tooltips b3-tooltips__n" aria-label={tomatoI18n.tip设置复习隐藏}>{tomatoI18n.复习闪卡时隐藏分片按钮组}</span>
    </div>
</div>
