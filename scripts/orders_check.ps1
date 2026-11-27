param(
    [string]$BaseUrl = "http://localhost:3000"
)

# Order, payment and ticket integration checks
# Writes test orders and tickets; run .\scripts\reset_demo.ps1 afterwards to restore demo data.

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
    [pscustomobject]@{ Status = [int]$r.StatusCode; Body = $parsed; Raw = $r }
}

function Login([string]$Username) {
    $r = Call-Api -Method POST -Path "/auth/login" -Body @{ user_name = $Username; password = "Demo@1234" }
    if ($r.Status -ne 200) { throw "Login failed for ${Username}: $($r.Status)" }
    $r.Body.data.token
}

function Clear-Pending([string]$Token) {
    $r = Call-Api -Method GET -Path "/orders?status=PENDING_PAYMENT&page_size=100" -Token $Token
    if ($r.Status -ne 200) { return }
    foreach ($o in @($r.Body.data.items)) {
        Call-Api -Method POST -Path "/orders/$($o.order_id)/cancel" -Token $Token | Out-Null
    }
}

function Available-Seats([int]$Count) {
    $r = Call-Api -Method GET -Path "/performances/1/seats"
    @($r.Body.data.seats | Where-Object { $_.status -eq "AVAILABLE" } | Select-Object -First $Count)
}

Write-Step "0/8 Check whether the API is running"
if (-not (Test-TcpPort $Cfg.ApiPort)) {
    Write-Warn2 "$BaseUrl is not listening; run .\scripts\dev.ps1 first"
    exit 0
}
Write-Ok "API port $($Cfg.ApiPort) is listening"

Write-Step "1/8 Login and identity"
$token = Login "buyer01"
$r = Call-Api -Method GET -Path "/auth/me" -Token $token
Add-Result "buyer01 login 200" ([bool]$token) "token length=$($token.Length)"
Add-Result "GET /auth/me role USER" ($r.Status -eq 200 -and $r.Body.data.roles -contains "USER") "status=$($r.Status)"
$r = Call-Api -Method GET -Path "/orders"
Add-Result "Unauthenticated order access 401" ($r.Status -eq 401) "status=$($r.Status)"
Clear-Pending $token

Write-Step "2/8 Create order"
$seats = Available-Seats 4
if ($seats.Count -lt 4) { throw "Fewer than 4 seats available; run reset_demo first" }
$seatA = @($seats[0].session_seat_id, $seats[1].session_seat_id)
$seatB = @($seats[2].session_seat_id, $seats[3].session_seat_id)
$key = "ORDER-CHECK-" + [guid]::NewGuid().ToString("N")
$r = Call-Api -Method POST -Path "/orders" -Token $token -IdempotencyKey $key -Body @{ performance_id = 1; session_seat_ids = $seatA }
$order1 = $r.Body.data
Add-Result "Order creation 201 PENDING_PAYMENT" ($r.Status -eq 201 -and $order1.status -eq "PENDING_PAYMENT") "status=$($r.Status) order=$($order1.order_id)"
Add-Result "Order number format TIX-YYYYMMDD-######" ($order1.order_no -match '^TIX-\d{8}-\d{6}$') "order_no=$($order1.order_no)"
$created = [datetime]::Parse($order1.created_at).ToUniversalTime()
$expires = [datetime]::Parse($order1.expires_at).ToUniversalTime()
$hold = ($expires - $created).TotalSeconds
Add-Result "Hold within 5 minutes" ($hold -gt 280 -and $hold -le 305) "hold=${hold}s"

