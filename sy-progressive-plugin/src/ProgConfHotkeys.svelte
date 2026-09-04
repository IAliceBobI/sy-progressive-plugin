<script lang="ts">
    // 渐进设置页域组件（2026-09-03 双栏改造）：自 Settings.svelte 整块搬运，卡片内部一行不动；
    // 壳（Settings.svelte）负责导航双栏/单域渲染/搜索聚合，本组件只是「快捷键」域的卡片
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
    import HotkeyCap from "../../sy-tomato-plugin/src/HotkeyCap.svelte";
    import {
        digest执行摘抄,
        digest执行摘抄并断句,
        digest执行摘抄留档,
        digest执行摘抄背诵,
    } from "./DigestProgressiveBox";
    import {
        Progressive开始随机学习,
        Progressive上一页,
        Progressive下一页,
        progSettingsOpenHK,
    } from "./Progressive";
</script>

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
    <!-- 2026-09-02 用户反馈：留档/背诵去向独立成命令（去向级 cardMode 覆盖，不跟书设置漂移） -->
    <div>
        {digest执行摘抄留档.icon}
        {digest执行摘抄留档.langText()}<HotkeyCap hk={digest执行摘抄留档} pluginName="sy-progressive-plugin"></HotkeyCap>
    </div>
    <div>
        {digest执行摘抄背诵.icon}
        {digest执行摘抄背诵.langText()}<HotkeyCap hk={digest执行摘抄背诵} pluginName="sy-progressive-plugin"></HotkeyCap>
    </div>
</div>
