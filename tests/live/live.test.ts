/**
 * Live checks: the built server (`dist/index.js`) against running sites, over
 * stdio, with no model. Skipped unless UMBSOCIAL_LIVE=1. See README.md here
 * for the set-up and the variables.
 */

import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import path from "node:path";
import { createMcpClientManager, type McpClientManager } from "@umbraco-cms/mcp-server-sdk";
import { socialProCollection } from "../../src/umbraco-api/tools/social-pro/index.js";

const live = process.env.UMBSOCIAL_LIVE === "1";
const describeLive = live ? describe : describe.skip;

const SERVER = path.resolve("dist/index.js");
const FULL_URL = (process.env.UMBSOCIAL_LIVE_FULL_URL ?? "https://localhost:44391").replace(/\/+$/, "");
const CORE_URL = (process.env.UMBSOCIAL_LIVE_CORE_URL ?? "https://localhost:44390").replace(/\/+$/, "");

/** Every tool that must stay off unless UMBSOCIAL_ENABLE_SLICES names its slice. */
const DEFAULT_OFF = ["approve-post", "return-post", "retry-post-target", "mark-post-target-published"];
const PRO_TOOLS = socialProCollection.tools(undefined).map((tool) => tool.name);

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the live checks (see tests/live/README.md).`);
  return value;
}

interface Login {
  clientId: string;
  clientSecret: string;
}

function login(prefix: string): Login {
  return { clientId: required(`${prefix}_CLIENT_ID`), clientSecret: required(`${prefix}_CLIENT_SECRET`) };
}

type ToolResult = Awaited<ReturnType<McpClientManager["callTool"]>>;

/** One server process for one API user on one site. */
class LiveServer {
  private readonly manager = createMcpClientManager();

  constructor(baseUrl: string, user: Login, chaining: boolean) {
    this.manager.registerServer({
      name: "social",
      command: process.execPath,
      args: [SERVER],
      env: {
        // The site's development certificate is trusted from the system store; TLS checks stay on.
        NODE_OPTIONS: "--use-system-ca",
        UMBRACO_BASE_URL: baseUrl,
        UMBRACO_CLIENT_ID: user.clientId,
        UMBRACO_CLIENT_SECRET: user.clientSecret,
        DISABLE_MCP_CHAINING: chaining ? "false" : "true",
        // Whatever the caller's shell has set, these checks see the defaults.
        UMBSOCIAL_ENABLE_SLICES: "",
        UMBRACO_TOOL_MODES: "",
        UMBRACO_INCLUDE_SLICES: "",
        UMBRACO_EXCLUDE_SLICES: "",
        UMBRACO_INCLUDE_TOOL_COLLECTIONS: "",
        UMBRACO_EXCLUDE_TOOL_COLLECTIONS: "",
        UMBRACO_INCLUDE_TOOLS: "",
        UMBRACO_EXCLUDE_TOOLS: "",
        UMBRACO_READONLY: "",
      },
    });
  }

  async toolNames(): Promise<string[]> {
    return (await this.manager.listTools("social")).tools.map((tool) => tool.name);
  }

  async inputProperties(name: string): Promise<string[]> {
    const tool = (await this.manager.listTools("social")).tools.find((t) => t.name === name);
    return Object.keys((tool?.inputSchema?.properties as Record<string, unknown> | undefined) ?? {});
  }

  call(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
    return this.manager.callTool("social", name, args);
  }

  /** A tool call that must succeed; returns its data. */
  async ok<T = any>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const result = await this.call(name, args);
    if (result.isError) throw new Error(`${name} failed: ${result.content[0]?.text}`);
    return dataOf(result) as T;
  }

  /** A tool call that must be refused; returns the refusal's codes. */
  async refused(name: string, args: Record<string, unknown> = {}): Promise<string[]> {
    const result = await this.call(name, args);
    if (!result.isError) throw new Error(`${name} was expected to be refused, but returned ${result.content[0]?.text}`);
    return (dataOf(result) as { codes?: string[] }).codes ?? [];
  }

  close(): Promise<void> {
    return this.manager.disconnectAll();
  }
}

function dataOf(result: ToolResult): unknown {
  return result.structuredContent ?? JSON.parse(result.content[0]?.text ?? "null");
}

/** A Management API call made directly, for what the tools deliberately can't send. */
async function raw(baseUrl: string, user: Login, method: string, route: string, body?: unknown) {
  const api = `${baseUrl}/umbraco/management/api/v1`;
  const tokenResponse = await fetch(`${api}/security/back-office/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: user.clientId, client_secret: user.clientSecret }),
  });
  if (!tokenResponse.ok) throw new Error(`The token request was refused (${tokenResponse.status}).`);
  const { access_token } = (await tokenResponse.json()) as { access_token: string };

  const response = await fetch(`${api}/umbsocial/${route}`, {
    method,
    headers: { authorization: `Bearer ${access_token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    header: decodeURIComponent(response.headers.get("x-umbsocial-codes") ?? ""),
    body: text ? (JSON.parse(text) as { codes?: string[] }) : null,
  };
}

const stamp = () => new Date().toISOString();

describeLive("live checks", () => {
  let vw: LiveServer;
  let all: LiveServer;
  let core: LiveServer;
  let allLogin: Login;
  let channelKey: string;
  const made: { server: () => LiveServer; key: string }[] = [];

  async function draft(server: () => LiveServer, args: Record<string, unknown> = {}): Promise<string> {
    const created = await server().ok<{ key: string; status: string }>("create-post", {
      text: `Live check ${stamp()}`,
      channelKeys: [channelKey],
      ...args,
    });
    made.push({ server, key: created.key });
    return created.key;
  }

  beforeAll(async () => {
    const vwLogin = login("UMBSOCIAL_LIVE_VW");
    allLogin = login("UMBSOCIAL_LIVE_ALL");
    const coreLogin = login("UMBSOCIAL_LIVE_CORE");
    vw = new LiveServer(FULL_URL, vwLogin, true);
    all = new LiveServer(FULL_URL, allLogin, false);
    core = new LiveServer(CORE_URL, coreLogin, false);

    const channels = await vw.ok<{ items: { key: string }[] }>("list-channels");
    if (channels.items.length === 0) throw new Error("The Full site has no channels: add a mock channel first.");
    channelKey = channels.items[0].key;
  });

  afterAll(async () => {
    // Anything a check left behind, as far as the tools may delete it.
    for (const { server, key } of made) {
      await server().call("delete-post", { key }).catch(() => undefined);
    }
    await Promise.all([vw?.close(), all?.close(), core?.close()]);
  });

  it("tools_list_matches_the_user_and_edition", async () => {
    const names = await vw.toolNames();

    expect(names).toEqual(expect.arrayContaining(["get-social-edition", "list-posts", "create-post", "update-post"]));
    // Pro is licensed on the Full site.
    expect(names).toEqual(expect.arrayContaining(["list-templates", "submit-post-for-approval", "list-tags"]));
    // The chained CMS tools, read-only.
    expect(names).toEqual(expect.arrayContaining(["cms--get-media-root", "cms--search-document"]));
    // Off by default, and ManageSettings only.
    for (const off of [...DEFAULT_OFF, "list-short-links"]) expect(names).not.toContain(off);

    // No writing tool can choose a time.
    for (const tool of ["create-post", "update-post"]) {
      const inputs = await vw.inputProperties(tool);
      expect(inputs).not.toContain("when");
      expect(inputs).not.toContain("atUtc");
    }

    const edition = await vw.ok("get-social-edition");
    expect(edition).toMatchObject({ hasSection: true, edition: { isLicensed: true }, verbs: ["View", "Write"] });
  });

  it("a_draft_round_trip", async () => {
    const key = await draft(() => vw);

    const post = await vw.ok("get-post", { key });
    expect(post).toMatchObject({ key, status: "Draft", origin: "Ai" });

    const text = `Changed by the live check ${stamp()}`;
    const updated = await vw.ok("update-post", { key, version: post.version, text });
    expect(updated).toMatchObject({ key, status: "Draft" });
    expect(updated.version).not.toBe(post.version);

    const again = await vw.ok("get-post", { key });
    expect(again).toMatchObject({ text, status: "Draft", origin: "Ai" });

    const check = await vw.ok("check-post", { key, text, channelKeys: [channelKey] });
    expect(check.errors).toEqual([]);

    // The test client can't be asked to confirm, so the tool goes ahead.
    expect(await vw.ok("delete-post", { key })).toMatchObject({ key, deleted: true });
    expect(await vw.refused("get-post", { key })).toContain("post.not_found");
  });

  it("an_api_user_cannot_put_a_post_on_the_calendar", async () => {
    const key = await draft(() => all);
    const before = await all.ok("get-post", { key });
    expect(before).toMatchObject({ status: "Draft", origin: "Ai" });

    // Even with every verb, the site refuses an API user's post anything but a draft.
    // The tools can't send `when`, so this goes straight to the API.
    const put = await raw(FULL_URL, allLogin, "PUT", `posts/${key}`, {
      text: before.text,
      channels: { [channelKey]: null },
      when: "Queue",
      version: before.version,
    });
    expect(put.status).toBe(403);
    expect(put.header).toContain("ai.needs_review");

    const now = await raw(FULL_URL, allLogin, "POST", "posts", {
      text: `Live check ${stamp()}`,
      channels: { [channelKey]: null },
      when: "Now",
    });
    expect(now.status).toBe(403);
    expect(now.header).toContain("ai.needs_review");

    const after = await all.ok("get-post", { key });
    expect(after).toMatchObject({ status: "Draft", version: before.version });
  });

  it("submit_for_approval_moves_it_to_awaiting_approval", async () => {
    const key = await draft(() => vw);

    const submitted = await vw.call("submit-post-for-approval", { key });
    if (submitted.isError) {
      throw new Error(`Submitting was refused (turn approvals on, see README.md): ${submitted.content[0]?.text}`);
    }
    expect(dataOf(submitted)).toMatchObject({ key, status: "AwaitingApproval" });
    expect(await vw.ok("get-post", { key })).toMatchObject({ status: "AwaitingApproval", origin: "Ai" });
  });

  it("on_the_core_site_no_pro_tools_are_listed", async () => {
    const names = await core.toolNames();

    expect(names).toEqual(expect.arrayContaining(["get-social-edition", "list-posts", "create-post"]));
    expect(PRO_TOOLS.length).toBeGreaterThan(0);
    for (const pro of PRO_TOOLS) expect(names).not.toContain(pro);

    expect(await core.ok("get-social-edition")).toMatchObject({ hasSection: true, edition: { isLicensed: false } });
  });

  it("cms_media_tool_finds_a_key_create_post_accepts", async () => {
    type MediaItem = { id: string; hasChildren: boolean; mediaType: { icon?: string } };
    const isFolder = (item: MediaItem) => item.mediaType.icon === "icon-folder";

    // Browse from the user's media start node until something that isn't a folder turns up.
    let image: MediaItem | undefined;
    const queue: MediaItem[] = (await vw.ok<{ items: MediaItem[] }>("cms--get-media-root")).items;
    while (queue.length > 0 && !image) {
      const item = queue.shift()!;
      if (!isFolder(item)) {
        image = item;
      } else if (item.hasChildren) {
        queue.push(...(await vw.ok<{ items: MediaItem[] }>("cms--get-media-children", { parentId: item.id, take: 50 })).items);
      }
    }
    if (!image) throw new Error("No media item under the API user's media start node: add an image there.");

    const key = await draft(() => vw, { mediaKey: image.id, imageAltText: "A picture for the live check" });
    expect(await vw.ok("get-post", { key })).toMatchObject({ mediaKey: image.id, status: "Draft", origin: "Ai" });
  });

  it("a_page_tied_draft_keeps_its_delay", async () => {
    const root = await vw.ok<{ items: { id: string }[] }>("cms--get-document-root");
    if (root.items.length === 0) throw new Error("No page under the API user's document start node.");
    const pageKey = root.items[0].id;

    const key = await draft(() => vw, { pageKey, pageDelayMinutes: 60 });

    const post = await vw.ok("get-post", { key });
    expect(post).toMatchObject({ status: "Draft", origin: "Ai", page: { contentKey: pageKey, delayMinutes: 60 } });
  });

  it("update_post_refuses_a_scheduled_post_without_a_put", async () => {
    const scheduled = await all.ok<{ items: { key: string }[] }>("list-posts", {
      status: "Scheduled",
      fromUtc: new Date().toISOString(),
      toUtc: new Date(Date.now() + 365 * 86_400_000).toISOString(),
    });
    if (scheduled.items.length === 0) {
      throw new Error("No scheduled post: as a person, schedule one in the backoffice first (see README.md).");
    }
    const key = scheduled.items[0].key;
    const before = await all.ok("get-post", { key });

    // The all-verbs user could demote it with a raw PUT; the tools refuse first.
    expect(await all.refused("update-post", { key, version: before.version, text: `Live check ${stamp()}` })).toContain(
      "post.not_draft",
    );
    expect(await all.refused("delete-post", { key })).toContain("post.not_draft");

    const after = await all.ok("get-post", { key });
    expect(after).toMatchObject({ status: "Scheduled", origin: before.origin, version: before.version, text: before.text });
  });
});
