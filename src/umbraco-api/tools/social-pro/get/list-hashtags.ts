/**
 * list-hashtags: the saved hashtag groups, by name.
 */

import { z } from "zod";
import { createToolResult, withStandardDecorators, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import type { PagedHashtagGroupViewModel } from "../../../api/generated/umbSocialApi.js";
import { callSocial } from "../../../../session/refusals.js";
import { HASHTAGS_READ } from "../../../../session/social-user.js";
import { enabledFor } from "../../social/shared.js";
import { NEEDS_PRO, pageOf } from "../shared.js";

const PAGE_SIZE = 50;
/** The site's page limit (`HashtagsController.MaxPage`). */
const MAX_TAKE = 100;

// The SDK's cursor paging replaces `skip` and `take` with a `cursor` input.
const inputSchema = {
  filter: z.string().optional().describe("Part of a group's name, or one of its tags, to search for."),
  skip: z.number().int().min(0).default(0),
  take: z.number().int().min(1).max(MAX_TAKE).default(PAGE_SIZE),
};

const outputSchema = z.object({
  items: z.array(z.object({ key: z.string(), name: z.string(), tags: z.array(z.string()), usageCount: z.number() })),
  total: z.number(),
});

const listHashtagsTool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "list-hashtags",
  description: [
    "Lists the saved Social hashtag groups by name, each with its key, its hashtags and how often it has been used.",
    `${PAGE_SIZE} a page; pass \`nextCursor\` back as \`cursor\` for the next.`,
    "To use a group, put its hashtags in the post's text yourself.",
    "Needs the Social Write or Manage settings permission.",
    NEEDS_PRO,
  ].join(" "),
  slices: ["list"],
  annotations: { readOnlyHint: true },
  inputSchema,
  outputSchema,
  pageSize: PAGE_SIZE,
  enabled: enabledFor(HASHTAGS_READ),
  handler: async ({ filter, skip, take }) => {
    const params = { filter, ...pageOf(skip, take, PAGE_SIZE, MAX_TAKE) };
    const response = await callSocial<PagedHashtagGroupViewModel>((api, raw) => api.listHashtagGroups(params, raw));
    return createToolResult({
      items: response.data.items.map(({ key, name, tags, usageCount }) => ({ key, name, tags, usageCount })),
      total: response.data.total,
    });
  },
};

export default withStandardDecorators(listHashtagsTool);
