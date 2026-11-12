/**
 * The `.env` file: read only when one is named.
 *
 * The working directory is usually the client's project folder, which an
 * assistant may be able to write to, so a `.env` there is never read by
 * default. `UMBSOCIAL_ENV_FILE` names the one file to read (the SDK's own
 * `--env` flag is honoured too, as it is just as explicit).
 *
 * Hand-rolled because the SDK lacks it: `getServerConfig` reads `--env`, or
 * else `.env` in the working directory, with `override: true`. So this also
 * gives it an `--env` pointing at the named file, or at no file at all.
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

/**
 * Where the SDK is pointed when no file is named: this module's own folder.
 * Reading a folder always fails, quietly, so nothing is loaded.
 */
export const NO_ENV_FILE = dirname(fileURLToPath(import.meta.url));

const isEnvFlag = (arg: string) => arg === "--env" || arg.startsWith("--env=");

/** The file named by `UMBSOCIAL_ENV_FILE`, else by `--env`; none by default. */
export function namedEnvFile(env: NodeJS.ProcessEnv, argv: readonly string[]): string | undefined {
  const fromEnv = env.UMBSOCIAL_ENV_FILE?.trim();
  if (fromEnv) return resolve(fromEnv);

  const at = argv.findIndex(isEnvFlag);
  if (at === -1) return undefined;
  const flag = argv[at]!;
  const value = flag === "--env" ? argv[at + 1] : flag.slice("--env=".length);
  return value?.trim() ? resolve(value.trim()) : undefined;
}

/**
 * Loads the named file, if any, into `env`, as the SDK will (its values win),
 * and makes `argv` name the same file, or none, for the SDK.
 *
 * dotenv 17 prints a banner to stdout when it loads; this server's stdout
 * carries MCP traffic and the CLI's JSON, so it loads quietly.
 */
export function loadEnvFile(env: NodeJS.ProcessEnv = process.env, argv: string[] = process.argv): void {
  const file = namedEnvFile(env, argv);
  if (file) config({ path: file, override: true, quiet: true, processEnv: env as Record<string, string> });

  const at = argv.findIndex(isEnvFlag);
  if (at !== -1) argv.splice(at, argv[at] === "--env" ? 2 : 1);
  argv.push(`--env=${file ?? NO_ENV_FILE}`);
}
