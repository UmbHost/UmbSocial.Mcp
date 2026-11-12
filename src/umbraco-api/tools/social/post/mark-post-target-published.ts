/**
 * mark-post-target-published: records that a failed or unknown channel is live.
 */

import { z } from "zod";
import { createToolResult, RAW_FIELD_MARKER, withStandardDecorators, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import type { MarkPublishedRequest, PostKeyResponse } from "../../../api/generated/umbSocialApi.js";
import { callSocial } from "../../../../session/refusals.js";
import { confirmIfSupported, confirmInput, enabledFor, withRawTextChecks } from "../shared.js";

const inputSchema = {
  targetId: z.number().int().positive().describe("The channel's target id, from the targets of get-post. Its status must be Failed or Unknown."),
  postUrl: z
    .url({ protocol: /^https$/ })
    .max(2048)
    .optional()
    .describe(`The live post's address on the network, https only. Leave it out to keep the link the target already has. ${RAW_FIELD_MARKER}`),
  confirm: confirmInput,
};

const outputSchema = z.object({
  targetId: z.number(),
  marked: z.boolean(),
  key: z.string().optional(),
  version: z.string().optional(),
  message: z.string().optional(),
});

const markPostTargetPublishedTool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "mark-post-target-published",
  description:
    "Records that a Failed or Unknown channel of a post is in fact live on its network, because a person has seen it there. It sends nothing itself, but the site treats the channel as published and tells its webhooks and handlers. " +
    "Only a person who has checked the live network should ask for this. It can't be undone. " +
    "The person is asked to confirm first; a client that can't ask needs confirm: true. " +
    "Needs the Social Resolve permission, and the resolve slice, which is off unless UMBSOCIAL_ENABLE_SLICES names it.",
  slices: ["resolve"],
  annotations: { destructiveHint: true, openWorldHint: true },
  inputSchema,
  outputSchema,
  enabled: enabledFor(["Resolve"]),
  handler: async ({ targetId, postUrl, confirm }, extra) => {
    const question = `Record target ${targetId} as live on its network? This can't be undone, and tells the site's webhooks it was published.`;
    if (!(await confirmIfSupported(extra, question, confirm))) {
      return createToolResult({ targetId, marked: false, message: "The person chose not to mark the target as published." });
    }
    const request: MarkPublishedRequest = { postUrl: postUrl ?? null };
    const response = await callSocial<PostKeyResponse>((api, raw) => api.markTargetPublished(targetId, request, raw));
    return createToolResult({ targetId, marked: true, key: response.data.key, version: response.data.version });
  },
};

export default withStandardDecorators(withRawTextChecks(markPostTargetPublishedTool));
