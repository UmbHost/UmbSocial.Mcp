/**
 * Every tool of the parity work, against the request it makes: the method, the
 * path, the body, and an answer that fits the tool's output schema exactly.
 */

import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { http, HttpResponse } from "msw";
import { z } from "zod";
import { clearServerRef, DEFAULT_COLLECTION_CONFIG, setServerRef } from "@umbraco-cms/mcp-server-sdk";
import { server } from "../mocks/server.js";
import { applyDefaultOffSlices } from "../config/server-config.js";
import { allCollections } from "../tool-collections.js";
import { callTool, errorBody } from "../session/__tests__/helpers.js";
import { clearSession, toolsFor } from "../session/start-session.js";
import { API, userWith } from "../umbraco-api/tools/social/__tests__/helpers/session.js";
import { aPost } from "../umbraco-api/tools/social/__tests__/helpers/post-builder.js";
import { csvRecords } from "../umbraco-api/tools/social-pro/post-extras.js";

const K = "12121212-1212-4121-8121-121212121212";
const K2 = "13131313-1313-4131-8131-131313131313";
const UTC = "2026-11-10T09:00:00";
const P = "pro";

const tools = allCollections.flatMap((c) => c.tools(undefined));
const tool = (name: string) => {
  const found = tools.find((t) => t.name === name);
  if (!found) throw new Error(`no tool ${name}`);
  return found;
};

const campaign = { key: K, name: "Spring", value: "spring", posts: 3, createdUtc: UTC, lastUsedUtc: null };
const channel = {
  key: K, name: "Page", network: "linkedin", networkName: "LinkedIn", isEnabled: true, isPaused: false, isSwitchedOff: true, sortOrder: 0,
  automateConnectionId: K2, managedAutomationId: K2, metricsAutomationMissing: false, options: { organizationId: "1" }, limits: {},
};
const template = {
  key: K, name: "Offer", text: "Hello", linkUrl: "https://a.test/?b=1&c=2", campaign: { key: K2, name: "S", value: "s" }, channelKeys: [K2],
  createdByUserKey: K, createdUtc: UTC, updatedUtc: UTC, fromAi: true, documentTypeKeys: [],
};
const tag = { key: K, name: "News", colour: "#fff", postCount: 2, updatedUtc: UTC };
const group = { key: K, name: "G", tags: ["#a"], createdUtc: UTC, updatedUtc: UTC, usageCount: 1 };
const settings = {
  timeZoneId: "Europe/London", publishingEnabled: true, environmentName: "Development", includePostTextInWebhooks: false,
  includeAuthorInWebhooks: true, autosaveDrafts: true, xMetricsEnabled: false,
};
const schedule = { timeZoneId: "Europe/London", slots: [{ day: "Monday", localTime: "09:30:00" }], autosaveDrafts: true };
const mapping = { documentTypeKey: K, descriptionAlias: "summary", imageAlias: "image", campaignKey: null };
const utm = { default: "", locked: false };
const links = {
  utmEnabled: true, utmOtherHosts: [], utmOffHosts: [], utmSource: utm, utmMedium: utm, utmCampaign: utm, utmContent: utm,
  utmSourceByNetwork: {}, shortLinksEnabled: true, shortLinkBaseUrl: "", shortLinkPath: "go",
};
const hosts = { domains: ["a.test"], mainHost: "a.test", shortLinkHost: null };
const auto = { optedOut: true, automated: true, canChange: true };
const ai = { profileId: K, contextId: null, sourceHosts: ["a.test"] };
const network = { source: "linkedin", entries: 1, visitors: 1, goals: 0 };
const draft = () => aPost({ key: K, status: "Draft" });
const range = { from: "2026-11-01", to: "2026-11-30" };
const yes = { confirm: true };

interface Case {
  tool: string;
  args?: Record<string, unknown>;
  /** What the site answers, by "METHOD path". The last one named is the call that matters. */
  site: Record<string, unknown>;
  body?: unknown;
  query?: Record<string, string>;
  result?: Record<string, unknown>;
}

