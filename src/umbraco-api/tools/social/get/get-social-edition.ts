/**
 * get-social-edition: the site's edition and what this API user may do.
 */

import { z } from "zod";
import { createToolResult, withStandardDecorators, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import type { EditionResponse } from "../../../api/generated/umbSocialApi.js";
import { callSocial } from "../../../../session/refusals.js";
import { toEdition } from "../../../../session/edition.js";
import { ALL_VERBS, currentSocialUser } from "../../../../session/social-user.js";
import { NO_SECTION_MESSAGE } from "../../../../session/start-session.js";

const outputSchema = z.object({
  hasSection: z.boolean(),
  edition: z
    .object({
      isLicensed: z.boolean(),
      maxChannels: z.number().nullable(),
      historyDays: z.number().nullable(),
      channelsUsed: z.number(),
    })
    .optional(),
  verbs: z.array(z.enum(ALL_VERBS)).nullable(),
  message: z.string().optional(),
});

const getSocialEditionTool: ToolDefinition<undefined, typeof outputSchema> = {
  name: "get-social-edition",
  description:
    "Gets the site's UmbSocial edition (whether Pro is licensed, the channel allowance and the history kept) and the Social permissions this API user has, so you know what you may try. `verbs` is null when the permissions couldn't be read; the site then decides each call. Needs the Social section only.",
  slices: ["read"],
  annotations: { readOnlyHint: true },
  outputSchema,
  handler: async () => {
    const user = currentSocialUser();
    if (user && !user.hasSection) {
      return createToolResult({ hasSection: false, verbs: [], message: NO_SECTION_MESSAGE });
    }

    const response = await callSocial<EditionResponse>((api, raw) => api.getEdition(raw));
    return createToolResult({
      hasSection: true,
      edition: toEdition(response.data),
      verbs: user?.verbs ? ALL_VERBS.filter((verb) => user.verbs?.has(verb)) : null,
    });
  },
};

export default withStandardDecorators(getSocialEditionTool);
