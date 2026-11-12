/**
 * get-metrics-trend: how a published channel's views and interactions grew.
 */

import { z } from "zod";
import { createToolResult, withStandardDecorators, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import type { MetricTrendPoint } from "../../../api/generated/umbSocialApi.js";
import { callSocial } from "../../../../session/refusals.js";
import { READ_POST } from "../../../../session/social-user.js";
import { withUtcTimes } from "../../../../session/time.js";
import { enabledFor, NEEDS_READ_POST } from "../../social/shared.js";
import { NEEDS_PRO } from "../shared.js";

const inputSchema = {
  targetId: z.number().int().positive().describe("The channel's target id, from the targets of get-post."),
};

const outputSchema = z.object({
  points: z.array(z.object({ takenUtc: z.string(), values: z.record(z.string(), z.number()) })),
});

const getMetricsTrendTool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "get-metrics-trend",
  description: [
    "Gets how a published channel's views and interactions changed over time: each reading the site took, oldest first, at most the latest 500.",
    "It is empty for a channel with no readings, or one whose post this user may not read. get-post-metrics has the latest figures.",
    NEEDS_READ_POST,
    NEEDS_PRO,
  ].join(" "),
  slices: ["read"],
  annotations: { readOnlyHint: true },
  inputSchema,
  outputSchema,
  enabled: enabledFor(READ_POST),
  handler: async ({ targetId }) => {
    const response = await callSocial<MetricTrendPoint[]>((api, raw) => api.getMetricsTrend({ targetId }, raw));
    return createToolResult({ points: withUtcTimes(response.data) });
  },
};

export default withStandardDecorators(getMetricsTrendTool);
