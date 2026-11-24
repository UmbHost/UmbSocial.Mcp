# Changelog

All notable changes to `@umbhost/umbsocial-mcp` are listed here. Versions follow [semantic versioning](https://semver.org). The major version is the Umbraco major. Releases for Umbraco 18 are published under the `umbraco-18` dist-tag, and prereleases under `beta-18`.

## 18.0.0-beta1

The first release for Umbraco 18.

- The same tools as for Umbraco 17, with Umbraco's CMS Developer MCP for Umbraco 18 (18.1.10).
- The version number follows the Umbraco major.
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
