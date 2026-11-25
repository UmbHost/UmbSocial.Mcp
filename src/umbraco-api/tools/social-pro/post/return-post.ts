/**
 * return-post: sends a post awaiting approval back to its writer as a draft.
 * In the `approve` slice, which is off unless asked for.
 */

import { z } from "zod";
import { createToolResult, RAW_FIELD_MARKER, withStandardDecorators, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import type { PostKeyResponse } from "../../../api/generated/umbSocialApi.js";
import { callPro } from "../../../../session/addons.js";
import { enabledFor, withRawTextChecks } from "../../social/shared.js";
import { NEEDS_PRO } from "../shared.js";

/** The site's limit (`ApprovalService.MaxNoteLength`). */
const MAX_NOTE = 1000;

const inputSchema = {
  key: z.guid().describe("The key of the post awaiting approval, from list-posts."),
  expectedVersion: z
    .string()
    .min(1)
    .describe("The post's version, from get-post: a post changed since is refused with approval.changed."),
  note: z
    .string()
    .trim()
    .min(1)
    .max(MAX_NOTE)
    .describe(`What the writer should change, 1 to ${MAX_NOTE} characters. ${RAW_FIELD_MARKER}`),
};

const outputSchema = z.object({
  key: z.string(),
  version: z.string(),
  status: z.literal("Draft"),
});

const returnPostTool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "return-post",
  description: [
    "Returns a Social post awaiting approval to its writer as a draft, with a note saying what to change.",
    "A person should review posts in the Umbraco backoffice; this tool is off unless UMBSOCIAL_ENABLE_SLICES names the approve slice.",
    "Needs the Social Approve permission.",
    NEEDS_PRO,
  ].join(" "),
  slices: ["approve"],
  inputSchema,
  outputSchema,
  enabled: enabledFor(["Approve"]),
  handler: async ({ key, expectedVersion, note }) => {
    const response = await callPro<PostKeyResponse>((api, raw) => api.returnPost(key, { note, expectedVersion }, raw));
    return createToolResult({ key: response.data.key, version: response.data.version, status: "Draft" as const });
  },
};

export default withStandardDecorators(withRawTextChecks(returnPostTool));