const CASES: Case[] = [
  { tool: "get-posting-streak", site: { "GET insights/streak": { weeks: 3, thisWeekPosted: true, best: 9 } }, result: { weeks: 3 } },
  { tool: "get-page-link", args: { pageKey: K, pageCulture: "en-GB" }, site: { "GET links/page": { url: "https://a.test/x", live: true } }, query: { key: K, culture: "en-GB" } },
  { tool: "get-media-link", args: { mediaKey: K }, site: { "GET links/media": { url: "https://a.test/x.pdf", live: true } }, query: { key: K } },

  { tool: "get-campaign", args: { campaignKey: K }, site: { [`GET campaigns/${K}`]: campaign }, result: { createdUtc: `${UTC}Z` } },
  { tool: "update-campaign", args: { campaignKey: K, regenerateValue: true }, site: { [`GET campaigns/${K}`]: campaign, [`PUT campaigns/${K}`]: campaign }, body: { name: "Spring", value: null, regenerateValue: true } },
  { tool: "update-campaign", args: { campaignKey: K, name: "A & B", value: "x", regenerateValue: true }, site: { [`PUT campaigns/${K}`]: campaign }, body: { name: "A & B", value: "x", regenerateValue: false } },
  { tool: "delete-campaign", args: { campaignKey: K, ...yes }, site: { [`GET campaigns/${K}`]: campaign, [`DELETE campaigns/${K}`]: null }, result: { key: K, done: true } },
  { tool: "merge-campaigns", args: { campaignKey: K, intoCampaignKey: K2, ...yes }, site: { [`GET campaigns/${K}`]: campaign, [`GET campaigns/${K2}`]: campaign, [`POST campaigns/${K}/merge`]: null }, body: { targetKey: K2 } },

  { tool: "list-networks", site: { "GET channels/networks": [{ network: "x", displayName: "X", connectionTypeAlias: "x", limits: {} }] }, result: { items: [{ network: "x", displayName: "X" }] } },
  { tool: "list-connections", args: { network: "x" }, site: { "GET channels/connections": [{ id: K, name: "C" }] }, query: { network: "x" }, result: { items: [{ connectionId: K, name: "C" }] } },
  { tool: "get-channel-settings", args: { channelKey: K }, site: { [`GET channels/${K}`]: channel }, result: { connectionId: K2, hasAutomation: true, isSwitchedOff: true, options: { organizationId: "1" } } },
  { tool: "list-option-choices", args: { network: "linkedin", connectionId: K, option: "organizationId" }, site: { "GET channels/option-choices": { choices: [{ id: "1", name: "P" }], message: null } }, query: { network: "linkedin", connectionId: K, option: "organizationId" } },
  { tool: "test-channel-connection", args: { channelKey: K }, site: { [`POST channels/${K}/connection-test`]: { ok: true, message: "Fine" } } },
  { tool: "create-channel", args: { network: "x", name: "N", connectionId: K2 }, site: { "POST channels": { key: K, warnings: ["channel.no_workspace"] } }, body: { network: "x", name: "N", automateConnectionId: K2, options: {} } },
  { tool: "update-channel", args: { channelKey: K, isEnabled: false }, site: { [`GET channels/${K}`]: channel, [`PUT channels/${K}`]: { key: K, warnings: [] } }, body: { name: "Page", isEnabled: false, automateConnectionId: null, options: { organizationId: "1" } }, result: { done: true } },
  { tool: "update-channel", args: { channelKey: K, options: { organizationId: "2" }, ...yes }, site: { [`GET channels/${K}`]: channel, [`PUT channels/${K}`]: { key: K, warnings: [] } }, body: { name: "Page", isEnabled: true, automateConnectionId: null, options: { organizationId: "2" } } },
  { tool: "delete-channel", args: { channelKey: K, ...yes }, site: { [`GET channels/${K}`]: channel, [`DELETE channels/${K}`]: { key: K, warnings: [] } }, result: { done: true } },
  { tool: "create-channel-automation", args: { channelKey: K }, site: { [`POST channels/${K}/automation`]: { key: K, warnings: [] } } },
  { tool: "switch-on-channel", args: { channelKey: K }, site: { [`POST channels/${K}/switch-on`]: { key: K, warnings: [] } } },

  { tool: "get-social-settings", site: { "GET settings": settings } },
  { tool: "update-social-settings", args: { autosaveDrafts: false }, site: { "GET settings": settings, "PUT settings": null }, body: { timeZoneId: "Europe/London", includePostTextInWebhooks: false, includeAuthorInWebhooks: true, autosaveDrafts: false, xMetricsEnabled: false } },
  { tool: "update-schedule", args: { slots: [{ day: "Monday", localTime: "09:30" }] }, site: { "GET schedule": schedule, "PUT schedule": null }, body: { slots: [{ day: "Monday", localTime: "09:30:00" }], timeZoneId: "Europe/London" } },
  { tool: "list-content-mappings", site: { "GET settings/content-mappings": [mapping] } },
  { tool: "save-content-mapping", args: { documentTypeKey: K, imageAlias: null }, site: { "GET settings/content-mappings": [mapping], [`PUT settings/content-mappings/${K}`]: null }, body: { descriptionAlias: "summary", imageAlias: null, campaignKey: null } },
  { tool: "delete-content-mapping", args: { documentTypeKey: K, ...yes }, site: { [`DELETE settings/content-mappings/${K}`]: null } },

  { tool: "create-template", args: { name: "A & B", text: "50% off?" }, site: { [`POST ${P}/templates`]: template }, body: { name: "A & B", text: "50% off?", channelKeys: [], documentTypeKeys: [] }, result: { fromAi: true } },
  { tool: "update-template", args: { templateKey: K, linkUrl: null, text: "New" }, site: { [`GET ${P}/templates/${K}`]: template, [`PUT ${P}/templates/${K}`]: template }, body: { name: "Offer", text: "New", linkUrl: null, campaignKey: K2, channelKeys: [K2], documentTypeKeys: [] } },
  { tool: "duplicate-template", args: { templateKey: K }, site: { [`POST ${P}/templates/${K}/duplicate`]: template } },
  { tool: "delete-template", args: { templateKey: K, ...yes }, site: { [`GET ${P}/templates/${K}`]: template, [`DELETE ${P}/templates/${K}`]: null } },

  { tool: "get-page-auto-post", args: { pageKey: K }, site: { [`GET ${P}/content/${K}/auto-post`]: auto } },
  { tool: "set-page-auto-post", args: { pageKey: K, optedOut: true }, site: { [`PUT ${P}/content/${K}/auto-post`]: auto }, body: { optedOut: true } },
  { tool: "get-post-shortening", args: { key: K }, site: { [`GET ${P}/posts/${K}/shorten`]: { urls: ["https://b.test/"] } } },
  { tool: "set-post-shortening", args: { key: K, urls: ["https://b.test/?a=1&b=2"] }, site: { [`GET posts/${K}`]: draft(), [`PUT ${P}/posts/${K}/shorten`]: { urls: ["https://b.test/?a=1&b=2"] } }, body: { urls: ["https://b.test/?a=1&b=2"] } },
  { tool: "preview-utm", args: { linkUrl: "https://a.test/?a=1&b=2", channelKeys: [K] }, site: { [`POST ${P}/utm/preview`]: [{ channelKey: K, url: "https://a.test/", reason: null, source: "s", medium: "m", campaign: null, content: null }] }, body: { linkUrl: "https://a.test/?a=1&b=2", channelKeys: [K], disabled: false, scheduledForUtc: null } },

  { tool: "create-tag", args: { name: "News" }, site: { [`POST ${P}/tags`]: tag }, body: { name: "News" } },
  { tool: "update-tag", args: { tagKey: K, name: "Old" }, site: { [`GET ${P}/tags/${K}`]: tag, [`PUT ${P}/tags/${K}`]: tag }, body: { name: "Old", colour: "#fff" } },
  { tool: "delete-tag", args: { tagKey: K, ...yes }, site: { [`GET ${P}/tags/${K}`]: tag, [`DELETE ${P}/tags/${K}`]: null } },
  { tool: "create-hashtag-group", args: { name: "G", tags: ["#a"] }, site: { [`POST ${P}/hashtags`]: group }, body: { name: "G", tags: ["#a"] } },
  { tool: "update-hashtag-group", args: { hashtagGroupKey: K, tags: ["#b"] }, site: { [`GET ${P}/hashtags/${K}`]: group, [`PUT ${P}/hashtags/${K}`]: group }, body: { name: "G", tags: ["#b"] } },
  { tool: "delete-hashtag-group", args: { hashtagGroupKey: K, ...yes }, site: { [`GET ${P}/hashtags/${K}`]: group, [`DELETE ${P}/hashtags/${K}`]: null } },
  { tool: "update-short-link", args: { shortLinkCode: "abc", pageKey: K, ...yes }, site: { [`PUT ${P}/short-links/abc`]: null }, body: { url: null, contentKey: K, culture: null, suffix: null } },
  { tool: "delete-short-link", args: { shortLinkCode: "abc", ...yes }, site: { [`DELETE ${P}/short-links/abc`]: null } },

  { tool: "get-approval-settings", site: { [`GET ${P}/settings/approvals`]: { approvalsEnabled: true, allowSelfApproval: false } } },
  { tool: "update-approval-settings", args: { approvalsEnabled: true }, site: { [`GET ${P}/settings/approvals`]: { approvalsEnabled: false, allowSelfApproval: false }, [`PUT ${P}/settings/approvals`]: { approvalsEnabled: true, allowSelfApproval: false } }, body: { approvalsEnabled: true, allowSelfApproval: false }, result: { done: true } },
  { tool: "get-link-settings", site: { [`GET ${P}/settings/links/site-hosts`]: hosts, [`GET ${P}/settings/links`]: links }, result: { siteHosts: hosts } },
  { tool: "update-link-settings", args: { utmEnabled: false }, site: { [`GET ${P}/settings/links`]: links, [`PUT ${P}/settings/links`]: links }, body: { ...links, utmEnabled: false } },
  { tool: "get-channel-schedule", args: { channelKey: K }, site: { [`GET ${P}/channels/${K}/schedule`]: { slots: schedule.slots } } },
  { tool: "update-channel-schedule", args: { channelKey: K, slots: [{ day: "Friday", localTime: "17:00" }] }, site: { [`PUT ${P}/channels/${K}/schedule`]: { slots: [] } }, body: { slots: [{ day: "Friday", localTime: "17:00:00" }] } },
  { tool: "list-content-automations", site: { [`GET ${P}/content-automations`]: [{ automationId: K, documentTypeKey: K2, documentTypeName: null, name: "A", enabled: true, workspaceName: null }] } },
  { tool: "create-content-automation", args: { documentTypeKey: K, mode: "Draft", ...yes }, site: { [`POST ${P}/content-automations`]: { automationId: K2, workspaceName: "W" } }, body: { documentTypeKey: K, mode: "Draft", channelKeys: [], templateKey: null, allCultures: false }, result: { done: true, automationId: K2, workspaceName: "W" } },

  { tool: "get-ai-status", site: { [`GET ${P}/ai/status`]: { configured: true, startFromLink: false } } },
  { tool: "draft-post-with-ai", args: { brief: "A & B?", channelKeys: [K] }, site: { [`POST ${P}/ai/draft`]: { key: K, version: K2 } }, body: { brief: "A & B?", channelKeys: [K] }, result: { status: "Draft" } },
  { tool: "rewrite-text-with-ai", args: { key: K, text: "T", channelKeys: [K2] }, site: { [`GET posts/${K}`]: draft(), [`POST ${P}/ai/rewrite`]: { text: "U", version: K2 } }, body: { postKey: K, channelKey: K2, channelKeys: [K2], text: "T", instruction: null } },
  { tool: "suggest-alt-text", args: { key: K, mediaKey: K2 }, site: { [`GET posts/${K}`]: draft(), [`POST ${P}/ai/alt-text`]: { text: "A dog", version: K2 } }, body: { postKey: K, mediaKey: K2 } },
  { tool: "get-ai-settings", site: { [`GET ${P}/ai/options`]: { profiles: [{ id: K, name: "P", model: "m" }], contexts: [], hasConnection: true }, [`GET ${P}/ai/settings`]: ai } },
  { tool: "update-ai-settings", args: { contextId: K2 }, site: { [`GET ${P}/ai/settings`]: ai, [`PUT ${P}/ai/settings`]: ai }, body: { profileId: K, contextId: K2, sourceHosts: ["a.test"] } },

  { tool: "get-engage-status", site: { [`GET ${P}/engage/status`]: {} }, result: { goal: null } },
  { tool: "get-engage-overview", args: range, site: { [`GET ${P}/engage/social/overview`]: { days: [{ day: "2026-11-01", network: "x", visits: 1 }], networks: [network], campaigns: [], posts: [], goals: [], networkDays: [], funnel: { linkClicks: 1, visits: 1, goals: 0 } } }, query: range },
  { tool: "get-engage-campaign-figures", args: { campaignKey: K, ...range }, site: { [`GET ${P}/engage/campaigns/${K}/figures`]: { reportsExist: true, networks: [network] } }, query: range },
  { tool: "get-engage-campaign-series", args: { campaignKey: K, ...range }, site: { [`GET ${P}/engage/campaigns/${K}/series`]: { name: "S", reportsExist: true, points: [] } }, query: range },
  { tool: "get-engage-target-figures", args: { targetId: 5 }, site: { [`GET ${P}/engage/targets/5/figures`]: { campaign: null, source: null, reportsExist: true, network: null, campaignKey: null } } },
  { tool: "get-engage-post-figures", args: { postKeys: [K] }, site: { [`POST ${P}/engage/posts/figures`]: [{ postKey: K, visits: 1, goals: [], channels: [{ channelKey: K2, visits: 1, goals: [], links: [{ code: "abc", clicks: 1, visits: 1 }] }] }] }, body: { postKeys: [K] } },
  { tool: "get-engage-short-link-visits", args: { shortLinkCodes: ["abc"] }, site: { [`POST ${P}/engage/short-links/visits`]: [{ code: "abc", visits: 1 }] }, body: { shortLinkCodes: ["abc"] } },
];

