/**
 * Tool mode registry: the single source of truth for mode names.
 *
 * `social` works on any UmbSocial site; the others register their
 * tools only when the site has that add-on, licensed.
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
  {
    name: "social-ai",
    displayName: "Social AI",
    description: "UmbSocial AI: drafting, rewriting and alt text with the site's own AI",
    collections: ["social-ai"],
  },
  {
    name: "social-engage",
    displayName: "Social Engage",
    description: "UmbSocial Engage: what social posts bring to the site, from Umbraco Engage",
    collections: ["social-engage"],
  },
];

export const allModes: ToolModeDefinition[] = [...toolModes];

export const allModeNames: readonly string[] = toolModes.map((m) => m.name);

export type ToolModeName = (typeof allModeNames)[number];
