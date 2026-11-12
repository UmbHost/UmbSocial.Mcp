/**
 * get-post-history: what happened to a post, newest first.
 */

import { z } from "zod";
import { createToolResult, pickFields, withStandardDecorators, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import type { HistoryResponse } from "../../../api/generated/umbSocialApi.js";
import { callSocial } from "../../../../session/refusals.js";
import { READ_POST } from "../../../../session/social-user.js";
import { withUtcTimes } from "../../../../session/time.js";
import { enabledFor, NEEDS_READ_POST } from "../shared.js";

const PAGE_SIZE = 20;
const MAX_TAKE = 100;

// The SDK's cursor paging replaces `skip` and `take` with a `cursor` input.
const inputSchema = {
  key: z.guid().describe("The post's key, from list-posts."),
  skip: z.number().int().min(0).default(0),
  take: z.number().int().min(1).max(MAX_TAKE).default(PAGE_SIZE),
};

const outputSchema = z.object({
  items: z.array(
    z.object({
      timestampUtc: z.string(),
      action: z.string(),
      comment: z.string().nullish(),
      isSystem: z.boolean(),
      userKey: z.string().nullish(),
    }),
  ),
  total: z.number(),
});

const getPostHistoryTool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "get-post-history",
  description: `Gets a Social post's history: each change, review, schedule and send, with when it happened, who did it (\`isSystem\` for the site itself) and any comment. ${PAGE_SIZE} entries a page; pass \`nextCursor\` back as \`cursor\` for the next. ${NEEDS_READ_POST}`,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  inputSchema,
  outputSchema,
  pageSize: PAGE_SIZE,
  enabled: enabledFor(READ_POST),
  handler: async ({ key, skip, take }) => {
    // A cursor carries its own take, so the schema's maximum doesn't hold here.
    const page = { skip: Math.max(skip ?? 0, 0), take: Math.min(Math.max(take ?? PAGE_SIZE, 1), MAX_TAKE) };
    const response = await callSocial<HistoryResponse>((api, raw) => api.getHistory(key, page, raw));
    return createToolResult({
      items: response.data.items.map((entry) =>
        withUtcTimes(pickFields({ ...entry }, ["timestampUtc", "action", "comment", "isSystem", "userKey"])),
      ),
      total: response.data.total,
    });
  },
};

export default withStandardDecorators(getPostHistoryTool);