interface Call {
  call: string;
  body: unknown;
  query: Record<string, string>;
}

function site(replies: Record<string, unknown>): Call[] {
  const calls: Call[] = [];
  for (const [call, reply] of Object.entries(replies)) {
    const [method, path] = call.split(" ") as [string, string];
    server.use(
      http[method.toLowerCase() as "get"](`${API}/${path}`, async ({ request }) => {
        const text = await request.text();
        calls.push({ call, body: text ? JSON.parse(text) : undefined, query: Object.fromEntries(new URL(request.url).searchParams) });
        return reply === null ? new HttpResponse(null, { status: 200 }) : HttpResponse.json(reply as never);
      }),
    );
  }
  return calls;
}

afterEach(() => {
  clearSession();
  clearServerRef();
  jest.restoreAllMocks();
});

describe("the tools' calls", () => {
  it.each(CASES.map((c) => [c.tool, c] as const))("%s", async (name, { args = {}, site: replies, body, query, result }) => {
    const t = tool(name);
    // What an assistant sends passes the tool's own input schema.
    if (t.inputSchema) expect(z.object(t.inputSchema).safeParse(args).error).toBeUndefined();
    const calls = site(replies);

    const answer = await callTool(t, args);

    expect(answer.isError).toBeFalsy();
    const last = Object.keys(replies).at(-1)!;
    const main = calls.filter((c) => c.call === last);
    expect(main.length).toBeGreaterThan(0);
    if (body !== undefined) expect(main[0]!.body).toEqual(body);
    if (query) expect(main[0]!.query).toEqual(query);
    expect(z.strictObject((t.outputSchema as z.ZodObject).shape).safeParse(answer.structuredContent).error).toBeUndefined();
    if (result) expect(answer.structuredContent).toMatchObject(result);
  });
});

