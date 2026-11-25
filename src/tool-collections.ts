/**
 * Every tool collection, ungated: the server registers from these through
 * `toolsFor`, which applies the default-off slices, each tool's `enabled` and
 * the SDK's filters. A host importing the package gets the gated
 * `collections` export instead (collections.ts).
 */

import type { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import { socialCollection } from "./umbraco-api/tools/social/index.js";
import { socialProCollection } from "./umbraco-api/tools/social-pro/index.js";
import { socialAiCollection } from "./umbraco-api/tools/social-ai/index.js";
import { socialEngageCollection } from "./umbraco-api/tools/social-engage/index.js";

export const allCollections: ToolCollectionExport[] = [
  socialCollection,
  socialProCollection,
  socialAiCollection,
  socialEngageCollection,
];
