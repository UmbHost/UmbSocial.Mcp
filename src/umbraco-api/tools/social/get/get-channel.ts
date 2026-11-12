/**
 * get-channel: one channel, with every limit its network sets.
 */

import { z } from "zod";
import { createToolResult, withStandardDecorators, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import type { ChannelResponse } from "../../../api/generated/umbSocialApi.js";
import { callSocial } from "../../../../session/refusals.js";
import { READ } from "../../../../session/social-user.js";
import { enabledFor, NEEDS_READ } from "../shared.js";
import { toChannel } from "./list-channels.js";

const inputSchema = {
  channelKey: z.guid().describe("The channel's key, from list-channels."),
};

const getChannelTool: ToolDefinition<typeof inputSchema> = {
  name: "get-channel",
  description: `Gets one Social channel with every limit its network sets: characters (and how links and wide characters count), image size and whether one is needed, alt text, link handling, thread parts, a first comment, a content warning, a title and calls to action. \`metricsAutomationMissing\` is true when views and interactions can't be read for it yet. ${NEEDS_READ}`,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  inputSchema,
  enabled: enabledFor(READ),
  handler: async ({ channelKey }) => {
    const response = await callSocial<ChannelResponse>((api, raw) => api.getChannel(channelKey, raw));
    return createToolResult({
      ...toChannel(response.data, "all"),
      metricsAutomationMissing: response.data.metricsAutomationMissing,
    });
  },
};

export default withStandardDecorators(getChannelTool);
