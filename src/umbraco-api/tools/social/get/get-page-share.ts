/**
 * get-page-share: what a post about an Umbraco page needs from it.
 */

import { z } from "zod";
import { createToolResult, withStandardDecorators, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import type { ContentShareResponse } from "../../../api/generated/umbSocialApi.js";
import { callSocial } from "../../../../session/refusals.js";
import { withUtcTimes } from "../../../../session/time.js";
import { enabledFor } from "../shared.js";

const inputSchema = {
  documentKey: z.guid().describe("The page's document key, from the cms document tools."),
  culture: z
    .string()
    .optional()
    .describe("The language to share, such as en-GB. Leave it out for the default language, or for a page that doesn't vary by language."),
};

const outputSchema = z.object({
  contentKey: z.string(),
  documentTypeKey: z.string(),
  culture: z.string().nullish(),
  cultures: z.array(z.string()),
  name: z.string(),
  url: z.string(),
  live: z.boolean(),
  description: z.string().nullish(),
  mediaKey: z.string().nullish(),
  campaign: z.object({ key: z.string(), name: z.string(), value: z.string() }).nullish(),
  plannedUtc: z.string().nullish(),
});

const getPageShareTool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "get-page-share",
  description:
    "Gets what a post about an Umbraco page needs: the page's name, address, description, image (`mediaKey`, only if this user may pick it), its campaign, its languages, and whether it is live, with its planned release if it isn't yet. " +
    "Put `url` in the post text even when `live` is false: until the page goes live it is a placeholder, and the site swaps in the real address when it does. " +
    "Needs the Social Write permission and Umbraco's Browse permission on the page.",
  slices: ["read"],
  annotations: { readOnlyHint: true },
  inputSchema,
  outputSchema,
  enabled: enabledFor(["Write"]),
  handler: async ({ documentKey, culture }) => {
    const response = await callSocial<ContentShareResponse>((api, raw) =>
      api.shareContent(documentKey, culture ? { culture } : undefined, raw),
    );
    return createToolResult(withUtcTimes(response.data));
  },
};

export default withStandardDecorators(getPageShareTool);
