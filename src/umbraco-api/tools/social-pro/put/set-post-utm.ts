/**
 * set-post-utm: changes a post's own UTM values, keeping every field it isn't
 * given. `PUT posts/{key}/utm` replaces all four, so it reads them first.
 */

import { z } from "zod";
import { createToolResult, withStandardDecorators, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import type { PostUtmModel } from "../../../api/generated/umbSocialApi.js";
import { callSocial } from "../../../../session/refusals.js";
import { enabledFor, NEEDS_WRITE } from "../../social/shared.js";
import { NEEDS_PRO } from "../shared.js";
import { toUtm, utmOutputSchema } from "../get/get-post-utm.js";

/** The site's limit (`PostUtm.MaxLength`). */
const MAX_VALUE = 100;

const value = (field: string) =>
  z
    .string()
    .max(MAX_VALUE)
    .nullish()
    .describe(`The utm_${field} value, at most ${MAX_VALUE} characters; null puts back the site's default. Left out, it is kept.`);

const inputSchema = {
  key: z.guid().describe("The post's key, from list-posts."),
  source: value("source"),
  medium: value("medium"),
  content: value("content"),
  disabled: z.boolean().optional().describe("True sends the post's links without UTM tags. Left out, it is kept."),
};

const setPostUtmTool: ToolDefinition<typeof inputSchema, typeof utmOutputSchema> = {
  name: "set-post-utm",
  description: [
    "Changes a Social post's own UTM values: it reads them, keeps every field it isn't given, and saves them. A field the site sets centrally can't be changed (utm.field_locked).",
    "Without the Social Schedule permission, it changes only this user's own drafts.",
    NEEDS_WRITE,
    NEEDS_PRO,
  ].join(" "),
  slices: ["update"],
  annotations: { idempotentHint: true },
  inputSchema,
  outputSchema: utmOutputSchema,
  enabled: enabledFor(["Write"]),
  handler: async ({ key, ...changes }) => {
    const read = await callSocial<PostUtmModel>((api, raw) => api.getPostUtm(key, raw));
    const current = toUtm(read.data);
    const request: PostUtmModel = {
      source: changes.source === undefined ? current.source : changes.source,
      medium: changes.medium === undefined ? current.medium : changes.medium,
      content: changes.content === undefined ? current.content : changes.content,
      disabled: changes.disabled ?? current.disabled,
    };
    const response = await callSocial<PostUtmModel>((api, raw) => api.savePostUtm(key, request, raw));
    return createToolResult(toUtm(response.data));
  },
};

export default withStandardDecorators(setPostUtmTool);
