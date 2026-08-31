<script lang="ts">
    // □4 批注编辑弹窗：内嵌 Protyle 完整富文本草稿编辑器（草稿块机制，mini-spec「编辑」节）。
    // 链路：开弹窗=建独立草稿块（annoDraft）→ createProtyle 挂载 → Ctrl/Cmd+Enter 保存
    // （草稿 kramdown 剥壳 → onSave 由 Annotations 编排写属性）→ 关闭即删草稿（拍板：即用即删+重开回填）。
    // onSave 返回 false = 写失败 → 弹窗不关、草稿保留（写失败铁律，同 AnnoInput）。
    // □8：编辑器下方「问 AI」工具行 + AnnoChat 对话区（上下分区拍板；视觉稿
    // docs/tomato-annochat-visual-spec.md §7.1——展开编辑器 60vh→32vh、移动端全屏接管）。
    import { onDestroy, onMount } from "svelte";
    import { confirm } from "siyuan";
    import { createProtyle } from "./libs/bkUtils";
    import { DestroyManager } from "./libs/destroyer";
    import { deleteDraftBlock, newDraftBlock, readDraftText } from "./libs/annoDraft";
    import { getAIConfig } from "./libs/openAI";
    import { events } from "./libs/Events";
    import { getTomatoPluginInstance, siyuan } from "./libs/utils";
    import { tomatoI18n } from "./tomatoI18n";
    import AnnoChat from "./AnnoChat.svelte";

    interface Props {
        dm: DestroyManager;
        /** 批注条目 id（AI 对话缓存 key；Annotations.openEdit 传入） */
        annoId: string;
        /** 被批注块原文（AI 讨论上下文；剥 IAL 尾行+本条标记链接后的 kramdown） */
        source: string;
        /** 选区级批注的原文快照（上下文展示，不参与保存） */
        selText: string;
        /** 当前批注正文（kramdown），回填草稿块=重开续写 */
        initialText: string;
        /** 气泡「问 AI」入口：挂载后自动展开讨论区（AI 未配置仍走 confirm 引导，□3） */
        autoChat?: boolean;
        /** AI 讨论上下文补强（□3）：文档 hpath + 前后相邻块（空=缺省不出段） */
        docTitle?: string;
        prev?: string;
        next?: string;
        onSave: (text: string) => Promise<boolean>;
    }
    let { dm, annoId, source, selText, initialText, autoChat = false, docTitle = "", prev = "", next = "", onSave }: Props = $props();

    let root: HTMLDivElement | undefined = $state();
    let editor: HTMLDivElement | undefined = $state();
    let loading = $state(true);
    let saving = $state(false);
    let draftID = "";
    /** 可变盒子：草稿清理钩须在 await 之前挂（reasoning P2-2——loading 窗口内关闭弹窗时
     *  dm 已销毁，晚挂的钩永不执行=草稿孤儿；钩读盒子取「挂靠时刻之后才写入」的 id） */
    const draftRef = { id: "" };
    let pob: ReturnType<typeof createProtyle> | null = null;

    // □8 AI 讨论区状态（AnnoChat 常驻挂载，收起仅隐藏——spec §0 收起语义）
    let chatOpen = $state(false);
    let annoChatRef: AnnoChat | undefined = $state();
    let canCompress = $state(false);
    let chatBusy = $state(false);

    onMount(async () => {
        // Ctrl/Cmd+Enter 捕获在 protyle 之前（protyle 在 wysiwyg 上 bubble 处理键盘）
        root?.addEventListener("keydown", onKeydown, true);
        dm.add("draft", () => {
            closeEditor();
            if (draftRef.id) void deleteDraftBlock(draftRef.id);
        });
        const id = await newDraftBlock(initialText);
        if (dm.destroyed) {
            // loading 窗口内弹窗已被关闭：onMount 继续跑，就地补删草稿、不再挂 DOM（reasoning P2-2）
            if (id) void deleteDraftBlock(id);
            return;
        }
        draftID = id;
        draftRef.id = id;
        if (!draftID || !editor) {
            siyuan.pushMsg(tomatoI18n.批注加载失败);
            destroy();
            return;
        }
        pob = createProtyle(draftID, getTomatoPluginInstance());
        editor.appendChild(pob.p.protyle.element);
        // 尽力聚焦：合成 click 触发 protyle 聚焦链路；失败不阻塞（用户手点）
        pob.p.protyle.element.querySelector('[contenteditable="true"]')?.dispatchEvent(
            new MouseEvent("click", { bubbles: true }),
        );
        loading = false;
        // □3 气泡「问 AI」入口：编辑器就绪后自动展开讨论区（草稿建好再展，视觉一次到位；
        // AI 未配置时 toggleChat 内部走 confirm 引导不展开）
        if (autoChat) void toggleChat();
    });

    onDestroy(() => {
        root?.removeEventListener("keydown", onKeydown, true);
        closeEditor();
        dm.destroyBy(null); // 全量销毁：dialog 与 draft 两条清理都执行
    });

    function closeEditor() {
        if (!pob) return;
        pob.ob?.disconnect();
        pob.p?.destroy();
        pob = null;
    }

    function onKeydown(ev: KeyboardEvent) {
        if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey) && !ev.isComposing) {
            ev.preventDefault();
            ev.stopPropagation();
            save();
        }
    }

    export async function destroy() {
        dm.destroyBy(null);
    }

    export async function save() {
        if (saving || loading) return;
        saving = true;
        try {
            // readDraftText 在 try 内（reasoning P2-1）：草稿块被误清时炸成 toast，而非保存键静默失效
            const text = await readDraftText(draftID);
            if (text.trim().length === 0) {
                siyuan.pushMsg(tomatoI18n.批注内容为空);
                return;
            }
            if (await onSave(text)) destroy();
        } catch (e) {
            console.error("[tomato anno] edit save failed:", e);
            siyuan.pushMsg(tomatoI18n.批注写入失败);
        } finally {
            saving = false;
        }
    }

    // ---- □8 AI 讨论区 ----

    /** 展开=首次预检 AI 配置（无→confirm 引导不展开，spec §9.1）；收起=隐藏不卸载。
     *  探测返回时弹窗可能已被关闭（autoChat 跨 loading 窗口/用户手快）：晚归结果就地丢弃，
     *  不再弹孤儿 confirm（reasoning P2-2） */
    async function toggleChat() {
        if (!chatOpen) {
            const cfg = await getAIConfig();
            if (dm.destroyed) return;
            if (!cfg) {
                confirm(tomatoI18n.未配置AI, tomatoI18n.尚未配置AI引导, () => { /* 引导即止 */ });
                return;
            }
            chatOpen = true;
            return;
        }
        chatOpen = false;
    }

    /** 压缩结果追加草稿块末尾（空行分隔；sb 整体重写=newDraftBlock 同形态，IAL 带 id 保块 id）。
     *  草稿块是 temp 工作文件——AI 永不直接写盘边界画在这里（保存批注才写属性） */
    async function appendDraft(md: string) {
        if (!draftID || !md.trim()) return;
        const old = await readDraftText(draftID).catch(() => "");
        await siyuan.safeUpdateBlock(draftID, `{{{row\n${old}\n\n${md}\n}}}\n{: id="${draftID}"}`);
    }
