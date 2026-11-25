/**
 * The site's Social settings, posting schedule and page mappings. Reading is on
 * by default; changing is in the `settings` slice, off unless
 * `UMBSOCIAL_ENABLE_SLICES` names it.
 */

import { z } from "zod";
import { createToolResult, withStandardDecorators, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import {
  DayOfWeek,
  type ContentMappingRequest,
  type ContentMappingResponse,
  type ScheduleResponse,
  type SettingsResponse,
} from "../../../api/generated/umbSocialApi.js";
import { callSocial } from "../../../../session/refusals.js";
import { ASKS_FIRST, confirmed, confirmInput, enabledFor, NEEDS_MANAGE, offByDefault, outcomeSchema } from "../shared.js";

const OFF = offByDefault("settings");
const enabled = enabledFor(["ManageSettings"]);

const DAYS = Object.values(DayOfWeek) as [DayOfWeek, ...DayOfWeek[]];

/** A weekly slot, as the schedule tools take it. The site wants seconds. */
export const slotInput = z.object({
  day: z.enum(DAYS),
  localTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).describe("A 24-hour time in the site's time zone, such as 09:30."),
});
export const slotSchema = z.object({ day: z.string(), localTime: z.string() });

export const toSlots = (slots: readonly z.infer<typeof slotInput>[]) =>
  slots.map(({ day, localTime }) => ({ day, localTime: localTime.length === 5 ? `${localTime}:00` : localTime }));

const scheduleInput = {
  slots: z.array(slotInput).describe("Every weekly slot: these replace the ones there are, and an empty list removes them all."),
  timeZone: z.string().min(1).optional().describe("The time zone the slots are in, such as Europe/London. Left out, it is kept."),
};
const scheduleSchema = z.object({ timeZoneId: z.string(), slots: z.array(slotSchema) });

const updateScheduleTool: ToolDefinition<typeof scheduleInput, typeof scheduleSchema> = {
  name: "update-schedule",
  description: `Replaces the site's weekly posting slots (see get-schedule), and its time zone when given. ${OFF} ${NEEDS_MANAGE}`,
  slices: ["settings"],
  annotations: { idempotentHint: true },
  inputSchema: scheduleInput,
  outputSchema: scheduleSchema,
  enabled,
  handler: async ({ slots, timeZone }) => {
    const zone = timeZone ?? (await callSocial<ScheduleResponse>((api, raw) => api.getSchedule(raw))).data.timeZoneId;
    await callSocial<void>((api, raw) => api.updateSchedule({ slots: toSlots(slots), timeZoneId: zone }, raw));
    const saved = (await callSocial<ScheduleResponse>((api, raw) => api.getSchedule(raw))).data;
    return createToolResult({ timeZoneId: saved.timeZoneId, slots: saved.slots });
  },
};

const settingsSchema = z.object({
  timeZoneId: z.string(),
  publishingEnabled: z.boolean(),
  environmentName: z.string(),
  includePostTextInWebhooks: z.boolean(),
  includeAuthorInWebhooks: z.boolean(),
  autosaveDrafts: z.boolean(),
  xMetricsEnabled: z.boolean(),
});

const readSettings = async () => (await callSocial<SettingsResponse>((api, raw) => api.getSettings(raw))).data;

const getSocialSettingsTool: ToolDefinition<undefined, typeof settingsSchema> = {
  name: "get-social-settings",
  description: `Gets the site's Social settings: its time zone, whether publishing is on in this environment, what webhooks include, whether drafts save themselves and whether X metrics are read. ${NEEDS_MANAGE}`,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  outputSchema: settingsSchema,
  enabled,
  handler: async () => createToolResult(await readSettings()),
};

const settingsInput = {
  timeZone: z.string().min(1).optional().describe("The site's time zone, such as Europe/London."),
  includePostTextInWebhooks: z.boolean().optional(),
  includeAuthorInWebhooks: z.boolean().optional(),
  autosaveDrafts: z.boolean().optional(),
  xMetricsEnabled: z.boolean().optional().describe("Reading metrics from X can cost money on its API."),
};

