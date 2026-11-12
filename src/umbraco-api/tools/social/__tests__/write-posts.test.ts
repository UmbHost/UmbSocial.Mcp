import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { http, HttpResponse } from "msw";
import { clearServerRef, setServerRef } from "@umbraco-cms/mcp-server-sdk";
import { server } from "../../../../mocks/server.js";
import { callTool, errorBody } from "../../../../session/__tests__/helpers.js";
import { REFUSAL_HINTS } from "../../../../session/refusals.js";
import { AI_WRITTEN_NOTICE } from "../../../../session/notices.js";
import type { PostResponse } from "../../../api/generated/umbSocialApi.js";
import checkPost from "../post/check-post.js";
import createPost from "../post/create-post.js";
import createCampaign from "../post/create-campaign.js";
import updatePost from "../put/update-post.js";
import deletePost from "../delete/delete-post.js";
import previewLink from "../get/preview-link.js";
import { API } from "./helpers/session.js";
import { aPost, aTarget } from "./helpers/post-builder.js";

const CHANNEL_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CHANNEL_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CHANNEL_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const MEDIA = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const OTHER_MEDIA = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const PAGE = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const CAMPAIGN = "12121212-1212-4121-8121-121212121212";
const SAVED = { key: "34343434-3434-4343-8343-343434343434", version: "56565656-5656-4565-8565-565656565656" };

/** A draft with every field filled in. */
function aFullDraft(overrides: Partial<PostResponse> = {}): PostResponse {
  return aPost({
    status: "Draft",
    origin: "Ai",
    scheduledForUtc: null,
    text: "Our new page: https://page.umbsocial.invalid/ffffffff-ffff-4fff-8fff-ffffffffffff",
    linkUrl: "https://example.com/a",
    linkTitle: "Page A",
    linkDescription: "About page A",
    linkImageUrl: "https://example.com/a.jpg",
    mediaKey: MEDIA,
    imageAltText: "A red bicycle",
    imageFraming: { focalPoint: { left: 0.2, top: 0.3 }, crops: [{ network: "x", left: 0, top: 0, right: 1, bottom: 0.5 }] },
    campaign: { key: CAMPAIGN, name: "Launch", value: "launch" },
    links: [{ url: "https://site.test/page", contentKey: PAGE, culture: "en-GB" }],
    pageLinks: [{ placeholder: `https://page.umbsocial.invalid/${PAGE}`, url: null, name: "Page" }],
    page: { contentKey: PAGE, culture: "en-GB", name: "Page", plannedUtc: null, wait: null, delayMinutes: 60, timed: false },
    targets: [
      aTarget({
        channelKey: CHANNEL_A,
        status: "Draft",
        textOverride: "Just for A",
        options: {
          firstComment: "More below",
          contentWarning: null,
          threadParts: ["Part two"],
          pinTitle: "Pin me",
          callToAction: "LEARN_MORE",
        },
      }),
      aTarget({ channelKey: CHANNEL_B, status: "Draft", textOverride: null, options: null }),
    ],
    ...overrides,
  });
}

/** Serves `post` on GET and records each PUT body. */
function servePost(post: PostResponse) {
  const puts: unknown[] = [];
  server.use(
    http.get(`${API}/posts/:key`, () => HttpResponse.json(post)),
    http.put(`${API}/posts/:key`, async ({ request }) => {
      puts.push(await request.json());
      return HttpResponse.json(SAVED);
    }),
  );
  return puts;
}

