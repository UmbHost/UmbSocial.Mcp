/**
 * What the Pro tools share: the sentence that says they need Pro, and a
 * clamped list page.
 */

export const NEEDS_PRO = "Needs UmbSocial Pro.";

/** A list page's `skip` and `take`, clamped: a cursor carries its own take, so the schema's maximum doesn't hold. */
export function pageOf(skip: number | undefined, take: number | undefined, pageSize: number, maxTake: number) {
  return { skip: Math.max(skip ?? 0, 0), take: Math.min(Math.max(take ?? pageSize, 1), maxTake) };
}
