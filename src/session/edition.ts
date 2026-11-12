/**
 * The site's edition: whether UmbSocial Pro is licensed. Read once at start-up,
 * before the collections are built.
 */

import type { EditionResponse } from "../umbraco-api/api/generated/umbSocialApi.js";
import { callSocial } from "./refusals.js";

export interface Edition {
  isLicensed: boolean;
  maxChannels: number | null;
  historyDays: number | null;
  channelsUsed: number;
}

let edition: Edition | null = null;

export function toEdition(response: EditionResponse): Edition {
  return {
    isLicensed: response.isLicensed,
    maxChannels: response.maxChannels ?? null,
    historyDays: response.historyDays ?? null,
    channelsUsed: response.channelsUsed,
  };
}

export async function loadEdition(): Promise<Edition> {
  const response = await callSocial<EditionResponse>((api, raw) => api.getEdition(raw));
  edition = toEdition(response.data);
  return edition;
}

/** The edition read at start-up; null when it wasn't (offline listings, type generation, no section). */
export function currentEdition(): Edition | null {
  return edition;
}

export function clearEdition(): void {
  edition = null;
}

/** Pro's tools: none when the site was read as unlicensed. */
export function gatePro<T>(tools: T[], read: Edition | null = currentEdition()): T[] {
  return read && !read.isLicensed ? [] : tools;
}
