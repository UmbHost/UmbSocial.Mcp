<#
.SYNOPSIS
  Refreshes the committed UmbSocial Swagger snapshot from a running site, then
  regenerates the client and stamps the Umbraco major the site reports.

.DESCRIPTION
  Needs a local UmbSocial site running in Development (the Swagger document is
  served there without a token) and UMBRACO_BASE_URL, UMBRACO_CLIENT_ID and
  UMBRACO_CLIENT_SECRET for that site, in the environment or in .env, for the
  target-major stamp.

  A dev certificate is trusted from the Windows certificate store with Node's
  --use-system-ca. TLS checks are never turned off.

  To regenerate from the committed snapshot without a site, run
  `npm run generate` instead.

.EXAMPLE
  ./scripts/generate.ps1 -SiteUrl https://localhost:44391
#>
param(
  [string] $SiteUrl = "https://localhost:44391"
)

$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Snapshot = Join-Path $ProjectDir "src/umbraco-api/api/umbsocial.swagger.json"
$SpecUrl = "$($SiteUrl.TrimEnd('/'))/umbraco/openapi/umbsocial.json"

if ($env:NODE_TLS_REJECT_UNAUTHORIZED -eq "0") {
  throw "NODE_TLS_REJECT_UNAUTHORIZED=0 is set. Remove it; the dev certificate is trusted with --use-system-ca."
}

$SavedNodeOptions = $env:NODE_OPTIONS
Push-Location $ProjectDir
try {
  $env:NODE_OPTIONS = "$SavedNodeOptions --use-system-ca".Trim()

  # Fetch with Node so the snapshot is written the same way on every machine:
  # parsed and re-serialised with two-space indentation and a final newline.
  $fetchScript = @"
const [url, out] = process.argv.slice(1);
const res = await fetch(url, { headers: { Accept: 'application/json' } });
if (!res.ok) { console.error('GET ' + url + ' -> ' + res.status); process.exit(1); }
const spec = await res.json();
const ops = Object.values(spec.paths ?? {}).flatMap((p) => Object.values(p)).filter((o) => o && o.operationId).length;
(await import('node:fs')).writeFileSync(out, JSON.stringify(spec, null, 2) + '\n');
console.log('Saved ' + out + ' (' + ops + ' operations).');
"@
  node --input-type=module -e $fetchScript $SpecUrl $Snapshot
  if ($LASTEXITCODE -ne 0) { throw "Fetching the Swagger document failed." }

  $env:UMBSOCIAL_STAMP_TARGET_MAJOR = "true"
  npx orval --config orval.config.ts
  if ($LASTEXITCODE -ne 0) { throw "Orval failed." }
}
finally {
  Remove-Item Env:UMBSOCIAL_STAMP_TARGET_MAJOR -ErrorAction SilentlyContinue
  $env:NODE_OPTIONS = $SavedNodeOptions
  Pop-Location
}
