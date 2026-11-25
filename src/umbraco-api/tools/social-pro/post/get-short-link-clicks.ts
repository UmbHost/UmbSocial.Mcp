/**
 * get-short-link-clicks: the clicks on the short links of up to 200 posts.
 * A read, sent as a POST because 200 keys would overrun a URL.
 */

import { z } from "zod";
import { createToolResult, withStandardDecorators, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import type { ReadClicks200 } from "../../../api/generated/umbSocialApi.js";
import { callPro } from "../../../../session/addons.js";
import { READ_POST } from "../../../../session/social-user.js";
import { enabledFor, NEEDS_READ_POST } from "../../social/shared.js";
import { NEEDS_PRO } from "../shared.js";

/** The site's limit (`IShortLinkService.MaxPostKeys`). */
const MAX_POSTS = 200;

const inputSchema = {
  postKeys: z.array(z.guid()).min(1).max(MAX_POSTS).describe(`The posts' keys, from list-posts; at most ${MAX_POSTS}.`),
};

const outputSchema = z.object({
  items: z.array(
    z.object({
      postKey: z.string(),
      total: z.number(),
      channels: z.record(z.string(), z.number()),
    }),
  ),
});

const getShortLinkClicksTool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "get-short-link-clicks",
  description: [
    `Gets how many times the short links of up to ${MAX_POSTS} posts were clicked, in total and per channel (by channel key).`,
    "A post without short links, or one this user may not read, is left out.",
    NEEDS_READ_POST,
    NEEDS_PRO,
  ].join(" "),
  slices: ["read"],
  annotations: { readOnlyHint: true },
  inputSchema,
  outputSchema,
  enabled: enabledFor(READ_POST),
  handler: async ({ postKeys }) => {
    const response = await callPro<ReadClicks200>((api, raw) => api.readClicks({ postKeys }, raw));
    return createToolResult({
      items: Object.entries(response.data).map(([postKey, clicks]) => ({ postKey, total: clicks.total, channels: clicks.channels })),
    });
  },
};

export default withStandardDecorators(getShortLinkClicksTool);
