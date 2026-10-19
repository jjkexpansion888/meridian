param(
  [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
  [switch]$Inspect
)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath($ProjectRoot).TrimEnd('\')
$planPath = Join-Path $root '.meridian-local\relocation.json'
if (-not (Test-Path -LiteralPath $planPath)) {
  return [pscustomobject]@{ RunningUrl = $null; Pending = $false }
}
$plan = Get-Content -LiteralPath $planPath -Raw | ConvertFrom-Json
$pending = @($plan.folders)
if (@($pending | Where-Object { $_ -ne '.wrangler' }).Count -gt 0) { throw 'Unexpected runtime directory in relocation plan.' }
if ($pending.Count -eq 0) { return [pscustomobject]@{ RunningUrl = $null; Pending = $false } }
$legacy = [IO.Path]::GetFullPath([string]$plan.legacyRoot).TrimEnd('\')
if ($legacy -eq $root -or $legacy.StartsWith($root + '\', [StringComparison]::OrdinalIgnoreCase)) {
  throw 'The previous app folder must be separate from the new project folder.'
}
foreach ($folder in @($root, $legacy)) {
  $manifest = Get-Content -LiteralPath (Join-Path $folder 'package.json') -Raw | ConvertFrom-Json
  if ($manifest.name -ne 'meridian-investment-intelligence') { throw 'Relocation only supports Meridian project folders.' }
}
$ports = @($plan.ports)
if ($ports.Count -gt 4 -or @($ports | Where-Object { $_ -isnot [int] -and $_ -isnot [long] -or $_ -lt 1 -or $_ -gt 65535 }).Count -gt 0) {
  throw 'Invalid local server ports in relocation plan.'
}
$runtimeBusy = $false
foreach ($port in $ports) {
  $url = 'http://127.0.0.1:' + $port
  try {
    $status = Invoke-RestMethod ($url + '/__meridian/chat/status') -Headers @{ 'X-Meridian-Chat' = '1'; Origin = $url } -TimeoutSec 2
    if ($status.available) {
      $runtimeBusy = $true
      # A surviving chat middleware alone does not establish that the app's
      # page/database worker restarted successfully after a directory change.
      $null = Invoke-RestMethod ($url + '/api/status') -TimeoutSec 3
      return [pscustomobject]@{ RunningUrl = ($url + '/'); Pending = $true }
    }
  } catch { } # A closed local server is expected before completing the move.
}
if ($runtimeBusy) { return [pscustomobject]@{ RunningUrl = $null; Pending = $true } }
if ($Inspect) { return [pscustomobject]@{ RunningUrl = $null; Pending = $true } }
foreach ($name in $pending) {
  $source = [IO.Path]::GetFullPath((Join-Path $legacy $name))
  $destination = [IO.Path]::GetFullPath((Join-Path $root $name))
  if (-not $source.StartsWith($legacy + '\', [StringComparison]::OrdinalIgnoreCase) -or
      -not $destination.StartsWith($root + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected runtime relocation path.' }
  $link = Get-Item -LiteralPath $destination -Force
  if (-not $link.LinkType) {
    $previous = Get-Item -LiteralPath $source -Force
    if ($previous.LinkType -eq 'Junction' -and [IO.Path]::GetFullPath([string]@($previous.Target)[0]).TrimEnd('\') -eq $destination) { continue }
    throw 'Runtime directories changed since relocation began; refusing to overwrite either copy.'
  }
  if ($link.LinkType -ne 'Junction' -or [IO.Path]::GetFullPath([string]@($link.Target)[0]).TrimEnd('\') -ne $source) {
    throw 'The runtime link does not match the previous Meridian folder.'
  }
  if ((Get-Item -LiteralPath $source -Force).LinkType) { throw 'The previous runtime directory must not itself be a link.' }
  # Delete only the verified junction, never its contents. Directory.Move is an
  # atomic same-volume rename: a lock failure cannot partially move the database.
  [IO.Directory]::Delete($destination)
  try { [IO.Directory]::Move($source, $destination) }
  catch {
    New-Item -ItemType Junction -Path $destination -Target $source | Out-Null
    throw 'Close the previous Meridian server and run this launcher again. Your database remains in its original location.'
  }
  New-Item -ItemType Junction -Path $source -Target $destination | Out-Null
}
$plan.folders = @()
$plan | ConvertTo-Json | Set-Content -LiteralPath $planPath
Write-Host 'Meridian runtime data is now stored inside the current project folder.'
return [pscustomobject]@{ RunningUrl = $null; Pending = $false }
