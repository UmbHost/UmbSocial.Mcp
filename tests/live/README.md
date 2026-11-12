# Live checks

`tests/live/live.test.ts` runs the built server (`dist/index.js`) against running Umbraco sites, over stdio, as an MCP client would, with no model. It's skipped unless `UMBSOCIAL_LIVE=1`, and it never runs in CI.

```bash
UMBSOCIAL_LIVE=1 npm run test:live   # builds first, then runs tests/live with jest.live.config.ts (no MSW)
```

## What it checks

| Check | User | What it shows |
|---|---|---|
| `tools_list_matches_the_user_and_edition` | View + Write | Core, Pro and the chained `cms--` tools are listed; `approve-post`, `return-post`, `retry-post-target`, `mark-post-target-published` and the ManageSettings-only `list-short-links` aren't; `create-post` and `update-post` take no `when` or `atUtc`. |
| `a_draft_round_trip` | View + Write | Create, get (`origin: "Ai"`), update the text, check, delete. |
| `an_api_user_cannot_put_a_post_on_the_calendar` | All verbs | A direct `PUT` with `when: Queue` and a `POST` with `when: Now` are refused 403 `ai.needs_review`, and the draft is unchanged. The tools can't send `when`, so these two calls go straight to the API. |
| `submit_for_approval_moves_it_to_awaiting_approval` | View + Write | The draft becomes `AwaitingApproval`. |
| `on_the_core_site_no_pro_tools_are_listed` | Core View + Write | None of the `social-pro` tools is listed, and the edition is unlicensed. |
| `cms_media_tool_finds_a_key_create_post_accepts` | View + Write | `cms--get-media-root` and `cms--get-media-children` find an image, and `create-post` takes its key. |
| `a_page_tied_draft_keeps_its_delay` | View + Write | A draft tied to a page (from `cms--get-document-root`) keeps `page.delayMinutes: 60`. |
| `update_post_refuses_a_scheduled_post_without_a_put` | All verbs | `update-post` and `delete-post` refuse a post a person scheduled with `post.not_draft`, and the post is left exactly as it was. |

Every draft a check makes is deleted again at the end. The scheduled post is only read.

## Variables

| Variable | Meaning |
|---|---|
| `UMBSOCIAL_LIVE` | `1` to run the checks. |
| `UMBSOCIAL_LIVE_FULL_URL` | The site with UmbSocial Pro licensed and the mock network. Default `https://localhost:44391`. |
| `UMBSOCIAL_LIVE_CORE_URL` | The site with the free core only. Default `https://localhost:44390`. |
| `UMBSOCIAL_LIVE_VW_CLIENT_ID`, `UMBSOCIAL_LIVE_VW_CLIENT_SECRET` | The Full site's View + Write API user. |
| `UMBSOCIAL_LIVE_ALL_CLIENT_ID`, `UMBSOCIAL_LIVE_ALL_CLIENT_SECRET` | The Full site's API user with all seven Social verbs. |
| `UMBSOCIAL_LIVE_CORE_CLIENT_ID`, `UMBSOCIAL_LIVE_CORE_CLIENT_SECRET` | The core site's View + Write API user. |

A missing variable stops the run with its name. Values are never printed. Each server is started with the slice and filter variables blanked (`UMBSOCIAL_ENABLE_SLICES`, `UMBRACO_TOOL_MODES` and the rest), so your shell's settings don't change what the checks see.

The sites' development certificate must be trusted by Windows (or your system store): the script runs Node with `--use-system-ca`, which needs Node 22.15 or later. Never turn TLS checks off with `NODE_TLS_REJECT_UNAUTHORIZED=0`.

## Set-up on the Full site

Done once, in the backoffice (or through the Management API with an administrator's token):

1. **Pro licensed.** A Debug build in the Development environment on `localhost` is licensed by UmbLicensing's development mode.
2. **The mock network.** In Automate, a connection of type "Mock network (test site)", and a workspace whose allowed connections include it and that has a service account. Without the workspace, channels warn `channel.no_workspace` and scheduling is refused `channel.no_automation`. Then at least one mock channel in Social, with its automation (`POST umbsocial/channels/{key}/automation`, which the Connections screen does for you).
3. **Content and media.** A page (a published one is fine) to be the API users' document start node, and a media folder holding at least one image to be their media start node.
4. **Two user groups**, each with the Content, Media and Social sections, the document and media start nodes above, and Browse (`Umb.Document.Read`) in their default permissions. Without Content, Media and Browse, the page and media checks are refused `page.no_access` and look like bugs.
   - "Social MCP": the View and Write verbs.
   - "Social MCP all": all seven verbs (View, Write, Schedule, Approve, UseAi, Resolve, ManageSettings).
5. **Two API users** (Users › Create › API user), one in each group, each with client credentials. Umbraco requires the client id to start with `umbraco-back-office-`.
6. **Approvals on:** Social › Settings › Approvals (`PUT umbsocial/pro/settings/approvals` with `{ "approvalsEnabled": true }`). They're off on a fresh site, and submitting is then refused `approval.disabled`.
7. **A post a person scheduled.** Signed in as yourself, schedule a post for a time in the next year. The last check finds it with `list-posts` and confirms the tools leave it alone. (The API users can't make one: every post they write needs a person's review first.)

## Set-up on the core site

One group with the Content, Media and Social sections and the View and Write verbs, and one API user in it with client credentials. Nothing else.

## Who runs it, and where

### The owner, against the local test sites

Run against the core test site (`https://localhost:44390`) and the Full test site (`https://localhost:44391`), with your own API users. The URL defaults already point there, so only the credentials need setting. In PowerShell:

```powershell
$env:UMBSOCIAL_LIVE = "1"
$env:UMBSOCIAL_LIVE_VW_CLIENT_ID = "umbraco-back-office-…"
$env:UMBSOCIAL_LIVE_VW_CLIENT_SECRET = "…"
$env:UMBSOCIAL_LIVE_ALL_CLIENT_ID = "umbraco-back-office-…"
$env:UMBSOCIAL_LIVE_ALL_CLIENT_SECRET = "…"
$env:UMBSOCIAL_LIVE_CORE_CLIENT_ID = "umbraco-back-office-…"
$env:UMBSOCIAL_LIVE_CORE_CLIENT_SECRET = "…"
npm run test:live
```

### Agents, against scratch copies

Agents never use the owner's sites on 44390 and 44391. They run the checks against fresh scratch copies instead:

- **The copies.** A Full site (standing in for 44391), copied from the Full repo with its `UmbSocial` and `UmbLicensing` submodules, and a core-only site copied from the core repo's test site. `git archive` of each commit gives a clean copy without touching anyone's checkout.
- **Each copy is its own site:**
  - its own port and `UmbracoApplicationUrl`;
  - its own database (a new SQLite file in the copy);
  - its own `UserSecretsId`, so nobody's secrets are read;
  - an unattended install with a password generated for the run, passed only in the environment (`Umbraco__CMS__Unattended__UnattendedUserPassword`).
- **An administrator's token.** A throwaway composer, kept in the scratch copy only, creates one API user in Administrators with client credentials from the environment (`IUserService.CreateAsync` with `Kind = UserKind.Api`, then `IBackOfficeUserClientCredentialsManager.SaveAsync`). With its token, a script does the set-up above through the Management API.
- **The scheduled post.** The script signs in as the unattended administrator with authorization code + PKCE and schedules the post as a person.
- **The mock network only.** Never a real network or a real AI provider.
- **Afterwards.** Stop both sites, then delete the copies, their databases, the composer, the generated passwords and credentials, and any secrets.
