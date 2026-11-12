import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { clearServerRef, getServerRef } from "@umbraco-cms/mcp-server-sdk";
import { createServer } from "../server.js";
import { confirmIfSupported } from "../umbraco-api/tools/social/shared.js";

describe("the MCP server", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    clearServerRef();
  });

  it("confirmations_reach_the_server", async () => {
    const server = createServer("umbsocial-mcp-test", "0.0.0");

    expect(getServerRef()).toBe(server.server);

    jest.spyOn(server.server, "getClientCapabilities").mockReturnValue({ elicitation: { form: {} } });
    const elicitInput = jest
      .spyOn(server.server, "elicitInput")
      .mockResolvedValue({ action: "accept", content: { confirm: true } });

    await expect(confirmIfSupported({ requestId: 1 }, "Delete this draft?", undefined)).resolves.toBe(true);
    expect(elicitInput).toHaveBeenCalledTimes(1);
  });
});
