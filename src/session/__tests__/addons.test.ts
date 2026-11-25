import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { http, HttpResponse } from "msw";
import { DEFAULT_COLLECTION_CONFIG, type ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import { server } from "../../mocks/server.js";
import { allCollections } from "../../tool-collections.js";
import getSocialEdition from "../../umbraco-api/tools/social/get/get-social-edition.js";
import listTemplates from "../../umbraco-api/tools/social-pro/get/list-templates.js";
import { socialAiCollection } from "../../umbraco-api/tools/social-ai/index.js";
import { socialEngageCollection } from "../../umbraco-api/tools/social-engage/index.js";
import { readAddOns, type AddOn } from "../addons.js";
import { clearSession, startSession, toolsFor } from "../start-session.js";
import { applyDefaultOffSlices } from "../../config/server-config.js";
import { DEFAULT_OFF_SLICES } from "../../config/slice-registry.js";
import { callTool, EDITION_PATH, errorBody, LICENSED, UNLICENSED, USER_PATH } from "./helpers.js";

const PRO = "*/umbraco/management/api/v1/umbsocial/pro";
const PATHS: Record<AddOn, string> = {
  pro: `${PRO}/tags`,
  ai: `${PRO}/ai/status`,
  engage: `${PRO}/engage/campaigns/:key/figures`,
};

const coded = (status: number, code: string) => () => HttpResponse.json({ status }, { status, headers: { "X-UmbSocial-Codes": code } });
const plain = (status: number) => () => new HttpResponse(null, { status });
const json = (body: Record<string, unknown>) => () => HttpResponse.json(body);
const missing = plain(404);
const forbidden = plain(403);
const proLess = coded(403, "licence.pro_required");
const engageLess = coded(403, "licence.engage_required");
const answer = (addOn: AddOn, reply: () => Response) => server.use(http.get(PATHS[addOn], reply as never));

const off = { installed: false, licensed: null, usable: false };
const unlicensed = { installed: true, licensed: false, usable: false };
const usable = { installed: true, licensed: true, usable: true, reason: null };
const unknown = { installed: null, licensed: null, usable: false };

const CASES: Array<[string, AddOn, () => Response, typeof LICENSED, Record<string, unknown>, RegExp | null]> = [
  ["pro missing", "pro", missing, UNLICENSED as never, off, /UmbSocial\.Pro package isn't installed/],
  ["pro missing though licensed", "pro", missing, LICENSED, off, /UmbSocial\.Pro package isn't installed/],
  ["pro unlicensed", "pro", proLess, UNLICENSED as never, unlicensed, /isn't licensed/],
  ["pro usable", "pro", json({ total: 0, items: [] }), LICENSED, usable, null],
  ["pro not allowed to check, licensed", "pro", forbidden, LICENSED, usable, null],
  ["pro not allowed to check, unlicensed", "pro", forbidden, UNLICENSED as never, unlicensed, /isn't licensed/],
  ["pro not answering", "pro", plain(500), LICENSED, unknown, /status 500/],
  ["ai missing", "ai", missing, LICENSED, { ...off, configured: null }, /UmbSocial\.AI package isn't installed/],
  ["ai unlicensed", "ai", proLess, UNLICENSED as never, { ...unlicensed, configured: null }, /needs an UmbSocial Pro licence/],
  ["ai not set up", "ai", json({ configured: false, startFromLink: false }), LICENSED, { installed: true, licensed: true, configured: false, usable: false }, /not set up/],
  ["ai usable", "ai", json({ configured: true, startFromLink: true }), LICENSED, { ...usable, configured: true }, null],
  ["ai not allowed to check, licensed", "ai", forbidden, LICENSED, { installed: true, licensed: true, configured: null, usable: null }, /lacks the Social Use AI/],
  ["ai not allowed to check, unlicensed", "ai", forbidden, UNLICENSED as never, { ...unlicensed, configured: null }, /needs an UmbSocial Pro licence/],
  ["ai not answering", "ai", plain(503), LICENSED, { ...unknown, configured: null }, /status 503/],
  ["engage missing", "engage", missing, LICENSED, off, /UmbSocial\.Engage package isn't installed/],
  ["engage without Pro's licence", "engage", proLess, UNLICENSED as never, unlicensed, /needs an UmbSocial Pro licence/],
  ["engage without its own licence", "engage", engageLess, LICENSED, unlicensed, /doesn't include the Engage add-on/],
  ["engage usable", "engage", coded(404, "campaign.not_found"), LICENSED, usable, null],
  ["engage not allowed to check, licensed", "engage", forbidden, LICENSED, { installed: true, licensed: null, usable: null }, /its licence couldn't be checked/],
  ["engage not allowed to check, unlicensed", "engage", forbidden, UNLICENSED as never, unlicensed, /needs an UmbSocial Pro licence/],
  ["engage not answering", "engage", plain(502), LICENSED, unknown, /status 502/],
];

const COLLECTIONS: Record<AddOn, string> = { pro: "social-pro", ai: "social-ai", engage: "social-engage" };
const verbs = ["View", "Write", "Schedule", "Approve", "UseAi", "Resolve", "ManageSettings"];
const everyone = { allowedSections: ["UmbSocial.Section"], fallbackPermissions: verbs.map((v) => `UmbSocial.${v}`) };

async function signIn(edition: unknown) {
  server.use(
    http.get(USER_PATH, () => HttpResponse.json(everyone)),
    http.get(EDITION_PATH, () => HttpResponse.json(edition as never)),
  );
  jest.spyOn(console, "error").mockImplementation(() => {});
  return startSession();
}

const counts = () => {
  const all = toolsFor(allCollections, everyone, applyDefaultOffSlices(DEFAULT_COLLECTION_CONFIG, new Set(DEFAULT_OFF_SLICES)));
  return Object.fromEntries(Object.entries(COLLECTIONS).map(([addOn, name]) => [addOn, all.filter((t) => t.collectionName === name).length]));
};

afterEach(() => {
  clearSession();
  jest.restoreAllMocks();
});

describe("what each add-on is", () => {
  it.each(CASES)("%s", async (_name, addOn, reply, edition, expected, reason) => {
    answer(addOn, reply);

    const state = (await readAddOns(edition))[addOn];

    expect(state).toMatchObject(expected);
    if (reason) expect(state.reason).toMatch(reason);
    else expect(state.reason).toBeNull();
    // A user who may not ask is never told the package is missing.
    if (reply === forbidden) expect(state.installed).toBe(true);
  });
});

describe("which tools an add-on registers", () => {
  it("each_add_on_is_gated_on_its_own", async () => {
    await signIn(LICENSED);
    const all = counts();
    expect(all).toEqual({ pro: 44, ai: 6, engage: 7 });

    for (const addOn of ["pro", "ai", "engage"] as const) {
      for (const reply of [missing, addOn === "engage" ? engageLess : proLess]) {
        clearSession();
        server.resetHandlers();
        answer(addOn, reply);
        await signIn(LICENSED);
        expect(counts()).toEqual({ ...all, [addOn]: 0 });
      }
    }
  });

  it("every_combination_of_missing_add_ons", async () => {
    const addOns = ["pro", "ai", "engage"] as const;
    for (let mask = 0; mask < 8; mask++) {
      clearSession();
      server.resetHandlers();
      const gone = addOns.filter((_, i) => mask & (1 << i));
      for (const addOn of gone) answer(addOn, missing);
      await signIn(LICENSED);
      const now = counts();
      for (const addOn of addOns) expect(now[addOn] === 0).toBe(gone.includes(addOn));
    }
  });

  it("ai_that_isnt_set_up_leaves_only_what_sets_it_up", async () => {
    answer("ai", json({ configured: false, startFromLink: false }));
    await signIn(LICENSED);

    expect(socialAiCollection.tools(everyone).map((t) => t.name)).toEqual(["get-ai-status", "get-ai-settings", "update-ai-settings"]);
  });

  it("a_reason_is_logged_at_start", async () => {
    answer("engage", engageLess);
    await signIn(LICENSED);

    expect(jest.mocked(console.error).mock.calls.map((c) => String(c[0]))).toEqual([expect.stringMatching(/doesn't include the Engage add-on/)]);
  });
});

describe("get-social-edition", () => {
  it("says_for_each_add_on_whether_it_can_be_used_and_why_not", async () => {
    answer("ai", missing);
    answer("engage", engageLess);
    await signIn(LICENSED);

    const { addOns } = (await callTool(getSocialEdition)).structuredContent as { addOns: Record<string, { reason: string | null }> };

    expect(addOns.pro).toEqual(usable);
    expect(addOns.ai).toMatchObject(off);
    expect(addOns.ai!.reason).toMatch(/UmbSocial\.AI package isn't installed/);
    expect(addOns.engage).toMatchObject(unlicensed);
  });
});

describe("an add-on that goes while the server runs", () => {
  const tool = (collection: ToolCollectionExport<any>, name: string) => collection.tools(undefined).find((t) => t.name === name)!;

  it("a_package_removed_says_so", async () => {
    server.use(http.get(`${PRO}/templates`, missing), http.get(PATHS.ai, missing), http.get(`${PRO}/engage/status`, missing));
    for (const [t, name] of [
      [listTemplates, "UmbSocial.Pro"],
      [tool(socialAiCollection, "get-ai-status"), "UmbSocial.AI"],
      [tool(socialEngageCollection, "get-engage-status"), "UmbSocial.Engage"],
    ] as const) {
      const body = errorBody(await callTool(t)) as { codes: string[]; hint: string };
      expect(body.codes).toEqual(["addon.not_installed"]);
      expect(body.hint).toBe(`The ${name} package isn't installed on this site.`);
    }
  });

  it("a_licence_lapsed_says_which", async () => {
    server.use(http.get(`${PRO}/engage/status`, engageLess), http.get(PATHS.ai, proLess));
    const engage = errorBody(await callTool(tool(socialEngageCollection, "get-engage-status"))) as { hint: string };
    const ai = errorBody(await callTool(tool(socialAiCollection, "get-ai-status"))) as { hint: string };
    expect(engage.hint).toMatch(/UmbSocial Engage/);
    expect(ai.hint).toMatch(/UmbSocial Pro/);
  });

  it("a_missing_thing_with_a_code_isnt_a_missing_package", async () => {
    server.use(http.get(`${PRO}/templates`, coded(404, "template.not_found")));
    const body = errorBody(await callTool(listTemplates)) as { codes: string[] };
    expect(body.codes).toEqual(["template.not_found"]);
  });
});
