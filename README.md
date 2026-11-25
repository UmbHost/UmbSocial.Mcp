# UmbSocial MCP server

`@umbhost/umbsocial-mcp` lets an AI assistant work with [UmbSocial](https://docs.umb.social) on an Umbraco 17 site. The assistant can read the Social calendar, channels and campaigns, and write **draft** posts. A person reviews every draft in the Umbraco backoffice before it can go on the calendar.

It runs on your machine over stdio and signs in to the site as an Umbraco **API user**, using that user's client credentials. It calls only UmbSocial's own management API.

**Release candidate.** The package is a prerelease, published under npm's `beta` dist-tag. See [CHANGELOG.md](CHANGELOG.md).

## How it differs from the docs MCP

UmbSocial's documentation has its own MCP server at `https://docs.umb.social/mcp`. That one searches and reads the docs, needs no site and no sign-in, and changes nothing.

This server works on **your site**: it reads your posts and writes drafts as the API user you give it. Use the docs MCP to learn how UmbSocial works, and this one to work with your own Social calendar. You can connect both.

## Requirements

- Node.js 22.3 or later.
- An Umbraco 17 site with UmbSocial installed. UmbSocial Pro adds more tools, such as approvals, templates and tags, when the site is licensed.
- An Umbraco **API user** with client credentials, in a user group that has the **Social** section and the Social permissions you want the assistant to have. Start with **View** and **Write**.
  - To tie posts to pages and pick images, the group also needs the **Content** and **Media** sections, start nodes, and Umbraco's **Browse** permission on those pages.
  - Give each person their own API user. Everyone using one API user shares its drafts and its rate limits.

The full set-up is in the docs: [The UmbSocial MCP server](https://docs.umb.social/17/getting-started/mcp-server/).

## Configuration

For Claude Code, in `.mcp.json`:

```json
{
  "mcpServers": {
    "umbsocial": {
      "command": "npx",
      "args": ["-y", "@umbhost/umbsocial-mcp@beta"],
      "env": {
        "UMBRACO_BASE_URL": "https://www.example.com",
        "UMBRACO_CLIENT_ID": "umbraco-back-office-social-assistant",
        "UMBRACO_CLIENT_SECRET": "${UMBSOCIAL_CLIENT_SECRET}"
      }
    }
  }
}
```

Claude Code fills `${UMBSOCIAL_CLIENT_SECRET}` from your environment, so the secret stays out of the file. The server never reads a `.env` file from its working directory, which is usually your project folder. To keep the settings in a file, set `UMBSOCIAL_ENV_FILE` to its full path; [.env.example](.env.example) lists every variable.

| Variable | Meaning |
|---|---|
| `UMBRACO_BASE_URL` | The site's address. It must use https; plain http is allowed only for `localhost`, `127.0.0.1` and `[::1]`. |
| `UMBRACO_CLIENT_ID`, `UMBRACO_CLIENT_SECRET` | The API user's client credentials. |
| `UMBSOCIAL_ENV_FILE` | The full path of a file holding these variables, read at start. No other `.env` file is read. |
| `UMBSOCIAL_ENABLE_SLICES` | Turns on tools that are off by default: `approve` (approve and return posts), `resolve` (retry a channel, or mark it as published), `manage` (change and delete campaigns, tags, hashtag groups and short links) and `settings` (channels, schedules, page mappings, approvals, links, AI and automatic posting). |
| `DISABLE_MCP_CHAINING` | `true` to leave out the chained CMS server (below) and its `cms--` tools. |
| `UMBRACO_TOOL_MODES`, `UMBRACO_INCLUDE_SLICES`, `UMBRACO_EXCLUDE_TOOLS` and the rest | The SDK's tool filters. `UMBRACO_READONLY=true` keeps only the tools that read. |

The docs have the configuration for Claude Desktop, Cursor and VS Code in [The UmbSocial MCP server](https://docs.umb.social/17/getting-started/mcp-server/), every variable in [MCP server configuration](https://docs.umb.social/17/reference/mcp-configuration/), and every tool in [MCP tools](https://docs.umb.social/17/reference/mcp-tools/).

### A local site with a self-signed certificate

Trust the certificate; never turn TLS checks off (`NODE_TLS_REJECT_UNAUTHORIZED=0`). Point `NODE_EXTRA_CA_CERTS` at the certificate in PEM format, or, if the certificate is in your system's store, add `--use-system-ca` to `NODE_OPTIONS`. `--use-system-ca` needs Node.js 22.15 or later.

## The chained CMS server

Posts refer to Umbraco media and pages by key, so by default this server starts Umbraco's own [CMS Developer MCP](https://www.npmjs.com/package/@umbraco-cms/mcp-dev) alongside it, to find those keys. Its tools appear with a `cms--` prefix. It runs:

- **read-only** (`UMBRACO_READONLY=true`), limited to eight tools that browse and search media and documents;
- as the same API user, so it sees only that user's start nodes;
- from a **pinned, shrinkwrapped** copy: `@umbraco-cms/mcp-dev` is an exact dependency of this package (17.6.12), and the published `npm-shrinkwrap.json` fixes every package beneath it, so you install the versions this release was tested with. It is started with Node from where it was installed; nothing is downloaded when the server starts.

This server registers only those eight tools, whatever the chained server lists, and logs the name of any other tool it drops.

`DISABLE_MCP_CHAINING=true` turns it off. The Social tools still work; the assistant then needs media and page keys from you.

## Safety

- **The site enforces the AI rule.** Every post an API user creates or changes is marked as written with AI, and an API user never counts as a reviewer. A person must review an AI-written post in the backoffice before it can be scheduled. No tool can get round this, and no tool result suggests trying.
- **Drafts only.** The writing tools save drafts, and automatic posting can be set up only to leave a draft or a post awaiting approval. `update-post`, `delete-post`, `set-post-utm`, `set-post-tags`, `set-post-shortening` and the AI tools change only drafts and posts awaiting approval: a post on the calendar, or one already sent, is left as a person left it.
- **Confirmations.** Every tool that deletes, merges, approves, sends again, weakens review or changes where links and channels lead asks the person first when the client can ask. When it can't, they go ahead only if the assistant passes `confirm: true`, which it should do only after the person has said yes; otherwise they're refused with `confirmation.required`.
- **Off by default.** The `approve`, `resolve`, `manage` and `settings` tools act on review, on live networks or on what the whole site shares, so they're registered only when `UMBSOCIAL_ENABLE_SLICES` names them (naming one in `UMBRACO_INCLUDE_TOOLS` isn't enough), and only for a user with the matching permission.
- **The API user's permissions decide.** A tool is listed only when the API user's group has a permission that can use it, and an add-on's tools (Pro, AI, Engage) only when the site has it, licensed and, for AI, set up; `get-social-edition` says for each whether it can be used, and why not. The site checks every call again.
- **Secrets.** The client secret and access tokens never appear in tool results, errors or logs. Keep the file `UMBSOCIAL_ENV_FILE` names out of source control and out of the project folder.
- **Use the site's final address.** The token request follows redirects (the SDK's default), and a 307 or 308 redirect sends the form again, client secret included, to the new address. Set `UMBRACO_BASE_URL` to the address the site answers on, with no redirect from apex to `www` or the like, and don't put a proxy in front that redirects the token path.
- **An assistant with a shell gets round the client-side gates.** The off-by-default slices, the confirmations and the tool filters are kept by this server. An assistant that can run commands (Claude Code, for one) can read the client secret from its environment and call the site's API directly. Against such an assistant only the site's own checks hold: give the API user's group no permission you wouldn't give the assistant.
- **Start on a staging site.** Try it against a copy of your site before you connect it to the live one.

## Development

```bash
npm ci
npm run compile       # type-check
npm test              # unit tests, against mocks only
npm run build         # bundle, then generate the tool types
npm run tools-table   # regenerate docs/tools-table.md and docs/refusal-hints.md
UMBSOCIAL_LIVE=1 npm run test:live   # against running test sites; see tests/live/README.md
```

`npm test` fails when `docs/tools-table.md` or `docs/refusal-hints.md` no longer matches the code. Run `npm run tools-table`, then copy the tables into the docs site's [MCP tools](https://docs.umb.social/17/reference/mcp-tools/) and [Error codes](https://docs.umb.social/17/reference/error-codes/) pages.

The generated API client is built from a committed Swagger snapshot. See [CLAUDE.md](CLAUDE.md) for how to regenerate it.

### Before bumping a dependency

- **Every dependency** is pinned exactly, and `npm-shrinkwrap.json` (published with the package) replaces `package-lock.json`. Resolve with `npm install --before=<a date at least two weeks ago>`, so nothing newer than two weeks is locked.
- **`@umbraco-cms/mcp-dev`** (`CMS_MCP_VERSION` in `src/config/mcp-servers.ts`, which must match `package.json`): check the environment variables the new version reads against the filter variables blanked for it (`INHERITED_FILTERS_BLANKED`), so none of this server's own filters reaches it. Check that the eight tools in `CMS_TOOLS` still exist under those names, then rerun the live checks.
- **`@umbraco-cms/mcp-server-sdk`**: `INTROSPECTION_FLAGS` in `src/index.ts` is a copy of the SDK's offline flags (`--list-tools` and the rest), which skip the configuration check. Compare it with the new version's.

### Releasing

`.github/workflows/release.yml` builds, tests and publishes to npm with provenance, under the `lts-17` dist-tag (`beta` for a prerelease), when a `v*` tag matching `package.json`'s version is pushed. It publishes nothing until the owner has chosen how it signs in to npm: npm Trusted Publishing (preferred) or an `NPM_TOKEN` secret. The workflow's header says how to set up each. Run it by hand for a dry run.

## Licence

MIT. See [LICENSE](LICENSE).
