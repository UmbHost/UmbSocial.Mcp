import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { http, HttpResponse } from "msw";
import { initializeUmbracoFetch } from "@umbraco-cms/mcp-server-sdk";
import { server } from "../../mocks/server.js";
import { getSocialApi } from "../api/client.js";

const BASE_URL = "http://localhost:9999";
const TOKEN_PATH = "*/umbraco/management/api/v1/security/back-office/token";
const EDITION_PATH = "*/umbraco/management/api/v1/umbsocial/edition";

/** The operation ids the tools in Tasks 4 to 8 call (plan, Task 3 as amended by the spike). */
const OPERATIONS = [
  // core
  "GetEdition",
  "ListChannels",
  "GetChannel",
  "ListPosts",
  "CountPosts",
  "GetPost",
  "GetHistory",
  "CheckPost",
  "CreatePost",
  "UpdatePost",
  "DeletePost",
  "GetSchedule",
  "GetSlots",
  "GetNextFreeSlot",
  "SuggestCampaigns",
  "ListCampaigns",
  "AddCampaign",
  "PreviewLink",
  "ShareContent",
  "ReadMetrics",
  "RetryTarget",
  "MarkTargetPublished",
  // Pro
  "SubmitPost",
  "ApprovePost",
  "ReturnPost",
  "ListTemplates",
  "GetTemplate",
  "CreatePostFromTemplate",
  "ListTags",
  "GetTag",
  "SetPostTags",
  "ListHashtagGroups",
  "GetHashtagGroup",
  "GetPostUtm",
  "SavePostUtm",
  "GetPostShortLinks",
  "ReadClicks",
  "GetShortLinks",
  "GetMetricsTrend",
];

const camel = (id: string) => id.charAt(0).toLowerCase() + id.slice(1);

const edition = { isLicensed: true, maxChannels: null, historyDays: null, channelsUsed: 2 };

describe("the UmbSocial API client", () => {
  afterEach(() => {
    jest.useRealTimers();
    // A fresh token cache for the next test.
    initializeUmbracoFetch({ baseUrl: BASE_URL, clientId: "test-client", clientSecret: "test-secret" });
  });

  it("the_generated_client_has_every_operation_the_tools_use", () => {
    const api = getSocialApi() as unknown as Record<string, unknown>;

    const missing = OPERATIONS.map(camel).filter((name) => typeof api[name] !== "function");

    expect(missing).toEqual([]);
  });

  it("calls_carry_the_api_users_bearer_token", async () => {
    let authorization: string | null = null;
    server.use(
      http.post(TOKEN_PATH, () =>
        HttpResponse.json({ access_token: "token-one", token_type: "Bearer", expires_in: 299 }),
      ),
      http.get(EDITION_PATH, ({ request }) => {
        authorization = request.headers.get("authorization");
        return HttpResponse.json(edition);
      }),
    );

    const result = await getSocialApi().getEdition();

    expect(authorization).toBe("Bearer token-one");
    expect(result).toEqual(edition);
  });

  it("an_expired_token_is_fetched_again", async () => {
    // The site issues 299-second tokens with no refresh token. The SDK's fetch
    // client asks for a new one once `expires_in` has passed; this pins that.
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
    let tokenRequests = 0;
    const seen: string[] = [];
    server.use(
      http.post(TOKEN_PATH, () => {
        tokenRequests++;
        return HttpResponse.json({ access_token: `token-${tokenRequests}`, token_type: "Bearer", expires_in: 299 });
      }),
      http.get(EDITION_PATH, ({ request }) => {
        seen.push(request.headers.get("authorization") ?? "");
        return HttpResponse.json(edition);
      }),
    );

    await getSocialApi().getEdition();
    jest.setSystemTime(Date.now() + 200_000);
    await getSocialApi().getEdition();
    expect(tokenRequests).toBe(1);

    jest.setSystemTime(Date.now() + 100_000);
    await getSocialApi().getEdition();

    expect(tokenRequests).toBe(2);
    expect(seen).toEqual(["Bearer token-1", "Bearer token-1", "Bearer token-2"]);
  });
});
