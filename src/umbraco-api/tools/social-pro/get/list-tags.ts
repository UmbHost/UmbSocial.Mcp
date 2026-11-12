/**
 * list-tags: the post tags, by name.
 */

import { z } from "zod";
import { createToolResult, withStandardDecorators, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import type { PagedPostTagViewModel } from "../../../api/generated/umbSocialApi.js";
import { callSocial } from "../../../../session/refusals.js";
import { READ } from "../../../../session/social-user.js";
import { enabledFor, NEEDS_READ } from "../../social/shared.js";
import { NEEDS_PRO, pageOf } from "../shared.js";

const PAGE_SIZE = 50;
/** The site's page limit (`TagsController.MaxPage`). */
const MAX_TAKE = 100;

// The SDK's cursor paging replaces `skip` and `take` with a `cursor` input.
const inputSchema = {
  filter: z.string().optional().describe("Part of a tag's name to search for."),
  skip: z.number().int().min(0).default(0),
  take: z.number().int().min(1).max(MAX_TAKE).default(PAGE_SIZE),
};

const outputSchema = z.object({
  items: z.array(z.object({ key: z.string(), name: z.string(), colour: z.string(), postCount: z.number() })),
  total: z.number(),
});

const listTagsTool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "list-tags",
  description: [
    "Lists the Social post tags by name, each with its key, colour and how many posts have it.",
    `${PAGE_SIZE} a page; pass \`nextCursor\` back as \`cursor\` for the next.`,
    "Filter list-posts by a tag with tagKey, and tag a post with set-post-tags.",
    NEEDS_READ,
    NEEDS_PRO,
  ].join(" "),
  slices: ["list"],
  annotations: { readOnlyHint: true },
  inputSchema,
  outputSchema,
  pageSize: PAGE_SIZE,
  enabled: enabledFor(READ),
  handler: async ({ filter, skip, take }) => {
    const params = { filter, ...pageOf(skip, take, PAGE_SIZE, MAX_TAKE) };
    const response = await callSocial<PagedPostTagViewModel>((api, raw) => api.listTags(params, raw));
    return createToolResult({
      items: response.data.items.map(({ key, name, colour, postCount }) => ({ key, name, colour, postCount })),
      total: response.data.total,
    });
  },
};

export default withStandardDecorators(listTagsTool);
