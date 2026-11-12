// Runs the SDK's tool-types generator over dist/collections.js with the
// default-off slices turned on, so the published types cover every tool: a
// host that enables approve or resolve needs theirs too. The exported
// collections leave those tools out otherwise.
import { spawnSync } from "node:child_process";

const generator = "node_modules/@umbraco-cms/mcp-server-sdk/dist/cli/generate-tool-types.js";
const result = spawnSync(process.execPath, [generator, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, UMBSOCIAL_ENABLE_SLICES: "approve,resolve" },
});
process.exit(result.status ?? 1);
