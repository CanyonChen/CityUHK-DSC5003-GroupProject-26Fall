param(
    [string]$BaseUrl = "http://localhost:3000"
)

# M2 acceptance: admin back office, refunds, gate check-in, reconciliation.
# Writes test events / performances / orders. Run .\scripts\reset_demo.ps1 afterwards.

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

function Login([string]$Username) {
    $r = Call-Api -Method POST -Path "/auth/login" -Body @{ user_name = $Username; password = "Demo@1234" }
    if ($r.Status -ne 200) { throw "Login $Username failed: $($r.Status)" }
    $r.Body.data.token
}

function Iso([datetimeoffset]$Value) { "{0:yyyy-MM-ddTHH:mm:sszzz}" -f $Value }

function Available-Seats([int]$PerformanceId, [int]$Count) {
    $r = Call-Api -Method GET -Path "/performances/$PerformanceId/seats"
    @($r.Body.data.seats | Where-Object { $_.status -eq "AVAILABLE" } | Select-Object -First $Count)
}

function Clear-Pending([string]$Token) {
    $r = Call-Api -Method GET -Path "/orders?status=PENDING_PAYMENT&page_size=100" -Token $Token
    if ($r.Status -ne 200) { return }
    foreach ($o in @($r.Body.data.items)) {
        Call-Api -Method POST -Path "/orders/$($o.order_id)/cancel" -Token $Token | Out-Null
    }
}

Write-Step "0/8 Check API"
if (-not (Test-TcpPort $Cfg.ApiPort)) {
    Write-Warn2 "$BaseUrl is not listening; run .\scripts\dev.ps1 first"
    exit 0
}
Write-Ok "API port $($Cfg.ApiPort) is listening"

$admin = Login "admin"
$checker = Login "checker01"
$buyer = Login "buyer01"
$buyer2 = Login "buyer02"
Clear-Pending $buyer
Clear-Pending $buyer2

Write-Step "1/8 Roles and admin entry"
$r = Call-Api -Method GET -Path "/admin/events?page_size=5" -Token $buyer
Add-Result "buyer blocked from /admin/events" ($r.Status -eq 403) "status=$($r.Status)"
$r = Call-Api -Method GET -Path "/admin/events?page_size=5" -Token $checker
Add-Result "checker blocked from /admin/events" ($r.Status -eq 403) "status=$($r.Status)"
$r = Call-Api -Method GET -Path "/admin/checker/performances" -Token $checker
Add-Result "checker can list gate performances" ($r.Status -eq 200 -and @($r.Body.data.items).Count -ge 1) "status=$($r.Status) count=$(@($r.Body.data.items).Count)"
$r = Call-Api -Method GET -Path "/admin/venues" -Token $admin
Add-Result "admin can list venues" ($r.Status -eq 200 -and @($r.Body.data.items).Count -ge 1) "status=$($r.Status) venues=$(@($r.Body.data.items).Count)"

Write-Step "2/8 Event create and edit"
$stamp = Get-Date -Format "MMdd-HHmm"
$eventTitle = "M2 Verify $stamp"
$r = Call-Api -Method POST -Path "/admin/events" -Token $admin -Body @{
    title = $eventTitle
    organizer_name = "StagePass Verification"
    description = "Automated M2 acceptance fixture."
}
$eventId = $r.Body.data.event_id
Add-Result "create event 201" ($r.Status -eq 201 -and $eventId) "status=$($r.Status) event=$eventId"
$r = Call-Api -Method PATCH -Path "/admin/events/$eventId" -Token $admin -Body @{ title = "$eventTitle (edited)"; organizer_name = "StagePass Verification" }
Add-Result "edit event 200" ($r.Status -eq 200) "status=$($r.Status)"

