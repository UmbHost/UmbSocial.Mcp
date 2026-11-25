/**
 * list-short-links: every short link, newest first.
 */

import { z } from "zod";
import { createToolResult, withStandardDecorators, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import type { ShortLinkItem, ShortLinkPage } from "../../../api/generated/umbSocialApi.js";
import { callPro } from "../../../../session/addons.js";
import { toUtcIso } from "../../../../session/time.js";
import { enabledFor } from "../../social/shared.js";
import { NEEDS_PRO, pageOf } from "../shared.js";

const PAGE_SIZE = 20;
/** The site's page limit (`IShortLinkService.MaxPageSize`). */
const MAX_TAKE = 100;

// The SDK's cursor paging replaces `skip` and `take` with a `cursor` input.
const inputSchema = {
  filter: z.string().optional().describe("Part of a short code or of the address it leads to."),
  skip: z.number().int().min(0).default(0),
  take: z.number().int().min(1).max(MAX_TAKE).default(PAGE_SIZE),
};

const outputSchema = z.object({
  items: z.array(
    z.object({
      code: z.string(),
      shortUrl: z.string(),
      targetUrl: z.string().nullable(),
      targetName: z.string().nullable(),
      targetGone: z.boolean(),
      postKey: z.string(),
      channelName: z.string(),
      network: z.string(),
      clicks: z.number(),
      createdUtc: z.string(),
    }),
  ),
  total: z.number(),
});

function toItem(link: ShortLinkItem) {
  return {
    code: link.code,
    shortUrl: link.shortUrl,
    targetUrl: link.targetUrl ?? null,
    targetName: link.targetName ?? null,
    targetGone: link.targetGone,
    postKey: link.postKey,
    channelName: link.channelName,
    network: link.network,
    clicks: link.clicks,
    createdUtc: toUtcIso(link.createdUtc),
  };
}

const listShortLinksTool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "list-short-links",
  description: [
    "Lists the site's Social short links, newest first, each with its short address, where it leads (`targetGone` when the page has gone), its post and channel, and its clicks.",
    `${PAGE_SIZE} a page; pass \`nextCursor\` back as \`cursor\` for the next.`,
    "Needs the Social Manage settings permission.",
    NEEDS_PRO,
  ].join(" "),
  slices: ["list"],
  annotations: { readOnlyHint: true },
  inputSchema,
  outputSchema,
  pageSize: PAGE_SIZE,
  enabled: enabledFor(["ManageSettings"]),
  handler: async ({ filter, skip, take }) => {
    const params = { filter, ...pageOf(skip, take, PAGE_SIZE, MAX_TAKE) };
    const response = await callPro<ShortLinkPage>((api, raw) => api.getShortLinks(params, raw));
    return createToolResult({ items: response.data.items.map(toItem), total: response.data.total });
  },
};

export default withStandardDecorators(listShortLinksTool);
