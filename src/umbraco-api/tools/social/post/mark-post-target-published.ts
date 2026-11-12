/**
 * mark-post-target-published: records that a failed or unknown channel is live.
 */

import { z } from "zod";
import { createToolResult, RAW_FIELD_MARKER, withStandardDecorators, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import type { MarkPublishedRequest, PostKeyResponse } from "../../../api/generated/umbSocialApi.js";
import { callSocial } from "../../../../session/refusals.js";
import { enabledFor, withRawTextChecks } from "../shared.js";

const inputSchema = {
  targetId: z.number().int().positive().describe("The channel's target id, from the targets of get-post. Its status must be Failed or Unknown."),
  postUrl: z
    .url({ protocol: /^https$/ })
    .max(2048)
    .optional()
    .describe(`The live post's address on the network, https only. Leave it out to keep the link the target already has. ${RAW_FIELD_MARKER}`),
};

const outputSchema = z.object({ key: z.string(), version: z.string() });

const markPostTargetPublishedTool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "mark-post-target-published",
  description:
    "Records that a Failed or Unknown channel of a post is in fact live on its network, because a person has seen it there. It sends nothing itself, but the site treats the channel as published and tells its webhooks and handlers. " +
    "Only a person who has checked the live network should ask for this. Everyone using the same API user shares the publish rate limit. " +
    "Needs the Social Resolve permission, and the resolve slice, which is off unless UMBSOCIAL_ENABLE_SLICES names it.",
  slices: ["resolve"],
  annotations: { openWorldHint: true },
  inputSchema,
  outputSchema,
  enabled: enabledFor(["Resolve"]),
  handler: async ({ targetId, postUrl }) => {
    const request: MarkPublishedRequest = { postUrl: postUrl ?? null };
    const response = await callSocial<PostKeyResponse>((api, raw) => api.markTargetPublished(targetId, request, raw));
    return createToolResult({ key: response.data.key, version: response.data.version });
  },
};

export default withStandardDecorators(withRawTextChecks(markPostTargetPublishedTool));
