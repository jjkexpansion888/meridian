$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$relocation = & (Join-Path $PSScriptRoot 'scripts\complete-local-move.ps1')
if ($relocation.RunningUrl) {
  Write-Host ('Meridian is already running at ' + $relocation.RunningUrl)
  Write-Host ('Your project folder is ' + $PSScriptRoot)
  Write-Host 'The active connection is preserved. Locked runtime files will finish moving after the old server closes.'
  Start-Process $relocation.RunningUrl
  return
}
if ($relocation.Pending) {
  Write-Host 'A previous server still holds the database open. The compatibility link preserves the current data until all Meridian servers are closed.'
}
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$nodeBinary = if ($nodeCommand) { $nodeCommand.Source } else { $null }
if ($nodeBinary) { $majorVersion = [int]((& $nodeBinary --version).TrimStart('v').Split('.')[0]) } else { $majorVersion = 0 }
if ($majorVersion -lt 22) {
  $bundledNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
  if (Test-Path -LiteralPath $bundledNode) { $nodeBinary = $bundledNode } else { throw 'Install Node.js 22.13 or newer, then run this launcher again.' }
}
$env:PATH = (Split-Path -Parent $nodeBinary) + ';' + $env:PATH
if (-not (Test-Path -LiteralPath 'node_modules\vinext')) {
  $npmCommand = Get-Command npm.cmd -ErrorAction Stop
  $npmCli = Join-Path (Split-Path -Parent $npmCommand.Source) 'node_modules\npm\bin\npm-cli.js'
  if (-not (Test-Path -LiteralPath $npmCli)) { throw 'Run npm ci with Node.js 22.13+ before starting.' }
  & $nodeBinary $npmCli ci
  if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
}
if (-not (Test-Path -LiteralPath '.wrangler\meridian-initialized')) {
  & $nodeBinary scripts/run-framework.mjs build
  if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
  & $nodeBinary --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --command 'CREATE TABLE IF NOT EXISTS reports (id text PRIMARY KEY NOT NULL, owner_id text NOT NULL, data text NOT NULL, revision integer NOT NULL DEFAULT 0, updated_at text NOT NULL)'
  if ($LASTEXITCODE -ne 0) { throw 'Local database setup failed.' }
  New-Item -ItemType Directory -Path '.wrangler' -Force | Out-Null
  Set-Content -LiteralPath '.wrangler\meridian-initialized' -Value '1'
}
Write-Host ('Starting Meridian from ' + $PSScriptRoot)
Write-Host 'Open the localhost URL printed below. The default research workflow uses your connected ChatGPT plan without an API key.'
& $nodeBinary scripts/run-framework.mjs dev --hostname 127.0.0.1
