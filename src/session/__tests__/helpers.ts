/**
 * Shared helpers for the session tests.
 */

import { expect } from "@jest/globals";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ToolDefinition } from "@umbraco-cms/mcp-server-sdk";

export const TOKEN_PATH = "*/umbraco/management/api/v1/security/back-office/token";
export const EDITION_PATH = "*/umbraco/management/api/v1/umbsocial/edition";
export const USER_PATH = "*/umbraco/management/api/v1/user/current";

export const LICENSED = { isLicensed: true, maxChannels: null, historyDays: null, channelsUsed: 2 };
export const UNLICENSED = { isLicensed: false, maxChannels: 3, historyDays: 90, channelsUsed: 2 };

/** Calls a decorated tool's handler as the MCP server would. */
export async function callTool(
  tool: ToolDefinition<any, any>,
  args: Record<string, unknown> = {},
): Promise<CallToolResult> {
  const handler = tool.handler as unknown as (args: unknown, extra: unknown) => Promise<CallToolResult>;
  return handler(args, { signal: new AbortController().signal });
}

/** The JSON a tool error carries in its text content. */
export function errorBody(result: CallToolResult): unknown {
  expect(result.isError).toBe(true);
  const first = result.content[0];
  if (first?.type !== "text") throw new Error("expected text content");
  return JSON.parse(first.text);
}
