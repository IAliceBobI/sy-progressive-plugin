// □4 回访留言卡渲染器（tailCardRender 同注册面 customBlockRenders；纯展示卡零动作钮
// ——改留言=删块重插）。头行=「留言 · 日期」+正文；正文 textContent 落（用户文本永不
// innerHTML——防注入，annoChatRender svg use 教训同族）。复习宿主（.card__block）照常
// 渲染：留言正是回访时要看的内容，与尾卡「复习态收动作」拍板不冲突（无动作可收）。
import { icon } from "../../sy-tomato-plugin/src/libs/utils";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import type { CustomBlockPlugin } from "./tailCardRender";
import { VISIT_NOTE_BLOCK_TYPE, parseVisitNoteContent } from "./visitNoteBlock";

const pad2 = (n: number) => String(n).padStart(2, "0");

export function registerVisitNoteRender(plugin: CustomBlockPlugin): void {
    if (!plugin.customBlockRenders) return; // <3.8.3：不注册（留言块降级 <pre>，数据本体仍在）
    plugin.customBlockRenders[VISIT_NOTE_BLOCK_TYPE] = {
        render: ({ element, content }: { element: HTMLElement; content: string }) => {
            const d = parseVisitNoteContent(content);
            const card = document.createElement("div");
            card.className = "prog-vnote";
            if (!d) {
                card.classList.add("prog-vnote--broken");
                card.textContent = "…";
                element.append(card);
                return;
            }
            const date = new Date(d.ts);
            const head = document.createElement("div");
            head.className = "prog-vnote__head";
            const label = document.createElement("span");
            label.className = "prog-vnote__label";
            // icon() 返 HTML 字符串，append() 会按纯文本插成源码漏进正文（vision R1 P0）——
            // insertAdjacentHTML 走 parser 才是真 svg（DOM API 造 svg use 须 parser 代劳，同族坑）
            label.insertAdjacentHTML("afterbegin", icon("iconInfo", 12));
            label.append(document.createTextNode(tomatoI18n.留言()));
            const ds = document.createElement("span");
            ds.className = "prog-vnote__date";
            ds.textContent = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
            head.append(label, ds);
            const body = document.createElement("div");
            body.className = "prog-vnote__text";
            body.textContent = d.text;
            card.append(head, body);
            element.append(card);
            debugLog("prog.vnote", `render host=${element.closest("[data-node-id]")?.getAttribute("data-node-id") ?? "?"}`, "progressive");
        },
    };
}
