<script lang="ts">
    import { DestroyManager } from "../../sy-tomato-plugin/src/libs/destroyer";
    import { onDestroy, onMount, tick } from "svelte";
    import { BaseTomatoPlugin } from "../../sy-tomato-plugin/src/libs/BaseTomatoPlugin";
    import { STORAGE_Prog_SETTINGS } from "../../sy-tomato-plugin/src/constants";
    // 番茄工具箱设置页同款卡片体系（conf-group/section-title/kbd 键帽），根节点挂
    // .tomato-settings-dialog 类启用；样式按该类作用域限定，不会泄漏（2026-08-24 对齐改造）
    import "../../sy-tomato-plugin/src/IndexConf.css";
    import {
        mobileTopBar,
        floatbarMainBtns,
        cardAppendTime,
        card2dailycard,
        cardUnderPiece,
        digest2dailycard,
        digestNoBacktraceLink,
        flashcardAddRefs,
        flashcardMultipleLnks,
        flashcardNotebook,
        flashcardUseLink,
        hideBtnsInFlashCard,
        initProgFloatBtnsDisable,
        digestmenu,
        piecesmenu,
        blockIconMenu,
        ProgressiveStart2learn,
        ProgressiveJumpMenu,
        markOriginTextBG,
        openCardsOnOpenPiece,
        pieceNoBacktraceLink,
        windowOpenStyle,
        digestAddReadingpoint,
    } from "../../sy-tomato-plugin/src/libs/stores";
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
    import HotkeyCap from "../../sy-tomato-plugin/src/HotkeyCap.svelte";
    import UpgradeBar from "../../sy-tomato-plugin/src/UpgradeBar.svelte";
    import { openUnlockDialog } from "../../sy-tomato-plugin/src/unlockDialog";
    import NotebookSelect from "../../sy-tomato-plugin/src/NotebookSelect.svelte";
    import { saveRestorePagePosition } from "../../sy-tomato-plugin/src/libs/utils";
    import {
        digest渐进阅读摘抄模式,
        digest执行摘抄,
        digest执行摘抄并断句,
    } from "./DigestProgressiveBox";
    import {
        Progressive开始学习,
        Progressive开始随机学习,
        Progressive上一页,
        Progressive下一页,
        Progressive添加当前文档到渐进阅读分片模式,
        Progressive跳到分片或回到原文,
        progSettingsOpenHK,
    } from "./Progressive";
    import { searchSettings } from "../../sy-tomato-plugin/src/libs/ui";
    import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
    import { progStorage } from "./ProgressiveStorage";
    import { consolidateDigests } from "./progData";
    import { PIECE_MAIN_POOL, PIECE_TRAY_POOL, PIECE_LOW_POOL, ADV_POOL } from "./progFloatState";
    // v5 □8 皮肤系统：三维正交货架 + 参数微调（Pro=整个皮肤系统买断，锁绑激活态）
    import {
        PROG_THEMES, PROG_FLAMES, PROG_PANELS,
        DEFAULT_THEME_SLUG, DEFAULT_FLAME_SLUG, DEFAULT_PANEL_SLUG,
        THEME_SETTING_KEY, FLAME_SETTING_KEY, PANEL_SETTING_KEY, TUNE_SETTING_KEY,
        applyProgSkins, PROG_GATE_OPEN, clampTune, type ProgTune,
    } from "./theme";
    import { lastVerifyResult } from "../../sy-tomato-plugin/src/libs/user";

    // v5 数据管理：prog-data 位置显示 + 「归拢老数据」命令
    let progDataPath = $state("");
    let consolidateMsg = $state("");

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
    let pieceMainBtns: string[] = $state([...floatbarMainBtns.get()]);

    function toggleMainBtn(id: string, checked: boolean) {
        pieceMainBtns = checked ? [...pieceMainBtns, id] : pieceMainBtns.filter(x => x !== id);
        pieceMainBtnsDirty = true;
    }

    // □14c 快照防覆盖：pieceMainBtns 是开面板时的快照，面板开着时浮条拖拽会 commit 新序
    // 进 store——用户没动过 checkbox 就不该用旧快照回滚它（当前靠思源 Dialog 模态性挡住
    // 浮条交互，此处设防不依赖巧合——reasoning review P2）
    let pieceMainBtnsDirty = false;

    async function refreshProgDataPath() {
        const rootID = await progStorage.ensureProgDataRoot();
        if (!rootID) {
            progDataPath = "";
            return;
        }
        const row = await siyuan.sqlOne(`select box, hpath from blocks where id='${rootID}'`);
        // 刚建的根有 SQL 索引延迟，hpath 可能查空——如实显示已创建，不误报「未创建」
        if (!row?.hpath) {
            progDataPath = tomatoI18n.progData已创建索引中;
            return;
        }
        const nbs = await siyuan.lsNotebooks();
        const nbName = (nbs ?? []).find(n => n.id === row?.box)?.name ?? row?.box ?? "";
        progDataPath = `${nbName}${row?.hpath ?? ""}`;
    }

    async function doConsolidate() {
        consolidateMsg = tomatoI18n.归拢中;
        const rootID = await progStorage.ensureProgDataRoot();
        if (!rootID) {
            consolidateMsg = tomatoI18n.找不到可用笔记本;
            return;
        }
        const s = await consolidateDigests(rootID);
        consolidateMsg = tomatoI18n.归拢结果(s.result.moved, s.result.failed, s.cleanedEmptyPieceDirs, s.plan.skippedForeign);
        await refreshProgDataPath();
    }

    export function destroy() {
        dm.destroyBy("2");
        localStorage.setItem(SearchKeyItemKey, searchKey);
    }
    interface Props {
        dm: DestroyManager;
        plugin: BaseTomatoPlugin;
        /** header Pro 徽标节点（□3）：激活态回写窗口内由 $effect 接管显隐 */
        proBadge?: HTMLElement;
    }

    let { dm, plugin = $bindable(), proBadge }: Props = $props();
    let settingsDiv: HTMLElement = $state();
    let searchInput: HTMLElement = $state();
    let searchKey = $state("");
    // 激活态初值取 verify 懒缓存真值（□14a 拆门后不再借 body 门禁 class——门恒开 class
    // 永不挂，借用会恒 true 让激活卡对未激活用户谎报已激活）；面板打开时启动 verify 已
    // 就位不闪，随后 ActivationCard onMount 自动 verify 经 bind:codeValid 回写纠正
    let codeValid = $state(lastVerifyResult() === true);
    // □3：header Pro 徽标随激活态显隐（懒缓存未命中时 UpgradeBar onMount verify 回写纠正）
    $effect(() => {
        if (proBadge) proBadge.style.display = codeValid ? "" : "none";
    });
    const SearchKeyItemKey =
        "progressive_settings_SearchKeyItemKey_RfrUm9VLS4GehTzg5ygRrNT";

    onDestroy(destroy);

    onMount(async () => {
        window.tomato_zZmqus5PtYRi.save = save;
        refreshProgDataPath();
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
        if (pieceMainBtnsDirty) {
            floatbarMainBtns.set([...pieceMainBtns]);
        }
        await plugin.saveData(STORAGE_Prog_SETTINGS, plugin.settingCfg);
        window.location.reload();
    }

    // ===== v5 □8 皮肤货架：locked 绑激活态——免费默认款永久可选，Pro 款未激活锁死
    // （功能层锁：aria-disabled + 点击弹解锁框，不用 disabled 属性否则收不到点击没法
    // 引导）；已激活全解锁。点击已解锁卡：选中 + 写 settingCfg 对应键 + applyProgSkins
    // 即时换肤（免重载，recite 先例）。锁卡在 unpaid 下另有 CSS 门禁兜底（挂属性不生效）。
    const themes = $derived(PROG_THEMES.map(s => ({
        ...s,
        name: tomatoI18n.皮肤名(s.zhName),
        locked: !codeValid && s.pro && !PROG_GATE_OPEN, // □14a 拆门：货架锁恒开
    })));
    const flames = $derived(PROG_FLAMES.map(s => ({
        ...s,
        name: tomatoI18n.皮肤名(s.zhName),
        locked: !codeValid && s.pro && !PROG_GATE_OPEN, // □14a 拆门：货架锁恒开
    })));
    const panels = $derived(PROG_PANELS.map(s => ({
        ...s,
        name: tomatoI18n.皮肤名(s.zhName),
        locked: !codeValid && s.pro && !PROG_GATE_OPEN, // □14a 拆门：货架锁恒开
        // 材质样机示意色：glass 半透明蓝灰 / paper 纸棕 / surface 描边灰
        mock: s.slug === "glass" ? "rgba(140, 160, 175, 0.35)" : s.slug === "paper" ? "#d9c8a5" : "var(--b3-border-color)",
    })));

    // svelte-ignore state_referenced_locally
    let selectedTheme = $state(plugin.settingCfg?.[THEME_SETTING_KEY] || DEFAULT_THEME_SLUG);
    // svelte-ignore state_referenced_locally
    let selectedFlame = $state(plugin.settingCfg?.[FLAME_SETTING_KEY] || DEFAULT_FLAME_SLUG);
    // svelte-ignore state_referenced_locally
    let selectedPanel = $state(plugin.settingCfg?.[PANEL_SETTING_KEY] || DEFAULT_PANEL_SLUG);

    function pickSkin(key: string, slug: string, locked: boolean, setter: (s: string) => void) {
        if (locked) {
            // □1 灰档统一：锁卡点击弹统一解锁框（替代原 pushMsg 提示）
            openUnlockDialog({
                product: "progressive",
                onActivated: () => plugin.saveData(STORAGE_Prog_SETTINGS, plugin.settingCfg),
            });
            return;
        }
        setter(slug);
        plugin.settingCfg[key] = slug;
        applyProgSkins(plugin.settingCfg);
        plugin.saveData(STORAGE_Prog_SETTINGS, plugin.settingCfg);
    }
    const pickTheme = (slug: string, locked: boolean) => pickSkin(THEME_SETTING_KEY, slug, locked, s => selectedTheme = s);
    const pickFlame = (slug: string, locked: boolean) => pickSkin(FLAME_SETTING_KEY, slug, locked, s => selectedFlame = s);
    const pickPanel = (slug: string, locked: boolean) => pickSkin(PANEL_SETTING_KEY, slug, locked, s => selectedPanel = s);

    // ===== 参数微调（Pro）：滑杆即拖即生效，400ms 防抖落盘；重置清 hue/bri 留命名
    // （□14a 拆门：tune 锁与货架同口径吃 PROG_GATE_OPEN——reasoning review P1 补漏）
    const tuneLocked = $derived(!codeValid && !PROG_GATE_OPEN);
    // svelte-ignore state_referenced_locally
    let tune = $state<ProgTune>(clampTune(plugin.settingCfg?.[TUNE_SETTING_KEY]));
    let tuneSaveTimer: ReturnType<typeof setTimeout> | null = null;

    function onTuneInput() {
        if (tuneLocked) {
            siyuan.pushMsg(tomatoI18n.微调Pro提示, 2500);
            return;
        }
        tune = clampTune(tune);
        plugin.settingCfg[TUNE_SETTING_KEY] = tune;
        applyProgSkins(plugin.settingCfg);
        if (tuneSaveTimer) clearTimeout(tuneSaveTimer);
        tuneSaveTimer = setTimeout(() => {
            plugin.saveData(STORAGE_Prog_SETTINGS, plugin.settingCfg);
            tuneSaveTimer = null;
        }, 400);
    }

    function resetTune() {
        tune = { hue: 0, bri: 0, name: tune.name };
        plugin.settingCfg[TUNE_SETTING_KEY] = tune;
        applyProgSkins(plugin.settingCfg);
        plugin.saveData(STORAGE_Prog_SETTINGS, plugin.settingCfg);
    }
</script>

<div class="container tomato-settings-dialog" bind:this={settingsDiv}>
    <!-- 付费状态条（□1）：未激活一行入口，点击弹统一解锁框；已激活整条不渲染 -->
    <UpgradeBar
        product="progressive"
        bind:codeValid
        onActivated={() => plugin.saveData(STORAGE_Prog_SETTINGS, plugin.settingCfg)}
    ></UpgradeBar>

    <!-- search：placeholder 化（对齐番茄），输入框宽度由 IndexConf.css 拉满自适应 -->
    <div class="settingBox search-bar" data-search>
        <input
            class="b3-text-field prog-search-input"
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
            <!-- □5 补全：翻页是阅读主链路（浮条 回看/下一个分片 挂的就是这对键，next 下片删语义不同不挂），与跳到分片/加书同为高频可改项 -->
            <div>
                {Progressive上一页.icon}
                {Progressive上一页.langText()}<HotkeyCap hk={Progressive上一页} pluginName="sy-progressive-plugin"></HotkeyCap>
            </div>
            <div>
                {Progressive下一页.icon}
                {Progressive下一页.langText()}<HotkeyCap hk={Progressive下一页} pluginName="sy-progressive-plugin"></HotkeyCap>
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

    <!-- 菜单入口（v5 □7：右键显隐开关 20→4——制卡/收集/提取族收进浮条 [+] 高级功能，随开关退役。
         □11 标题宽化：区内还有块图标菜单（左键点块前小圆点）与移动端菜单，非全是右键，各条目自说明入口类型） -->
    <section class="conf-group">
        <div class="settingBox">
            <div class="section-title">{tomatoI18n.菜单入口}</div>
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
                <!-- digestmenu 一拖二（□3 review P2-2）：同门还有「整篇摘抄」右键项，开回即一并恢复 -->
                （+{tomatoI18n.整篇摘抄}）
            </div>

            <div>
                <input
                    type="checkbox"
                    class="b3-switch"
                    bind:checked={$ProgressiveJumpMenu}
                />
                {tomatoI18n.menu添加右键菜单}:
                {Progressive跳到分片或回到原文.icon}
                {Progressive跳到分片或回到原文.langText()}
                <HotkeyCap hk={Progressive跳到分片或回到原文} pluginName="sy-progressive-plugin"></HotkeyCap>
            </div>

            <!-- □7：块图标菜单（点块前小圆点）独立开关——右键默认关不再连带，键帽见上两行 -->
            <div>
                <input
                    type="checkbox"
                    class="b3-switch"
                    bind:checked={$blockIconMenu}
                />
                {tomatoI18n.块图标菜单入口}:
                {Progressive跳到分片或回到原文.langText()} + {digest渐进阅读摘抄模式.langText()}
            </div>

            <div>
                <input
                    type="checkbox"
                    class="b3-switch"
                    bind:checked={$ProgressiveStart2learn}
                />
                {tomatoI18n.移动端菜单显示开始学习}:
                {Progressive开始学习.langText()}
                <HotkeyCap hk={Progressive开始学习} pluginName="sy-progressive-plugin"></HotkeyCap>
            </div>
        </div>
    </section>

    <!-- 基础设置 -->
    <section class="conf-group">
        <div class="settingBox">
            <div class="section-title">{tomatoI18n.基础设置}</div>
            <div>
                <!-- □2 选择化：原 0-6 裸数字输入改下拉，存量值原样兼容；脏值兜底失效占位 -->
                <select class="b3-select" bind:value={$windowOpenStyle}>
                    <option value="0">{tomatoI18n.打开方式不打开}</option>
                    <option value="1">{tomatoI18n.打开方式前台页签}</option>
                    <option value="2">{tomatoI18n.打开方式后台页签}</option>
                    <option value="3">{tomatoI18n.打开方式右侧分屏}</option>
                    <option value="4">{tomatoI18n.打开方式底部分屏}</option>
                    <option value="5">{tomatoI18n.打开方式独立窗口}</option>
                    <option value="6">{tomatoI18n.打开方式瞄一眼自动返回}</option>
                    {#if !["0", "1", "2", "3", "4", "5", "6"].includes($windowOpenStyle)}
                        <option value={$windowOpenStyle}>{$windowOpenStyle} {tomatoI18n.已失效请重新选择}</option>
                    {/if}
                </select>
                {tomatoI18n.新开窗口如何打开}
            </div>

            <div>
                <!-- □2 选择化：原裸 ID 输入改笔记本选择器，lsNotebooks 实时取（禁缓存） -->
                <NotebookSelect
                    bare
                    store={flashcardNotebook}
                    emptyLabel={() => tomatoI18n.未设置跟随当前文档}
                    emptyTitle={() => tomatoI18n.未设置跟随当前文档}
                />
                {tomatoI18n.新闪卡存入的笔记本}
            </div>

            <div>
                <input
                    type="checkbox"
                    class="b3-switch"
                    bind:checked={$initProgFloatBtnsDisable}
                />
                <span class="b3-tooltips b3-tooltips__n" aria-label={tomatoI18n.tip设置禁用浮条}>{tomatoI18n.禁用初始化渐进学习浮动按钮}</span>
            </div>
        </div>
    </section>

    <!-- 摘抄与制卡（□23：术语型开关全部补 hover tip，语义见 tomatoI18n.tip设置* 家族） -->
    <section class="conf-group">
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
                <input
                    type="checkbox"
                    class="b3-switch"
                    bind:checked={$digest2dailycard}
                />
                <span class="b3-tooltips b3-tooltips__n" aria-label={tomatoI18n.tip设置dailycard}>{tomatoI18n.摘抄加入到dailycard当天目录下}</span>
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
    </section>

    <!-- 浮条（v5 □5 三态：移动端形态开关 + 片态首行按钮池） -->
    <section class="conf-group">
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
    </section>

    <!-- v5 □8 皮肤系统：三维正交货架（配色/火苗形态/容器材质）+ 参数微调。
         Pro=¥72 一个价（□9 终稿：皮肤系统+断句+生词 AI+收集/写作对比），免费默认款不退化；锁卡点击弹统一解锁框。
         □2 挪后段：免费设置优先呈现，皮肤货架垫数据管理之前 -->
    <section class="conf-group">
        <div class="settingBox">
            <div class="section-title">{tomatoI18n.皮肤外观}</div>

            <div class="prog-skins-sub">{tomatoI18n.配色主题}</div>
            <div class="prog-skins-row prog-skins-row--six">
                {#each themes as s (s.slug)}
                    <button
                        class="prog-skin-card"
                        class:selected={s.slug === selectedTheme}
                        class:locked={s.locked}
                        aria-disabled={s.locked || undefined}
                        data-slug={s.slug}
                        style="--mock-accent:{s.color};--mock-flame:{s.flame ?? '#b06e1e'}"
                        onclick={() => pickTheme(s.slug, s.locked)}
                    >
                            <div class="skin-mock">
                                <div class="skin-chip a"></div>
                                <div class="skin-chip b"></div>
                                <div class="skin-name"
                                    >{s.slug === selectedTheme && tune.name ? `${s.name} · ${tune.name}` : s.name}</div
                                >
                                <span class="skin-flame-dot" aria-hidden="true"></span>
                            </div>
                            <!-- □30：角标只在未激活锁定时渲染（变灰+引导），激活后退役全消失 -->
                            {#if s.locked}<span class="skin-tag">Pro</span>{/if}
                    </button>
                {/each}
            </div>

            <div class="prog-skins-sub">{tomatoI18n.火苗形态}</div>
            <div class="prog-skins-row">
                {#each flames as s (s.slug)}
                    <button
                        class="prog-skin-card prog-skin-card--flame"
                        class:selected={s.slug === selectedFlame}
                        class:locked={s.locked}
                        aria-disabled={s.locked || undefined}
                        data-slug={s.slug}
                        onclick={() => pickFlame(s.slug, s.locked)}
                    >
                        <div class="skin-mock">
                            <svg viewBox="0 0 24 32" aria-hidden="true">
                                <path d={s.d} fill="var(--prog-flame-base)" />
                            </svg>
                            <div class="skin-name">{s.name}</div>
                        </div>
                        <!-- □30：角标只在未激活锁定时渲染（变灰+引导），激活后退役全消失 -->
                        {#if s.locked}<span class="skin-tag">Pro</span>{/if}
                    </button>
                {/each}
            </div>

            <div class="prog-skins-sub">{tomatoI18n.容器材质}</div>
            <div class="prog-skins-row">
                {#each panels as s (s.slug)}
                    <button
                        class="prog-skin-card prog-skin-card--panel"
                        class:selected={s.slug === selectedPanel}
                        class:locked={s.locked}
                        aria-disabled={s.locked || undefined}
                        data-slug={s.slug}
                        style="--mock-accent:{s.mock}"
                        onclick={() => pickPanel(s.slug, s.locked)}
                    >
                        <div class="skin-mock">
                            <div class="skin-chip a"></div>
                            <div class="skin-chip b"></div>
                            <div class="skin-name">{s.name}</div>
                        </div>
                        <!-- □30：角标只在未激活锁定时渲染（变灰+引导），激活后退役全消失 -->
                        {#if s.locked}<span class="skin-tag">Pro</span>{/if}
                    </button>
                {/each}
            </div>

            <div class="prog-skins-sub">{tomatoI18n.参数微调}</div>
            <div class="prog-tune-row">
                <span>{tomatoI18n.色相}</span>
                <input
                    type="range"
                    min="-30"
                    max="30"
                    step="1"
                    bind:value={tune.hue}
                    oninput={onTuneInput}
                    disabled={tuneLocked}
                />
                <span class="val">{tune.hue > 0 ? "+" : ""}{tune.hue}°</span>
            </div>
            <div class="prog-tune-row">
                <span>{tomatoI18n.亮度}</span>
                <input
                    type="range"
                    min="-20"
                    max="20"
                    step="1"
                    bind:value={tune.bri}
                    oninput={onTuneInput}
                    disabled={tuneLocked}
                />
                <span class="val">{tune.bri > 0 ? "+" : ""}{tune.bri}%</span>
            </div>
            <div class="prog-tune-row">
                <input
                    class="b3-text-field prog-tune-name"
                    placeholder={tomatoI18n.自定义名称}
                    maxlength="12"
                    bind:value={tune.name}
                    oninput={onTuneInput}
                    disabled={tuneLocked}
                />
                <button
                    class="b3-button b3-button--outline tomato-button prog-accent-btn"
                    onclick={resetTune}
                    disabled={tuneLocked}>{tomatoI18n.重置微调}</button
                >
            </div>
        </div>
    </section>

    <!-- 数据管理（□2 挪最后：低频+危险操作收底） -->
    <section class="conf-group">
        <div class="settingBox">
            <div class="section-title">{tomatoI18n.数据管理}</div>
            <div class="settingBox dev-row">
                <span class="kbd">prog-data</span>
                <span>{progDataPath || tomatoI18n.progData未创建说明}</span>
            </div>
            <div class="settingBox dev-row">
                <button
                    class="b3-button b3-button--outline tomato-button prog-accent-btn b3-tooltips b3-tooltips__n"
                    aria-label={tomatoI18n.tip设置归拢}
                    onclick={doConsolidate}>{tomatoI18n.归拢老数据}</button>
                {#if consolidateMsg}<span>{consolidateMsg}</span>{/if}
            </div>
        </div>
    </section>

    <!-- save（□3）：52px sticky footer 收底，主色「保存并关闭」（原面板末位 outline 保存行退役） -->
    <div class="settings-footer">
        <button class="b3-button tomato-save-btn" onclick={save}>{tomatoI18n.保存并关闭}</button>
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
    .prog-fb-pool-hint {
        padding: 4px 0;
        font-size: 12px;
        line-height: 1.5;
        color: var(--b3-theme-on-surface);
        opacity: 0.6;
    }
    /* □23 tip 限宽折行：内核 ::after 是 white-space:pre 单行，靠左的设置行长 tip 会把
       气泡左缘顶出滚动容器被裁（vision P1）；pre-line 保留 \n 多行（三行制兼容）+ 自动
       折行，420px 上限。width:max-content 必须显式给——pre-line 下 shrink-to-fit 取宿主
       行内框宽（~百 px），气泡会退化成窄塔（vision 终审 P1）；:global 组合选择器——
       b3-tooltips 是全局类，scoped 直写会剪掉 */
    .container :global(.b3-tooltips)::after {
        white-space: pre-line;
        width: max-content;
        max-width: 420px;
    }
</style>
