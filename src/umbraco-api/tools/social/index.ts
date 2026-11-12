/**
 * The `social` collection: works on any UmbSocial site.
 */

import type { ToolCollectionExport, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { hasSocialSection, type CurrentUser } from "../../../session/social-user.js";
import getSocialEdition from "./get/get-social-edition.js";

/** Every Social tool but `get-social-edition`, which is always registered. */
const tools: ToolDefinition<any, any>[] = [];

export const socialCollection: ToolCollectionExport<CurrentUser | undefined> = {
  metadata: {
    name: "social",
    displayName: "Social",
    description: "The Social calendar: channels, campaigns and posts",
  },
  // Without the Social section, `get-social-edition` stays to say why.
  tools: (user) => (hasSocialSection(user) ? [getSocialEdition, ...tools] : [getSocialEdition]),
};
