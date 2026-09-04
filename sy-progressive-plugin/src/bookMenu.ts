// 舰队管理 □2：书卡右键菜单（桌面 contextmenu/移动端长按共用）——四动作集中地，
// 以后书卡动作的挂点。形态对齐 reviewMenu.ts 惯例：independent 第三参防 click 冒泡
// 单例坑（AGENTS.md 踩坑表）+ setTimeout 包 open + 键盘触发落屏中。
import { Menu } from "siyuan";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import type { FleetActions } from "./fleet";

/** 键盘触发（clientX/Y=0）时菜单落屏幕中间（reviewMenu menuPos 同款） */
function menuPos(ev: { clientX: number; clientY: number }) {
    return {
        x: ev.clientX > 0 ? ev.clientX : innerWidth / 2,
        y: ev.clientY > 0 ? ev.clientY : innerHeight / 2,
    };
}

export function openBookMenu(
    ev: { clientX: number; clientY: number },
    book: { bookID: string; name: string; pinned: boolean },
    actions: FleetActions,
) {
    const menu = new (Menu as any)("progBookMenu", undefined, true) as Menu;
    menu.addItem({
        label: book.pinned ? tomatoI18n.取消置顶 : tomatoI18n.置顶本书,
        click: () => void actions.togglePinBook(book.bookID, !book.pinned),
    });
    menu.addItem({
        label: tomatoI18n.从总览隐匿,
        click: () => void actions.toggleHideBook(book.bookID, true),
    });
    menu.addItem({
        label: tomatoI18n.忽略本书菜单,
        click: () => void actions.ignoreBook(book.bookID),
    });
    menu.addItem({
        label: tomatoI18n.归档本书菜单,
        click: () => void actions.archiveBook(book.bookID),
    });
    setTimeout(() => menu.open(menuPos(ev)), 0);
}
