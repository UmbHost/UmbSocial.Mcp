/**
 * The chained CMS server.
 *
 * Media and document keys come from Umbraco's own CMS Developer MCP, chained
 * read-only and narrowed to the tools that find them. Its tools appear to the
 * client as `cms--<tool>`.
 *
 * It is a dependency of this package, pinned exactly and locked by the
 * published `npm-shrinkwrap.json`, and it runs from where it was installed:
 * nothing is fetched when the server starts.
 */

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import {
  createToolAnnotations,
  jsonSchemaObjectToZodObject,
  type McpServerConfig,
  type ProxiedTool,
} from "@umbraco-cms/mcp-server-sdk";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import type { ZodTypeAny } from "zod";
import type { SocialConfig } from "./server-config.js";

/** The CMS Developer MCP: a dependency, pinned exactly in package.json and the shrinkwrap. */
export const CMS_MCP_PACKAGE = "@umbraco-cms/mcp-dev";
export const CMS_MCP_VERSION = "17.6.12";

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

/**
 * The installed mcp-dev's start script: its package's own `bin`, found from
 * where Node resolves the package for this module.
 */
export function cmsServerScript(): string {
  const require = createRequire(import.meta.url);
  let dir = dirname(require.resolve(CMS_MCP_PACKAGE));
  for (;;) {
    const manifest = join(dir, "package.json");
    if (existsSync(manifest)) {
      const pkg = JSON.parse(readFileSync(manifest, "utf8")) as { name?: string; bin?: string | Record<string, string> };
      if (pkg.name === CMS_MCP_PACKAGE) {
        const bin = typeof pkg.bin === "string" ? pkg.bin : Object.values(pkg.bin ?? {})[0];
        if (!bin) throw new Error(`${CMS_MCP_PACKAGE} has no start script.`);
        return join(dir, bin);
      }
    }
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`${CMS_MCP_PACKAGE} isn't installed.`);
    dir = parent;
  }
}

/** The servers to chain to: none when chaining is turned off. */
export function mcpServers(config: SocialConfig): McpServerConfig[] {
  if (!config.chaining) {
    return [];
  }

  return [
    {
      name: "cms",
      // The Node running this server, so nothing is looked up on PATH.
      command: process.execPath,
      args: [cmsServerScript()],
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

const isAllowed = (pt: ProxiedTool) => pt.serverName === "cms" && CMS_TOOLS.includes(pt.originalTool.name);

/**
 * Splits what the chained server lists into the `CMS_TOOLS` it may expose and
 * the rest (by prefixed name). The child's own narrowing isn't trusted.
 *
 * Hand-rolled because the SDK lacks it: `discoverProxiedTools` returns every
 * tool a chained server lists.
 */
export function allowlisted(tools: readonly ProxiedTool[]): { allowed: ProxiedTool[]; dropped: string[] } {
  return {
    allowed: tools.filter(isAllowed),
    // Only safe characters reach the log line.
    dropped: tools.filter((pt) => !isAllowed(pt)).map((pt) => pt.prefixedName.replace(/^cms--/, "").replace(/[^\w.:-]/g, "?")),
  };
}

/**
 * How a proxied `cms` tool is registered with this server: as Umbraco's hosted
 * server registers them (the chained tool's own input schema, so the client
 * sees its parameters), with the chained tool's own annotations. Only a tool in
 * `CMS_TOOLS`, each a read, is marked read-only here. The SDK's `ProxiedTool`
 * type omits the annotations the child lists, so they are read from the tool
 * as listed.
 */
export function proxiedToolConfig(pt: ProxiedTool): {
  description: string;
  inputSchema: ZodTypeAny;
  annotations: ToolAnnotations;
} {
  const own = (pt.originalTool as { annotations?: ToolAnnotations }).annotations ?? {};
  const annotations = isAllowed(pt) ? { ...own, readOnlyHint: true } : own;
  return {
    description: `[Proxied from ${pt.serverName}] ${pt.originalTool.description || "No description"}`,
    inputSchema: jsonSchemaObjectToZodObject(pt.originalTool.inputSchema),
    annotations: createToolAnnotations({ annotations } as Parameters<typeof createToolAnnotations>[0]),
  };
}
