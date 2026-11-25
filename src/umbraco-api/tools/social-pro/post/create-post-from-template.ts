/**
 * create-post-from-template: the site makes a draft from a post template.
 */

import { z } from "zod";
import { createToolResult, withStandardDecorators, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import type { PostFromTemplate, PostFromTemplateRequest } from "../../../api/generated/umbSocialApi.js";
import { callPro } from "../../../../session/addons.js";
import { AI_WRITTEN_NOTICE } from "../../../../session/notices.js";
import { enabledFor } from "../../social/shared.js";
import { NEEDS_PRO } from "../shared.js";

const inputSchema = {
  templateKey: z.guid().describe("The template's key, from list-templates."),
  pageKey: z.guid().optional().describe("A page the post is about: its document key, from the cms document tools."),
  pageCulture: z.string().max(20).optional().describe("With pageKey: the page's language, for a page that varies by language."),
};

const outputSchema = z.object({
  key: z.string(),
  version: z.string(),
  status: z.literal("Draft"),
});

const createPostFromTemplateTool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "create-post-from-template",
  description: [
    "Creates a Social draft from a post template: the site copies the template's text, link, campaign and channels and, with pageKey, ties the post to that page.",
    "Change the draft afterwards with update-post.",
    "Needs the Social Write permission, and Umbraco's Browse permission on the page.",
    NEEDS_PRO,
    AI_WRITTEN_NOTICE,
  ].join(" "),
  slices: ["create"],
  inputSchema,
  outputSchema,
  enabled: enabledFor(["Write"]),
  handler: async ({ templateKey, pageKey, pageCulture }) => {
    const request: PostFromTemplateRequest = pageKey ? { sourceContentKey: pageKey, sourceCulture: pageCulture ?? null } : {};
    const response = await callPro<PostFromTemplate>((api, raw) => api.createPostFromTemplate(templateKey, request, raw));
    // The site always saves it as a draft (`PostTemplateService.CreatePostAsync`).
    return createToolResult({ key: response.data.key, version: response.data.version, status: "Draft" as const });
  },
};

export default withStandardDecorators(createPostFromTemplateTool);
