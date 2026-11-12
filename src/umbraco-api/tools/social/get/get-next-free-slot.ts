/**
 * get-next-free-slot: the next slot of the schedule no post takes.
 */

import { z } from "zod";
import { createToolResult, withStandardDecorators, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import type { NextFreeSlotResponse } from "../../../api/generated/umbSocialApi.js";
import { callSocial } from "../../../../session/refusals.js";
import { READ } from "../../../../session/social-user.js";
import { toUtcIso } from "../../../../session/time.js";
import { enabledFor, NEEDS_READ } from "../shared.js";

const outputSchema = z.object({ utc: z.string().nullable() });

const getNextFreeSlotTool: ToolDefinition<undefined, typeof outputSchema> = {
  name: "get-next-free-slot",
  description: `Gets the next slot of the posting schedule that no post takes, in UTC: where a queued post would go next. \`utc\` is null when the schedule has no slots. ${NEEDS_READ}`,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  outputSchema,
  enabled: enabledFor(READ),
  handler: async () => {
    const response = await callSocial<NextFreeSlotResponse>((api, raw) => api.getNextFreeSlot(raw));
    return createToolResult({ utc: response.data.utc ? toUtcIso(response.data.utc) : null });
  },
};

export default withStandardDecorators(getNextFreeSlotTool);
