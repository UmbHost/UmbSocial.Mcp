/**
 * The chained CMS server.
 *
 * Media and document keys come from Umbraco's own CMS Developer MCP, chained
 * read-only and narrowed to the tools that find them. Its tools appear to the
 * client as `cms--<tool>`.
 */

import type { McpServerConfig } from "@umbraco-cms/mcp-server-sdk";
import type { SocialConfig } from "./server-config.js";

/** The CMS Developer MCP, pinned exactly. `npx` resolves it at run time. */
export const CMS_MCP_PACKAGE = "@umbraco-cms/mcp-dev@17.6.12";

/**
 * The `cms` tools a Social tool's media or document key may come from. Each
 * respects the API user's start nodes. mcp-dev 17 has no media search tool, so
 * media keys come from browsing.
 */
export const CMS_ID_TOOLS = {
  media: ["get-media-root", "get-media-children", "get-collection-media", "get-media-by-id"],
  document: ["search-document", "get-document-root", "get-document-children", "get-item-document"],
} as const;

/** Every `cms` tool this server exposes. */
export const CMS_TOOLS: readonly string[] = [...CMS_ID_TOOLS.media, ...CMS_ID_TOOLS.document];

/**
 * Filter settings mcp-dev reads from the same variables this server does. The
 * SDK starts the child with this process's environment merged under the
 * server's `env`, so our own modes and slices would otherwise reach it.
 * An empty value is an empty list.
 */
const INHERITED_FILTERS_BLANKED = {
  UMBRACO_TOOL_MODES: "",
  UMBRACO_INCLUDE_SLICES: "",
  UMBRACO_EXCLUDE_SLICES: "",
  UMBRACO_INCLUDE_TOOL_COLLECTIONS: "",
  UMBRACO_EXCLUDE_TOOL_COLLECTIONS: "",
  UMBRACO_EXCLUDE_TOOLS: "",
};

/** The servers to chain to: none when chaining is turned off. */
export function mcpServers(config: SocialConfig): McpServerConfig[] {
  if (!config.chaining) {
    return [];
  }

  return [
    {
      name: "cms",
      command: "npx",
      args: ["-y", CMS_MCP_PACKAGE],
      env: {
        ...INHERITED_FILTERS_BLANKED,
        UMBRACO_BASE_URL: config.baseUrl.href.replace(/\/+$/, ""),
        UMBRACO_CLIENT_ID: config.clientId,
        UMBRACO_CLIENT_SECRET: config.clientSecret,
        UMBRACO_READONLY: "true",
        UMBRACO_INCLUDE_TOOLS: CMS_TOOLS.join(","),
      },
      proxyTools: true,
    },
  ];
}
