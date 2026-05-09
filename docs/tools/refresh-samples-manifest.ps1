$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$dataDir = Join-Path $repoRoot "data"

if (-not (Test-Path (Join-Path $dataDir "manifest.json"))) {
  throw "Could not find docs/data/manifest.json."
}

$manifestPath = Join-Path $dataDir "manifest.json"
$samplesDir = Join-Path $dataDir "samples"
$songsDir = Join-Path $dataDir "songs"
if (-not (Test-Path $samplesDir)) {
  throw "Could not find samples directory: $samplesDir"
}
if (-not (Test-Path $songsDir)) {
  throw "Could not find songs directory: $songsDir"
}

$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
$sampleSection = $manifest.sections | Where-Object { $_.id -eq "samples-instruments" }
if (-not $sampleSection) {
  throw "Could not find section id='samples-instruments' in manifest."
}
$songSection = $manifest.sections | Where-Object { $_.id -eq "entire-songs" }
if (-not $songSection) {
  throw "Could not find section id='entire-songs' in manifest."
}

$existingById = @{}
foreach ($ex in $sampleSection.examples) {
  $existingById[$ex.id] = $ex
}

function Normalize-Tags {
  param($value)
  if ($null -eq $value) { return ,@("sample") }
  if ($value -is [System.Array]) {
    $out = @()
    foreach ($item in $value) {
      if ($item -is [string] -and $item.Trim().Length -gt 0) {
        $out += $item.Trim()
      }
    }
    if ($out.Count -gt 0) { return ,$out }
    return ,@("sample")
  }
  if ($value -is [string] -and $value.Trim().Length -gt 0) {
    return ,@($value.Trim())
  }
  return ,@("sample")
}

function Read-SongInfo {
  param([string]$songInfoPath)
  if (-not (Test-Path $songInfoPath)) {
    return $null
  }

  try {
    return Get-Content -Raw -LiteralPath $songInfoPath | ConvertFrom-Json
  } catch {
    Write-Warning "Could not parse ${songInfoPath}: $($_.Exception.Message)"
    return $null
  }
}

# Refresh songs section from data/songs/song_*/ folders.
$existingSongsById = @{}
foreach ($ex in $songSection.examples) {
  $existingSongsById[$ex.id] = $ex
}

$songDirs = Get-ChildItem -LiteralPath $songsDir -Directory | Sort-Object `
  @{ Expression = {
      if ($_.Name -match '^song_(\d+)$') { [int]$Matches[1] } else { [int]::MaxValue }
    }
  }, `
  Name

$newSongExamples = @()
foreach ($dir in $songDirs) {
  $id = $dir.Name
  $existing = $existingSongsById[$id]

  $displayNum = if ($id -match '^song_(\d+)$') { [int]$Matches[1] } else { $id }
  $titleNum = if ($displayNum -is [int]) { '{0:D2}' -f $displayNum } else { $displayNum }

  $originalPath = Join-Path $dir.FullName "original.mp3"
  $reconstructionPath = Join-Path $dir.FullName "reconstruction.mp3"
  if (-not (Test-Path $originalPath) -or -not (Test-Path $reconstructionPath)) {
    Write-Warning "Skipping $id because original.mp3 or reconstruction.mp3 is missing."
    continue
  }

  $songInfoPath = Join-Path $dir.FullName "song_info.json"
  $songInfo = Read-SongInfo -songInfoPath $songInfoPath
  $artist = if ($songInfo -and $songInfo.artist) { [string]$songInfo.artist } else { "" }
  $songName = if ($songInfo -and $songInfo.song_name) { [string]$songInfo.song_name } else { "" }
  $directDownload = if ($songInfo -and $songInfo.direct_download) { [string]$songInfo.direct_download } else { "" }

  $title = "Song $titleNum"

  $subtitle = if ($existing -and $existing.subtitle) {
    $existing.subtitle
  } elseif ($artist.Length -gt 0 -and $songName.Length -gt 0) {
    "$artist - $songName"
  } elseif ($artist.Length -gt 0) {
    $artist
  } else {
    "Tracker excerpt."
  }

  $tags = if ($existing) { @(Normalize-Tags $existing.tags) } else { @("tracker", "song") }

  $songExample = [ordered]@{
    id = $id
    title = $title
    subtitle = $subtitle
    tracks = @(
      [ordered]@{ label = "Original"; file = "data/songs/$id/original.mp3" },
      [ordered]@{ label = "LAC Reconstruction"; file = "data/songs/$id/reconstruction.mp3" }
    )
    tags = $tags
  }

  if ($artist.Length -gt 0) {
    $songExample.artist = $artist
  }
  if ($songName.Length -gt 0) {
    $songExample.song_name = $songName
  }
  if ($directDownload.Length -gt 0) {
    $songExample.direct_download = $directDownload
  }

  $newSongExamples += [pscustomobject]$songExample
}

