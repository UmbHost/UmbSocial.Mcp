import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { http, HttpResponse } from "msw";
import { server } from "../../../../mocks/server.js";
import { callTool } from "../../../../session/__tests__/helpers.js";
import listPosts from "../get/list-posts.js";
import { API } from "./helpers/session.js";
import { manyPosts } from "./helpers/post-builder.js";

const NOW = Date.parse("2026-11-12T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

describe("list-posts", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("list_posts_caps_trims_and_says_truncated", async () => {
    let counted = 0;
    server.use(
      http.get(`${API}/posts`, () => HttpResponse.json(manyPosts(60))),
      http.get(`${API}/posts/count`, () => {
        counted++;
        return HttpResponse.json({ count: 60 });
      }),
    );

    const result = await callTool(listPosts);
    const out = result.structuredContent as { items: Array<{ excerpt: string }>; truncated: boolean; total: number };

    expect(result.isError).toBeFalsy();
    expect(out.items).toHaveLength(50);
    expect(out.truncated).toBe(true);
    expect(out.total).toBe(60);
    expect(out.items.every((item) => item.excerpt.length === 200)).toBe(true);
    expect(counted).toBe(0);
  });

  it("list_posts_defaults_to_a_sixty_day_window_around_now", async () => {
    jest.spyOn(Date, "now").mockReturnValue(NOW);
    let query: URLSearchParams | undefined;
    server.use(
      http.get(`${API}/posts`, ({ request }) => {
        query = new URL(request.url).searchParams;
        return HttpResponse.json([]);
      }),
    );

    const result = await callTool(listPosts);

    expect(query?.get("fromUtc")).toBe(new Date(NOW - 30 * DAY).toISOString());
    expect(query?.get("toUtc")).toBe(new Date(NOW + 30 * DAY).toISOString());
    expect((result.structuredContent as { window: unknown }).window).toEqual({
      fromUtc: new Date(NOW - 30 * DAY).toISOString(),
      toUtc: new Date(NOW + 30 * DAY).toISOString(),
    });
  });

  it("list_posts_counts_when_the_server_cap_is_hit", async () => {
    const counts: URLSearchParams[] = [];
    server.use(
      http.get(`${API}/posts`, () => HttpResponse.json(manyPosts(500))),
      http.get(`${API}/posts/count`, ({ request }) => {
        counts.push(new URL(request.url).searchParams);
        return HttpResponse.json({ count: 731 });
      }),
    );
    const channelKey = "11111111-1111-4111-8111-111111111111";

    const result = await callTool(listPosts, { channelKey, status: "Scheduled", limit: 200 });
    const out = result.structuredContent as { items: unknown[]; truncated: boolean; total: number };

    expect(counts).toHaveLength(1);
    expect(counts[0]?.get("channel")).toBe(channelKey);
    expect(counts[0]?.get("status")).toBe("Scheduled");
    expect(counts[0]?.get("fromUtc")).not.toBeNull();
    expect(out.items).toHaveLength(200);
    expect(out.total).toBe(731);
    expect(out.truncated).toBe(true);
  });

  it("list_posts_sends_no_window_for_waiting_for_page", async () => {
    let query: URLSearchParams | undefined;
    server.use(
      http.get(`${API}/posts`, ({ request }) => {
        query = new URL(request.url).searchParams;
        return HttpResponse.json([]);
      }),
    );

    const result = await callTool(listPosts, { status: "WaitingForPage", fromUtc: "2026-11-01T00:00:00Z" });

    expect(query?.get("status")).toBe("WaitingForPage");
    expect(query?.has("fromUtc")).toBe(false);
    expect(query?.has("toUtc")).toBe(false);
    expect((result.structuredContent as { window: unknown }).window).toBeNull();
  });

  it("list_posts_filters_by_page", async () => {
    let query: URLSearchParams | undefined;
    server.use(
      http.get(`${API}/posts`, ({ request }) => {
        query = new URL(request.url).searchParams;
        return HttpResponse.json([]);
      }),
    );
    const pageKey = "22222222-2222-4222-8222-222222222222";

    await callTool(listPosts, { pageKey, pageCulture: "en-GB" });

    expect(query?.get("filters[content]")).toBe(`${pageKey}:en-GB`);
  });

  it("list_posts_count_call_leaves_out_newest_first", async () => {
    let listed: URLSearchParams | undefined;
    let counted: URLSearchParams | undefined;
    server.use(
      http.get(`${API}/posts`, ({ request }) => {
        listed = new URL(request.url).searchParams;
        return HttpResponse.json(manyPosts(500));
      }),
      http.get(`${API}/posts/count`, ({ request }) => {
        counted = new URL(request.url).searchParams;
        return HttpResponse.json({ count: 612 });
      }),
    );

    await callTool(listPosts, { newestFirst: true });

    expect(listed?.get("newestFirst")).toBe("true");
    expect(counted).toBeDefined();
    expect(counted?.has("newestFirst")).toBe(false);
  });
});
