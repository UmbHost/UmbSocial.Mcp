/**
 * submit-post-for-approval: sends this user's own draft to a reviewer.
 */

import { z } from "zod";
import { createToolResult, withStandardDecorators, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import type { PostKeyResponse } from "../../../api/generated/umbSocialApi.js";
import { callSocial } from "../../../../session/refusals.js";
import { enabledFor, NEEDS_WRITE } from "../../social/shared.js";
import { NEEDS_PRO } from "../shared.js";

const inputSchema = {
  key: z.guid().describe("The draft's key, from list-posts."),
};

const outputSchema = z.object({
  key: z.string(),
  version: z.string(),
  status: z.literal("AwaitingApproval"),
});

const submitPostForApprovalTool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "submit-post-for-approval",
  description: [
    "Submits a Social draft for approval, so that a person with the Approve permission can review it and put it on the calendar. This is how a post written through this server reaches a person.",
    "It works only on this user's own drafts, and only when the site uses approvals.",
    "Whoever changes a post while it awaits approval can't approve it, unless the site lets people approve their own posts.",
    NEEDS_WRITE,
    NEEDS_PRO,
  ].join(" "),
  slices: ["update"],
  inputSchema,
  outputSchema,
  enabled: enabledFor(["Write"]),
  handler: async ({ key }) => {
    const response = await callSocial<PostKeyResponse>((api, raw) => api.submitPost(key, raw));
    return createToolResult({ key: response.data.key, version: response.data.version, status: "AwaitingApproval" as const });
  },
};

export default withStandardDecorators(submitPostForApprovalTool);