const ASKED = [
  ...CASES.filter((c) => c.args?.confirm === true),
  {
    tool: "update-approval-settings",
    args: { approvalsEnabled: false },
    site: { [`GET ${P}/settings/approvals`]: { approvalsEnabled: true, allowSelfApproval: false }, [`PUT ${P}/settings/approvals`]: {} },
  },
  {
    tool: "update-approval-settings",
    args: { allowSelfApproval: true },
    site: { [`GET ${P}/settings/approvals`]: { approvalsEnabled: true, allowSelfApproval: false }, [`PUT ${P}/settings/approvals`]: {} },
  },
  {
    tool: "update-link-settings",
    args: { shortLinkBaseUrl: "https://elsewhere.test" },
    site: { [`GET ${P}/settings/links`]: links, [`PUT ${P}/settings/links`]: links },
  },
];

describe("a person is asked first", () => {
  it.each(ASKED.map((c) => [c.tool, c] as const))("%s", async (name, { args, site: replies }) => {
    const { confirm: _, ...unconfirmed } = { confirm: undefined, ...args } as Record<string, unknown>;
    const last = Object.keys(replies).at(-1)!;
    const calls = site(replies);

    // A client that can't ask, and no confirm: refused.
    expect((errorBody(await callTool(tool(name), unconfirmed)) as { codes: string[] }).codes).toEqual(["confirmation.required"]);

    // A client that asks, and the person says no, whatever confirm says.
    const elicitInput = jest.fn(async () => ({ action: "decline" }));
    setServerRef({ getClientCapabilities: () => ({ elicitation: { form: {} } }), elicitInput } as never);
    const declined = await callTool(tool(name), { ...unconfirmed, confirm: true });

    expect(elicitInput).toHaveBeenCalledTimes(1);
    expect(declined.isError).toBeFalsy();
    expect(declined.structuredContent).toMatchObject({ done: false, message: expect.any(String) });
    expect(z.strictObject((tool(name).outputSchema as z.ZodObject).shape).safeParse(declined.structuredContent).error).toBeUndefined();
    expect(calls.filter((c) => c.call === last)).toEqual([]);
  });
});

