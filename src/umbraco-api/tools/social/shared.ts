/**
 * What the Social tools share: who may use them, and the sentence that names
 * the permission each needs.
 */

import { can, toSocialUser, type CurrentUser, type SocialVerb } from "../../../session/social-user.js";

/** A tool's `enabled`: the user has the Social section and any one of these verbs. */
export function enabledFor(verbs: readonly SocialVerb[]): (user: CurrentUser) => boolean {
  return (user) => can(toSocialUser(user), ...verbs);
}

export const NEEDS_READ = "Needs the Social View, Write or Manage settings permission.";
export const NEEDS_READ_POST = "Needs the Social View or Write permission.";
