/**
 * create-post: saves a new Social post as a draft.
 */

import { z } from "zod";
import { createToolResult, withStandardDecorators, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import type { PostKeyResponse } from "../../../api/generated/umbSocialApi.js";
import { callSocial } from "../../../../session/refusals.js";
import { AI_WRITTEN_NOTICE } from "../../../../session/notices.js";
import { postCreateShape } from "../post-input.js";
import { applyChanges, newPostRequest } from "../post-request.js";
import { enabledFor } from "../shared.js";

const inputSchema = postCreateShape;

const outputSchema = z.object({
  key: z.string(),
  version: z.string(),
  status: z.literal("Draft"),
});

const createPostTool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "create-post",
  description: [
    "Creates a Social post and saves it as a draft, for one or more channels, with an optional link, image, campaign and per-channel text and extras.",
    "Every post is saved as a draft: putting it on the calendar needs a person.",
    "To have it go out when an Umbraco page goes live, tie it to the page with pageKey and, if you like, pageDelayMinutes; a person then chooses \"When the page goes live\" in the composer, or approves it with that.",
    "Use check-post first to see each channel's character count and errors.",
    "Needs the Social Write permission, and Umbraco's Browse permission on a page it is tied to.",
    AI_WRITTEN_NOTICE,
  ].join(" "),
  slices: ["create"],
  inputSchema,
  outputSchema,
  enabled: enabledFor(["Write"]),
  handler: async (input) => {
    const request = applyChanges(newPostRequest(), input);
    const response = await callSocial<PostKeyResponse>((api, raw) => api.createPost(request, raw));
    // Always saved as a draft.
    return createToolResult({ key: response.data.key, version: response.data.version, status: "Draft" as const });
  },
};

export default withStandardDecorators(createPostTool);
