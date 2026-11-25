/**
 * get-tag: one post tag.
 */

import { z } from "zod";
import { createToolResult, withStandardDecorators, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import type { PostTagView } from "../../../api/generated/umbSocialApi.js";
import { callPro } from "../../../../session/addons.js";
import { READ } from "../../../../session/social-user.js";
import { withUtcTimes } from "../../../../session/time.js";
import { enabledFor, NEEDS_READ } from "../../social/shared.js";
import { NEEDS_PRO } from "../shared.js";

const inputSchema = {
  tagKey: z.guid().describe("The tag's key, from list-tags."),
};

const outputSchema = z.object({
  key: z.string(),
  name: z.string(),
  colour: z.string(),
  postCount: z.number(),
  updatedUtc: z.string(),
});

const getTagTool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "get-tag",
  description: ["Gets a Social post tag: its name, colour, how many posts have it and when it last changed.", NEEDS_READ, NEEDS_PRO].join(" "),
  slices: ["read"],
  annotations: { readOnlyHint: true },
  inputSchema,
  outputSchema,
  enabled: enabledFor(READ),
  handler: async ({ tagKey }) => {
    const response = await callPro<PostTagView>((api, raw) => api.getTag(tagKey, raw));
    return createToolResult(withUtcTimes(response.data));
  },
};

export default withStandardDecorators(getTagTool);
