/**
 * get-post-short-links: a post's short links and their clicks.
 */

import { z } from "zod";
import { createToolResult, withStandardDecorators, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import type { PostShortLink } from "../../../api/generated/umbSocialApi.js";
import { callPro } from "../../../../session/addons.js";
import { enabledFor } from "../../social/shared.js";
import { NEEDS_PRO } from "../shared.js";

const inputSchema = {
  key: z.guid().describe("The post's key, from list-posts."),
};

const outputSchema = z.object({
  items: z.array(
    z.object({
      channelKey: z.string(),
      code: z.string(),
      shortUrl: z.string(),
      targetUrl: z.string().nullish(),
      targetContentKey: z.string().nullish(),
      clicks: z.number(),
    }),
  ),
});

const getPostShortLinksTool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "get-post-short-links",
  description: [
    "Gets a Social post's short links: for each channel, the short address, where it leads (an address, or a page by its document key) and how many times it was clicked.",
    "Needs the Social View permission.",
    NEEDS_PRO,
  ].join(" "),
  slices: ["read"],
  annotations: { readOnlyHint: true },
  inputSchema,
  outputSchema,
  enabled: enabledFor(["View"]),
  handler: async ({ key }) => {
    const response = await callPro<PostShortLink[]>((api, raw) => api.getPostShortLinks(key, raw));
    return createToolResult({ items: response.data });
  },
};

export default withStandardDecorators(getPostShortLinksTool);
