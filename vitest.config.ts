// sy-progressive-plugin/vitest.config.ts

import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// 与 tomato 同款（tests/unit 是 node 无实例纯函数单测；e2e 走 agent-browser 不进 vitest）。
// siyuan npm 包只有类型声明、无运行时入口；跨插件 import 链（tomato libs）全靠
// named-import "siyuan"，单测里落到 Proxy stub 上（resolve.alias/plugins 必须在
// project 条目内，根级不被 projects 继承——tooling.md「vitest 子目录运行」同源）。
export default defineConfig({
  test: {
    globals: true,
    reporters: ["verbose"],
    projects: [
      {
        resolve: {
          alias: [
            {
              find: /^siyuan$/,
              replacement: fileURLToPath(new URL("./tests/unit/__stubs__/siyuan.cjs", import.meta.url)),
            },
          ],
        },
        // .svelte 空桩（□10 progfix0922 起）：本 config 无 svelte 插件，.svelte 落到
        // vite:import-analysis 按 JS parse 即炸——而 Progressive.ts 的静态 import 图
        // 直达全部 src/*.svelte（含 tomato 侧组件），行为级测试 import Progressive.ts
        // 必经此坑。桩=哑默认导出（组件只在方法体内 new，单测路径不触达渲染）。
        // 零回归面：改前没有任何单测能加载 .svelte（加载即 suite 挂），桩只把
        // 「必炸」变「哑通过」；真组件行为属 e2e 面，不归 unit。
        plugins: [
          {
            name: "stub-svelte-unit",
            enforce: "pre",
            load(id: string) {
              if (id.endsWith(".svelte")) return "export default function () { return null; }";
              return null;
            },
          },
        ],
        test: {
          name: "unit",
          // 纯函数单测，不依赖 6806 活实例：npx vitest run
          // happy-dom 纯 JS 无原生依赖（jsdom 会顶层 require canvas 直接 dlopen 失败）
          include: ["tests/unit/**/*.test.ts"],
          setupFiles: ["./tests/unit/setup.ts"],
          environment: "happy-dom",
        },
      },
    ],
  },
});
