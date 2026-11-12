import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { http, HttpResponse } from "msw";
import { clearServerRef, DEFAULT_COLLECTION_CONFIG, setServerRef } from "@umbraco-cms/mcp-server-sdk";
import { allCollections as collections } from "../../../../tool-collections.js";
import { applyDefaultOffSlices } from "../../../../config/server-config.js";
import { server } from "../../../../mocks/server.js";
import { callTool, errorBody } from "../../../../session/__tests__/helpers.js";
import { toolsFor } from "../../../../session/start-session.js";
import markPostTargetPublished from "../post/mark-post-target-published.js";
import retryPostTarget from "../post/retry-post-target.js";
import { API, userWith } from "./helpers/session.js";

const SAVED = { key: "34343434-3434-4343-8343-343434343434", version: "56565656-5656-4565-8565-565656565656" };

const names = (config: Parameters<typeof toolsFor>[2], ...verbs: string[]) =>
  toolsFor(collections, userWith(...verbs), config)
    .map((t) => t.tool.name)
    .filter((name) => name === "retry-post-target" || name === "mark-post-target-published")
    .sort();

const off = applyDefaultOffSlices(DEFAULT_COLLECTION_CONFIG, new Set());
const on = applyDefaultOffSlices(DEFAULT_COLLECTION_CONFIG, new Set(["resolve"]));

afterEach(() => {
  clearServerRef();
  jest.restoreAllMocks();
});

describe("the resolve tools", () => {
  it("resolve_tools_are_absent_by_default", () => {
    expect(names(off, "Resolve", "Write", "View")).toEqual([]);
  });

  it("resolve_tools_appear_when_enabled_and_the_user_has_resolve", () => {
    expect(names(on, "Resolve")).toEqual(["mark-post-target-published", "retry-post-target"]);
    expect(names(on, "Write", "Schedule", "Approve", "View")).toEqual([]);
  });

  it("they_are_marked_open_world_and_destructive", () => {
    expect(retryPostTarget.annotations).toMatchObject({ destructiveHint: true, openWorldHint: true });
    // It can't be undone, and it fires the site's "published" webhooks.
    expect(markPostTargetPublished.annotations).toMatchObject({ destructiveHint: true, openWorldHint: true });
    expect(retryPostTarget.slices).toEqual(["resolve"]);
    expect(markPostTargetPublished.slices).toEqual(["resolve"]);
  });

  it("descriptions_name_the_verb_and_warn_about_live_networks", () => {
    for (const tool of [retryPostTarget, markPostTargetPublished]) {
      expect(tool.description).toContain("Social Resolve permission");
      expect(tool.description).toMatch(/live network/i);
    }
  });

  it("only_retry_warns_about_the_shared_rate_limit", () => {
    // The site rate-limits retry per user; mark-published isn't limited.
    expect(retryPostTarget.description).toMatch(/same API user/);
    expect(retryPostTarget.description).toMatch(/rate limit/i);
    expect(markPostTargetPublished.description).not.toMatch(/rate limit/i);
  });

  it("retry_posts_to_the_target_and_returns_the_key_and_version", async () => {
    let called = 0;
    server.use(
      http.post(`${API}/targets/42/retry`, () => {
        called++;
        return HttpResponse.json(SAVED);
      }),
    );

    const result = await callTool(retryPostTarget, { targetId: 42, confirm: true });

    expect(called).toBe(1);
    expect(result.structuredContent).toEqual({ ...SAVED, targetId: 42, retried: true });
  });

  it("retry_asks_first_when_the_client_can", async () => {
    let called = 0;
    server.use(
      http.post(`${API}/targets/42/retry`, () => {
        called++;
        return HttpResponse.json(SAVED);
      }),
    );

    const elicitInput = jest.fn(async () => ({ action: "decline" }));
    setServerRef({ getClientCapabilities: () => ({ elicitation: { form: {} } }), elicitInput } as never);
    const declined = await callTool(retryPostTarget, { targetId: 42, confirm: true });

    expect(elicitInput).toHaveBeenCalledTimes(1);
    expect(called).toBe(0);
    expect(declined.structuredContent).toMatchObject({ targetId: 42, retried: false });

    elicitInput.mockImplementation(async () => ({ action: "accept", content: { confirm: true } }));
    const done = await callTool(retryPostTarget, { targetId: 42, confirm: true });

    expect(called).toBe(1);
    expect(done.structuredContent).toMatchObject({ ...SAVED, retried: true });
  });

  it("retry_refusals_carry_their_codes_and_hints", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    for (const code of ["target.run_active", "target.not_retryable", "thread.partly_posted:x", "target.not_found", "post.sealed"]) {
      server.use(
        http.post(`${API}/targets/7/retry`, () => HttpResponse.json({ codes: [code] }, { status: 400, headers: { "X-UmbSocial-Codes": code } })),
      );
      const body = errorBody(await callTool(retryPostTarget, { targetId: 7, confirm: true })) as { codes: string[]; hint?: string };
      expect(body.codes).toEqual([code]);
      expect(body.hint).toBeTruthy();
    }
  });

  it("a_rate_limited_retry_says_so", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    server.use(http.post(`${API}/targets/7/retry`, () => new HttpResponse(null, { status: 429, headers: { "X-UmbSocial-Codes": "rate.limited" } })));

    const body = errorBody(await callTool(retryPostTarget, { targetId: 7, confirm: true })) as { codes: string[]; hint?: string };
    expect(body).toMatchObject({ codes: ["rate.limited"], status: 429 });
  });

  it("mark_published_sends_the_https_link", async () => {
    let body: unknown;
    server.use(
      http.post(`${API}/targets/42/mark-published`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(SAVED);
      }),
    );

    const result = await callTool(markPostTargetPublished, { targetId: 42, postUrl: "https://x.com/me/status/1?s=20&t=a", confirm: true });

    expect(body).toEqual({ postUrl: "https://x.com/me/status/1?s=20&t=a" });
    expect(result.structuredContent).toEqual({ ...SAVED, targetId: 42, marked: true });
  });

  it("mark_published_takes_https_only", () => {
    const schema = (markPostTargetPublished as unknown as { inputSchema: Record<string, { safeParse: (v: unknown) => { success: boolean } }> }).inputSchema;
    expect(schema.postUrl!.safeParse("https://example.com/p/1").success).toBe(true);
    for (const bad of ["http://example.com/p/1", "javascript:alert(1)", "ftp://example.com", "example.com", ""]) {
      expect(schema.postUrl!.safeParse(bad).success).toBe(false);
    }
  });

  it("mark_published_refuses_control_characters_before_calling", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    const result = await callTool(markPostTargetPublished, { targetId: 42, postUrl: "https://example.com/\u0001" });
    expect(result.isError).toBe(true);
  });

  it("the_site_refusing_the_link_or_the_target_is_passed_on", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    for (const code of ["link.https_required", "target.not_resolvable", "target.cancelled:No"]) {
      server.use(
        http.post(`${API}/targets/7/mark-published`, () => HttpResponse.json({ codes: [code] }, { status: 400, headers: { "X-UmbSocial-Codes": code } })),
      );
      const body = errorBody(await callTool(markPostTargetPublished, { targetId: 7, postUrl: "https://example.com/p", confirm: true })) as {
        codes: string[];
        hint?: string;
      };
      expect(body.codes).toEqual([code]);
      expect(body.hint).toBeTruthy();
    }
  });
});
