/**
 * check-post: checks a post against each channel without saving it.
 */

import { z } from "zod";
import { createToolResult, withStandardDecorators, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import type { CheckResponse } from "../../../api/generated/umbSocialApi.js";
import { callSocial } from "../../../../session/refusals.js";
import { postCreateShape } from "../post-input.js";
import { applyChanges, newPostRequest } from "../post-request.js";
import { enabledFor, NEEDS_WRITE } from "../shared.js";

const inputSchema = {
  key: z.guid().optional().describe("A saved post's key, from list-posts, so its links are checked as they will go out for it."),
  ...postCreateShape,
};

const textCheck = z.object({ count: z.number(), max: z.number(), previewText: z.string() });

const outputSchema = z.object({
  errors: z.array(z.string()),
  channels: z.array(
    z.object({
      channelKey: z.string(),
      network: z.string(),
      count: z.number(),
      max: z.number(),
      errors: z.array(z.string()),
      warnings: z.array(z.string()),
      previewText: z.string(),
      parts: z.array(textCheck),
      comment: textCheck.nullish(),
    }),
  ),
});

const checkPostTool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "check-post",
  description: `Checks a Social post against each of its channels without saving it: each channel's character count against its limit, the text as the network will show it, errors and warnings, and errors for the post as a whole. Fix every error before create-post or update-post. ${NEEDS_WRITE}`,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  inputSchema,
  outputSchema,
  enabled: enabledFor(["Write"]),
  handler: async ({ key, ...input }) => {
    const request = { ...applyChanges(newPostRequest(), input), postKey: key ?? null };
    const response = await callSocial<CheckResponse>((api, raw) => api.checkPost(request, raw));
    return createToolResult(response.data);
  },
};

export default withStandardDecorators(checkPostTool);
