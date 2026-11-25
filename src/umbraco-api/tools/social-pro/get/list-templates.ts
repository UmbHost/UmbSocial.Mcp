/**
 * list-templates: the post templates, by name.
 */

import { z } from "zod";
import { createToolResult, withStandardDecorators, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import type { PagedPostTemplateViewModel, PostTemplateView } from "../../../api/generated/umbSocialApi.js";
import { callPro } from "../../../../session/addons.js";
import { toUtcIso } from "../../../../session/time.js";
import { enabledFor, NEEDS_WRITE } from "../../social/shared.js";
import { NEEDS_PRO, pageOf } from "../shared.js";

const PAGE_SIZE = 20;
/** The site's page limit (`TemplatesController.MaxPage`). */
const MAX_TAKE = 100;
const EXCERPT_LENGTH = 200;

// The SDK's cursor paging replaces `skip` and `take` with a `cursor` input.
const inputSchema = {
  filter: z.string().optional().describe("Part of a template's name to search for."),
  documentTypeKey: z
    .guid()
    .optional()
    .describe("Only the templates for pages of this document type: the documentTypeKey from get-page-share."),
  skip: z.number().int().min(0).default(0),
  take: z.number().int().min(1).max(MAX_TAKE).default(PAGE_SIZE),
};

const outputSchema = z.object({
  items: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      excerpt: z.string(),
      linkUrl: z.string().nullable(),
      campaign: z.object({ key: z.string(), name: z.string() }).nullable(),
      channelKeys: z.array(z.string()),
      fromAi: z.boolean(),
      documentTypeKeys: z.array(z.string()),
      updatedUtc: z.string(),
    }),
  ),
  total: z.number(),
});

function toItem(template: PostTemplateView) {
  return {
    key: template.key,
    name: template.name,
    excerpt: Array.from(template.text).slice(0, EXCERPT_LENGTH).join(""),
    linkUrl: template.linkUrl ?? null,
    campaign: template.campaign ? { key: template.campaign.key, name: template.campaign.name } : null,
    channelKeys: template.channelKeys,
    fromAi: template.fromAi,
    documentTypeKeys: template.documentTypeKeys,
    updatedUtc: toUtcIso(template.updatedUtc),
  };
}

const listTemplatesTool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "list-templates",
  description: [
    "Lists the Social post templates by name, each with its key, the first 200 characters of its text, its link, campaign and channels, whether AI wrote it (`fromAi`) and the document types it is for.",
    `${PAGE_SIZE} a page; pass \`nextCursor\` back as \`cursor\` for the next.`,
    "Use create-post-from-template to make a draft from one.",
    NEEDS_WRITE,
    NEEDS_PRO,
  ].join(" "),
  slices: ["list"],
  annotations: { readOnlyHint: true },
  inputSchema,
  outputSchema,
  pageSize: PAGE_SIZE,
  enabled: enabledFor(["Write"]),
  handler: async ({ filter, documentTypeKey, skip, take }) => {
    const params = { filter, documentType: documentTypeKey, ...pageOf(skip, take, PAGE_SIZE, MAX_TAKE) };
    const response = await callPro<PagedPostTemplateViewModel>((api, raw) => api.listTemplates(params, raw));
    return createToolResult({ items: response.data.items.map(toItem), total: response.data.total });
  },
};

export default withStandardDecorators(listTemplatesTool);
