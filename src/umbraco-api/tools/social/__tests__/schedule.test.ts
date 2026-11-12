import { describe, expect, it } from "@jest/globals";
import { callTool, errorBody } from "../../../../session/__tests__/helpers.js";
import { REFUSAL_HINTS } from "../../../../session/refusals.js";
import listFreeSlots from "../get/list-free-slots.js";

describe("list-free-slots", () => {
  it("list_free_slots_refuses_more_than_42_days_without_calling", async () => {
    // No handler for schedule/slots: a request would fail the test.
    const result = await callTool(listFreeSlots, { fromUtc: "2026-11-01T00:00:00Z", toUtc: "2026-12-13T00:00:01Z" });

    expect(errorBody(result)).toEqual({
      codes: ["schedule.range_too_long"],
      status: 400,
      hint: REFUSAL_HINTS["schedule.range_too_long"],
    });
  });
});