Write-Step "3/8 Performances / publishing / pricing"
$now = [datetimeoffset]::Now
$start = $now.AddHours(2)
$saleStart = $now.AddHours(-1)
$saleEnd = $start.AddMinutes(-30)
$gateStart = $now.AddHours(-1)
$gateEnd = $start.AddMinutes(30)
$r = Call-Api -Method POST -Path "/admin/performances" -Token $admin -Body @{
    event_id = $eventId
    venue_id = 1
    starts_at = (Iso $start)
    sale_start_at = (Iso $saleStart)
    sale_end_at = (Iso $saleEnd)
    checkin_start_at = (Iso $gateStart)
    checkin_end_at = (Iso $gateEnd)
    price_tiers = @(
        @{ tier_name = "Premium"; price_cents = 52000 },
        @{ tier_name = "Standard"; price_cents = 32000 },
        @{ tier_name = "Economy"; price_cents = 18000 }
    )
}
$perfId = $r.Body.data.performance_id
Add-Result "create performance 201, seats materialised" ($r.Status -eq 201 -and $r.Body.data.seat_count -eq 200) "status=$($r.Status) perf=$perfId seats=$($r.Body.data.seat_count)"
$r = Call-Api -Method GET -Path "/admin/performances/$perfId" -Token $admin
$tiers = @($r.Body.data.price_tiers)
Add-Result "performance detail has 3 tiers" ($r.Status -eq 200 -and $tiers.Count -eq 3) "status=$($r.Status) tiers=$($tiers.Count)"
$r = Call-Api -Method POST -Path "/admin/performances/$perfId/publish" -Token $admin
Add-Result "publish performance" ($r.Status -eq 200 -and $r.Body.data.status -eq "PUBLISHED") "status=$($r.Status) state=$($r.Body.data.status)"
$newTiers = @($tiers | ForEach-Object { @{ tier_name = $_.tier_name; price_cents = ([int]$_.price_cents + 1000) } })
$r = Call-Api -Method PATCH -Path "/admin/performances/$perfId/price-tiers" -Token $admin -Body @{ tiers = $newTiers }
Add-Result "update price tiers" ($r.Status -eq 200 -and @($r.Body.data.price_tiers).Count -eq 3) "status=$($r.Status)"
$r = Call-Api -Method POST -Path "/admin/performances/$perfId/sales" -Token $admin -Body @{ action = "pause" }
Add-Result "pause sales" ($r.Status -eq 200 -and $r.Body.data.status -eq "SALES_PAUSED") "status=$($r.Status) state=$($r.Body.data.status)"
$r = Call-Api -Method POST -Path "/admin/performances/$perfId/sales" -Token $admin -Body @{ action = "resume" }
Add-Result "resume sales" ($r.Status -eq 200 -and $r.Body.data.status -eq "PUBLISHED") "status=$($r.Status) state=$($r.Body.data.status)"
$r = Call-Api -Method GET -Path "/performances/$perfId/seats"
$freeSeat = @($r.Body.data.seats | Where-Object { $_.status -eq "AVAILABLE" })[0]
$r = Call-Api -Method PATCH -Path "/admin/session-seats/$($freeSeat.session_seat_id)" -Token $admin -Body @{ status = "BLOCKED" }
$r2 = Call-Api -Method GET -Path "/performances/$perfId/seats"
$blockedSeat = @($r2.Body.data.seats | Where-Object { $_.session_seat_id -eq $freeSeat.session_seat_id })[0]
Add-Result "block free seat" ($r.Status -eq 200 -and $blockedSeat.status -eq "BLOCKED") "status=$($r.Status) seat=$($freeSeat.region)-$($freeSeat.row_no)-$($freeSeat.seat_no)"
$r = Call-Api -Method PATCH -Path "/admin/session-seats/$($freeSeat.session_seat_id)" -Token $admin -Body @{ status = "AVAILABLE" }
$r2 = Call-Api -Method GET -Path "/performances/$perfId/seats"
$freeAgain = @($r2.Body.data.seats | Where-Object { $_.session_seat_id -eq $freeSeat.session_seat_id })[0]
Add-Result "restore seat" ($r.Status -eq 200 -and $freeAgain.status -eq "AVAILABLE") "status=$($r.Status)"
$r = Call-Api -Method GET -Path "/performances/$perfId/seats"
$region = @($r.Body.data.seats | Where-Object { $_.status -eq "AVAILABLE" })[0].region
$regionBefore = @($r.Body.data.seats | Where-Object { $_.region -eq $region -and $_.status -eq "AVAILABLE" }).Count
$r = Call-Api -Method PATCH -Path "/admin/performances/$perfId/seat-status" -Token $admin -Body @{ status = "BLOCKED"; region = $region }
$r2 = Call-Api -Method GET -Path "/performances/$perfId/seats"
$regionAfter = @($r2.Body.data.seats | Where-Object { $_.region -eq $region -and $_.status -eq "AVAILABLE" }).Count
Add-Result "bulk block whole region" ($r.Status -eq 200 -and $r.Body.data.updated -eq $regionBefore -and $regionAfter -eq 0) "status=$($r.Status) region=$region changed=$($r.Body.data.updated)"
$r = Call-Api -Method PATCH -Path "/admin/performances/$perfId/seat-status" -Token $admin -Body @{ status = "AVAILABLE"; region = $region }
$r2 = Call-Api -Method GET -Path "/performances/$perfId/seats"
$regionRestored = @($r2.Body.data.seats | Where-Object { $_.region -eq $region -and $_.status -eq "AVAILABLE" }).Count
Add-Result "bulk restore whole region" ($r.Status -eq 200 -and $regionRestored -eq $regionBefore) "status=$($r.Status) restored=$regionRestored"
$pair = @($r2.Body.data.seats | Where-Object { $_.status -eq "AVAILABLE" } | Select-Object -First 2)
$pairIds = @($pair | ForEach-Object { $_.session_seat_id })
$r = Call-Api -Method PATCH -Path "/admin/performances/$perfId/seat-status" -Token $admin -Body @{ status = "BLOCKED"; session_seat_ids = $pairIds }
$r2 = Call-Api -Method GET -Path "/performances/$perfId/seats"
$pairBlocked = @($r2.Body.data.seats | Where-Object { $pairIds -contains $_.session_seat_id -and $_.status -eq "BLOCKED" }).Count
Add-Result "bulk block selected ids" ($r.Status -eq 200 -and $r.Body.data.updated -eq 2 -and $pairBlocked -eq 2) "status=$($r.Status) changed=$($r.Body.data.updated)"
$r = Call-Api -Method PATCH -Path "/admin/performances/$perfId/seat-status" -Token $admin -Body @{ status = "AVAILABLE"; session_seat_ids = $pairIds }
$r2 = Call-Api -Method GET -Path "/performances/$perfId/seats"
$pairRestored = @($r2.Body.data.seats | Where-Object { $pairIds -contains $_.session_seat_id -and $_.status -eq "AVAILABLE" }).Count
Add-Result "bulk restore selected ids" ($r.Status -eq 200 -and $pairRestored -eq 2) "status=$($r.Status) restored=$pairRestored"