describe("writing posts", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    clearServerRef();
  });

  it("create_post_always_saves_a_draft", async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post(`${API}/posts`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(SAVED);
      }),
    );

    const result = await callTool(createPost, {
      text: "Hello",
      channelKeys: [CHANNEL_A, CHANNEL_B],
      channelTexts: { [CHANNEL_A]: "Hello A" },
    });

    expect(createPost.inputSchema).not.toHaveProperty("when");
    expect(createPost.inputSchema).not.toHaveProperty("atUtc");
    expect(body).toMatchObject({
      text: "Hello",
      channels: { [CHANNEL_A]: "Hello A", [CHANNEL_B]: null },
      when: "Draft",
      atUtc: null,
    });
    expect(result.structuredContent).toEqual({ ...SAVED, status: "Draft" });
  });

  it("a_page_tied_draft_keeps_its_delay", async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post(`${API}/posts`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(SAVED);
      }),
    );

    await callTool(createPost, {
      text: "Read it when it's live",
      channelKeys: [CHANNEL_A],
      pageKey: PAGE,
      pageCulture: "en-GB",
      pageDelayMinutes: 60,
    });

    expect(body).toMatchObject({
      sourceContentKey: PAGE,
      sourceCulture: "en-GB",
      pageDelayMinutes: 60,
      when: "Draft",
    });
    const delay = createPost.inputSchema!.pageDelayMinutes;
    expect(delay.safeParse(1440).success).toBe(true);
    expect(delay.safeParse(30).success).toBe(false);
  });

  it("create_and_update_descriptions_carry_the_ai_notice", () => {
    expect(createPost.description.endsWith(AI_WRITTEN_NOTICE)).toBe(true);
    expect(updatePost.description.endsWith(AI_WRITTEN_NOTICE)).toBe(true);
    expect(checkPost.description).not.toContain(AI_WRITTEN_NOTICE);
    expect(createCampaign.description).not.toContain(AI_WRITTEN_NOTICE);
  });

  it("update_post_keeps_every_field_it_was_not_given", async () => {
    const post = aFullDraft();
    const puts = servePost(post);

    const result = await callTool(updatePost, { key: post.key, version: post.version, text: "New words" });

    expect(result.isError).toBeFalsy();
    expect(puts).toHaveLength(1);
    expect(puts[0]).toEqual({
      text: "New words",
      linkUrl: "https://example.com/a",
      linkTitle: "Page A",
      linkDescription: "About page A",
      linkImageUrl: "https://example.com/a.jpg",
      mediaKey: MEDIA,
      imageAltText: "A red bicycle",
      imageFraming: post.imageFraming,
      campaignKey: CAMPAIGN,
      links: post.links,
      channels: { [CHANNEL_A]: "Just for A", [CHANNEL_B]: null },
      options: {
        [CHANNEL_A]: {
          firstComment: "More below",
          contentWarning: null,
          threadParts: ["Part two"],
          pinTitle: "Pin me",
          callToAction: "LEARN_MORE",
        },
      },
      sourceContentKey: PAGE,
      sourceCulture: "en-GB",
      pageDelayMinutes: 60,
      when: "Draft",
      atUtc: null,
      version: post.version,
    });
    expect(result.structuredContent).toEqual({ ...SAVED, status: "Draft" });
  });

  it("update_post_merges_channels_and_options", async () => {
    const post = aFullDraft();
    const puts = servePost(post);

    await callTool(updatePost, {
      key: post.key,
      version: post.version,
      channelKeys: [CHANNEL_A, CHANNEL_C],
      channelTexts: { [CHANNEL_C]: "Just for C" },
      options: { [CHANNEL_A]: { firstComment: null, contentWarning: "Spoilers" } },
    });

    expect(puts[0]).toMatchObject({
      channels: { [CHANNEL_A]: "Just for A", [CHANNEL_C]: "Just for C" },
      options: {
        [CHANNEL_A]: {
          firstComment: null,
          contentWarning: "Spoilers",
          threadParts: ["Part two"],
          pinTitle: "Pin me",
          callToAction: "LEARN_MORE",
        },
      },
    });
    expect((puts[0] as { channels: object }).channels).not.toHaveProperty(CHANNEL_B);
  });

  it("a_new_link_clears_the_old_card", async () => {
    const post = aFullDraft();
    const puts = servePost(post);

    await callTool(updatePost, { key: post.key, version: post.version, linkUrl: "https://example.com/b" });
    await callTool(updatePost, {
      key: post.key,
      version: post.version,
      linkUrl: "https://example.com/b",
      linkTitle: "Page B",
    });
    // The same address keeps its card.
    await callTool(updatePost, { key: post.key, version: post.version, linkUrl: "https://example.com/a" });

    expect(puts[0]).toMatchObject({ linkUrl: "https://example.com/b", linkTitle: null, linkDescription: null, linkImageUrl: null });
    expect(puts[1]).toMatchObject({ linkUrl: "https://example.com/b", linkTitle: "Page B", linkDescription: null, linkImageUrl: null });
    expect(puts[2]).toMatchObject({ linkTitle: "Page A", linkDescription: "About page A", linkImageUrl: "https://example.com/a.jpg" });
    expect(updatePost.inputSchema).not.toHaveProperty("linkImageUrl");
    expect(createPost.inputSchema).not.toHaveProperty("linkImageUrl");
  });

  it("a_new_image_clears_the_old_alt_text", async () => {
    const post = aFullDraft();
    const puts = servePost(post);

    await callTool(updatePost, { key: post.key, version: post.version, mediaKey: OTHER_MEDIA });
    await callTool(updatePost, { key: post.key, version: post.version, mediaKey: OTHER_MEDIA, imageAltText: "A blue kite" });

    expect(puts[0]).toMatchObject({ mediaKey: OTHER_MEDIA, imageAltText: null });
    expect(puts[1]).toMatchObject({ mediaKey: OTHER_MEDIA, imageAltText: "A blue kite" });
  });

  it("update_post_with_a_stale_version_is_post_changed_without_a_put", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    const post = aFullDraft();
    const puts = servePost(post);

    const result = await callTool(updatePost, {
      key: post.key,
      version: "78787878-7878-4787-8787-787878787878",
      text: "New words",
    });

    expect(errorBody(result)).toEqual({ codes: ["post.changed"], status: 400, hint: REFUSAL_HINTS["post.changed"] });
    expect(puts).toHaveLength(0);
  });

  it("update_post_refuses_a_scheduled_post_without_a_put", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    for (const status of ["Scheduled", "WaitingForPage", "Published"]) {
      const post = aFullDraft({ status });
      const puts = servePost(post);

      const result = await callTool(updatePost, { key: post.key, version: post.version, text: "New words" });

      expect(errorBody(result)).toEqual({ codes: ["post.not_draft"], status: 400, hint: REFUSAL_HINTS["post.not_draft"] });
      expect(puts).toHaveLength(0);
    }
  });

  it("update_post_saves_a_post_awaiting_approval_as_a_draft", async () => {
    const post = aFullDraft({ status: "AwaitingApproval" });
    const puts = servePost(post);

    const result = await callTool(updatePost, { key: post.key, version: post.version, text: "New words" });

    expect(puts[0]).toMatchObject({ when: "Draft" });
    expect(result.structuredContent).toEqual({ ...SAVED, status: "AwaitingApproval" });
  });

  it("a_refused_schedule_says_a_person_must_review", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    server.use(
      http.post(
        `${API}/posts`,
        () => new HttpResponse(null, { status: 403, headers: { "X-UmbSocial-Codes": "ai.needs_review" } }),
      ),
    );

    const result = await callTool(createPost, { text: "Hello", channelKeys: [CHANNEL_A] });
    const body = errorBody(result) as { codes: string[]; hint: string };

    expect(body.codes).toEqual(["ai.needs_review"]);
    expect(body.hint).toBe(REFUSAL_HINTS["ai.needs_review"]);
    expect(body.hint).toMatch(/person must review/i);
    expect(body.hint).not.toMatch(/retry|try again|\bwhen\b|Queue|Now|At\b/i);
  });

  it("channel_texts_for_an_unchosen_channel_are_refused_before_calling", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    // No handler for POST posts: a request would fail the test.
    const result = await callTool(createPost, {
      text: "Hello",
      channelKeys: [CHANNEL_A],
      options: { [CHANNEL_B]: { firstComment: "Hi" } },
    });

    expect(errorBody(result)).toMatchObject({ codes: ["input.channel_not_chosen"], status: 400 });
  });

  it("delete_post_is_marked_destructive", () => {
    expect(deletePost.annotations?.destructiveHint).toBe(true);
    expect(deletePost.annotations?.readOnlyHint).toBeFalsy();
    expect(checkPost.annotations?.readOnlyHint).toBe(true);
    expect(createPost.annotations?.destructiveHint).toBeFalsy();
  });

  it("delete_post_refuses_a_scheduled_post", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    const post = aFullDraft({ status: "Scheduled" });
    // No DELETE handler: a request would fail the test.
    server.use(http.get(`${API}/posts/:key`, () => HttpResponse.json(post)));

    const result = await callTool(deletePost, { key: post.key });

    expect(errorBody(result)).toEqual({ codes: ["post.not_draft"], status: 400, hint: REFUSAL_HINTS["post.not_draft"] });
  });

  it("delete_post_asks_first_when_the_client_can", async () => {
    const post = aFullDraft();
    let deleted = 0;
    server.use(
      http.get(`${API}/posts/:key`, () => HttpResponse.json(post)),
      http.delete(`${API}/posts/:key`, () => {
        deleted++;
        return new HttpResponse(null, { status: 200 });
      }),
    );

    // A client with form elicitation: the person declines.
    const elicitInput = jest.fn(async () => ({ action: "decline" }));
    setServerRef({ getClientCapabilities: () => ({ elicitation: { form: {} } }), elicitInput } as never);
    const declined = await callTool(deletePost, { key: post.key });

    expect(elicitInput).toHaveBeenCalledTimes(1);
    expect(deleted).toBe(0);
    expect(declined.structuredContent).toMatchObject({ key: post.key, deleted: false });

    // A client without elicitation: its own permission dialog was the consent.
    setServerRef({ getClientCapabilities: () => ({}), elicitInput } as never);
    const done = await callTool(deletePost, { key: post.key });

    expect(elicitInput).toHaveBeenCalledTimes(1);
    expect(deleted).toBe(1);
    expect(done.structuredContent).toEqual({ key: post.key, deleted: true });
  });

  it("create_campaign_reuses_an_existing_name", async () => {
    let body: unknown;
    server.use(
      http.post(`${API}/campaigns`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          key: CAMPAIGN,
          name: "Launch",
          value: "launch",
          posts: 3,
          createdUtc: "2026-11-01T09:00:00Z",
          lastUsedUtc: "2026-11-10T09:00:00",
        });
      }),
    );

    const result = await callTool(createCampaign, { name: "Launch" });

    expect(body).toEqual({ name: "Launch", reuseExisting: true });
    expect(result.structuredContent).toMatchObject({ key: CAMPAIGN, lastUsedUtc: "2026-11-10T09:00:00Z" });
  });

  it("check_post_sends_the_post_key", async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post(`${API}/posts/check`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ errors: [], channels: [] });
      }),
    );
    const key = aPost().key;

    const result = await callTool(checkPost, { key, text: "Hello", channelKeys: [CHANNEL_A] });

    expect(body).toMatchObject({ postKey: key, text: "Hello", channels: { [CHANNEL_A]: null }, when: "Draft" });
    expect(result.structuredContent).toEqual({ errors: [], channels: [] });
  });

  it("preview_link_takes_https_only", async () => {
    let url: string | null = null;
    server.use(
      http.get(`${API}/links/preview`, ({ request }) => {
        url = new URL(request.url).searchParams.get("url");
        return HttpResponse.json({ title: "Page A", description: null, imageUrl: "https://example.com/a.jpg" });
      }),
    );

    const result = await callTool(previewLink, { url: "https://example.com/a" });

    expect(url).toBe("https://example.com/a");
    expect(result.structuredContent).toEqual({ title: "Page A", description: null, imageUrl: "https://example.com/a.jpg" });
    expect(previewLink.inputSchema!.url.safeParse("http://example.com/a").success).toBe(false);
    expect(previewLink.annotations?.readOnlyHint).toBe(true);
  });

  it("post_text_keeps_ampersands_queries_and_encoded_links", async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post(`${API}/posts`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(SAVED);
      }),
    );
    const text = "Fish & chips? Book at https://example.com/menu?day=fri&time=19%3A00 ../not-a-path";

    const result = await callTool(createPost, {
      text,
      channelKeys: [CHANNEL_A],
      channelTexts: { [CHANNEL_A]: text },
      options: { [CHANNEL_A]: { firstComment: text, threadParts: [text] } },
      linkUrl: "https://example.com/menu?day=fri&time=19%3A00",
      linkTitle: "Fish & chips",
    });

    expect(result.isError).toBeFalsy();
    expect(body).toMatchObject({
      text,
      channels: { [CHANNEL_A]: text },
      options: { [CHANNEL_A]: { firstComment: text, threadParts: [text] } },
      linkUrl: "https://example.com/menu?day=fri&time=19%3A00",
      linkTitle: "Fish & chips",
    });
  });
});
