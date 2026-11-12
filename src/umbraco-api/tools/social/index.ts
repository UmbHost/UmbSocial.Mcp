/**
 * The `social` collection: works on any UmbSocial site.
 */

import type { ToolCollectionExport, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { hasSocialSection, type CurrentUser } from "../../../session/social-user.js";
import getSocialEdition from "./get/get-social-edition.js";
import listChannels from "./get/list-channels.js";
import getChannel from "./get/get-channel.js";
import listPosts from "./get/list-posts.js";
import getPost from "./get/get-post.js";
import getPostHistory from "./get/get-post-history.js";
import getPostMetrics from "./get/get-post-metrics.js";
import getSchedule from "./get/get-schedule.js";
import listFreeSlots from "./get/list-free-slots.js";
import getNextFreeSlot from "./get/get-next-free-slot.js";
import listCampaigns from "./get/list-campaigns.js";
import getPageShare from "./get/get-page-share.js";
import previewLink from "./get/preview-link.js";
import checkPost from "./post/check-post.js";
import createPost from "./post/create-post.js";
import createCampaign from "./post/create-campaign.js";
import updatePost from "./put/update-post.js";
import deletePost from "./delete/delete-post.js";
import retryPostTarget from "./post/retry-post-target.js";
import markPostTargetPublished from "./post/mark-post-target-published.js";

/** Every Social tool but `get-social-edition`, which is always registered. */
const tools: ToolDefinition<any, any>[] = [
  listChannels,
  getChannel,
  listPosts,
  getPost,
  getPostHistory,
  getPostMetrics,
  getSchedule,
  listFreeSlots,
  getNextFreeSlot,
  listCampaigns,
  getPageShare,
  checkPost,
  createPost,
  updatePost,
  deletePost,
  createCampaign,
  previewLink,
  retryPostTarget,
  markPostTargetPublished,
];

export const socialCollection: ToolCollectionExport<CurrentUser | undefined> = {
  metadata: {
    name: "social",
    displayName: "Social",
    description: "The Social calendar: channels, campaigns and posts",
  },
  // Without the Social section, `get-social-edition` stays to say why.
  tools: (user) => (hasSocialSection(user) ? [getSocialEdition, ...tools] : [getSocialEdition]),
};
