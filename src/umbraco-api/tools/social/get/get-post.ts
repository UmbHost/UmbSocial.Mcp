/**
 * get-post: one post in full.
 */

import { z } from "zod";
import { createToolResult, omitFields, withStandardDecorators, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import type { PostResponse } from "../../../api/generated/umbSocialApi.js";
import { callSocial } from "../../../../session/refusals.js";
import { READ_POST } from "../../../../session/social-user.js";
import { withUtcTimes } from "../../../../session/time.js";
import { enabledFor, NEEDS_READ_POST } from "../shared.js";

const inputSchema = {
  key: z.guid().describe("The post's key, from list-posts."),
};

const getPostTool: ToolDefinition<typeof inputSchema> = {
  name: "get-post",
  description: `Gets one Social post in full: its text, link, image, campaign, page, status, origin (Manual, Ai or Automation), \`version\` (send it back with any change), and each channel's target with its \`id\`, status, text override, options, the live post's \`postUrl\` and any \`error\`. A post this user may not read answers post.not_found. ${NEEDS_READ_POST}`,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  inputSchema,
  enabled: enabledFor(READ_POST),
  handler: async ({ key }) => {
    const response = await callSocial<PostResponse>((api, raw) => api.getPost(key, raw));
    const post = response.data;
    // `automateRunId` is an Automate id no tool takes.
    return createToolResult(
      withUtcTimes({ ...post, targets: post.targets.map((target) => omitFields({ ...target }, ["automateRunId"])) }),
    );
  },
};

export default withStandardDecorators(getPostTool);
