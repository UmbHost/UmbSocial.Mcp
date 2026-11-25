/**
 * The `social-ai` collection: UmbSocial AI. Registered only when the site has
 * the add-on, licensed; the writing tools only once it is set up.
 */

import { z } from "zod";
import {
  createToolResult,
  RAW_FIELD_MARKER,
  withStandardDecorators,
  type ToolCollectionExport,
  type ToolDefinition,
} from "@umbraco-cms/mcp-server-sdk";
import type { AiOptions, AiPostVersion, AiSettings, AiStatusResult, AiTextResult, PostResponse } from "../../api/generated/umbSocialApi.js";
import { callAi, gateAddOn } from "../../../session/addons.js";
import { AI_WRITTEN_NOTICE } from "../../../session/notices.js";
import { callSocial } from "../../../session/refusals.js";
import { can, hasSocialSection, toSocialUser, type CurrentUser } from "../../../session/social-user.js";
import { assertEditable } from "../social/post-request.js";
import { enabledFor, NEEDS_MANAGE, offByDefault, withRawTextChecks } from "../social/shared.js";

const NEEDS_AI_ADD_ON = "Needs UmbSocial AI.";
const NEEDS_USE_AI = `Needs the Social Use AI permission. ${NEEDS_AI_ADD_ON}`;
const CHANGES_POST =
  "The site marks the post as written with AI even if the text isn't used. Only a draft or a post awaiting approval is taken; any other is refused with post.not_draft.";
const useAi = enabledFor(["UseAi"]);

const statusSchema = z.object({ configured: z.boolean(), startFromLink: z.boolean() });

const getAiStatusTool: ToolDefinition<undefined, typeof statusSchema> = {
  name: "get-ai-status",
  description: `Gets whether UmbSocial AI is set up on the site, and whether it may draft from a link. ${NEEDS_USE_AI}`,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  outputSchema: statusSchema,
  enabled: useAi,
  handler: async () => createToolResult((await callAi<AiStatusResult>((api, raw) => api.getAiStatus(raw))).data),
};

const draftInput = {
  brief: z.string().min(1).optional().describe(`What the post is to say. Give this or link. ${RAW_FIELD_MARKER}`),
  link: z.url({ protocol: /^https$/ }).optional().describe(`A page for it to draft from (https), on a host the site allows. Give this or brief. ${RAW_FIELD_MARKER}`),
  channelKeys: z.array(z.guid()).min(1).describe("The channels, from list-channels."),
};
const draftSchema = z.object({ key: z.string(), version: z.string(), status: z.literal("Draft") });

const draftPostWithAiTool: ToolDefinition<typeof draftInput, typeof draftSchema> = {
  name: "draft-post-with-ai",
  description: [
    "Has the site's own AI draft a Social post, in the voice the site has set up, and saves it as a draft. To write the text yourself, use create-post.",
    "Needs the Social Use AI and Write permissions.",
    NEEDS_AI_ADD_ON,
    AI_WRITTEN_NOTICE,
  ].join(" "),
  slices: ["create"],
  annotations: { openWorldHint: true },
  inputSchema: draftInput,
  outputSchema: draftSchema,
  // Both, as the site asks (`AiController.DraftPost`).
  enabled: (user: CurrentUser) => can(toSocialUser(user), "UseAi") && can(toSocialUser(user), "Write"),
  handler: async (request) => {
    const { key, version } = (await callAi<AiPostVersion>((api, raw) => api.draftPost(request, raw))).data;
    return createToolResult({ key, version, status: "Draft" as const });
  },
};

const assertPostEditable = async (key: string) => assertEditable((await callSocial<PostResponse>((api, raw) => api.getPost(key, raw))).data);
const textSchema = z.object({ text: z.string(), version: z.string() });

const rewriteInput = {
  key: z.guid().describe("The post's key, from list-posts."),
  text: z.string().min(1).describe(`The text to rewrite. ${RAW_FIELD_MARKER}`),
  channelKeys: z.array(z.guid()).min(1).describe("The channels the text is for, whose limits it must keep to, from list-channels."),
  instruction: z.string().optional().describe(`How to rewrite it. ${RAW_FIELD_MARKER}`),
};

const rewriteTextWithAiTool: ToolDefinition<typeof rewriteInput, typeof textSchema> = {
  name: "rewrite-text-with-ai",
  description: `Has the site's own AI rewrite a Social post's text and returns it without saving it: save it with update-post, with the \`version\` returned here. ${CHANGES_POST} ${NEEDS_USE_AI}`,
  slices: ["update"],
  annotations: { openWorldHint: true },
  inputSchema: rewriteInput,
  outputSchema: textSchema,
  enabled: useAi,
  handler: async ({ key, channelKeys, text, instruction }) => {
    // Using AI on a post clears its review, which would stop one already on the calendar.
    await assertPostEditable(key);
    const request = { postKey: key, channelKey: channelKeys[0]!, channelKeys, text, instruction: instruction ?? null };
    return createToolResult((await callAi<AiTextResult>((api, raw) => api.rewriteText(request, raw))).data);
  },
};

