param(
    [string]$BaseUrl = "http://localhost:3000"
)

# M3 acceptance: registration, server-side logout, role grants, automatic reconciliation.
# Writes accounts, orders and a back-dated payment notification. Run .\scripts\reset_demo.ps1 afterwards.

. "$PSScriptRoot\_common.ps1"
$ErrorActionPreference = "Stop"

$script:results = @()
function Add-Result([string]$Name, [bool]$Pass, [string]$Detail) {
    $script:results += [pscustomobject]@{ Name = $Name; Pass = $Pass; Detail = $Detail }
    if ($Pass) { Write-Ok "$Name — $Detail" } else { Write-Fail2 "$Name — $Detail" }
}

function Call-Api {
    param(
        [string]$Method,
        [string]$Path,
        [string]$Token,
        $Body,
        [string]$IdempotencyKey
    )
    $headers = @{}
    if ($Token) { $headers["Authorization"] = "Bearer $Token" }
    if ($IdempotencyKey) { $headers["Idempotency-Key"] = $IdempotencyKey }
    $params = @{
        Uri                = $BaseUrl.TrimEnd('/') + $Path
        Method             = $Method
        Headers            = $headers
        SkipHttpErrorCheck = $true
        TimeoutSec         = 20
    }
    if ($null -ne $Body) {
        $params.Body = ($Body | ConvertTo-Json -Depth 10 -Compress)
        $params.ContentType = "application/json"
    }
    $r = Invoke-WebRequest @params
    $parsed = $null
    try { $parsed = $r.Content | ConvertFrom-Json } catch { }
    [pscustomobject]@{ Status = [int]$r.StatusCode; Body = $parsed }
}

function Login([string]$Username, [string]$Password = "Demo@1234") {
    $r = Call-Api -Method POST -Path "/auth/login" -Body @{ user_name = $Username; password = $Password }
    if ($r.Status -ne 200) { throw "Login $Username failed: $($r.Status) $($r.Body.code)" }
    $r.Body.data.token
}

function Available-Seats([int]$PerformanceId, [int]$Count) {
    $r = Call-Api -Method GET -Path "/performances/$PerformanceId/seats"
    @($r.Body.data.seats | Where-Object { $_.status -eq "AVAILABLE" } | Select-Object -First $Count)
}

function Iso([datetimeoffset]$Value) { "{0:yyyy-MM-ddTHH:mm:sszzz}" -f $Value }

function Sha256-Hex([string]$Text) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        (($sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($Text)) | ForEach-Object { $_.ToString("x2") }) -join "")
    } finally {
        $sha.Dispose()
    }
}

Write-Step "0/9 Check API"
$apiPort = ([uri]$BaseUrl).Port
if (-not (Test-TcpPort $apiPort)) {
    Write-Warn2 "$BaseUrl is not listening; run .\scripts\dev.ps1 first"
    exit 0
}
Write-Ok "API port $apiPort is listening"

$admin = Login "admin"
$buyer = Login "buyer01"
$stamp = Get-Date -Format "HHmmss"
$newUser = "m3u$stamp"
$newPass = "M3Pass!234"
$newToken = $null

Write-Step "1/9 Registration and duplicate account"
$r = Call-Api -Method POST -Path "/auth/register" -Body @{
    user_name = $newUser
    password = $newPass
    display_name = "M3 Verification"
}
$newUserId = $r.Body.data.user_id
Add-Result "register 201" ($r.Status -eq 201 -and $null -ne $newUserId) "status=$($r.Status) user=$newUser id=$newUserId"
Add-Result "register defaults to USER" ($r.Status -eq 201 -and @($r.Body.data.roles) -contains "USER") "roles=$(@($r.Body.data.roles) -join ',')"
$r = Call-Api -Method POST -Path "/auth/register" -Body @{ user_name = $newUser; password = $newPass }
Add-Result "duplicate account 409" ($r.Status -eq 409 -and $r.Body.code -eq "USERNAME_TAKEN") "status=$($r.Status) code=$($r.Body.code)"
$r = Call-Api -Method POST -Path "/auth/register" -Body @{ user_name = $newUser; password = "short" }
Add-Result "weak password rejected" ($r.Status -eq 400 -and $r.Body.code -eq "VALIDATION_ERROR") "status=$($r.Status) code=$($r.Body.code)"

