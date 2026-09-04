<script lang="ts">
    // 渐进设置页域组件（2026-09-03 双栏改造）：自 Settings.svelte 整块搬运，卡片内部一行不动；
    // 本组件=「浮条」域的卡片（移动端顶栏形态 + 片态首行按钮池）
    import { mobileTopBar } from "../../sy-tomato-plugin/src/libs/stores";
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
    import { PIECE_MAIN_POOL, PIECE_TRAY_POOL, PIECE_LOW_POOL, ADV_POOL } from "./progFloatState";

    // □14c 快照防覆盖状态由壳持有（2026-09-03 双栏改造提升）：单域渲染下切走本域即卸载
    // 组件，域内局部快照会丢——快照+dirty 提升到壳、经 bindable 读写，save 时壳统一回写 store
    interface Props {
        pieceMainBtns: string[];
        pieceMainBtnsDirty: boolean;
    }
    let { pieceMainBtns = $bindable(), pieceMainBtnsDirty = $bindable(false) }: Props = $props();

    // ============ 片态浮条首行按钮池（勾选站首行大钮，未勾落平铺区小格——□10 方案 B；
    // □14c 扩全量池（32 项 = 7 池钮 + 3 托盘 + 8 低频含 map/recite/traceUp + 14 高级，
    // □14c 时为 28、□11 增 map、□27 增 recite、□29 增 traceUp）：池钮 + 低频 + 高级钮
    // 皆可入首行，桌面浮条上直接拖拽同效） ============
    const MAIN_BTN_LABELS: Record<string, () => string> = {
        digest: () => tomatoI18n.摘抄选中内容,
        cards: () => tomatoI18n.附属卡,
        swap: () => tomatoI18n.换一本书看,
        next: () => tomatoI18n.下一片删本片,
        prev: () => tomatoI18n.纯回看上一片,
        origin: () => tomatoI18n.回原书,
        addBook: () => tomatoI18n.加书,
        nextPure: () => tomatoI18n.下一个分片,
        delBack: () => tomatoI18n.删除分片看上一个分片,
        quit: () => tomatoI18n.关闭分片,
        // 低频段（contents/refill/clean/delExit/ignore 5 项 + map/recite 见下各自注释）
        contents: () => tomatoI18n.打开目录,
        refill: () => tomatoI18n.重插,
        clean: () => tomatoI18n.删原文,
        delExit: () => tomatoI18n.删片退出,
        ignore: () => tomatoI18n.不再推送,
        // □11 路线指引浮层（四态通用低频）——此前缺键，fallback 裸显英文 id「Map」（□23 实锤）
        map: () => tomatoI18n.路线指引,
        // □27 仿写本片（片态副本练习，恒可见低频段）
        recite: () => tomatoI18n.仿写本片,
        // □29 本书摘抄清单（片态复用书态 traceUp 浮层；label 沿浮条短标签）
        traceUp: () => tomatoI18n.本书摘抄,
        // 高级 14（□14c 起可勾上首行；label 沿 □10 短标签）
        card: () => tomatoI18n.制卡,
        cardHere: () => tomatoI18n.原地制卡短,
        cardDaily: () => tomatoI18n.制日卡,
        cardDailyN: () => tomatoI18n.制日卡无引,
        multi: () => tomatoI18n.多行,
        collect: () => tomatoI18n.收集,
        movePrev: () => tomatoI18n.移上一片,
        moveNext: () => tomatoI18n.移下一片,
        extractAll: () => tomatoI18n.提取全部,
        extractEnd: () => tomatoI18n.提取到底,
        extract: () => tomatoI18n.提取笔记,
        noColor: () => tomatoI18n.去色,
        reColor: () => tomatoI18n.恢复颜色,
        merge: () => tomatoI18n.合并,
    };
    // □23 设置行 hover tip：每钮一句用法，直接复用浮条侧 TIPS/FLAT_TIPS/ADV_USAGE 的
    // 第二行用法句 getter（文案单一事实源在 tomatoI18n.tip*；新增按钮两表同步加行）
    const MAIN_BTN_TIPS: Record<string, () => string> = {
        digest: () => tomatoI18n.tip摘抄,
        cards: () => tomatoI18n.tip本书附属卡,
        swap: () => tomatoI18n.tip换书,
        next: () => tomatoI18n.tip下片删,
        prev: () => tomatoI18n.tip回看,
        origin: () => tomatoI18n.tip片回原书,
        addBook: () => tomatoI18n.tip加书,
        nextPure: () => tomatoI18n.tip下一个分片,
        delBack: () => tomatoI18n.tip上片删,
        quit: () => tomatoI18n.tip关闭分片,
        contents: () => tomatoI18n.tip打开目录,
        refill: () => tomatoI18n.tip重插,
        clean: () => tomatoI18n.tip删原文,
        delExit: () => tomatoI18n.tip删片退出,
        ignore: () => tomatoI18n.tip不再推送,
        map: () => tomatoI18n.tip路线指引,
        recite: () => tomatoI18n.tip仿写本片, // 片态语义（digest 态「送进仿写」不进此池）
        traceUp: () => tomatoI18n.tip本书摘抄, // □29 片态复用（原书态浮层，选中块定位当前片）
        card: () => tomatoI18n.tip制卡,
        cardHere: () => tomatoI18n.tip原地制卡,
        cardDaily: () => tomatoI18n.tip制日卡,
        cardDailyN: () => tomatoI18n.tip制日卡无引,
        multi: () => tomatoI18n.tip多行,
        collect: () => tomatoI18n.tip收集,
        movePrev: () => tomatoI18n.tip移上一片,
        moveNext: () => tomatoI18n.tip移下一片,
        extractAll: () => tomatoI18n.tip提取全部,
        extractEnd: () => tomatoI18n.tip提取到底,
        extract: () => tomatoI18n.tip提取笔记,
        noColor: () => tomatoI18n.tip去色,
        reColor: () => tomatoI18n.tip恢复颜色,
        merge: () => tomatoI18n.tip合并,
    };
    const MAIN_BTN_POOL = [...PIECE_MAIN_POOL, ...PIECE_TRAY_POOL, ...PIECE_LOW_POOL, ...ADV_POOL];

    function toggleMainBtn(id: string, checked: boolean) {
        pieceMainBtns = checked ? [...pieceMainBtns, id] : pieceMainBtns.filter(x => x !== id);
        pieceMainBtnsDirty = true;
    }
