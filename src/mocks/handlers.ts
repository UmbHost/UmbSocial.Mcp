/**
 * MSW request handlers for the unit tests.
 *
 * The token endpoint, and the start-up checks of a site with every add-on
 * installed, licensed and set up; each test adds the UmbSocial endpoints it calls.
 */

import { http, HttpResponse } from "msw";

export const handlers = [
  http.post("*/umbraco/management/api/v1/security/back-office/token", () => {
    return HttpResponse.json({
      access_token: "mock-access-token",
      token_type: "Bearer",
      expires_in: 3600,
    });
  }),
  http.get("*/umbraco/management/api/v1/umbsocial/pro/tags", () => HttpResponse.json({ total: 0, items: [] })),
  http.get("*/umbraco/management/api/v1/umbsocial/pro/ai/status", () => HttpResponse.json({ configured: true, startFromLink: false })),
  // Answered for a campaign that doesn't exist: the add-on is there and licensed.
  http.get("*/umbraco/management/api/v1/umbsocial/pro/engage/campaigns/:key/figures", () =>
    HttpResponse.json({ status: 404 }, { status: 404, headers: { "X-UmbSocial-Codes": "campaign.not_found" } }),
  ),
];