</script>

<div class="container" class:is-chat-open={chatOpen} class:is-mobile={events.isMobile} bind:this={root}>
    {#if selText}
        <div class="anno-sel-quote">{selText}</div>
    {/if}
    <div class="anno-edit-editor" class:is-loading={loading} bind:this={editor}>
        {#if loading}
            <div class="anno-edit-hint">{tomatoI18n.批注编辑器加载中}</div>
        {/if}
    </div>
    <!-- 问 AI 工具行（收起=入口 / 展开=对话区标题行；div 承载——内含压缩 button 不能嵌 button） -->
    <div
        class="anno-ai-bar"
        role="button"
        tabindex="0"
        aria-expanded={chatOpen}
        aria-label={chatOpen ? tomatoI18n.收起AI讨论区 : tomatoI18n.问AI}
        onclick={toggleChat}
        onkeydown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                void toggleChat();
            }
        }}
    >
        <svg><use xlink:href={chatOpen && events.isMobile ? "#iconBack" : "#iconSparkles"}></use></svg>
        <span class="anno-ai-bar__label">{chatOpen ? tomatoI18n.AI讨论区 : tomatoI18n.问AI}</span>
        <span class="anno-ai-bar__tail">
            {#if chatOpen}
                <button
                    class="anno-ai-compress b3-tooltips b3-tooltips__n"
                    aria-label={tomatoI18n.压缩成笔记说明}
                    disabled={!canCompress || chatBusy}
                    onclick={(e) => {
                        e.stopPropagation();
                        void annoChatRef?.compress();
                    }}
                ><svg><use xlink:href="#iconContract"></use></svg>{tomatoI18n.压缩成笔记}</button>
                {#if !events.isMobile}
                    <svg class="anno-ai-bar__chev"><use xlink:href="#iconUp"></use></svg>
                {/if}
            {:else}
                <svg class="anno-ai-bar__chev"><use xlink:href="#iconDown"></use></svg>
            {/if}
        </span>
    </div>
    <AnnoChat
        bind:this={annoChatRef}
        {dm}
        mobile={events.isMobile}
        open={chatOpen}
        {annoId}
        {source}
        {selText}
        {docTitle}
        {prev}
        {next}
        getAnnoText={async () => readDraftText(draftID)}
        onCompressed={async (md) => {
            await appendDraft(md);
            chatOpen = false; // 压缩完成自动收起，回编辑器过目笔记（设计第 3 段拍板）
        }}
        bind:canCompress
        bind:busy={chatBusy}
    />
    <div class="row">
        <span class="fn__flex-1"></span>
        <button class="b3-button b3-button--cancel box" onclick={destroy}>{tomatoI18n.取消}</button>
        <button class="b3-button b3-button--text box" disabled={saving || loading} onclick={save}>
            {tomatoI18n.保存} (⌘↵)
        </button>
    </div>
</div>

<style>
    .container {
        display: flex;
        flex-direction: column;
        flex: 1 1 auto; /* □3 尺寸记忆：Dialog 固定高时撑满挂载点（挂载点 flex 链见 Annotations.openEdit） */
        /* 起步高度（□3 拍板 ~50vh）：无记忆时草稿文字少也不再又窄又矮 */
        min-height: 50vh;
        /* 弹窗总高兜底（vision P0-1 矮视口溢出）：超限时编辑器/对话区按 flex 协作收缩，
         *  输入行与按钮行永远在画面内；90vh 扣 Dialog 标题栏约 64px */
        max-height: calc(90vh - 64px);
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
    .anno-edit-editor {
        flex: 1 1 auto; /* grow（□3）：container 富余高度给编辑器（max-height 60vh 封顶）；矮视口可收缩（min-height 保底），配合 .container max-height（vision P0-1） */
        min-height: 160px;
        max-height: 60vh;
        overflow-y: auto;
        border: 1px solid var(--b3-border-color);
        border-radius: var(--b3-border-radius);
        padding: 4px 8px;
        margin: 4px 2px;
        /* □8 展开对话区时 60vh→32vh 有过渡；两端显式值，max-height 可动画（视觉稿 §7.1） */
        transition: max-height .2s cubic-bezier(0, 0, .2, 1) 0ms;
    }
    .container.is-chat-open .anno-edit-editor {
        max-height: 32vh; /* 基础态 60vh 不动，仅压缩上限 */
    }
    .anno-edit-editor.is-loading {
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .anno-edit-hint {
        font-size: 13px;
        color: var(--b3-theme-on-surface-light, #999);
    }
    .row {
        display: flex;
        align-items: center;
    }
    .box {
        padding: 4px 8px;
        margin: 4px 2px;
    }

    /* ---- □8 问 AI 工具行（视觉稿 docs/tomato-annochat-visual-spec.md §7.1） ---- */
    .anno-ai-bar {
        display: flex;
        align-items: center;
        gap: 6px;
        width: calc(100% - 4px);
        min-height: 36px;
        padding: 0 8px;
        margin: 4px 2px;
        box-sizing: border-box;
        border: 1px solid var(--b3-border-color);
        border-radius: var(--b3-border-radius);
        background: transparent;
        color: var(--b3-theme-on-surface);
        font-size: 12px;
        cursor: pointer;
        transition: background .15s;
    }
    .anno-ai-bar:hover { background: var(--b3-list-hover); }
    .anno-ai-bar > svg,
    .anno-ai-bar__chev {
        width: 14px;
        height: 14px;
        flex-shrink: 0;
    }
    .anno-ai-bar__label { white-space: nowrap; }
    .anno-ai-bar__tail {
        margin-left: auto;
        display: inline-flex;
        align-items: center;
        gap: 6px;
    }

    /* 压缩成笔记小按钮（≥1 轮对话前置可用，禁用不隐藏） */
    .anno-ai-compress {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        height: 24px;
        padding: 0 8px;
        border: 1px solid var(--b3-border-color);
        border-radius: 4px;
        background: transparent;
        color: var(--b3-theme-on-surface);
        font-size: 12px;
        font-family: inherit;
        cursor: pointer;
        transition: background .15s, opacity .15s;
    }
    .anno-ai-compress > svg { width: 12px; height: 12px; }
    .anno-ai-compress:hover:not(:disabled) { background: var(--b3-theme-surface-lighter); }
    .anno-ai-compress:disabled { opacity: .38; cursor: default; }

    /* 移动端全屏接管：编辑器/引文/按钮行让位，对话区近满屏（spec §6） */
    .container.is-chat-open.is-mobile .anno-sel-quote,
    .container.is-chat-open.is-mobile .anno-edit-editor,
    .container.is-chat-open.is-mobile .row { display: none; }
    .container.is-chat-open.is-mobile .anno-ai-bar { min-height: 44px; }
</style>
