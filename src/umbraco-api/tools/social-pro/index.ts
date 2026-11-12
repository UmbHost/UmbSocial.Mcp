/**
 * The `social-pro` collection: registered only when the site's edition is
 * licensed. The site enforces the licence on every call too.
 */

import type { ToolCollectionExport, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { gatePro } from "../../../session/edition.js";
import { hasSocialSection, type CurrentUser } from "../../../session/social-user.js";

const tools: ToolDefinition<any, any>[] = [];

export const socialProCollection: ToolCollectionExport<CurrentUser | undefined> = {
  metadata: {
    name: "social-pro",
    displayName: "Social Pro",
    description: "UmbSocial Pro: approvals, templates, tags, hashtags, UTM, short links and metrics trends",
  },
  tools: (user) => (hasSocialSection(user) ? gatePro(tools) : []),
};