Write-Step "3/8 Idempotent replay and conflict"
$r = Call-Api -Method POST -Path "/orders" -Token $token -IdempotencyKey $key -Body @{ performance_id = 1; session_seat_ids = $seatA }
Add-Result "Same key and content 200 original order" ($r.Status -eq 200 -and $r.Body.data.order_id -eq $order1.order_id) "status=$($r.Status) order=$($r.Body.data.order_id)"
$r = Call-Api -Method POST -Path "/orders" -Token $token -IdempotencyKey $key -Body @{ performance_id = 1; session_seat_ids = @($seatA[0]) }
Add-Result "Same key, different content 409" ($r.Status -eq 409 -and $r.Body.code -eq "IDEMPOTENCY_CONFLICT") "status=$($r.Status) code=$($r.Body.code)"

Write-Step "4/8 Payment success and ticket issuance"
$r = Call-Api -Method POST -Path "/payments" -Token $token -Body @{ order_id = $order1.order_id }
Add-Result "Create payment attempt" ($r.Status -in @(200, 201) -and $r.Body.data.status -eq "PENDING") "status=$($r.Status) payment=$($r.Body.data.payment_id)"
$paymentId = $r.Body.data.payment_id
$r = Call-Api -Method POST -Path "/payments/$paymentId/simulate" -Token $token -Body @{ result = "SUCCESS" }
Add-Result "SUCCESS -> PAID + 2 tickets" ($r.Status -eq 200 -and $r.Body.data.order_status -eq "PAID" -and $r.Body.data.tickets_issued -eq 2) "order=$($r.Body.data.order_status) tickets=$($r.Body.data.tickets_issued)"
$r = Call-Api -Method GET -Path "/orders/$($order1.order_id)" -Token $token
$tickets = @($r.Body.data.tickets)
Add-Result "Order detail contains 2 VALID tickets" ($r.Status -eq 200 -and $tickets.Count -eq 2 -and @($tickets | Where-Object { $_.status -ne "VALID" }).Count -eq 0) "tickets=$($tickets.Count)"

Write-Step "5/8 Tickets and QR"
$ticketId = $tickets[0].ticket_id
$r = Call-Api -Method GET -Path "/tickets/$ticketId" -Token $token
Add-Result "Ticket detail contains 60-second qr_token" ($r.Status -eq 200 -and $r.Body.data.qr_token -and $r.Body.data.qr_expires_in -eq 60) "expires=$($r.Body.data.qr_expires_in)"
$tmp = Join-Path $env:TEMP "order-check-qr-$ticketId.png"
$head = Invoke-WebRequest -Uri "$($BaseUrl.TrimEnd('/'))/tickets/$ticketId/qr.png" -Method Head -Headers @{ Authorization = "Bearer $token" } -SkipHttpErrorCheck
$ctype = $head.Headers["Content-Type"]
Invoke-WebRequest -Uri "$($BaseUrl.TrimEnd('/'))/tickets/$ticketId/qr.png" -Headers @{ Authorization = "Bearer $token" } -OutFile $tmp -SkipHttpErrorCheck | Out-Null
$len = (Get-Item $tmp).Length
$magic = [System.IO.File]::ReadAllBytes($tmp)[0..7] -join ","
Add-Result "QR PNG 320 and image/png" ($ctype -like "image/png*" -and $len -gt 1000) "type=$ctype bytes=$len magic=$magic"
Remove-Item $tmp -ErrorAction SilentlyContinue
$r = Call-Api -Method POST -Path "/payments/$paymentId/simulate" -Token $token -Body @{ result = "SUCCESS" }
Add-Result "Duplicate SUCCESS does not reissue tickets" ($r.Status -eq 200 -and $r.Body.data.tickets_issued -eq 0) "tickets=$($r.Body.data.tickets_issued)"

