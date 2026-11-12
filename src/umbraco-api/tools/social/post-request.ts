/**
 * Rebuilding and changing a post request.
 *
 * `PUT posts/{key}` replaces the whole post: a field left out is removed. So
 * `update-post` reads the post, rebuilds the full request from it
 * (`toPostRequest`) and changes only what it was given (`applyChanges`).
 * Neither function holds a Social rule or makes a call.
 */

import { UmbracoApiError } from "@umbraco-cms/mcp-server-sdk";
import type { PostRequest, PostResponse, TargetOptions } from "../../api/generated/umbSocialApi.js";
import { REFUSAL_HINTS } from "../../../session/refusals.js";
import type { PostInputArgs } from "./post-input.js";

const CHANNEL_NOT_CHOSEN = "input.channel_not_chosen";
const NOT_DRAFT = "post.not_draft";
const CHANGED = "post.changed";

/** The statuses this server changes or deletes: a person's calendar is left alone. */
const EDITABLE = ["Draft", "AwaitingApproval"];

function refuse(code: string): never {
  throw new UmbracoApiError({ codes: [code], status: 400, hint: REFUSAL_HINTS[code] });
}

/** Refuses a post that isn't a draft or awaiting approval, before any change is sent. */
export function assertEditable(post: PostResponse): void {
  if (!EDITABLE.includes(post.status)) refuse(NOT_DRAFT);
}

/** Refuses a change made from an older read of the post (the site checks again on save). */
export function assertVersion(post: PostResponse, version: string): void {
  if (post.version.toLowerCase() !== version.toLowerCase()) refuse(CHANGED);
}

/** A request with nothing in it yet: a new draft. */
export function newPostRequest(): PostRequest {
  return { text: "", channels: {}, when: "Draft", atUtc: null };
}

/** The full request that would save `post` as it is, as a draft. */
export function toPostRequest(post: PostResponse): PostRequest {
  const channels: Record<string, string | null> = {};
  const options: Record<string, TargetOptions> = {};
  for (const target of post.targets) {
    channels[target.channelKey] = target.textOverride ?? null;
    // Whole, so no option is lost, whatever the network has.
    if (target.options) options[target.channelKey] = { ...target.options };
  }

  const request: PostRequest = {
    text: post.text,
    linkUrl: post.linkUrl ?? null,
    linkTitle: post.linkTitle ?? null,
    linkDescription: post.linkDescription ?? null,
    linkImageUrl: post.linkImageUrl ?? null,
    mediaKey: post.mediaKey ?? null,
    imageAltText: post.imageAltText ?? null,
    imageFraming: post.imageFraming ?? null,
    campaignKey: post.campaign?.key ?? null,
    // The post's own links; `pageLinks` are the page placeholders the site fills in.
    links: post.links,
    channels,
    options: Object.keys(options).length > 0 ? options : null,
    when: "Draft",
    atUtc: null,
    version: post.version,
  };

  // Without a key the reader can't browse the page; sending none keeps it for such a reader.
  if (post.page?.contentKey) {
    request.sourceContentKey = post.page.contentKey;
    request.sourceCulture = post.page.culture ?? null;
    request.pageDelayMinutes = post.page.delayMinutes ?? null;
  }
  return request;
}

function definedFields<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as Partial<T>;
}

/**
 * `base` with only what `input` names changed, as a draft. A new link clears
 * the old card, a new image the old alt text, and a new page the old
 * language and delay, unless they are given too.
 */
export function applyChanges(base: PostRequest, input: PostInputArgs): PostRequest {
  const next: PostRequest = { ...base, when: "Draft", atUtc: null };

  if (input.text !== undefined) next.text = input.text;

  // Channels: a new set keeps what the channels that stay had.
  const channels: Record<string, string | null> = input.channelKeys
    ? Object.fromEntries(input.channelKeys.map((key) => [key, base.channels[key] ?? null]))
    : { ...base.channels };
  for (const key of [...Object.keys(input.channelTexts ?? {}), ...Object.keys(input.options ?? {})]) {
    if (!(key in channels)) refuse(CHANNEL_NOT_CHOSEN);
  }
  for (const [key, text] of Object.entries(input.channelTexts ?? {})) channels[key] = text ?? null;
  next.channels = channels;

  const options: Record<string, TargetOptions> = {};
  for (const [key, value] of Object.entries(base.options ?? {})) {
    if (key in channels) options[key] = { ...value };
  }
  for (const [key, value] of Object.entries(input.options ?? {})) {
    options[key] = { ...options[key], ...definedFields(value) };
  }
  next.options = Object.keys(options).length > 0 ? options : null;

  if (input.linkUrl !== undefined) {
    if ((input.linkUrl ?? null) !== (base.linkUrl ?? null)) {
      next.linkTitle = null;
      next.linkDescription = null;
      next.linkImageUrl = null;
    }
    next.linkUrl = input.linkUrl;
  }
  if (input.linkTitle !== undefined) next.linkTitle = input.linkTitle;
  if (input.linkDescription !== undefined) next.linkDescription = input.linkDescription;

  if (input.mediaKey !== undefined) {
    if ((input.mediaKey ?? null) !== (base.mediaKey ?? null)) next.imageAltText = null;
    next.mediaKey = input.mediaKey;
  }
  if (input.imageAltText !== undefined) next.imageAltText = input.imageAltText;

  if (input.campaignKey !== undefined) next.campaignKey = input.campaignKey;

  if (input.pageKey !== undefined) {
    if ((input.pageKey ?? null) !== (base.sourceContentKey ?? null)) {
      next.sourceCulture = null;
      next.pageDelayMinutes = null;
    }
    next.sourceContentKey = input.pageKey;
  }
  if (input.pageCulture !== undefined) next.sourceCulture = input.pageCulture;
  if (input.pageDelayMinutes !== undefined) next.pageDelayMinutes = input.pageDelayMinutes;

  return next;
}
