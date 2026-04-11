# Commit all changes and push to origin/main. Run from repo root:
#   pwsh -File scripts/commit-and-push.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

if (-not (Test-Path .git)) { throw "Not a git repo: $root" }

$email = git config user.email
if (-not $email) {
  Write-Host "Set git identity first, e.g.:" -ForegroundColor Yellow
  Write-Host '  git config user.email "you@example.com"' -ForegroundColor Yellow
  Write-Host '  git config user.name "Your Name"' -ForegroundColor Yellow
  exit 1
}

git add -A
$st = git status --short
if (-not $st) {
  Write-Host "Nothing to commit (working tree clean)." -ForegroundColor Green
} else {
  Write-Host "Staged:`n$st"
  git commit -m "Add metrics, fleet last-seen, CI, dpsX100 fixes" `
    -m "Metrics (DPS, scaling, StrokeRateEstimator); FleetHub last-seen; CI; TS 5.7 parser typing; dpsX100 per PROTOCOL."
}

Write-Host "`nPushing to origin main..."
git push -u origin main
Write-Host "Done."