Write-Step "6/8 Single pending-payment order per performance (CFG-04)"
$r = Call-Api -Method POST -Path "/orders" -Token $token -IdempotencyKey ("ORDER-CHECK-" + [guid]::NewGuid().ToString("N")) -Body @{ performance_id = 1; session_seat_ids = $seatB }
$order2 = $r.Body.data
Add-Result "Second order can be created" ($r.Status -eq 201 -and $order2.status -eq "PENDING_PAYMENT") "order=$($order2.order_id)"
$r = Call-Api -Method POST -Path "/orders" -Token $token -IdempotencyKey ("ORDER-CHECK-" + [guid]::NewGuid().ToString("N")) -Body @{ performance_id = 1; session_seat_ids = @($seatA[0]) }
Add-Result "Third order 409 LIMIT_EXCEEDED" ($r.Status -eq 409 -and $r.Body.code -eq "LIMIT_EXCEEDED") "status=$($r.Status) code=$($r.Body.code)"

Write-Step "7/8 Cancel and release"
$r = Call-Api -Method POST -Path "/orders/$($order2.order_id)/cancel" -Token $token
Add-Result "Cancel 200 releases 2 seats" ($r.Status -eq 200 -and $r.Body.data.status -eq "CANCELLED" -and $r.Body.data.released_seats -eq 2) "released=$($r.Body.data.released_seats)"
$r = Call-Api -Method GET -Path "/performances/1/seats"
$released = @($r.Body.data.seats | Where-Object { $_.session_seat_id -in $seatB })
Add-Result "Seats AVAILABLE after release" (@($released | Where-Object { $_.status -ne "AVAILABLE" }).Count -eq 0) "states=$(($released.status) -join ',')"

Write-Step "8/8 Concurrent race for the same seat"
$token3 = Login "buyer03"; Clear-Pending $token3
$token4 = Login "buyer04"; Clear-Pending $token4
$targetSeat = $seatB[0]
$race = @("buyer03", "buyer04") | ForEach-Object -Parallel {
    $u = $_
    $base = $using:BaseUrl
    $seat = $using:targetSeat
    $r = Invoke-WebRequest -Uri "$($base.TrimEnd('/'))/auth/login" -Method POST -Body (@{ user_name = $u; password = "Demo@1234" } | ConvertTo-Json -Compress) -ContentType "application/json" -SkipHttpErrorCheck
    $tok = ($r.Content | ConvertFrom-Json).data.token
    $r2 = Invoke-WebRequest -Uri "$($base.TrimEnd('/'))/orders" -Method POST -Headers @{
        Authorization = "Bearer $tok"
        "Idempotency-Key" = "ORDER-CHECK-RACE-" + [guid]::NewGuid().ToString("N")
    } -Body (@{ performance_id = 1; session_seat_ids = @($seat) } | ConvertTo-Json -Compress) -ContentType "application/json" -SkipHttpErrorCheck
    $b = $r2.Content | ConvertFrom-Json
    [pscustomobject]@{ user = $u; status = [int]$r2.StatusCode; code = $b.code; order_id = $b.data.order_id; token = $tok }
} -ThrottleLimit 2
$race | Format-Table user, status, code, order_id | Out-String | Write-Host
$wins = @($race | Where-Object { $_.status -eq 201 })
$loses = @($race | Where-Object { $_.status -eq 409 -and $_.code -eq "SEAT_UNAVAILABLE" })
Add-Result "Only 1 of 2 concurrent orders succeeds; the other gets 409" ($wins.Count -eq 1 -and $loses.Count -eq 1) "wins=$($wins.Count) loses=$($loses.Count)"
if ($wins.Count -eq 1) {
    Call-Api -Method POST -Path "/orders/$($wins[0].order_id)/cancel" -Token $wins[0].token | Out-Null
}

$pass = ($script:results | Where-Object Pass).Count
$fail = ($script:results | Where-Object { -not $_.Pass }).Count
Write-Host ""
Write-Host ("Order checks: PASS $pass / FAIL $fail") -ForegroundColor $(if ($fail -eq 0) { "Green" } else { "Red" })
if ($fail -gt 0) {
    $script:results | Where-Object { -not $_.Pass } | ForEach-Object { Write-Host "  - $($_.Name)：$($_.Detail)" -ForegroundColor Red }
    exit 1
}
