/**
 * The add-ons: for Pro, AI and Engage separately, whether the site has the
 * package and whether its licence allows it. Read at start-up (a tool registers
 * only when its add-on is usable) and again for get-social-edition.
 *
 * The site has no endpoint that lists its packages, so each is asked for by a
 * call it answers itself, and how the call is refused tells the cases apart:
 *
 * - 404 without refusal codes: the route isn't there, so the package isn't.
 * - `licence.pro_required` / `licence.engage_required`: there, but unlicensed.
 * - 403 without codes: there, but this user may not make the call. Never "not installed".
 * - anything else the add-on answers: there and licensed.
 *
 * Engage's status answers 200 without an Engage licence, so a campaign's
 * figures are asked for instead, for a campaign that can't exist: the licence
 * is checked before the campaign. What can't be told: whether Umbraco Engage's
 * own licence is valid, which no UmbSocial endpoint reports. (Umbraco Engage
 * itself comes with the add-on's package.)
 */

import { UmbracoApiError, type CAPTURE_RAW_HTTP_RESPONSE, type HttpResponse } from "@umbraco-cms/mcp-server-sdk";
import type { AiStatusResult } from "../umbraco-api/api/generated/umbSocialApi.js";
import type { Edition } from "./edition.js";
import { callSocial, type SocialApi } from "./refusals.js";

export const ADD_ONS = ["pro", "ai", "engage"] as const;
export type AddOn = (typeof ADD_ONS)[number];

/** Null in a field: it couldn't be told, and `reason` says why. */
export interface AddOnState {
  installed: boolean | null;
  licensed: boolean | null;
  /** AI only: whether an AI profile is set up. */
  configured?: boolean | null;
  /** Null: this user lacks the permission to check, so the site decides each call. */
  usable: boolean | null;
  /** Why it isn't usable, or why that couldn't be told. */
  reason: string | null;
}

export type AddOnStates = Record<AddOn, AddOnState>;

const NAMES: Record<AddOn, string> = { pro: "UmbSocial Pro", ai: "UmbSocial AI", engage: "UmbSocial Engage" };
const PACKAGES: Record<AddOn, string> = { pro: "UmbSocial.Pro", ai: "UmbSocial.AI", engage: "UmbSocial.Engage" };
const PROBE_PERMISSION: Record<AddOn, string> = {
  pro: "View, Write or Manage settings",
  ai: "Use AI",
  engage: "View, Write or Manage settings",
};

export const NOT_INSTALLED = "addon.not_installed";
export const notInstalled = (addOn: AddOn) => `The ${PACKAGES[addOn]} package isn't installed on this site.`;

const PRO_REQUIRED = "licence.pro_required";
const ENGAGE_REQUIRED = "licence.engage_required";
const VERB_MISSING = "verb.missing";
const NO_CAMPAIGN = "00000000-0000-0000-0000-000000000000";

const NOT_LICENSED: Record<AddOn, string> = {
  pro: "UmbSocial Pro is installed, but the site isn't licensed for it.",
  ai: "UmbSocial AI is installed, but it needs an UmbSocial Pro licence, which the site doesn't have.",
  engage: "UmbSocial Engage is installed, but it needs an UmbSocial Pro licence, which the site doesn't have.",
};
const NO_ENGAGE_LICENCE = "UmbSocial Engage is installed, but the site's UmbSocial licence doesn't include the Engage add-on.";
const NOT_CONFIGURED =
  "UmbSocial AI is installed and licensed, but not set up. Someone with Manage settings sets it up in Social's AI settings.";

const PROBES: Record<AddOn, (api: SocialApi, raw: typeof CAPTURE_RAW_HTTP_RESPONSE) => Promise<unknown>> = {
  pro: (api, raw) => api.listTags({ skip: 0, take: 1 }, raw),
  ai: (api, raw) => api.getAiStatus(raw),
  engage: (api, raw) => {
    const today = new Date().toISOString().slice(0, 10);
    return api.getEngageCampaignFigures(NO_CAMPAIGN, { from: today, to: today }, raw);
  },
};

function problemOf(error: unknown): { status?: number; codes: string[] } {
  const details = (error as { problemDetails?: { status?: unknown; codes?: unknown } } | null)?.problemDetails;
  return {
    status: typeof details?.status === "number" ? details.status : undefined,
    codes: Array.isArray(details?.codes) ? (details.codes as string[]) : [],
  };
}

