// 浮条帮助入口映射（B1 tooltip 详情行 + B2 首行行尾角落直达共用源）：
// FLOATBAR_BTN_HELP = 按钮 id → 帮助分篇 token（url 拼法 https://my.feishu.cn/docx/${token}
// ?from=from_copylink，ConfHelpIcon 同款）。id 取浮条 DOM 三层标识——主排钮 data-fb-id /
// 平铺区钮 data-fb-flat-id / 条件钮与子排钮 data-fb-help（不进配置池、无池 id 的钮专属）。
// 未列出的（delBack/quit/合槽两钮/crumbs/fold——帮助零覆盖与布局控件）= 纯提示不挂详情行。
// FLOATBAR_STATE_HELP = 浮条态 → 分篇（B2 角落 iconHelp 按态直达；四态暂同篇）。
export const FLOATBAR_BTN_HELP: Record<string, string> = {
    // 摘抄篇（含 ✂子排整理族/复访组/移片提取族）
    digest: "FgLKdkPlrojE82x5jbHcSSKpnfe",
    traceUp: "FgLKdkPlrojE82x5jbHcSSKpnfe",
    collect: "FgLKdkPlrojE82x5jbHcSSKpnfe",
    movePrev: "FgLKdkPlrojE82x5jbHcSSKpnfe",
    moveNext: "FgLKdkPlrojE82x5jbHcSSKpnfe",
    extractAll: "FgLKdkPlrojE82x5jbHcSSKpnfe",
    extractEnd: "FgLKdkPlrojE82x5jbHcSSKpnfe",
    extract: "FgLKdkPlrojE82x5jbHcSSKpnfe",
    noColor: "FgLKdkPlrojE82x5jbHcSSKpnfe",
    reColor: "FgLKdkPlrojE82x5jbHcSSKpnfe",
    merge: "FgLKdkPlrojE82x5jbHcSSKpnfe",
    summary: "FgLKdkPlrojE82x5jbHcSSKpnfe",
    revisit: "FgLKdkPlrojE82x5jbHcSSKpnfe",
    tree: "FgLKdkPlrojE82x5jbHcSSKpnfe",
    whole: "FgLKdkPlrojE82x5jbHcSSKpnfe",
    inbox: "FgLKdkPlrojE82x5jbHcSSKpnfe",
    tobook: "FgLKdkPlrojE82x5jbHcSSKpnfe",
    tohub: "FgLKdkPlrojE82x5jbHcSSKpnfe",
    think: "FgLKdkPlrojE82x5jbHcSSKpnfe",
    review: "FgLKdkPlrojE82x5jbHcSSKpnfe",
    batchpool: "FgLKdkPlrojE82x5jbHcSSKpnfe",
    // 卡片篇（word 族须先拖蓝选中文字）
    cards: "PaMudIknXoncs8xBwhUc5iKonNb",
    card: "PaMudIknXoncs8xBwhUc5iKonNb",
    cardHere: "PaMudIknXoncs8xBwhUc5iKonNb",
    cardDailyN: "PaMudIknXoncs8xBwhUc5iKonNb",
    multi: "PaMudIknXoncs8xBwhUc5iKonNb",
    word: "PaMudIknXoncs8xBwhUc5iKonNb",
    wordai: "PaMudIknXoncs8xBwhUc5iKonNb",
    sched: "PaMudIknXoncs8xBwhUc5iKonNb",
    // 阅读篇（分片推进/书目管理）
    swap: "Zpnxdy7zeo36LlxkDEic5AhTnpd",
    next: "Zpnxdy7zeo36LlxkDEic5AhTnpd",
    prev: "Zpnxdy7zeo36LlxkDEic5AhTnpd",
    addBook: "Zpnxdy7zeo36LlxkDEic5AhTnpd",
    contents: "Zpnxdy7zeo36LlxkDEic5AhTnpd",
    refill: "Zpnxdy7zeo36LlxkDEic5AhTnpd",
    delSwap: "Zpnxdy7zeo36LlxkDEic5AhTnpd",
    resetHere: "Zpnxdy7zeo36LlxkDEic5AhTnpd",
    continue: "Zpnxdy7zeo36LlxkDEic5AhTnpd",
    toPiece: "Zpnxdy7zeo36LlxkDEic5AhTnpd",
    archive: "Zpnxdy7zeo36LlxkDEic5AhTnpd",
    // 导航篇（回原书链路/纯翻页/路线指引）
    origin: "ZZr9dGoIno5pnVxn2vpch6BCn3f",
    nextPure: "ZZr9dGoIno5pnVxn2vpch6BCn3f",
    map: "ZZr9dGoIno5pnVxn2vpch6BCn3f",
    // 清理篇（删原文/删片退出/不再推送）
    clean: "U23idAY0UorKIkxmcOCc7Iwbnkf",
    delExit: "U23idAY0UorKIkxmcOCc7Iwbnkf",
    ignore: "U23idAY0UorKIkxmcOCc7Iwbnkf",
    // 写作·仿写篇（素材池/槽操作/条件钮——data-fb-help 标识）
    recite: "LDYcdZaabooyxjxFUlvctvVKnsf",
    write: "LDYcdZaabooyxjxFUlvctvVKnsf",
    managePool: "LDYcdZaabooyxjxFUlvctvVKnsf",
    slotList: "LDYcdZaabooyxjxFUlvctvVKnsf",
    matFlip: "LDYcdZaabooyxjxFUlvctvVKnsf",
    matDel: "LDYcdZaabooyxjxFUlvctvVKnsf",
    matOut: "LDYcdZaabooyxjxFUlvctvVKnsf",
    insertMaterial: "LDYcdZaabooyxjxFUlvctvVKnsf",
    splitPiece: "LDYcdZaabooyxjxFUlvctvVKnsf",
    pieceDone: "LDYcdZaabooyxjxFUlvctvVKnsf",
    compile: "LDYcdZaabooyxjxFUlvctvVKnsf",
    slotIn: "LDYcdZaabooyxjxFUlvctvVKnsf",
    directSlot: "LDYcdZaabooyxjxFUlvctvVKnsf",
};

export const FLOATBAR_STATE_HELP: Record<string, string> = {
    book: "U23idAY0UorKIkxmcOCc7Iwbnkf",
    digest: "U23idAY0UorKIkxmcOCc7Iwbnkf",
    free: "U23idAY0UorKIkxmcOCc7Iwbnkf",
    piece: "U23idAY0UorKIkxmcOCc7Iwbnkf",
};
