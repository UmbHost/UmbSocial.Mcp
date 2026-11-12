/**
 * The MCP server object, registered with the SDK so its helpers can reach it.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { setServerRef } from "@umbraco-cms/mcp-server-sdk";

/**
 * A new MCP server, set as the SDK's server reference: `confirmAction` and
 * the elicitation capability checks find the client through it.
 */
export function createServer(name: string, version: string, instructions?: string): McpServer {
  const server = new McpServer({ name, version }, instructions ? { instructions } : undefined);
  setServerRef(server.server);
  return server;
}
