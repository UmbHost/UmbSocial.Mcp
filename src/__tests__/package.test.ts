import { describe, expect, it } from "@jest/globals";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const pkg = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
  bin: Record<string, string>;
  files: string[];
};

describe("the published package", () => {
  it("ships_only_dist_besides_what_npm_always_adds", () => {
    // npm adds README.md, LICENSE and package.json itself; release.yml checks the tarball too.
    expect(pkg.files).toEqual(["dist"]);
  });

  it("the_bin_path_is_one_npm_keeps_as_written", () => {
    // npm rewrites "./dist/index.js" on publish and warns that it was invalid.
    expect(pkg.bin).toEqual({ "umbsocial-mcp": "dist/index.js" });
  });
});
