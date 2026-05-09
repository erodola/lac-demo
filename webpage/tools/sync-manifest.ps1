$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$candidateDataDirs = @(
  (Join-Path $repoRoot "data"),
  (Join-Path (Split-Path -Parent $repoRoot) "data")
)

$dataDir = $null
foreach ($candidate in $candidateDataDirs) {
  if (Test-Path (Join-Path $candidate "manifest.json")) {
    $dataDir = $candidate
    break
  }
}

if (-not $dataDir) {
  throw "Could not find data/manifest.json. Checked: $($candidateDataDirs -join ', ')"
}

$jsonPath = Join-Path $dataDir "manifest.json"
$jsPath = Join-Path $dataDir "manifest.js"

$jsonRaw = Get-Content -Raw -LiteralPath $jsonPath
$manifest = $jsonRaw | ConvertFrom-Json
$prettyJson = $manifest | ConvertTo-Json -Depth 100

$jsContent = @"
window.LAC_MANIFEST = $prettyJson;
"@

Set-Content -LiteralPath $jsPath -Value $jsContent -NoNewline
Write-Host "Updated $jsPath from $jsonPath"
