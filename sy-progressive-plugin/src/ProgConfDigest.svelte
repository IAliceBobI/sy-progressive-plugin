<script lang="ts">
    // 渐进设置页域组件（2026-09-03 双栏改造）：自 Settings.svelte 整块搬运，卡片内部一行不动；
    // 2026-09-07 bear 三问拍板 A1 拆域（7→8 域）：本组件收窄为「摘抄」域 5 项，制卡 8 项拆出
    // ProgConfCard.svelte（摘抄制卡模式留摘抄侧=行为参数跟发起管线走）
    import { confirm } from "siyuan";
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
    import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
    import { progStorage } from "./ProgressiveStorage";
    import { consolidateDigests, restoreDigests, findDocByIal, getDocIalDigestHub } from "./progData";
    import {
        digestLanding,
        digestNoBacktraceLink,
        extractAllNoBacktraceLink,
        markOriginTextBG,
        materialCapsuleBorder,
        writingPoolUnderBook,
        revTraceScope,
        digestAddReadingpoint,
        digestGlobalSigle,
    } from "../../sy-tomato-plugin/src/libs/stores";

    // need-0924-02 落点联动：改档即生效（与兄弟 select 同 .set() 语义，面板整体落盘），
    // central↔source 方向切换时二确认「存量摘抄要不要一起搬」（取消=不搬，数据与落点
    // 解耦）；daily/child 无夹概念不联动。放回侧总夹不存在=零存量直接静默（不空建总夹）
    function onLandingChange(e: Event) {
        const v = (e.currentTarget as HTMLSelectElement).value;
        const old = digestLanding.get();
        digestLanding.set(v);
        if (v === old) return;
        if (v === "central") confirm("⚠️", tomatoI18n.落点搬总夹确认, () => void runLinked("central"));
        else if (v === "source") confirm("⚠️", tomatoI18n.落点放回确认, () => void runLinked("source"));
    }

    async function runLinked(dir: "central" | "source") {
        try {
            if (dir === "central") {
                const rootID = await progStorage.ensureProgDataRoot();
                const hubID = await progStorage.ensureDigestHub();
                if (!rootID || !hubID) return;
                const s = await consolidateDigests(rootID, hubID);
                await siyuan.pushMsg(tomatoI18n.归拢结果(s.result.moved, s.result.failed, s.cleanedEmptyPieceDirs, s.plan.skippedForeign), 2500);
                return;
            }
            const hubID = await findDocByIal(getDocIalDigestHub());
            if (!hubID) return;
            const r = await restoreDigests(hubID);
            await siyuan.pushMsg(tomatoI18n.放回结果(r.moved, r.failedNames), 2500);
        } catch {
            // 搬迁失败不影响已生效的落点设置——数据位置仍可走数据管理页两命令手动处理
        }
    }
</script>

