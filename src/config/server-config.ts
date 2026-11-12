/**
 * Server configuration.
 *
 * `loadServerConfig` is the template's wrapper around the SDK's
 * `getServerConfig` (filtering settings and CLI flags). `loadSocialConfig`
 * validates what this server needs before anything else runs.
 */

import {
  getServerConfig,
  isLoopbackUrl,
  type CollectionConfiguration,
  type ConfigFieldDefinition,
  type UmbracoServerConfig,
  type GetServerConfigResult,
} from "@umbraco-cms/mcp-server-sdk";
import { DEFAULT_OFF_SLICES, type DefaultOffSlice } from "./slice-registry.js";

/**
 * A configuration this server refuses to start with. The message names the
 * variable and never contains any value.
 */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export interface SocialConfig {
  baseUrl: URL;
  clientId: string;
  clientSecret: string;
  enabledSlices: Set<DefaultOffSlice>;
  chaining: boolean;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new ConfigError(`${name} is required. Set it in the environment or in a .env file.`);
  }
  return value;
}

function readBaseUrl(env: NodeJS.ProcessEnv): URL {
  const raw = required(env, "UMBRACO_BASE_URL");

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ConfigError("UMBRACO_BASE_URL is not a valid URL. Use the site's address, e.g. https://example.com.");
  }

  if (url.username || url.password) {
    throw new ConfigError("UMBRACO_BASE_URL must not contain a user name or password. Use the API user's client credentials.");
  }

  const https = url.protocol === "https:";
  const loopbackHttp = url.protocol === "http:" && isLoopbackUrl(url.href);
  if (!https && !loopbackHttp) {
    throw new ConfigError(
      "UMBRACO_BASE_URL must use https. Plain http is allowed only for localhost, 127.0.0.1 or [::1].",
    );
  }

  return url;
}

function readEnabledSlices(env: NodeJS.ProcessEnv): Set<DefaultOffSlice> {
  const names = (env.UMBSOCIAL_ENABLE_SLICES ?? "")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name.length > 0);

  const known = DEFAULT_OFF_SLICES as readonly string[];
  const unknown = names.filter((name) => !known.includes(name));
  if (unknown.length > 0) {
    // A slice name is safe to repeat, but a value that isn't one may be anything
    // pasted by mistake, so only short plain names are echoed.
    const shown = unknown.map((name) => (/^[a-z-]{1,20}$/.test(name) ? name : "(an unrecognised value)"));
    throw new ConfigError(
      `UMBSOCIAL_ENABLE_SLICES has an unknown slice: ${shown.join(", ")}. Use any of: ${DEFAULT_OFF_SLICES.join(", ")}.`,
    );
  }

  return new Set(names as DefaultOffSlice[]);
}

/**
 * Reads and checks this server's configuration from the environment.
 *
 * Hand-rolled because the SDK lacks it: `getServerConfig` prints a message and
 * calls `process.exit(1)` for a missing value (so it can't be tested and doesn't
 * throw), and it accepts plain http to a remote site.
 */
export function loadSocialConfig(env: NodeJS.ProcessEnv): SocialConfig {
  const baseUrl = readBaseUrl(env);
  const clientId = required(env, "UMBRACO_CLIENT_ID");
  const clientSecret = required(env, "UMBRACO_CLIENT_SECRET");
  const enabledSlices = readEnabledSlices(env);
  const chaining = env.DISABLE_MCP_CHAINING?.trim().toLowerCase() !== "true";

  return { baseUrl, clientId, clientSecret, enabledSlices, chaining };
}

/**
 * Turns off the default-off slices that `UMBSOCIAL_ENABLE_SLICES` didn't name.
 *
 * Hand-rolled because the SDK lacks slices that are off unless asked for:
 * `UMBRACO_INCLUDE_SLICES` keeps only the slices it names, hiding every other
 * tool, so it can't opt in to one slice. This adds to `disabledSlices` and keeps
 * whatever the user excluded with `UMBRACO_EXCLUDE_SLICES`.
 */
export function applyDefaultOffSlices(
  config: CollectionConfiguration,
  enabledSlices: ReadonlySet<DefaultOffSlice>,
): CollectionConfiguration {
  const off = DEFAULT_OFF_SLICES.filter((slice) => !enabledSlices.has(slice));
  return {
    ...config,
    disabledSlices: [...new Set([...config.disabledSlices, ...off])],
  };
}

// ============================================================================
// The SDK's config (filtering settings and CLI flags)
// ============================================================================

export interface SocialServerCustomConfig {
  /** Turns off chaining to the CMS Developer MCP. */
  disableMcpChaining?: boolean;
  /**
   * Overrides the Umbraco major this server targets for the start-up version
   * check. Leave unset to use `UMBRACO_TARGET_MAJOR`.
   */
  expectedUmbracoMajor?: string;
}

const customFields: ConfigFieldDefinition[] = [
  {
    name: "disableMcpChaining",
    envVar: "DISABLE_MCP_CHAINING",
    cliFlag: "disable-mcp-chaining",
    type: "boolean",
  },
  {
    name: "expectedUmbracoMajor",
    envVar: "UMBRACO_EXPECTED_MAJOR",
    cliFlag: "umbraco-expected-major",
    type: "string",
  },
];

export interface ServerConfig {
  umbraco: UmbracoServerConfig;
  custom: SocialServerCustomConfig;
  cliFlags: GetServerConfigResult["cliFlags"];
}

let cachedConfig: ServerConfig | null = null;

export async function loadServerConfig(isStdioMode: boolean): Promise<ServerConfig> {
  if (cachedConfig) {
    return cachedConfig;
  }

  const { config, custom, cliFlags } = await getServerConfig(isStdioMode, {
    additionalFields: customFields,
  });

  cachedConfig = {
    umbraco: config,
    custom: custom as SocialServerCustomConfig,
    cliFlags,
  };

  return cachedConfig;
}

export function clearConfigCache(): void {
  cachedConfig = null;
}
