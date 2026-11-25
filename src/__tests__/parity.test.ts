import { describe, expect, it } from "@jest/globals";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Every operation of the committed API description is called by a tool, or is
 * here with why not. A new operation fails this test until it is one or the other.
 */
const NOT_TOOLS: Readonly<Record<string, string>> = {
  PostPresenceEditing: "tells other people's composers that someone is typing in the backoffice",
  PostPresenceLeft: "tells other people's composers that someone left the composer",
  PreviewImage: "draws the composer's picture of each network's crop",
  GetTagItems: "names the tags of a backoffice picker by key; list-tags and get-tag give the same",
  CountHashtagGroupUse: "counts a group inserted from the composer; an assistant writes the hashtags itself",
};

interface Description {
  paths: Record<string, Record<string, { operationId?: string }>>;
}

const snapshot = JSON.parse(readFileSync("src/umbraco-api/api/umbsocial.swagger.json", "utf8")) as Description;
const operations = Object.values(snapshot.paths).flatMap((path) =>
  Object.values(path).flatMap((operation) => (operation.operationId ? [operation.operationId] : [])),
);

const source = readdirSync("src/umbraco-api/tools", { recursive: true, encoding: "utf8" })
  .filter((file) => file.endsWith(".ts") && !file.includes("__tests__"))
  .map((file) => readFileSync(join("src/umbraco-api/tools", file), "utf8"))
  .join("\n");

const called = (id: string) => new RegExp(`\\bapi\\.${id[0]!.toLowerCase()}${id.slice(1)}\\(`).test(source);
const excluded = (id: string) => Object.keys(NOT_TOOLS).find((name) => name.toLowerCase() === id.toLowerCase());

describe("parity with the API", () => {
  it("every_operation_has_a_tool_or_a_reason", () => {
    expect(operations.length).toBeGreaterThan(100);
    expect(operations.filter((id) => !called(id) && !excluded(id))).toEqual([]);
  });

  it("the_reasons_are_all_still_needed", () => {
    expect(operations.filter((id) => excluded(id) && called(id))).toEqual([]);
    expect(operations.filter((id) => excluded(id))).toHaveLength(Object.keys(NOT_TOOLS).length);
  });

  it("no_tool_puts_a_post_on_the_calendar_but_the_approval", () => {
    expect(source.match(/when: "(Queue|At|Now|OnPagePublish)"/g) ?? []).toEqual([]);
  });
});
