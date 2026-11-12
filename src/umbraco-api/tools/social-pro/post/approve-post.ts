/**
 * approve-post: approves a post awaiting approval and puts it on the calendar.
 * In the `approve` slice, which is off unless asked for.
 */

import { z } from "zod";
import { createToolResult, UmbracoApiError, withStandardDecorators, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import type { PostKeyResponse } from "../../../api/generated/umbSocialApi.js";
import { callSocial, REFUSAL_HINTS } from "../../../../session/refusals.js";
import { toUtcParam } from "../../../../session/time.js";
import { PAGE_DELAYS } from "../../social/post-input.js";
import { confirmIfSupported, enabledFor } from "../../social/shared.js";
import { NEEDS_PRO } from "../shared.js";

/** The times an approval takes (`ApprovalService.ApproveAsync`): every `When` but Draft. */
const APPROVE_WHEN = ["Queue", "At", "Now", "OnPagePublish"] as const;

const PAST = "schedule.past";
const DELAY_NEEDS_PAGE_PUBLISH = "input.delay_needs_page_publish";

/** Refused before the confirmation, so the person isn't asked about an approval the site would refuse. */
function refuse(code: string): never {
  throw new UmbracoApiError({ codes: [code], status: 400, hint: REFUSAL_HINTS[code] });
}

const inputSchema = {
  key: z.guid().describe("The key of the post awaiting approval, from list-posts."),
  expectedVersion: z
    .string()
    .min(1)
    .describe("The post's version, from get-post: a post changed since is refused with approval.changed."),
  when: z
    .enum(APPROVE_WHEN)
    .describe("Queue (the next free slot), At (at atUtc), Now (publishes at once) or OnPagePublish (when the post's page goes live)."),
  atUtc: z.iso.datetime({ offset: true }).optional().describe("With At: when it goes out (ISO 8601, in the future)."),
  pageDelayMinutes: z
    .union([z.literal(PAGE_DELAYS[0]), z.literal(PAGE_DELAYS[1]), z.literal(PAGE_DELAYS[2])])
    .optional()
    .describe("With OnPagePublish: minutes after the page goes live, 0, 60 or 1440. Leave it out for the queue's next free slot after that."),
};

const outputSchema = z.object({
  key: z.string(),
  approved: z.boolean(),
  version: z.string().optional(),
  message: z.string().optional(),
});

const approvePostTool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "approve-post",
  description: [
    "Approves a Social post awaiting approval and puts it on the calendar: Queue, At, Now or OnPagePublish.",
    "A person should approve posts in the Umbraco backoffice; this tool is off unless UMBSOCIAL_ENABLE_SLICES names the approve slice.",
    "The site refuses an API user approving a post written with AI, and every post an API user writes counts as that, so this works only for a post a person wrote.",
    "Now publishes the post to its live networks at once, and is rate limited for everyone using the same API user. OnPagePublish needs a post tied to a page.",
    "At needs an atUtc in the future, and pageDelayMinutes goes only with OnPagePublish. The person may be asked to confirm first.",
    "Needs the Social Approve permission.",
    NEEDS_PRO,
  ].join(" "),
  slices: ["approve"],
  annotations: { openWorldHint: true },
  inputSchema,
  outputSchema,
  enabled: enabledFor(["Approve"]),
  handler: async ({ key, expectedVersion, when, atUtc, pageDelayMinutes }, extra) => {
    if (when === "At" && (!atUtc || Date.parse(atUtc) <= Date.now())) refuse(PAST);
    if (pageDelayMinutes !== undefined && when !== "OnPagePublish") refuse(DELAY_NEEDS_PAGE_PUBLISH);
    const question =
      when === "Now"
        ? `Approve post ${key} and publish it to its live networks now?`
        : `Approve post ${key} and put it on the calendar (${when})?`;
    if (!(await confirmIfSupported(extra, question))) {
      return createToolResult({ key, approved: false, message: "The person chose not to approve the post." });
    }
    const request = {
      when,
      atUtc: atUtc ? toUtcParam(atUtc) : null,
      pageDelayMinutes: pageDelayMinutes ?? null,
      expectedVersion,
    };
    const response = await callSocial<PostKeyResponse>((api, raw) => api.approvePost(key, request, raw));
    return createToolResult({ key: response.data.key, version: response.data.version, approved: true });
  },
};

export default withStandardDecorators(approvePostTool);
