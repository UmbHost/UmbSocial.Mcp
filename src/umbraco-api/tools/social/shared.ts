/**
 * What the Social tools share: who may use them, the sentence that names the
 * permission each needs, and asking the person before a destructive step.
 */

import { confirmAction, getSupportedElicitationKind, rejectControlCharacters, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
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
