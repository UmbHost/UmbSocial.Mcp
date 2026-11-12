/**
 * list-free-slots: the schedule's slots in a range, and which are taken.
 */

import { z } from "zod";
import {
  createToolResult,
  UmbracoApiError,
  withStandardDecorators,
  type ToolDefinition,
} from "@umbraco-cms/mcp-server-sdk";
import type { SlotInstantResponse } from "../../../api/generated/umbSocialApi.js";
import { callSocial, REFUSAL_HINTS } from "../../../../session/refusals.js";
import { READ } from "../../../../session/social-user.js";
import { toUtcIso, toUtcParam } from "../../../../session/time.js";
import { enabledFor, NEEDS_READ } from "../shared.js";

/** The site's limit (`ScheduleService.MaxSlotRangeDays`). */
const MAX_DAYS = 42;
const RANGE_TOO_LONG = "schedule.range_too_long";

const inputSchema = {
  fromUtc: z.iso.datetime({ offset: true }).describe("Start of the range (ISO 8601)."),
  toUtc: z.iso.datetime({ offset: true }).describe(`End of the range, exclusive; at most ${MAX_DAYS} days after the start.`),
};

const outputSchema = z.object({
  items: z.array(z.object({ utc: z.string(), taken: z.boolean() })),
});

const listFreeSlotsTool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "list-free-slots",
  description: `Lists every slot of the posting schedule from one time to another (at most ${MAX_DAYS} days), in UTC, and whether a post already takes it. The free ones are where a person can queue a post. For a longer stretch, ask for one range after another. ${NEEDS_READ}`,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  inputSchema,
  outputSchema,
  enabled: enabledFor(READ),
  handler: async ({ fromUtc, toUtc }) => {
    const from = toUtcParam(fromUtc);
    const to = toUtcParam(toUtc);
    const days = (Date.parse(to) - Date.parse(from)) / (24 * 60 * 60 * 1000);
    // Refused as the site would refuse it, without the request.
    if (days <= 0 || days > MAX_DAYS) {
      throw new UmbracoApiError({ codes: [RANGE_TOO_LONG], status: 400, hint: REFUSAL_HINTS[RANGE_TOO_LONG] });
    }

    const response = await callSocial<SlotInstantResponse[]>((api, raw) => api.getSlots({ fromUtc: from, toUtc: to }, raw));
    return createToolResult({
      items: response.data.map((slot) => ({ utc: toUtcIso(slot.utc), taken: slot.taken })),
    });
  },
};

export default withStandardDecorators(listFreeSlotsTool);
