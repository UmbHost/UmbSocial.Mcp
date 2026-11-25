/**
 * The `manage` slice: tags, hashtag groups and short links. Off unless
 * `UMBSOCIAL_ENABLE_SLICES` names it.
 */

import { z } from "zod";
import { createToolResult, RAW_FIELD_MARKER, withStandardDecorators, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import type { EditShortLinkRequest, HashtagGroupView, PostTagView } from "../../../api/generated/umbSocialApi.js";
import { callPro } from "../../../../session/addons.js";
import { ASKS_FIRST, confirmed, confirmInput, enabledFor, NEEDS_MANAGE, offByDefault, outcomeSchema, withRawTextChecks } from "../../social/shared.js";
import { NEEDS_PRO } from "../shared.js";

const NEEDS = `${offByDefault("manage")} ${NEEDS_MANAGE} ${NEEDS_PRO}`;
const enabled = enabledFor(["ManageSettings"]);

// Tags

const tagKey = z.guid().describe("The tag's key, from list-tags.");
const tagName = z.string().min(1).describe(`The tag's name. ${RAW_FIELD_MARKER}`);
const colour = z.string().min(1).describe("The tag's colour, as the site's other tags have it (list-tags).");
const tagSchema = z.object({ key: z.string(), name: z.string(), colour: z.string(), postCount: z.number() });
const tagAnswer = ({ key, name, colour: own, postCount }: PostTagView) => createToolResult({ key, name, colour: own, postCount });
const readTag = async (key: string) => (await callPro<PostTagView>((api, raw) => api.getTag(key, raw))).data;

const createTagInput = { name: tagName, colour: colour.optional() };

const createTagTool: ToolDefinition<typeof createTagInput, typeof tagSchema> = {
  name: "create-tag",
  description: `Creates a Social post tag. ${NEEDS}`,
  slices: ["manage"],
  inputSchema: createTagInput,
  outputSchema: tagSchema,
  enabled,
  handler: async (input) => tagAnswer((await callPro<PostTagView>((api, raw) => api.createTag(input, raw))).data),
};

const updateTagInput = { tagKey, name: tagName.optional(), colour: colour.optional() };

const updateTagTool: ToolDefinition<typeof updateTagInput, typeof tagSchema> = {
  name: "update-tag",
  description: `Changes a Social post tag's name or colour, on every post that has it. ${NEEDS}`,
  slices: ["manage"],
  annotations: { idempotentHint: true },
  inputSchema: updateTagInput,
  outputSchema: tagSchema,
  enabled,
  handler: async ({ tagKey: key, name, colour: own }) => {
    const current = await readTag(key);
    const request = { name: name ?? current.name, colour: own ?? current.colour };
    return tagAnswer((await callPro<PostTagView>((api, raw) => api.updateTag(key, request, raw))).data);
  },
};

const deleteTagInput = { tagKey, confirm: confirmInput };

const deleteTagTool: ToolDefinition<typeof deleteTagInput, typeof outcomeSchema> = {
  name: "delete-tag",
  description: `Deletes a Social post tag for good and takes it off its posts. ${ASKS_FIRST} ${NEEDS}`,
  slices: ["manage"],
  annotations: { destructiveHint: true },
  inputSchema: deleteTagInput,
  outputSchema: outcomeSchema,
  enabled,
  handler: async ({ tagKey: key, confirm }, extra) => {
    const { name, postCount } = await readTag(key);
    return confirmed(extra, `Delete the tag "${name}" (on ${postCount} posts) for good?`, confirm, key, () =>
      callPro<void>((api, raw) => api.deleteTag(key, raw)),
    );
  },
};

// Hashtag groups

const hashtagGroupKey = z.guid().describe("The group's key, from list-hashtags.");
const groupName = z.string().min(1).describe(`The group's name. ${RAW_FIELD_MARKER}`);
const tags = z.array(z.string().min(1).describe(RAW_FIELD_MARKER)).min(1).describe("The group's hashtags.");
const groupSchema = z.object({ key: z.string(), name: z.string(), tags: z.array(z.string()), usageCount: z.number() });
const groupAnswer = ({ key, name, tags: own, usageCount }: HashtagGroupView) => createToolResult({ key, name, tags: own, usageCount });
const readGroup = async (key: string) => (await callPro<HashtagGroupView>((api, raw) => api.getHashtagGroup(key, raw))).data;

const createGroupInput = { name: groupName, tags };

const createHashtagGroupTool: ToolDefinition<typeof createGroupInput, typeof groupSchema> = {
  name: "create-hashtag-group",
  description: `Saves a Social hashtag group for writers to insert. ${NEEDS}`,
  slices: ["manage"],
  inputSchema: createGroupInput,
  outputSchema: groupSchema,
  enabled,
  handler: async (input) => groupAnswer((await callPro<HashtagGroupView>((api, raw) => api.createHashtagGroup(input, raw))).data),
};

const updateGroupInput = { hashtagGroupKey, name: groupName.optional(), tags: tags.optional().describe("Replaces the group's hashtags. Left out, they are kept.") };

const updateHashtagGroupTool: ToolDefinition<typeof updateGroupInput, typeof groupSchema> = {
  name: "update-hashtag-group",
  description: `Changes a saved Social hashtag group; posts it was used in stay as they are. ${NEEDS}`,
  slices: ["manage"],
  annotations: { idempotentHint: true },
  inputSchema: updateGroupInput,
  outputSchema: groupSchema,
  enabled,
  handler: async ({ hashtagGroupKey: key, name, tags: own }) => {
    const current = await readGroup(key);
    const request = { name: name ?? current.name, tags: own ?? current.tags };
    return groupAnswer((await callPro<HashtagGroupView>((api, raw) => api.updateHashtagGroup(key, request, raw))).data);
  },
};

const deleteGroupInput = { hashtagGroupKey, confirm: confirmInput };

const deleteHashtagGroupTool: ToolDefinition<typeof deleteGroupInput, typeof outcomeSchema> = {
  name: "delete-hashtag-group",
  description: `Deletes a saved Social hashtag group for good; posts it was used in stay as they are. ${ASKS_FIRST} ${NEEDS}`,
  slices: ["manage"],
  annotations: { destructiveHint: true },
  inputSchema: deleteGroupInput,
  outputSchema: outcomeSchema,
  enabled,
  handler: async ({ hashtagGroupKey: key, confirm }, extra) => {
    const { name } = await readGroup(key);
    return confirmed(extra, `Delete the hashtag group "${name}" for good?`, confirm, key, () =>
      callPro<void>((api, raw) => api.deleteHashtagGroup(key, raw)),
    );
  },
};

// Short links

// Goes in the URL path, so letters, digits, - and _ only.
const shortLinkCode = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).describe("The short link's code, from list-short-links.");

