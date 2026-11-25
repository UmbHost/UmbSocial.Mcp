/**
 * Builds `PostResponse` bodies for the MSW handlers, as the site returns them:
 * `*Utc` values without a zone, as the spike saw.
 */

import type { PostResponse, TargetResponse } from "../../../../api/generated/umbSocialApi.js";

let counter = 0;

function uuid(n: number): string {
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
}

export function aTarget(overrides: Partial<TargetResponse> = {}): TargetResponse {
  counter++;
  return {
    id: counter,
    channelKey: uuid(9000 + counter),
    channelName: "Mastodon",
    network: "mastodon",
    status: "Scheduled",
    attempt: 0,
    postUrl: null,
    error: null,
    dispatchedUtc: "2026-11-15T10:00:01",
    completedUtc: null,
    automateRunId: "run-123",
    options: null,
    warning: null,
    partUrls: [],
    retryCount: 0,
    ...overrides,
  };
}

export function aPost(overrides: Partial<PostResponse> = {}): PostResponse {
  counter++;
  return {
    key: uuid(counter),
    text: `Post ${counter}`,
    status: "Scheduled",
    origin: "Manual",
    createdByUserKey: null,
    scheduledForUtc: "2026-11-15T10:00:00",
    createdUtc: "2026-11-10T09:00:00",
    updatedUtc: "2026-11-10T09:30:00",
    publishedUtc: null,
    targets: [aTarget()],
    reviewNote: null,
    campaign: null,
    version: uuid(50000 + counter),
    links: [],
    page: null,
    pageLinks: null,
    ...overrides,
  };
}

/** `count` posts, each with text longer than an excerpt. */
export function manyPosts(count: number): PostResponse[] {
  return Array.from({ length: count }, (_, i) => aPost({ text: `${i} `.padEnd(300, "x") }));
}
