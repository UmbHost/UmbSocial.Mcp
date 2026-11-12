/**
 * Paths and a signed-in session for the Social tool tests.
 */

import { http, HttpResponse } from "msw";
import { server } from "../../../../../mocks/server.js";
import { startSession } from "../../../../../session/start-session.js";
import { EDITION_PATH, LICENSED, USER_PATH } from "../../../../../session/__tests__/helpers.js";

export const API = "*/umbraco/management/api/v1/umbsocial";

export function userWith(...verbs: string[]) {
  return { allowedSections: ["UmbSocial.Section"], fallbackPermissions: verbs.map((v) => `UmbSocial.${v}`) };
}

/** Starts a session as an API user with these Social verbs. */
export async function signIn(...verbs: string[]) {
  server.use(
    http.get(USER_PATH, () => HttpResponse.json(userWith(...verbs))),
    http.get(EDITION_PATH, () => HttpResponse.json(LICENSED)),
  );
  return startSession();
}