const editLinkInput = {
  shortLinkCode,
  url: z.url({ protocol: /^https?$/ }).optional().describe(`Where it leads now. Give this or pageKey. ${RAW_FIELD_MARKER}`),
  pageKey: z.guid().optional().describe("The page it leads to now: its document key, from the cms document tools."),
  pageCulture: z.string().max(20).optional().describe("With pageKey: the page's language."),
  suffix: z.string().optional().describe(`With pageKey: a query string or fragment to add to the page's address. ${RAW_FIELD_MARKER}`),
  confirm: confirmInput,
};

const updateShortLinkTool: ToolDefinition<typeof editLinkInput, typeof outcomeSchema> = {
  name: "update-short-link",
  description: `Changes where a Social short link leads, in posts that are already live too. ${ASKS_FIRST} ${NEEDS}`,
  slices: ["manage"],
  annotations: { destructiveHint: true },
  inputSchema: editLinkInput,
  outputSchema: outcomeSchema,
  enabled,
  handler: async ({ shortLinkCode: code, url, pageKey, pageCulture, suffix, confirm }, extra) => {
    const request: EditShortLinkRequest = { url: url ?? null, contentKey: pageKey ?? null, culture: pageCulture ?? null, suffix: suffix ?? null };
    return confirmed(extra, `Make the short link ${code} lead to ${url ?? `the page ${pageKey}`}, in live posts too?`, confirm, code, () =>
      callPro<void>((api, raw) => api.editShortLink(code, request, raw)),
    );
  },
};

const removeLinkInput = { shortLinkCode, confirm: confirmInput };

const deleteShortLinkTool: ToolDefinition<typeof removeLinkInput, typeof outcomeSchema> = {
  name: "delete-short-link",
  description: `Takes down a Social short link for good, so it stops working in live posts. ${ASKS_FIRST} ${NEEDS}`,
  slices: ["manage"],
  annotations: { destructiveHint: true },
  inputSchema: removeLinkInput,
  outputSchema: outcomeSchema,
  enabled,
  handler: async ({ shortLinkCode: code, confirm }, extra) =>
    confirmed(extra, `Take down the short link ${code} for good? It stops working in live posts.`, confirm, code, () =>
      callPro<void>((api, raw) => api.removeShortLink(code, raw)),
    ),
};

export const manageTools: ToolDefinition<any, any>[] = [
  withStandardDecorators(withRawTextChecks(createTagTool)),
  withStandardDecorators(withRawTextChecks(updateTagTool)),
  withStandardDecorators(deleteTagTool),
  withStandardDecorators(withRawTextChecks(createHashtagGroupTool)),
  withStandardDecorators(withRawTextChecks(updateHashtagGroupTool)),
  withStandardDecorators(deleteHashtagGroupTool),
  withStandardDecorators(withRawTextChecks(updateShortLinkTool)),
  withStandardDecorators(deleteShortLinkTool),
];
