/**
 * Pro's settings: approvals, links, channel schedules and automatic posting.
 * Reading is on by default; changing is in the `settings` slice, off unless
 * `UMBSOCIAL_ENABLE_SLICES` names it.
 */

import { z } from "zod";
import { createToolResult, RAW_FIELD_MARKER, withStandardDecorators, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import type {
  ApprovalSettingsModel,
  ChannelScheduleResponse,
  ContentAutomationCreated,
  ContentAutomationModel,
  LinkSettingsModel,
  SiteHostsModel,
} from "../../../api/generated/umbSocialApi.js";
import { callPro } from "../../../../session/addons.js";
import type { SocialVerb } from "../../../../session/social-user.js";
import { confirmIfSupported, confirmInput, enabledFor, NEEDS_MANAGE, offByDefault, withRawTextChecks } from "../../social/shared.js";
import { slotInput, slotSchema, toSlots } from "../../social/settings/site.js";
import { NEEDS_PRO } from "../shared.js";

const OFF = offByDefault("settings");
const NEEDS = `${OFF} ${NEEDS_MANAGE} ${NEEDS_PRO}`;
const enabled = enabledFor(["ManageSettings"]);
const DECLINED = "The person chose not to.";

// Approvals

/** Pro's policy (`ProPolicies.ApprovalSettingsRead`). */
const APPROVALS_READ: readonly SocialVerb[] = ["View", "Write", "Approve", "ManageSettings"];
const approvalsSchema = z.object({ approvalsEnabled: z.boolean(), allowSelfApproval: z.boolean() });
const readApprovals = async () => (await callPro<ApprovalSettingsModel>((api, raw) => api.getApprovalSettings(raw))).data;

const getApprovalSettingsTool: ToolDefinition<undefined, typeof approvalsSchema> = {
  name: "get-approval-settings",
  description: `Gets whether the site uses approvals, and whether people may approve their own posts. Needs the Social View, Write, Approve or Manage settings permission. ${NEEDS_PRO}`,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  outputSchema: approvalsSchema,
  enabled: enabledFor(APPROVALS_READ),
  handler: async () => createToolResult(await readApprovals()),
};

const approvalsInput = { approvalsEnabled: z.boolean().optional(), allowSelfApproval: z.boolean().optional(), confirm: confirmInput };
const approvalsSavedSchema = approvalsSchema.extend({ done: z.boolean(), message: z.string().optional() });

const updateApprovalSettingsTool: ToolDefinition<typeof approvalsInput, typeof approvalsSavedSchema> = {
  name: "update-approval-settings",
  description: `Changes the site's approval settings, keeping what it isn't given. Turning approvals off, or letting people approve their own posts, weakens review, so the person is asked to confirm those first; a client that can't ask needs confirm: true. With approvals off, posts an API user writes still need a person's review. ${NEEDS}`,
  slices: ["settings"],
  annotations: { destructiveHint: true },
  inputSchema: approvalsInput,
  outputSchema: approvalsSavedSchema,
  enabled,
  handler: async ({ approvalsEnabled, allowSelfApproval, confirm }, extra) => {
    const current = await readApprovals();
    const next = {
      approvalsEnabled: approvalsEnabled ?? current.approvalsEnabled,
      allowSelfApproval: allowSelfApproval ?? current.allowSelfApproval,
    };
    const weaker = (current.approvalsEnabled && !next.approvalsEnabled) || (!current.allowSelfApproval && next.allowSelfApproval);
    const question = next.approvalsEnabled
      ? "Let people approve their own Social posts?"
      : "Turn Social approvals off? Posts and automatic posts that would have waited for approval can then go on the calendar without it.";
    if (weaker && !(await confirmIfSupported(extra, question, confirm))) {
      return createToolResult({ ...current, done: false, message: DECLINED });
    }
    const saved = (await callPro<ApprovalSettingsModel>((api, raw) => api.saveApprovalSettings(next, raw))).data;
    return createToolResult({ ...saved, done: true });
  },
};

// Links

const utmField = z.object({ default: z.string(), locked: z.boolean() });
const linksSchema = z.object({
  utmEnabled: z.boolean(),
  utmOtherHosts: z.array(z.string()),
  utmOffHosts: z.array(z.string()),
  utmSource: utmField,
  utmMedium: utmField,
  utmCampaign: utmField,
  utmContent: utmField,
  utmSourceByNetwork: z.record(z.string(), z.string()),
  shortLinksEnabled: z.boolean(),
  shortLinkBaseUrl: z.string(),
  shortLinkPath: z.string(),
});
const hostsSchema = z.object({ domains: z.array(z.string()), mainHost: z.string().nullish(), shortLinkHost: z.string().nullish() });
const linksReadSchema = linksSchema.extend({ siteHosts: hostsSchema });
const readLinks = async () => (await callPro<LinkSettingsModel>((api, raw) => api.getLinkSettings(raw))).data;

const getLinkSettingsTool: ToolDefinition<undefined, typeof linksReadSchema> = {
  name: "get-link-settings",
  description: `Gets how the site tags and shortens the links in Social posts: the UTM defaults and which are locked, the hosts they go on, the short link address, and the site's own hosts. ${NEEDS_MANAGE} ${NEEDS_PRO}`,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  outputSchema: linksReadSchema,
  enabled,
  handler: async () => {
    const siteHosts = (await callPro<SiteHostsModel>((api, raw) => api.getSiteHosts(raw))).data;
    return createToolResult({ ...(await readLinks()), siteHosts });
  },
};

const rawText = (text: string) => z.string().describe(`${text} ${RAW_FIELD_MARKER}`);
const utmInput = z.object({ default: rawText("The default value; it may hold placeholders."), locked: z.boolean() }).optional();
const linksInput = {
  utmEnabled: z.boolean().optional(),
  utmOtherHosts: z.array(z.string()).optional().describe("Hosts other than the site's own whose links are tagged."),
  utmOffHosts: z.array(z.string()).optional().describe("Hosts whose links are never tagged."),
  utmSource: utmInput,
  utmMedium: utmInput,
  utmCampaign: utmInput,
  utmContent: utmInput,
  utmSourceByNetwork: z.record(z.string(), rawText("That network's source.")).optional(),
  shortLinksEnabled: z.boolean().optional(),
  shortLinkBaseUrl: rawText("The address short links start with; empty uses the site's own.").optional(),
  shortLinkPath: rawText("The path short links are under.").optional(),
  confirm: confirmInput,
};
const linksSavedSchema = linksSchema.extend({ done: z.boolean(), message: z.string().optional() });

const updateLinkSettingsTool: ToolDefinition<typeof linksInput, typeof linksSavedSchema> = {
  name: "update-link-settings",
  description: `Changes how the site tags and shortens the links in Social posts, keeping every setting it isn't given. They apply to posts already on the calendar. Changing the short link address or path sends posts' links elsewhere, so the person is asked to confirm that first; a client that can't ask needs confirm: true. ${NEEDS}`,
  slices: ["settings"],
  annotations: { idempotentHint: true },
  inputSchema: linksInput,
  outputSchema: linksSavedSchema,
  enabled,
  handler: async ({ confirm, ...changes }, extra) => {
    const current = await readLinks();
    const next = { ...current, ...Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined)) } as LinkSettingsModel;
    const moved = next.shortLinkBaseUrl !== current.shortLinkBaseUrl || next.shortLinkPath !== current.shortLinkPath;
    if (moved && !(await confirmIfSupported(extra, `Make short links start with ${next.shortLinkBaseUrl || "the site's address"} and the path ${next.shortLinkPath}?`, confirm))) {
      return createToolResult({ ...current, done: false, message: DECLINED });
    }
    const saved = (await callPro<LinkSettingsModel>((api, raw) => api.saveLinkSettings(next, raw))).data;
    return createToolResult({ ...saved, done: true });
  },
};

