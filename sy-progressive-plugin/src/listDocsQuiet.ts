// need-1001-03：progressive 前端 listDocsByPath 容错直调（writeTree/helper/Split2Pieces
// 三处共享，替代各自直连 siyuan.call）。空目录（有 .sy、无同名子目录）内核返 code=-1
// ——「无子文档」的常态语义而非错误；siyuan.call 对一切非零码 warnP5Throttled 打 p5
// 警告，空目录常态刷屏（need-1001-01 tomato 侧同款修复先例；本侧独立成册不共用 tomato
// 封装：①maxListCount:0/ignoreMaxListHint 等参数须透传——tomato 封装无此参，巨书越窗
// 静默 miss；②code=-1 返 {files:[]} 而非 null——fetchDocLayer 的 P1-2 契约要求空层与
// 失败可区分）。零本仓依赖（只取 tomato debugLog），三方 import 无环（writeTree 顶层
// import helper 会经 Progressive 成环，故独立小模块）。
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";

export interface ListDocsResp { files?: any[] }

/** code=-1 静默返 {files: []}（空层形态——调用方 ?.files ?? [] 防护天然兼容，且与
 *  真失败 null 可区分）；其余非零码照 siyuan.call 形态 p5 告警+返 null；网络错吞错
 *  归一返 null。extra 透传进请求体（maxListCount:0=全量防内核默认截断等）。 */
export async function listDocsByPathQuiet(
    notebook: string, path: string, extra?: Record<string, any>,
): Promise<ListDocsResp | null> {
    const url = "/api/filetree/listDocsByPath";
    const reqData = { notebook, path, ...extra };
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(reqData),
        });
        const json = await res.json();
        if (json?.code === -1) return { files: [] };
        if (json?.code && json?.code != 0) {
            // 栈帧照 warnP5Throttled 形态（bundle 后行号可反查定位调用方——三方共用
            // 封装，真错误码须能分辨是谁打的）
            const frames = (new Error().stack ?? "").split("\n").slice(0, 6);
            console.warn(`p5: ${json.code} ${json.msg} ${url} ${JSON.stringify(reqData)}\n${frames.join("\n")}`);
            debugLog("p5", `code=${json.code} msg=${json.msg} url=${url} req=${JSON.stringify(reqData)} stack=${frames.join(" | ")}`, "progressive");
            return null;
        }
        return json?.data ?? null;
    } catch (e) {
        console.warn(e, url, reqData);
        return null;
    }
}
