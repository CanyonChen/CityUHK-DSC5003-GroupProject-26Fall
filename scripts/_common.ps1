# Shared configuration and functions, dot-sourced by dev.ps1 / reset_demo.ps1 / smoke.ps1
# Contains only constants and common functions, no workflow logic

$script:Project = Split-Path $PSScriptRoot -Parent
$script:XamppRoot = $env:XAMPP_HOME
$script:Candidates = @((Join-Path $Project ".cache\runtime"), "C:\xampp", "D:\xampp", "D:\_Coding\XAMPP")
if (-not $script:XamppRoot -or -not (Test-Path (Join-Path $script:XamppRoot "mysql\bin\mysqld.exe"))) {
    $script:XamppRoot = $null
    foreach ($candidate in $script:Candidates) {
        if (Test-Path (Join-Path $candidate "mysql\bin\mysqld.exe")) {
            $script:XamppRoot = $candidate
            break
        }
    }
}
if (-not $script:XamppRoot) { $script:XamppRoot = "C:\xampp" }

$script:Cfg = @{
    Xampp  = $script:XamppRoot
    Mysql  = (Join-Path $script:XamppRoot "mysql\bin\mysql.exe")
    Mysqld = (Join-Path $script:XamppRoot "mysql\bin\mysqld.exe")
    MyIni  = (Join-Path $script:XamppRoot "mysql\bin\my.ini")
    Host   = "127.0.0.1"
    Port   = 3306
    User   = "root"
    Pass   = ""
    Db     = "ticketing_system"
    Cmd    = "C:\Windows\System32\cmd.exe"
    ApiPort = 3000
    UserWebPort = 8080
    AdminWebPort = 8081
}
$script:DatabaseDir   = Join-Path $Project "database"
$script:SqlMode = "STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION"

function Write-Step($m) { Write-Host "==> $m" -ForegroundColor Cyan }
function Write-Ok($m)   { Write-Host "  [OK] $m" -ForegroundColor Green }
function Write-Warn2($m){ Write-Host "  [WARN] $m" -ForegroundColor Yellow }
function Write-Fail2($m){ Write-Host "  [FAIL] $m" -ForegroundColor Red }
function Write-Info($m) { Write-Host "  [INFO] $m" -ForegroundColor DarkGray }

function Test-DbPort {
    [bool](Get-NetTCPConnection -LocalPort $Cfg.Port -State Listen -ErrorAction SilentlyContinue)
}

function Test-TcpPort([int]$Port) {
    [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Start-Db {
    if (Test-DbPort) { Write-Ok "MariaDB is already listening on $($Cfg.Port)"; return $true }
    if (-not (Test-Path $Cfg.Mysqld)) { Write-Fail2 "mysqld not found: $($Cfg.Mysqld)"; return $false }
    Write-Info "Starting mysqld --defaults-file=$($Cfg.MyIni)"
    Start-Process -FilePath $Cfg.Mysqld `
        -ArgumentList ('--defaults-file="' + $Cfg.MyIni + '"'), "--standalone" `
        -WindowStyle Hidden
    for ($i = 1; $i -le 30; $i++) {
        Start-Sleep -Seconds 1
        if (Test-DbPort) { Write-Ok "Port $($Cfg.Port) is ready (waited ${i}s)"; return $true }
    }
    Write-Fail2 "Port $($Cfg.Port) was not listening within 30 seconds: check whether the data directory is locked and the datadir in my.ini"
    return $false
}

function Invoke-Db([string]$Sql, [switch]$NoDb) {
    $a = @("-u", $Cfg.User, "-h", $Cfg.Host, "-P", "$($Cfg.Port)",
           "--default-character-set=utf8mb4", "-e", $Sql)
    if (-not $NoDb) { $a += @("-D", $Cfg.Db) }
    & $Cfg.Mysql @a 2>&1
}

function Import-SqlFile([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "SQL file not found: $Path" }
    $arguments = @("-u", $Cfg.User, "-h", $Cfg.Host, "-P", "$($Cfg.Port)", "--default-character-set=utf8mb4")
    $process = Start-Process -FilePath $Cfg.Mysql -ArgumentList $arguments -RedirectStandardInput $Path -NoNewWindow -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw "Import failed (exit $($process.ExitCode)): $Path" }
}

function Get-TableCount {
    $n = (Invoke-Db -NoDb "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$($Cfg.Db)';" |
          Select-Object -Last 1)
    [int]$n
}

function Start-NodeApp([string]$Dir, [string]$Script = "dev", [string]$Title = "CityUHK Events Hub", [switch]$Visible) {
    if (-not (Test-Path (Join-Path $Dir "package.json"))) { return $null }
    $npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
    if (-not $npm) { Write-Fail2 "npm.cmd not found; check the Node.js installation"; return $null }
    if ($Visible) {
        Start-Process -FilePath $Cfg.Cmd `
            -ArgumentList "/c", "title $Title && npm run $Script" `
            -WorkingDirectory $Dir
    } else {
        Start-Process -FilePath $npm -ArgumentList "run", $Script -WorkingDirectory $Dir -WindowStyle Hidden
    }
}