async function readAddOn(addOn: AddOn, edition: Edition): Promise<AddOnState> {
  const state = (fields: Partial<AddOnState>): AddOnState => ({
    installed: true,
    licensed: true,
    ...(addOn === "ai" ? { configured: null } : {}),
    usable: true,
    reason: null,
    ...fields,
  });
  const unlicensed = (reason: string) => state({ licensed: false, usable: false, reason });

  let answer: HttpResponse<unknown>;
  try {
    answer = await callSocial<unknown>(PROBES[addOn]);
  } catch (error) {
    const { status, codes } = problemOf(error);
    if (codes.includes(PRO_REQUIRED)) return unlicensed(NOT_LICENSED[addOn]);
    if (codes.includes(ENGAGE_REQUIRED)) return unlicensed(NO_ENGAGE_LICENCE);
    if (codes.includes(VERB_MISSING)) {
      if (!edition.isLicensed) return unlicensed(NOT_LICENSED[addOn]);
      const what = addOn === "ai" ? "whether it is set up" : "its licence";
      return state({
        // Engage needs its own licence on top of Pro's, which only the refused call could tell.
        licensed: addOn === "engage" ? null : true,
        usable: addOn === "pro" ? true : null,
        reason: `${NAMES[addOn]} is installed, but this API user lacks the Social ${PROBE_PERMISSION[addOn]} permission, so ${what} couldn't be checked.`,
      });
    }
    if (status === 404 && codes.length === 0) {
      return state({ installed: false, licensed: null, usable: false, reason: notInstalled(addOn) });
    }
    if (codes.length === 0 || status === undefined || status >= 500 || status === 401) {
      const why = status === undefined ? "" : ` (status ${status})`;
      return state({
        installed: null,
        licensed: null,
        usable: false,
        reason: `The site didn't say whether ${NAMES[addOn]} is installed${why}.`,
      });
    }
    // The add-on answered with a refusal of its own (Engage: campaign.not_found), so it is there and licensed.
    return state({});
  }

  if (addOn === "ai") {
    const configured = (answer.data as AiStatusResult).configured;
    return configured ? state({ configured }) : state({ configured, usable: false, reason: NOT_CONFIGURED });
  }
  return state({});
}

/** Every add-on's state, asked for now. */
export async function readAddOns(edition: Edition): Promise<AddOnStates> {
  const [pro, ai, engage] = await Promise.all(ADD_ONS.map((addOn) => readAddOn(addOn, edition)));
  return { pro: pro!, ai: ai!, engage: engage! };
}

let addOns: AddOnStates | null = null;

export async function loadAddOns(edition: Edition): Promise<AddOnStates> {
  addOns = await readAddOns(edition);
  return addOns;
}

/** The states read at start-up; null when they weren't (offline listings, type generation, no section). */
export function currentAddOns(): AddOnStates | null {
  return addOns;
}

export function clearAddOns(): void {
  addOns = null;
}

/**
 * An add-on's tools: none when it was read as not usable. The `setUp` tools
 * need only the package and its licence, so they're there to configure it.
 */
export function gateAddOn<T>(addOn: AddOn, tools: T[], setUp: T[] = [], states: AddOnStates | null = currentAddOns()): T[] {
  const state = states?.[addOn];
  if (!state || state.usable !== false) return [...setUp, ...tools];
  return state.installed && state.licensed ? setUp : [];
}

/**
 * `callSocial` for an add-on's endpoints: a 404 without codes means its package
 * has gone since this server started, and the refusal says so.
 */
function callAddOn(addOn: AddOn) {
  return async <T>(op: Parameters<typeof callSocial>[0]): Promise<HttpResponse<T>> => {
    try {
      return await callSocial<T>(op);
    } catch (error) {
      const { status, codes } = problemOf(error);
      if (status === 404 && codes.length === 0) {
        throw new UmbracoApiError({ codes: [NOT_INSTALLED], status, hint: notInstalled(addOn) });
      }
      throw error;
    }
  };
}

export const callPro = callAddOn("pro");
export const callAi = callAddOn("ai");
export const callEngage = callAddOn("engage");
