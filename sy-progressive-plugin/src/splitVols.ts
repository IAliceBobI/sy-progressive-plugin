// □2 物理分卷：纯函数层——巨文档按标题层级切卷（段展开→贪心打包）+卷名+markdown 拼接。
// 切卷分段与分片分段同源（HeadingGroup 同一守卫）：用户在 AddBook 看到 h1 分片、在切卷
// 看到 h1 分卷，行为一致。不支持 B（粗体）级——HeadingGroup 含 "b" 时 init 触发 SQL，
// 物理分卷无此语义（SplitVolsDialog 的 chips 只给实存标题级）。
// 纯逻辑核已迁 splitCore.ts（kernel 共用单一事实源，零 siyuan/window 依赖）；
// 本文件=re-export 壳保持旧 import 路径有效。行为锁定=tests/unit/splitVols.test.ts。
export {
    childBlocksToVolBlocks, splitIntoVols, volDocBaseTitle, volDocTitle, volDocMarkdown,
    type VolBlock, type VolPlan,
} from "./splitCore";