// Channel schedules

const channelKey = z.guid().describe("The channel's key, from list-channels.");
const channelInput = { channelKey };
const slotsSchema = z.object({ slots: z.array(slotSchema) });

const getChannelScheduleTool: ToolDefinition<typeof channelInput, typeof slotsSchema> = {
  name: "get-channel-schedule",
  description: `Gets a channel's own weekly posting slots; none means it uses the site's schedule (get-schedule). ${NEEDS_MANAGE} ${NEEDS_PRO}`,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  inputSchema: channelInput,
  outputSchema: slotsSchema,
  enabled,
  handler: async ({ channelKey: key }) => createToolResult((await callPro<ChannelScheduleResponse>((api, raw) => api.getChannelSchedule(key, raw))).data),
};

const setScheduleInput = { channelKey, slots: z.array(slotInput).describe("Every slot: these replace the ones there are. An empty list goes back to the site's schedule.") };

const updateChannelScheduleTool: ToolDefinition<typeof setScheduleInput, typeof slotsSchema> = {
  name: "update-channel-schedule",
  description: `Replaces a channel's own weekly posting slots. ${NEEDS}`,
  slices: ["settings"],
  annotations: { idempotentHint: true },
  inputSchema: setScheduleInput,
  outputSchema: slotsSchema,
  enabled,
  handler: async ({ channelKey: key, slots }) =>
    createToolResult((await callPro<ChannelScheduleResponse>((api, raw) => api.saveChannelSchedule(key, { slots: toSlots(slots) }, raw))).data),
};

