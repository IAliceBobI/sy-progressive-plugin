<script lang="ts">
    // 渐进设置页域组件（2026-09-03 双栏改造）：自 Settings.svelte 整块搬运，卡片内部一行不动；
    // 本组件=「菜单入口」域的卡片
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
    import HotkeyCap from "../../sy-tomato-plugin/src/HotkeyCap.svelte";
    import {
        piecesmenu,
        digestmenu,
        cardContextMenu,
        blockIconMenu,
        wholeDigestMenu,
        reviewSchedMenu,
        revisitRhythmMenu,
        ProgressiveStart2learn,
        ProgressiveJumpMenu,
        mobileSelectBtns,
    } from "../../sy-tomato-plugin/src/libs/stores";
    import { digest渐进阅读摘抄模式 } from "./DigestProgressiveBox";
    import { flashBox制卡 } from "./FlashBox";
    import {
        Progressive添加当前文档到渐进阅读分片模式,
        Progressive跳到分片或回到原文,
        Progressive开始学习,
    } from "./Progressive";
</script>

<!-- 菜单入口（v5 □7：右键显隐开关 20→4——制卡/收集/提取族收进浮条 [+] 高级功能，随开关退役。
     □11 标题宽化：区内还有块图标菜单（左键点块前小圆点）与移动端菜单，非全是右键，各条目自说明入口类型） -->
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
    </div>
    <!-- □3 右键制卡（2026-09-07 bear 拍板，默认关）：任意文档右键块可制卡，快捷键通道本就全局 -->
    <div>
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$cardContextMenu}
        />
        {tomatoI18n.menu添加右键菜单}:
        {flashBox制卡.langText()}<HotkeyCap hk={flashBox制卡} pluginName="sy-progressive-plugin"></HotkeyCap>
    </div>

    <!-- 可见性期4 □4 B②：右键菜单四项各自开关（整篇摘抄从 digestmenu 一拖二拆出） -->
    <div>
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$wholeDigestMenu}
        />
        {tomatoI18n.menu添加右键菜单}:
        {tomatoI18n.menu整篇摘抄}
    </div>
    <div>
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$reviewSchedMenu}
        />
        {tomatoI18n.menu添加右键菜单}:
        {tomatoI18n.menu重访调度}
    </div>
    <div>
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$revisitRhythmMenu}
        />
        {tomatoI18n.menu添加右键菜单}:
        {tomatoI18n.menu复访节奏}
    </div>

    <div>
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$ProgressiveJumpMenu}
        />
        {tomatoI18n.menu添加右键菜单}:
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

    <!-- □8期4 移动端选块三钮（2026-09-09 发版前 P1 拍板补）：编辑器顶栏 breadcrumb 行的
         向上/向下/取消；关=新开的编辑器不再挂（已挂的随切文档/刷新退场） -->
    <div>
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$mobileSelectBtns}
        />
        {tomatoI18n.移动端选块按钮}
    </div>
</div>
