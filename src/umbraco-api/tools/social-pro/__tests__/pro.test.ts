import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { http, HttpResponse } from "msw";
import { clearServerRef, DEFAULT_COLLECTION_CONFIG, setServerRef } from "@umbraco-cms/mcp-server-sdk";
import { allCollections as collections } from "../../../../tool-collections.js";
import { applyDefaultOffSlices } from "../../../../config/server-config.js";
import { server } from "../../../../mocks/server.js";
import { AI_WRITTEN_NOTICE } from "../../../../session/notices.js";
import { callTool, EDITION_PATH, errorBody, UNLICENSED, USER_PATH } from "../../../../session/__tests__/helpers.js";
import { clearSession, startSession, toolsFor } from "../../../../session/start-session.js";
import { API, signIn, userWith } from "../../social/__tests__/helpers/session.js";
import { aPost } from "../../social/__tests__/helpers/post-builder.js";
import approvePost from "../post/approve-post.js";
import returnPost from "../post/return-post.js";
import submitPostForApproval from "../post/submit-post-for-approval.js";
import createPostFromTemplate from "../post/create-post-from-template.js";
import getShortLinkClicks from "../post/get-short-link-clicks.js";
import listTags from "../get/list-tags.js";
import getPostTags from "../get/get-post-tags.js";
import getMetricsTrend from "../get/get-metrics-trend.js";
import listTemplates from "../get/list-templates.js";
import setPostTags from "../put/set-post-tags.js";
import setPostUtm from "../put/set-post-utm.js";
import getPostUtm from "../get/get-post-utm.js";
import { REFUSAL_HINTS } from "../../../../session/refusals.js";

const PRO = `${API}/pro`;
const POST = "12121212-1212-4121-8121-121212121212";
const OTHER = "13131313-1313-4131-8131-131313131313";
const TEMPLATE = "14141414-1414-4141-8141-141414141414";
const PAGE = "15151515-1515-4151-8151-151515151515";
const TAG = "16161616-1616-4161-8161-161616161616";
const DOC_TYPE = "17171717-1717-4171-8171-171717171717";
const VERSION = "56565656-5656-4565-8565-565656565656";
const SAVED = { key: POST, version: VERSION };

const PRO_TOOL_NAMES = [
  "get-hashtag-group",
  "get-metrics-trend",
  "get-post-short-links",
  "get-post-tags",
  "get-post-utm",
  "get-short-link-clicks",
  "get-tag",
  "get-template",
  "list-hashtags",
  "list-short-links",
  "list-tags",
  "list-templates",
  "create-post-from-template",
  "set-post-tags",
  "set-post-utm",
  "submit-post-for-approval",
].sort();

const field = (locked: boolean, value = "") => ({ default: value, locked });
const utmFields = (locked: string[] = []) => ({
  enabled: true,
  source: field(locked.includes("source"), "umbraco"),
  medium: field(locked.includes("medium"), "social"),
  campaign: field(locked.includes("campaign")),
  content: field(locked.includes("content")),
  shortenedHosts: [],
});

/** The post read back as a draft, so the UTM and tag tools may change it. */
const draftPost = () => http.get(`${API}/posts/${POST}`, () => HttpResponse.json(aPost({ key: POST, status: "Draft" })));

const ALL_VERBS = ["View", "Write", "Schedule", "Approve", "UseAi", "Resolve", "ManageSettings"];

const proNames = (config: Parameters<typeof toolsFor>[2], ...verbs: string[]) =>
  toolsFor(collections, userWith(...verbs), config)
    .filter((t) => t.collectionName === "social-pro")
    .map((t) => t.tool.name)
    .sort();

const off = applyDefaultOffSlices(DEFAULT_COLLECTION_CONFIG, new Set());
const on = applyDefaultOffSlices(DEFAULT_COLLECTION_CONFIG, new Set(["approve"]));

afterEach(() => {
  clearSession();
  clearServerRef();
  jest.restoreAllMocks();
});

