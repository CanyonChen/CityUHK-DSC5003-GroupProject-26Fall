param(
    [int]$Port = 3002,
    [int]$WaitSeconds = 25
)

# Verifies the periodic reconciliation worker (not the manual trigger):
# start a separate API with a 10s interval, insert a back-dated PENDING notification,
# then wait for the worker to replay it without calling /admin/reconciliation/run.

. "$PSScriptRoot\_common.ps1"
$ErrorActionPreference = "Stop"
$base = "http://127.0.0.1:$Port"
$serverDir = Join-Path $Project "server"
$outLog = Join-Path $env:TEMP "stagepass-recon-$Port.out.log"
$errLog = Join-Path $env:TEMP "stagepass-recon-$Port.err.log"

function Call-Api {
    param([string]$Method, [string]$Path, [string]$Token, $Body, [string]$IdempotencyKey)
    $headers = @{}
    if ($Token) { $headers["Authorization"] = "Bearer $Token" }
    if ($IdempotencyKey) { $headers["Idempotency-Key"] = $IdempotencyKey }
    $params = @{ Uri = "$base$Path"; Method = $Method; Headers = $headers; SkipHttpErrorCheck = $true; TimeoutSec = 20 }
    if ($null -ne $Body) {
        $params.Body = ($Body | ConvertTo-Json -Depth 10 -Compress)
        $params.ContentType = "application/json"
    }
    $r = Invoke-WebRequest @params
    $parsed = $null
    try { $parsed = $r.Content | ConvertFrom-Json } catch { }
    [pscustomobject]@{ Status = [int]$r.StatusCode; Body = $parsed }
}

function Login([string]$Username) {
    $r = Call-Api -Method POST -Path "/auth/login" -Body @{ user_name = $Username; password = "Demo@1234" }
    if ($r.Status -ne 200) { throw "Login $Username failed: $($r.Status) $($r.Body.code)" }
    $r.Body.data.token
}

function Sha256-Hex([string]$Text) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { (($sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($Text)) | ForEach-Object { $_.ToString("x2") }) -join "") }
    finally { $sha.Dispose() }
}

if (Test-TcpPort $Port) { throw "Port $Port already in use" }
if (-not (Test-TcpPort $Cfg.ApiPort)) { throw "Main API on 3000 is not running; start scripts\dev.ps1 first" }

$oldPort = $env:PORT
$oldInterval = $env:RECONCILE_INTERVAL_SECONDS
$oldAge = $env:RECONCILE_MIN_AGE_SECONDS
$env:PORT = "$Port"
$env:RECONCILE_INTERVAL_SECONDS = "10"
$env:RECONCILE_MIN_AGE_SECONDS = "1"
$node = (Get-Command node).Source
$proc = Start-Process -FilePath $node -ArgumentList "src/server.js" -WorkingDirectory $serverDir -PassThru -RedirectStandardOutput $outLog -RedirectStandardError $errLog
$env:PORT = $oldPort
$env:RECONCILE_INTERVAL_SECONDS = $oldInterval
$env:RECONCILE_MIN_AGE_SECONDS = $oldAge

try {
    $deadline = (Get-Date).AddSeconds(15)
    while (-not (Test-TcpPort $Port)) {
        if ((Get-Date) -gt $deadline) { throw "API on $Port did not start. See $errLog" }
        Start-Sleep -Milliseconds 300
    }
    Write-Step "Periodic reconciliation worker on port $Port"

    $admin = Login "admin"
    $buyer = Login "buyer01"
    $stamp = Get-Date -Format "HHmmss"

    $perfId = [int]((Invoke-Db "SELECT p.performance_id FROM performances p JOIN session_seats ss ON ss.performance_id=p.performance_id WHERE p.status='PUBLISHED' AND ss.session_seat_status='AVAILABLE' GROUP BY p.performance_id ORDER BY p.performance_id LIMIT 1;" | Select-Object -Last 1).Split("`t")[0])
    if (-not $perfId) { throw "No published performance with available seats" }

    $r = Call-Api -Method GET -Path "/performances/$perfId/seats"
    $seat = @($r.Body.data.seats | Where-Object { $_.status -eq "AVAILABLE" } | Select-Object -First 1)[0]
    if (-not $seat) { throw "No available seat on performance $perfId" }

    $r = Call-Api -Method POST -Path "/orders" -Token $buyer -IdempotencyKey ("RECON-AUTO-" + [guid]::NewGuid().ToString("N")) -Body @{
        performance_id = $perfId
        session_seat_ids = @($seat.session_seat_id)
    }
    if ($r.Status -ne 201) { throw "Create order failed: $($r.Status) $($r.Body.code)" }
    $orderId = $r.Body.data.order_id

    $r = Call-Api -Method GET -Path "/orders/$orderId" -Token $buyer
    $orderNo = $r.Body.data.order_no
    $amount = [int]$r.Body.data.total_amount_cents

    $r = Call-Api -Method POST -Path "/payments" -Token $buyer -Body @{ order_id = $orderId }
    if ($r.Status -ne 201) { throw "Create payment failed: $($r.Status) $($r.Body.code)" }
    $paymentId = $r.Body.data.payment_id

    $payload = @{
        payment_id = $paymentId
        provider_txn_id = "RECONAUTO-$stamp"
        result = "SUCCESS"
        amount_cents = $amount
        currency = "HKD"
        order_no = $orderNo
    }
    $json = $payload | ConvertTo-Json -Depth 5 -Compress
    $digest = Sha256-Hex $json
    $jsonSql = $json.Replace("'", "''")
    Invoke-Db "INSERT INTO payment_notifications (source, notification_id, payment_attempt_id, received_at, processed_result, payload_digest, payload_json) VALUES ('mockpay', 'RECONAUTO-$stamp', $paymentId, UTC_TIMESTAMP(3) - INTERVAL 180 SECOND, 'PENDING', '$digest', '$jsonSql');" | Out-Null
    Write-Info "PENDING notification inserted; waiting for the 10s worker (no manual trigger)."

    $paidAt = $null
    $deadline = (Get-Date).AddSeconds($WaitSeconds)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 2
        $r = Call-Api -Method GET -Path "/payments/$paymentId" -Token $buyer
        if ($r.Status -eq 200 -and $r.Body.data.status -eq "SUCCEEDED") {
            $paidAt = Get-Date
            break
        }
    }

    if (-not $paidAt) {
        $st = Call-Api -Method GET -Path "/admin/reconciliation/status" -Token $admin
        throw "Worker did not replay within $WaitSeconds s; last status: $($st.Body.data | ConvertTo-Json -Compress)"
    }

    $r = Call-Api -Method GET -Path "/admin/reconciliation/status" -Token $admin
    Write-Ok "worker replayed PENDING notification automatically — order=$orderNo payment=SUCCEEDED interval=$($r.Body.data.interval_seconds)s last_run=$($r.Body.data.last_run_at)"
    Write-Ok "status card: pending=$($r.Body.data.pending) processed_24h=$($r.Body.data.processed_24h) failed_24h=$($r.Body.data.failed_24h)"
}
finally {
    if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Milliseconds 500
}
