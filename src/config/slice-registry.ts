/**
 * Tool slice registry: the single source of truth for slice names.
 *
 * Four slices are off unless asked for: `approve` (approve and return a post),
 * `resolve` (retry a target and mark it published), `manage` (change and delete
 * campaigns, tags, hashtag groups and short links) and `settings` (change the
 * site's Social settings). They act on review, on live networks or on what the
 * whole site shares. See `DEFAULT_OFF_SLICES` and `applyDefaultOffSlices`.
 */

import { baseSliceNames } from "@umbraco-cms/mcp-server-sdk";

export const toolSliceNames = [...baseSliceNames, "approve", "resolve", "manage", "settings"] as const;

export type ToolSliceName = (typeof toolSliceNames)[number];

/** All valid slice names, including the SDK's `other` catch-all. */
export const allSliceNames: readonly string[] = [...toolSliceNames, "other"];

export type ExtendedSliceName = ToolSliceName | "other";

/** Slices whose tools register only when `UMBSOCIAL_ENABLE_SLICES` names them. */
export const DEFAULT_OFF_SLICES = ["approve", "resolve", "manage", "settings"] as const;

export type DefaultOffSlice = (typeof DEFAULT_OFF_SLICES)[number];
