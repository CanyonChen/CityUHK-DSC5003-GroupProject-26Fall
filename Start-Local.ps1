param([switch]$Stop, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$ProjectRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$RunRoot = Join-Path $ProjectRoot '.cache\local-run'
$SettingsPath = Join-Path $RunRoot 'settings.json'
$ProcessesPath = Join-Path $RunRoot 'processes.json'
$ContainerName = 'cityuhk-events-local'
$VolumeName = 'cityuhk-events-local-data'
$OwnerLabel = 'com.cityuhk.events.project'
$DatabaseName = 'ticketing_local'
$DatabasePort = 3307
$OutputEncoding = [Text.UTF8Encoding]::new($false)
function Save-Json($Path, $Value) {
    [IO.File]::WriteAllText($Path, ($Value | ConvertTo-Json -Depth 6), [Text.UTF8Encoding]::new($false))
}
function Docker-Ready {
    try { & docker info --format '{{.ServerVersion}}' 2>$null | Out-Null; return ($LASTEXITCODE -eq 0) }
    catch { return $false }
}
function Assert-Exit($Message) { if ($LASTEXITCODE -ne 0) { throw $Message } }
function Get-OwnedProcesses {
    if (-not (Test-Path -LiteralPath $ProcessesPath)) { return @() }
    $records = @(Get-Content -LiteralPath $ProcessesPath -Raw | ConvertFrom-Json)
    $owned = @()
    foreach ($record in $records) {
        $process = Get-Process -Id ([int]$record.pid) -ErrorAction SilentlyContinue
        if ($process -and $process.ProcessName -eq 'node' -and $process.StartTime.ToUniversalTime().ToString('o') -eq $record.started_at) { $owned += $record }
    }
    return $owned
}
function Stop-Owned {
    foreach ($record in @(Get-OwnedProcesses)) {
        Write-Host ("Stopping {0}, PID {1}" -f $record.name, $record.pid)
        & taskkill.exe /PID ([int]$record.pid) /T /F | Out-Null
    }
    if ((Test-Path -LiteralPath $SettingsPath) -and (Docker-Ready)) {
        $names = @(& docker container ls -a --format '{{.Names}}')
        if ($ContainerName -in $names) {
            $container = @(& docker inspect $ContainerName | ConvertFrom-Json)[0]
            if ($container.Config.Labels.$OwnerLabel -eq $ProjectRoot) {
                & docker stop $ContainerName | Out-Null
                Assert-Exit 'Could not stop the project database.'
            }
        }
    }
    Write-Host 'Project services stopped. Database volume and business data are preserved.'
}
function Wait-Http($Url) {
    $until = (Get-Date).AddSeconds(60)
    do {
        try { if ((Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2).StatusCode -eq 200) { return } } catch {}
        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $until)
    throw "Service did not become ready: $Url. Logs: $RunRoot"
}
function Start-App($Name, [int]$Port, $Directory, [string[]]$Arguments, $Environment, $Existing) {
    $listener = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
    if ($listener.Count) {
        $ours = @($Existing | Where-Object { $_.name -eq $Name -and $_.pid -in $listener.OwningProcess })
        if ($ours.Count -eq 1) { return $ours[0] }
        throw "Port $Port is occupied by another process. Nothing was stopped."
    }
    $saved = @{}
    try {
        foreach ($key in $Environment.Keys) {
            $saved[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
            [Environment]::SetEnvironmentVariable($key, [string]$Environment[$key], 'Process')
        }
        $process = Start-Process -FilePath $script:NodePath -ArgumentList $Arguments -WorkingDirectory $Directory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $RunRoot "$Name.out.log") -RedirectStandardError (Join-Path $RunRoot "$Name.err.log")
        return [PSCustomObject]@{ name=$Name; pid=$process.Id; started_at=$process.StartTime.ToUniversalTime().ToString('o') }
    } finally {
        foreach ($key in $saved.Keys) { [Environment]::SetEnvironmentVariable($key, $saved[$key], 'Process') }
    }
}
try {
    if ($Stop) { Stop-Owned; exit 0 }
    $script:NodePath = (Get-Command node.exe -ErrorAction Stop).Source
    $npmPath = (Get-Command npm.cmd -ErrorAction Stop).Source
    Get-Command docker.exe -ErrorAction Stop | Out-Null
    $major = [int]((& $script:NodePath --version) -replace '^v(\d+).*$', '$1')
    if ($major -lt 20) { throw 'Node.js 20 or later is required.' }
    New-Item -ItemType Directory -Path $RunRoot -Force | Out-Null
    Write-Host '1/5 Installing locked dependencies when needed (first run requires Internet).'
    foreach ($app in @('server','web-user','web-admin')) {
        $dir = Join-Path $ProjectRoot $app
        $hash = (Get-FileHash -LiteralPath (Join-Path $dir 'package-lock.json') -Algorithm SHA256).Hash
        $stamp = Join-Path $RunRoot "$app.lock-hash"
        $critical = if ($app -eq 'server') { 'node_modules\dotenv\package.json' } else { 'node_modules\vite\bin\vite.js' }
        if (-not (Test-Path -LiteralPath (Join-Path $dir $critical)) -or -not (Test-Path -LiteralPath $stamp) -or (Get-Content -LiteralPath $stamp -Raw).Trim() -ne $hash) {
            & $npmPath ci --include=dev --prefix $dir --cache (Join-Path $ProjectRoot '.cache\npm') --logs-dir (Join-Path $ProjectRoot '.cache\npm-logs') --no-audit --no-fund --fetch-retries=0 --fetch-timeout=15000
            Assert-Exit "Dependency install failed for $app. Run this launcher in your normal Windows terminal with Internet access."
            [IO.File]::WriteAllText($stamp, $hash)
        }
    }
    Write-Host '2/5 Starting Docker Desktop.'
    if (-not (Docker-Ready)) {
        & docker desktop start --detach
        Assert-Exit 'Open Docker Desktop and finish its initial setup.'
        $until = (Get-Date).AddSeconds(120)
        while (-not (Docker-Ready)) {
            if ((Get-Date) -gt $until) { throw 'Docker engine is not ready. Open Docker Desktop and finish pending setup; then run this launcher again.' }
            Start-Sleep -Seconds 2
        }
    }
    $containers = @(& docker container ls -a --format '{{.Names}}')
    Assert-Exit 'Cannot list Docker containers.'
    $volumes = @(& docker volume ls --format '{{.Name}}')
    Assert-Exit 'Cannot list Docker volumes.'
    if (Test-Path -LiteralPath $SettingsPath) {
        $settings = Get-Content -LiteralPath $SettingsPath -Raw | ConvertFrom-Json
        if ($settings.project -ne $ProjectRoot -or $settings.database -ne $DatabaseName) { throw 'Local settings belong to a different project. Existing data was preserved.' }
    } else {
        if ($ContainerName -in $containers -or $VolumeName -in $volumes) { throw 'A database container/volume already exists without this folder settings. Restore its settings first; existing data was preserved.' }
        $random = [Security.Cryptography.RandomNumberGenerator]::Create()
        $bytes = New-Object byte[] 32
        $random.GetBytes($bytes); $password = [Convert]::ToBase64String($bytes)
        $random.GetBytes($bytes); $jwtSecret = [Convert]::ToBase64String($bytes)
        $random.GetBytes($bytes); $notifySecret = [Convert]::ToBase64String($bytes)
        $random.Dispose()
        $settings = [PSCustomObject]@{ project=$ProjectRoot; database=$DatabaseName; password=$password; jwt=$jwtSecret; notify=$notifySecret; seed_complete=$false }
        Save-Json $SettingsPath $settings
    }
    $clientFile = Join-Path $RunRoot 'client.cnf'
    $envFile = Join-Path $RunRoot 'database.env'
    [IO.File]::WriteAllText($clientFile, "[client]`nuser=root`npassword=$($settings.password)`nhost=127.0.0.1`n", [Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText($envFile, "MARIADB_ROOT_PASSWORD=$($settings.password)`nMARIADB_ROOT_HOST=%`n", [Text.UTF8Encoding]::new($false))
    Write-Host '3/5 Starting the dedicated project database on 127.0.0.1:3307.'
    if ($ContainerName -in $containers) {
        $container = @(& docker inspect $ContainerName | ConvertFrom-Json)[0]
        if ($container.Config.Labels.$OwnerLabel -ne $ProjectRoot) { throw 'The container name belongs to another project. Nothing was changed.' }
        & docker start $ContainerName | Out-Null
        Assert-Exit 'Could not start the project database container.'
    } else {
        & docker volume create --label "$OwnerLabel=$ProjectRoot" $VolumeName | Out-Null
        Assert-Exit 'Could not create the dedicated database volume.'
        & docker run -d --name $ContainerName --label "$OwnerLabel=$ProjectRoot" --env-file $envFile --publish "127.0.0.1:${DatabasePort}:3306" --mount "type=volume,source=$VolumeName,target=/var/lib/mysql" --mount "type=bind,source=$clientFile,target=/etc/mysql/local-client.cnf,readonly" mariadb:10.11 | Out-Null
        Assert-Exit 'Could not create the database container. Check Docker Desktop and image download access.'
    }
    $until = (Get-Date).AddSeconds(120)
    do {
        try { & docker exec $ContainerName mariadb-admin --defaults-extra-file=/etc/mysql/local-client.cnf ping --silent 2>$null | Out-Null } catch {}
        if ($LASTEXITCODE -eq 0) { break }
        if ((Get-Date) -gt $until) { throw 'The database did not become ready. Check Docker Desktop container logs.' }
        Start-Sleep -Seconds 2
    } while ($true)
    $count = & docker exec $ContainerName mariadb --defaults-extra-file=/etc/mysql/local-client.cnf --batch --skip-column-names -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$DatabaseName';"
    Assert-Exit 'Could not inspect the dedicated database.'
    if ([int]$count -eq 0) {
        foreach ($file in @('database/schema.sql','database/seed.sql')) {
            $sql = [IO.File]::ReadAllText((Join-Path $ProjectRoot $file)).Replace('ticketing_system',$DatabaseName)
            $sql | & docker exec -i $ContainerName mariadb --defaults-extra-file=/etc/mysql/local-client.cnf --default-character-set=utf8mb4
            Assert-Exit "Initialization failed at $file. Partial data was preserved."
        }
        $settings.seed_complete = $true
        Save-Json $SettingsPath $settings
    } elseif ([int]$count -ne 17 -or -not $settings.seed_complete) { throw 'Database initialization is incomplete. Existing data was preserved; no reset or seed re-import was performed.' }
    Write-Host '4/5 Starting API and both frontends. Logs: .cache/local-run'
    $existing = @(Get-OwnedProcesses)
    $records = @($existing)
    $apiEnv = @{ NODE_ENV='development'; HOST='127.0.0.1'; PORT='3000'; DB_HOST='127.0.0.1'; DB_PORT="$DatabasePort"; DB_USER='root'; DB_PASSWORD=$settings.password; DB_NAME=$DatabaseName; JWT_SECRET=$settings.jwt; PAYMENT_NOTIFY_SECRET=$settings.notify; PAYMENT_MODE='test' }
    $api = Start-App 'api' 3000 (Join-Path $ProjectRoot 'server') @('src/server.js') $apiEnv $existing
    $records = @($records | Where-Object { $_.name -ne 'api' }) + @($api); Save-Json $ProcessesPath $records
    Wait-Http 'http://127.0.0.1:3000/health'
    foreach ($web in @(@{name='user';dir='web-user';port=8080},@{name='admin';dir='web-admin';port=8081})) {
        $process = Start-App $web.name $web.port (Join-Path $ProjectRoot $web.dir) @('node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',"$($web.port)",'--strictPort') @{ VITE_API_BASE='http://127.0.0.1:3000' } $existing
        $records = @($records | Where-Object { $_.name -ne $web.name }) + @($process); Save-Json $ProcessesPath $records
        Wait-Http "http://127.0.0.1:$($web.port)/"
    }
    Write-Host '5/5 Ready.'
    Write-Host 'User: http://127.0.0.1:8080   Admin: http://127.0.0.1:8081'
    Write-Host 'Demo login: buyer01 / admin / checker01; password: Demo@1234'
    Write-Host 'Payments are simulated. Stop-Local.bat stops services without deleting the database.'
    if (-not $NoBrowser) { Start-Process 'http://127.0.0.1:8080'; Start-Process 'http://127.0.0.1:8081' }
} catch {
    Write-Host ("STARTUP FAILED: " + $_.Exception.Message) -ForegroundColor Red
    Write-Host "Logs: $RunRoot"
    exit 1
}
