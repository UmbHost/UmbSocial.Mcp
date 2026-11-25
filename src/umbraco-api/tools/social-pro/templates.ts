/**
 * Writing post templates: create, change, duplicate and delete.
 */

import { z } from "zod";
import { createToolResult, RAW_FIELD_MARKER, withStandardDecorators, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import type { PostTemplateRequest, PostTemplateView } from "../../api/generated/umbSocialApi.js";
import { callPro } from "../../../session/addons.js";
import { ASKS_FIRST, confirmed, confirmInput, enabledFor, NEEDS_WRITE, outcomeSchema, withRawTextChecks } from "../social/shared.js";
import { NEEDS_PRO } from "./shared.js";

const TEMPLATE_AI =
  "A template written or changed through this tool is marked on the server as written with AI for good, and so is every post made from it: a person must review such a post in the Umbraco backoffice before it can be scheduled or published.";
const OWN = "Without Manage settings, only this user's own templates can be changed or deleted.";

const templateKey = z.guid().describe("The template's key, from list-templates.");
const fields = {
  name: z.string().min(1).describe(`The template's name. ${RAW_FIELD_MARKER}`),
  text: z.string().min(1).describe(`The text a post starts with. ${RAW_FIELD_MARKER}`),
  linkUrl: z.url({ protocol: /^https$/ }).nullish().describe(`The link a post starts with (https). ${RAW_FIELD_MARKER}`),
  campaignKey: z.guid().nullish().describe("The campaign, from list-campaigns."),
  channelKeys: z.array(z.guid()).optional().describe("The channels a post starts with, from list-channels."),
  documentTypeKeys: z.array(z.guid()).optional().describe("The document types the template is offered for: documentTypeKey from get-page-share. None offers it for every page."),
};

const templateSchema = z.object({ key: z.string(), name: z.string(), fromAi: z.boolean() });
const answer = ({ key, name, fromAi }: PostTemplateView) => createToolResult({ key, name, fromAi });

const enabled = enabledFor(["Write"]);

const createTemplateTool: ToolDefinition<typeof fields, typeof templateSchema> = {
  name: "create-template",
  description: ["Creates a Social post template.", NEEDS_WRITE, NEEDS_PRO, TEMPLATE_AI].join(" "),
  slices: ["create"],
  inputSchema: fields,
  outputSchema: templateSchema,
  enabled,
  handler: async (input) => {
    const request: PostTemplateRequest = { ...input, channelKeys: input.channelKeys ?? [], documentTypeKeys: input.documentTypeKeys ?? [] };
    return answer((await callPro<PostTemplateView>((api, raw) => api.createTemplate(request, raw))).data);
  },
};

const updateInput = {
  templateKey,
  name: fields.name.optional(),
  text: fields.text.optional(),
  linkUrl: fields.linkUrl,
  campaignKey: fields.campaignKey,
  channelKeys: fields.channelKeys,
  documentTypeKeys: fields.documentTypeKeys,
};

const updateTemplateTool: ToolDefinition<typeof updateInput, typeof templateSchema> = {
  name: "update-template",
  description: ["Changes a Social post template, keeping every field it isn't given; null removes the link or campaign.", OWN, NEEDS_WRITE, NEEDS_PRO, TEMPLATE_AI].join(" "),
  slices: ["update"],
  annotations: { idempotentHint: true },
  inputSchema: updateInput,
  outputSchema: templateSchema,
  enabled,
  handler: async ({ templateKey: key, ...changes }) => {
    const current = (await callPro<PostTemplateView>((api, raw) => api.getTemplate(key, raw))).data;
    const request: PostTemplateRequest = {
      name: changes.name ?? current.name,
      text: changes.text ?? current.text,
      linkUrl: changes.linkUrl !== undefined ? changes.linkUrl : (current.linkUrl ?? null),
      campaignKey: changes.campaignKey !== undefined ? changes.campaignKey : (current.campaign?.key ?? null),
      channelKeys: changes.channelKeys ?? current.channelKeys,
      documentTypeKeys: changes.documentTypeKeys ?? current.documentTypeKeys,
    };
    return answer((await callPro<PostTemplateView>((api, raw) => api.updateTemplate(key, request, raw))).data);
  },
};

const keyInput = { templateKey };

const duplicateTemplateTool: ToolDefinition<typeof keyInput, typeof templateSchema> = {
  name: "duplicate-template",
  description: ["Copies a Social post template into a new one of this user's own.", NEEDS_WRITE, NEEDS_PRO, TEMPLATE_AI].join(" "),
  slices: ["create"],
  inputSchema: keyInput,
  outputSchema: templateSchema,
  enabled,
  handler: async ({ templateKey: key }) => answer((await callPro<PostTemplateView>((api, raw) => api.duplicateTemplate(key, raw))).data),
};

const deleteInput = { templateKey, confirm: confirmInput };

const deleteTemplateTool: ToolDefinition<typeof deleteInput, typeof outcomeSchema> = {
  name: "delete-template",
  description: ["Deletes a Social post template for good; posts made from it stay.", ASKS_FIRST, OWN, NEEDS_WRITE, NEEDS_PRO].join(" "),
  slices: ["delete"],
  annotations: { destructiveHint: true },
  inputSchema: deleteInput,
  outputSchema: outcomeSchema,
  enabled,
  handler: async ({ templateKey: key, confirm }, extra) => {
    const { name } = (await callPro<PostTemplateView>((api, raw) => api.getTemplate(key, raw))).data;
    return confirmed(extra, `Delete the template "${name}" for good?`, confirm, key, () => callPro<void>((api, raw) => api.deleteTemplate(key, raw)));
  },
};

export const templateTools: ToolDefinition<any, any>[] = [
  withStandardDecorators(withRawTextChecks(createTemplateTool)),
  withStandardDecorators(withRawTextChecks(updateTemplateTool)),
  withStandardDecorators(duplicateTemplateTool),
  withStandardDecorators(deleteTemplateTool),
];
