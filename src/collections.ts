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
import { socialCollection } from "./umbraco-api/tools/social/index.js";
import { socialProCollection } from "./umbraco-api/tools/social-pro/index.js";

export const collections: ToolCollectionExport[] = [socialCollection, socialProCollection];

export { allModes, allModeNames } from "./config/mode-registry.js";
export { allSliceNames } from "./config/slice-registry.js";
