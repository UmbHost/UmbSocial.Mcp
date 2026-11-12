import { afterEach, describe, expect, it } from "@jest/globals";
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import type { ProxiedTool } from "@umbraco-cms/mcp-server-sdk";
import type { SocialConfig } from "../server-config.js";
import { NO_ENV_FILE } from "../env-file.js";
import { allowlisted, CMS_ID_TOOLS, CMS_MCP_PACKAGE, CMS_MCP_VERSION, cmsServerScript, mcpServers, proxiedToolConfig } from "../mcp-servers.js";

const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8")) as Record<string, any>;

const proxied = (name: string, annotations?: Record<string, unknown>): ProxiedTool =>
  ({
    prefixedName: `cms--${name}`,
    serverName: "cms",
    originalTool: { name, description: `The ${name} tool`, inputSchema: { type: "object", properties: {} }, annotations },
  }) as ProxiedTool;

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
    expect(cms.args?.[0]).toBe(cmsServerScript());
    // Its SDK reads .env from the working directory unless told otherwise.
    expect(cms.args?.slice(1)).toEqual([`--env=${NO_ENV_FILE}`]);
    expect(cms.proxyTools).toBe(true);
    expect(cms.env?.UMBRACO_READONLY).toBe("true");

    const included = (cms.env?.UMBRACO_INCLUDE_TOOLS ?? "").split(",");
    expect(included.sort()).toEqual([...CMS_ID_TOOLS.media, ...CMS_ID_TOOLS.document].sort());
    expect(included).toHaveLength(8);

    expect(cms.env?.UMBRACO_BASE_URL).toBe("https://cms.example.com");
    expect(cms.env?.UMBRACO_CLIENT_ID).toBe(config.clientId);
    expect(cms.env?.UMBRACO_CLIENT_SECRET).toBe(config.clientSecret);
  });

  it("the_chained_server_is_spawned_with_node_and_not_npx", () => {
    const cms = mcpServers(config)[0];
    if (cms.transport === "in-process") throw new Error("expected a stdio server");

    // The Node running this server, so no PATH lookup or registry fetch happens at start.
    expect(cms.command).toBe(process.execPath);
    expect(basename(cms.command).toLowerCase()).toMatch(/^node(\.exe)?$/);
    expect([cms.command, ...(cms.args ?? [])].join(" ")).not.toMatch(/npx|npm/);
  });

  it("the_chained_server_runs_from_the_installed_package", () => {
    const script = cmsServerScript();
    expect(existsSync(script)).toBe(true);
    expect(script.replace(/\\/g, "/")).toContain(`node_modules/${CMS_MCP_PACKAGE}/`);
  });

  it("mcp_dev_is_an_exact_dependency_pinned_in_the_shrinkwrap", () => {
    const manifest = readJson("package.json");
    expect(manifest.dependencies[CMS_MCP_PACKAGE]).toBe(CMS_MCP_VERSION);
    expect(CMS_MCP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);

    // Published with the package, so users install our exact transitive versions.
    expect(existsSync("npm-shrinkwrap.json")).toBe(true);
    expect(existsSync("package-lock.json")).toBe(false);
    const shrinkwrap = readJson("npm-shrinkwrap.json");
    expect(shrinkwrap.packages[""].dependencies[CMS_MCP_PACKAGE]).toBe(CMS_MCP_VERSION);
    const locked = shrinkwrap.packages[`node_modules/${CMS_MCP_PACKAGE}`];
    expect(locked.version).toBe(CMS_MCP_VERSION);
    expect(locked.integrity).toMatch(/^sha512-/);

    // Every entry is from the public registry with an integrity hash.
    for (const [path, entry] of Object.entries(shrinkwrap.packages as Record<string, { resolved?: string; integrity?: string }>)) {
      if (path === "") continue;
      expect({ path, resolved: entry.resolved?.startsWith("https://registry.npmjs.org/") }).toEqual({ path, resolved: true });
      expect({ path, integrity: Boolean(entry.integrity) }).toEqual({ path, integrity: true });
    }

    // The installed copy is the pinned one.
    expect(readJson(`node_modules/${CMS_MCP_PACKAGE}/package.json`).version).toBe(CMS_MCP_VERSION);
  });

  it("every_dependency_is_pinned_exactly", () => {
    const manifest = readJson("package.json");
    for (const [name, version] of Object.entries({ ...manifest.dependencies, ...manifest.devDependencies } as Record<string, string>)) {
      expect({ name, exact: /^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version) }).toEqual({ name, exact: true });
    }
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

describe("proxied cms tools", () => {
  it("proxied_cms_tools_are_marked_read_only", () => {
    const registration = proxiedToolConfig({
      prefixedName: "cms--get-media-root",
      serverName: "cms",
      originalTool: {
        name: "get-media-root",
        description: "Gets the media root",
        inputSchema: { type: "object", properties: {} },
      },
    });

    expect(registration.annotations.readOnlyHint).toBe(true);
    expect(registration.description).toBe("[Proxied from cms] Gets the media root");
  });

  it("an_unlisted_child_tool_is_dropped", () => {
    const tools = [proxied("get-media-root"), proxied("delete-document"), proxied("search-document"), proxied("get-media-by-id")];

    const { allowed, dropped } = allowlisted(tools);

    expect(allowed.map((t) => t.originalTool.name)).toEqual(["get-media-root", "search-document", "get-media-by-id"]);
    expect(dropped).toEqual(["delete-document"]);
  });

  it("a_tool_named_like_an_allowed_one_from_another_server_is_dropped", () => {
    const other = { ...proxied("get-media-root"), serverName: "other", prefixedName: "other--get-media-root" } as ProxiedTool;

    expect(allowlisted([other]).dropped).toEqual(["other--get-media-root"]);
  });

  it("the_child_annotations_are_kept_and_read_only_is_forced_for_allowed_reads", () => {
    const registration = proxiedToolConfig(
      proxied("get-document-root", { readOnlyHint: false, idempotentHint: true, title: "Document root" }),
    );

    expect(registration.annotations).toMatchObject({ readOnlyHint: true, idempotentHint: true, title: "Document root" });
  });

  it("an_unlisted_tool_never_gets_read_only_from_us", () => {
    const registration = proxiedToolConfig(proxied("delete-document", { destructiveHint: true }));

    expect(registration.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
  });
});
