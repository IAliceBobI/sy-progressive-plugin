<script lang="ts">
    // AI 助手域（agentrev □2，bear ①「独立出来，不放到功能仓库」）：Agent 相关设置独立成域
    // ——面板总开关+轮数上限+人审两开关（bear ②「短链最多 4 轮可以配置」「受控必须人审核可以
    // 配置」）+ AIBox 卡（bear：轻量改写工具留用，翻新=□3）+ 知识库通道卡（knowledgebox □3：
    // 智谱 BigModel 首发凭证+连通性测试+容量+费率；coze 区已下架——□2 拍板，代码层同批退役）。
    // □4□5 领域知识/Skill/提示词管理卡落位本域。
    import {
        aiBoxCheckbox,
        aiBoxMenuShow,
        aiPanelCheckbox,
        agentMaxTurns,
        agentReviewEdit,
        agentReviewRunJs,
        agentKnowledgeDocs,
        agentSkillDocs,
        agentHistoryMsgs,
        agentDocSnapshotLimit,
        zhipuApiKey,
        zhipuKbName,
    } from "./libs/stores";
    import { AIBoxHotkey } from "./AIBox";
    import { tomatoI18n } from "./tomatoI18n";
    import { createDefaultChannel } from "./libs/knowledgeChannel";
    import HotkeyCap from "./HotkeyCap.svelte";
    import ConfHelpIcon from "./ConfHelpIcon.svelte";
    import AgentDocList from "./AgentDocList.svelte";
    import AgentPromptList from "./AgentPromptList.svelte";

    let testing = $state(false);
    let testResult = $state("");
    let testOk = $state(false);

    // 测试前显式落盘（bind 只写内存，搭车落盘不等靠）：Key 粘贴完直接点测试的场景重启不丢
    async function onTest() {
        if (testing) return;
        testing = true;
        testResult = "";
        try {
            await zhipuApiKey.write();
            await zhipuKbName.write();
            const r = await createDefaultChannel().test();
            testOk = r.ok;
            testResult = r.message;
        } catch (e: any) {
            testOk = false;
            testResult = e?.message ?? String(e);
        } finally {
            testing = false;
        }
    }
</script>

