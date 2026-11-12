/**
 * Who's calling: the API user's Social section and verbs.
 *
 * The user handed to a collection's `tools(user)` and a tool's `enabled(user)`
 * is the CMS current user (`GET /user/current`), as in Umbraco's CMS MCP. Only
 * `includes` is used on its arrays, so the SDK's type-generation user (whose
 * arrays answer `includes` with true) passes every check.
 */

import { CAPTURE_RAW_HTTP_RESPONSE, UmbracoManagementClient } from "@umbraco-cms/mcp-server-sdk";
import { checkedResponse } from "./refusals.js";

export const SOCIAL_SECTION = "UmbSocial.Section";

export const ALL_VERBS = ["View", "Write", "Schedule", "Approve", "UseAi", "Resolve", "ManageSettings"] as const;

export type SocialVerb = (typeof ALL_VERBS)[number];

/**
 * The two fields of the CMS `CurrentUserResponseModel` this server reads. Our
 * own; the SDK has no CMS types and the generated client is UmbSocial's only.
 */
export interface CurrentUser {
  allowedSections: readonly string[];
  fallbackPermissions?: readonly string[] | null;
}

export interface SocialUser {
  hasSection: boolean;
  /** Null when the verbs couldn't be read: the site decides. */
  verbs: ReadonlySet<SocialVerb> | null;
}

/** The core's any-of policies (`SocialAuthorization.AnyOfPolicies`, Pro's `ProPolicies`). */
export const READ: readonly SocialVerb[] = ["View", "Write", "ManageSettings"];
export const READ_POST: readonly SocialVerb[] = ["View", "Write"];
export const HASHTAGS_READ: readonly SocialVerb[] = ["Write", "ManageSettings"];

export function toSocialUser(current: CurrentUser): SocialUser {
  const permissions = current.fallbackPermissions;
  return {
    hasSection: current.allowedSections.includes(SOCIAL_SECTION),
    verbs: permissions ? new Set(ALL_VERBS.filter((verb) => permissions.includes(`UmbSocial.${verb}`))) : null,
  };
}

/** Whether the user may try something that needs any one of these verbs. */
export function can(user: SocialUser, ...anyOf: SocialVerb[]): boolean {
  if (!user.hasSection) return false;
  if (user.verbs === null) return true;
  const verbs = user.verbs;
  return anyOf.some((verb) => verbs.has(verb));
}

/** True without a user: offline listings and type generation show every tool. */
export function hasSocialSection(user: CurrentUser | undefined): boolean {
  return !user || toSocialUser(user).hasSection;
}

const CURRENT_USER_PATH = "/umbraco/management/api/v1/user/current";

let socialUser: SocialUser | null = null;

/** Reads the API user from the site, once at start-up. */
export async function loadCurrentUser(): Promise<CurrentUser> {
  const result = await UmbracoManagementClient<unknown>(
    { url: CURRENT_USER_PATH, method: "GET" },
    CAPTURE_RAW_HTTP_RESPONSE,
  );
  const user = checkedResponse<CurrentUser>(result).data;
  socialUser = toSocialUser(user);
  return user;
}

/** The user read at start-up, or null before then. */
export function currentSocialUser(): SocialUser | null {
  return socialUser;
}

export function clearCurrentUser(): void {
  socialUser = null;
}
