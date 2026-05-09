$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$dataDir = Join-Path $repoRoot "data"

if (-not (Test-Path (Join-Path $dataDir "manifest.json"))) {
  throw "Could not find docs/data/manifest.json."
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
