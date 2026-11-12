import { describe, it, expect } from "@jest/globals";
import {
  DEFAULT_COLLECTION_CONFIG,
  shouldIncludeTool,
  type CollectionConfiguration,
} from "@umbraco-cms/mcp-server-sdk";
import { ConfigError, applyDefaultOffSlices, loadSocialConfig } from "../server-config.js";

const SECRET = "s3cr3t-value-that-must-never-leak";

const good = {
  UMBRACO_BASE_URL: "https://social.example.com",
  UMBRACO_CLIENT_ID: "umbraco-back-office-social-mcp",
  UMBRACO_CLIENT_SECRET: SECRET,
};

function failureOf(env: NodeJS.ProcessEnv): ConfigError {
  try {
    loadSocialConfig(env);
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    return error as ConfigError;
  }
  throw new Error("expected a ConfigError");
}

function baseConfig(overrides: Partial<CollectionConfiguration> = {}): CollectionConfiguration {
  return { ...DEFAULT_COLLECTION_CONFIG, ...overrides };
}

function included(slice: string, config: CollectionConfiguration): boolean {
  return shouldIncludeTool({ name: `a-${slice}-tool`, slices: [slice] }, { collectionName: "social", config });
}

describe("loadSocialConfig", () => {
  it("reads a good config", () => {
    const config = loadSocialConfig(good);

    expect(config.baseUrl.href).toBe("https://social.example.com/");
    expect(config.clientId).toBe(good.UMBRACO_CLIENT_ID);
    expect(config.clientSecret).toBe(SECRET);
    expect(config.enabledSlices.size).toBe(0);
    expect(config.chaining).toBe(true);
  });

  it("a_bad_config_fails_clearly_without_the_secret", () => {
    const cases: Array<[NodeJS.ProcessEnv, string]> = [
      [{ ...good, UMBRACO_BASE_URL: undefined }, "UMBRACO_BASE_URL"],
      [{ ...good, UMBRACO_BASE_URL: "  " }, "UMBRACO_BASE_URL"],
      [{ ...good, UMBRACO_BASE_URL: "not a url" }, "UMBRACO_BASE_URL"],
      [{ ...good, UMBRACO_BASE_URL: "ftp://social.example.com" }, "UMBRACO_BASE_URL"],
      [{ ...good, UMBRACO_BASE_URL: `http://admin:${SECRET}@social.example.com` }, "UMBRACO_BASE_URL"],
      [{ ...good, UMBRACO_CLIENT_ID: undefined }, "UMBRACO_CLIENT_ID"],
      [{ ...good, UMBRACO_CLIENT_ID: "" }, "UMBRACO_CLIENT_ID"],
      [{ ...good, UMBRACO_CLIENT_SECRET: undefined }, "UMBRACO_CLIENT_SECRET"],
      [{ ...good, UMBRACO_CLIENT_SECRET: " \t" }, "UMBRACO_CLIENT_SECRET"],
      [{ ...good, UMBSOCIAL_ENABLE_SLICES: SECRET }, "UMBSOCIAL_ENABLE_SLICES"],
    ];

    for (const [env, variable] of cases) {
      const error = failureOf(env);
      expect(error.message).toContain(variable);
      expect(error.message).not.toContain(SECRET);
      expect(error.message).not.toContain(good.UMBRACO_CLIENT_ID);
    }
  });

  it("http_is_allowed_only_on_loopback", () => {
    for (const url of [
      "http://localhost:44391",
      "http://127.0.0.1:44391",
      "http://[::1]:44391",
      "https://localhost:44391",
      "https://social.example.com",
    ]) {
      expect(loadSocialConfig({ ...good, UMBRACO_BASE_URL: url }).baseUrl.href).toBe(new URL(url).href);
    }

    for (const url of ["http://social.example.com", "http://localhost.example.com", "http://192.168.1.10"]) {
      expect(failureOf({ ...good, UMBRACO_BASE_URL: url }).message).toContain("https");
    }
  });

  it("approve_and_resolve_are_off_unless_enabled", () => {
    const off = loadSocialConfig(good).enabledSlices;
    expect([...off]).toEqual([]);

    const offConfig = applyDefaultOffSlices(baseConfig(), off);
    expect(included("approve", offConfig)).toBe(false);
    expect(included("resolve", offConfig)).toBe(false);
    expect(included("read", offConfig)).toBe(true);

    const approveOnly = loadSocialConfig({ ...good, UMBSOCIAL_ENABLE_SLICES: " Approve " }).enabledSlices;
    const approveConfig = applyDefaultOffSlices(baseConfig(), approveOnly);
    expect(included("approve", approveConfig)).toBe(true);
    expect(included("resolve", approveConfig)).toBe(false);
    expect(included("read", approveConfig)).toBe(true);

    const both = loadSocialConfig({ ...good, UMBSOCIAL_ENABLE_SLICES: "approve,resolve" }).enabledSlices;
    const bothConfig = applyDefaultOffSlices(baseConfig(), both);
    expect(included("approve", bothConfig)).toBe(true);
    expect(included("resolve", bothConfig)).toBe(true);

    // A user's own UMBRACO_EXCLUDE_SLICES still applies, even to an enabled slice.
    const userExcluded = applyDefaultOffSlices(baseConfig({ disabledSlices: ["delete", "approve"] }), both);
    expect(included("delete", userExcluded)).toBe(false);
    expect(included("approve", userExcluded)).toBe(false);
    expect(included("resolve", userExcluded)).toBe(true);
  });

  it("an_unknown_enabled_slice_is_refused", () => {
    const error = failureOf({ ...good, UMBSOCIAL_ENABLE_SLICES: "approve,publish" });

    expect(error.message).toContain("UMBSOCIAL_ENABLE_SLICES");
    expect(error.message).toContain("approve");
    expect(error.message).toContain("resolve");
    // The value is never echoed, however harmless it looks.
    expect(error.message).not.toContain("publish");
  });

  it("chaining_is_off_only_when_disabled", () => {
    expect(loadSocialConfig({ ...good, DISABLE_MCP_CHAINING: "true" }).chaining).toBe(false);
    expect(loadSocialConfig({ ...good, DISABLE_MCP_CHAINING: "TRUE" }).chaining).toBe(false);
    expect(loadSocialConfig({ ...good, DISABLE_MCP_CHAINING: "false" }).chaining).toBe(true);
    expect(loadSocialConfig({ ...good, DISABLE_MCP_CHAINING: "1" }).chaining).toBe(true);
    expect(loadSocialConfig(good).chaining).toBe(true);
  });
});
