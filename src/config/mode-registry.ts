/**
 * Tool mode registry: the single source of truth for mode names.
 *
 * `social` works on any UmbSocial site; `social-pro` registers its tools only
 * when the site's edition is licensed.
 */

import type { ToolModeDefinition } from "@umbraco-cms/mcp-server-sdk";

export const toolModes: ToolModeDefinition[] = [
  {
    name: "social",
    displayName: "Social",
    description: "The Social calendar: channels, campaigns and posts",
    collections: ["social"],
  },
  {
    name: "social-pro",
    displayName: "Social Pro",
    description: "UmbSocial Pro: approvals, templates, tags, hashtags, UTM, short links and metrics trends",
    collections: ["social-pro"],
  },
];

export const allModes: ToolModeDefinition[] = [...toolModes];

export const allModeNames: readonly string[] = toolModes.map((m) => m.name);

export type ToolModeName = (typeof allModeNames)[number];
