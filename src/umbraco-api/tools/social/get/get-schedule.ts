/**
 * get-schedule: the site's posting slots and the time zone they're in.
 */

import { z } from "zod";
import { createToolResult, withStandardDecorators, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import type { ScheduleResponse } from "../../../api/generated/umbSocialApi.js";
import { callSocial } from "../../../../session/refusals.js";
import { READ } from "../../../../session/social-user.js";
import { enabledFor, NEEDS_READ } from "../shared.js";

const outputSchema = z.object({
  timeZoneId: z.string(),
  slots: z.array(z.object({ day: z.string(), localTime: z.string() })),
});

const getScheduleTool: ToolDefinition<undefined, typeof outputSchema> = {
  name: "get-schedule",
  description: `Gets the site's posting schedule: the weekly slots (a day and a local time) that queued posts go out in, and the time zone those times are in. Use list-free-slots for the actual times in a range and whether each is taken. ${NEEDS_READ}`,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  outputSchema,
  enabled: enabledFor(READ),
  handler: async () => {
    const response = await callSocial<ScheduleResponse>((api, raw) => api.getSchedule(raw));
    return createToolResult({ timeZoneId: response.data.timeZoneId, slots: response.data.slots });
  },
};

export default withStandardDecorators(getScheduleTool);
