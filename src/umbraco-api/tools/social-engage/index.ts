/**
 * The `social-engage` collection: what social posts bring to the site, from
 * Umbraco Engage. Registered only when the site has the UmbSocial Engage
 * add-on and its licence includes it. Every tool only reads.
 */

import { z } from "zod";
import { createToolResult, withStandardDecorators, type ToolCollectionExport, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import type {
  EngageCampaignFigures,
  EngageCampaignSeries,
  EngagePostFigures,
  EngagePostVisits,
  EngageShortLinkVisits,
  EngageSocialOverview,
  EngageStatus,
} from "../../api/generated/umbSocialApi.js";
import { callEngage, gateAddOn } from "../../../session/addons.js";
import { hasSocialSection, READ, READ_POST, type CurrentUser } from "../../../session/social-user.js";
import { enabledFor, NEEDS_MANAGE, NEEDS_READ, NEEDS_READ_POST, NEEDS_VIEW } from "../social/shared.js";

const NEEDS_ENGAGE = "Needs UmbSocial Engage.";
const REPORTS = "The figures are Umbraco Engage's nightly reports; `reportsExist` is false before the first.";
const readOnly = { readOnlyHint: true };

const range = {
  from: z.iso.date().describe("The first day (YYYY-MM-DD)."),
  to: z.iso.date().describe("The last day (YYYY-MM-DD), at most 366 days in all."),
};
const campaignInput = { campaignKey: z.guid().describe("The campaign's key, from list-campaigns."), ...range };
const postKeys = z.array(z.guid()).min(1).max(200).describe("The posts, from list-posts; at most 200.");

const network = z.object({ source: z.string(), entries: z.number(), visitors: z.number(), goals: z.number() });
const goal = z.object({ key: z.string(), name: z.string(), completions: z.number(), value: z.number() });

const statusSchema = z.object({ goal: z.object({ key: z.string(), name: z.string() }).nullable() });

const getEngageStatusTool: ToolDefinition<undefined, typeof statusSchema> = {
  name: "get-engage-status",
  description: `Gets the Umbraco Engage goal that arrivals from Social posts are recorded as, or null when there is none yet. ${NEEDS_VIEW} ${NEEDS_ENGAGE}`,
  slices: ["read"],
  annotations: readOnly,
  outputSchema: statusSchema,
  enabled: enabledFor(["View"]),
  handler: async () => createToolResult({ goal: (await callEngage<EngageStatus>((api, raw) => api.getEngageStatus(raw))).data.goal ?? null }),
};

const overviewSchema = z.object({
  days: z.array(z.object({ day: z.string(), network: z.string(), visits: z.number() })),
  networks: z.array(network),
  campaigns: z.array(z.object({ campaignKey: z.string(), name: z.string(), entries: z.number(), visitors: z.number(), goals: z.number() })),
  posts: z.array(z.object({ postKey: z.string(), title: z.string(), visits: z.number(), goals: z.number() })),
  goals: z.array(goal),
  networkDays: z.array(z.object({ day: z.string(), network: z.string(), name: z.string(), value: z.number() })),
  funnel: z.object({ linkClicks: z.number(), visits: z.number(), goals: z.number() }),
});

const getEngageOverviewTool: ToolDefinition<typeof range, typeof overviewSchema> = {
  name: "get-engage-overview",
  description: `Gets what Social posts brought to the site over a period: visits by day and network, the best campaigns and posts, the goals visitors reached, and the funnel from clicks to goals. ${NEEDS_VIEW} ${NEEDS_ENGAGE}`,
  slices: ["read"],
  annotations: readOnly,
  inputSchema: range,
  outputSchema: overviewSchema,
  enabled: enabledFor(["View"]),
  handler: async (params) => createToolResult((await callEngage<EngageSocialOverview>((api, raw) => api.getEngageSocialOverview(params, raw))).data),
};

const figuresSchema = z.object({ reportsExist: z.boolean(), networks: z.array(network) });

const getEngageCampaignFiguresTool: ToolDefinition<typeof campaignInput, typeof figuresSchema> = {
  name: "get-engage-campaign-figures",
  description: `Gets a Social campaign's entries, visitors and goals over a period, by network. ${REPORTS} ${NEEDS_READ} ${NEEDS_ENGAGE}`,
  slices: ["read"],
  annotations: readOnly,
  inputSchema: campaignInput,
  outputSchema: figuresSchema,
  enabled: enabledFor(READ),
  handler: async ({ campaignKey, ...params }) =>
    createToolResult((await callEngage<EngageCampaignFigures>((api, raw) => api.getEngageCampaignFigures(campaignKey, params, raw))).data),
};

const seriesSchema = z.object({
  name: z.string(),
  reportsExist: z.boolean(),
  points: z.array(z.object({ period: z.string(), source: z.string(), entries: z.number(), visitors: z.number(), goals: z.number() })),
});

const getEngageCampaignSeriesTool: ToolDefinition<typeof campaignInput, typeof seriesSchema> = {
  name: "get-engage-campaign-series",
  description: `Gets a Social campaign's entries, visitors and goals over time, by network: by day for up to 31 days, by week beyond. ${REPORTS} ${NEEDS_READ} ${NEEDS_ENGAGE}`,
  slices: ["read"],
  annotations: readOnly,
  inputSchema: campaignInput,
  outputSchema: seriesSchema,
  enabled: enabledFor(READ),
  handler: async ({ campaignKey, ...params }) =>
    createToolResult((await callEngage<EngageCampaignSeries>((api, raw) => api.getEngageCampaignSeries(campaignKey, params, raw))).data),
};

const targetInput = { targetId: z.number().int().positive().describe("A published channel of a post: a target's id from get-post.") };
const targetSchema = z.object({
  campaign: z.string().nullish(),
  campaignKey: z.string().nullish(),
  source: z.string().nullish(),
  reportsExist: z.boolean(),
  network: network.nullish(),
});

const getEngageTargetFiguresTool: ToolDefinition<typeof targetInput, typeof targetSchema> = {
  name: "get-engage-target-figures",
  description: `Gets the campaign figures of the network one channel of a post was published to, since it went out. A post without a campaign has none. ${REPORTS} ${NEEDS_READ_POST} ${NEEDS_ENGAGE}`,
  slices: ["read"],
  annotations: readOnly,
  inputSchema: targetInput,
  outputSchema: targetSchema,
  enabled: enabledFor(READ_POST),
  handler: async ({ targetId }) => createToolResult((await callEngage<EngagePostFigures>((api, raw) => api.getEngageTargetFigures(targetId, raw))).data),
};

const postsInput = { postKeys };
const postsSchema = z.object({
  items: z.array(
    z.object({
      postKey: z.string(),
      visits: z.number(),
      goals: z.array(goal),
      channels: z.array(
        z.object({
          channelKey: z.string(),
          visits: z.number(),
          goals: z.array(goal),
          links: z.array(z.object({ code: z.string(), clicks: z.number(), visits: z.number() })),
        }),
      ),
    }),
  ),
});

const getEngagePostFiguresTool: ToolDefinition<typeof postsInput, typeof postsSchema> = {
  name: "get-engage-post-figures",
  description: `Gets the visits up to 200 posts brought to the site and the goals those visitors reached, by channel and short link. A post with no visits, or one this user may not read, is left out. ${NEEDS_READ_POST} ${NEEDS_ENGAGE}`,
  slices: ["read"],
  annotations: readOnly,
  inputSchema: postsInput,
  outputSchema: postsSchema,
  enabled: enabledFor(READ_POST),
  handler: async (request) => createToolResult({ items: (await callEngage<EngagePostVisits[]>((api, raw) => api.readEngagePostFigures(request, raw))).data }),
};

const linksInput = {
  shortLinkCodes: z.array(z.string().min(1)).min(1).max(200).describe("The short links' codes, from list-short-links; at most 200."),
};
const linksSchema = z.object({ items: z.array(z.object({ code: z.string(), visits: z.number() })) });

const getEngageShortLinkVisitsTool: ToolDefinition<typeof linksInput, typeof linksSchema> = {
  name: "get-engage-short-link-visits",
  description: `Gets the visits up to 200 short links brought to the site. One with no visits is left out. ${NEEDS_MANAGE} ${NEEDS_ENGAGE}`,
  slices: ["read"],
  annotations: readOnly,
  inputSchema: linksInput,
  outputSchema: linksSchema,
  enabled: enabledFor(["ManageSettings"]),
  handler: async (request) =>
    createToolResult({ items: (await callEngage<EngageShortLinkVisits[]>((api, raw) => api.readEngageShortLinkVisits(request, raw))).data }),
};

const tools: ToolDefinition<any, any>[] = [
  withStandardDecorators(getEngageStatusTool),
  withStandardDecorators(getEngageOverviewTool),
  withStandardDecorators(getEngageCampaignFiguresTool),
  withStandardDecorators(getEngageCampaignSeriesTool),
  withStandardDecorators(getEngageTargetFiguresTool),
  withStandardDecorators(getEngagePostFiguresTool),
  withStandardDecorators(getEngageShortLinkVisitsTool),
];

export const socialEngageCollection: ToolCollectionExport<CurrentUser | undefined> = {
  metadata: {
    name: "social-engage",
    displayName: "Social Engage",
    description: "UmbSocial Engage: what social posts bring to the site, from Umbraco Engage",
  },
  tools: (user) => (hasSocialSection(user) ? gateAddOn("engage", tools) : []),
};