Write-Step "4/8 Order / payment / ticket issuance"
$seats = Available-Seats $perfId 2
if ($seats.Count -lt 2) { throw "Not enough available seats on performance $perfId" }
$r = Call-Api -Method POST -Path "/orders" -Token $buyer -IdempotencyKey ("M2-LIVE-" + [guid]::NewGuid().ToString("N")) -Body @{
    performance_id = $perfId
    session_seat_ids = @($seats[0].session_seat_id, $seats[1].session_seat_id)
}
$orderId = $r.Body.data.order_id
Add-Result "create order 201" ($r.Status -eq 201 -and $r.Body.data.status -eq "PENDING_PAYMENT") "status=$($r.Status) order=$orderId"
$r = Call-Api -Method POST -Path "/payments" -Token $buyer -Body @{ order_id = $orderId }
$paymentId = $r.Body.data.payment_id
$r = Call-Api -Method POST -Path "/payments/$paymentId/simulate" -Token $buyer -Body @{ result = "SUCCESS" }
Add-Result "pay order, 2 tickets issued" ($r.Status -eq 200 -and $r.Body.data.tickets_issued -eq 2) "status=$($r.Status) tickets=$($r.Body.data.tickets_issued)"
$r = Call-Api -Method GET -Path "/orders/$orderId" -Token $buyer
$ticketId = @($r.Body.data.tickets)[0].ticket_id
$r = Call-Api -Method GET -Path "/tickets/$ticketId" -Token $buyer
$qr = $r.Body.data.qr_token
Add-Result "ticket QR issued" ($r.Status -eq 200 -and $qr) "status=$($r.Status) ticket=$ticketId qr_len=$($qr.Length)"

