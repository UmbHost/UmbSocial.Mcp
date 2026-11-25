import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { http, HttpResponse } from "msw";
import { DEFAULT_COLLECTION_CONFIG } from "@umbraco-cms/mcp-server-sdk";
import { server } from "../../mocks/server.js";
import { allCollections as collections } from "../../tool-collections.js";
import getSocialEdition from "../../umbraco-api/tools/social/get/get-social-edition.js";
import listTemplates from "../../umbraco-api/tools/social-pro/get/list-templates.js";
import { applyDefaultOffSlices } from "../../config/server-config.js";
import { clearSession, NO_SECTION_MESSAGE, startSession, toolsFor } from "../start-session.js";
import { currentEdition, gatePro } from "../edition.js";
import { callTool, EDITION_PATH, LICENSED, UNLICENSED, USER_PATH } from "./helpers.js";

const withSection = {
  allowedSections: ["UmbSocial.Section"],
  fallbackPermissions: ["UmbSocial.View", "UmbSocial.Write"],
};

describe("the session at start-up", () => {
  afterEach(() => {
    clearSession();
    jest.restoreAllMocks();
  });

  it("no_social_section_registers_no_tools_and_says_why", async () => {
    const user = { allowedSections: ["Umb.Section.Content"], fallbackPermissions: ["UmbSocial.View"] };
    let editionRequests = 0;
    server.use(
      http.get(USER_PATH, () => HttpResponse.json(user)),
      http.get(EDITION_PATH, () => {
        editionRequests++;
        return HttpResponse.json(LICENSED);
      }),
    );
    const log = jest.spyOn(console, "error").mockImplementation(() => {});

    const session = await startSession();
    const registered = toolsFor(collections, session.user, DEFAULT_COLLECTION_CONFIG).map((t) => t.tool.name);
    const result = await callTool(getSocialEdition);

    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0]?.[0])).toContain("Social section");
    expect(registered).toEqual(["get-social-edition"]);
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ hasSection: false, verbs: [], message: NO_SECTION_MESSAGE });
    expect(editionRequests).toBe(0);
    expect(currentEdition()).toBeNull();
  });

  it("the_edition_is_read_once_when_the_user_has_the_section", async () => {
    server.use(
      http.get(USER_PATH, () => HttpResponse.json(withSection)),
      http.get(EDITION_PATH, () => HttpResponse.json(UNLICENSED)),
    );

    const session = await startSession();
    const result = await callTool(getSocialEdition);

    expect(session.edition).toEqual(UNLICENSED);
    expect(currentEdition()).toEqual(UNLICENSED);
    expect(result.structuredContent).toMatchObject({ hasSection: true, edition: UNLICENSED, verbs: ["View", "Write"] });
  });

  it("pro_tools_are_absent_when_unlicensed", async () => {
    const proTool = listTemplates;

    expect(gatePro([proTool], UNLICENSED)).toEqual([]);
    expect(gatePro([proTool], LICENSED)).toEqual([proTool]);
    // Not read (offline listing and type generation): every tool is listed.
    expect(gatePro([proTool], null)).toEqual([proTool]);

    server.use(
      http.get(USER_PATH, () => HttpResponse.json(withSection)),
      http.get(EDITION_PATH, () => HttpResponse.json(UNLICENSED)),
    );
    const session = await startSession();
    const pro = toolsFor(collections, session.user, DEFAULT_COLLECTION_CONFIG).filter(
      (t) => t.collectionName === "social-pro",
    );
    expect(pro).toEqual([]);
  });

  it("a_tool_the_user_may_not_use_is_not_registered", () => {
    const hidden = {
      name: "hidden",
      description: "",
      slices: ["read"],
      handler: async () => ({ content: [] }),
      enabled: () => false,
    };
    const shown = { ...hidden, name: "shown", enabled: () => true };
    const collection = {
      metadata: { name: "social", displayName: "Social", description: "" },
      tools: () => [hidden, shown],
    };

    const names = toolsFor([collection], withSection, DEFAULT_COLLECTION_CONFIG).map((t) => t.tool.name);

    expect(names).toEqual(["shown"]);
  });

  it("naming_a_default_off_tool_does_not_turn_its_slice_on", () => {
    // The SDK's UMBRACO_INCLUDE_TOOLS is checked before the slices, so it would
    // otherwise register approve-post without UMBSOCIAL_ENABLE_SLICES.
    const allVerbs = {
      allowedSections: ["UmbSocial.Section"],
      fallbackPermissions: ["View", "Write", "Approve", "Resolve"].map((v) => `UmbSocial.${v}`),
    };
    const named = { ...DEFAULT_COLLECTION_CONFIG, enabledTools: ["approve-post", "retry-post-target", "get-post"] };
    const names = (enabled: ReadonlySet<"approve" | "resolve">) =>
      toolsFor(collections, allVerbs, applyDefaultOffSlices(named, enabled)).map((t) => t.tool.name).sort();

    expect(names(new Set())).toEqual(["get-post"]);
    expect(names(new Set(["approve"]))).toEqual(["approve-post", "get-post"]);
    expect(names(new Set(["approve", "resolve"]))).toEqual(["approve-post", "get-post", "retry-post-target"]);
  });
});
