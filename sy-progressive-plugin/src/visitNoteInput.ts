// □4 回访留言——写入口输入小窗（纯 DOM Dialog，轻输入不起 Svelte 组件）。入口层：
// 片/摘抄尾卡动作行与阅读卡菜单（readCardMenu）共用；落盘=visitNoteAppend。
import { Dialog } from "siyuan";
import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import { appendVisitNote } from "./visitNoteAppend";

let cur: Dialog | null = null;

/** 打开留言输入窗（重复打开先收旧窗防叠层）。Enter 提交 / Shift+Enter 换行；
 *  空文本不提交；成功 toast+关窗，失败留窗可重试 */
export function openVisitNoteInput(docID: string): void {
    if (!docID) return;
    cur?.destroy();
    cur = null;
    const dialog = new Dialog({
        title: tomatoI18n.写留言(),
        content: `<div class="prog-vnote-input">
  <textarea class="b3-text-field fn__flex-1" rows="3" data-vn-ta
    placeholder=""></textarea>
  <div class="prog-vnote-input__row">
    <span class="prog-vnote-input__hint">Enter ⏎ · Shift+Enter 换行</span>
    <button class="b3-button b3-button--text" data-vn-cancel>${tomatoI18n.留言取消()}</button>
    <button class="b3-button b3-button--primary" data-vn-ok>${tomatoI18n.留言确认()}</button>
  </div>
</div>`,
        width: "min(480px, 92vw)",
        destroyCallback: () => { if (cur === dialog) cur = null; },
    });
    cur = dialog;
    const root = dialog.element.querySelector(".prog-vnote-input") as HTMLElement | null;
    const ta = root?.querySelector<HTMLTextAreaElement>("[data-vn-ta]") ?? null;
    const ok = root?.querySelector<HTMLButtonElement>("[data-vn-ok]") ?? null;
    const cancel = root?.querySelector<HTMLButtonElement>("[data-vn-cancel]") ?? null;
    if (!root || !ta || !ok || !cancel) { dialog.destroy(); return; }
    ta.placeholder = tomatoI18n.留言占位();
    let busy = false;
    const submit = async () => {
        const text = ta.value.trim();
        if (!text || busy) return;
        busy = true;
        ok.disabled = true;
        const id = await appendVisitNote(docID, text);
        if (id) {
            debugLog("prog.vnote", `append doc=${docID} block=${id}`, "progressive");
            try { await siyuan.pushMsg(tomatoI18n.留言已添加(), 2500); } catch { /* noop */ }
            dialog.destroy();
        } else {
            busy = false;
            ok.disabled = false;
        }
    };
    ta.addEventListener("keydown", ev => {
        if (ev.key === "Enter" && !ev.shiftKey && !ev.isComposing) {
            ev.preventDefault();
            void submit();
        }
    });
    ok.addEventListener("click", () => void submit());
    cancel.addEventListener("click", () => dialog.destroy());
    ta.focus();
}
