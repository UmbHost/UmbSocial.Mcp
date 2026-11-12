import { describe, expect, it } from "@jest/globals";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const pkg = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
  bin: Record<string, string>;
  files: string[];
};

describe("the published package", () => {
  it("ships_only_dist_and_the_shrinkwrap_besides_what_npm_always_adds", () => {
    // npm adds README.md, LICENSE and package.json itself; release.yml checks the tarball too.
    expect(pkg.files).toEqual(["dist", "npm-shrinkwrap.json"]);
  });

  it("the_tarball_carries_the_shrinkwrap", () => {
    // Without it, users get floating versions beneath the exact pins.
    const [packed] = JSON.parse(execSync("npm pack --dry-run --json --ignore-scripts", { encoding: "utf8" })) as Array<{
      files: Array<{ path: string }>;
    }>;
    expect(packed!.files.map((f) => f.path)).toContain("npm-shrinkwrap.json");
  });

  it("the_bin_path_is_one_npm_keeps_as_written", () => {
    // npm rewrites "./dist/index.js" on publish and warns that it was invalid.
    expect(pkg.bin).toEqual({ "umbsocial-mcp": "dist/index.js" });
  });
});
