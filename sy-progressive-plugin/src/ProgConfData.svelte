<script lang="ts">
    // 渐进设置页域组件（2026-09-03 双栏改造）：自 Settings.svelte 整块搬运，卡片内部一行不动；
    // 本组件=「数据管理」域的卡片（prog-data 位置显示 + 「归拢老数据」命令，低频危险操作收底）。
    // 路径刷新随域挂载触发（单域渲染下切到本域才拉取，天然最新鲜）
    import { onMount } from "svelte";
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
    import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
    import { progStorage } from "./ProgressiveStorage";
    import { consolidateDigests } from "./progData";

    // v5 数据管理：prog-data 位置显示 + 「归拢老数据」命令
    let progDataPath = $state("");
    let consolidateMsg = $state("");

    onMount(() => {
        refreshProgDataPath();
    });

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
        // 期1 □2：归拢终点从 prog-data 根改为其下「摘抄」总夹（先确保总夹存在）
        const hubID = await progStorage.ensureDigestHub();
        if (!hubID) {
            consolidateMsg = tomatoI18n.找不到可用笔记本;
            return;
        }
        const s = await consolidateDigests(rootID, hubID);
        consolidateMsg = tomatoI18n.归拢结果(s.result.moved, s.result.failed, s.cleanedEmptyPieceDirs, s.plan.skippedForeign);
        await refreshProgDataPath();
    }
</script>

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
