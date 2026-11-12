/**
 * list-channels: the site's Social channels and the limits a post must keep to.
 */

import { z } from "zod";
import { createToolResult, pickFields, withStandardDecorators, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import type { ChannelLimitsResponse, ChannelResponse } from "../../../api/generated/umbSocialApi.js";
import { callSocial } from "../../../../session/refusals.js";
import { READ } from "../../../../session/social-user.js";
import { enabledFor, NEEDS_READ } from "../shared.js";

const LIST_LIMITS = [
  "maxCharacters",
  "supportsAltText",
  "altTextMax",
  "requiresImage",
  "options",
  "maxThreadParts",
  "firstCommentMax",
] as const;

/** A channel without its Automate ids, its own settings or its sort order. */
export function toChannel(channel: ChannelResponse, limits: readonly (keyof ChannelLimitsResponse)[] | "all") {
  return {
    ...pickFields({ ...channel }, ["key", "name", "network", "networkName", "isEnabled", "isPaused"]),
    limits: limits === "all" ? channel.limits : pickFields({ ...channel.limits }, [...limits]),
  };
}

const outputSchema = z.object({
  items: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      network: z.string(),
      networkName: z.string(),
      isEnabled: z.boolean(),
      isPaused: z.boolean(),
      limits: z.object({
        maxCharacters: z.number(),
        supportsAltText: z.boolean(),
        altTextMax: z.number(),
        requiresImage: z.boolean(),
        options: z.array(z.string()),
        maxThreadParts: z.number(),
        firstCommentMax: z.number(),
      }),
    }),
  ),
});

const listChannelsTool: ToolDefinition<undefined, typeof outputSchema> = {
  name: "list-channels",
  description: `Lists the site's Social channels (one per connected network account): each channel's key, name, network, whether it is enabled or paused, and the main limits a post must keep to there (characters, alt text, an image, thread parts, a first comment). A post is sent only to enabled channels that aren't paused. Use get-channel for every limit. ${NEEDS_READ}`,
  slices: ["list"],
  annotations: { readOnlyHint: true },
  outputSchema,
  enabled: enabledFor(READ),
  handler: async () => {
    const response = await callSocial<ChannelResponse[]>((api, raw) => api.listChannels(raw));
    return createToolResult({ items: response.data.map((channel) => toChannel(channel, LIST_LIMITS)) });
  },
};

export default withStandardDecorators(listChannelsTool);
