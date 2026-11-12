/**
 * Tool collections export.
 *
 * Lightweight entry point for in-process chaining: another MCP server can
 * import this to load these tools without spawning a process.
 *
 * The collections apply the same gates as this server, so a host filtering
 * them with the SDK alone can't expose more: a tool in a default-off slice
 * (`approve`, `resolve`) is left out unless `UMBSOCIAL_ENABLE_SLICES` names
 * its slice (read on every call, and an unknown name throws), whatever
 * `UMBRACO_INCLUDE_TOOLS` says; and, given a user, a tool whose `enabled`
 * refuses that user is left out.
 *
 * @example
 * ```typescript
 * import { collections, allModes, allModeNames, allSliceNames } from "@umbhost/umbsocial-mcp/collections";
 * ```
 */

import type { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import { readEnabledSlices } from "./config/server-config.js";
import { inDefaultOffSlice } from "./session/start-session.js";
import { allCollections } from "./tool-collections.js";

function gated(collection: ToolCollectionExport): ToolCollectionExport {
  return {
    ...collection,
    tools: (user) => {
      const enabledSlices = readEnabledSlices(process.env);
      return collection
        .tools(user)
        .filter((tool) => !(user && tool.enabled && !tool.enabled(user)))
        .filter((tool) => !inDefaultOffSlice(tool, (slice) => !enabledSlices.has(slice as never)));
    },
  };
}

export const collections: ToolCollectionExport[] = allCollections.map(gated);

export { allModes, allModeNames } from "./config/mode-registry.js";
export { allSliceNames } from "./config/slice-registry.js";
