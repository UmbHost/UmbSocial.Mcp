import { describe, expect, it } from "@jest/globals";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { collections } from "../../collections.js";
import { REFUSAL_HINTS } from "../../session/refusals.js";
import { REFUSAL_HINTS_PATH, renderRefusalHints, renderToolsTable, TOOLS_TABLE_PATH } from "../tools-table.js";

const committed = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("the docs' generated tables", () => {
  it("the_tools_table_in_the_docs_matches_the_registered_tools", () => {
    // Regenerate with `npm run tools-table`, then copy the table into the docs page.
    expect(committed(TOOLS_TABLE_PATH)).toBe(renderToolsTable(collections));
  });

  it("the_tools_table_lists_every_tool_once", () => {
    const table = renderToolsTable(collections);
    const names = collections.flatMap((c) => c.tools(undefined).map((t) => t.name));
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(table.split("\n").filter((line) => line.startsWith(`| \`${name}\` |`))).toHaveLength(1);
    }
  });

  it("the_tools_table_marks_the_verb_the_slice_and_pro", () => {
    const row = (name: string) => renderToolsTable(collections).split("\n").find((line) => line.startsWith(`| \`${name}\` |`));
    expect(row("create-post")).toMatch(/\| Write \| create \|/);
    expect(row("list-channels")).toMatch(/\| View, Write or Manage settings \| list \|/);
    expect(row("approve-post")).toMatch(/\| Approve \| approve \(off\) \|/);
    expect(row("approve-post")).toMatch(/\| Pro \|/);
    expect(row("create-post")).not.toMatch(/\| Pro \|/);
    expect(row("delete-post")).toMatch(/destructive/);
    expect(row("get-post")).toMatch(/read-only/);
    expect(row("create-post")).toMatch(/`text`/);
    expect(row("create-post")).toMatch(/`pageKey\?`/);
  });

  it("the_refusal_hints_in_the_docs_match_the_code", () => {
    expect(committed(REFUSAL_HINTS_PATH)).toBe(renderRefusalHints());
    for (const code of Object.keys(REFUSAL_HINTS)) {
      expect(renderRefusalHints()).toContain(`\`${code}\``);
    }
  });
});
