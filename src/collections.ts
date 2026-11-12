/**
 * Tool collections export.
 *
 * Lightweight entry point for in-process chaining: another MCP server can
 * import this to load these tools without spawning a process.
 *
 * @example
 * ```typescript
 * import { collections, allModes, allModeNames, allSliceNames } from "@umbhost/umbsocial-mcp/collections";
 * ```
 */

import type { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";

export const collections: ToolCollectionExport[] = [];

export { allModes, allModeNames } from "./config/mode-registry.js";
export { allSliceNames } from "./config/slice-registry.js";
