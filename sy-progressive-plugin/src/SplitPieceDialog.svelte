<script lang="ts">
    import { onDestroy } from "svelte";
    import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
    import { DestroyManager } from "../../sy-tomato-plugin/src/libs/destroyer";
    import { notifyFleetChanged } from "./fleetNotify";
    import { prog } from "./Progressive";
    import { splitPieceAsNew } from "./writeBook";

    interface Props {
        dm: DestroyManager;
        bookID: string;
        pieceDocID: string;
        blockIDs: string[];
    }

    let { dm, bookID, pieceDocID, blockIDs }: Props = $props();
    export function destroy() {
        dm.destroyBy();
    }
    onDestroy(destroy);

    let slotName = $state("");
    let busy = $state(false);
    const canSubmit = $derived(!busy && slotName.trim().length > 0);

    async function process() {
        if (!canSubmit) return;
        busy = true;
        try {
            await splitPieceAsNew(bookID, pieceDocID, blockIDs, slotName);
            destroy();
            notifyFleetChanged(); // 片数+1 → 舰队进度分母即时刷新
            // 拆完视点跟随块进新片（跳到首个被移出的块）
            await prog.jumpTo(blockIDs[0]);
        } catch (e) {
            console.error("SplitPieceDialog process failed", e);
            const dup = String((e as Error)?.message ?? "").includes("name conflict");
            await siyuan.pushMsg(dup ? tomatoI18n.槽名已被使用 : tomatoI18n.拆分失败请重试, 2500);
        } finally {
            busy = false;
        }
    }
</script>

<div class="container">
    <div class="field-label">{tomatoI18n.新槽名}</div>
    <input
        class="b3-text-field"
        type="text"
        bind:value={slotName}
        placeholder={tomatoI18n.新槽名占位}
        aria-label={tomatoI18n.新槽名}
        onkeydown={(e) => { if (e.key === "Enter") void process(); }}
    />
    <div class="field-hint">{tomatoI18n.拆分说明}</div>
    <div class="footer">
        <button class="b3-button primary-btn" disabled={!canSubmit} onclick={process}
            >{busy ? tomatoI18n.拆分中 : tomatoI18n.拆分}</button
        >
        <button class="b3-button b3-button--outline tomato-button" onclick={destroy}>{tomatoI18n.退出}</button>
    </div>
</div>

<style>
    .container {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 12px 14px 0;
    }
    .field-label {
        font-size: 13px;
        font-weight: 500;
        color: var(--b3-theme-on-surface);
    }
    .field-hint {
        font-size: 12px;
        line-height: 1.5;
        color: var(--b3-theme-on-surface);
        opacity: 0.64;
    }
    .footer {
        position: sticky;
        bottom: 0;
        display: flex;
        gap: 10px;
        /* -14px 负 margin 抵掉 container 水平 padding：分隔线贴弹窗两缘贯通（vision P1-1） */
        margin: 0 -14px;
        padding: 10px 14px 12px;
        background-color: var(--b3-theme-surface);
        border-top: 1px solid var(--b3-border-color);
    }
    .primary-btn {
        flex: 1;
        padding: 8px 18px;
        font-weight: 500;
    }
</style>
