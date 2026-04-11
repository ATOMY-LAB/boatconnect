# Uploads current git-tracked files to an empty GitHub repo via REST (no git push).
# Run from repo root: powershell -ExecutionPolicy Bypass -File scripts/upload-via-gh-api.ps1
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

$repo = "ATOMY-LAB/boatconnect"
Write-Host "Building git tree for $repo ..."

$treeEntries = New-Object System.Collections.Generic.List[object]
$paths = git ls-files
if (-not $paths) { throw "No tracked files (git ls-files empty)." }

foreach ($rel in $paths) {
  $full = Join-Path (Get-Location) $rel
  $bytes = [System.IO.File]::ReadAllBytes($full)
  $b64 = [Convert]::ToBase64String($bytes)
  Write-Host "  blob $rel ($($bytes.Length) bytes)"
  $blobJson = gh api "repos/$repo/git/blobs" -X POST -f encoding=base64 -f content=$b64
  $blob = $blobJson | ConvertFrom-Json
  $treeEntries.Add(@{
      path = $rel -replace "\\", "/"
      mode = "100644"
      type = "blob"
      sha  = $blob.sha
    })
}

$treeBody = @{ tree = $treeEntries } | ConvertTo-Json -Depth 20 -Compress
Write-Host "Creating tree..."
$treeResp = $treeBody | gh api "repos/$repo/git/trees" -X POST --input -
$treeObj = $treeResp | ConvertFrom-Json

$commitBody = @{
  message = "Initial commit: boatconnect binary codec, transports, firmware refs"
  tree    = $treeObj.sha
  parents = @()
} | ConvertTo-Json -Compress
Write-Host "Creating commit..."
$commitResp = $commitBody | gh api "repos/$repo/git/commits" -X POST --input -
$commitObj = $commitResp | ConvertFrom-Json

Write-Host "Updating refs/heads/main to $($commitObj.sha) ..."
$null = gh api "repos/$repo/git/refs/heads/main" 2>$null
if ($LASTEXITCODE -eq 0) {
  gh api "repos/$repo/git/refs/heads/main" -X PATCH -f sha=$commitObj.sha -F force=$true | Out-Null
} else {
  gh api "repos/$repo/git/refs" -X POST -f ref=refs/heads/main -f sha=$commitObj.sha | Out-Null
}

Write-Host "Done. Open https://github.com/$repo"
