import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { http, HttpResponse } from "msw";
import { initializeUmbracoFetch, UmbracoApiError } from "@umbraco-cms/mcp-server-sdk";
import { server } from "../../mocks/server.js";
import getSocialEdition from "../../umbraco-api/tools/social/get/get-social-edition.js";
import { callSocial, REFUSAL_HINTS, toRefusal } from "../refusals.js";
import { callTool, EDITION_PATH, errorBody, TOKEN_PATH } from "./helpers.js";

const refusalBody = (status: number, codes: string[]) => ({ type: "Error", title: "Refused", status, codes });

describe("refusals", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    // A fresh token cache for the next test.
    initializeUmbracoFetch({ baseUrl: "http://localhost:9999", clientId: "test-client", clientSecret: "test-secret" });
  });

  it("refusal_codes_and_hints_reach_the_tool_result", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    const cases: Array<{ name: string; response: () => Response; expected: unknown }> = [
      {
        name: "403 with the header only: the header is read first",
        response: () =>
          new HttpResponse(null, { status: 403, headers: { "X-UmbSocial-Codes": "licence.pro_required" } }),
        expected: { codes: ["licence.pro_required"], status: 403, hint: REFUSAL_HINTS["licence.pro_required"] },
      },
      {
        name: "404 with the header and the body",
        response: () =>
          HttpResponse.json(refusalBody(404, ["post.not_found"]), {
            status: 404,
            headers: { "X-UmbSocial-Codes": "post.not_found" },
          }),
        expected: { codes: ["post.not_found"], status: 404, hint: REFUSAL_HINTS["post.not_found"] },
      },
      {
        name: "400 with body codes only",
        response: () => HttpResponse.json(refusalBody(400, ["post.not_yours"]), { status: 400 }),
        expected: { codes: ["post.not_yours"], status: 400, hint: REFUSAL_HINTS["post.not_yours"] },
      },
      {
        name: "a bare 403 from Umbraco's policy check",
        response: () =>
          new HttpResponse(null, {
            status: 403,
            headers: { "WWW-Authenticate": 'Bearer error="insufficient_access"' },
          }),
        expected: {
          codes: ["verb.missing"],
          status: 403,
          hint: "This API user's group lacks the Social permission this needs.",
        },
      },
    ];

    for (const { name, response, expected } of cases) {
      server.use(http.get(EDITION_PATH, response, { once: true }));
      expect({ name, body: errorBody(await callTool(getSocialEdition)) }).toEqual({ name, body: expected });
    }
  });

  it("codes_are_decoded_matched_by_prefix_and_unknown_codes_pass_through", () => {
    const refusal = toRefusal({
      status: 400,
      statusText: "Bad Request",
      data: undefined,
      headers: { "x-umbsocial-codes": "approval.cancelled%3AThe%20handler%20said%20no,channel.no_automation" },
    });

    expect(refusal).toEqual({
      codes: ["approval.cancelled:The handler said no", "channel.no_automation"],
      status: 400,
      hint: REFUSAL_HINTS["approval.cancelled"],
    });
    expect(toRefusal({ status: 500, statusText: "", data: "boom" })).toBeNull();
  });

  it("a_401_is_a_clear_error_with_no_retry", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    let tokenRequests = 0;
    let editionRequests = 0;
    server.use(
      http.post(TOKEN_PATH, () => {
        tokenRequests++;
        return HttpResponse.json({ access_token: `token-${tokenRequests}`, token_type: "Bearer", expires_in: 3600 });
      }),
      http.get(EDITION_PATH, () => {
        editionRequests++;
        return new HttpResponse(null, { status: 401 });
      }),
    );

    const body = errorBody(await callTool(getSocialEdition)) as { codes: string[]; status: number; hint: string };

    expect(body.codes).toEqual(["token.rejected"]);
    expect(body.status).toBe(401);
    expect(body.hint).toContain("rejected this server's access token");
    expect(editionRequests).toBe(1);
    expect(tokenRequests).toBe(1);

    // The rejected token is dropped, so the next call asks for a new one.
    await callTool(getSocialEdition);
    expect(tokenRequests).toBe(2);
  });

  it("calls_capture_the_raw_response_so_the_sdk_logs_no_body", async () => {
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    server.use(
      http.get(EDITION_PATH, () => HttpResponse.json(refusalBody(403, ["post.not_found"]), { status: 403 })),
    );

    await expect(callSocial((api, raw) => api.getEdition(raw))).rejects.toBeInstanceOf(UmbracoApiError);
    expect(log.mock.calls.filter((call) => String(call[0]).startsWith("HTTP Error"))).toEqual([]);

    // A call that drops the raw response is refused rather than half-working.
    await expect(callSocial(async () => ({ isLicensed: true }))).rejects.toThrow("CAPTURE_RAW_HTTP_RESPONSE");
  });
});
