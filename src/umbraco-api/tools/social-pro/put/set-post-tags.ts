/**
 * set-post-tags: replaces a post's tags.
 */

import { z } from "zod";
import { createToolResult, withStandardDecorators, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { callSocial } from "../../../../session/refusals.js";
import { enabledFor, NEEDS_WRITE } from "../../social/shared.js";
import { NEEDS_PRO } from "../shared.js";

/** The site's limit (`PostTagRules.MaxPerPost`). */
const MAX_TAGS = 10;

const inputSchema = {
  key: z.guid().describe("The post's key, from list-posts."),
  tagKeys: z
    .array(z.guid())
    .max(MAX_TAGS)
    .describe(`Every tag the post should have, from list-tags; at most ${MAX_TAGS}. An empty list removes them all.`),
};

const outputSchema = z.object({
  key: z.string(),
  tagKeys: z.array(z.string()),
});

const setPostTagsTool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "set-post-tags",
  description: [
    "Replaces a Social post's tags with the ones given: any tag not in the list is taken off.",
    "To add or remove one tag, read the post's tags first with get-post-tags and send the full set.",
    "Without the Social Schedule permission, it changes only this user's own drafts.",
    NEEDS_WRITE,
    NEEDS_PRO,
  ].join(" "),
  slices: ["update"],
  annotations: { idempotentHint: true },
  inputSchema,
  outputSchema,
  enabled: enabledFor(["Write"]),
  handler: async ({ key, tagKeys }) => {
    await callSocial<void>((api, raw) => api.setPostTags(key, { tagKeys }, raw));
    return createToolResult({ key, tagKeys });
  },
};

export default withStandardDecorators(setPostTagsTool);
