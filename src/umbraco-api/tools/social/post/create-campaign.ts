/**
 * create-campaign: a campaign to group posts under.
 */

import { z } from "zod";
import { createToolResult, RAW_FIELD_MARKER, withStandardDecorators, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import type { CampaignResponse } from "../../../api/generated/umbSocialApi.js";
import { callSocial } from "../../../../session/refusals.js";
import { withUtcTimes } from "../../../../session/time.js";
import { NEEDS_WRITE, enabledFor, withRawTextChecks } from "../shared.js";

const inputSchema = {
  name: z.string().min(1).describe(`The campaign's name. ${RAW_FIELD_MARKER}`),
  value: z.string().min(1).optional().describe(`The campaign's value (the utm_campaign it adds to links). Taken only from a user with Manage settings; otherwise the site makes it from the name. ${RAW_FIELD_MARKER}`),
};

const outputSchema = z.object({
  key: z.string(),
  name: z.string(),
  value: z.string(),
  posts: z.number(),
  createdUtc: z.string(),
  lastUsedUtc: z.string().nullish(),
});

const createCampaignTool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "create-campaign",
  description: `Creates a Social campaign to group posts under, or returns the existing one with that name. The site makes its value (the utm_campaign it adds to links) from the name. Use list-campaigns first to reuse one. ${NEEDS_WRITE}`,
  slices: ["create"],
  inputSchema,
  outputSchema,
  enabled: enabledFor(["Write"]),
  handler: async ({ name, value }) => {
    // The site ignores a value from anyone without Manage settings.
    const response = await callSocial<CampaignResponse>((api, raw) => api.addCampaign({ name, reuseExisting: true, ...(value ? { value } : {}) }, raw));
    return createToolResult(withUtcTimes(response.data));
  },
};

export default withStandardDecorators(withRawTextChecks(createCampaignTool));
