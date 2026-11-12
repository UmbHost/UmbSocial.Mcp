/**
 * delete-post: deletes a Social draft for good.
 */

import { z } from "zod";
import { createToolResult, withStandardDecorators, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import type { PostResponse } from "../../../api/generated/umbSocialApi.js";
import { callSocial } from "../../../../session/refusals.js";
import { assertEditable } from "../post-request.js";
import { confirmIfSupported, enabledFor } from "../shared.js";

const inputSchema = {
  key: z.guid().describe("The post's key, from list-posts."),
};

const outputSchema = z.object({
  key: z.string(),
  deleted: z.boolean(),
  message: z.string().optional(),
});

const deletePostTool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "delete-post",
  description:
    "Deletes a Social draft, or a post awaiting approval, for good. Any other post is refused with post.not_draft and left as it is. " +
    "The person may be asked to confirm first. Without the Social Schedule permission, it deletes only this user's own posts. " +
    "Needs the Social Write permission.",
  slices: ["delete"],
  annotations: { destructiveHint: true },
  inputSchema,
  outputSchema,
  enabled: enabledFor(["Write"]),
  handler: async ({ key }, extra) => {
    const read = await callSocial<PostResponse>((api, raw) => api.getPost(key, raw));
    assertEditable(read.data);

    const excerpt = [...read.data.text].slice(0, 80).join("");
    if (!(await confirmIfSupported(extra, `Delete the Social post "${excerpt}" for good?`))) {
      return createToolResult({ key, deleted: false, message: "The person chose not to delete the post." });
    }

    await callSocial<void>((api, raw) => api.deletePost(key, raw));
    return createToolResult({ key, deleted: true });
  },
};

export default withStandardDecorators(deletePostTool);