const updateSocialSettingsTool: ToolDefinition<typeof settingsInput, typeof settingsSchema> = {
  name: "update-social-settings",
  description: `Changes the site's Social settings, keeping every one it isn't given. Whether publishing is on is set in the site's configuration, not here. ${OFF} ${NEEDS_MANAGE}`,
  slices: ["settings"],
  annotations: { idempotentHint: true },
  inputSchema: settingsInput,
  outputSchema: settingsSchema,
  enabled,
  handler: async (changes) => {
    const current = await readSettings();
    const request = {
      timeZoneId: changes.timeZone ?? current.timeZoneId,
      includePostTextInWebhooks: changes.includePostTextInWebhooks ?? current.includePostTextInWebhooks,
      includeAuthorInWebhooks: changes.includeAuthorInWebhooks ?? current.includeAuthorInWebhooks,
      autosaveDrafts: changes.autosaveDrafts ?? current.autosaveDrafts,
      xMetricsEnabled: changes.xMetricsEnabled ?? current.xMetricsEnabled,
    };
    await callSocial<void>((api, raw) => api.updateSettings(request, raw));
    return createToolResult(await readSettings());
  },
};

const mappingSchema = z.object({
  documentTypeKey: z.string(),
  descriptionAlias: z.string().nullish(),
  imageAlias: z.string().nullish(),
  campaignKey: z.string().nullish(),
});
const mappingsSchema = z.object({ items: z.array(mappingSchema) });

const readMappings = async () => (await callSocial<ContentMappingResponse[]>((api, raw) => api.listContentMappings(raw))).data;

const listContentMappingsTool: ToolDefinition<undefined, typeof mappingsSchema> = {
  name: "list-content-mappings",
  description: `Lists, for each document type that has one, the properties a post about its pages takes its description and image from, and the campaign it goes in. ${NEEDS_MANAGE}`,
  slices: ["list"],
  annotations: { readOnlyHint: true },
  outputSchema: mappingsSchema,
  enabled,
  handler: async () => createToolResult({ items: await readMappings() }),
};

const documentTypeKey = z.guid().describe("The document type: the documentTypeKey from get-page-share or list-content-mappings.");
const mappingInput = {
  documentTypeKey,
  descriptionAlias: z.string().nullish().describe("The alias of the property with the description; null clears it, left out it is kept."),
  imageAlias: z.string().nullish().describe("The alias of the property with the image; null clears it, left out it is kept."),
  campaignKey: z.guid().nullish().describe("The campaign, from list-campaigns; null clears it, left out it is kept."),
};

const saveContentMappingTool: ToolDefinition<typeof mappingInput, typeof mappingSchema> = {
  name: "save-content-mapping",
  description: `Sets which properties of a document type a post about its pages takes its description and image from, and the campaign it goes in. ${OFF} ${NEEDS_MANAGE}`,
  slices: ["settings"],
  annotations: { idempotentHint: true },
  inputSchema: mappingInput,
  outputSchema: mappingSchema,
  enabled,
  handler: async ({ documentTypeKey: key, ...changes }) => {
    const current = (await readMappings()).find((m) => m.documentTypeKey.toLowerCase() === key.toLowerCase());
    const kept = <K extends keyof typeof changes>(field: K) => (changes[field] !== undefined ? changes[field] : (current?.[field] ?? null));
    const request: ContentMappingRequest = {
      descriptionAlias: kept("descriptionAlias"),
      imageAlias: kept("imageAlias"),
      campaignKey: kept("campaignKey"),
    };
    await callSocial<void>((api, raw) => api.saveContentMapping(key, request, raw));
    return createToolResult({ documentTypeKey: key, ...request });
  },
};

const removeInput = { documentTypeKey, confirm: confirmInput };

const removeContentMappingTool: ToolDefinition<typeof removeInput, typeof outcomeSchema> = {
  name: "delete-content-mapping",
  description: `Removes a document type's mapping, so posts about its pages go back to the site's defaults. ${ASKS_FIRST} ${OFF} ${NEEDS_MANAGE}`,
  slices: ["settings"],
  annotations: { destructiveHint: true },
  inputSchema: removeInput,
  outputSchema: outcomeSchema,
  enabled,
  handler: async ({ documentTypeKey: key, confirm }, extra) =>
    confirmed(extra, "Remove this document type's Social mapping?", confirm, key, () =>
      callSocial<void>((api, raw) => api.removeContentMapping(key, raw)),
    ),
};

export const siteSettingTools: ToolDefinition<any, any>[] = [
  withStandardDecorators(getSocialSettingsTool),
  withStandardDecorators(updateSocialSettingsTool),
  withStandardDecorators(updateScheduleTool),
  withStandardDecorators(listContentMappingsTool),
  withStandardDecorators(saveContentMappingTool),
  withStandardDecorators(removeContentMappingTool),
];
