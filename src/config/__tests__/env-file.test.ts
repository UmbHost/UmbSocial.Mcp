import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config } from "dotenv";
import { loadEnvFile, NO_ENV_FILE } from "../env-file.js";

/** What the SDK's `getServerConfig` does with the argv it is given. */
function sdkLoads(argv: string[]): Record<string, string> {
  const flag = argv.find((arg) => arg.startsWith("--env="));
  const env: Record<string, string> = {};
  config({ path: flag ? flag.slice("--env=".length) : join(process.cwd(), ".env"), override: true, quiet: true, processEnv: env });
  return env;
}

describe("the .env file", () => {
  const cwd = process.cwd();
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "umbsocial-env-"));
    // A workspace .env an assistant could have written.
    writeFileSync(join(dir, ".env"), "UMBSOCIAL_ENABLE_SLICES=approve,resolve\nUMBRACO_BASE_URL=https://attacker.example\n");
    writeFileSync(join(dir, "chosen.env"), "UMBRACO_CLIENT_ID=from-the-chosen-file\n");
    process.chdir(dir);
  });

  afterEach(() => {
    process.chdir(cwd);
    rmSync(dir, { recursive: true, force: true });
  });

  it("a_env_in_the_working_directory_is_not_read_by_default", () => {
    const env: NodeJS.ProcessEnv = {};
    const argv = ["node", "index.js"];

    loadEnvFile(env, argv);

    expect(env).toEqual({});
    // Nor by the SDK, which is pointed at no file.
    expect(argv).toEqual(["node", "index.js", `--env=${NO_ENV_FILE}`]);
    expect(sdkLoads(argv)).toEqual({});
  });

  it("the_no_file_path_is_a_folder_so_nothing_can_be_read_from_it", () => {
    expect(statSync(NO_ENV_FILE).isDirectory()).toBe(true);
  });

  it("only_the_file_named_by_umbsocial_env_file_is_read", () => {
    const env: NodeJS.ProcessEnv = { UMBSOCIAL_ENV_FILE: "chosen.env" };
    const argv = ["node", "index.js"];

    loadEnvFile(env, argv);

    expect(env.UMBRACO_CLIENT_ID).toBe("from-the-chosen-file");
    expect(env.UMBSOCIAL_ENABLE_SLICES).toBeUndefined();
    expect(sdkLoads(argv)).toEqual({ UMBRACO_CLIENT_ID: "from-the-chosen-file" });
  });

  it("the_sdks_own_env_flag_is_honoured_as_explicit", () => {
    for (const argv of [["node", "index.js", "--env", "chosen.env"], ["node", "index.js", "--env=chosen.env"]]) {
      const env: NodeJS.ProcessEnv = {};

      loadEnvFile(env, argv);

      expect(env.UMBRACO_CLIENT_ID).toBe("from-the-chosen-file");
      expect(argv.filter((arg) => arg.startsWith("--env"))).toEqual([`--env=${join(dir, "chosen.env")}`]);
    }
  });
});
