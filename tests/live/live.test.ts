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
const DEFAULT_OFF = ["approve-post", "return-post", "retry-post-target", "mark-post-target-published", "delete-campaign", "create-tag", "update-social-settings", "create-channel"];
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

  constructor(baseUrl: string, user: Login, chaining: boolean, slices = "") {
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
        UMBSOCIAL_ENABLE_SLICES: slices,
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
  let managed: LiveServer;
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
    managed = new LiveServer(FULL_URL, allLogin, false, "manage,settings");
    core = new LiveServer(CORE_URL, coreLogin, false);

    const channels = await vw.ok<{ items: { key: string }[] }>("list-channels");
    if (channels.items.length === 0) throw new Error("The Full site has no channels: add a mock channel first.");
    channelKey = channels.items[0].key;
  });

  afterAll(async () => {
    // Anything a check left behind, as far as the tools may delete it.
    for (const { server, key } of made) {
      await server().call("delete-post", { key, confirm: true }).catch(() => undefined);
    }
    await Promise.all([vw?.close(), all?.close(), managed?.close(), core?.close()]);
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

    // The test client can't be asked to confirm, so the tool refuses until the caller passes confirm: true.
    expect(await vw.refused("delete-post", { key })).toContain("confirmation.required");
    expect(await vw.ok("delete-post", { key, confirm: true })).toMatchObject({ key, deleted: true });
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

    expect(await core.ok("get-social-edition")).toMatchObject({ hasSection: true,
      edition: { isLicensed: false },
      addOns: {
        pro: { installed: false, usable: false, reason: "The UmbSocial.Pro package isn't installed on this site." },
        ai: { installed: false, usable: false },
        engage: { installed: false, usable: false },
      },
    });
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

    const imageFraming = { focalPoint: { left: 0.5, top: 0.25 }, crops: [] };
    const key = await draft(() => vw, { mediaKey: image.id, imageAltText: "A picture for the live check", imageFraming });
    expect(await vw.ok("get-post", { key })).toMatchObject({ mediaKey: image.id, imageFraming, status: "Draft", origin: "Ai" });
    expect(await vw.ok("get-media-link", { mediaKey: image.id })).toMatchObject({ url: expect.stringMatching(/^https:/) });
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

  it("manage_and_settings_are_off_unless_enabled", async () => {
    const off = ["delete-campaign", "create-tag", "update-schedule", "delete-channel", "update-approval-settings"];
    expect((await all.toolNames()).filter((name) => off.includes(name))).toEqual([]);
    expect((await managed.toolNames()).filter((name) => off.includes(name)).sort()).toEqual([...off].sort());
  });

  it("every_add_on_says_whether_it_can_be_used", async () => {
    const { addOns } = await all.ok("get-social-edition");
    expect(addOns.pro).toMatchObject({ installed: true, licensed: true, usable: true });
    const names = await all.toolNames();
    expect(names.includes("draft-post-with-ai")).toBe(addOns.ai.usable === true);
    expect(names.includes("get-engage-overview")).toBe(addOns.engage.usable === true);
    console.log(JSON.stringify(addOns));
    // View + Write may not ask about AI, and isn't told it is missing.
    const { addOns: seen } = await vw.ok("get-social-edition");
    expect(seen.ai.installed).toBe(addOns.ai.installed);
  });

  it("a_template_round_trip", async () => {
    const { key, fromAi } = await vw.ok("create-template", { name: `Live ${stamp()}`, text: "50% off & more?", channelKeys: [channelKey] });
    expect(fromAi).toBe(true);
    await vw.ok("update-template", { templateKey: key, text: "Changed" });
    expect(await vw.ok("get-template", { templateKey: key })).toMatchObject({ text: "Changed", channelKeys: [channelKey] });
    const copy = await vw.ok("duplicate-template", { templateKey: key });
    const post = await vw.ok("create-post-from-template", { templateKey: copy.key });
    made.push({ server: () => vw, key: post.key });
    expect(await vw.ok("get-post", { key: post.key })).toMatchObject({ origin: "Ai", status: "Draft" });
    for (const templateKey of [key, copy.key]) {
      expect(await vw.refused("delete-template", { templateKey })).toContain("confirmation.required");
      expect(await vw.ok("delete-template", { templateKey, confirm: true })).toMatchObject({ done: true });
    }
  });

  it("links_and_shortening_round_trip", async () => {
    const pageKey = (await vw.ok<{ items: { id: string }[] }>("cms--get-document-root")).items[0].id;
    const { url } = await vw.ok("get-page-link", { pageKey });
    const key = await draft(() => vw, {
      text: `See ${url}`,
      pageLinks: [{ url, pageKey }],
    });
    const post = await vw.ok("get-post", { key });
    expect(post.links).toEqual([expect.objectContaining({ contentKey: pageKey })]);
    expect(await vw.ok("set-post-shortening", { key, urls: ["https://example.com/?a=1&b=2"] })).toEqual({ urls: ["https://example.com/?a=1&b=2"] });
    expect(await vw.ok("get-post-shortening", { key })).toEqual({ urls: ["https://example.com/?a=1&b=2"] });
    expect((await vw.ok("preview-utm", { linkUrl: "https://example.com/?a=1", channelKeys: [channelKey] })).items).toHaveLength(1);
    await vw.ok("list-posts", { unplanned: true });
    await vw.ok("list-posts", { history: true });

    // Reading is View's; changing needs Umbraco's permission on the page too, which the site may refuse this user.
    const auto = await vw.ok("get-page-auto-post", { pageKey });
    const set = await vw.call("set-page-auto-post", { pageKey, optedOut: auto.optedOut });
    expect(set.isError ? (dataOf(set) as { codes: string[] }).codes : ["page.no_access"]).toContain("page.no_access");
  });

  it("the_streak_and_the_history_export", async () => {
    expect(await vw.ok("get-posting-streak")).toMatchObject({ weeks: expect.any(Number) });
    const range = { fromUtc: new Date(Date.now() - 86_400_000 * 30).toISOString(), toUtc: new Date(Date.now() + 86_400_000).toISOString() };
    const exported = await vw.ok("export-history", { ...range, limit: 1 });
    expect(exported.columns.length).toBeGreaterThan(2);
    for (const row of exported.rows) expect(row).toHaveLength(exported.columns.length);
    expect(await vw.refused("export-history", { fromUtc: "2020-01-01T00:00:00Z", toUtc: range.toUtc })).toContain("history.range_too_long");
  });

  it("campaigns_are_managed", async () => {
    const a = await managed.ok("create-campaign", { name: `Live A ${stamp()}`, value: `live-a-${Date.now()}` });
    const b = await managed.ok("create-campaign", { name: `Live B ${stamp()}` });
    const renamed = await managed.ok("update-campaign", { campaignKey: a.key, name: `Live C ${stamp()}` });
    expect(renamed.value).toBe(a.value);
    expect(await managed.ok("get-campaign", { campaignKey: a.key })).toMatchObject({ name: renamed.name });
    expect(await managed.refused("merge-campaigns", { campaignKey: a.key, intoCampaignKey: b.key })).toContain("confirmation.required");
    expect(await managed.ok("merge-campaigns", { campaignKey: a.key, intoCampaignKey: b.key, confirm: true })).toMatchObject({ done: true });
    expect(await managed.refused("get-campaign", { campaignKey: a.key })).toContain("campaign.not_found");
    expect(await managed.ok("delete-campaign", { campaignKey: b.key, confirm: true })).toMatchObject({ done: true });
  });

  it("tags_and_hashtag_groups_are_managed", async () => {
    const tag = await managed.ok("create-tag", { name: `live${Date.now()}` });
    expect(await managed.ok("update-tag", { tagKey: tag.key, name: `live2${Date.now()}` })).toMatchObject({ colour: tag.colour });
    expect(await managed.ok("delete-tag", { tagKey: tag.key, confirm: true })).toMatchObject({ done: true });
    const group = await managed.ok("create-hashtag-group", { name: `Live ${stamp()}`, tags: ["#one"] });
    expect(await managed.ok("update-hashtag-group", { hashtagGroupKey: group.key, tags: ["#two"] })).toMatchObject({ name: group.name });
    expect(await managed.ok("delete-hashtag-group", { hashtagGroupKey: group.key, confirm: true })).toMatchObject({ done: true });
    expect(await managed.refused("delete-short-link", { shortLinkCode: "nosuchcode", confirm: true })).toContain("short_link.not_found");
    expect((await managed.refused("update-short-link", { shortLinkCode: "nosuchcode", url: "https://example.com", confirm: true })).length).toBeGreaterThan(0);
  });

  it("channels_are_set_up_tested_and_removed", async () => {
    const networks = (await managed.ok("list-networks")).items as { network: string }[];
    expect(networks.length).toBeGreaterThan(0);
    const settings = await managed.ok("get-channel-settings", { channelKey });
    const own = (await managed.ok("list-channels")).items.map((c: { key: string }) => c.key) as string[];
    // A channel on a mock connection, so nothing reaches a network.
    let mock: { network: string; connectionId: string; options: Record<string, string> } | undefined;
    for (const key of own) {
      const c = await managed.ok("get-channel-settings", { channelKey: key });
      if (c.connectionId) mock ??= c;
    }
    if (!mock) throw new Error("No connected channel: connect one to the mock network.");
    expect((await managed.ok("list-connections", { network: mock.network })).items).toContainEqual(expect.objectContaining({ connectionId: mock.connectionId }));
    const made = await managed.ok("create-channel", { network: mock.network, name: `Live ${stamp()}`, connectionId: mock.connectionId, options: mock.options });
    const channelKeyMade = made.key;
    try {
      expect(await managed.ok("update-channel", { channelKey: channelKeyMade, name: "Live renamed", isEnabled: false })).toMatchObject({ done: true });
      expect(await managed.refused("update-channel", { channelKey: channelKeyMade, options: mock.options })).toContain("confirmation.required");
      expect(await managed.ok("update-channel", { channelKey: channelKeyMade, options: mock.options, confirm: true })).toMatchObject({ done: true });
      expect(await managed.ok("get-channel-settings", { channelKey: channelKeyMade })).toMatchObject({ name: "Live renamed", isEnabled: false });
      expect(await managed.ok("test-channel-connection", { channelKey: channelKeyMade })).toMatchObject({ ok: expect.any(Boolean) });
      await managed.ok("create-channel-automation", { channelKey: channelKeyMade });
      await managed.call("switch-on-channel", { channelKey: channelKeyMade });
      await managed.ok("list-option-choices", { network: "linkedin", connectionId: mock.connectionId, option: "organizationId" });
      const slots = [{ day: "Monday", localTime: "09:30" }];
      expect((await managed.ok("update-channel-schedule", { channelKey: channelKeyMade, slots })).slots).toHaveLength(1);
      expect((await managed.ok("get-channel-schedule", { channelKey: channelKeyMade })).slots).toHaveLength(1);
    } finally {
      expect(await managed.ok("delete-channel", { channelKey: channelKeyMade, confirm: true })).toMatchObject({ done: true });
    }
    expect(settings.key).toBe(channelKey);
  });

  it("site_settings_are_saved_as_they_were", async () => {
    const settings = await managed.ok("get-social-settings");
    expect(await managed.ok("update-social-settings", { autosaveDrafts: !settings.autosaveDrafts })).toMatchObject({ autosaveDrafts: !settings.autosaveDrafts });
    expect(await managed.ok("update-social-settings", { autosaveDrafts: settings.autosaveDrafts })).toEqual(settings);
    const schedule = await managed.ok("get-schedule");
    expect(await managed.ok("update-schedule", { slots: schedule.slots })).toEqual(schedule);
    const links = await managed.ok("get-link-settings");
    expect(await managed.ok("update-link-settings", { utmEnabled: links.utmEnabled })).toMatchObject({ done: true, utmEnabled: links.utmEnabled });
    expect(await managed.refused("update-link-settings", { shortLinkPath: "elsewhere" })).toContain("confirmation.required");
    const approvals = await managed.ok("get-approval-settings");
    expect(approvals.approvalsEnabled).toBe(true);
    expect(await managed.refused("update-approval-settings", { approvalsEnabled: false })).toContain("confirmation.required");
    expect(await managed.ok("update-approval-settings", { approvalsEnabled: true })).toMatchObject({ done: true });
    await managed.ok("list-content-automations");
  });

  it("with_approvals_off_an_api_user_still_cant_put_its_post_on_the_calendar", async () => {
    await managed.ok("update-approval-settings", { approvalsEnabled: false, confirm: true });
    try {
      const refusal = await raw(FULL_URL, allLogin, "POST", "posts", { text: `Live check ${stamp()}`, channels: { [channelKey]: null }, when: "Queue" });
      expect(refusal.header).toContain("ai.needs_review");
    } finally {
      await managed.ok("update-approval-settings", { approvalsEnabled: true });
    }
  });

  it("mappings_and_automatic_posting_are_set_up", async () => {
    const pageKey = (await vw.ok<{ items: { id: string }[] }>("cms--get-document-root")).items[0].id;
    const { documentTypeKey } = await managed.ok("get-page-share", { documentKey: pageKey });
    const before = (await managed.ok("list-content-mappings")).items.find((m: { documentTypeKey: string }) => m.documentTypeKey === documentTypeKey);
    if (!before) {
      const campaign = await managed.ok("create-campaign", { name: `Live map ${stamp()}` });
      await managed.ok("save-content-mapping", { documentTypeKey, campaignKey: campaign.key });
      expect((await managed.ok("list-content-mappings")).items).toContainEqual(expect.objectContaining({ documentTypeKey, campaignKey: campaign.key }));
      expect(await managed.ok("delete-content-mapping", { documentTypeKey, confirm: true })).toMatchObject({ done: true });
      await managed.ok("delete-campaign", { campaignKey: campaign.key, confirm: true });
    }
    expect(await managed.refused("create-content-automation", { documentTypeKey, mode: "Draft" })).toContain("confirmation.required");
  });

  it("ai_drafts_rewrites_and_describes", async () => {
    const { addOns } = await all.ok("get-social-edition");
    if (!addOns.ai.usable) return;
    expect(await all.ok("get-ai-status")).toMatchObject({ configured: true });
    const { key } = await all.ok("draft-post-with-ai", { brief: "An offer & a question?", channelKeys: [channelKey] });
    made.push({ server: () => all, key });
    expect(await all.ok("get-post", { key })).toMatchObject({ origin: "Ai", status: "Draft" });
    expect((await all.ok("rewrite-text-with-ai", { key, text: "Say this", channelKeys: [channelKey] })).text).toEqual(expect.any(String));
    const settings = await managed.ok("get-ai-settings");
    expect(await managed.ok("update-ai-settings", { sourceHosts: settings.sourceHosts })).toMatchObject({ sourceHosts: settings.sourceHosts });
    await all.call("suggest-alt-text", { key, mediaKey: key });
  });

  it("engage_figures_are_read", async () => {
    const { addOns } = await all.ok("get-social-edition");
    if (!addOns.engage.usable) return;
    const range = { from: new Date(Date.now() - 86_400_000 * 20).toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10) };
    await all.ok("get-engage-status");
    await all.ok("get-engage-overview", range);
    const campaign = await all.ok("create-campaign", { name: "Live engage" });
    await all.ok("get-engage-campaign-figures", { campaignKey: campaign.key, ...range });
    await all.ok("get-engage-campaign-series", { campaignKey: campaign.key, ...range });
    await all.ok("get-engage-target-figures", { targetId: 1 });
    await all.ok("get-engage-post-figures", { postKeys: [campaign.key] });
    await all.ok("get-engage-short-link-visits", { shortLinkCodes: ["abc"] });
    expect(await all.refused("get-engage-overview", { from: "2020-01-01", to: range.to })).toContain("engage.range_invalid");
    await managed.ok("delete-campaign", { campaignKey: campaign.key, confirm: true });
  });
});
