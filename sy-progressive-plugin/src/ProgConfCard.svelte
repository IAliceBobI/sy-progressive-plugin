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
        readCurveSweepMins,
        readCurveTakeover,
        readCurvePiece,
        readCurveMaterial,
        readCurveDigest,
        readCurveReadingPoint,
        readCurvePlainDocs,
        readCurveCadMaterial,
        readCurveCadDigest,
        readCurveCadReadingPoint,
        readCurveCadPlain,
    } from "../../sy-tomato-plugin/src/libs/stores";
    import { SCHED_CHOICES } from "./readCurveCore";
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

    <!-- 阅读曲线接管（1530 期1，实验默认关）：分片卡 due=滚筒节奏投影进官方复习；
         关=末次清场（readCurve.clearReadCurve）。开关+频率档同卡（紧凑偏好） -->
    <div>
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$readCurveTakeover}
        />
        <span class="b3-tooltips b3-tooltips__n" aria-label={tomatoI18n.tip设置阅读曲线}>{tomatoI18n.阅读曲线接管实验}</span>
    </div>
    {#if $readCurveTakeover}
        <div>
            <select class="b3-select" style="min-width: 160px" bind:value={$readCurveSweepMins}>
                <option value={0}>{tomatoI18n.关闭}</option>
                <option value={30}>30 min</option>
                <option value={60}>1 h</option>
                <option value={360}>6 h</option>
                {#if ![0, 30, 60, 360].includes($readCurveSweepMins)}
                    <option value={$readCurveSweepMins}>{$readCurveSweepMins} {tomatoI18n.已失效请重新选择}</option>
                {/if}
            </select>
            <span class="b3-tooltips b3-tooltips__n" aria-label={tomatoI18n.tip巡查频率}>{tomatoI18n.巡查频率}</span>
        </div>
        <!-- □5 类别开关族（一行一类紧凑：开关+名称+重现族节奏档位下拉；关=该类不再
             新建卡，存量走完自然毕业；档位只管新建卡初始曲线，存量卡不动） -->
        <div>
            <input type="checkbox" class="b3-switch" bind:checked={$readCurvePiece} />
            <span class="b3-tooltips b3-tooltips__n" aria-label={tomatoI18n.tip推送分片}>{tomatoI18n.分片}</span>
        </div>
        <div>
            <input type="checkbox" class="b3-switch" bind:checked={$readCurveMaterial} />
            <span class="b3-tooltips b3-tooltips__n" aria-label={tomatoI18n.tip推送素材}>{tomatoI18n.素材}</span>
            <select class="b3-select" style="min-width: 130px" bind:value={$readCurveCadMaterial}>
                <option value={0}>{tomatoI18n.节奏默认递增}</option>
                {#each SCHED_CHOICES as n (n)}
                    <option value={n}>{tomatoI18n.计划每N天(n)}</option>
                {/each}
                {#if $readCurveCadMaterial !== 0 && !SCHED_CHOICES.includes($readCurveCadMaterial)}
                    <option value={$readCurveCadMaterial}>{$readCurveCadMaterial} {tomatoI18n.已失效请重新选择}</option>
                {/if}
            </select>
        </div>
        <div>
            <input type="checkbox" class="b3-switch" bind:checked={$readCurveDigest} />
            <span class="b3-tooltips b3-tooltips__n" aria-label={tomatoI18n.tip推送摘抄}>{tomatoI18n.摘抄}</span>
            <select class="b3-select" style="min-width: 130px" bind:value={$readCurveCadDigest}>
                <option value={0}>{tomatoI18n.节奏默认递增}</option>
                {#each SCHED_CHOICES as n (n)}
                    <option value={n}>{tomatoI18n.计划每N天(n)}</option>
                {/each}
                {#if $readCurveCadDigest !== 0 && !SCHED_CHOICES.includes($readCurveCadDigest)}
                    <option value={$readCurveCadDigest}>{$readCurveCadDigest} {tomatoI18n.已失效请重新选择}</option>
                {/if}
            </select>
        </div>
        <div>
            <input type="checkbox" class="b3-switch" bind:checked={$readCurveReadingPoint} />
            <span class="b3-tooltips b3-tooltips__n" aria-label={tomatoI18n.tip推送阅读点}>{tomatoI18n.阅读点}</span>
            <select class="b3-select" style="min-width: 130px" bind:value={$readCurveCadReadingPoint}>
                <option value={0}>{tomatoI18n.节奏默认递增}</option>
                {#each SCHED_CHOICES as n (n)}
                    <option value={n}>{tomatoI18n.计划每N天(n)}</option>
                {/each}
                {#if $readCurveCadReadingPoint !== 0 && !SCHED_CHOICES.includes($readCurveCadReadingPoint)}
                    <option value={$readCurveCadReadingPoint}>{$readCurveCadReadingPoint} {tomatoI18n.已失效请重新选择}</option>
                {/if}
            </select>
        </div>
        <div>
            <input type="checkbox" class="b3-switch" bind:checked={$readCurvePlainDocs} />
            <span class="b3-tooltips b3-tooltips__n" aria-label={tomatoI18n.tip推送文档卡}>{tomatoI18n.我的文档卡}</span>
            <select class="b3-select" style="min-width: 130px" bind:value={$readCurveCadPlain}>
                <option value={0}>{tomatoI18n.节奏默认递增}</option>
                {#each SCHED_CHOICES as n (n)}
                    <option value={n}>{tomatoI18n.计划每N天(n)}</option>
                {/each}
                {#if $readCurveCadPlain !== 0 && !SCHED_CHOICES.includes($readCurveCadPlain)}
                    <option value={$readCurveCadPlain}>{$readCurveCadPlain} {tomatoI18n.已失效请重新选择}</option>
                {/if}
            </select>
        </div>
    {/if}
</div>
