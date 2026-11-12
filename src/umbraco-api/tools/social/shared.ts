/**
 * What the Social tools share: who may use them, the sentence that names the
 * permission each needs, and asking the person before a destructive step.
 */

import { confirmAction, getSupportedElicitationKind } from "@umbraco-cms/mcp-server-sdk";
import { can, toSocialUser, type CurrentUser, type SocialVerb } from "../../../session/social-user.js";

/** A tool's `enabled`: the user has the Social section and any one of these verbs. */
export function enabledFor(verbs: readonly SocialVerb[]): (user: CurrentUser) => boolean {
  return (user) => can(toSocialUser(user), ...verbs);
}

export const NEEDS_READ = "Needs the Social View, Write or Manage settings permission.";
export const NEEDS_READ_POST = "Needs the Social View or Write permission.";
export const NEEDS_WRITE = "Needs the Social Write permission.";

/**
 * Asks the person to confirm, but only when the client can ask (form or base
 * elicitation). Otherwise it answers true: a client without elicitation shows
 * its own permission dialog before any tool call, as the SDK's
 * `requestApproval` assumes. No prompt of our own.
 *
 * Hand-rolled because the SDK lacks it: `confirmAction` throws when the client
 * can't elicit, and `getSupportedElicitationKind` throws when no server is set.
 */
export async function confirmIfSupported(extra: { requestId?: string | number } | undefined, message: string): Promise<boolean> {
  let kind: ReturnType<typeof getSupportedElicitationKind>;
  try {
    kind = getSupportedElicitationKind();
  } catch {
    kind = "unknown";
  }
  if (kind !== "form" && kind !== "base") return true;
  return confirmAction(extra, message, { title: "Confirm", defaultValue: false });
}
