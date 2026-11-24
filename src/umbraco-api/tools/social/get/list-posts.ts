/**
 * list-posts: the posts in a window of time, newest or oldest first, trimmed to
 * a short excerpt each.
 */

import { z } from "zod";
import {
  createToolResult,
  trimArrayResponse,
  UmbracoApiError,
  withStandardDecorators,
  type ToolDefinition,
} from "@umbraco-cms/mcp-server-sdk";
import {
  PostStatus,
  type ListPostsParams,
  type PostCountResponse,
  type PostResponse,
} from "../../../api/generated/umbSocialApi.js";
import { currentEdition } from "../../../../session/edition.js";
import { callSocial, REFUSAL_HINTS } from "../../../../session/refusals.js";
import { READ_POST } from "../../../../session/social-user.js";
import { toUtcIso, toUtcParam } from "../../../../session/time.js";
import { enabledFor, NEEDS_READ_POST } from "../shared.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 30;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const EXCERPT_LENGTH = 200;
/** The site returns at most this many posts and says nothing when it stops (`PostQuery.MaxResults`). */
const SERVER_CAP = 500;

const PRO_REQUIRED = "licence.pro_required";

const STATUSES = Object.values(PostStatus) as [NonNullable<PostStatus>, ...NonNullable<PostStatus>[]];

const inputSchema = {
  fromUtc: z.iso
    .datetime({ offset: true })
    .optional()
    .describe("Start of the window (ISO 8601). Defaults to 30 days ago. Ignored for WaitingForPage."),
  toUtc: z.iso
    .datetime({ offset: true })
    .optional()
    .describe("End of the window, exclusive (ISO 8601). Defaults to 30 days from now. Ignored for WaitingForPage."),
  status: z.enum(STATUSES).optional().describe("Only posts with this status."),
  channelKey: z.guid().optional().describe("Only posts going to this channel, from list-channels."),
  campaignKey: z.guid().optional().describe("Only posts in this campaign, from list-campaigns."),
  pageKey: z
    .guid()
    .optional()
    .describe("Only posts tied to this page: its document key, from the cms document tools."),
  pageCulture: z.string().optional().describe("With pageKey: only the posts for this language of the page."),
  tagKey: z.guid().optional().describe("Only posts with this tag, from list-tags. Needs UmbSocial Pro."),
  newestFirst: z.boolean().optional().describe("Latest first instead of earliest first."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_LIMIT)
    .optional()
    .describe(`How many posts to return, at most ${MAX_LIMIT}. Defaults to ${DEFAULT_LIMIT}.`),
};

const outputSchema = z.object({
  items: z.array(
    z.object({
      key: z.string(),
      status: z.string(),
      origin: z.string(),
      scheduledForUtc: z.string().nullable(),
      updatedUtc: z.string(),
      excerpt: z.string(),
      channels: z.array(z.string()),
      campaign: z.object({ key: z.string(), name: z.string() }).nullable(),
    }),
  ),
  total: z.number(),
  truncated: z.boolean(),
  window: z.object({ fromUtc: z.string(), toUtc: z.string() }).nullable(),
});

function toItem(post: PostResponse) {
  return {
    key: post.key,
    status: post.status,
    origin: post.origin,
    scheduledForUtc: post.scheduledForUtc ? toUtcIso(post.scheduledForUtc) : null,
    updatedUtc: toUtcIso(post.updatedUtc),
    excerpt: Array.from(post.text).slice(0, EXCERPT_LENGTH).join(""),
    channels: post.targets.map((target) => target.channelName),
    campaign: post.campaign ? { key: post.campaign.key, name: post.campaign.name } : null,
  };
}

const listPostsTool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "list-posts",
  description: [
    "Lists Social posts in a window of time, each with its key, status, origin (Manual, Ai or Automation), when it goes or went out, when it was last changed, its first 200 characters, its channels and its campaign.",
    "The window defaults to 30 days either side of now. A post is placed by when it goes or went out; a draft, which has no time, by when it was created.",
    "There is no skip or take: to see more, move the window or narrow it with a status, channel, campaign or page.",
    `It returns at most ${MAX_LIMIT} (default ${DEFAULT_LIMIT}); \`truncated\` is true when more posts matched, and \`total\` says how many.`,
    "A dated list leaves out posts waiting for their page to go live: ask with status WaitingForPage to list those (no window is used).",
    "Filtering by page needs Umbraco's Browse permission on it, and filtering by tag needs UmbSocial Pro.",
    NEEDS_READ_POST,
  ].join(" "),
  slices: ["list"],
  annotations: { readOnlyHint: true },
  inputSchema,
  outputSchema,
  enabled: enabledFor(READ_POST),
  handler: async ({ fromUtc, toUtc, status, channelKey, campaignKey, pageKey, pageCulture, tagKey, newestFirst, limit }) => {
    // An unlicensed site ignores the tag filter and lists every post, so the
    // filter is refused here instead (`TagPostFilter`).
    if (tagKey && currentEdition()?.isLicensed === false) {
      throw new UmbracoApiError({ codes: [PRO_REQUIRED], status: 403, hint: REFUSAL_HINTS[PRO_REQUIRED] });
    }

    // The site leaves waiting posts out of any dated list, so they are asked for without one.
    const now = Date.now();
    const window =
      status === PostStatus.WaitingForPage
        ? null
        : {
            fromUtc: fromUtc ? toUtcParam(fromUtc) : new Date(now - WINDOW_DAYS * DAY_MS).toISOString(),
            toUtc: toUtc ? toUtcParam(toUtc) : new Date(now + WINDOW_DAYS * DAY_MS).toISOString(),
          };

    // `filters` is a dictionary; the SDK's query writer can't nest objects, so
    // its entry goes as the flat key ASP.NET binds to it.
    const filters = {
      ...(window ?? {}),
      status,
      channel: channelKey,
      campaign: campaignKey,
      ...(pageKey ? { "filters[content]": pageCulture ? `${pageKey}:${pageCulture}` : pageKey } : {}),
      ...(tagKey ? { "filters[tag]": tagKey } : {}),
    } as ListPostsParams;

    const response = await callSocial<PostResponse[]>((api, raw) => api.listPosts({ ...filters, newestFirst }, raw));
    const posts = response.data;
    let total = posts.length;
    if (posts.length >= SERVER_CAP) {
      const count = await callSocial<PostCountResponse>((api, raw) => api.countPosts(filters, raw));
      total = Math.max(count.data.count, posts.length);
    }

    const trimmed = trimArrayResponse(posts, { maxItems: limit ?? DEFAULT_LIMIT });
    return createToolResult({
      items: trimmed.items.map(toItem),
      total,
      truncated: trimmed.items.length < total,
      window,
    });
  },
};

export default withStandardDecorators(listPostsTool);
