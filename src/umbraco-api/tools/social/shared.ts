/**
 * What the Social tools share: who may use them, the sentence that names the
 * permission each needs, and asking the person before a destructive step.
 */

import { z } from "zod";
import {
  confirmAction,
  getSupportedElicitationKind,
  rejectControlCharacters,
  UmbracoApiError,
  type ToolDefinition,
} from "@umbraco-cms/mcp-server-sdk";
import { REFUSAL_HINTS } from "../../../session/refusals.js";
import { can, toSocialUser, type CurrentUser, type SocialVerb } from "../../../session/social-user.js";

/** A tool's `enabled`: the user has the Social section and any one of these verbs. */
export function enabledFor(verbs: readonly SocialVerb[]): (user: CurrentUser) => boolean {
  return (user) => can(toSocialUser(user), ...verbs);
}

export const NEEDS_READ = "Needs the Social View, Write or Manage settings permission.";
export const NEEDS_READ_POST = "Needs the Social View or Write permission.";
export const NEEDS_WRITE = "Needs the Social Write permission.";

const CONFIRMATION_REQUIRED = "confirmation.required";

/**
 * The `confirm` input every destructive tool takes. It counts only when the
 * client can't ask the person itself.
 */
export const confirmInput = z
  .boolean()
  .optional()
  .describe(
    "Set to true only after the person has said yes to this exact step in the conversation. Needed when the client can't ask the person itself; otherwise the person is asked and this is ignored.",
  );

/**
 * Asks the person to confirm when the client can ask (form or base
 * elicitation), whatever `confirm` says. When it can't, the step goes ahead
 * only if the caller passed `confirm: true`, and is otherwise refused with
 * `confirmation.required`: the client's own permission prompt is not enough,
 * since it may auto-approve.
 *
 * Hand-rolled because the SDK lacks it: `confirmAction` throws when the client
 * can't elicit, and `getSupportedElicitationKind` throws when no server is set.
 */
export async function confirmIfSupported(
  extra: { requestId?: string | number } | undefined,
  message: string,
  confirm: boolean | undefined,
): Promise<boolean> {
  let kind: ReturnType<typeof getSupportedElicitationKind>;
  try {
    kind = getSupportedElicitationKind();
  } catch {
    kind = "unknown";
  }
  if (kind === "form" || kind === "base") {
    return confirmAction(extra, message, { title: "Confirm", defaultValue: false });
  }
  if (confirm === true) return true;
  throw new UmbracoApiError({ codes: [CONFIRMATION_REQUIRED], status: 400, hint: REFUSAL_HINTS[CONFIRMATION_REQUIRED] });
}

/** Every string in a tool's arguments, with its path. */
function* strings(value: unknown, path: string): Generator<[string, string]> {
  if (typeof value === "string") yield [value, path];
  else if (Array.isArray(value)) for (const [i, item] of value.entries()) yield* strings(item, `${path}[${i}]`);
  else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) yield* strings(item, path ? `${path}.${key}` : key);
  }
}

/**
 * Refuses control characters (all but tab, newline and carriage return) in
 * any string argument, with the SDK's own check and error.
 *
 * Hand-rolled because the SDK lacks it: a field marked `[raw]` skips every
 * check of `withInputSanitization`, the control-character one included, and
 * post text must be `[raw]` to keep its `&`, `?` and `%20`. Strings the SDK
 * checks already pass this too. Wrap inside `withStandardDecorators`, so its
 * error handling reports the refusal.
 */
export function withRawTextChecks<T extends ToolDefinition<any, any>>(tool: T): T {
  const handler = tool.handler as (args: unknown, extra: unknown) => unknown;
  return {
    ...tool,
    handler: ((args: unknown, extra: unknown) => {
      for (const [value, path] of strings(args, "")) rejectControlCharacters(value, path);
      return handler(args, extra);
    }) as T["handler"],
  };
}
