/**
 * list-campaigns: the campaigns a post can be tagged with.
 */

import { z } from "zod";
import { createToolResult, withStandardDecorators, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import type { CampaignSuggestionResponse, PagedCampaignResponseModel } from "../../../api/generated/umbSocialApi.js";
import { callSocial } from "../../../../session/refusals.js";
import { can, currentSocialUser } from "../../../../session/social-user.js";
import { withUtcTimes } from "../../../../session/time.js";
import { enabledFor } from "../shared.js";

const PAGE_SIZE = 100;
/** The site's page limit for `campaigns/all`. */
const MAX_TAKE = 100;

// The SDK's cursor paging replaces `skip` and `take` with a `cursor` input.
const inputSchema = {
  query: z.string().optional().describe("Part of a campaign's name to search for."),
  skip: z.number().int().min(0).default(0),
  take: z.number().int().min(1).max(MAX_TAKE).default(PAGE_SIZE),
};

const outputSchema = z.object({
  items: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      value: z.string(),
      posts: z.number().optional(),
      createdUtc: z.string().optional(),
      lastUsedUtc: z.string().nullish(),
    }),
  ),
  total: z.number(),
  source: z.enum(["all", "recent"]),
});

const listCampaignsTool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "list-campaigns",
  description:
    "Lists the Social campaigns a post can belong to, with each one's key, name and value (the utm_campaign it adds to links). With the Manage settings permission it lists every campaign, with its post count and when it was created and last used, " +
    `${PAGE_SIZE} a page (pass \`nextCursor\` back as \`cursor\`), and \`source\` is "all". ` +
    'With Write only, it returns the 20 campaigns used most recently, then the newest, and `source` is "recent"; pass `query` to search the rest by name. ' +
    "Needs the Social Write or Manage settings permission.",
  slices: ["list"],
  annotations: { readOnlyHint: true },
  inputSchema,
  outputSchema,
  pageSize: PAGE_SIZE,
  enabled: enabledFor(["Write", "ManageSettings"]),
  handler: async ({ query, skip, take }) => {
    // Unknown verbs (null) take the Write list; the site decides either way.
    const user = currentSocialUser();
    if (user?.verbs && can(user, "ManageSettings")) {
      // A cursor carries its own take, so the schema's maximum doesn't hold here.
      const page = { query, skip: Math.max(skip ?? 0, 0), take: Math.min(Math.max(take ?? PAGE_SIZE, 1), MAX_TAKE) };
      const response = await callSocial<PagedCampaignResponseModel>((api, raw) => api.listCampaigns(page, raw));
      return createToolResult({ items: withUtcTimes(response.data.items), total: response.data.total, source: "all" });
    }

    const response = await callSocial<CampaignSuggestionResponse[]>((api, raw) => api.suggestCampaigns({ query }, raw));
    // Only these came back, so the total is what came back: no next page.
    return createToolResult({ items: response.data, total: response.data.length, source: "recent" });
  },
};

export default withStandardDecorators(listCampaignsTool);