// Automatic posting

const automationSchema = z.object({
  automationId: z.string(),
  documentTypeKey: z.string(),
  documentTypeName: z.string().nullish(),
  name: z.string(),
  enabled: z.boolean(),
  workspaceName: z.string().nullish(),
});
const automationsSchema = z.object({ items: z.array(automationSchema) });

const listContentAutomationsTool: ToolDefinition<undefined, typeof automationsSchema> = {
  name: "list-content-automations",
  description: `Lists the automations that make a Social post when a page is published, by document type, and whether each is on. They are changed, turned on or off and deleted in Umbraco Automate. ${NEEDS_MANAGE} ${NEEDS_PRO}`,
  slices: ["list"],
  annotations: { readOnlyHint: true },
  outputSchema: automationsSchema,
  enabled,
  handler: async () => createToolResult({ items: (await callPro<ContentAutomationModel[]>((api, raw) => api.listContentAutomations(raw))).data }),
};

const createAutomationInput = {
  documentTypeKey: z.guid().describe("The document type whose pages are posted about: the documentTypeKey from get-page-share."),
  // Not Queue: those posts go out with nobody's review, and their text is the
  // page's own, which an assistant may have written through other tools. The
  // site can't tell, so only a person sets that up, in the backoffice.
  mode: z.enum(["Draft", "AwaitingApproval"]).describe("How each post is left: a draft, or awaiting approval where the site uses approvals."),
  channelKeys: z.array(z.guid()).optional().describe("The channels, from list-channels. None uses the template's, or else every enabled channel."),
  templateKey: z.guid().optional().describe("The template each post starts from, from list-templates."),
  allCultures: z.boolean().optional().describe("True makes a post for every language published, not only the site's default."),
  confirm: confirmInput,
};
const createdSchema = z.object({ done: z.boolean(), automationId: z.string().optional(), workspaceName: z.string().nullish(), message: z.string().optional() });

const createContentAutomationTool: ToolDefinition<typeof createAutomationInput, typeof createdSchema> = {
  name: "create-content-automation",
  description: `Sets up automatic posting for a document type: publishing one of its pages then makes a Social post, left as a draft or awaiting approval for a person. Putting such posts straight on the calendar is set up by a person in the Umbraco backoffice. The person is asked to confirm first; a client that can't ask needs confirm: true. ${NEEDS}`,
  slices: ["settings"],
  annotations: { destructiveHint: true },
  inputSchema: createAutomationInput,
  outputSchema: createdSchema,
  enabled,
  handler: async ({ confirm, channelKeys, templateKey, allCultures, ...rest }, extra) => {
    if (!(await confirmIfSupported(extra, "Make a Social post automatically whenever a page of this document type is published?", confirm))) {
      return createToolResult({ done: false, message: DECLINED });
    }
    const request = { ...rest, channelKeys: channelKeys ?? [], templateKey: templateKey ?? null, allCultures: allCultures ?? false };
    const created = (await callPro<ContentAutomationCreated>((api, raw) => api.createContentAutomation(request, raw))).data;
    return createToolResult({ done: true, automationId: created.automationId, workspaceName: created.workspaceName ?? null });
  },
};

export const proSettingTools: ToolDefinition<any, any>[] = [
  withStandardDecorators(getApprovalSettingsTool),
  withStandardDecorators(updateApprovalSettingsTool),
  withStandardDecorators(getLinkSettingsTool),
  withStandardDecorators(withRawTextChecks(updateLinkSettingsTool)),
  withStandardDecorators(getChannelScheduleTool),
  withStandardDecorators(updateChannelScheduleTool),
  withStandardDecorators(listContentAutomationsTool),
  withStandardDecorators(createContentAutomationTool),
];