</script>

<!-- 浮条（v5 □5 三态：移动端形态开关 + 片态首行按钮池） -->
<div class="settingBox">
    <div class="section-title">{tomatoI18n.浮条}</div>
    <div>
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$mobileTopBar}
        />
        <span class="b3-tooltips b3-tooltips__n" aria-label={tomatoI18n.tip设置移动端顶栏}>{tomatoI18n.移动端浮条固定顶部}</span>
    </div>
    <div class="prog-fb-pool-hint">{tomatoI18n.浮条主排按钮提示}</div>
    {#each MAIN_BTN_POOL as id (id)}
        {@const tip = MAIN_BTN_TIPS[id]?.()}
        <div>
            <input
                type="checkbox"
                class="b3-switch"
                checked={pieceMainBtns.includes(id)}
                onchange={(e) => toggleMainBtn(id, e.currentTarget.checked)}
            />
            <span class={tip ? "b3-tooltips b3-tooltips__n" : undefined} aria-label={tip}
                >{MAIN_BTN_LABELS[id]?.() ?? id}</span
            >
        </div>
    {/each}
</div>

<style>
    .prog-fb-pool-hint {
        padding: 4px 0;
        font-size: 12px;
        line-height: 1.5;
        color: var(--b3-theme-on-surface);
        opacity: 0.6;
    }
</style>
