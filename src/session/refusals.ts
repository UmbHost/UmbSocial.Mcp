/**
 * Refusals: the site's refusal codes, with a hint for the assistant.
 *
 * Every call goes through `callSocial`. On a refusal it throws the SDK's
 * `UmbracoApiError` with `{ codes, status, hint? }` as its ProblemDetails, and
 * `withErrorHandling` (in `withStandardDecorators`) makes that the tool error.
 *
 * Hand-rolled because the SDK lacks it: its `executeGetApiCall` builds the
 * error from the status and body only (`toProblemDetails`), so the
 * `X-UmbSocial-Codes` header is lost, and it only warns when a call forgot
 * `CAPTURE_RAW_HTTP_RESPONSE`. A failure without codes carries only its status
 * and reason phrase. A success is still handed back as the raw
 * response, for `executeGetApiCall` & co. or `createToolResult` to format.
 */

import {
  CAPTURE_RAW_HTTP_RESPONSE,
  clearUmbracoFetchToken,
  getApiClient,
  toProblemDetails,
  UmbracoApiError,
  type HttpResponse,
} from "@umbraco-cms/mcp-server-sdk";
import type { getSocialApi } from "../umbraco-api/api/client.js";

export type SocialApi = ReturnType<typeof getSocialApi>;

export interface Refusal {
  codes: string[];
  status: number;
  hint?: string;
}

/** A 403 with no codes: Umbraco's policy check refused a verb the group lacks. */
const VERB_MISSING = "verb.missing";
/** A 401 with no codes: the site didn't accept the access token. */
const TOKEN_REJECTED = "token.rejected";

/**
 * Hints by code, whatever the status. A code with a suffix
 * (`approval.cancelled:<message>`) is matched exactly first, then by the part
 * before the colon. Codes without a hint pass through on their own.
 */
export const REFUSAL_HINTS: Readonly<Record<string, string>> = {
  [VERB_MISSING]: "This API user's group lacks the Social permission this needs.",
  [TOKEN_REJECTED]:
    "The site rejected this server's access token. The next call asks for a new one; if that is refused too, check the API user's client ID and secret, and that the user is still enabled.",
  "ai.needs_review":
    "A person must review this post in the Umbraco backoffice before it can be scheduled. Leave it as a draft, or submit it for approval if the site uses approvals.",
  "post.changed": "Someone changed this post since you read it. Get it again, then make your change.",
  "post.schedule_forbidden": "This user may save drafts only.",
  "licence.pro_required": "This needs UmbSocial Pro, and the site isn't licensed (its licence may have lapsed since this server started).",
  "rate.limited": "Too many requests. Wait a minute before trying again.",
  "post.not_found": "No post with that key that this user may read. Use list-posts.",
  "post.not_yours": "Without the Schedule permission, this user may change or delete only its own drafts.",
  "post.live": "This post is already live on at least one channel, so it can't be changed back into a draft.",
  "approval.disabled": "Approvals are switched off for this site. Leave the post as a draft and ask a person to schedule it.",
  "approval.not_draft": "Only a draft can be submitted for approval.",
  "approval.not_awaiting":
    "This post isn't awaiting approval: it has been approved or returned already, or was never submitted.",
  "approval.changed": "The post changed while it was being approved. Get it again, then try again.",
  "approval.when_invalid": "Approving needs a time: Queue, At, Now or, for a post with a page, OnPagePublish.",
  "approval.own_post": "This site doesn't let people approve their own posts. Someone else must approve it.",
  "approval.self_edited":
    "The approver was the last to change this post, and this site doesn't let people approve their own changes. Someone else must approve it.",
  "approval.cancelled": "The site refused the approval step; its reason follows the code.",
  "page.not_found": "No page with that key exists, or it is in the recycle bin. Find the page with the cms tools.",
  "page.no_access": "This API user lacks Umbraco's Browse permission on that page. Ask an administrator for access.",
  "page.culture_invalid":
    "The page doesn't have that language. Choose one of its languages, or none for a page that doesn't vary by language.",
  "field.required:culture": "The page varies by language, so the post must name one of its languages.",
  "schedule.needs_page": "Going out when the page goes live needs a post tied to a page.",
  "media.unknown": "No media item with that key. Find the image with the cms tools.",
  "schedule.range_too_long":
    "Ask for at most 42 days of slots at a time, with the end after the start. Move the range on to see later slots.",
  "metrics.too_many_keys": "Ask for the figures of at most 200 posts at a time.",
  "post.not_draft":
    "Only a draft, or a post awaiting approval, can be changed or deleted through this server, so a post on the calendar or already sent stays as a person left it. Ask a person to change it in the Umbraco backoffice.",
  "input.channel_not_chosen": "Every channel in channelTexts or options must also be one of the post's channels.",
  "schedule.delay_invalid": "pageDelayMinutes is 0, 60 or 1440; leave it out for the queue's next free slot.",
  "link.https_required": "Links must start with https://.",
  "link.unreachable": "The site couldn't read that page. Check the address, or write the link card yourself.",
  "link.not_allowed": "The site won't fetch that address.",
  "target.not_found": "No channel target with that id. Take it from the targets of get-post.",
  "target.not_retryable": "Only a Failed or Unknown channel can be sent again.",
  "target.not_resolvable": "Only a Failed or Unknown channel can be marked as published.",
  "target.run_active":
    "The channel's run may only be slow, and could still post. Leave it for a person to check in Automate, so the post isn't sent twice.",
  "target.cancelled": "The site refused this step; its reason follows the code.",
  "thread.partly_posted":
    "Part of this thread is already live. A person posts the rest on the network, then marks the channel as published.",
  "channel.unknown": "That channel has been removed, so nothing can be sent to it.",
  "post.sealed": "This post is sealed and can't be changed.",
  "campaign.unknown": "That campaign doesn't exist any more. Use list-campaigns.",
  "schedule.past": "At needs an atUtc in the future.",
  "field.required:note": "Returning a post needs a note saying what to change.",
  "field.too_long:note": "The note can be at most 1000 characters.",
  "template.not_found": "No template with that key. Use list-templates.",
  "tag.not_found": "No tag with that key. Use list-tags.",
  "tag.too_many": "A post can have at most 10 tags.",
  "hashtag.not_found": "No hashtag group with that key. Use list-hashtags.",
  "utm.field_locked": "The site sets this UTM field centrally, so a post can't change it. Leave it out.",
  "utm.value_too_long": "A UTM value can be at most 100 characters.",
  "short_links.too_many_keys": "Ask for the clicks of at most 200 posts at a time.",
};