Write-Step "5/8 Check-in success / duplicate / authorization"
$r = Call-Api -Method POST -Path "/admin/checkins" -Token $admin -IdempotencyKey ("M2-CHK-" + [guid]::NewGuid().ToString("N")) -Body @{
    performance_id = $perfId
    ticket_code = $qr
}
Add-Result "check-in OK" ($r.Status -eq 200 -and $r.Body.data.result -eq "OK") "status=$($r.Status) seat=$($r.Body.data.seat_label)"
$r = Call-Api -Method POST -Path "/admin/checkins" -Token $admin -IdempotencyKey ("M2-CHK-" + [guid]::NewGuid().ToString("N")) -Body @{
    performance_id = $perfId
    ticket_code = $qr
}
Add-Result "duplicate scan blocked" ($r.Status -eq 409 -and $r.Body.code -eq "TICKET_ALREADY_USED") "status=$($r.Status) code=$($r.Body.code)"
$r = Call-Api -Method POST -Path "/admin/checkins" -Token $buyer -IdempotencyKey ("M2-CHK-" + [guid]::NewGuid().ToString("N")) -Body @{
    performance_id = $perfId
    ticket_code = $qr
}
Add-Result "buyer blocked from check-in" ($r.Status -eq 403) "status=$($r.Status) code=$($r.Body.code)"
$r = Call-Api -Method POST -Path "/admin/checkins" -Token $checker -IdempotencyKey ("M2-CHK-" + [guid]::NewGuid().ToString("N")) -Body @{
    performance_id = $perfId
    ticket_code = $qr
}
Add-Result "checker blocked on unassigned gate" ($r.Status -eq 403) "status=$($r.Status) code=$($r.Body.code)"
$r = Call-Api -Method GET -Path "/admin/checkins?performance_id=$perfId" -Token $admin
Add-Result "check-in ledger shows record" ($r.Status -eq 200 -and @($r.Body.data.items).Count -ge 1) "status=$($r.Status) count=$($r.Body.data.total)"

