// 舰队管理 □2：书卡右键菜单（桌面 contextmenu/移动端长按共用）——四动作集中地，
// 以后书卡动作的挂点。形态对齐 reviewMenu.ts 惯例：independent 第三参防 click 冒泡
// 单例坑（AGENTS.md 踩坑表）+ setTimeout 包 open + 键盘触发落屏中。
// □3 回访频率：async 化（开菜单前一书一读 IAL 档位，openReadCardMenu inspect 同款
// 先查后组配形态；调用方 fire-and-forget 不受影响）。
import { Menu } from "siyuan";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import type { FleetActions } from "./fleet";
import { bookVisitFreq } from "./readCurve";

/** 键盘触发（clientX/Y=0）时菜单落屏幕中间（reviewMenu menuPos 同款） */
function menuPos(ev: { clientX: number; clientY: number }) {
    return {
        x: ev.clientX > 0 ? ev.clientX : innerWidth / 2,
        y: ev.clientY > 0 ? ev.clientY : innerHeight / 2,
    };
}

export async function openBookMenu(
    ev: { clientX: number; clientY: number },
    book: { bookID: string; name: string; pinned: boolean },
    actions: FleetActions,
) {
    const freq = await bookVisitFreq(book.bookID);
    const menu = new (Menu as any)("progBookMenu", undefined, true) as Menu;
    // vision P1-1：全项补图标（与 readCardMenu 全项带图标惯例对齐，图标名经
    // appearance/icons/litheness/icon.js 真相源核验）；P2-1：配置组（置顶/隐匿/回访频率）
    // 与退场组（忽略/归档）分隔线分组
    menu.addItem({
        icon: "iconPin",
        label: book.pinned ? tomatoI18n.取消置顶 : tomatoI18n.置顶本书,
        click: () => void actions.togglePinBook(book.bookID, !book.pinned),
    });
    menu.addItem({
        // vision 复核实锤：iconHide 在运行时真相源（conf appearance icons）不存在渲染空白，
        // 换 iconEyeoff（真相源命中+本插件 helpMenu「隐/显」同语义先例）
        icon: "iconEyeoff",
        label: tomatoI18n.从总览隐匿,
        click: () => void actions.toggleHideBook(book.bookID, true),
    });
    // □3 回访频率（书级）：✓ 当前档；改档=书 IAL 默认+在册 grow 卡批量跟随（toast 由
    // setBookVisitFreq 内发），三档语义见 readCurveCore FREQ_MULT
    menu.addItem({
        icon: "iconClock",
        label: tomatoI18n.回访频率(),
        submenu: (["l", "m", "h"] as const).map(f => ({
            icon: "iconClock",
            label: (freq === f ? "✓ " : "") + tomatoI18n.回访频率档名(f),
            click: () => void actions.setVisitFreq(book.bookID, f),
        })),
    });
    menu.addSeparator();
    menu.addItem({
        icon: "iconClose",
        label: tomatoI18n.忽略本书菜单,
        click: () => void actions.ignoreBook(book.bookID),
    });
    menu.addItem({
        icon: "iconInbox",
        label: tomatoI18n.归档本书菜单,
        click: () => void actions.archiveBook(book.bookID),
    });
    setTimeout(() => menu.open(menuPos(ev)), 0);
}
