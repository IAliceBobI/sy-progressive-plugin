<script lang="ts">
    // 渐进设置域标题帮助直达（tomato ConfHelpIcon 同款形态，help.json 换本插件自家
    // 快照——PjConfHelpIcon 先例；此前 9 处渐进入口误用 tomato ConfHelpIcon，token 是
    // 渐进的、快照却查 tomato 的，弹窗恒落空恒回落 window.open 外链，2026-10-22 修复）：
    // iconHelp 小图标 + 内核 b3-tooltips 自绘气泡（勿用原生 title），点击 openHelpDialog
    // 插件内弹窗秒开分篇快照（无快照回落飞书）。渐进侧新帮助入口一律用本组件，勿再引
    // tomato ConfHelpIcon（其缺省快照源是 tomato 的）。
    import helpDocs from "./help.json";
    import { openHelpDialog } from "../../sy-tomato-plugin/src/libs/helpDialog";
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";

    let { token }: { token: string } = $props();
    // token 是一次性 props（挂载时分篇文档 id 定死不响应变化），模板字符串取初始值是故意的
    // svelte-ignore state_referenced_locally
    const url = `https://my.feishu.cn/docx/${token}?from=from_copylink`;
    const open = () => openHelpDialog(url, helpDocs);
</script>

<span
    class="b3-tooltips b3-tooltips__n conf-help-icon"
    aria-label={tomatoI18n.帮助}
    role="button"
    tabindex="0"
    onclick={open}
    onkeydown={(e: KeyboardEvent) => e.key === "Enter" && open()}
>
    <svg aria-hidden="true"><use xlink:href="#iconHelp"></use></svg>
</span>

<style>
    .conf-help-icon {
        display: inline-flex;
        align-items: center;
        margin-left: 6px;
        cursor: pointer;
        color: var(--b3-theme-on-surface-light, var(--b3-theme-on-surface));
    }
    .conf-help-icon:hover {
        color: var(--b3-theme-primary);
    }
    .conf-help-icon svg {
        width: 14px;
        height: 14px;
    }
</style>
