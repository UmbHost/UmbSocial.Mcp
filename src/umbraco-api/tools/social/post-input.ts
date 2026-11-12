/**
 * The inputs every post tool shares. `create-post` and `check-post` take the
 * create shape (text and channels required); `update-post` takes the update
 * shape, where everything is optional and `null` removes a field.
 *
 * There is no `when`: every save is a draft, and a person puts it on the
 * calendar. Free text is marked `[raw]` so the SDK's sanitiser lets through
 * what posts are made of (`&`, `?`, `%20` in a link); it all goes in a JSON
 * body, never a URL path.
 */

import { z } from "zod";
import { RAW_FIELD_MARKER } from "@umbraco-cms/mcp-server-sdk";

/** The page delays the site takes (`PageRelease.Delays`): minutes after the page goes live. */
export const PAGE_DELAYS = [0, 60, 1440] as const;
export type PageDelay = (typeof PAGE_DELAYS)[number];

const raw = (description: string) => `${description} ${RAW_FIELD_MARKER}`;
const https = () => z.url({ protocol: /^https$/ });

const pageDelay = z
  .union([z.literal(0), z.literal(60), z.literal(1440)])
  .describe(
    "With pageKey: minutes after the page goes live that the post goes out, 0, 60 or 1440. Leave it out for the queue's next free slot. A person still chooses \"When the page goes live\" for it to wait for the page.",
  );

const channelOptions = z
  .object({
    firstComment: z.string().nullish().describe(raw("A first comment, posted under the post.")),
    contentWarning: z.string().nullish().describe(raw("A content warning the post is shown behind.")),
    threadParts: z.array(z.string().describe(raw("One part."))).nullish().describe("Further posts, threaded after the text."),
    pinTitle: z.string().nullish().describe(raw("The pin's title (Pinterest).")),
    callToAction: z.string().nullish().describe(raw("The call-to-action button.")),
  })
  .describe("Only what the channel's network supports (see list-channels' limits.options); anything else is refused.");

export type ChannelOptionsInput = z.infer<typeof channelOptions>;

const createShape = {
  text: z.string().min(1).describe(raw("The post's text, used on every channel without its own.")),
  channelKeys: z.array(z.guid()).min(1).describe("The channels to post to, from list-channels."),
  channelTexts: z
    .record(z.guid(), z.string().describe(raw("That channel's own text.")))
    .optional()
    .describe("A channel's own text in place of `text`, by channel key. Each must be one of channelKeys."),
  options: z
    .record(z.guid(), channelOptions)
    .optional()
    .describe("Extras by channel key. Each must be one of channelKeys."),
  linkUrl: https().optional().describe(raw("The link the post shares (https). preview-link reads its card.")),
  linkTitle: z.string().optional().describe(raw("The link card's title.")),
  linkDescription: z.string().optional().describe(raw("The link card's description.")),
  linkImageUrl: https()
    .optional()
    .describe(raw("The link card's image (https): take it from preview-link's imageUrl for the same link.")),
  mediaKey: z.guid().optional().describe("The image, a media key from the cms media tools."),
  imageAltText: z.string().optional().describe(raw("The image's alt text.")),
  campaignKey: z.guid().optional().describe("The campaign, from list-campaigns or create-campaign."),
  pageKey: z
    .guid()
    .optional()
    .describe("The Umbraco page the post is about, a document key from the cms document tools or get-page-share."),
  pageCulture: z.string().optional().describe("With pageKey: the page's language, such as en-GB; none for a page that doesn't vary by language."),
  pageDelayMinutes: pageDelay.optional(),
};

export const postCreateShape = createShape;

export const postUpdateShape = {
  text: createShape.text.optional(),
  channelKeys: createShape.channelKeys
    .optional()
    .describe("The channels to post to, from list-channels. Replaces the set; a channel that stays keeps its own text and options."),
  channelTexts: z
    .record(z.guid(), z.string().nullable().describe(raw("That channel's own text, or null to use `text`.")))
    .optional()
    .describe("A channel's own text, by channel key; null removes it. Each must be one of the post's channels."),
  options: z
    .record(z.guid(), channelOptions)
    .optional()
    .describe("Extras by channel key; each field given replaces that field, and null removes it. Each must be one of the post's channels."),
  linkUrl: https().nullable().optional().describe(raw("The link (https); null removes it. A new link clears the old card's title, description and image.")),
  linkTitle: z.string().nullable().optional().describe(raw("The link card's title; null removes it.")),
  linkDescription: z.string().nullable().optional().describe(raw("The link card's description; null removes it.")),
  linkImageUrl: https()
    .nullable()
    .optional()
    .describe(raw("The link card's image (https), from preview-link's imageUrl for the same link; null removes it.")),
  mediaKey: z.guid().nullable().optional().describe("The image, a media key from the cms media tools; null removes it. A new image clears the old alt text and crops."),
  imageAltText: z.string().nullable().optional().describe(raw("The image's alt text; null removes it.")),
  campaignKey: z.guid().nullable().optional().describe("The campaign, from list-campaigns or create-campaign; null removes it."),
  pageKey: z
    .guid()
    .nullable()
    .optional()
    .describe("The Umbraco page, a document key from the cms document tools or get-page-share; null unties the post. A new page clears the old language and delay."),
  pageCulture: z.string().nullable().optional().describe("With a page: its language, such as en-GB."),
  pageDelayMinutes: pageDelay.nullable().optional(),
};

/** What a tool may change: any of the update shape. */
export interface PostInputArgs {
  text?: string;
  channelKeys?: string[];
  channelTexts?: Record<string, string | null>;
  options?: Record<string, ChannelOptionsInput>;
  linkUrl?: string | null;
  linkTitle?: string | null;
  linkDescription?: string | null;
  linkImageUrl?: string | null;
  mediaKey?: string | null;
  imageAltText?: string | null;
  campaignKey?: string | null;
  pageKey?: string | null;
  pageCulture?: string | null;
  pageDelayMinutes?: PageDelay | null;
}