$newToken = Login $newUser $newPass
$r = Call-Api -Method GET -Path "/auth/me" -Token $newToken
Add-Result "registered user can sign in" ($r.Status -eq 200 -and $r.Body.data.user_name -eq $newUser) "status=$($r.Status) roles=$(@($r.Body.data.roles) -join ',')"

Write-Step "2/9 Default permissions for new accounts"
$r = Call-Api -Method GET -Path "/admin/users" -Token $newToken
Add-Result "USER blocked from /admin/users" ($r.Status -eq 403) "status=$($r.Status)"
$r = Call-Api -Method GET -Path "/admin/checker/performances" -Token $newToken
Add-Result "USER blocked from gate list" ($r.Status -eq 403) "status=$($r.Status)"

Write-Step "3/9 Grant CHECKER and immediate effect"
$r = Call-Api -Method POST -Path "/admin/users/$newUserId/roles" -Token $admin -Body @{ role = "CHECKER"; performance_id = 13 }
$checkerAssignment = $r.Body.data.assignment_id
Add-Result "grant CHECKER 201" ($r.Status -eq 201 -and $checkerAssignment) "status=$($r.Status) assignment=$checkerAssignment"
$r = Call-Api -Method POST -Path "/admin/users/$newUserId/roles" -Token $admin -Body @{ role = "CHECKER"; performance_id = 13 }
Add-Result "duplicate grant 409" ($r.Status -eq 409 -and $r.Body.code -eq "ROLE_ALREADY_ASSIGNED") "status=$($r.Status) code=$($r.Body.code)"
$r = Call-Api -Method POST -Path "/admin/users/$newUserId/roles" -Token $admin -Body @{ role = "CHECKER" }
Add-Result "CHECKER requires performance" ($r.Status -eq 400 -and $r.Body.code -eq "VALIDATION_ERROR") "status=$($r.Status) code=$($r.Body.code)"
$r = Call-Api -Method GET -Path "/admin/checker/performances" -Token $newToken
Add-Result "old token sees new role without re-login" ($r.Status -eq 200 -and @($r.Body.data.items).Count -ge 1) "status=$($r.Status) count=$(@($r.Body.data.items).Count)"
$r = Call-Api -Method GET -Path "/admin/users?role=CHECKER&page_size=100" -Token $admin
Add-Result "role filter returns CHECKER" ($r.Status -eq 200 -and @($r.Body.data.items).Count -ge 1) "status=$($r.Status) count=$($r.Body.data.items.Count)"

Write-Step "4/9 Revoke authorization and immediate invalidation"
$r = Call-Api -Method DELETE -Path "/admin/users/$newUserId/roles/$checkerAssignment" -Token $admin
Add-Result "revoke CHECKER 204" ($r.Status -eq 204) "status=$($r.Status)"
$r = Call-Api -Method GET -Path "/admin/checker/performances" -Token $newToken
Add-Result "revoked role blocked on same token" ($r.Status -eq 403) "status=$($r.Status) code=$($r.Body.code)"
$r = Call-Api -Method DELETE -Path "/admin/users/$newUserId/roles/$checkerAssignment" -Token $admin
Add-Result "revoking twice 404" ($r.Status -eq 404 -and $r.Body.code -eq "NOT_FOUND") "status=$($r.Status) code=$($r.Body.code)"

Write-Step "5/9 Grant ADMIN and last-admin protection"
$r = Call-Api -Method POST -Path "/admin/users/$newUserId/roles" -Token $admin -Body @{ role = "ADMIN" }
$adminAssignment = $r.Body.data.assignment_id
Add-Result "grant ADMIN 201" ($r.Status -eq 201 -and $adminAssignment) "status=$($r.Status) assignment=$adminAssignment"
$r = Call-Api -Method GET -Path "/admin/users" -Token $newToken
Add-Result "ADMIN role effective on old token" ($r.Status -eq 200) "status=$($r.Status)"
$r = Call-Api -Method DELETE -Path "/admin/users/$newUserId/roles/$adminAssignment" -Token $admin
Add-Result "revoke ADMIN 204" ($r.Status -eq 204) "status=$($r.Status)"

