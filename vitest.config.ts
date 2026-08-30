// sy-progressive-plugin/vitest.config.ts

import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// 与 tomato 同款（tests/unit 是 node 无实例纯函数单测；e2e 走 agent-browser 不进 vitest）。
// siyuan npm 包只有类型声明、无运行时入口；跨插件 import 链（tomato libs）全靠
// named-import "siyuan"，单测里落到 Proxy stub 上（resolve.alias 必须在 project 条目内）。
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