describe("what stays a person's", () => {
  it.each(["rewrite-text-with-ai", "suggest-alt-text", "set-post-shortening"])("%s_leaves_a_scheduled_post_alone", async (name) => {
    site({ [`GET posts/${K}`]: aPost({ key: K, status: "Scheduled" }) });
    const args = { key: K, mediaKey: K2, text: "T", channelKeys: [K2], urls: [] };

    expect((errorBody(await callTool(tool(name), args)) as { codes: string[] }).codes).toEqual(["post.not_draft"]);
  });

  it("automatic_posting_is_never_set_up_to_go_straight_on_the_calendar", () => {
    const mode = tool("create-content-automation").inputSchema!.mode as z.ZodEnum;
    expect(mode.safeParse("Queue").success).toBe(false);
    expect(mode.safeParse("AwaitingApproval").success).toBe(true);
  });

  it("a_short_link_code_cannot_leave_its_path", () => {
    expect(tool("delete-short-link").inputSchema!.shortLinkCode.safeParse("../tags/x").success).toBe(false);
  });

  it("template_tools_say_the_text_is_ais", () => {
    for (const name of ["create-template", "update-template", "duplicate-template"]) {
      expect(tool(name).description).toMatch(/marked on the server as written with AI for good/);
    }
  });
});

