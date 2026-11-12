/**
 * MSW request handlers for the unit tests.
 *
 * Only the token endpoint for now; each tool task adds the UmbSocial
 * endpoints its tests call.
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
];
