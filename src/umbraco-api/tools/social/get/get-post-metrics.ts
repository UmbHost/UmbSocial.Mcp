/**
 * get-post-metrics: the views and interactions of published posts, per channel.
 */

import { z } from "zod";
import { createToolResult, withStandardDecorators, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import type { PostMetricsResponse } from "../../../api/generated/umbSocialApi.js";
import { callSocial } from "../../../../session/refusals.js";
import { READ_POST } from "../../../../session/social-user.js";
import { withUtcTimes } from "../../../../session/time.js";
import { enabledFor, NEEDS_READ_POST } from "../shared.js";

/** The site's limit (`IMetricsService.MaxPosts`). */
const MAX_POSTS = 200;

const inputSchema = {
  postKeys: z
    .array(z.guid())
    .min(1)
    .max(MAX_POSTS)
    .describe(`The posts' keys, from list-posts; at most ${MAX_POSTS}.`),
};

const outputSchema = z.object({
  items: z.array(
    z.object({
      postKey: z.string(),
      targets: z.array(
        z.object({
          targetId: z.number(),
          channelKey: z.string(),
          network: z.string(),
          state: z.string(),
          reason: z.string().nullish(),
          values: z.record(z.string(), z.number()),
          fetchedUtc: z.string().nullish(),
        }),
      ),
    }),
  ),
});

const getPostMetricsTool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "get-post-metrics",
  description: `Gets the views and interactions of up to ${MAX_POSTS} posts, for each channel a post was published to, as the networks last reported them (\`fetchedUtc\`). Each channel's \`state\` says whether there are figures: ok; pending (not read yet); unavailable (the network has none for this post; \`reason\` says why); gone (the network no longer has the post); needsPermission (the connection needs a permission); notAvailable (not read for this network or post); proRequired (this network's figures come with Pro). A post this user may not read, or with nothing published, is left out. ${NEEDS_READ_POST}`,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  inputSchema,
  outputSchema,
  enabled: enabledFor(READ_POST),
  handler: async ({ postKeys }) => {
    const response = await callSocial<PostMetricsResponse[]>((api, raw) => api.readMetrics({ postKeys }, raw));
    return createToolResult({ items: withUtcTimes(response.data) });
  },
};

export default withStandardDecorators(getPostMetricsTool);
