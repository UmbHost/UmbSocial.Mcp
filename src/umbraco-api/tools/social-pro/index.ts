/**
 * The `social-pro` collection: registered only when the site's edition is
 * licensed. The site enforces the licence on every call too.
 */

import type { ToolCollectionExport, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { gatePro } from "../../../session/edition.js";
import { hasSocialSection, type CurrentUser } from "../../../session/social-user.js";
import listTemplates from "./get/list-templates.js";
import getTemplate from "./get/get-template.js";
import listTags from "./get/list-tags.js";
import getTag from "./get/get-tag.js";
import getPostTags from "./get/get-post-tags.js";
import listHashtags from "./get/list-hashtags.js";
import getHashtagGroup from "./get/get-hashtag-group.js";
import getPostUtm from "./get/get-post-utm.js";
import getPostShortLinks from "./get/get-post-short-links.js";
import listShortLinks from "./get/list-short-links.js";
import getMetricsTrend from "./get/get-metrics-trend.js";
import submitPostForApproval from "./post/submit-post-for-approval.js";
import approvePost from "./post/approve-post.js";
import returnPost from "./post/return-post.js";
import createPostFromTemplate from "./post/create-post-from-template.js";
import getShortLinkClicks from "./post/get-short-link-clicks.js";
import setPostTags from "./put/set-post-tags.js";
import setPostUtm from "./put/set-post-utm.js";

const tools: ToolDefinition<any, any>[] = [
  submitPostForApproval,
  approvePost,
  returnPost,
  listTemplates,
  getTemplate,
  createPostFromTemplate,
  listTags,
  getTag,
  getPostTags,
  setPostTags,
  listHashtags,
  getHashtagGroup,
  getPostUtm,
  setPostUtm,
  getPostShortLinks,
  getShortLinkClicks,
  listShortLinks,
  getMetricsTrend,
];

export const socialProCollection: ToolCollectionExport<CurrentUser | undefined> = {
  metadata: {
    name: "social-pro",
    displayName: "Social Pro",
    description: "UmbSocial Pro: approvals, templates, tags, hashtags, UTM, short links and metrics trends",
  },
  tools: (user) => (hasSocialSection(user) ? gatePro(tools) : []),
};