Write-Step "6/8 User refund / idempotency / 24h rule"
$refundStart = $now.AddDays(3)
$r = Call-Api -Method POST -Path "/admin/performances" -Token $admin -Body @{
    event_id = $eventId
    venue_id = 2
    starts_at = (Iso $refundStart)
    sale_start_at = (Iso $now.AddHours(-1))
    sale_end_at = (Iso $refundStart.AddHours(-1))
    checkin_start_at = (Iso $refundStart.AddHours(-2))
    checkin_end_at = (Iso $refundStart.AddHours(2))
    price_tiers = @(@{ tier_name = "Standard"; price_cents = 26000 })
}
$refundPerf = $r.Body.data.performance_id
Call-Api -Method POST -Path "/admin/performances/$refundPerf/publish" -Token $admin | Out-Null
$seats = Available-Seats $refundPerf 1
$r = Call-Api -Method POST -Path "/orders" -Token $buyer2 -IdempotencyKey ("M2-REFUND-" + [guid]::NewGuid().ToString("N")) -Body @{
    performance_id = $refundPerf
    session_seat_ids = @($seats[0].session_seat_id)
}
$refundOrder = $r.Body.data.order_id
$r = Call-Api -Method POST -Path "/payments" -Token $buyer2 -Body @{ order_id = $refundOrder }
$r = Call-Api -Method POST -Path "/payments/$($r.Body.data.payment_id)/simulate" -Token $buyer2 -Body @{ result = "SUCCESS" }
Add-Result "refund fixture paid" ($r.Status -eq 200 -and $r.Body.data.order_status -eq "PAID") "status=$($r.Status) order=$refundOrder"
$key = "M2-REFUND-REQ-" + [guid]::NewGuid().ToString("N")
$r = Call-Api -Method POST -Path "/orders/$refundOrder/refund" -Token $buyer2 -IdempotencyKey $key -Body @{ reason = "Schedule clash" }
$refundId = $r.Body.data.refund_id
Add-Result "refund request 201 PENDING" ($r.Status -eq 201 -and $r.Body.data.status -eq "PENDING" -and $r.Body.data.order_status -eq "REFUND_PENDING") "status=$($r.Status) refund=$refundId"
$r2 = Call-Api -Method POST -Path "/orders/$refundOrder/refund" -Token $buyer2 -IdempotencyKey $key -Body @{ reason = "Schedule clash" }
Add-Result "refund replay same key 200" ($r2.Status -eq 200 -and $r2.Body.data.refund_id -eq $refundId) "status=$($r2.Status) refund=$($r2.Body.data.refund_id)"
$r3 = Call-Api -Method POST -Path "/orders/$refundOrder/refund" -Token $buyer2 -IdempotencyKey ("M2-REFUND-2-" + [guid]::NewGuid().ToString("N")) -Body @{}
Add-Result "second refund 409" ($r3.Status -eq 409 -and $r3.Body.code -eq "REFUND_NOT_ALLOWED") "status=$($r3.Status) code=$($r3.Body.code)"
$r = Call-Api -Method GET -Path "/admin/refunds?order_id=$refundOrder" -Token $admin
Add-Result "admin refund list shows request" ($r.Status -eq 200 -and @($r.Body.data.items).Count -ge 1) "status=$($r.Status) total=$($r.Body.data.total)"
$r = Call-Api -Method GET -Path "/orders/$refundOrder" -Token $buyer2
$refundTicketId = @($r.Body.data.tickets)[0].ticket_id
$r = Call-Api -Method POST -Path "/admin/refunds/$refundId/resolve" -Token $admin -Body @{ result = "FAILED" }
Add-Result "admin marks refund failed" ($r.Status -eq 200 -and $r.Body.data.refund.status -eq "FAILED" -and $r.Body.data.orderStatus -eq "PAID") "status=$($r.Status) order=$($r.Body.data.orderStatus)"
$r = Call-Api -Method GET -Path "/orders/$refundOrder" -Token $buyer2
Add-Result "failed refund restores PAID + VALID ticket" ($r.Body.data.status -eq "PAID" -and @($r.Body.data.tickets)[0].status -eq "VALID") "order=$($r.Body.data.status) ticket=$(@($r.Body.data.tickets)[0].status)"
$r = Call-Api -Method GET -Path "/performances/$refundPerf/seats"
$refundSeatStillSold = @($r.Body.data.seats | Where-Object { $_.session_seat_id -eq $seats[0].session_seat_id })[0]
Add-Result "failed refund keeps seat SOLD" ($refundSeatStillSold.status -eq "SOLD") "seat=$($refundSeatStillSold.status)"
$key2 = "M2-REFUND-REQ2-" + [guid]::NewGuid().ToString("N")
$r = Call-Api -Method POST -Path "/orders/$refundOrder/refund" -Token $buyer2 -IdempotencyKey $key2 -Body @{ reason = "Retry after failed refund" }
$refundId2 = $r.Body.data.refund_id
Add-Result "new refund after failure 201" ($r.Status -eq 201 -and $r.Body.data.status -eq "PENDING" -and $refundId2) "status=$($r.Status) refund=$refundId2"
$r = Call-Api -Method POST -Path "/admin/refunds/$refundId2/resolve" -Token $admin -Body @{ result = "SUCCEEDED" }
Add-Result "admin marks refund succeeded" ($r.Status -eq 200 -and $r.Body.data.refund.status -eq "SUCCEEDED" -and $r.Body.data.orderStatus -eq "REFUNDED" -and $r.Body.data.released_seats -eq 1) "status=$($r.Status) released=$($r.Body.data.released_seats)"
$r = Call-Api -Method GET -Path "/orders/$refundOrder" -Token $buyer2
Add-Result "successful refund voids ticket" ($r.Body.data.status -eq "REFUNDED" -and @($r.Body.data.tickets)[0].status -eq "VOID") "order=$($r.Body.data.status) ticket=$(@($r.Body.data.tickets)[0].status)"
$r = Call-Api -Method GET -Path "/performances/$refundPerf/seats"
$refundSeatReleased = @($r.Body.data.seats | Where-Object { $_.session_seat_id -eq $seats[0].session_seat_id })[0]
Add-Result "successful refund releases seat" ($refundSeatReleased.status -eq "AVAILABLE") "seat=$($refundSeatReleased.status)"
$r = Call-Api -Method POST -Path "/admin/refunds/$refundId2/resolve" -Token $admin -Body @{ result = "SUCCEEDED" }
Add-Result "same refund result replay 200" ($r.Status -eq 200 -and $r.Body.data.replayed -eq $true) "status=$($r.Status) replayed=$($r.Body.data.replayed)"
$r = Call-Api -Method POST -Path "/admin/refunds/$refundId2/resolve" -Token $admin -Body @{ result = "FAILED" }
Add-Result "different refund result 409" ($r.Status -eq 409 -and $r.Body.code -eq "REFUND_ALREADY_RESOLVED") "status=$($r.Status) code=$($r.Body.code)"

