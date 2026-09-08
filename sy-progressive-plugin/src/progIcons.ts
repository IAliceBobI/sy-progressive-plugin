// v5 □5 浮条系统图标（视觉方案 docs/prog-v5-floatbar-design.md §8）：
// 统一 viewBox 0 0 24 24 线稿（fill:none stroke:currentColor 1.8 round），currentColor 着色
// → 皮肤/明暗经外层 color 自动联动，不硬编码色。经 plugin.addIcons 注册、icon(name,16) 渲染。
export const PROG_FLOAT_ICONS = `
<symbol id="iconProgScissors" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8.12 8.12 12 12"/><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.12 15.88"/><path d="M14.8 14.8 20 20"/></symbol>
<symbol id="iconProgCard" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"/></symbol>
<symbol id="iconProgSwap" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></symbol>
<symbol id="iconProgPlay" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 5l11 7-11 7Z"/></symbol>
<symbol id="iconProgQuill" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></symbol>
<symbol id="iconProgArchive" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9"/><path d="M10 13h4"/></symbol>
<!-- □5 方向对称化：next=delBack 水平镜像（右上箭头+左下×圆底角标），与 delBack 成「删后走」双向对 -->
<symbol id="iconProgNext" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 7h10"/><path d="m17 2 5 5-5 5"/><circle cx="7" cy="17" r="5.5"/><path d="m4.8 14.8 4.4 4.4"/><path d="m9.2 14.8-4.4 4.4"/></symbol>
<!-- □5 方向对称化：prev=FFast 水平镜像双左箭头，与 nextPure 成「纯走位」双向对 -->
<symbol id="iconProgPrev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m19 5-7 7 7 7"/><path d="m11 5-7 7 7 7"/></symbol>
<symbol id="iconProgBook" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h6a2 2 0 0 1 2 2v13"/><path d="M22 4h-6a2 2 0 0 0-2 2v13"/><path d="M2 4v15a2 2 0 0 0 2 2h16"/></symbol>
<symbol id="iconProgSend" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></symbol>
<symbol id="iconProgPiece" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="11" height="13" rx="2"/><path d="M9 20h7a2 2 0 0 0 2-2V8"/></symbol>
<symbol id="iconProgInbox" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z"/></symbol>
<symbol id="iconProgThink" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1.3.5 2.6 1.5 3.5.8.8 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></symbol>
<symbol id="iconProgRecite" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"/></symbol>
<symbol id="iconProgWord" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18 12 5l6 13"/><path d="M8.5 13h7"/></symbol>
<!-- □19 生词 AI：A 形左移避让 + 右上四角星角标（CardAdd/AddBook 的角标家族） -->
<symbol id="iconProgWordAI" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 19 9.5 6l6 13"/><path d="M6 14.5h7"/><path d="M18 2.4 19.3 3.7 20.6 5 19.3 6.3 18 7.6 16.7 6.3 15.4 5 16.7 3.7Z"/></symbol>
<symbol id="iconProgWrite" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></symbol>
<!-- writebook-next □2：新建写作书=iconProgWrite 铅笔+左上加号角标（CardAdd/AddBook 的
     「基础物+加号=新建该物」角标家族；笔尖占右上故角标落左上空白象限） -->
<symbol id="iconProgWriteAdd" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="M5 2.8v4.4"/><path d="M2.8 5h4.4"/></symbol>
<!-- writebook-next □2 vision P1-1：刷新=标准双弧循环箭头（lucide refresh-cw 线稿化），
     替换舰队 footer/管理栏 ♻ emoji（交互控件线稿化收尾） -->
<symbol id="iconProgRefresh" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></symbol>
<!-- writebook-next □4 vision P1-1：子排落点变体专属图（裸 iconProgBook 撞主排 origin「回原书」、
     iconProgContents 撞低频区 contents「打开目录」——同屏一图两义）。toBook=翻开书左页加两行
     文本（书里进内容）；toHub=folder 线稿（夹/收纳语义，家族此前空白区） -->
<symbol id="iconProgDigestToBook" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h6a2 2 0 0 1 2 2v13"/><path d="M22 4h-6a2 2 0 0 0-2 2v13"/><path d="M2 4v15a2 2 0 0 0 2 2h16"/><path d="M5 10h3"/><path d="M5 14h3"/></symbol>
<symbol id="iconProgDigestToHub" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></symbol>
<symbol id="iconProgMulti" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h.01"/><path d="M8 6h13"/><path d="M3 12h.01"/><path d="M8 12h13"/><path d="M3 18h.01"/><path d="M8 18h13"/></symbol>
<symbol id="iconProgAI" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 1.9 5.7 5.7 1.9-5.7 1.9L12 18.4l-1.9-5.7-5.7-1.9 5.7-1.9Z"/><path d="M19 15v4"/><path d="M17 17h4"/></symbol>
<symbol id="iconProgMaterial" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v10"/><path d="m8 9 4 4 4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></symbol>
<!-- 期4 拆为新片：源片两行内容 + 右向流出箭头（内容流向新片；与 TraceUp 的回看钩箭头同族异向；
     箭头杆起点 15 与源片右缘 14 留 1 单位呼吸位（vision P2-1） -->
<symbol id="iconProgSplit" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="11" height="14" rx="2"/><path d="M6 10h5"/><path d="M6 14h5"/><path d="M15 10h5"/><path d="m18 7 3 3-3 3"/></symbol>
<symbol id="iconProgFleet" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2c1 4 6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 5-7 6-11Z"/><path d="M12 12c.6 1.5 2.2 2.6 2.2 4.3a2.2 2.2 0 0 1-4.4 0c0-1.7 1.6-2.8 2.2-4.3Z"/></symbol>
<symbol id="iconProgFFast" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m5 5 7 7-7 7"/><path d="m13 5 7 7-7 7"/></symbol>
<symbol id="iconProgDelBack" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 7H3"/><path d="m7 2-5 5 5 5"/><circle cx="17" cy="17" r="5.5"/><path d="m14.8 14.8 4.4 4.4"/><path d="m19.2 14.8-4.4 4.4"/></symbol>
<symbol id="iconProgDelExit" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M12 7H8"/><path d="m9.8 4.5 2.2 2.5-2.2 2.5"/><circle cx="17" cy="17" r="5.5"/><path d="m14.8 14.8 4.4 4.4"/><path d="m19.2 14.8-4.4 4.4"/></symbol>
<symbol id="iconProgSched" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></symbol>
<symbol id="iconProgQuit" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H11"/></symbol>
<symbol id="iconProgClean" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></symbol>
<symbol id="iconProgRefill" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17V3"/><path d="m6 11 6 6 6-6"/><path d="M19 21H5"/></symbol>
<symbol id="iconProgContents" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/></symbol>
<symbol id="iconProgIgnore" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/></symbol>
<!-- □6 高级面板（制卡/收集/提取整理族，原 emoji iconHTML 换线稿）：制卡族=叠卡+角标变体
     （+/入卡下箭头/日历+加号/日历+ban 角标），ban 角标沿用 delBack/delExit 的 r5.5 圆底家族 -->
<symbol id="iconProgCardAdd" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"/><path d="M18 2.8v4.4"/><path d="M15.8 5h4.4"/></symbol>
<symbol id="iconProgCardHere" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"/><path d="M14.5 11v7"/><path d="m12 15.5 2.5 2.5 2.5-2.5"/></symbol>

<symbol id="iconProgCardDailyN" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 10.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5.2"/><path d="M6.5 2v4"/><path d="M12.5 2v4"/><path d="M3 9h13"/><circle cx="17" cy="17" r="5.5"/><path d="m13.3 13.3 7.4 7.4"/></symbol>
<!-- 移动族：上下双槽线（目标/当前位置）+ 中间单向箭头，成对镜像 -->
<symbol id="iconProgMoveUp" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h14"/><path d="M5 21h14"/><path d="M12 17V8"/><path d="m8 12 4-4 4 4"/></symbol>
<symbol id="iconProgMoveDown" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h14"/><path d="M5 21h14"/><path d="M12 7v9"/><path d="m8 12 4 4 4-4"/></symbol>
<!-- 提取族：托盘隐喻（upload=抽出到新文档 / 双 chevron=所有分片 / download=落本文档底部） -->
<symbol id="iconProgExtract" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4"/><path d="m7 9 5-5 5 5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></symbol>
<symbol id="iconProgExtractAll" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 13 6-6 6 6"/><path d="m6 8 6-6 6 6"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></symbol>
<symbol id="iconProgExtractEnd" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v11"/><path d="m7 9 5 5 5-5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></symbol>
<!-- 恢复笔记颜色=droplet 墨滴（颜色）+ 中心文本条（回转箭头版读感偏「重置」已弃） -->
<symbol id="iconProgRecolor" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0Z"/><path d="M9.5 14h5"/></symbol>
<symbol id="iconProgMerge" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="8" height="6" rx="1.5"/><rect x="13" y="3" width="8" height="6" rx="1.5"/><path d="M12 11v6"/><path d="m9 14 3 3 3-3"/><path d="M7 21h10"/></symbol>
<symbol id="iconProgCompare" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/><path d="M6 9h3.5"/><path d="M6 13h3.5"/><path d="M14.5 9h3.5"/><path d="M14.5 13h3.5"/></symbol>
<!-- □14b 平铺区折叠钮：chevron 指向即动作方向（Up=收起成首行 / Down=展开平铺区） -->
<symbol id="iconProgFoldUp" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></symbol>
<symbol id="iconProgFoldDown" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></symbol>
<!-- □11 浮层族+自由态：加书（书+加角标，CardAdd 同款角标家族）/路线图（支路→主干树）/
     路线指引（指南针）/原文侧追溯（文档+回看箭头，与 digest 态回原书互为镜像） -->
<symbol id="iconProgAddBook" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h6a2 2 0 0 1 2 2v13"/><path d="M22 4h-6a2 2 0 0 0-2 2v13"/><path d="M2 4v15a2 2 0 0 0 2 2h16"/><path d="M18 8.8v4.4"/><path d="M15.8 11h4.4"/></symbol>
<symbol id="iconProgTree" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4.5" r="2.5"/><circle cx="5" cy="18" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="M12 7v3.5"/><path d="M5 15.5V12a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3.5"/><path d="M12 10v2"/></symbol>
<symbol id="iconProgMap" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 5 6 12 4 19 6 21 11 12 20 3 11"/><path d="M12 20c-3.5-4.5-5.25-7.17-5.25-9a5.25 5.25 0 0 1 10.5 0c0 1.83-1.75 4.5-5.25 9Z"/><circle cx="12" cy="11" r="2"/></symbol>
<symbol id="iconProgTraceUp" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="3" width="12" height="14" rx="2"/><path d="M9 7h6"/><path d="M9 11h4"/><path d="M9 21h9a3 3 0 0 0 3-3v-3"/><path d="m18 18 3-3-3-3"/></symbol>
<!-- 菜单翻新（2026-09-02）：随机阅读=标准 shuffle 交叉双箭头（lucide shuffle 线稿化） -->
<symbol id="iconProgShuffle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.8-1.1 2-1.7 3.3-1.7H22"/><path d="m18 2 4 4-4 4"/><path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2"/><path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8"/><path d="m18 14 4 4-4 4"/></symbol>
`;