$songSection.examples = $newSongExamples

$sampleDirs = Get-ChildItem -LiteralPath $samplesDir -Directory | Sort-Object `
  @{ Expression = {
      if ($_.Name -match '^sample_(\d+)$') { [int]$Matches[1] } else { [int]::MaxValue }
    }
  }, `
  Name
$newExamples = @()

foreach ($dir in $sampleDirs) {
  $id = $dir.Name
  $existing = $existingById[$id]

  $displayNum = if ($id -match '^sample_(\d+)$') { [int]$Matches[1] } else { $id }
  $titleNum = if ($displayNum -is [int]) { '{0:D2}' -f $displayNum } else { $displayNum }

  $title = if ($existing -and $existing.title) { $existing.title } else { "Sample $titleNum" }
  $subtitlePlaceholder = "Add one-line context for this sample."
  $subtitle = ""
  if ($existing -and $existing.subtitle) {
    $subtitle = [string]$existing.subtitle
    if ($subtitle.Trim() -eq $subtitlePlaceholder) {
      $subtitle = ""
    }
  }
  $tags = if ($existing) { @(Normalize-Tags $existing.tags) } else { @("sample") }
  $lexical = if ($existing) { $existing.lexical_description } else { "" }
  if ($null -eq $lexical) { $lexical = "" }

  $plotPath = "data/samples/$id/waveform.png"
  $hasPlot = Test-Path (Join-Path $dir.FullName "waveform.png")
  $descriptionPath = "data/samples/$id/description.txt"
  $descriptionFileOnDisk = Join-Path $dir.FullName "description.txt"

  $loopMarkerPath = "data/samples/$id/looped.json"
  $isLooped = Test-Path (Join-Path $dir.FullName "looped.json")

  # Prefer description.txt content as canonical lexical description.
  $lexicalFromFile = $null
  if (Test-Path $descriptionFileOnDisk) {
    $rawDescription = Get-Content -Raw -LiteralPath $descriptionFileOnDisk
    if ($null -ne $rawDescription) {
      $trimmed = $rawDescription.Trim()
      if ($trimmed.Length -gt 0) {
        $lexicalFromFile = $trimmed
      }
    }
  }
  if ($lexicalFromFile) {
    $lexical = $lexicalFromFile
  }

  $example = [ordered]@{
    id = $id
    title = $title
    subtitle = $subtitle
    tags = $tags
    lexical_description = $lexical
    tracks = @(
      [ordered]@{ label = "Original"; file = "data/samples/$id/original.mp3" },
      [ordered]@{ label = "LAC Reconstruction"; file = "data/samples/$id/reconstruction.mp3" }
    )
    description_file_path = $descriptionPath
    looped = $isLooped
    loop_marker_path = $loopMarkerPath
  }

  if ($hasPlot) {
    $example.plot_image = $plotPath
    $example.plot_label = if ($existing -and $existing.plot_label) { $existing.plot_label } else { "Waveform plot" }
  }

  $newExamples += [pscustomobject]$example
}

$sampleSection.examples = $newExamples
$manifest.meta.updated = (Get-Date).ToString("yyyy-MM-dd")
$assetVersion = (Get-Date).ToString("yyyyMMddHHmmssfff")
if ($manifest.meta.PSObject.Properties.Name -contains "asset_version") {
  $manifest.meta.asset_version = $assetVersion
} else {
  $manifest.meta | Add-Member -NotePropertyName "asset_version" -NotePropertyValue $assetVersion
}
$manifest.meta.notes = "Songs and samples refreshed from folder contents; looped rule encoded in manifest."

($manifest | ConvertTo-Json -Depth 100) | Set-Content -LiteralPath $manifestPath -NoNewline
Write-Host "Updated $manifestPath with $($newSongExamples.Count) songs and $($newExamples.Count) samples."

$syncScript = Join-Path $PSScriptRoot "sync-manifest.ps1"
if (Test-Path $syncScript) {
  & $syncScript
}
