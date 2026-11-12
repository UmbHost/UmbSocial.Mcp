import { afterEach, describe, expect, it } from "@jest/globals";
import { http, HttpResponse } from "msw";
import { server } from "../../../../mocks/server.js";
import { callTool } from "../../../../session/__tests__/helpers.js";
import { clearSession } from "../../../../session/start-session.js";
import listCampaigns from "../get/list-campaigns.js";
import { EDITION_PATH, LICENSED, USER_PATH } from "../../../../session/__tests__/helpers.js";
import { startSession } from "../../../../session/start-session.js";
import { API, signIn } from "./helpers/session.js";

const campaign = {
  key: "33333333-3333-4333-8333-333333333333",
  name: "Launch",
  value: "launch",
  posts: 4,
  createdUtc: "2026-11-01T09:00:00",
  lastUsedUtc: null,
};

describe("list-campaigns", () => {
  afterEach(() => clearSession());

  it("list_campaigns_uses_the_paged_list_for_manage_settings", async () => {
    let paged: URLSearchParams | undefined;
    let suggested = 0;
    server.use(
      http.get(`${API}/campaigns/all`, ({ request }) => {
        paged = new URL(request.url).searchParams;
        return HttpResponse.json({ total: 1, items: [campaign] });
      }),
      http.get(`${API}/campaigns`, () => {
        suggested++;
        return HttpResponse.json([{ key: campaign.key, name: campaign.name, value: campaign.value }]);
      }),
    );

    await signIn("ManageSettings");
    const all = await callTool(listCampaigns, { query: "La" });

    expect(paged?.get("query")).toBe("La");
    expect(paged?.get("skip")).toBe("0");
    expect(paged?.get("take")).toBe("100");
    expect(all.structuredContent).toMatchObject({
      source: "all",
      total: 1,
      items: [{ ...campaign, createdUtc: "2026-11-01T09:00:00Z" }],
    });
    expect(suggested).toBe(0);

    clearSession();
    paged = undefined;
    await signIn("Write");
    const recent = await callTool(listCampaigns);

    expect(paged).toBeUndefined();
    expect(suggested).toBe(1);
    expect(recent.structuredContent).toMatchObject({
      source: "recent",
      total: 1,
      items: [{ key: campaign.key, name: campaign.name, value: campaign.value }],
    });
  });

  it("list_campaigns_with_unknown_verbs_tries_the_full_list_then_falls_back", async () => {
    let allStatus = 403;
    let paged = 0;
    let suggested = 0;
    server.use(
      // Verbs that can't be read: the site decides.
      http.get(USER_PATH, () => HttpResponse.json({ allowedSections: ["UmbSocial.Section"], fallbackPermissions: null })),
      http.get(EDITION_PATH, () => HttpResponse.json(LICENSED)),
      http.get(`${API}/campaigns/all`, () => {
        paged++;
        // A bare 403: the policy refused the verb.
        return allStatus === 403 ? new HttpResponse(null, { status: 403 }) : HttpResponse.json({ total: 1, items: [campaign] });
      }),
      http.get(`${API}/campaigns`, () => {
        suggested++;
        return HttpResponse.json([{ key: campaign.key, name: campaign.name, value: campaign.value }]);
      }),
    );
    await startSession();

    const recent = await callTool(listCampaigns);

    expect(paged).toBe(1);
    expect(suggested).toBe(1);
    expect(recent.isError).toBeFalsy();
    expect(recent.structuredContent).toMatchObject({ source: "recent", total: 1 });

    allStatus = 200;
    const all = await callTool(listCampaigns);

    expect(paged).toBe(2);
    expect(suggested).toBe(1);
    expect(all.structuredContent).toMatchObject({ source: "all", total: 1 });
  });
});
