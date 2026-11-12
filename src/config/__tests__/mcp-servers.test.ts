import { afterEach, describe, expect, it } from "@jest/globals";
import type { SocialConfig } from "../server-config.js";
import { CMS_ID_TOOLS, mcpServers } from "../mcp-servers.js";

const config: SocialConfig = {
  baseUrl: new URL("https://cms.example.com/"),
  clientId: "umbraco-back-office-social",
  clientSecret: "a-secret-value",
  enabledSlices: new Set(),
  chaining: true,
};

const FILTER_VARS = [
  "UMBRACO_TOOL_MODES",
  "UMBRACO_INCLUDE_SLICES",
  "UMBRACO_EXCLUDE_SLICES",
  "UMBRACO_INCLUDE_TOOL_COLLECTIONS",
  "UMBRACO_EXCLUDE_TOOL_COLLECTIONS",
  "UMBRACO_EXCLUDE_TOOLS",
];

describe("the chained CMS server", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("the_chained_cms_server_is_read_only_and_pinned", () => {
    const servers = mcpServers(config);

    expect(servers).toHaveLength(1);
    const cms = servers[0];
    if (cms.transport === "in-process") throw new Error("expected a stdio server");

    expect(cms.name).toBe("cms");
    expect(cms.command).toBe("npx");
    expect(cms.args).toEqual(["-y", "@umbraco-cms/mcp-dev@17.6.12"]);
    expect(cms.proxyTools).toBe(true);
    expect(cms.env?.UMBRACO_READONLY).toBe("true");

    const included = (cms.env?.UMBRACO_INCLUDE_TOOLS ?? "").split(",");
    expect(included.sort()).toEqual([...CMS_ID_TOOLS.media, ...CMS_ID_TOOLS.document].sort());
    expect(included).toHaveLength(8);

    expect(cms.env?.UMBRACO_BASE_URL).toBe("https://cms.example.com");
    expect(cms.env?.UMBRACO_CLIENT_ID).toBe(config.clientId);
    expect(cms.env?.UMBRACO_CLIENT_SECRET).toBe(config.clientSecret);
  });

  it("chaining_off_starts_no_child_server", () => {
    expect(mcpServers({ ...config, chaining: false })).toEqual([]);
  });

  it("our_filters_do_not_reach_the_chained_server", () => {
    process.env.UMBRACO_TOOL_MODES = "social";
    process.env.UMBRACO_INCLUDE_SLICES = "read";
    process.env.UMBRACO_EXCLUDE_SLICES = "approve";
    process.env.UMBRACO_INCLUDE_TOOL_COLLECTIONS = "social";
    process.env.UMBRACO_EXCLUDE_TOOL_COLLECTIONS = "social-pro";
    process.env.UMBRACO_EXCLUDE_TOOLS = "get-media-root";
    process.env.UMBRACO_INCLUDE_TOOLS = "list-posts";
    process.env.UMBRACO_READONLY = "false";

    const cms = mcpServers(config)[0];
    if (cms.transport === "in-process") throw new Error("expected a stdio server");
    // How the SDK's StdioConnection builds the child's environment.
    const childEnv = { ...process.env, ...cms.env };

    for (const name of FILTER_VARS) {
      expect({ name, value: childEnv[name] }).toEqual({ name, value: "" });
    }
    expect(childEnv.UMBRACO_INCLUDE_TOOLS?.split(",")).toHaveLength(8);
    expect(childEnv.UMBRACO_READONLY).toBe("true");
  });
});