function hintFor(code: string): string | undefined {
  return REFUSAL_HINTS[code] ?? REFUSAL_HINTS[code.split(":", 1)[0] ?? ""];
}

function headerCodes(headers: Record<string, string> | undefined): string[] {
  const raw = Object.entries(headers ?? {}).find(([name]) => name.toLowerCase() === "x-umbsocial-codes")?.[1];
  if (!raw) return [];
  return raw
    .split(",")
    .map((code) => code.trim())
    .filter((code) => code.length > 0)
    .map((code) => {
      try {
        return decodeURIComponent(code);
      } catch {
        return code;
      }
    });
}

function bodyCodes(data: unknown): string[] {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  const codes = (data as { codes?: unknown }).codes;
  return Array.isArray(codes) ? codes.filter((code): code is string => typeof code === "string") : [];
}

/**
 * The refusal in a failed response: the `X-UmbSocial-Codes` header first, else
 * the body's top-level `codes`. A 401 or 403 without codes gets one of ours.
 * Null when there is nothing to name (a 500, an HTML 502).
 */
export function toRefusal(response: HttpResponse<unknown>): Refusal | null {
  let codes = headerCodes(response.headers);
  if (codes.length === 0) codes = bodyCodes(response.data);
  if (codes.length === 0 && response.status === 401) codes = [TOKEN_REJECTED];
  if (codes.length === 0 && response.status === 403) codes = [VERB_MISSING];
  if (codes.length === 0) return null;

  const hints = [...new Set(codes.map(hintFor).filter((hint): hint is string => hint !== undefined))];
  return hints.length > 0 ? { codes, status: response.status, hint: hints.join(" ") } : { codes, status: response.status };
}

/**
 * Checks what a call returned: a success is returned as it is; a refusal is
 * thrown as an `UmbracoApiError`. A 401 also drops the cached token, so the
 * next call asks for a new one (the SDK renews by expiry time only); this call
 * isn't retried.
 */
export function checkedResponse<T>(result: unknown): HttpResponse<T> {
  if (!result || typeof result !== "object" || typeof (result as { status?: unknown }).status !== "number") {
    throw new Error("An UmbSocial API call was made without CAPTURE_RAW_HTTP_RESPONSE.");
  }
  const response = result as HttpResponse<unknown>;
  if (response.status >= 200 && response.status < 300) return response as HttpResponse<T>;

  if (response.status === 401) clearUmbracoFetchToken();
  const refusal = toRefusal(response);
  // Without codes, only the status and its reason phrase: never the body, which
  // can hold a stack trace or an HTML error page, in the tool result or the log.
  throw new UmbracoApiError(
    refusal ? { ...refusal } : toProblemDetails({ status: response.status, statusText: response.statusText, data: undefined }),
  );
}

/**
 * Calls the UmbSocial API with the raw response captured, so the SDK neither
 * throws nor logs the body of a 4xx/5xx. Use the `raw` argument it passes:
 * `callSocial((api, raw) => api.getEdition(raw))`.
 */
export async function callSocial<T>(
  op: (api: SocialApi, raw: typeof CAPTURE_RAW_HTTP_RESPONSE) => Promise<unknown>,
): Promise<HttpResponse<T>> {
  return checkedResponse<T>(await op(getApiClient<SocialApi>(), CAPTURE_RAW_HTTP_RESPONSE));
}