describe("the manage and settings slices", () => {
  const names = (verbs: string[], enabled: Array<"manage" | "settings"> = []) =>
    toolsFor(allCollections, userWith(...verbs), applyDefaultOffSlices(DEFAULT_COLLECTION_CONFIG, new Set(enabled))).map((t) => t.tool.name);
  const inSlice = (slice: string) => tools.filter((t) => t.slices?.includes(slice)).map((t) => t.name);

  it("are_off_unless_named_and_need_manage_settings", () => {
    for (const slice of ["manage", "settings"] as const) {
      const own = inSlice(slice);
      expect(own.length).toBeGreaterThan(10);
      expect(names(["ManageSettings"]).filter((n) => own.includes(n))).toEqual([]);
      expect(names(["ManageSettings"], [slice]).filter((n) => own.includes(n)).sort()).toEqual([...own].sort());
      expect(names(["View", "Write", "Schedule", "Approve", "UseAi", "Resolve"], [slice]).filter((n) => own.includes(n))).toEqual([]);
      for (const name of own) expect(tool(name).description).toContain(`Off unless UMBSOCIAL_ENABLE_SLICES names ${slice}.`);
    }
  });

  it("nothing_that_changes_settings_is_on_by_default", () => {
    const on = tools.filter((t) => t.enabled?.(userWith("ManageSettings") as never) && !t.enabled(userWith("View", "Write", "UseAi", "Approve", "Resolve") as never));
    for (const t of on.filter((x) => !x.slices?.some((s) => s === "manage" || s === "settings"))) {
      expect([t.name, t.annotations?.readOnlyHint]).toEqual([t.name, true]);
    }
  });

  it("drafting_with_ai_needs_both_permissions", () => {
    expect(names(["UseAi"])).not.toContain("draft-post-with-ai");
    expect(names(["Write"])).not.toContain("draft-post-with-ai");
    expect(names(["UseAi", "Write"])).toContain("draft-post-with-ai");
  });
});

