import { describe, expect, it } from "@jest/globals";
import { z } from "zod";
import { createPermissiveCodegenUser, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { collections } from "../../collections.js";
import { CMS_TOOLS } from "../../config/mcp-servers.js";
import { idGuardProblems } from "./id-guard.js";

describe("the id guard", () => {
  it("every_id_input_has_a_tool_that_lists_it", () => {
    // Every tool, with every slice on: the codegen user passes every check, and
    // no edition has been read, so Pro lists its tools too.
    const user = createPermissiveCodegenUser();
    const tools = collections.flatMap((c) => c.tools(user));
    const registered = new Set([...tools.map((t) => t.name), ...CMS_TOOLS]);

    expect(tools.length).toBeGreaterThan(0);
    expect(idGuardProblems(tools, registered)).toEqual([]);
  });

  it("the_id_guard_catches_an_unmapped_field", () => {
    const stub = {
      name: "stub",
      description: "",
      slices: ["read"],
      handler: async () => ({ content: [] }),
      inputSchema: {
        fooKey: z.string(),
        channelKey: z.string(),
        targets: z.array(z.object({ targetId: z.string() })),
        mediaKey: z.string(),
      },
    } as unknown as ToolDefinition<any, any>;

    expect(idGuardProblems([stub], new Set(["stub", ...CMS_TOOLS]))).toEqual([
      "stub.fooKey: not in ID_SOURCES",
      "stub.channelKey: list-channels isn't registered",
      "stub.targetId: get-post isn't registered",
    ]);
  });
});
