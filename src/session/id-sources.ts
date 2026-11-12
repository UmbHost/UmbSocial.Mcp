/**
 * Where each id a tool takes comes from (the owner's rule: every id a tool
 * takes comes from another tool). Keyed by input name; the value is the tool
 * that lists it, or the chained `cms` tools that find it.
 *
 * The id guard test walks every tool's input schema and fails on an id-like
 * input that isn't here or whose source isn't registered.
 */

import { CMS_ID_TOOLS } from "../config/mcp-servers.js";

export const ID_SOURCES: Readonly<Record<string, string | readonly string[]>> = {
  channelKey: "list-channels",
  channelKeys: "list-channels",
  postKey: "list-posts",
  postKeys: "list-posts",
  key: "list-posts",
  version: "get-post",
  expectedVersion: "get-post",
  targetId: "get-post",
  campaignKey: "list-campaigns",
  templateKey: "list-templates",
  tagKey: "list-tags",
  tagKeys: "list-tags",
  hashtagGroupKey: "list-hashtags",
  shortLinkCode: "list-short-links",
  documentTypeKey: "get-page-share",
  mediaKey: CMS_ID_TOOLS.media,
  documentKey: CMS_ID_TOOLS.document,
  pageKey: CMS_ID_TOOLS.document,
};
