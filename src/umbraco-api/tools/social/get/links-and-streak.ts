/**
 * get-posting-streak, get-page-link and get-media-link.
 */

import { z } from "zod";
import { createToolResult, withStandardDecorators, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import type { LinkPageResponse, StreakResponse } from "../../../api/generated/umbSocialApi.js";
import { callSocial } from "../../../../session/refusals.js";
import { enabledFor, NEEDS_VIEW, NEEDS_WRITE } from "../shared.js";

const streakSchema = z.object({ weeks: z.number(), thisWeekPosted: z.boolean(), best: z.number() });

const getPostingStreakTool: ToolDefinition<undefined, typeof streakSchema> = {
  name: "get-posting-streak",
  description: `Gets the site's posting streak: how many weeks in a row something was published, whether this week has a post yet, and the best streak. ${NEEDS_VIEW}`,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  outputSchema: streakSchema,
  enabled: enabledFor(["View"]),
  handler: async () => {
    const response = await callSocial<StreakResponse>((api, raw) => api.getStreak(raw));
    return createToolResult(response.data);
  },
};

const linkSchema = z.object({ url: z.string(), live: z.boolean() });

const pageInput = {
  pageKey: z.guid().describe("The page: its document key, from the cms document tools."),
  pageCulture: z.string().max(20).optional().describe("The page's language, for a page that varies by language."),
};

const getPageLinkTool: ToolDefinition<typeof pageInput, typeof linkSchema> = {
  name: "get-page-link",
  description: `Gets the address to use in a post for one of the site's own pages. A page that isn't live yet gets a placeholder (\`live\` is false), which the site replaces with the real address when the post goes out. Put the address in the post's text or linkUrl and name it in pageLinks, so it follows the page if the page moves. Needs Umbraco's Browse permission on the page. ${NEEDS_WRITE}`,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  inputSchema: pageInput,
  outputSchema: linkSchema,
  enabled: enabledFor(["Write"]),
  handler: async ({ pageKey, pageCulture }) => {
    const response = await callSocial<LinkPageResponse>((api, raw) => api.pageLink({ key: pageKey, culture: pageCulture }, raw));
    return createToolResult(response.data);
  },
};

const mediaInput = { mediaKey: z.guid().describe("The media item's key, from the cms media tools.") };

const getMediaLinkTool: ToolDefinition<typeof mediaInput, typeof linkSchema> = {
  name: "get-media-link",
  description: `Gets the public address of a media item, such as a PDF, to link to in a post. ${NEEDS_WRITE}`,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  inputSchema: mediaInput,
  outputSchema: linkSchema,
  enabled: enabledFor(["Write"]),
  handler: async ({ mediaKey }) => {
    const response = await callSocial<LinkPageResponse>((api, raw) => api.mediaLink({ key: mediaKey }, raw));
    return createToolResult(response.data);
  },
};

export const getPostingStreak = withStandardDecorators(getPostingStreakTool);
export const getPageLink = withStandardDecorators(getPageLinkTool);
export const getMediaLink = withStandardDecorators(getMediaLinkTool);
