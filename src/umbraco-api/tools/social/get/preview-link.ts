/**
 * preview-link: a web page's link card.
 */

import { z } from "zod";
import { createToolResult, RAW_FIELD_MARKER, withStandardDecorators, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import type { LinkPreviewResponse } from "../../../api/generated/umbSocialApi.js";
import { callSocial } from "../../../../session/refusals.js";
import { NEEDS_WRITE, enabledFor, withRawTextChecks } from "../shared.js";

const inputSchema = {
  url: z.url({ protocol: /^https$/ }).describe(`The page's address (https). ${RAW_FIELD_MARKER}`),
};

const outputSchema = z.object({
  title: z.string().nullish(),
  description: z.string().nullish(),
  imageUrl: z.string().nullish(),
});

const previewLinkTool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "preview-link",
  description: `Reads a web page's link card: its title, description and image, as the site fetches them. Use them as a post's linkTitle, linkDescription and linkImageUrl. The site limits how often this can be called. ${NEEDS_WRITE}`,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  inputSchema,
  outputSchema,
  enabled: enabledFor(["Write"]),
  handler: async ({ url }) => {
    const response = await callSocial<LinkPreviewResponse>((api, raw) => api.previewLink({ url }, raw));
    return createToolResult(response.data);
  },
};

export default withStandardDecorators(withRawTextChecks(previewLinkTool));