$r = Call-Api -Method GET -Path "/admin/users?role=ADMIN&page_size=100" -Token $admin
$adminRow = @($r.Body.data.items | Where-Object { $_.user_name -eq "admin" })[0]
$lastAdminAssignment = if ($adminRow) { @($adminRow.assignments | Where-Object { $_.role -eq "ADMIN" })[0].assignment_id } else { $null }
if ($lastAdminAssignment) {
    $r = Call-Api -Method DELETE -Path "/admin/users/$($adminRow.user_id)/roles/$lastAdminAssignment" -Token $admin
    Add-Result "last ADMIN cannot be revoked" ($r.Status -eq 409 -and $r.Body.code -eq "LAST_ADMIN") "status=$($r.Status) code=$($r.Body.code)"
} else {
    Add-Result "last ADMIN fixture present" $false "no seeded ADMIN assignment"
}

Write-Step "6/9 Server logout and token_version"
$logoutToken = Login $newUser $newPass
$r = Call-Api -Method POST -Path "/auth/logout" -Token $logoutToken
Add-Result "logout 204" ($r.Status -eq 204) "status=$($r.Status)"
$r = Call-Api -Method GET -Path "/auth/me" -Token $logoutToken
Add-Result "old token is 401 after logout" ($r.Status -eq 401) "status=$($r.Status) code=$($r.Body.code)"
$dbVersion = (Invoke-Db "SELECT token_version FROM users WHERE user_id=$newUserId;" | Select-Object -Last 1)
Add-Result "token_version incremented" ([int]$dbVersion -ge 1) "token_version=$dbVersion"
$freshToken = Login $newUser $newPass
$r = Call-Api -Method GET -Path "/auth/me" -Token $freshToken
Add-Result "new login works after logout" ($r.Status -eq 200) "status=$($r.Status)"

Write-Step "7/9 Automatic reconciliation status and replay"
$r = Call-Api -Method GET -Path "/admin/reconciliation/status" -Token $admin
Add-Result "reconciliation status 200" ($r.Status -eq 200 -and $null -ne $r.Body.data.interval_seconds) "status=$($r.Status) interval=$($r.Body.data.interval_seconds)s"

$now = [datetimeoffset]::Now
$r = Call-Api -Method POST -Path "/admin/events" -Token $admin -Body @{
    title = "M3 Reconciliation $stamp"
    organizer_name = "CityUHK Events Hub Verification"
    description = "Automated M3 reconciliation fixture."
}
$eventId = $r.Body.data.event_id
$r = Call-Api -Method POST -Path "/admin/performances" -Token $admin -Body @{
    event_id = $eventId
    venue_id = 2
    starts_at = ("{0:yyyy-MM-ddTHH:mm:sszzz}" -f $now.AddHours(2))
    sale_start_at = ("{0:yyyy-MM-ddTHH:mm:sszzz}" -f $now.AddHours(-1))
    sale_end_at = ("{0:yyyy-MM-ddTHH:mm:sszzz}" -f $now.AddMinutes(90))
    checkin_start_at = ("{0:yyyy-MM-ddTHH:mm:sszzz}" -f $now.AddMinutes(90))
    checkin_end_at = ("{0:yyyy-MM-ddTHH:mm:sszzz}" -f $now.AddHours(3))
    price_tiers = @(@{ tier_name = "Standard"; price_cents = 26000 })
}
$perfId = $r.Body.data.performance_id
$r = Call-Api -Method POST -Path "/admin/performances/$perfId/publish" -Token $admin
Add-Result "reconciliation fixture performance published" ($r.Status -eq 200 -and $r.Body.data.status -eq "PUBLISHED") "status=$($r.Status) perf=$perfId"

