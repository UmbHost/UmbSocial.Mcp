/**
 * get-post-tags: the tags of each of up to 200 posts.
 */

import { z } from "zod";
import { createToolResult, withStandardDecorators, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import type { PostTagsView } from "../../../api/generated/umbSocialApi.js";
import { callSocial } from "../../../../session/refusals.js";
import { READ_POST } from "../../../../session/social-user.js";
import { enabledFor, NEEDS_READ_POST } from "../../social/shared.js";
import { NEEDS_PRO } from "../shared.js";

/** Kept to the other many-post reads; the site reads at most 500 (`TagsController.GetPostsTags`). */
const MAX_POSTS = 200;

const inputSchema = {
  postKeys: z.array(z.guid()).min(1).max(MAX_POSTS).describe(`The posts' keys, from list-posts; at most ${MAX_POSTS}.`),
};

const outputSchema = z.object({
  items: z.array(
    z.object({
      postKey: z.string(),
      tags: z.array(z.object({ key: z.string(), name: z.string(), colour: z.string() })),
    }),
  ),
});

const getPostTagsTool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "get-post-tags",
  description: [
    `Gets the tags of up to ${MAX_POSTS} Social posts, each with its key, name and colour.`,
    "A post without tags, or one this user may not read, is left out.",
    "Read a post's tags here before changing them with set-post-tags.",
    NEEDS_READ_POST,
    NEEDS_PRO,
  ].join(" "),
  slices: ["read"],
  annotations: { readOnlyHint: true },
  inputSchema,
  outputSchema,
  enabled: enabledFor(READ_POST),
  handler: async ({ postKeys }) => {
    const response = await callSocial<PostTagsView[]>((api, raw) => api.getPostsTags({ keys: postKeys }, raw));
    return createToolResult({
      items: response.data.map((post) => ({
        postKey: post.postKey,
        tags: post.tags.map(({ key, name, colour }) => ({ key, name, colour })),
      })),
    });
  },
};

export default withStandardDecorators(getPostTagsTool);
