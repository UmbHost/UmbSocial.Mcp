/**
 * The session: read who's calling and the edition at start-up, then choose the
 * tools to register for that user.
 */

import {
  shouldIncludeTool,
  type CollectionConfiguration,
  type ToolCollectionExport,
  type ToolDefinition,
} from "@umbraco-cms/mcp-server-sdk";
import { clearCurrentUser, loadCurrentUser, toSocialUser, type CurrentUser, type SocialUser } from "./social-user.js";
import { clearEdition, loadEdition, type Edition } from "./edition.js";
import { DEFAULT_OFF_SLICES } from "../config/slice-registry.js";

/** What `get-social-edition` answers for a user without the Social section. */
export const NO_SECTION_MESSAGE =
  "This API user's group doesn't have the Social section, so no Social tools are available. Add the Social section to the group in Users › User groups, then restart this server.";

export interface Session {
  user: CurrentUser;
  socialUser: SocialUser;
  /** Null when the user has no Social section (reading it needs the section). */
  edition: Edition | null;
}

/** Reads the API user and, if it has the Social section, the edition. */
export async function startSession(): Promise<Session> {
  const user = await loadCurrentUser();
  const socialUser = toSocialUser(user);

  if (!socialUser.hasSection) {
    console.error(
      "umbsocial-mcp: the API user's group doesn't have the Social section, so only get-social-edition is registered. Add the Social section to the group in Users › User groups, then restart.",
    );
    return { user, socialUser, edition: null };
  }

  return { user, socialUser, edition: await loadEdition() };
}

export function clearSession(): void {
  clearCurrentUser();
  clearEdition();
}

/**
 * The tools to register: each collection's `tools(user)`, then each tool's
 * `enabled(user)`, then the SDK's filters (modes, slices, tool lists).
 *
 * Hand-rolled because the SDK lacks it: `shouldIncludeTool` never calls
 * `enabled(user)`. This applies it as the CMS MCP's own registrar does. And
 * `shouldIncludeTool` lets a tool named in `UMBRACO_INCLUDE_TOOLS` through
 * before it looks at the slices, so a tool in a default-off slice that is
 * still off (see `applyDefaultOffSlices`) is left out here first.
 */
export function toolsFor(
  collections: readonly ToolCollectionExport[],
  user: CurrentUser | undefined,
  config: CollectionConfiguration,
): Array<{ tool: ToolDefinition<any, any>; collectionName: string }> {
  const chosen: Array<{ tool: ToolDefinition<any, any>; collectionName: string }> = [];
  for (const collection of collections) {
    const collectionName = collection.metadata.name;
    for (const tool of collection.tools(user)) {
      if (user && tool.enabled && !tool.enabled(user)) continue;
      if (inSliceStillOff(tool, config)) continue;
      if (!shouldIncludeTool(tool, { collectionName, config })) continue;
      chosen.push({ tool, collectionName });
    }
  }
  return chosen;
}

const defaultOff: readonly string[] = DEFAULT_OFF_SLICES;

/** Whether the tool is in a default-off slice that `UMBSOCIAL_ENABLE_SLICES` didn't turn on. */
function inSliceStillOff(tool: ToolDefinition<any, any>, config: CollectionConfiguration): boolean {
  return (tool.slices ?? []).some((slice) => defaultOff.includes(slice) && config.disabledSlices.includes(slice));
}
