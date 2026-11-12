import { describe, expect, it } from "@jest/globals";
import { http, HttpResponse } from "msw";
import { server } from "../../../../mocks/server.js";
import { callTool } from "../../../../session/__tests__/helpers.js";
import listChannels from "../get/list-channels.js";
import getChannel from "../get/get-channel.js";
import { API } from "./helpers/session.js";

const channel = {
  key: "44444444-4444-4444-8444-444444444444",
  name: "Our Mastodon",
  network: "mastodon",
  networkName: "Mastodon",
  isEnabled: true,
  sortOrder: 0,
  automateConnectionId: "conn-secret-id",
  managedAutomationId: "automation-id",
  options: { visibility: "public" },
  isPaused: false,
  metricsAutomationMissing: false,
  limits: {
    maxCharacters: 500,
    urlWeight: 23,
    countsGraphemes: true,
    weightsWideCharacters: false,
    requiresImage: false,
    requiresLinkTitle: false,
    supportsAltText: true,
    link: "inline",
    linkOrImage: false,
    imageWidth: 1200,
    imageHeight: 675,
    options: ["contentWarning"],
    firstCommentMax: 0,
    contentWarningCounts: true,
    maxThreadParts: 10,
    altTextMax: 1500,
    countsEmojiBytes: false,
    titleMax: 0,
    callsToAction: [],
  },
};

describe("channel tools", () => {
  it("channel_output_has_no_automate_ids", async () => {
    server.use(
      http.get(`${API}/channels`, () => HttpResponse.json([channel])),
      http.get(`${API}/channels/:key`, () => HttpResponse.json(channel)),
    );

    const list = await callTool(listChannels);
    const one = await callTool(getChannel, { channelKey: channel.key });

    for (const result of [list, one]) {
      expect(result.isError).toBeFalsy();
      const text = JSON.stringify(result.structuredContent);
      expect(text).not.toContain("automateConnectionId");
      expect(text).not.toContain("managedAutomationId");
      expect(text).not.toContain("conn-secret-id");
    }
    expect(list.structuredContent).toEqual({
      items: [
        {
          key: channel.key,
          name: channel.name,
          network: "mastodon",
          networkName: "Mastodon",
          isEnabled: true,
          isPaused: false,
          limits: {
            maxCharacters: 500,
            supportsAltText: true,
            altTextMax: 1500,
            requiresImage: false,
            options: ["contentWarning"],
            maxThreadParts: 10,
            firstCommentMax: 0,
          },
        },
      ],
    });
    expect((one.structuredContent as { limits: unknown }).limits).toEqual(channel.limits);
  });
});
