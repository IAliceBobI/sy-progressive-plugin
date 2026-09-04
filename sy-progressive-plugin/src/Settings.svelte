<script lang="ts">
    import { DestroyManager } from "../../sy-tomato-plugin/src/libs/destroyer";
    import { onDestroy, onMount, tick } from "svelte";
    import { BaseTomatoPlugin } from "../../sy-tomato-plugin/src/libs/BaseTomatoPlugin";
    import { STORAGE_Prog_SETTINGS } from "../../sy-tomato-plugin/src/constants";
    // 番茄工具箱设置页同款卡片体系+导航双栏壳（IndexConf.css 的 .tomato-settings-nav 作用域），
    // 根节点挂 .tomato-settings-dialog 类启用；样式按该类作用域限定，不会泄漏（2026-08-24 对齐
    // 改造；2026-09-03 双栏改造复刻番茄终态架构：左导航 7 域+右侧单域渲染+搜索聚合视图）
    import "../../sy-tomato-plugin/src/IndexConf.css";
    import { floatbarMainBtns } from "../../sy-tomato-plugin/src/libs/stores";
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
    import UpgradeBar from "../../sy-tomato-plugin/src/UpgradeBar.svelte";
    import { saveRestorePagePosition } from "../../sy-tomato-plugin/src/libs/utils";
    import { searchSettings } from "../../sy-tomato-plugin/src/libs/ui";
    import { lastVerifyResult } from "../../sy-tomato-plugin/src/libs/user";
    import ProgConfDigest from "./ProgConfDigest.svelte";
    import ProgConfFloatbar from "./ProgConfFloatbar.svelte";
    import ProgConfSkins from "./ProgConfSkins.svelte";
    import ProgConfBasic from "./ProgConfBasic.svelte";
    import ProgConfMenus from "./ProgConfMenus.svelte";
    import ProgConfHotkeys from "./ProgConfHotkeys.svelte";
    import ProgConfData from "./ProgConfData.svelte";

    export function destroy() {
        dm.destroyBy("2");
        localStorage.setItem(SearchKeyItemKey, searchKey);
        localStorage.setItem(NavKeyItemKey, navActive);
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
    // 就位不闪，随后 UpgradeBar onMount verify 经 bind:codeValid 回写纠正；皮肤域
    // 货架锁同吃此值（经 prop 下传 ProgConfSkins）
    let codeValid = $state(lastVerifyResult() === true);
    // □3：header Pro 徽标随激活态显隐（懒缓存未命中时 UpgradeBar onMount verify 回写纠正）
    $effect(() => {
        if (proBadge) proBadge.style.display = codeValid ? "" : "none";
    });
    const SearchKeyItemKey =
        "progressive_settings_SearchKeyItemKey_RfrUm9VLS4GehTzg5ygRrNT";

    // 导航 7 域（2026-09-03 双栏改造：1:1 照搬原单栏 7 段，零迁移零重划；顺序按番茄
    // 「本体→招牌→通用→入口→兜底」哲学，核心功能摘抄与制卡打头）；label 惰性取值
    // （tomatoI18n 依 window 语言动态切，模板每次渲染现取，勿在模块顶层快照）
    const NAV_DOMAINS: Array<{ id: string; label: () => string }> = [
        { id: "digest", label: () => tomatoI18n.摘抄与制卡 },
        { id: "floatbar", label: () => tomatoI18n.浮条 },
        { id: "skins", label: () => tomatoI18n.皮肤外观 },
        { id: "basic", label: () => tomatoI18n.基础设置 },
        { id: "menus", label: () => tomatoI18n.菜单入口 },
        { id: "hotkeys", label: () => tomatoI18n.快捷键 },
        { id: "data", label: () => tomatoI18n.数据管理 },
    ];
    let navActive = $state("digest");
    const NavKeyItemKey = "progressive_settings_NavKeyItemKey_Kw9VtQeXr4TnZb7hLsYdA2g";
    // 聚合视图：searchKey 非空=全 7 域聚合渲染，navActive 冻结待清空回位；
    // navHits=各域是否有命中卡（searchSettings 过滤后从 DOM 回读），驱动导航项高亮
    let navHits: Record<string, boolean> = $state({});
    // 输入沿聚合视图进出跳变跟踪（非响应式：只用于进/出沿触发滚顶，逐键过滤不触发）
    let searching = false;

    // □14c 快照防覆盖状态由壳持有（2026-09-03 双栏改造提升）：单域渲染下切走浮条域即
    // 卸载其组件，域内局部快照会丢——快照+dirty 提升到壳，经 bindable 供浮条域读写，
    // save 时统一回写 store（面板开着时浮条拖拽 commit 的新序不被旧快照回滚）
    let pieceMainBtns: string[] = $state([...floatbarMainBtns.get()]);
    let pieceMainBtnsDirty = $state(false);

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
            // 持久化搜索词非空=直接进聚合视图（onDestroy 冻存的搜索态原样恢复）
            searchKey = savedSearchKey;
            searching = true;
            await tick();
            if (settingsDiv) {
                searchSettings(settingsDiv, searchKey);
                updateNavHits();
            }
        }
        // 导航位置记忆：恢复上次分区（首开无存储落「摘抄与制卡」默认）。单域渲染无长滚动，
        // 纯状态切换即可
        const savedNav = localStorage.getItem(NavKeyItemKey);
        if (savedNav && NAV_DOMAINS.some((d) => d.id === savedNav)) {
            navActive = savedNav;
        }
        searchInput.focus();
    });

    function navGo(id: string) {
        // 搜索态点导航=退出聚合视图清搜索跳该域（「搜索全库找、浏览按域翻」的跳转出口）
        if (searchKey) {
            searchKey = "";
            navHits = {};
            searching = false;
            localStorage.setItem(SearchKeyItemKey, "");
            scrollPanelTop();
        }
        navActive = id;
        localStorage.setItem(NavKeyItemKey, id);
    }

    // 过滤完成后从 DOM 回读各域命中态（section 内有任一可见 settingBox 即命中）——
    // searchSettings 是纯 DOM 过滤不含此语义，必须在它之后取
    function updateNavHits() {
        const hits: Record<string, boolean> = {};
        settingsDiv?.querySelectorAll("section.conf-group[data-domain]").forEach((sec) => {
            const el = sec as HTMLElement;
            const id = el.dataset.domain;
            if (!id) return;
            hits[id] = [...el.querySelectorAll(".settingBox")].some(
                (b) => (b as HTMLElement).style.display !== "none",
            );
        });
        navHits = hits;
    }

    // 进/出聚合视图时面板滚回顶部（真滚动容器 .b3-dialog__body；逐键输入不触发——
    // 用户在聚合结果里翻看时续输字符不能拽回顶部）
    function scrollPanelTop() {
        (settingsDiv?.closest(".b3-dialog__body") as HTMLElement | null)?.scrollTo({ top: 0 });
    }

    async function save() {
        dm.destroyBy();
        if (pieceMainBtnsDirty) {
            floatbarMainBtns.set([...pieceMainBtns]);
        }
        await plugin.saveData(STORAGE_Prog_SETTINGS, plugin.settingCfg);
        window.location.reload();
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
            oninput={async () => {
                localStorage.setItem(SearchKeyItemKey, searchKey);
                const entering = !!searchKey && !searching;
                const leaving = !searchKey && searching;
                searching = !!searchKey;
                // 空→非空跳变须等聚合视图挂载再过滤（同分支跳变 tick 只是空冲刷）
                await tick();
                searchSettings(settingsDiv, searchKey);
                if (searchKey) updateNavHits();
                else navHits = {};
                if (entering || leaving) scrollPanelTop();
            }}
        />
    </div>

    <!-- 双栏：左 7 域导航 + 右内容区（浏览态单域渲染 / 搜索态「全部」聚合视图）。
         data-search= searchSettings 候选跳过（容器 textContent 含全库设置文案，不跳则恒命中
         无意义）；样式挂 .tomato-settings-nav 作用域（IndexConf.css）。搜索态导航命中域
         高亮，点击即清搜索跳该域（复刻番茄终态交互） -->
    <div class="tomato-settings-nav" data-search>
        <nav class="tomato-nav-list">
            {#each NAV_DOMAINS as d (d.id)}
                <button
                    class="tomato-nav-item"
                    class:tomato-nav-item--active={navActive === d.id && !searchKey}
                    class:tomato-nav-item--hit={!!searchKey && navHits[d.id]}
                    onclick={() => navGo(d.id)}
                >{d.label()}</button>
            {/each}
        </nav>
        <div class="tomato-nav-content">
            <!-- 7 域组件渲染抽出 snippet 供浏览/聚合两分支复用；浮条域快照经 bindable
                 双向、皮肤域吃 codeValid 激活态，其余域纯 store 绑定零 props -->
            {#snippet domainCards(id: string)}
                {#if id === "digest"}
                    <ProgConfDigest></ProgConfDigest>
                {:else if id === "floatbar"}
                    <ProgConfFloatbar bind:pieceMainBtns bind:pieceMainBtnsDirty></ProgConfFloatbar>
                {:else if id === "skins"}
                    <ProgConfSkins {plugin} {codeValid}></ProgConfSkins>
                {:else if id === "basic"}
                    <ProgConfBasic></ProgConfBasic>
                {:else if id === "menus"}
                    <ProgConfMenus></ProgConfMenus>
                {:else if id === "hotkeys"}
                    <ProgConfHotkeys></ProgConfHotkeys>
                {:else}
                    <ProgConfData></ProgConfData>
                {/if}
            {/snippet}
            {#if searchKey}
                <!-- 聚合视图：全 7 域同屏+域标题行做域界标，data-domain 供 updateNavHits
                     回读命中态；searchSettings 深收按域过滤、空域整节隐藏 -->
                {#each NAV_DOMAINS as d (d.id)}
                    <section class="conf-group" data-domain={d.id}>
                        <div class="tomato-agg-title">{d.label()}</div>
                        {@render domainCards(d.id)}
                    </section>
                {/each}
            {:else}
                {#each NAV_DOMAINS as d (d.id)}
                    {#if navActive === d.id}
                        <section class="conf-group" data-domain={d.id}>
                            {@render domainCards(d.id)}
                        </section>
                    {/if}
                {/each}
            {/if}
        </div>
    </div>

    <!-- save（□3）：52px sticky footer 收底，主色「保存并关闭」 -->
    <div class="settings-footer">
        <button class="b3-button tomato-save-btn" onclick={save}>{tomatoI18n.保存并关闭}</button>
    </div>
</div>

<style>
    /* 仅保留渐进特有壳样式；search-bar/settingBox/kbd/conf-group/tomato-settings-nav 等
       通用与双栏样式全部来自 IndexConf.css（.tomato-settings-dialog 作用域），勿在此重复 */
    .container {
        margin: 2px;
        flex: auto;
        display: flex;
        flex-direction: column;
    }
    /* □23 tip 限宽折行：内核 ::after 是 white-space:pre 单行，靠左的设置行长 tip 会把
       气泡左缘顶出滚动容器被裁（vision P1）；pre-line 保留 \n 多行（三行制兼容）+ 自动
       折行，420px 上限。width:max-content 必须显式给——pre-line 下 shrink-to-fit 取宿主
       行内框宽（~百 px），气泡会退化成窄塔（vision 终审 P1）；:global 组合选择器——
       b3-tooltips 是全局类，scoped 直写会剪掉。锚定壳的 .container，各域子组件内的
       tooltip 同为后代可命中 */
    .container :global(.b3-tooltips)::after {
        white-space: pre-line;
        width: max-content;
        max-width: 420px;
    }
    /* 聚合态抑制与 .tomato-agg-title 逐字重复的域组件首标题（vision P1：界标+卡内
       同名标题上下两行，6/7 域逐字重复）；浏览态无 .tomato-agg-title 节点自然不命中，
       域标题保留。快捷键域首标题是「如有冲突请调整」提示文案非域名，聚合态保留 */
    .container :global(.tomato-agg-title + .settingBox > .section-title:first-child) {
        display: none;
    }
    .container
        :global(section[data-domain='hotkeys'] .tomato-agg-title + .settingBox > .section-title:first-child) {
        display: block;
    }
</style>
