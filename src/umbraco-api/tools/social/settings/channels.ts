/**
 * Channel settings. Reading what is set up is on by default; changing it, and
 * the calls that reach a network, are in the `settings` slice, off unless
 * `UMBSOCIAL_ENABLE_SLICES` names it.
 */

import { z } from "zod";
import { createToolResult, RAW_FIELD_MARKER, withStandardDecorators, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import type {
  ChannelResponse,
  ChannelSavedResponse,
  ConnectionOptionResponse,
  ConnectionTestResponse,
  NetworkResponse,
  OptionChoicesResponse,
} from "../../../api/generated/umbSocialApi.js";
import { callSocial } from "../../../../session/refusals.js";
import { ASKS_FIRST, confirmed, confirmIfSupported, confirmInput, enabledFor, NEEDS_MANAGE, offByDefault, outcomeSchema, withRawTextChecks } from "../shared.js";

const OFF = offByDefault("settings");
const enabled = enabledFor(["ManageSettings"]);
const channelKey = z.guid().describe("The channel's key, from list-channels.");
const network = z.string().min(1).describe("The network's id, from list-networks.");
const connectionId = z.guid().describe("The Umbraco Automate connection, from list-connections.");
const options = z
  .record(z.string(), z.string().describe(RAW_FIELD_MARKER))
  .describe("The channel's own settings, by name, such as the page or board it posts to (see list-option-choices).");

const networksSchema = z.object({ items: z.array(z.object({ network: z.string(), displayName: z.string() })) });

const listNetworksTool: ToolDefinition<undefined, typeof networksSchema> = {
  name: "list-networks",
  description: `Lists the networks this site can add a Social channel for, each with its id and name. ${NEEDS_MANAGE}`,
  slices: ["list"],
  annotations: { readOnlyHint: true },
  outputSchema: networksSchema,
  enabled,
  handler: async () => {
    const response = await callSocial<NetworkResponse[]>((api, raw) => api.listNetworks(raw));
    return createToolResult({ items: response.data.map(({ network: id, displayName }) => ({ network: id, displayName })) });
  },
};

const connectionsInput = { network };
const connectionsSchema = z.object({ items: z.array(z.object({ connectionId: z.string(), name: z.string() })) });

const listConnectionsTool: ToolDefinition<typeof connectionsInput, typeof connectionsSchema> = {
  name: "list-connections",
  description: `Lists the Umbraco Automate connections a network's channel can use, by name. A connection is made, and signed in to its network, by a person in Umbraco Automate. ${NEEDS_MANAGE}`,
  slices: ["list"],
  annotations: { readOnlyHint: true },
  inputSchema: connectionsInput,
  outputSchema: connectionsSchema,
  enabled,
  handler: async (params) => {
    const response = await callSocial<ConnectionOptionResponse[]>((api, raw) => api.listConnectionOptions(params, raw));
    return createToolResult({ items: response.data.map(({ id, name }) => ({ connectionId: id, name })) });
  },
};

const channelInput = { channelKey };
const channelSchema = z.object({
  key: z.string(),
  name: z.string(),
  network: z.string(),
  isEnabled: z.boolean(),
  isPaused: z.boolean(),
  isSwitchedOff: z.boolean(),
  connectionId: z.string().nullable(),
  hasAutomation: z.boolean(),
  metricsAutomationMissing: z.boolean(),
  options: z.record(z.string(), z.string()),
});

const readChannel = async (key: string) => (await callSocial<ChannelResponse>((api, raw) => api.getChannel(key, raw))).data;

const getChannelSettingsTool: ToolDefinition<typeof channelInput, typeof channelSchema> = {
  name: "get-channel-settings",
  description: `Gets how a Social channel is set up: its Automate connection, its own options, whether its automations exist and whether Umbraco Automate has switched it off. Use get-channel for the limits its posts must keep to. ${NEEDS_MANAGE}`,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  inputSchema: channelInput,
  outputSchema: channelSchema,
  enabled,
  handler: async ({ channelKey: key }) => {
    const c = await readChannel(key);
    return createToolResult({
      key: c.key,
      name: c.name,
      network: c.network,
      isEnabled: c.isEnabled,
      isPaused: c.isPaused,
      isSwitchedOff: c.isSwitchedOff,
      connectionId: c.automateConnectionId ?? null,
      hasAutomation: !!c.managedAutomationId,
      metricsAutomationMissing: c.metricsAutomationMissing,
      options: c.options,
    });
  },
};

const choicesInput = { network, connectionId, option: z.string().min(1).describe("The option's name, such as organizationId, boardId or locationName.") };
const choicesSchema = z.object({ choices: z.array(z.object({ id: z.string(), name: z.string() })), message: z.string().nullish() });

const listOptionChoicesTool: ToolDefinition<typeof choicesInput, typeof choicesSchema> = {
  name: "list-option-choices",
  description: `Lists what a connection can post to (a LinkedIn page, a Pinterest board, a Google Business Profile location) for a channel option that takes an id; with none, \`message\` is what Umbraco Automate said. It calls the network. ${OFF} ${NEEDS_MANAGE}`,
  slices: ["settings"],
  annotations: { readOnlyHint: true, openWorldHint: true },
  inputSchema: choicesInput,
  outputSchema: choicesSchema,
  enabled,
  handler: async (params) => {
    const response = await callSocial<OptionChoicesResponse>((api, raw) => api.listOptionChoices(params, raw));
    return createToolResult(response.data);
  },
};

const testSchema = z.object({ ok: z.boolean(), message: z.string().nullish() });

const testChannelConnectionTool: ToolDefinition<typeof channelInput, typeof testSchema> = {
  name: "test-channel-connection",
  description: `Tests a Social channel's Umbraco Automate connection and gives what it said. It calls the network; nothing is posted. ${OFF} ${NEEDS_MANAGE}`,
  slices: ["settings"],
  annotations: { readOnlyHint: true, openWorldHint: true },
  inputSchema: channelInput,
  outputSchema: testSchema,
  enabled,
  handler: async ({ channelKey: key }) => {
    const response = await callSocial<ConnectionTestResponse>((api, raw) => api.testChannelConnection(key, raw));
    return createToolResult(response.data);
  },
};

const savedSchema = z.object({ key: z.string(), warnings: z.array(z.string()) });

const createInput = { network, name: z.string().min(1).describe(`The channel's name. ${RAW_FIELD_MARKER}`), connectionId, options: options.optional() };

const createChannelTool: ToolDefinition<typeof createInput, typeof savedSchema> = {
  name: "create-channel",
  description: `Adds a Social channel for a network, on an Umbraco Automate connection that already exists. \`warnings\` says what is left to do, such as an automation that couldn't be made yet. ${OFF} ${NEEDS_MANAGE}`,
  slices: ["settings"],
  inputSchema: createInput,
  outputSchema: savedSchema,
  enabled,
  handler: async ({ connectionId: automateConnectionId, options: own, ...rest }) => {
    const request = { ...rest, automateConnectionId, options: own ?? {} };
    const response = await callSocial<ChannelSavedResponse>((api, raw) => api.createChannel(request, raw));
    return createToolResult(response.data);
  },
};

const updateInput = {
  channelKey,
  name: z.string().min(1).optional().describe(`The new name; left out, it is kept. ${RAW_FIELD_MARKER}`),
  isEnabled: z.boolean().optional().describe("False stops the channel being used for posts. Left out, it is kept."),
  connectionId: connectionId.optional(),
  options: options.optional().describe("Replaces the channel's own settings. Left out, they are kept."),
  confirm: confirmInput,
};
const updateSchema = z.object({ key: z.string(), done: z.boolean(), warnings: z.array(z.string()), message: z.string().optional() });

const updateChannelTool: ToolDefinition<typeof updateInput, typeof updateSchema> = {
  name: "update-channel",
  description: `Changes a Social channel: its name, whether it is enabled, its connection or its own settings. A new connection or new settings change where posts already on the calendar go, so the person is asked to confirm those first; a client that can't ask needs confirm: true. ${OFF} ${NEEDS_MANAGE}`,
  slices: ["settings"],
  annotations: { idempotentHint: true },
  inputSchema: updateInput,
  outputSchema: updateSchema,
  enabled,
  handler: async ({ channelKey: key, name, isEnabled, connectionId: connection, options: own, confirm }, extra) => {
    const current = await readChannel(key);
    if (
      (connection !== undefined || own !== undefined) &&
      !(await confirmIfSupported(extra, `Change where the channel "${current.name}" posts to, for its scheduled posts too?`, confirm))
    ) {
      return createToolResult({ key, done: false, warnings: [], message: "The person chose not to." });
    }
    const request = {
      name: name ?? current.name,
      isEnabled: isEnabled ?? current.isEnabled,
      automateConnectionId: connection ?? null,
      options: own ?? current.options,
    };
    const response = await callSocial<ChannelSavedResponse>((api, raw) => api.updateChannel(key, request, raw));
    return createToolResult({ key, done: true, warnings: response.data.warnings });
  },
};

const deleteInput = { channelKey, confirm: confirmInput };

const deleteChannelTool: ToolDefinition<typeof deleteInput, typeof outcomeSchema> = {
  name: "delete-channel",
  description: `Removes a Social channel and its Umbraco Automate automations; nothing more is sent to it, its scheduled posts included. ${ASKS_FIRST} ${OFF} ${NEEDS_MANAGE}`,
  slices: ["settings"],
  annotations: { destructiveHint: true },
  inputSchema: deleteInput,
  outputSchema: outcomeSchema,
  enabled,
  handler: async ({ channelKey: key, confirm }, extra) => {
    const { name } = await readChannel(key);
    return confirmed(extra, `Remove the channel "${name}"? Its scheduled posts won't be sent to it.`, confirm, key, () =>
      callSocial<ChannelSavedResponse>((api, raw) => api.deleteChannel(key, raw)),
    );
  },
};

const ensureChannelAutomationTool: ToolDefinition<typeof channelInput, typeof savedSchema> = {
  name: "create-channel-automation",
  description: `Makes the Umbraco Automate automations a Social channel needs, where they are missing. ${OFF} ${NEEDS_MANAGE}`,
  slices: ["settings"],
  annotations: { idempotentHint: true },
  inputSchema: channelInput,
  outputSchema: savedSchema,
  enabled,
  handler: async ({ channelKey: key }) => {
    const response = await callSocial<ChannelSavedResponse>((api, raw) => api.ensureChannelAutomation(key, raw));
    return createToolResult(response.data);
  },
};

const switchOnChannelTool: ToolDefinition<typeof channelInput, typeof savedSchema> = {
  name: "switch-on-channel",
  description: `Switches a Social channel's automations back on after Umbraco Automate switched them off for failing repeatedly (isSwitchedOff). Have what failed put right first, such as a connection that needs authorising again. Posts that failed meanwhile aren't sent again by this. ${OFF} ${NEEDS_MANAGE}`,
  slices: ["settings"],
  annotations: { idempotentHint: true },
  inputSchema: channelInput,
  outputSchema: savedSchema,
  enabled,
  handler: async ({ channelKey: key }) => {
    const response = await callSocial<ChannelSavedResponse>((api, raw) => api.switchOnChannel(key, raw));
    return createToolResult(response.data);
  },
};

export const channelSettingTools: ToolDefinition<any, any>[] = [
  withStandardDecorators(listNetworksTool),
  withStandardDecorators(listConnectionsTool),
  withStandardDecorators(getChannelSettingsTool),
  withStandardDecorators(listOptionChoicesTool),
  withStandardDecorators(testChannelConnectionTool),
  withStandardDecorators(withRawTextChecks(createChannelTool)),
  withStandardDecorators(withRawTextChecks(updateChannelTool)),
  withStandardDecorators(deleteChannelTool),
  withStandardDecorators(ensureChannelAutomationTool),
  withStandardDecorators(switchOnChannelTool),
];
