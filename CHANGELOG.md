# Changelog

All notable changes to `@umbhost/umbsocial-mcp` are listed here. Versions follow [semantic versioning](https://semver.org). The major version is the Umbraco major. Releases for Umbraco 17 are published under the `lts-17` dist-tag, and prereleases under `beta`.

## 17.0.0-rc1

The first release candidate, for UmbSocial 17's. The same as 17.0.0-beta2.

## 17.0.0-beta2

The assistant can do what a person can in the backoffice, apart from putting posts on the calendar: 100 tools, up from 38.

- **On by default, with the permission:** write, duplicate and delete templates, leave a page out of automatic posts, choose which links are shortened, preview UTM tags, addresses of pages and media, links that follow a page, image framing, the posting streak, the history export, and reading how the site is set up. `list-posts` also filters by a page's planned release and by Published's history.
- **UmbSocial AI and UmbSocial Engage:** draft, rewrite and alt text with the site's own AI, and what posts brought to the site.
- **Off by default:** `manage` (change and delete campaigns, tags, hashtag groups and short links) and `settings` (channels, schedules, page mappings, approvals, links, AI and automatic posting). Turn them on with `UMBSOCIAL_ENABLE_SLICES`.
- **Add-ons:** a tool registers only when the add-on it needs is installed, licensed and, for AI, set up. `get-social-edition` says so for Pro, AI and Engage separately, with the reason when one can't be used.
- **Automatic posting** can be set up only to leave a draft or a post awaiting approval. A person sets up posts that go straight on the calendar.

## 17.0.0-beta1

- The version number follows the Umbraco major: this is the release after 1.0.0-beta1, for Umbraco 17.
- `hono` and its Node server are at the versions that fix two moderate advisories.

## 1.0.0-beta1

The first release, for Umbraco 17.

- **Reading:** the edition and the API user's Social permissions, channels and their limits, posts (by time, status, channel, campaign, page or tag), a post with its history, views and interactions, the posting schedule and its free slots, campaigns, and what a post about a page needs.
- **Writing drafts:** check, create, update and delete drafts, create a campaign, and read a link card. Every post an API user writes is marked as written with AI, and a person reviews it before it can be scheduled. Updating and deleting leave a post on the calendar, or one already sent, as it is.
- **UmbSocial Pro**, when the site is licensed: submit a draft for approval, templates (and a draft from a template), tags, saved hashtags, a post's UTM values, short links and their clicks, and how a channel's views and interactions changed over time.
- **Off by default:** approving and returning posts (`approve`), and retrying a channel or marking it as published (`resolve`). Turn them on with `UMBSOCIAL_ENABLE_SLICES`.
- **Media and page keys** from Umbraco's CMS Developer MCP, chained read-only and limited to eight tools that browse and search media and documents (`cms--`). It is a pinned dependency, locked with the published `npm-shrinkwrap.json`, and runs from where it was installed.
- **Confirmations:** the destructive tools ask the person first, or, in a client that can't ask, need `confirm: true`.
- **Settings file:** a `.env` file is read only from the path in `UMBSOCIAL_ENV_FILE`.
