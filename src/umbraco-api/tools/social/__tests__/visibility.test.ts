import { describe, expect, it } from "@jest/globals";
import { DEFAULT_COLLECTION_CONFIG } from "@umbraco-cms/mcp-server-sdk";
import { collections } from "../../../../collections.js";
import { toolsFor } from "../../../../session/start-session.js";
import { userWith } from "./helpers/session.js";

const READ_TOOLS = ["get-channel", "get-next-free-slot", "get-schedule", "list-channels", "list-free-slots"];
const READ_POST_TOOLS = ["get-post", "get-post-history", "get-post-metrics", "list-posts"];

const names = (...verbs: string[]) =>
  toolsFor(collections, userWith(...verbs), DEFAULT_COLLECTION_CONFIG)
    .map((t) => t.tool.name)
    .sort();

describe("which read tools a user sees", () => {
  it("read_tools_are_hidden_without_a_read_verb", () => {
    expect(names("Schedule")).toEqual(["get-social-edition"]);

    expect(names("ManageSettings")).toEqual(["get-social-edition", "list-campaigns", ...READ_TOOLS].sort());

    expect(names("View")).toEqual(["get-social-edition", ...READ_TOOLS, ...READ_POST_TOOLS].sort());

    expect(names("Write")).toEqual(
      ["get-social-edition", "get-page-share", "list-campaigns", ...READ_TOOLS, ...READ_POST_TOOLS].sort(),
    );
  });
});
