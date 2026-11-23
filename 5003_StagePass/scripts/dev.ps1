param(
    [switch]$ResetSeed,   # Reset demo data first
    [switch]$NoApi,       # Start only the database, not the backend
    [switch]$NoWeb,       # Do not start the two frontends
    [switch]$SkipInstall, # Skip npm install
    [switch]$Visible      # Open one console window per service
)

# Start the development environment with one command: database -> backend API 3000 -> user web 8080 / admin web 8081
# Missing code directories are skipped with a next-step hint

. "$PSScriptRoot\_common.ps1"
$ErrorActionPreference = "Stop"

$appRoot  = $Project
$apiDir   = Join-Path $appRoot "server"
$userDir  = Join-Path $appRoot "web-user"
$adminDir = Join-Path $appRoot "web-admin"

Write-Step "1/5 Database"
if (-not (Start-Db)) { exit 1 }
Start-Sleep -Milliseconds 300
$tables = Get-TableCount
Write-Info "Current table count in $($Cfg.Db): $tables"
if ($tables -eq 0) {
    Write-Warn2 "Database is empty; importing schema + seed automatically"
    & "$PSScriptRoot\reset_demo.ps1"
    if ($LASTEXITCODE -ne 0) { exit 1 }
} elseif ($ResetSeed) {
    Write-Info "Reset demo data as requested"
    & "$PSScriptRoot\reset_demo.ps1"
    if ($LASTEXITCODE -ne 0) { exit 1 }
}

Write-Step "2/5 Node.js environment"
$nodeVer = (& node -v) -replace '^v', ''
$major = [int]($nodeVer.Split('.')[0])
Write-Info "node $nodeVer / npm $(& npm -v)"
if ($major -lt 16) {
    Write-Fail2 "Node $nodeVer is too old; the backend requires at least 16"
    exit 1
}
if ($major -eq 17) {
    Write-Warn2 "Node 17 has compatibility issues with the legacy Webpack frontend; start the frontend with --openssl-legacy-provider"
}

Write-Step "3/5 Backend API"
$apiStarted = $false
if ($NoApi) {
    Write-Warn2 "Skipped by -NoApi"
} elseif (Test-TcpPort $Cfg.ApiPort) {
    Write-Ok "API is already running on $($Cfg.ApiPort); skipping startup"
    $apiStarted = $true
} elseif (-not (Test-Path (Join-Path $apiDir "package.json"))) {
    Write-Warn2 "Not found: $apiDir\package.json (backend project not created yet)"
    Write-Info "Next: create server / web-user / web-admin under $appRoot"
} else {
    if (-not $SkipInstall -and -not (Test-Path (Join-Path $apiDir "node_modules"))) {
        Write-Info "First dependency install (npm install)"
        & npm install --prefix $apiDir --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { Write-Fail2 "npm install failed"; exit 1 }
    }
    Start-NodeApp $apiDir "dev" "StagePass API" -Visible:$Visible | Out-Null
    for ($i = 1; $i -le 20; $i++) {
        Start-Sleep -Seconds 1
        if (Test-TcpPort $Cfg.ApiPort) { break }
    }
    if (Test-TcpPort $Cfg.ApiPort) {
        Write-Ok "API is listening on $($Cfg.ApiPort)"
        $apiStarted = $true
    } else {
        Write-Fail2 "API did not listen on $($Cfg.ApiPort) within 20 seconds; check server logs or npm run dev output"
    }
}
if (-not $NoApi -and -not $apiStarted) { exit 1 }

Write-Step "4/5 Two frontends"
if ($NoWeb) {
    Write-Warn2 "Skipped by -NoWeb"
} else {
    $web = @(
        @{ Dir = $userDir;  Port = $Cfg.UserWebPort;  Name = "User web" },
        @{ Dir = $adminDir; Port = $Cfg.AdminWebPort; Name = "Admin web" }
    )
    foreach ($w in $web) {
        if (-not (Test-Path (Join-Path $w.Dir "package.json"))) {
            Write-Warn2 "$($w.Name): $($w.Dir)\package.json not found; skipping"
            continue
        }
        if (Test-TcpPort $w.Port) { Write-Ok "$($w.Name) is already running on $($w.Port)"; continue }
        if (-not $SkipInstall -and -not (Test-Path (Join-Path $w.Dir "node_modules"))) {
            Write-Info "$($w.Name) first dependency install"
            & npm install --prefix $w.Dir --no-audit --no-fund
            if ($LASTEXITCODE -ne 0) { Write-Fail2 "$($w.Name) npm install failed"; continue }
        }
        Start-NodeApp $w.Dir "serve" "StagePass $($w.Name)" -Visible:$Visible | Out-Null
        Start-Sleep -Seconds 2
        if (Test-TcpPort $w.Port) { Write-Ok "$($w.Name) is listening on $($w.Port)" }
        else { Write-Warn2 "$($w.Name) is not listening on $($w.Port); the first compilation may take 30-60 seconds" }
    }
}

Write-Step "5/5 Summary"
Write-Host ""
Write-Host ("  API      http://localhost:{0}" -f $Cfg.ApiPort) -ForegroundColor White
Write-Host ("  User web   http://localhost:{0}" -f $Cfg.UserWebPort) -ForegroundColor White
Write-Host ("  Admin web  http://localhost:{0}" -f $Cfg.AdminWebPort) -ForegroundColor White
Write-Host ""
Write-Host "  Reset demo data: .\scripts\reset_demo.ps1" -ForegroundColor DarkGray
Write-Host "  Smoke test:      .\scripts\smoke.ps1" -ForegroundColor DarkGray
if ($Visible) {
    Write-Host "  Stop: close the StagePass API / User web / Admin web windows" -ForegroundColor DarkGray
}