$seats = Available-Seats $perfId 1
if ($seats.Count -lt 1) { throw "No available seat on performance $perfId" }
$r = Call-Api -Method POST -Path "/orders" -Token $buyer -IdempotencyKey ("M3-AUTO-" + [guid]::NewGuid().ToString("N")) -Body @{
    performance_id = $perfId
    session_seat_ids = @($seats[0].session_seat_id)
}
$orderId = $r.Body.data.order_id
Add-Result "reconciliation fixture order 201" ($r.Status -eq 201 -and $orderId) "status=$($r.Status) order=$orderId code=$($r.Body.code)"
$r = Call-Api -Method GET -Path "/orders/$orderId" -Token $buyer
$orderNo = $r.Body.data.order_no
$amount = [int]$r.Body.data.total_amount_cents
$r = Call-Api -Method POST -Path "/payments" -Token $buyer -Body @{ order_id = $orderId }
$paymentId = $r.Body.data.payment_id
Add-Result "fixture payment is PENDING" ($r.Status -eq 201 -and $r.Body.data.status -eq "PENDING") "status=$($r.Status) payment=$paymentId order=$orderNo"

$payload = @{
    payment_id = $paymentId
    provider_txn_id = "M3AUTO-$stamp"
    result = "SUCCESS"
    amount_cents = $amount
    currency = "HKD"
    order_no = $orderNo
}
$json = $payload | ConvertTo-Json -Depth 5 -Compress
$digest = Sha256-Hex $json
$jsonSql = $json.Replace("'", "''")
$sql = "INSERT INTO payment_notifications (source, notification_id, payment_attempt_id, received_at, processed_result, payload_digest, payload_json) VALUES ('mockpay', 'M3AUTO-$stamp', $paymentId, UTC_TIMESTAMP(3) - INTERVAL 180 SECOND, 'PENDING', '$digest', '$jsonSql');"
Invoke-Db $sql | Out-Null
$r = Call-Api -Method POST -Path "/admin/reconciliation/run" -Token $admin
Add-Result "manual reconciliation run 200" ($r.Status -eq 200 -and $r.Body.data.applied -ge 1) "status=$($r.Status) scanned=$($r.Body.data.scanned) applied=$($r.Body.data.applied) failed=$($r.Body.data.failed)"
$r = Call-Api -Method GET -Path "/payments/$paymentId" -Token $buyer
Add-Result "replayed notification paid the order" ($r.Status -eq 200 -and $r.Body.data.status -eq "SUCCEEDED") "status=$($r.Status) payment=$($r.Body.data.status)"
$r = Call-Api -Method GET -Path "/orders/$orderId" -Token $buyer
Add-Result "order became PAID with a ticket" ($r.Status -eq 200 -and $r.Body.data.status -eq "PAID" -and @($r.Body.data.tickets).Count -ge 1) "status=$($r.Status) order=$($r.Body.data.status) tickets=$(@($r.Body.data.tickets).Count)"

