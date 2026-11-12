/**
 * `npm run tools-table`: writes the tools table and the refusal hints into
 * `docs/`, for the docs site's MCP pages. A test fails until they're
 * regenerated after a tool, a verb or a hint changes.
 */

import { writeFileSync } from "node:fs";
import { allCollections as collections } from "../tool-collections.js";
import { REFUSAL_HINTS_PATH, renderRefusalHints, renderToolsTable, TOOLS_TABLE_PATH } from "./tools-table.js";

writeFileSync(TOOLS_TABLE_PATH, renderToolsTable(collections));
writeFileSync(REFUSAL_HINTS_PATH, renderRefusalHints());
console.log(`Wrote ${TOOLS_TABLE_PATH} and ${REFUSAL_HINTS_PATH}.`);