const altInput = {
  key: z.guid().describe("The post's key, from list-posts."),
  mediaKey: z.guid().describe("The image, a media key from the cms media tools."),
};

const suggestAltTextTool: ToolDefinition<typeof altInput, typeof textSchema> = {
  name: "suggest-alt-text",
  description: `Has the site's own AI look at an image and suggest its alt text for a Social post, without saving it: save it with update-post's imageAltText, with the \`version\` returned here. ${CHANGES_POST} ${NEEDS_USE_AI}`,
  slices: ["update"],
  annotations: { openWorldHint: true },
  inputSchema: altInput,
  outputSchema: textSchema,
  enabled: useAi,
  handler: async ({ key, mediaKey }) => {
    await assertPostEditable(key);
    return createToolResult((await callAi<AiTextResult>((api, raw) => api.suggestAltText({ postKey: key, mediaKey }, raw))).data);
  },
};

const settingsFields = { profileId: z.string().nullish(), contextId: z.string().nullish(), sourceHosts: z.array(z.string()) };
const settingsSchema = z.object({
  ...settingsFields,
  profiles: z.array(z.object({ id: z.string(), name: z.string(), model: z.string() })),
  contexts: z.array(z.object({ id: z.string(), name: z.string() })),
  hasConnection: z.boolean(),
});
const readSettings = async () => (await callAi<AiSettings>((api, raw) => api.getAiSettings(raw))).data;

const getAiSettingsTool: ToolDefinition<undefined, typeof settingsSchema> = {
  name: "get-ai-settings",
  description: `Gets UmbSocial AI's settings: the Umbraco AI profile and context it uses, the hosts it may draft from, and the profiles and contexts there are to choose from. ${NEEDS_MANAGE} ${NEEDS_AI_ADD_ON}`,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  outputSchema: settingsSchema,
  enabled: enabledFor(["ManageSettings"]),
  handler: async () => {
    const options = (await callAi<AiOptions>((api, raw) => api.getAiOptions(raw))).data;
    return createToolResult({ ...(await readSettings()), ...options });
  },
};

const updateInput = {
  profileId: z.guid().nullish().describe("The Umbraco AI profile; null chooses none, left out it is kept."),
  contextId: z.guid().nullish().describe("The Umbraco AI context; null chooses none, left out it is kept."),
  sourceHosts: z.array(z.string()).optional().describe("The hosts it may draft from. These replace the ones there are; left out, they are kept."),
};
const savedSchema = z.object(settingsFields);

const updateAiSettingsTool: ToolDefinition<typeof updateInput, typeof savedSchema> = {
  name: "update-ai-settings",
  description: `Changes UmbSocial AI's settings, keeping what it isn't given. ${offByDefault("settings")} ${NEEDS_MANAGE} ${NEEDS_AI_ADD_ON}`,
  slices: ["settings"],
  annotations: { idempotentHint: true },
  inputSchema: updateInput,
  outputSchema: savedSchema,
  enabled: enabledFor(["ManageSettings"]),
  handler: async ({ profileId, contextId, sourceHosts }) => {
    const current = await readSettings();
    const request: AiSettings = {
      profileId: profileId !== undefined ? profileId : (current.profileId ?? null),
      contextId: contextId !== undefined ? contextId : (current.contextId ?? null),
      sourceHosts: sourceHosts ?? current.sourceHosts,
    };
    return createToolResult((await callAi<AiSettings>((api, raw) => api.saveAiSettings(request, raw))).data);
  },
};

const setUp: ToolDefinition<any, any>[] = [
  withStandardDecorators(getAiStatusTool),
  withStandardDecorators(getAiSettingsTool),
  withStandardDecorators(updateAiSettingsTool),
];
const tools: ToolDefinition<any, any>[] = [
  withStandardDecorators(withRawTextChecks(draftPostWithAiTool)),
  withStandardDecorators(withRawTextChecks(rewriteTextWithAiTool)),
  withStandardDecorators(suggestAltTextTool),
];

export const socialAiCollection: ToolCollectionExport<CurrentUser | undefined> = {
  metadata: {
    name: "social-ai",
    displayName: "Social AI",
    description: "UmbSocial AI: drafting, rewriting and alt text with the site's own AI",
  },
  tools: (user) => (hasSocialSection(user) ? gateAddOn("ai", tools, setUp) : []),
};
