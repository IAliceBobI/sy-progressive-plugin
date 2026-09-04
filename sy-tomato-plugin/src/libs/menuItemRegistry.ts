// 「右键菜单管理」区注册表（□4）：列出插件注册的右键菜单项，按功能模块分组。
// 2026-09-03 瘦身（方案 A 拍板）：有独立开关 store 的项在功能主卡里本就是同一数据双视图，
// 全数移除——各回各家，本区不再重复（曾覆盖 13 组：思维导线/块关系图/悬浮球/批注/闪卡/
// 互链与引用/数据库反链/智能问答/图片/阅读点/日记/前缀文档树/块配对浮条/文档整理）。
// 2026-09-03 归位补刀（用户验货拍板）：白/黑名单两项语义严格属于导出工作空间（运行时注册
// 受其总开关门控），显隐开关迁至导出卡①段（EXPORT_CARD_MENU_ITEMS），本区不再渲染。
// 现仅剩 exportFiles 4 项（文档树合并/导出/导入命令，无家可归）：显隐走 hiddenMenuItems
// 隐藏集，本区是它们唯一入口。「全部显示」按钮仍兜底恢复存量隐藏（含瘦身/归位前被藏的项
// ——行删除后不再有逐项写入路径，该按钮清空整个隐藏集故照常覆盖迁移项）。
// checkbox 语义统一为「勾=显示」。key 与 menuManager.addIfVisible 用的 key 严格一致
// （winHotkey langKey 或 m.<模块>.<语义>）。新增菜单项：有开关的进功能主卡，无开关的在此补行。
import { tomatoI18n } from "../tomatoI18n";

export interface ManagedMenuItem {
    key: string;
    label: () => string;
    /** 有独立开关的项绑它（checkbox 读写 store）；缺省走 hiddenMenuItems 隐藏集 */
    store?: { get(): boolean; set(v: boolean): void };
    /** 功能区总开关层（onload/事件入口整段 return 的那种）：勾选态须合成它，
     *  勾选时一并打开（否则功能区关着时勾了菜单项也不出现，管理区失去恢复入口） */
    master?: { get(): boolean; set(v: boolean): void };
}

export interface MenuManageGroup {
    title: () => string;
    items: ManagedMenuItem[];
}

export const MENU_MANAGE_GROUPS: MenuManageGroup[] = [
    {
        title: () => tomatoI18n.导出,
        items: [
            { key: "m.exportFiles.mergeMove", label: () => tomatoI18n.合并为单个文件 + " · " + tomatoI18n.移动 },
            { key: "m.exportFiles.mergeCopy", label: () => tomatoI18n.合并为单个文件 + " · " + tomatoI18n.复制 },
            { key: "m.exportFiles.exportAll", label: () => tomatoI18n.导出所有文档到单个文件 },
            { key: "m.exportFiles.importMD", label: () => tomatoI18n.导入markdownOrText },
        ],
    },
];

/** 导出工作空间卡①段消费（2026-09-03 归位）：白/黑名单右键菜单项——语义严格属于导出工作空间，
 *  运行时注册受导出总开关门控，开关行随卡体 {#if} 隐藏天然一致；无独立 store，显隐走
 *  hiddenMenuItems 隐藏集（机制同右键菜单管理卡）。不进 MENU_MANAGE_GROUPS，管理卡不重复渲染。 */
export const EXPORT_CARD_MENU_ITEMS: ManagedMenuItem[] = [
    { key: "m.export.whiteList", label: () => tomatoI18n.添加到导出工作空间的白名单 },
    { key: "m.export.blackList", label: () => tomatoI18n.添加到导出工作空间的黑名单 },
];
