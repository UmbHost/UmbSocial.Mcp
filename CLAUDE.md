# CLAUDE.md

Guidance for AI assistants working on `@umbhost/umbsocial-mcp`, the UmbSocial MCP server.

## Core first (a gate, not a preference)

Use what already exists before writing anything of our own. In this repo, "core" means, in this order:

1. the SDK, `@umbraco-cms/mcp-server-sdk`;
2. Umbraco's template, `@umbraco-cms/create-umbraco-mcp-server`, at the same version as the SDK;
3. the CMS Developer MCP, `@umbraco-cms/mcp-dev` (chained for media and document keys);
4. UmbSocial's own management API (`/umbraco/openapi/umbsocial.json`).

**Before writing code, every task lists the plumbing it needs in a table (need, what it uses, where that was verified).** Verify each row by searching the installed packages in `node_modules`, not from memory. The plan's controller approves the table before coding starts. Hand-rolled code carries a short comment saying what the SDK lacks.

## The AI rule

The site enforces it; this server must never work around it or suggest otherwise.

- Every post an API user creates or edits is AI-written (origin `Ai`), and an API user never counts as a reviewer. A person must review an AI-written post before it goes on the calendar.
- Writing tools save drafts. No tool result tells the assistant to retry with a different `when`, or to publish, after an `ai.needs_review` refusal.
- Every tool that writes post text carries the AI-written notice in its description.
- The `approve` and `resolve` slices are off unless `UMBSOCIAL_ENABLE_SLICES` names them.
- The server holds no Social or Pro business logic: it's a thin client, and the site decides permissions, review and licensing.

## Safety

- Secrets (`UMBRACO_CLIENT_SECRET`, tokens) never appear in tool results, errors or logs.
- Unit tests run against MSW mocks only; a request without a handler fails the test. CI never calls a real site or a model.
- Never run the template's `init` or `discover` subcommands against a site you don't own, and never turn TLS checks off (`NODE_TLS_REJECT_UNAUTHORIZED=0`); trust a dev certificate with `NODE_EXTRA_CA_CERTS` or `--use-system-ca`.
- Pin dependencies to exact versions at least two weeks old, and commit the lock file. The lock file is `npm-shrinkwrap.json` (published, so users get the same versions); resolve with `npm install --before=<at least 14 days ago>`.
- The chained `@umbraco-cms/mcp-dev` is a dependency, started with `process.execPath` from its installed path, never `npx`. Only `CMS_TOOLS` is registered from it.
- A `.env` is read only from `UMBSOCIAL_ENV_FILE`, never from the working directory.

## Commits, publishing and pushing

- Commit messages have **no** `Co-Authored-By` trailer (public repo).
- **Don't publish to npm**, and don't push or add a remote until the owner has created `UmbHost/UmbSocial.Mcp`.
- Branch: `dev/v18` (Umbraco 18; Umbraco 17 is on `dev/v17`).

## Wording

Tool descriptions, the README and docs are fluent British English. Read them back before committing. Tool names are Umbraco's kebab-case verb-noun, and each description names the Social verb it needs.

## Commands

The generated client (`src/umbraco-api/api/generated/`) and the Swagger snapshot it comes from are committed. Never edit them by hand: regenerate.

```bash
npm run compile   # type-check
npm test          # unit tests (MSW)
UMBSOCIAL_LIVE=1 npm run test:live   # live checks against running sites (tests/live/README.md); never in CI
npm run build     # tsup, then the SDK's tool-types generator
npm run generate  # the client from the committed Swagger snapshot (no site needed)
npm run tools-table  # docs/tools-table.md and docs/refusal-hints.md, for the docs site (a test fails when they are stale)
./scripts/generate.ps1 -SiteUrl https://localhost:44391   # refresh the snapshot from a running site, then generate
```