Write-Step "7/8 Reconciliation / anomaly / audit"
$r = Call-Api -Method GET -Path "/admin/payments/exceptions?page_size=100" -Token $admin
Add-Result "payment exceptions readable" ($r.Status -eq 200) "status=$($r.Status) open=$($r.Body.data.total)"
if ($r.Status -eq 200 -and @($r.Body.data.items).Count -ge 1) {
    $payId = @($r.Body.data.items)[0].payment_id
    $r2 = Call-Api -Method POST -Path "/admin/payments/$payId/reconcile" -Token $admin
    Add-Result "reconcile endpoint responds" ($r2.Status -eq 200 -and $r2.Body.data.result -in @("APPLIED","FAILED","STILL_UNKNOWN")) "status=$($r2.Status) result=$($r2.Body.data.result)"
}
$r = Call-Api -Method GET -Path "/admin/audit-logs?page_size=5" -Token $admin
Add-Result "audit log readable" ($r.Status -eq 200 -and @($r.Body.data.items).Count -ge 1) "status=$($r.Status) entries=$($r.Body.data.total)"
$r = Call-Api -Method GET -Path "/admin/stats" -Token $admin
$row = @($r.Body.data.items | Where-Object { $_.performance_id -eq $perfId })
Add-Result "sales stats include new performance" ($r.Status -eq 200 -and $row.Count -eq 1 -and $row[0].tickets_sold -ge 2) "status=$($r.Status) sold=$($row[0].tickets_sold)"
$r = Call-Api -Method GET -Path "/admin/orders?performance_id=$refundPerf&page_size=20" -Token $admin
Add-Result "admin order search by performance" ($r.Status -eq 200 -and @($r.Body.data.items | Where-Object { $_.order_id -eq $refundOrder }).Count -eq 1) "status=$($r.Status)"

Write-Step "8/8 Summary"
$pass = ($script:results | Where-Object Pass).Count
$fail = ($script:results | Where-Object { -not $_.Pass }).Count
Write-Host ""
Write-Host ("M2 smoke: PASS $pass / FAIL $fail") -ForegroundColor $(if ($fail -eq 0) { "Green" } else { "Red" })
Write-Host "Test data: event=$eventId, live performance=$perfId, refund performance=$refundPerf, refund=$refundId"
Write-Info "Run .\scripts\reset_demo.ps1 afterwards to restore demo data"
if ($fail -gt 0) {
    $script:results | Where-Object { -not $_.Pass } | ForEach-Object { Write-Host "  - $($_.Name)：$($_.Detail)" -ForegroundColor Red }
    exit 1
}
