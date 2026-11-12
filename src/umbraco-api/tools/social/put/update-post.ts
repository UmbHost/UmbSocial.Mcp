/**
 * update-post: changes a Social draft, keeping every field it isn't given.
 */

import { z } from "zod";
import { createToolResult, withStandardDecorators, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import type { PostKeyResponse, PostResponse } from "../../../api/generated/umbSocialApi.js";
import { callSocial } from "../../../../session/refusals.js";
import { AI_WRITTEN_NOTICE } from "../../../../session/notices.js";
import { postUpdateShape } from "../post-input.js";
import { applyChanges, assertEditable, assertVersion, toPostRequest } from "../post-request.js";
import { enabledFor, withRawTextChecks } from "../shared.js";

const inputSchema = {
  key: z.guid().describe("The post's key, from list-posts."),
  version: z.string().min(1).describe("The post's version, from get-post: a change made since is refused with post.changed."),
  ...postUpdateShape,
};

const outputSchema = z.object({
  key: z.string(),
  version: z.string(),
  status: z.enum(["Draft", "AwaitingApproval"]),
});

const updatePostTool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "update-post",
  description: [
    "Changes a Social draft, or a post awaiting approval: it reads the post, keeps every field it isn't given, and saves it as a draft again (a post awaiting approval stays awaiting).",
    "Any other post is refused with post.not_draft and left as it is: a post on the calendar or already sent is a person's to change.",
    "Pass the version from get-post.",
    "The change clears any earlier review of the post.",
    "Without the Social Schedule permission, it changes only this user's own posts.",
    "Needs the Social Write permission, and Umbraco's Browse permission on a page it ties the post to.",
    AI_WRITTEN_NOTICE,
  ].join(" "),
  slices: ["update"],
  inputSchema,
  outputSchema,
  enabled: enabledFor(["Write"]),
  handler: async ({ key, version, ...changes }) => {
    const read = await callSocial<PostResponse>((api, raw) => api.getPost(key, raw));
    const post = read.data;
    assertEditable(post);
    assertVersion(post, version);

    const request = applyChanges(toPostRequest(post), changes);
    const response = await callSocial<PostKeyResponse>((api, raw) => api.updatePost(key, request, raw));
    // A draft save keeps a post awaiting approval as it was (`PostService.ScheduleAsync`).
    return createToolResult({
      key: response.data.key,
      version: response.data.version,
      status: post.status as "Draft" | "AwaitingApproval",
    });
  },
};

export default withStandardDecorators(withRawTextChecks(updatePostTool));
