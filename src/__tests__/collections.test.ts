import { afterEach, describe, expect, it } from "@jest/globals";
import { DEFAULT_COLLECTION_CONFIG, shouldIncludeTool } from "@umbraco-cms/mcp-server-sdk";
import { collections } from "../collections.js";
import { userWith } from "../umbraco-api/tools/social/__tests__/helpers/session.js";

const ALL_VERBS = ["View", "Write", "Schedule", "Approve", "UseAi", "Resolve", "ManageSettings"];
const DEFAULT_OFF = ["approve-post", "mark-post-target-published", "retry-post-target", "return-post"];

/** What a host gets filtering the exported collections with the SDK alone. */
function hostTools(user: unknown, includeTools: string[] = []): string[] {
  const config = { ...DEFAULT_COLLECTION_CONFIG, enabledTools: includeTools };
  return collections.flatMap((collection) =>
    collection
      .tools(user as never)
      .filter((tool) => shouldIncludeTool(tool, { collectionName: collection.metadata.name, config }))
      .map((tool) => tool.name),
  );
}

describe("the exported collections", () => {
  const saved = process.env.UMBSOCIAL_ENABLE_SLICES;
  afterEach(() => {
    if (saved === undefined) delete process.env.UMBSOCIAL_ENABLE_SLICES;
    else process.env.UMBSOCIAL_ENABLE_SLICES = saved;
  });

  it("default_off_tools_are_left_out_unless_umbsocial_enable_slices_names_their_slice", () => {
    delete process.env.UMBSOCIAL_ENABLE_SLICES;

    expect(hostTools(userWith(...ALL_VERBS)).filter((name) => DEFAULT_OFF.includes(name))).toEqual([]);
    // Naming them in UMBRACO_INCLUDE_TOOLS isn't enough, as in the server.
    expect(hostTools(userWith(...ALL_VERBS), DEFAULT_OFF)).toEqual([]);
    expect(hostTools(undefined).filter((name) => DEFAULT_OFF.includes(name))).toEqual([]);
  });

  it("an_enabled_slice_brings_its_tools_back", () => {
    process.env.UMBSOCIAL_ENABLE_SLICES = "approve,resolve";

    expect(hostTools(userWith(...ALL_VERBS)).filter((name) => DEFAULT_OFF.includes(name)).sort()).toEqual(DEFAULT_OFF);

    process.env.UMBSOCIAL_ENABLE_SLICES = "approve";
    expect(hostTools(userWith(...ALL_VERBS)).filter((name) => DEFAULT_OFF.includes(name)).sort()).toEqual([
      "approve-post",
      "return-post",
    ]);
  });

  it("a_tool_the_user_has_no_permission_for_is_left_out", () => {
    delete process.env.UMBSOCIAL_ENABLE_SLICES;

    const names = hostTools(userWith("View"));

    expect(names).toContain("list-posts");
    expect(names).not.toContain("create-post");
    expect(names).not.toContain("delete-post");
  });

  it("an_unknown_slice_name_is_refused", () => {
    process.env.UMBSOCIAL_ENABLE_SLICES = "approve,everything";

    expect(() => hostTools(userWith(...ALL_VERBS))).toThrow(/UMBSOCIAL_ENABLE_SLICES/);
  });
});
