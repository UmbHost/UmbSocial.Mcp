import { describe, expect, it } from "@jest/globals";
import { http, HttpResponse } from "msw";
import { server } from "../../../../mocks/server.js";
import { callTool, errorBody } from "../../../../session/__tests__/helpers.js";
import { REFUSAL_HINTS } from "../../../../session/refusals.js";
import listFreeSlots from "../get/list-free-slots.js";
import { API } from "./helpers/session.js";

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

  it("list_free_slots_takes_exactly_42_days", async () => {
    let query: URLSearchParams | undefined;
    server.use(
      http.get(`${API}/schedule/slots`, ({ request }) => {
        query = new URL(request.url).searchParams;
        return HttpResponse.json([]);
      }),
    );

    const result = await callTool(listFreeSlots, { fromUtc: "2026-11-01T00:00:00Z", toUtc: "2026-12-13T00:00:00Z" });

    expect(result.isError).toBeFalsy();
    expect(query?.get("fromUtc")).toBe("2026-11-01T00:00:00.000Z");
    expect(query?.get("toUtc")).toBe("2026-12-13T00:00:00.000Z");
  });

  it("list_free_slots_refuses_an_end_before_the_start", async () => {
    // No handler: a request would fail the test.
    for (const toUtc of ["2026-11-01T00:00:00Z", "2026-10-31T23:00:00Z"]) {
      const result = await callTool(listFreeSlots, { fromUtc: "2026-11-01T00:00:00Z", toUtc });
      expect(errorBody(result)).toMatchObject({ codes: ["schedule.range_too_long"], status: 400 });
    }
  });

  it("slot_times_end_with_z", async () => {
    server.use(
      http.get(`${API}/schedule/slots`, () =>
        HttpResponse.json([
          { utc: "2026-11-02T09:00:00", taken: false },
          { utc: "2026-11-02T13:00:00Z", taken: true },
        ]),
      ),
    );

    const result = await callTool(listFreeSlots, { fromUtc: "2026-11-01T00:00:00Z", toUtc: "2026-11-08T00:00:00Z" });

    expect(result.structuredContent).toEqual({
      items: [
        { utc: "2026-11-02T09:00:00Z", taken: false },
        { utc: "2026-11-02T13:00:00Z", taken: true },
      ],
    });
  });
});
