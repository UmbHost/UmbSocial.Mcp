/**
 * The `manage` slice: campaigns. Off unless `UMBSOCIAL_ENABLE_SLICES` names it.
 */

import { z } from "zod";
import { createToolResult, RAW_FIELD_MARKER, withStandardDecorators, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import type { CampaignResponse } from "../../../api/generated/umbSocialApi.js";
import { callSocial } from "../../../../session/refusals.js";
import { withUtcTimes } from "../../../../session/time.js";
import { ASKS_FIRST, confirmed, confirmInput, enabledFor, NEEDS_MANAGE, offByDefault, outcomeSchema, withRawTextChecks } from "../shared.js";

const OFF = offByDefault("manage");
const campaignKey = z.guid().describe("The campaign's key, from list-campaigns.");

const campaignSchema = z.object({
  key: z.string(),
  name: z.string(),
  value: z.string(),
  posts: z.number(),
  createdUtc: z.string(),
  lastUsedUtc: z.string().nullish(),
});

const read = async (key: string) => (await callSocial<CampaignResponse>((api, raw) => api.getCampaign(key, raw))).data;

const getInput = { campaignKey };

const getCampaignTool: ToolDefinition<typeof getInput, typeof campaignSchema> = {
  name: "get-campaign",
  description: `Gets a Social campaign: its name, its value (the utm_campaign it adds to links), how many posts are in it and when it was last used. ${OFF} ${NEEDS_MANAGE}`,
  slices: ["manage"],
  annotations: { readOnlyHint: true },
  inputSchema: getInput,
  outputSchema: campaignSchema,
  enabled: enabledFor(["ManageSettings"]),
  handler: async ({ campaignKey: key }) => createToolResult(withUtcTimes(await read(key))),
};

const updateInput = {
  campaignKey,
  name: z.string().min(1).optional().describe(`The new name; left out, it is kept. ${RAW_FIELD_MARKER}`),
  value: z.string().min(1).optional().describe(`The new utm_campaign value; left out, it is kept. ${RAW_FIELD_MARKER}`),
  regenerateValue: z.boolean().optional().describe("True makes the value again from the name. Ignored when a value is given."),
};

const updateCampaignTool: ToolDefinition<typeof updateInput, typeof campaignSchema> = {
  name: "update-campaign",
  description: `Renames a Social campaign or changes its value. A new value changes the utm_campaign on links of its posts that haven't gone out, so their figures no longer join those already sent. ${OFF} ${NEEDS_MANAGE}`,
  slices: ["manage"],
  annotations: { idempotentHint: true },
  inputSchema: updateInput,
  outputSchema: campaignSchema,
  enabled: enabledFor(["ManageSettings"]),
  handler: async ({ campaignKey: key, name, value, regenerateValue }) => {
    const request = { name: name ?? (await read(key)).name, value: value ?? null, regenerateValue: !value && regenerateValue === true };
    const response = await callSocial<CampaignResponse>((api, raw) => api.updateCampaign(key, request, raw));
    return createToolResult(withUtcTimes(response.data));
  },
};

const deleteInput = { campaignKey, confirm: confirmInput };

const deleteCampaignTool: ToolDefinition<typeof deleteInput, typeof outcomeSchema> = {
  name: "delete-campaign",
  description: `Deletes a Social campaign for good; its posts stay, without a campaign. ${ASKS_FIRST} ${OFF} ${NEEDS_MANAGE}`,
  slices: ["manage"],
  annotations: { destructiveHint: true },
  inputSchema: deleteInput,
  outputSchema: outcomeSchema,
  enabled: enabledFor(["ManageSettings"]),
  handler: async ({ campaignKey: key, confirm }, extra) => {
    const { name, posts } = await read(key);
    return confirmed(extra, `Delete the campaign "${name}" (${posts} posts) for good?`, confirm, key, () =>
      callSocial<void>((api, raw) => api.deleteCampaign(key, raw)),
    );
  },
};

const mergeInput = {
  campaignKey: z.guid().describe("The campaign to merge and remove, from list-campaigns."),
  intoCampaignKey: z.guid().describe("The campaign that takes its posts, from list-campaigns."),
  confirm: confirmInput,
};

const mergeCampaignsTool: ToolDefinition<typeof mergeInput, typeof outcomeSchema> = {
  name: "merge-campaigns",
  description: `Moves every post of one Social campaign into another and removes the first. It can't be undone. ${ASKS_FIRST} ${OFF} ${NEEDS_MANAGE}`,
  slices: ["manage"],
  annotations: { destructiveHint: true },
  inputSchema: mergeInput,
  outputSchema: outcomeSchema,
  enabled: enabledFor(["ManageSettings"]),
  handler: async ({ campaignKey: key, intoCampaignKey, confirm }, extra) => {
    const [from, into] = [await read(key), await read(intoCampaignKey)];
    return confirmed(extra, `Move the ${from.posts} posts of "${from.name}" into "${into.name}" and remove "${from.name}"?`, confirm, key, () =>
      callSocial<void>((api, raw) => api.mergeCampaign(key, { targetKey: intoCampaignKey }, raw)),
    );
  },
};

export const campaignTools: ToolDefinition<any, any>[] = [
  withStandardDecorators(getCampaignTool),
  withStandardDecorators(withRawTextChecks(updateCampaignTool)),
  withStandardDecorators(deleteCampaignTool),
  withStandardDecorators(mergeCampaignsTool),
];
