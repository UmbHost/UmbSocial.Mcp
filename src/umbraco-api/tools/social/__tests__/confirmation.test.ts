import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { http, HttpResponse } from "msw";
import { clearServerRef, setServerRef, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { collections } from "../../../../collections.js";
import { server } from "../../../../mocks/server.js";
import { callTool, errorBody } from "../../../../session/__tests__/helpers.js";
import { REFUSAL_HINTS } from "../../../../session/refusals.js";
import approvePost from "../../social-pro/post/approve-post.js";
import deletePost from "../delete/delete-post.js";
import markPostTargetPublished from "../post/mark-post-target-published.js";
import retryPostTarget from "../post/retry-post-target.js";
import { aPost } from "./helpers/post-builder.js";
import { API } from "./helpers/session.js";

const POST = "21212121-2121-4212-8212-212121212121";
const VERSION = "56565656-5656-4565-8565-565656565656";
const SAVED = { key: POST, version: VERSION };

interface Case {
  tool: ToolDefinition<any, any>;
  args: Record<string, unknown>;
}

const CASES: Record<string, Case> = {
  "delete-post": { tool: deletePost, args: { key: POST } },
  "retry-post-target": { tool: retryPostTarget, args: { targetId: 42 } },
  "mark-post-target-published": { tool: markPostTargetPublished, args: { targetId: 42 } },
  "approve-post": { tool: approvePost, args: { key: POST, expectedVersion: VERSION, when: "Queue" } },
};

/** Counts every write the four tools can send. */
function countWrites(): { count: number } {
  const writes = { count: 0 };
  const write = () => {
    writes.count++;
    return HttpResponse.json(SAVED);
  };
  server.use(
    http.get(`${API}/posts/${POST}`, () => HttpResponse.json(aPost({ key: POST, status: "Draft", version: VERSION }))),
    http.delete(`${API}/posts/${POST}`, () => {
      writes.count++;
      return new HttpResponse(null, { status: 200 });
    }),
    http.post(`${API}/targets/42/retry`, write),
    http.post(`${API}/targets/42/mark-published`, write),
    http.post(`${API}/pro/posts/${POST}/approve`, write),
  );
  return writes;
}

/** A client that declares no elicitation. */
const noElicitation = () => setServerRef({ getClientCapabilities: () => ({}), elicitInput: jest.fn() } as never);

afterEach(() => {
  clearServerRef();
  jest.restoreAllMocks();
});

describe("destructive tools", () => {
  it("every_destructive_tool_is_marked_and_takes_confirm", () => {
    const destructive = collections
      .flatMap((c) => c.tools(undefined))
      .filter((t) => t.annotations?.destructiveHint === true)
      .map((t) => t.name)
      .sort();

    expect(destructive).toEqual(Object.keys(CASES).sort());
    for (const { tool } of Object.values(CASES)) {
      const confirm = (tool.inputSchema as Record<string, { safeParse: (v: unknown) => { success: boolean } }>).confirm;
      expect({ name: tool.name, has: confirm !== undefined }).toEqual({ name: tool.name, has: true });
      expect(confirm!.safeParse(true).success).toBe(true);
      expect(confirm!.safeParse(undefined).success).toBe(true);
    }
  });

  it.each(Object.keys(CASES))("%s_without_elicitation_is_refused_unless_confirm_is_true", async (name) => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    const { tool, args } = CASES[name]!;
    const writes = countWrites();
    noElicitation();

    for (const confirm of [undefined, false]) {
      const body = errorBody(await callTool(tool, { ...args, ...(confirm === undefined ? {} : { confirm }) })) as {
        codes: string[];
        hint: string;
      };
      expect(body.codes).toEqual(["confirmation.required"]);
      expect(body.hint).toBe(REFUSAL_HINTS["confirmation.required"]);
    }
    expect(writes.count).toBe(0);

    const done = await callTool(tool, { ...args, confirm: true });
    expect(done.isError).toBeFalsy();
    expect(writes.count).toBe(1);
  });

  it.each(Object.keys(CASES))("%s_without_any_server_reference_also_needs_confirm", async (name) => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    const { tool, args } = CASES[name]!;
    const writes = countWrites();

    const body = errorBody(await callTool(tool, args)) as { codes: string[] };

    expect(body.codes).toEqual(["confirmation.required"]);
    expect(writes.count).toBe(0);
  });

  it.each(Object.keys(CASES))("%s_asks_the_person_when_the_client_can_even_with_confirm", async (name) => {
    const { tool, args } = CASES[name]!;
    const writes = countWrites();
    const elicitInput = jest.fn(async () => ({ action: "decline" }));
    setServerRef({ getClientCapabilities: () => ({ elicitation: { form: {} } }), elicitInput } as never);

    const result = await callTool(tool, { ...args, confirm: true });

    expect(elicitInput).toHaveBeenCalledTimes(1);
    expect(result.isError).toBeFalsy();
    expect(writes.count).toBe(0);
  });

  it("the_confirmation_hint_says_to_ask_the_person_first", () => {
    expect(REFUSAL_HINTS["confirmation.required"]).toMatch(/ask the person/i);
    expect(REFUSAL_HINTS["confirmation.required"]).toMatch(/confirm: true/);
  });
});
