<script lang="ts">
    // □3 批注创建输入弹窗（新链路，替代旧 CommentInput 的产物链）：
    // 纯文本输入 → onSave(text) 由 Annotations 编排（写属性+写标记+失败铁律）；
    // onSave 返回 false = 写失败 → 弹窗不关、输入保留（铁律）。
    import { DestroyManager } from "./libs/destroyer";
    import { commentBoxAddFlashCard } from "./libs/stores";
    import { siyuan } from "./libs/utils";
    import { onDestroy, onMount } from "svelte";
    import { tomatoI18n } from "./tomatoI18n";

    interface Props {
        dm: DestroyManager;
        onSave: (text: string) => Promise<boolean>;
        /** 选区级批注：被标记的原文快照（上下文展示，不参与保存） */
        selText: string;
        /** 块级批注：覆盖的顶层块数 */
        blockCount: number;
    }
    let { dm, onSave, selText, blockCount }: Props = $props();

    let text = $state("");
    let field: HTMLTextAreaElement = $state();
    let saving = $state(false);

    onMount(() => field?.focus());
    onDestroy(() => dm.destroyBy(null));

    export function destroy() {
        dm.destroyBy(null); // 全量销毁：dialog 与 svelte 两条清理都执行（reasoning P2-2，□4 草稿清理将挂 onDestroy）
    }

    async function save() {
        if (saving) return;
        if (text.trim().length === 0) {
            siyuan.pushMsg(tomatoI18n.批注内容为空);
            return;
        }
        saving = true;
        try {
            if (await onSave(text)) destroy();
        } catch (e) {
            // 写失败铁律兜底：异常路径同样 toast+不关弹窗+输入保留
            console.error("[tomato anno] save failed:", e);
            siyuan.pushMsg(tomatoI18n.批注写入失败);
        } finally {
            saving = false;
        }
    }
</script>

<div class="container">
    {#if selText}
        <div class="anno-sel-quote">{selText}</div>
    {:else if blockCount > 0}
        <div class="anno-sel-quote">{tomatoI18n.块级}&thinsp;· {blockCount}&thinsp;{tomatoI18n.个块}</div>
    {/if}
    <textarea
        bind:this={field}
        spellcheck="false"
        class="b3-text-field box"
        placeholder={tomatoI18n.输入批注}
        bind:value={text}
        onkeydown={(event) => {
            if (event instanceof KeyboardEvent && event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.isComposing) {
                event.preventDefault();
                save();
            }
        }}
    ></textarea>
    <div class="row">
        <label class="box">
            <input
                type="checkbox"
                class="b3-switch"
                bind:checked={$commentBoxAddFlashCard}
                onchange={() => commentBoxAddFlashCard.write()}
            />
            {tomatoI18n.闪卡}
        </label>
        <span class="fn__flex-1"></span>
        <button class="b3-button b3-button--cancel box" onclick={destroy}>{tomatoI18n.取消}</button>
        <button class="b3-button b3-button--text box" disabled={saving} onclick={save}>
            {tomatoI18n.保存} (⌘↵)
        </button>
    </div>
</div>

<style>
    .container {
        display: flex;
        flex-direction: column;
    }
    .anno-sel-quote {
        max-height: 3.2em;
        overflow: hidden;
        font-size: 12px;
        line-height: 1.6;
        color: var(--b3-theme-on-surface-light, #999);
        border-left: 2px solid var(--b3-border-color);
        padding: 2px 8px;
        margin: 4px 0;
        white-space: pre-line;
    }
    textarea {
        width: auto;
        min-width: 320px;
        min-height: 140px;
        line-height: 1.8;
        resize: vertical;
    }
    .row {
        display: flex;
        align-items: center;
    }
    .box {
        padding: 4px 8px;
        margin: 4px 2px;
    }
</style>
