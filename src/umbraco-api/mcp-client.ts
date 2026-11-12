/**
 * The client manager for chained MCP servers (the template's pattern).
 *
 * `index.ts` registers the servers from `mcpServers(config)`; tools that need a
 * `cms` tool call it through this manager. A separate module so tools can
 * import it without importing `index.ts`.
 *
 * No `filterConfig`: the chained server is narrowed by its own environment
 * (see `config/mcp-servers.ts`), and none of this server's filters apply to it.
 */

import { createMcpClientManager } from "@umbraco-cms/mcp-server-sdk";

export const mcpClientManager = createMcpClientManager();
