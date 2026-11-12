/**
 * get-hashtag-group: one saved hashtag group.
 */

import { z } from "zod";
import { createToolResult, withStandardDecorators, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import type { HashtagGroupView } from "../../../api/generated/umbSocialApi.js";
import { callSocial } from "../../../../session/refusals.js";
import { HASHTAGS_READ } from "../../../../session/social-user.js";
import { withUtcTimes } from "../../../../session/time.js";
import { enabledFor } from "../../social/shared.js";
import { NEEDS_PRO } from "../shared.js";

const inputSchema = {
  hashtagGroupKey: z.guid().describe("The group's key, from list-hashtags."),
};

const outputSchema = z.object({
  key: z.string(),
  name: z.string(),
  tags: z.array(z.string()),
  usageCount: z.number(),
  createdUtc: z.string(),
  updatedUtc: z.string(),
});

const getHashtagGroupTool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "get-hashtag-group",
  description: [
    "Gets a saved Social hashtag group: its name, its hashtags and how often it has been used. To use it, put its hashtags in the post's text yourself.",
    "Needs the Social Write or Manage settings permission.",
    NEEDS_PRO,
  ].join(" "),
  slices: ["read"],
  annotations: { readOnlyHint: true },
  inputSchema,
  outputSchema,
  enabled: enabledFor(HASHTAGS_READ),
  handler: async ({ hashtagGroupKey }) => {
    const response = await callSocial<HashtagGroupView>((api, raw) => api.getHashtagGroup(hashtagGroupKey, raw));
    return createToolResult(withUtcTimes(response.data));
  },
};

export default withStandardDecorators(getHashtagGroupTool);