<!-- AI 助手面板总开关（迁自功能仓库；快捷键=dock 键位 ⌥⌘H 可改）+ 轮数/人审配置跟开关走 -->
<div class="settingBox">
    <div class="section-title">
        <input type="checkbox" class="b3-switch" bind:checked={$aiPanelCheckbox} />
        {tomatoI18n.AI助手}
    </div>
    {#if $aiPanelCheckbox}
        <div>{tomatoI18n.AI面板说明}</div>
        <div>{tomatoI18n.评分引导}</div>
        <div>
            <input class="b3-text-field" type="number" min="1" max="30" style="min-width: 64px" bind:value={$agentMaxTurns} />
            {tomatoI18n.AI轮数上限}
        </div>
        <div>
            <input class="b3-text-field" type="number" min="2" max="40" style="min-width: 64px" bind:value={$agentHistoryMsgs} />
            {tomatoI18n.AI历史对话条数}
        </div>
        <div>
            <input class="b3-text-field" type="number" min="2000" max="50000" style="min-width: 64px" bind:value={$agentDocSnapshotLimit} />
            {tomatoI18n.AI文档快照长度}
        </div>
        <div>{tomatoI18n.AI人审说明}</div>
        <div>
            <input type="checkbox" class="b3-switch" bind:checked={$agentReviewEdit} />
            {tomatoI18n.AI改文档前问我}
        </div>
        <div>
            <input type="checkbox" class="b3-switch" bind:checked={$agentReviewRunJs} />
            {tomatoI18n.AI执行代码前问我}
        </div>
    {/if}
</div>
<!-- agentrev □4 领域知识+Skill 管理卡（bear ③④，□1 拍板：领域知识=直接披露全文常驻/Skill=渐进
     披露只注简介；跟面板开关走——面板关闭时上下文无消费方，卡不显示） -->
{#if $aiPanelCheckbox}
    <div class="settingBox">
        <div class="section-title">{tomatoI18n.领域知识}</div>
        <div>{tomatoI18n.领域知识说明}</div>
        <AgentDocList store={agentKnowledgeDocs} />
    </div>
    <div class="settingBox">
        <div class="section-title">Skill</div>
        <div>{tomatoI18n.Skill说明}</div>
        <AgentDocList store={agentSkillDocs} />
    </div>
    <!-- agentrev □5 提示词卡（bear ⑤「提示词其实就是 command，不进上下文」）：存仓库文档
         agent-prompt 块，每条注册命令「AI助手·名称」点名触发，零常驻 -->
    <div class="settingBox">
        <div class="section-title">{tomatoI18n.提示词}</div>
        <div>{tomatoI18n.提示词说明}</div>
        <AgentPromptList />
    </div>
{/if}
<!-- 人工智能 AIBox（迁自功能仓库；bear：轻量对话+结果插回内容的简单小工具，留用待翻新 □3） -->
<div class="settingBox">
    <div class="section-title">
        <input type="checkbox" class="b3-switch" bind:checked={$aiBoxCheckbox} />
        {AIBoxHotkey.langText()}<HotkeyCap hk={AIBoxHotkey} pluginName="sy-tomato-plugin"></HotkeyCap>
        <ConfHelpIcon token="Kbuvd9lbhoDWTCxggz9cxQgJnAH" />
    </div>
    {#if $aiBoxCheckbox}
        <div>{tomatoI18n.menu不显示菜单不影响快捷键的使用}</div>
        <div>
            <input type="checkbox" class="b3-switch" bind:checked={$aiBoxMenuShow} />
            {tomatoI18n.menu添加右键菜单}
        </div>
    {/if}
</div>
<!-- 知识库通道（knowledgebox □3，原 coze 折叠区下架后落位）：配置面少而清晰（bear 深夜拍板
     「MCP 一句话配置」铺路=Key 一项+可选库名）；不做注册引导、不引导用户去外部注册——用户
     自己有 Key 直接填；费率透明=卡内说明+「查规则」信息链接（非注册引导） -->
<div class="settingBox">
    <div class="section-title">{tomatoI18n.知识库通道}</div>
    <div>{tomatoI18n.知识库通道说明}</div>
    <div>
        <input class="b3-text-field" style="width: 100%" type="password" placeholder="{tomatoI18n.APIKey}"
            bind:value={$zhipuApiKey} spellcheck="false" autocomplete="off" />
    </div>
    <div>
        <input class="b3-text-field" style="width: 100%" placeholder="{tomatoI18n.库名可选提示}"
            bind:value={$zhipuKbName} spellcheck="false" />
    </div>
    <div class="fn__flex" style="align-items: center; gap: 8px; flex-wrap: wrap">
        <button class="b3-button b3-button--small" disabled={testing} onclick={onTest}>{tomatoI18n.连通性测试}</button>
        {#if testing}
            <span class="kb-test-result">{tomatoI18n.测试中}</span>
        {:else if testResult}
            <span class="kb-test-result" class:kb-test-ok={testOk} class:kb-test-fail={!testOk}>{testResult}</span>
        {/if}
    </div>
    <div>
        {tomatoI18n.知识库费率说明}
        <a class="kb-price-link" href="https://docs.bigmodel.cn/cn/guide/tools/knowledge/price" target="_blank">{tomatoI18n.查看平台计费规则}</a>
    </div>
</div>

<style>
    .kb-test-result { font-size: 12px; color: var(--b3-theme-on-surface-light); word-break: break-all; }
    /* 链接不跨行断裂（vision P1-5：折成两半不可辨识） */
    .kb-price-link { white-space: nowrap; }
    /* 成功结果 12px 小字：亮色 primary 3.7:1 压线，加深一档（暗色原值对比充足不动） */
    .kb-test-ok { color: var(--b3-theme-primary); }
    :global(html[data-theme-mode="light"]) .kb-test-ok { color: color-mix(in srgb, var(--b3-theme-primary) 85%, black); }
    .kb-test-fail { color: var(--b3-theme-error); }
</style>
