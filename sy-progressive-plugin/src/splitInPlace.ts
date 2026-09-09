// 就地断句执行层（2026-09-09 立项，bear 拍板：独立功能/任意文档选中块原地拆/挂 Pro/
// 只拆段落一钮直断）：浮条子排「就地断句」钮的执行体。与摘抄断句（getDigestMd split
// 分支）的差异=零产物语义——不摘抄、不产 * 回链、不挂渐进属性，句子块 markdown 通道
// 插回原位后删原块（每块两个事务）。⚠️API 事务不进前端 undo 栈（思源行为，e2e 实测
// 焦点在编辑器 ⌘Z 也不撤，与重插清空同族）——恢复通道=文档历史，改的是用户原文档
// 故只在含行内样式时 confirm 警告。书态浮条不给此钮（README 初版警告：分片后改原书
// 会让渐进找不到块），分片文档有重插菜单不重复给。Pro 口径=断句整体付费
// （splitAndInsert 同款兜底门禁+toast 引导）。
import { confirm, IProtyle } from "siyuan";
import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import { events } from "../../sy-tomato-plugin/src/libs/Events";
import { getAllContentEditableText } from "../../sy-tomato-plugin/src/libs/domUtils";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import { lastVerifyResult } from "../../sy-tomato-plugin/src/libs/user";
import { hasInlineStyles, isSplittableInPlace, splitInPlaceSentences } from "./splitInPlaceCore";

interface SplitPlan { id: string; sentences: string[] }

export async function splitInPlaceRun(protyle: IProtyle) {
    // 断句整体 Pro（□14 口径）：浮条钮不带锁角标（子排视觉统一），执行层兜底+toast 引导
    if (!lastVerifyResult()) {
        await siyuan.pushMsg(tomatoI18n.断句Pro提示, 2500);
        return;
    }
    return navigator.locks.request("prog.splitInPlace", { ifAvailable: true }, async (lock) => {
        if (!lock) return;
        const s = await events.selectedDivs(protyle);
        if (!s || s.ids.length === 0) {
            await siyuan.pushMsg(tomatoI18n.请先选择要断句的块);
            return;
        }
        // 收集阶段同步完成（DOM 只在此时读，事务删除后失活无害）：非 p 块与单句块跳过
        const plans: SplitPlan[] = [];
        let styled = false;
        for (let i = 0; i < s.ids.length; i++) {
            const el = s.selected[i];
            if (!el || !isSplittableInPlace(el.getAttribute("data-type"))) continue;
            const text = getAllContentEditableText(el);
            const sentences = splitInPlaceSentences(text);
            if (sentences.length <= 1) continue;
            if (!styled) styled = hasInlineStyles(text);
            plans.push({ id: s.ids[i], sentences });
        }
        if (plans.length === 0) {
            await siyuan.pushMsg(tomatoI18n.没有可断句的内容);
            return;
        }
        const run = async () => {
            let made = 0;
            for (const p of plans) {
                await siyuan.insertBlockAfter(p.sentences.join("\n\n"), p.id, "markdown");
                await siyuan.deleteBlock(p.id);
                made += p.sentences.length;
            }
            await siyuan.pushMsg(tomatoI18n.断句完成N块M句(plans.length, made), 2500);
        };
        // 断句产物是纯文本句子：原文里的行内样式会以字面量保留，含样式块先警告
        if (styled) {
            confirm(tomatoI18n.断句样式警告标题, tomatoI18n.断句样式警告内容, () => { void run(); });
        } else {
            await run();
        }
    });
}
