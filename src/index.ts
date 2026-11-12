#!/usr/bin/env node
/**
 * UmbSocial MCP server: entry point (stdio).
 */

import "./load-env.js";
import { McpServer, type ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import packageJson from "../package.json" with { type: "json" };
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  initializeUmbracoFetch,
  createToolAnnotations,
  createCollectionConfigLoader,
  shouldIncludeTool,
  handleCliCommands,
  checkUmbracoVersion,
  configureVersionCheckHook,
  getVersionCheckMessage,
  registerToolCollection,
  configureApiClient,
  discoverProxiedTools,
  createProxyHandler,
  jsonSchemaObjectToZodObject,
  UmbracoManagementClient,
  CAPTURE_RAW_HTTP_RESPONSE,
  SERVER_INFORMATION_PATH,
  useDraft202012ToolSchemas,
  type CollectionConfiguration,
  type HttpResponse,
} from "@umbraco-cms/mcp-server-sdk";

import { collections } from "./collections.js";
import { getSocialApi } from "./umbraco-api/api/client.js";
import { mcpClientManager } from "./umbraco-api/mcp-client.js";
import { mcpServers } from "./config/mcp-servers.js";
import {
  allModes,
  allModeNames,
  allSliceNames,
  applyDefaultOffSlices,
  clearConfigCache,
  ConfigError,
  loadServerConfig,
  loadSocialConfig,
  UMBRACO_TARGET_MAJOR,
  type SocialConfig,
} from "./config/index.js";

const SERVER_NAME = "umbsocial-mcp";

// ============================================================================
// Configuration
// ============================================================================

// The SDK's offline introspection flags work without credentials, as they do
// in `getServerConfig`, so the check is skipped for them.
const INTROSPECTION_FLAGS = ["--list-tools", "--describe-tool", "--generate-context", "--debug-config"];
const introspectionOnly = process.argv.some((arg) =>
  INTROSPECTION_FLAGS.some((flag) => arg === flag || arg.startsWith(`${flag}=`)),
);

let socialConfig: SocialConfig | null = null;
if (!introspectionOnly) {
  try {
    socialConfig = loadSocialConfig(process.env);
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(`${SERVER_NAME}: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
}

// A config the SDK refuses (e.g. TLS verification turned off for a remote
// site) is rethrown after the offline CLI commands below, so they still work
// to diagnose it.
let fetchInitError: unknown;
if (socialConfig) {
  try {
    initializeUmbracoFetch({
      baseUrl: socialConfig.baseUrl.href,
      clientId: socialConfig.clientId,
      clientSecret: socialConfig.clientSecret,
    });
  } catch (error) {
    fetchInitError = error;
  }
}

// The SDK's API helpers (executeGetApiCall and the rest) call the generated client.
configureApiClient(() => getSocialApi());

clearConfigCache();
const serverConfig = await loadServerConfig(true);

const configLoader = createCollectionConfigLoader({
  modeRegistry: allModes,
  allModeNames,
  allSliceNames,
});

const filterConfig: CollectionConfiguration = applyDefaultOffSlices(
  configLoader.loadFromConfig(serverConfig.umbraco),
  socialConfig?.enabledSlices ?? new Set(),
);

// ============================================================================
// CLI introspection (prints and exits when a flag is set)
// ============================================================================

if (fetchInitError && serverConfig.cliFlags?.callTool) throw fetchInitError;

await handleCliCommands(collections, {
  cliFlags: serverConfig.cliFlags,
  serverName: SERVER_NAME,
  serverVersion: packageJson.version,
  filterConfig,
  serverConfig: serverConfig.umbraco,
});

if (fetchInitError) throw fetchInitError;

// ============================================================================
// Version check
// ============================================================================
//
// A different Umbraco major blocks the first tool call with a warning until the
// user retries (`configureVersionCheckHook`), and the warning is folded into
// the server's instructions. `UMBRACO_EXPECTED_MAJOR` overrides the target.
if (socialConfig) {
  await checkUmbracoVersion({
    mcpVersion: packageJson.version,
    expectedUmbracoMajor: serverConfig.custom.expectedUmbracoMajor ?? UMBRACO_TARGET_MAJOR,
    client: {
      getServerInformation: async () => {
        const response = (await UmbracoManagementClient<{ version: string }>(
          { url: SERVER_INFORMATION_PATH, method: "GET" },
          CAPTURE_RAW_HTTP_RESPONSE,
        )) as unknown as HttpResponse<{ version: string }>;
        return { version: response.data.version };
      },
    },
  });
  configureVersionCheckHook();
}

const versionCheckMessage = getVersionCheckMessage();

// ============================================================================
// MCP server and tools
// ============================================================================

const server = new McpServer(
  { name: SERVER_NAME, version: packageJson.version },
  versionCheckMessage ? { instructions: versionCheckMessage } : undefined,
);

let registeredToolCount = 0;

for (const collection of collections) {
  const collectionName = collection.metadata.name;
  const tools = collection.tools({});

  for (const tool of tools) {
    if (!shouldIncludeTool(tool, { collectionName, config: filterConfig })) {
      continue;
    }

    registerToolCollection(tool.name, collectionName);

    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        annotations: createToolAnnotations(tool),
      },
      tool.handler as ToolCallback<typeof tool.inputSchema>,
    );

    registeredToolCount++;
  }
}

// ============================================================================
// The chained CMS server (read-only, narrowed; see config/mcp-servers.ts)
// ============================================================================

async function registerChainedTools(): Promise<number> {
  if (!socialConfig) return 0;

  const chained = mcpServers(socialConfig);
  for (const config of chained) {
    mcpClientManager.registerServer(config);
  }
  if (chained.length === 0) return 0;

  try {
    const proxiedTools = await discoverProxiedTools(mcpClientManager);
    for (const pt of proxiedTools) {
      // As Umbraco's hosted server registers them: the chained tool's own input
      // schema, so the client sees its parameters.
      server.registerTool(
        pt.prefixedName,
        {
          description: `[Proxied from ${pt.serverName}] ${pt.originalTool.description || "No description"}`,
          inputSchema: jsonSchemaObjectToZodObject(pt.originalTool.inputSchema),
        },
        // The SDK types the proxy's result loosely; the chained server returns MCP results.
        createProxyHandler(mcpClientManager, pt.serverName, pt.originalTool.name) as never,
      );
    }
    return proxiedTools.length;
  } catch (error) {
    // Social tools still work without the chained server.
    console.error(`${SERVER_NAME}: the chained CMS server's tools aren't available:`, error);
    return 0;
  }
}

async function main() {
  const chainedToolCount = await registerChainedTools();

  // After every registerTool call, so the "tools" capability is advertised.
  useDraft202012ToolSchemas(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `${SERVER_NAME} started with ${registeredToolCount} tool(s) from ${collections.length} collection(s)` +
      ` and ${chainedToolCount} chained CMS tool(s)`,
  );
}

async function shutdown() {
  await mcpClientManager.disconnectAll();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch((error) => {
  console.error(`${SERVER_NAME}: failed to start:`, error);
  process.exit(1);
});