<!-- 摘抄（□23：术语型开关全部补 hover tip，语义见 tomatoI18n.tip设置* 家族） -->
<div class="settingBox">
    <div class="section-title">{tomatoI18n.摘抄}</div>

    <div>
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$digestNoBacktraceLink}
        />
        <span class="b3-tooltips b3-tooltips__n" aria-label={tomatoI18n.tip设置摘抄回溯}>{tomatoI18n.摘抄不加入回溯链接}</span>
    </div>

    <!-- need-0926-01 □2 提取全部回链开关：同族第三枚，唯一差异=默认关（=带链接，
         现状行为零迁移）；□3 接线 extractAllNotes 装配 withHref 读它 -->
    <div>
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$extractAllNoBacktraceLink}
        />
        <span class="b3-tooltips b3-tooltips__n" aria-label={tomatoI18n.tip设置提取回溯}>{tomatoI18n.提取全部不加入回溯链接}</span>
    </div>

    <div>
        <!-- 期1 □2 落点三档：digest2dailycard 开关并入（迁移见 index.ts loadStore）；脏值兜底失效占位。
             vision □5：与下行「摘抄制卡模式」select 统一 min-width，右侧标签起始对齐；
             liulfb □1 加 child 档（再摘抄目录树连续，以发起文档为锚）；needs0923-01 砍
             sibling 档（慕渔确认无用，存量 sibling→source 迁移见 index.ts loadStore）；
             need-0924-02 落点联动：bind 改 value+onchange——central/source 方向切换时
             确认后顺带搬存量夹（不搬=落点只管新摘抄） -->
        <select class="b3-select" style="min-width: 160px" value={$digestLanding} onchange={onLandingChange}>
            <option value="central">{tomatoI18n.落点集中归档}</option>
            <option value="source">{tomatoI18n.落点源文档下方}</option>
            <option value="daily">{tomatoI18n.落点卡目录}</option>
            <option value="child">{tomatoI18n.落点子文档}</option>
            {#if !["central", "source", "daily", "child"].includes($digestLanding)}
                <option value={$digestLanding}>{$digestLanding} {tomatoI18n.已失效请重新选择}</option>
            {/if}
        </select>
        <span class="b3-tooltips b3-tooltips__n" aria-label={tomatoI18n.tip摘抄落点}>{tomatoI18n.摘抄落点}</span>
    </div>

    <div>
        <!-- 可见性期4 □4 A：cardMode 全局默认三档（digestGlobalSigle；书 IAL 优先级链不动）。
             飞书帖 1 同修：saveCardMode 死代码=设置入口缺失，此处补正面回答 -->
        <select class="b3-select" style="min-width: 160px" bind:value={$digestGlobalSigle}>
            <option value="0">{tomatoI18n.制卡不入卡}</option>
            <option value="1">{tomatoI18n.制卡只留最新}</option>
            <option value="2">{tomatoI18n.制卡每摘皆卡}</option>
            {#if !["0", "1", "2"].includes($digestGlobalSigle)}
                <option value={$digestGlobalSigle}>{$digestGlobalSigle} {tomatoI18n.已失效请重新选择}</option>
            {/if}
        </select>
        <span class="b3-tooltips b3-tooltips__n" aria-label={tomatoI18n.tip设置制卡模式}>{tomatoI18n.摘抄制卡模式}</span>
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
        <!-- revtrace-scope 生效范围三档（旧 revTraceEnabled 布尔开关退役为迁移读源）：
             off=关/prog=仅渐进文档（isProgDoc 判定）/all=全部文档（原行为）；迁移见 index.ts
             loadStore。vision 对齐：与上方两 select 统一 min-width，右侧标签起始对齐 -->
        <select class="b3-select" style="min-width: 160px" bind:value={$revTraceScope}>
            <option value="off">{tomatoI18n.修订范围关}</option>
            <option value="prog">{tomatoI18n.修订范围仅渐进}</option>
            <option value="all">{tomatoI18n.修订范围全部}</option>
            {#if !["off", "prog", "all"].includes($revTraceScope)}
                <option value={$revTraceScope}>{$revTraceScope} {tomatoI18n.已失效请重新选择}</option>
            {/if}
        </select>
        <span class="b3-tooltips b3-tooltips__n" aria-label={tomatoI18n.tip设置修订痕迹}>{tomatoI18n.修订痕迹色条}</span>
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
        <!-- matfeed □3 入槽胶囊边框：写作书槽内素材胶囊（row 超级块）默认无边框看不出
             边界，默认开细边框（body 类总闸实时生效，markOriginTextBG 同款） -->
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$materialCapsuleBorder}
        />
        <span class="b3-tooltips b3-tooltips__n" aria-label={tomatoI18n.tip设置胶囊边框}>{tomatoI18n.入槽素材胶囊显示边框}</span>
    </div>

    <div>
        <!-- matfeed □4 写作书素材池位置：只决定新建夹落点（书下=槽+素材一棵树 / 摘抄
             总夹），已有夹位置无关不受影响——存量夹显式搬走管理界面搬迁钮 -->
        <input
            type="checkbox"
            class="b3-switch"
            bind:checked={$writingPoolUnderBook}
        />
        <span class="b3-tooltips b3-tooltips__n" aria-label={tomatoI18n.tip写作书素材池挂书下}>{tomatoI18n.写作书素材池挂书下}</span>
    </div>
</div>
