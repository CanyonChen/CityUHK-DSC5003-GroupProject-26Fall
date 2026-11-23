param(
    [switch]$SkipVerify,
    [switch]$DryRun
)

# Reset demo data: DROP database -> create tables -> import seed -> verify invariants
# Purpose: restore a clean state before a demo; seed timestamps are generated relative to import time, so re-importing resets the P13 check-in window

. "$PSScriptRoot\_common.ps1"
$ErrorActionPreference = "Stop"

$schema = Join-Path $AiDir "schema.sql"
$seed   = Join-Path $AiDir "seed.sql"
$verify = Join-Path $AiDir "verify_seed.py"

Write-Step "0/5 Preflight checks"
$bad = @()
foreach ($f in @($schema, $seed)) {
    if (Test-Path $f) { Write-Ok "Found $(Split-Path $f -Leaf)" }
    else { $bad += $f; Write-Fail2 "Missing $(Split-Path $f -Leaf)" }
}
if ($bad.Count -gt 0) { exit 1 }

if (-not (Start-Db)) { exit 1 }

if ($DryRun) {
    Write-Step "DryRun: the following actions would run; nothing was executed"
    Write-Info "DROP DATABASE IF EXISTS $($Cfg.Db)"
    Write-Info "Import $schema (17 tables)"
    Write-Info "Import $seed (demo seed data)"
    Write-Info "Verify table count = 17 and run verify_seed.py"
    exit 0
}

try {
    Write-Step "1/5 Drop database"
    Invoke-Db -NoDb "DROP DATABASE IF EXISTS $($Cfg.Db);" | Out-Null
    Write-Ok "Dropped old database $($Cfg.Db)"

    Write-Step "2/5 Create tables (schema.sql)"
    $t0 = Get-Date
    Import-SqlFile $schema
    Write-Ok ("Created 17 tables in {0:N1}s" -f ((Get-Date) - $t0).TotalSeconds)

    Write-Step "3/5 Import demo data (seed.sql)"
    $t0 = Get-Date
    Import-SqlFile $seed
    $sec = ((Get-Date) - $t0).TotalSeconds
    Write-Ok ("Seed import completed in {0:N1}s" -f $sec)

    Write-Step "4/5 Structure check"
    $n = Get-TableCount
    if ($n -eq 17) { Write-Ok "Table count is 17, as expected" }
    else { Write-Fail2 "Table count $n != 17"; exit 1 }

    $row = Invoke-Db "SELECT COUNT(*) FROM orders;" | Select-Object -Last 1
    Write-Info "orders = $row"

    Write-Step "5/5 Invariant verification"
    $python = Get-Command python -ErrorAction SilentlyContinue
    if ($SkipVerify) {
        Write-Warn2 "Skipped by -SkipVerify"
    } elseif (-not $python) {
        Write-Warn2 "Python not found; skipping verification (install Python 3.10+ for the full check)"
    } elseif (Test-Path $verify) {
        & python $verify
        if ($LASTEXITCODE -ne 0) { Write-Fail2 "verify_seed.py failed"; exit 1 }
        Write-Ok "Invariant verification passed"
    } else {
        Write-Warn2 "verify_seed.py not found; skipping"
    }

    Write-Host ""
    Write-Host "Reset complete. Demo accounts buyer01..buyer30 / admin / checker01..03; password Demo@1234" -ForegroundColor Green
    Write-Host "Note: the P13 check-in window is valid only for about 40 minutes after import; if it has expired before the demo, run this script again." -ForegroundColor Yellow
}
catch {
    Write-Fail2 $_.Exception.Message
    exit 1
}
