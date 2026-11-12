/**
 * get-template: one post template, whole.
 */

import { z } from "zod";
import { createToolResult, withStandardDecorators, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import type { PostTemplateView } from "../../../api/generated/umbSocialApi.js";
import { callSocial } from "../../../../session/refusals.js";
import { withUtcTimes } from "../../../../session/time.js";
import { enabledFor, NEEDS_WRITE } from "../../social/shared.js";
import { NEEDS_PRO } from "../shared.js";

const inputSchema = {
  templateKey: z.guid().describe("The template's key, from list-templates."),
};

const outputSchema = z.object({
  key: z.string(),
  name: z.string(),
  text: z.string(),
  linkUrl: z.string().nullish(),
  campaign: z.object({ key: z.string(), name: z.string(), value: z.string() }).nullish(),
  channelKeys: z.array(z.string()),
  fromAi: z.boolean(),
  documentTypeKeys: z.array(z.string()),
  createdUtc: z.string(),
  updatedUtc: z.string(),
});

const getTemplateTool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "get-template",
  description: [
    "Gets a Social post template: its name, full text, link, campaign, channels, whether AI wrote it (`fromAi`) and the document types it is for.",
    NEEDS_WRITE,
    NEEDS_PRO,
  ].join(" "),
  slices: ["read"],
  annotations: { readOnlyHint: true },
  inputSchema,
  outputSchema,
  enabled: enabledFor(["Write"]),
  handler: async ({ templateKey }) => {
    const response = await callSocial<PostTemplateView>((api, raw) => api.getTemplate(templateKey, raw));
    // Who made it is a user key nothing here takes.
    const { createdByUserKey: _createdBy, ...template } = response.data;
    return createToolResult(withUtcTimes(template));
  },
};

export default withStandardDecorators(getTemplateTool);
