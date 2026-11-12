/**
 * retry-post-target: sends a failed or unknown channel of a post again.
 */

import { z } from "zod";
import { createToolResult, withStandardDecorators, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import type { PostKeyResponse } from "../../../api/generated/umbSocialApi.js";
import { callSocial } from "../../../../session/refusals.js";
import { confirmIfSupported, confirmInput, enabledFor } from "../shared.js";

const inputSchema = {
  targetId: z.number().int().positive().describe("The channel's target id, from the targets of get-post. Its status must be Failed or Unknown."),
  confirm: confirmInput,
};

const outputSchema = z.object({
  targetId: z.number(),
  retried: z.boolean(),
  key: z.string().optional(),
  version: z.string().optional(),
  message: z.string().optional(),
});

const retryPostTargetTool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "retry-post-target",
  description:
    "Sends a Failed or Unknown channel of a post again, so it goes to the live network once more. A person should decide this first: a post that did go out will appear twice. " +
    "The site refuses a channel that is not Failed or Unknown, a thread that is partly live, a removed channel, and one whose run is still active. " +
    "Everyone using the same API user shares the publish rate limit. The person is asked to confirm first; a client that can't ask needs confirm: true. " +
    "Needs the Social Resolve permission, and the resolve slice, which is off unless UMBSOCIAL_ENABLE_SLICES names it.",
  slices: ["resolve"],
  annotations: { destructiveHint: true, openWorldHint: true },
  inputSchema,
  outputSchema,
  enabled: enabledFor(["Resolve"]),
  handler: async ({ targetId, confirm }, extra) => {
    // No post key comes with a target id, so there is nothing to read again here:
    // the site checks the target's status itself, and refuses a live or running one.
    if (!(await confirmIfSupported(extra, `Send target ${targetId} to its live network again? If the post already went out, it will appear twice.`, confirm))) {
      return createToolResult({ targetId, retried: false, message: "The person chose not to retry the target." });
    }
    const response = await callSocial<PostKeyResponse>((api, raw) => api.retryTarget(targetId, raw));
    return createToolResult({ targetId, retried: true, key: response.data.key, version: response.data.version });
  },
};

export default withStandardDecorators(retryPostTargetTool);
