import { afterEach, describe, expect, it } from "@jest/globals";
import { http, HttpResponse } from "msw";
import { server } from "../../../../mocks/server.js";
import { callTool } from "../../../../session/__tests__/helpers.js";
import { clearSession } from "../../../../session/start-session.js";
import listCampaigns from "../get/list-campaigns.js";
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
});