describe("the Pro tools", () => {
  it("pro_tools_register_only_when_licensed", async () => {
    await signIn(...ALL_VERBS);
    expect(proNames(off, ...ALL_VERBS)).toEqual(PRO_TOOL_NAMES);

    clearSession();
    server.use(
      http.get(USER_PATH, () => HttpResponse.json(userWith(...ALL_VERBS))),
      http.get(EDITION_PATH, () => HttpResponse.json(UNLICENSED)),
    );
    await startSession();
    expect(proNames(on, ...ALL_VERBS)).toEqual([]);
  });

  it("a_lapsed_licence_is_a_clear_tool_error", async () => {
    server.use(
      http.get(`${PRO}/tags`, () =>
        HttpResponse.json({ status: 403 }, { status: 403, headers: { "X-UmbSocial-Codes": "licence.pro_required" } }),
      ),
    );

    const body = errorBody(await callTool(listTags)) as { codes: string[]; hint: string };

    expect(body.codes).toEqual(["licence.pro_required"]);
    expect(body.hint).toMatch(/UmbSocial Pro/);
  });

  it("approve_and_return_are_absent_by_default", () => {
    expect(proNames(off, ...ALL_VERBS)).not.toContain("approve-post");
    expect(proNames(off, ...ALL_VERBS)).not.toContain("return-post");
    expect(proNames(on, "Approve")).toEqual(["approve-post", "return-post"]);
    expect(proNames(on, "Write", "View", "Schedule")).not.toContain("approve-post");
    expect(approvePost.slices).toEqual(["approve"]);
    expect(returnPost.slices).toEqual(["approve"]);
  });

  it("approve_post_takes_on_page_publish_and_a_delay", async () => {
    let body: unknown;
    server.use(
      http.post(`${PRO}/posts/${POST}/approve`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(SAVED);
      }),
    );

    const result = await callTool(approvePost, {
      key: POST,
      expectedVersion: VERSION,
      when: "OnPagePublish",
      pageDelayMinutes: 60,
      confirm: true,
    });

    expect(result.isError).toBeFalsy();
    expect(body).toEqual({ when: "OnPagePublish", atUtc: null, pageDelayMinutes: 60, expectedVersion: VERSION });
    expect(result.structuredContent).toEqual({ ...SAVED, approved: true });

    expect(approvePost.inputSchema!.when.safeParse("Draft").success).toBe(false);
    expect(approvePost.inputSchema!.pageDelayMinutes.safeParse(30).success).toBe(false);
  });

  it("approve_post_asks_first_when_the_client_can", async () => {
    let called = 0;
    server.use(
      http.post(`${PRO}/posts/${POST}/approve`, () => {
        called++;
        return HttpResponse.json(SAVED);
      }),
    );
    const elicitInput = jest.fn(async () => ({ action: "decline" }));
    setServerRef({ getClientCapabilities: () => ({ elicitation: { form: {} } }), elicitInput } as never);

    const result = await callTool(approvePost, { key: POST, expectedVersion: VERSION, when: "Now" });

    expect(elicitInput).toHaveBeenCalledTimes(1);
    expect(called).toBe(0);
    expect(result.structuredContent).toEqual({ key: POST, approved: false, message: expect.any(String) });
  });

  it("approve_post_refuses_at_without_a_future_time_before_asking", async () => {
    const elicitInput = jest.fn(async () => ({ action: "accept", content: { confirm: true } }));
    setServerRef({ getClientCapabilities: () => ({ elicitation: { form: {} } }), elicitInput } as never);

    for (const atUtc of [undefined, "2020-01-01T00:00:00Z"]) {
      const body = errorBody(
        await callTool(approvePost, { key: POST, expectedVersion: VERSION, when: "At", ...(atUtc ? { atUtc } : {}) }),
      ) as { codes: string[]; hint: string };
      expect(body.codes).toEqual(["schedule.past"]);
      expect(body.hint).toMatch(/get the post again/i);
    }
    expect(elicitInput).not.toHaveBeenCalled();
    expect(REFUSAL_HINTS["schedule.past"]).toMatch(/get the post again/i);
  });

  it("approve_post_refuses_a_delay_without_on_page_publish", async () => {
    const body = errorBody(
      await callTool(approvePost, { key: POST, expectedVersion: VERSION, when: "Queue", pageDelayMinutes: 60 }),
    ) as { codes: string[] };

    expect(body.codes).toEqual(["input.delay_needs_page_publish"]);
  });

  it("page_culture_is_at_most_20_characters", () => {
    expect(createPostFromTemplate.inputSchema!.pageCulture.safeParse("en-GB").success).toBe(true);
    expect(createPostFromTemplate.inputSchema!.pageCulture.safeParse("x".repeat(21)).success).toBe(false);
  });

  it("approve_post_description_says_off_by_default_and_a_person_approves", () => {
    expect(approvePost.description).toMatch(/off unless UMBSOCIAL_ENABLE_SLICES/);
    expect(approvePost.description).toMatch(/person should approve .* Umbraco backoffice/);
    expect(approvePost.description).toMatch(/refuses an API user approving a post written with AI/);
    expect(approvePost.description).toMatch(/Now publishes .* at once/);
    expect(approvePost.description).toContain("Social Approve permission");
    expect(approvePost.annotations).toMatchObject({ openWorldHint: true });
  });

  it("return_post_sends_the_note_and_version", async () => {
    let body: unknown;
    server.use(
      http.post(`${PRO}/posts/${POST}/return`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(SAVED);
      }),
    );

    const result = await callTool(returnPost, { key: POST, expectedVersion: VERSION, note: "Shorter, please? & no emoji" });

    expect(result.isError).toBeFalsy();
    expect(body).toEqual({ note: "Shorter, please? & no emoji", expectedVersion: VERSION });
  });

  it("submit_post_for_approval_posts_the_key", async () => {
    let called = 0;
    server.use(
      http.post(`${PRO}/posts/${POST}/submit`, () => {
        called++;
        return HttpResponse.json(SAVED);
      }),
    );

    const result = await callTool(submitPostForApproval, { key: POST });

    expect(called).toBe(1);
    expect(result.structuredContent).toEqual({ ...SAVED, status: "AwaitingApproval" });
    expect(submitPostForApproval.description).toContain("Social Write permission");
  });

  it("create_post_from_template_calls_the_server_endpoint", async () => {
    let body: unknown;
    let other = 0;
    server.use(
      http.post(`${PRO}/templates/${TEMPLATE}/post`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(SAVED);
      }),
      http.get(`${PRO}/templates/${TEMPLATE}`, () => {
        other++;
        return HttpResponse.json({});
      }),
      http.post(`${API}/posts`, () => {
        other++;
        return HttpResponse.json(SAVED);
      }),
    );

    const result = await callTool(createPostFromTemplate, { templateKey: TEMPLATE, pageKey: PAGE, pageCulture: "en-GB" });

    expect(result.isError).toBeFalsy();
    expect(body).toEqual({ sourceContentKey: PAGE, sourceCulture: "en-GB" });
    expect(other).toBe(0);
    expect(result.structuredContent).toEqual({ ...SAVED, status: "Draft" });
    expect(createPostFromTemplate.description).toContain(AI_WRITTEN_NOTICE);
  });

  it("list_templates_filters_by_document_type", async () => {
    let query: URLSearchParams | undefined;
    server.use(
      http.get(`${PRO}/templates`, ({ request }) => {
        query = new URL(request.url).searchParams;
        return HttpResponse.json({ total: 0, items: [] });
      }),
    );

    await callTool(listTemplates, { documentTypeKey: DOC_TYPE });

    expect(query?.get("documentType")).toBe(DOC_TYPE);
  });

  it("set_post_utm_keeps_unspecified_fields", async () => {
    let saved: Record<string, unknown> | undefined;
    server.use(
      draftPost(),
      http.get(`${PRO}/posts/${POST}/utm`, () =>
        HttpResponse.json({ source: "mastodon", medium: "social", content: "launch", disabled: false }),
      ),
      http.get(`${PRO}/utm/fields`, () => HttpResponse.json(utmFields())),
      http.put(`${PRO}/posts/${POST}/utm`, async ({ request }) => {
        saved = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(saved);
      }),
    );

    const result = await callTool(setPostUtm, { key: POST, medium: "organic", content: null });

    expect(result.isError).toBeFalsy();
    expect(saved).toEqual({ source: "mastodon", medium: "organic", content: null, disabled: false });
    expect(result.structuredContent).toEqual({ ...saved, locked: [] });
  });

  it("a_field_locked_after_it_was_stored_does_not_stop_saving_another", async () => {
    let saved: Record<string, unknown> | undefined;
    server.use(
      draftPost(),
      http.get(`${PRO}/posts/${POST}/utm`, () =>
        HttpResponse.json({ source: "mastodon", medium: "social", content: "launch", disabled: false }),
      ),
      http.get(`${PRO}/utm/fields`, () => HttpResponse.json(utmFields(["source", "medium"]))),
      http.put(`${PRO}/posts/${POST}/utm`, async ({ request }) => {
        saved = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(saved);
      }),
    );

    const result = await callTool(setPostUtm, { key: POST, content: "autumn" });

    expect(result.isError).toBeFalsy();
    expect(saved).toEqual({ source: null, medium: null, content: "autumn", disabled: false });
    expect(result.structuredContent).toEqual({ ...saved, locked: ["source", "medium"] });
  });

  it("get_post_utm_marks_the_locked_fields", async () => {
    server.use(
      http.get(`${PRO}/posts/${POST}/utm`, () =>
        HttpResponse.json({ source: "mastodon", medium: null, content: "launch", disabled: false }),
      ),
      http.get(`${PRO}/utm/fields`, () => HttpResponse.json(utmFields(["source"]))),
    );

    const result = await callTool(getPostUtm, { key: POST });

    expect(result.structuredContent).toEqual({ source: null, medium: null, content: "launch", disabled: false, locked: ["source"] });
    expect(getPostUtm.description).toContain("own drafts");
  });

  it("list_short_links_needs_manage_settings", () => {
    expect(proNames(off, "ManageSettings")).toContain("list-short-links");
    for (const verbs of [["View"], ["Write"], ["Schedule", "Approve", "UseAi", "Resolve"]]) {
      expect(proNames(off, ...verbs)).not.toContain("list-short-links");
    }
  });

  it("get_short_link_clicks_posts_the_keys", async () => {
    let body: unknown;
    server.use(
      http.post(`${PRO}/short-links/clicks`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ [POST]: { total: 3, channels: { [OTHER]: 3 } } });
      }),
    );

    const result = await callTool(getShortLinkClicks, { postKeys: [POST] });

    expect(body).toEqual({ postKeys: [POST] });
    expect(result.structuredContent).toEqual({ items: [{ postKey: POST, total: 3, channels: { [OTHER]: 3 } }] });
    expect(getShortLinkClicks.annotations).toMatchObject({ readOnlyHint: true });

    const tooMany = Array.from({ length: 201 }, () => POST);
    expect(getShortLinkClicks.inputSchema!.postKeys.safeParse(tooMany).success).toBe(false);

    expect(proNames(off, "View")).toContain("get-short-link-clicks");
    expect(proNames(off, "Write")).toContain("get-short-link-clicks");
  });

  it("get_metrics_trend_sends_the_target_id", async () => {
    let query: URLSearchParams | undefined;
    server.use(
      http.get(`${PRO}/metrics/trend`, ({ request }) => {
        query = new URL(request.url).searchParams;
        return HttpResponse.json([{ takenUtc: "2026-11-10T09:00:00", values: { views: 12 } }]);
      }),
    );

    const result = await callTool(getMetricsTrend, { targetId: 42 });

    expect(query?.get("targetId")).toBe("42");
    expect(result.structuredContent).toEqual({ points: [{ takenUtc: "2026-11-10T09:00:00Z", values: { views: 12 } }] });
    expect(getMetricsTrend.annotations).toMatchObject({ readOnlyHint: true });
  });

  it("set_post_tags_replaces_the_tags", async () => {
    let body: unknown;
    server.use(
      draftPost(),
      http.put(`${PRO}/posts/${POST}/tags`, async ({ request }) => {
        body = await request.json();
        return new HttpResponse(null, { status: 200 });
      }),
    );

    const result = await callTool(setPostTags, { key: POST, tagKeys: [TAG] });

    expect(result.isError).toBeFalsy();
    expect(body).toEqual({ tagKeys: [TAG] });
    expect(result.structuredContent).toEqual({ key: POST, tagKeys: [TAG] });

    const eleven = Array.from({ length: 11 }, () => TAG);
    expect(setPostTags.inputSchema!.tagKeys.safeParse(eleven).success).toBe(false);
  });

  it("set_post_utm_and_set_post_tags_refuse_a_scheduled_post_without_writing", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    let writes = 0;
    server.use(
      http.get(`${API}/posts/${POST}`, () => HttpResponse.json(aPost({ key: POST, status: "Scheduled" }))),
      http.get(`${PRO}/posts/${POST}/utm`, () => HttpResponse.json({ source: null, medium: null, content: null, disabled: false })),
      http.get(`${PRO}/utm/fields`, () => HttpResponse.json(utmFields())),
      http.put(`${PRO}/posts/${POST}/utm`, () => {
        writes++;
        return HttpResponse.json({});
      }),
      http.put(`${PRO}/posts/${POST}/tags`, () => {
        writes++;
        return new HttpResponse(null, { status: 200 });
      }),
    );

    const utm = errorBody(await callTool(setPostUtm, { key: POST, source: "assistant" })) as { codes: string[] };
    const tags = errorBody(await callTool(setPostTags, { key: POST, tagKeys: [TAG] })) as { codes: string[] };

    expect(utm.codes).toEqual(["post.not_draft"]);
    expect(tags.codes).toEqual(["post.not_draft"]);
    expect(writes).toBe(0);
  });

  it("set_post_tags_says_to_read_the_tags_first", () => {
    expect(setPostTags.description).toMatch(/replaces/i);
    expect(setPostTags.description).toContain("get-post-tags");
    expect(setPostTags.description).toMatch(/full set/);
  });

  it("get_post_tags_reads_the_tags_of_each_post", async () => {
    let query: URLSearchParams | undefined;
    server.use(
      http.get(`${PRO}/posts/tags`, ({ request }) => {
        query = new URL(request.url).searchParams;
        return HttpResponse.json([
          { postKey: POST, tags: [{ key: TAG, name: "Launch", colour: "positive", postCount: 4, updatedUtc: "2026-11-01T10:00:00" }] },
        ]);
      }),
    );

    const result = await callTool(getPostTags, { postKeys: [POST, OTHER] });

    expect(query?.getAll("keys")).toEqual([POST, OTHER]);
    expect(result.structuredContent).toEqual({
      items: [{ postKey: POST, tags: [{ key: TAG, name: "Launch", colour: "positive" }] }],
    });
    expect(getPostTags.annotations).toMatchObject({ readOnlyHint: true });
  });

  it("every_pro_description_names_its_verb_and_pro", () => {
    const pro = collections.find((c) => c.metadata.name === "social-pro")!;
    for (const tool of pro.tools(undefined)) {
      expect(`${tool.name}: ${tool.description}`).toMatch(/Needs the Social [A-Z][a-z]+/);
      expect(`${tool.name}: ${tool.description}`).toContain("UmbSocial Pro");
    }
  });
});
