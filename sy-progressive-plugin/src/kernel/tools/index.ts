import type { ToolDefinition } from "./common";
import { createProgressiveTool } from "./progressiveTools";

export type { ToolDefinition } from "./common";

// progressive 的 MCP 工具注册表：单一 `progressive` 工具 + action 枚举（降低 AI 工具选择负担，
// 设计与实现细节见 progressiveTools.ts）。
export function createMcpRegistry(): ToolDefinition[] {
    return [createProgressiveTool()];
}
