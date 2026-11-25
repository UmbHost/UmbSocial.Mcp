/**
 * set-post-utm: changes a post's own UTM values, keeping every field it isn't
 * given. `PUT posts/{key}/utm` replaces all four, so it reads them first, and,
 * as the backoffice's `postUtmBody` does, sends a centrally locked field as
 * null so a value stored before the lock doesn't refuse the save.
 */

import { z } from "zod";
import { createToolResult, withStandardDecorators, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import type { PostResponse, PostUtmModel } from "../../../api/generated/umbSocialApi.js";
import { callPro } from "../../../../session/addons.js";
import { assertEditable } from "../../social/post-request.js";
import { enabledFor, NEEDS_WRITE } from "../../social/shared.js";
import { NEEDS_PRO } from "../shared.js";
import { lockedUtmFields, toUtm, utmOutputSchema, type UtmField } from "../get/get-post-utm.js";

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
    "Changes a Social post's own UTM values: it reads them, keeps every field it isn't given, and saves them.",
    "A field the site sets centrally (see `locked` in get-post-utm) can't be set on a post: giving it a value is refused with utm.field_locked.",
    "Only a draft or a post awaiting approval can be changed; any other post is refused with post.not_draft.",
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
    // A post on the calendar is left as a person left it: the values are read when it goes out.
    const post = await callPro<PostResponse>((api, raw) => api.getPost(key, raw));
    assertEditable(post.data);

    const read = await callPro<PostUtmModel>((api, raw) => api.getPostUtm(key, raw));
    const locked = await lockedUtmFields();
    // A value given for a locked field is still sent, so the site refuses it by name.
    const merged = (field: UtmField) =>
      changes[field] !== undefined ? changes[field] : locked.includes(field) ? null : (read.data[field] ?? null);
    const request: PostUtmModel = {
      source: merged("source"),
      medium: merged("medium"),
      content: merged("content"),
      disabled: changes.disabled ?? read.data.disabled,
    };
    const response = await callPro<PostUtmModel>((api, raw) => api.savePostUtm(key, request, raw));
    return createToolResult(toUtm(response.data, locked));
  },
};

export default withStandardDecorators(setPostUtmTool);