Write-Step "8/9 Checked-in ticket and post-cutoff refund rejection"
$r = Call-Api -Method POST -Path "/admin/performances" -Token $admin -Body @{
    event_id = $eventId
    venue_id = 1
    starts_at = (Iso $now.AddMinutes(30))
    sale_start_at = (Iso $now.AddHours(-1))
    sale_end_at = (Iso $now.AddMinutes(20))
    checkin_start_at = (Iso $now.AddHours(-1))
    checkin_end_at = (Iso $now.AddHours(1))
    price_tiers = @(@{ tier_name = "Standard"; price_cents = 22000 })
}
$usedPerf = $r.Body.data.performance_id
Call-Api -Method POST -Path "/admin/performances/$usedPerf/publish" -Token $admin | Out-Null
$seats = Available-Seats $usedPerf 1
$r = Call-Api -Method POST -Path "/orders" -Token $buyer -IdempotencyKey ("M3-USED-" + [guid]::NewGuid().ToString("N")) -Body @{
    performance_id = $usedPerf
    session_seat_ids = @($seats[0].session_seat_id)
}
$usedOrder = $r.Body.data.order_id
$r = Call-Api -Method POST -Path "/payments" -Token $buyer -Body @{ order_id = $usedOrder }
$usedPayment = $r.Body.data.payment_id
Call-Api -Method POST -Path "/payments/$usedPayment/simulate" -Token $buyer -Body @{ result = "SUCCESS" } | Out-Null
$r = Call-Api -Method GET -Path "/orders/$usedOrder" -Token $buyer
$usedTicket = @($r.Body.data.tickets)[0].ticket_id
$r = Call-Api -Method GET -Path "/tickets/$usedTicket" -Token $buyer
$usedQr = $r.Body.data.qr_token
$r = Call-Api -Method POST -Path "/admin/checkins" -Token $admin -IdempotencyKey ("M3-USED-CHK-" + [guid]::NewGuid().ToString("N")) -Body @{
    performance_id = $usedPerf
    ticket_code = $usedQr
}
Add-Result "fixture ticket checked in" ($r.Status -eq 200 -and $r.Body.data.result -eq "OK") "status=$($r.Status) seat=$($r.Body.data.seat_label)"
$r = Call-Api -Method POST -Path "/orders/$usedOrder/refund" -Token $buyer -IdempotencyKey ("M3-USED-REF-" + [guid]::NewGuid().ToString("N")) -Body @{ reason = "Used ticket" }
Add-Result "used ticket refund rejected" ($r.Status -eq 409 -and $r.Body.code -eq "REFUND_NOT_ALLOWED") "status=$($r.Status) code=$($r.Body.code)"

$r = Call-Api -Method POST -Path "/admin/performances" -Token $admin -Body @{
    event_id = $eventId
    venue_id = 2
    starts_at = (Iso $now.AddHours(12))
    sale_start_at = (Iso $now.AddHours(-1))
    sale_end_at = (Iso $now.AddHours(11))
    checkin_start_at = (Iso $now.AddHours(10))
    checkin_end_at = (Iso $now.AddHours(13))
    price_tiers = @(@{ tier_name = "Standard"; price_cents = 24000 })
}
$cutoffPerf = $r.Body.data.performance_id
Call-Api -Method POST -Path "/admin/performances/$cutoffPerf/publish" -Token $admin | Out-Null
$seats = Available-Seats $cutoffPerf 1
$r = Call-Api -Method POST -Path "/orders" -Token $buyer -IdempotencyKey ("M3-CUTOFF-" + [guid]::NewGuid().ToString("N")) -Body @{
    performance_id = $cutoffPerf
    session_seat_ids = @($seats[0].session_seat_id)
}
$cutoffOrder = $r.Body.data.order_id
$r = Call-Api -Method POST -Path "/payments" -Token $buyer -Body @{ order_id = $cutoffOrder }
$cutoffPayment = $r.Body.data.payment_id
Call-Api -Method POST -Path "/payments/$cutoffPayment/simulate" -Token $buyer -Body @{ result = "SUCCESS" } | Out-Null
$r = Call-Api -Method POST -Path "/orders/$cutoffOrder/refund" -Token $buyer -IdempotencyKey ("M3-CUTOFF-REF-" + [guid]::NewGuid().ToString("N")) -Body @{ reason = "Inside 24h" }
Add-Result "refund inside 24h rejected" ($r.Status -eq 409 -and $r.Body.code -eq "REFUND_NOT_ALLOWED") "status=$($r.Status) code=$($r.Body.code)"

Write-Step "9/9 Results"
$failed = @($script:results | Where-Object { -not $_.Pass })
Write-Host ""
Write-Host ("=== M3 {0}/{1} passed ===" -f ($script:results.Count - $failed.Count), $script:results.Count) -ForegroundColor $(if ($failed.Count -eq 0) { "Green" } else { "Red" })
if ($failed.Count -gt 0) {
    $failed | ForEach-Object { Write-Fail2 "$($_.Name) — $($_.Detail)" }
    exit 1
}
Write-Host "Note: this test writes accounts, role assignments, orders, and payment notifications; run scripts\reset_demo.ps1 to restore demo data" -ForegroundColor Yellow

