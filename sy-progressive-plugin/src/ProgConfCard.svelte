<script lang="ts">
    // 渐进设置页域组件：从 ProgConfDigest.svelte 整块搬运（卡片内部一行不动）。
    // 2026-09-07 bear 三问拍板 A1 拆域（7→8 域）：原「摘抄与制卡」13 项混排卡拆两域，
    // 本组件=「制卡」域 8 项（复习隐藏按钮组随制卡走=卡的下游）
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
    import {
        cardAppendTime,
        cardLanding,
        cardUnderPiece,
        flashcardAddRefs,
        flashcardMultipleLnks,
        hideBtnsInFlashCard,
        openCardsOnOpenPiece,
        pieceNoBacktraceLink,
    } from "../../sy-tomato-plugin/src/libs/stores";
</script>

<!-- 制卡（□23：术语型开关全部补 hover tip，语义见 tomatoI18n.tip设置* 家族） -->
<div class="settingBox">
    <div class="section-title">{tomatoI18n.制卡}</div>
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
            bind:checked={$pieceNoBacktraceLink}
        />
        <span class="b3-tooltips b3-tooltips__n" aria-label={tomatoI18n.tip设置分片回溯}>{tomatoI18n.分片不加入回溯链接}</span>
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
        <!-- 制卡落点三档（2026-09-07，与「摘抄落点」对称）：card2dailycard 布尔并入（迁移见
             index.ts loadStore）；脏值兜底失效占位（同 digestLanding 行款）。同日 B③ 拍板后
             本档=⌥E/⌥S 的默认落点，命令面板另有三落点命令可单次覆盖 -->
        <select class="b3-select" style="min-width: 160px" bind:value={$cardLanding}>
            <option value="dailycard">{tomatoI18n.落点当日卡文档}</option>
            <option value="dailynote">{tomatoI18n.落点当天日记}</option>
            <option value="cards">{tomatoI18n.落点卡片夹}</option>
            {#if !["dailycard", "dailynote", "cards"].includes($cardLanding)}
                <option value={$cardLanding}>{$cardLanding} {tomatoI18n.已失效请重新选择}</option>
            {/if}
        </select>
        <span class="b3-tooltips b3-tooltips__n" aria-label={tomatoI18n.tip制卡落点}>{tomatoI18n.制卡落点}</span>
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
