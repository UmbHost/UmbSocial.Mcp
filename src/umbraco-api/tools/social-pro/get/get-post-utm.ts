/**
 * get-post-utm: a post's own UTM values.
 */

import { z } from "zod";
import { createToolResult, withStandardDecorators, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import type { PostUtmModel } from "../../../api/generated/umbSocialApi.js";
import { callSocial } from "../../../../session/refusals.js";
import { enabledFor, NEEDS_WRITE } from "../../social/shared.js";
import { NEEDS_PRO } from "../shared.js";

const inputSchema = {
  key: z.guid().describe("The post's key, from list-posts."),
};

export const utmOutputSchema = z.object({
  source: z.string().nullable(),
  medium: z.string().nullable(),
  content: z.string().nullable(),
  disabled: z.boolean(),
});

/** The values with every field present: null is the site's default. */
export function toUtm(model: PostUtmModel) {
  return { source: model.source ?? null, medium: model.medium ?? null, content: model.content ?? null, disabled: model.disabled };
}

const getPostUtmTool: ToolDefinition<typeof inputSchema, typeof utmOutputSchema> = {
  name: "get-post-utm",
  description: [
    "Gets a Social post's own UTM values (source, medium, content) and whether its links go out without UTM tags (`disabled`). A null value means the site's default; the campaign comes from the post's campaign.",
    "Without the Social Schedule permission, it reads only this user's own posts.",
    NEEDS_WRITE,
    NEEDS_PRO,
  ].join(" "),
  slices: ["read"],
  annotations: { readOnlyHint: true },
  inputSchema,
  outputSchema: utmOutputSchema,
  enabled: enabledFor(["Write"]),
  handler: async ({ key }) => {
    const response = await callSocial<PostUtmModel>((api, raw) => api.getPostUtm(key, raw));
    return createToolResult(toUtm(response.data));
  },
};

export default withStandardDecorators(getPostUtmTool);
