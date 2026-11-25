/**
 * get-post-utm: a post's own UTM values, with the fields the site sets
 * centrally marked as locked.
 */

import { z } from "zod";
import { createToolResult, withStandardDecorators, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import type { PostUtmModel, UtmFieldsModel } from "../../../api/generated/umbSocialApi.js";
import { callPro } from "../../../../session/addons.js";
import { enabledFor, NEEDS_WRITE } from "../../social/shared.js";
import { NEEDS_PRO } from "../shared.js";

/** The UTM fields a post may set; the campaign is the post's own campaign. */
export const UTM_FIELDS = ["source", "medium", "content"] as const;
export type UtmField = (typeof UTM_FIELDS)[number];

const inputSchema = {
  key: z.guid().describe("The post's key, from list-posts."),
};

export const utmOutputSchema = z.object({
  source: z.string().nullable(),
  medium: z.string().nullable(),
  content: z.string().nullable(),
  disabled: z.boolean(),
  locked: z.array(z.enum(UTM_FIELDS)),
});

/** The fields the site sets centrally (`GET pro/utm/fields`). */
export async function lockedUtmFields(): Promise<UtmField[]> {
  const fields = (await callPro<UtmFieldsModel>((api, raw) => api.getUtmFields(raw))).data;
  return UTM_FIELDS.filter((field) => fields[field].locked);
}

/**
 * The values with every field present: null is the site's default. A locked
 * field reads null, because the site's central value applies whatever is stored.
 */
export function toUtm(model: PostUtmModel, locked: readonly UtmField[]) {
  const own = (field: UtmField) => (locked.includes(field) ? null : (model[field] ?? null));
  return { source: own("source"), medium: own("medium"), content: own("content"), disabled: model.disabled, locked: [...locked] };
}

const getPostUtmTool: ToolDefinition<typeof inputSchema, typeof utmOutputSchema> = {
  name: "get-post-utm",
  description: [
    "Gets a Social post's own UTM values (source, medium, content) and whether its links go out without UTM tags (`disabled`). A null value means the site's default; the campaign comes from the post's campaign.",
    "`locked` names the fields the site sets centrally: they read null and can't be set on a post.",
    "Without the Social Schedule permission, it reads only this user's own drafts.",
    NEEDS_WRITE,
    NEEDS_PRO,
  ].join(" "),
  slices: ["read"],
  annotations: { readOnlyHint: true },
  inputSchema,
  outputSchema: utmOutputSchema,
  enabled: enabledFor(["Write"]),
  handler: async ({ key }) => {
    const response = await callPro<PostUtmModel>((api, raw) => api.getPostUtm(key, raw));
    return createToolResult(toUtm(response.data, await lockedUtmFields()));
  },
};

export default withStandardDecorators(getPostUtmTool);
