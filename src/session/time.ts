/**
 * Time values. The site returns some `*Utc` values without a zone
 * (`2026-11-15T10:00:00`); they are UTC, and the tools give them back with a
 * `Z` so an assistant can't read them as local time.
 *
 * Hand-rolled because the SDK lacks a date helper.
 */

const HAS_ZONE = /(Z|[+-]\d{2}:?\d{2})$/i;

/** An ISO date-time as UTC with a `Z`; a value with an offset is converted. */
export function toUtcIso(value: string): string {
  if (!HAS_ZONE.test(value)) return `${value}Z`;
  if (/Z$/i.test(value)) return value.replace(/z$/, "Z");
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

/** A copy with every string field named `*Utc` (nested too) given a `Z`. */
export function withUtcTimes<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => withUtcTimes(item)) as T;
  if (!value || typeof value !== "object") return value;
  const result: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(value)) {
    result[key] = key.endsWith("Utc") && typeof field === "string" ? toUtcIso(field) : withUtcTimes(field);
  }
  return result as T;
}

/** An input date-time, sent to the site as ISO in UTC. */
export function toUtcParam(value: string): string {
  return new Date(value).toISOString();
}
