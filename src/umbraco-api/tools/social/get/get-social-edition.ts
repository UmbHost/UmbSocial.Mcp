/**
 * get-social-edition: the site's edition and which add-ons it can use and what this API user may do.
 */

import { z } from "zod";
import { createToolResult, withStandardDecorators, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import type { EditionResponse } from "../../../api/generated/umbSocialApi.js";
import { callSocial } from "../../../../session/refusals.js";
import { readAddOns } from "../../../../session/addons.js";
import { toEdition } from "../../../../session/edition.js";
import { ALL_VERBS, currentSocialUser } from "../../../../session/social-user.js";
import { NO_SECTION_MESSAGE } from "../../../../session/start-session.js";

const addOnSchema = z.object({
  installed: z.boolean().nullable(),
  licensed: z.boolean().nullable(),
  configured: z.boolean().nullable().optional(),
  usable: z.boolean().nullable(),
  reason: z.string().nullable(),
});

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
  addOns: z.object({ pro: addOnSchema, ai: addOnSchema, engage: addOnSchema }).optional(),
  verbs: z.array(z.enum(ALL_VERBS)).nullable(),
  message: z.string().optional(),
});

const getSocialEditionTool: ToolDefinition<undefined, typeof outputSchema> = {
  name: "get-social-edition",
  description:
    "Gets the site's UmbSocial edition (whether Pro is licensed, the channel allowance and the history kept) and the Social permissions this API user has, so you know what you may try. `addOns` says for Pro, AI and Engage separately whether the package is installed, licensed and usable, with the reason when it isn't; null means it couldn't be told. A tool for an add-on that became usable since this server started appears after a restart. `verbs` is null when the permissions couldn't be read; the site then decides each call. Needs the Social section only.",
  slices: ["read"],
  annotations: { readOnlyHint: true },
  outputSchema,
  handler: async () => {
    const user = currentSocialUser();
    if (user && !user.hasSection) {
      return createToolResult({ hasSection: false, verbs: [], message: NO_SECTION_MESSAGE });
    }

    const response = await callSocial<EditionResponse>((api, raw) => api.getEdition(raw));
    const edition = toEdition(response.data);
    return createToolResult({
      hasSection: true,
      edition,
      addOns: await readAddOns(edition),
      verbs: user?.verbs ? ALL_VERBS.filter((verb) => user.verbs?.has(verb)) : null,
    });
  },
};

export default withStandardDecorators(getSocialEditionTool);
