/** 卡片顶部来源路径渲染（09-18 MOUQIN 精简档诉求，bear 拍板：lite=只显首段、
 *  full=相邻同名段去重）。属性值=cleanDiv 写入的 custom-origin-hpath /
 *  custom-ref-hpath（getContextPath.getPathStr 产物「[名] > [名]」，parts 空时
 *  兜底返回块 id）——串里无段类型信息，规则全在文本层。
 *
 *  渲染通道：CSS ::before content 取 var(--card-path)（index.scss 两规则），本模块
 *  applyCardPathTo 把规则结果逐块写成 CSS 变量；三态由渐进 index.ts 订阅
 *  flashcardShowPath 驱动（off=body 无类不显示，变量写了也不渲染）。 */

/** 三态（渐进 flashcardShowPath store 的值域；旧 boolean 存量由 loadStore 迁移） */
export type CardPathMode = "off" | "lite" | "full";

/** 串 → 规则后文本。段按 getContextPath 的 join(" > ") 切（分隔符带空格），
 *  同名去重按整段文本比较（剥方括号后的裸名，[x] 与 [x] 同、与 [x ] 不同）；
 *  无分隔符（单段/兜底 id）与空串不加工原样返回。 */
export function renderCardPath(raw: string, mode: "lite" | "full"): string {
    if (!raw) return "";
    const parts = raw.split(" > ");
    if (parts.length < 2) return raw;
    const deduped: string[] = [];
    for (const p of parts) {
        if (deduped.length === 0 || deduped[deduped.length - 1] !== p) deduped.push(p);
    }
    return mode === "lite" ? deduped[0] : deduped.join(" > ");
}

/** 把规则结果挂到卡片块（origin/ref 两属性任一存在即处理；值比较防同值重写——
 *  textContent 同值赋值也产生 mutation 的同族坑）。
 *  变量值=JSON.stringify 产物：content: var(--card-path) 展开需要带引号的 CSS
 *  字符串字面量，名字内嵌双引号经 \" 转义恰与 CSS 转义形态兼容。
 *  返回是否写入（false=无属性/同值跳过），调用方可据此做增量统计。 */
export function applyCardPathTo(el: Element, mode: "lite" | "full"): boolean {
    const raw = el.getAttribute("custom-origin-hpath") || el.getAttribute("custom-ref-hpath") || "";
    const text = renderCardPath(raw, mode);
    if (!text) return false;
    const cssValue = JSON.stringify(text);
    if ((el as HTMLElement).style.getPropertyValue("--card-path") === cssValue) return false;
    (el as HTMLElement).style.setProperty("--card-path", cssValue);
    return true;
}

/** —— 三态编排（渐进 index.ts 订阅驱动）——
 *  off=body 摘类+observer 停；lite/full=挂类+全量扫+observer 增量维护（复习界面挂卡/
 *  打开卡片文档都是新块，纯全量扫盖不住）。observer 跨代单例：window.eval 重跑模块顶层，
 *  旧代 observer 不拆会双写泄漏——globalThis 登记位先 disconnect 旧代再建新代
 *  （命令式挂 body 组件跨代清理同款）。 */

const PATH_SEL = "div[custom-origin-hpath], div[custom-ref-hpath]";
let cardPathMode: CardPathMode = "off";

function scanAllCardPaths() {
    const m = cardPathMode;
    if (m === "off") return;
    document.querySelectorAll<HTMLElement>(PATH_SEL).forEach(el => applyCardPathTo(el, m));
}

function ensureCardPathObserver() {
    const g = globalThis as Record<string, unknown>;
    const key = "__progCardPathObserver";
    (g[key] as MutationObserver | undefined)?.disconnect();
    const ob = new MutationObserver(muts => {
        const m = cardPathMode;
        if (m === "off") return;
        for (const mut of muts) {
            for (const n of mut.addedNodes) {
                if (!(n instanceof Element)) continue;
                if (n.matches(PATH_SEL)) applyCardPathTo(n, m);
                n.querySelectorAll<HTMLElement>(PATH_SEL).forEach(el => applyCardPathTo(el, m));
            }
        }
    });
    ob.observe(document.body, { childList: true, subtree: true });
    g[key] = ob;
}

/** 订阅回调入口：v 非法值（含旧 boolean 漏网）一律按 off 处理 */
export function applyCardPathMode(v: string) {
    cardPathMode = v === "lite" || v === "full" ? v : "off";
    document.body.classList.toggle("prog-card-path-on", cardPathMode !== "off");
    if (cardPathMode === "off") {
        ((globalThis as Record<string, unknown>).__progCardPathObserver as MutationObserver | undefined)?.disconnect();
    } else {
        scanAllCardPaths();
        ensureCardPathObserver();
    }
}
