import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { encodeCursor } from "@umbraco-cms/mcp-server-sdk";
import { http, HttpResponse } from "msw";
import { server } from "../../../../mocks/server.js";
import { callTool, errorBody } from "../../../../session/__tests__/helpers.js";
import { REFUSAL_HINTS } from "../../../../session/refusals.js";
import getPost from "../get/get-post.js";
import getPostHistory from "../get/get-post-history.js";
import getPostMetrics from "../get/get-post-metrics.js";
import getPageShare from "../get/get-page-share.js";
import { API } from "./helpers/session.js";
import { aPost, aTarget } from "./helpers/post-builder.js";

describe("post reads", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("utc_values_without_a_zone_come_back_with_z", async () => {
    const post = aPost({ targets: [aTarget({ dispatchedUtc: "2026-11-15T10:00:01" })] });
    server.use(http.get(`${API}/posts/:key`, () => HttpResponse.json(post)));

    const result = await callTool(getPost, { key: post.key });
    const out = result.structuredContent as {
      scheduledForUtc: string;
      createdUtc: string;
      targets: Array<Record<string, unknown>>;
    };

    expect(out.scheduledForUtc).toBe("2026-11-15T10:00:00Z");
    expect(out.createdUtc).toBe("2026-11-10T09:00:00Z");
    expect(out.targets[0]?.dispatchedUtc).toBe("2026-11-15T10:00:01Z");
    expect(out.targets[0]).not.toHaveProperty("automateRunId");
    expect(out).toMatchObject({ version: post.version, status: "Scheduled" });
  });

  it("get_post_metrics_sends_the_keys_in_the_body", async () => {
    const keys = [aPost().key, aPost().key];
    let body: unknown;
    server.use(
      http.post(`${API}/metrics`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json([
          {
            postKey: keys[0],
            targets: [
              {
                targetId: 7,
                channelKey: "55555555-5555-4555-8555-555555555555",
                network: "mastodon",
                state: "ok",
                reason: null,
                values: { views: 120, likes: 4 },
                fetchedUtc: "2026-11-12T08:00:00",
              },
            ],
          },
        ]);
      }),
    );

    const result = await callTool(getPostMetrics, { postKeys: keys });

    expect(body).toEqual({ postKeys: keys });
    expect(result.structuredContent).toEqual({
      items: [
        {
          postKey: keys[0],
          targets: [
            {
              targetId: 7,
              channelKey: "55555555-5555-4555-8555-555555555555",
              network: "mastodon",
              state: "ok",
              reason: null,
              values: { views: 120, likes: 4 },
              fetchedUtc: "2026-11-12T08:00:00Z",
            },
          ],
        },
      ],
    });

    // More than 200 keys is refused by the input schema, before any request.
    const tooMany = Array.from({ length: 201 }, () => keys[0]);
    expect(getPostMetrics.inputSchema!.postKeys.safeParse(tooMany).success).toBe(false);
  });

  it("get_page_share_passes_page_refusals", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    const documentKey = "66666666-6666-4666-8666-666666666666";
    let culture: string | null = null;
    server.use(
      http.get(`${API}/content/:key/share`, ({ request }) => {
        culture = new URL(request.url).searchParams.get("culture");
        return new HttpResponse(null, { status: 403, headers: { "X-UmbSocial-Codes": "page.no_access" } });
      }),
    );

    const result = await callTool(getPageShare, { documentKey, culture: "en-GB" });

    expect(culture).toBe("en-GB");
    expect(errorBody(result)).toEqual({
      codes: ["page.no_access"],
      status: 403,
      hint: REFUSAL_HINTS["page.no_access"],
    });
  });

  it("get_post_history_clamps_take_to_100", async () => {
    let query: URLSearchParams | undefined;
    server.use(
      http.get(`${API}/posts/:key/history`, ({ request }) => {
        query = new URL(request.url).searchParams;
        return HttpResponse.json({ total: 0, items: [] });
      }),
    );

    // A cursor carries its own take, past the schema's maximum.
    await callTool(getPostHistory, { key: aPost().key, cursor: encodeCursor({ s: 40, t: 500 }) });

    expect(query?.get("skip")).toBe("40");
    expect(query?.get("take")).toBe("100");
  });
});