describe("the fields added to the post tools", () => {
  it("links_that_follow_a_page_and_framing_are_sent", async () => {
    const calls = site({ "POST posts": { key: K, version: K2 } });
    const framing = { focalPoint: { left: 0.5, top: 0.2 }, crops: [{ network: "x", left: 0.1, top: 0, right: 0.1, bottom: 0 }] };
    const args = { text: "https://a.test/p", channelKeys: [K], mediaKey: K2, imageFraming: framing, pageLinks: [{ url: "https://a.test/p", pageKey: K2 }] };

    expect((await callTool(tool("create-post"), args)).isError).toBeFalsy();

    expect(calls[0]!.body).toMatchObject({ imageFraming: framing, links: [{ url: "https://a.test/p", contentKey: K2, culture: null }] });
  });

  it("update_keeps_or_replaces_them", async () => {
    const version = "56565656-5656-4565-8565-565656565656";
    const kept = [{ url: "https://a.test/p", contentKey: K2, culture: null }];
    const post = aPost({ key: K, status: "Draft", version, links: kept, imageFraming: { focalPoint: null, crops: [] } });
    const calls = site({ [`GET posts/${K}`]: post, [`PUT posts/${K}`]: { key: K, version } });

    await callTool(tool("update-post"), { key: K, version, text: "x" });
    await callTool(tool("update-post"), { key: K, version, pageLinks: [], imageFraming: null });

    const bodies = calls.filter((c) => c.call.startsWith("PUT")).map((c) => c.body as Record<string, unknown>);
    expect(bodies[0]).toMatchObject({ links: kept, imageFraming: { focalPoint: null, crops: [] } });
    expect(bodies[1]).toMatchObject({ links: [], imageFraming: null });
  });

  it("list_posts_asks_by_planned_release_and_history", async () => {
    const calls = site({ "GET posts": [] });
    await callTool(tool("list-posts"), { plannedFromUtc: "2026-11-01T00:00:00Z", plannedToUtc: "2026-12-01T00:00:00Z", unplanned: true });
    await callTool(tool("list-posts"), { history: true });

    expect(calls[0]!.query).toEqual({ plannedFromUtc: "2026-11-01T00:00:00.000Z", plannedToUtc: "2026-12-01T00:00:00.000Z", unplanned: "true" });
    expect(calls[1]!.query).toMatchObject({ history: "true", fromUtc: expect.any(String) });
  });
});

describe("export-history", () => {
  const csv = '﻿When,Text\r\n2026-11-01,"a, ""b""\r\nc"\r\n2026-11-02,d\r\n2026-11-03,e\r\n';

  it("gives_whole_records_a_page_at_a_time", async () => {
    server.use(http.get(`${API}/pro/history/export`, () => new HttpResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8" } })));
    const args = { fromUtc: "2026-11-01T00:00:00Z", toUtc: "2026-11-30T00:00:00Z", limit: 2 };

    const first = (await callTool(tool("export-history"), args)).structuredContent;
    const second = (await callTool(tool("export-history"), { ...args, offset: 2 })).structuredContent;

    expect(first).toEqual({ columns: ["When", "Text"], rows: [["2026-11-01", 'a, "b"\r\nc'], ["2026-11-02", "d"]], total: 3, nextOffset: 2 });
    expect(second).toMatchObject({ rows: [["2026-11-03", "e"]], nextOffset: null });
  });

  it("reads_an_empty_export", () => {
    expect(csvRecords("")).toEqual([]);
    expect(csvRecords("a,b")).toEqual([["a", "b"]]);
  });
});
