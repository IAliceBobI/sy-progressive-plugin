<script lang="ts">
    import { onDestroy } from "svelte";
    import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
    import { DestroyManager } from "../../sy-tomato-plugin/src/libs/destroyer";
    import { notifyFleetChanged } from "./fleetNotify";
    import { appendEmptyPiece } from "./writeBook";

    // 期D 新建空槽（管理页写作书卡「分片设置」折叠区）：先建槽后放素材的路径。
    // SplitPieceDialog 同形态（单字段弹窗+sticky footer）；建片=书尾追加无移位
    interface Props {
        dm: DestroyManager;
        bookID: string;
    }

    let { dm, bookID }: Props = $props();
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
            const name = slotName.trim();
            await appendEmptyPiece(bookID, name);
            destroy();
            notifyFleetChanged(); // 槽数 +1 → 舰队进度分母即时刷新
        } catch (e) {
            console.error("AppendSlotDialog process failed", e);
            const conflict = String((e as Error)?.message ?? "").includes("name conflict");
            await siyuan.pushMsg(conflict ? tomatoI18n.槽名已被使用 : tomatoI18n.新建槽失败请重试, 2500);
        } finally {
            busy = false;
        }
        // 成功侧 toast 放 try 外（reasoning P2-5：建槽已成功+弹窗已关，pushMsg 若抛错
        // 落进 catch 会误报「失败请重试」）
        await siyuan.pushMsg(tomatoI18n.已新建槽(slotName.trim()), 2500).catch(() => { });
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
    <div class="field-hint">{tomatoI18n.新建槽说明}</div>
    <div class="footer">
        <button class="b3-button primary-btn" disabled={!canSubmit} onclick={process}
            >{busy ? tomatoI18n.新建槽中 : tomatoI18n.新建槽}</button
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
