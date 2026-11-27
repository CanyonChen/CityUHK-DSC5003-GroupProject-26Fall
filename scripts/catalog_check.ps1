param(
    [string]$BaseUrl = "http://localhost:3000"
)

# T2 acceptance: read-only event / performance / seat APIs (API-06 to API-10)
# Read-only assertions; no database changes. Data distribution comes from AI\seed.sql (8 events / 16 performances, including 1 draft event and 4 finished performances)

. "$PSScriptRoot\_common.ps1"
$ErrorActionPreference = "Stop"

function Invoke-Api([string]$Path) {
    $uri = $BaseUrl.TrimEnd('/') + $Path
    try {
        Invoke-WebRequest -Uri $uri -Method GET -SkipHttpErrorCheck -TimeoutSec 10
    } catch { $null }
}

function Get-Body($r) {
    if (-not $r) { return $null }
    try { return $r.Content | ConvertFrom-Json } catch { return $null }
}

$results = @()
function Add-Result([string]$Name, [bool]$Pass, [string]$Detail) {
    $script:results += [pscustomobject]@{ Name = $Name; Pass = $Pass; Detail = $Detail }
    if ($Pass) { Write-Ok "$Name — $Detail" } else { Write-Fail2 "$Name — $Detail" }
}

Write-Step "0/8 Check whether the API is running"
if (-not (Test-TcpPort $Cfg.ApiPort)) {
    Write-Warn2 "$BaseUrl is not listening; run .\scripts\dev.ps1 first"
    exit 0
}
Write-Ok "API port $($Cfg.ApiPort) is listening"

Write-Step "1/8 Event list (API-06)"
$r = Invoke-Api "/events"
$body = Get-Body $r
$items = @($body.data.items)
Add-Result "Event list 200" ($r.StatusCode -eq 200) "status=$($r.StatusCode)"
Add-Result "7 public events" ($body.data.total -eq 7 -and $items.Count -eq 7) "total=$($body.data.total)"
Add-Result "Draft event 8 absent" (-not ($items | Where-Object { $_.event_id -eq 8 })) "ids=$(($items | ForEach-Object { $_.event_id }) -join ',')"
$badFields = @($items | Where-Object { -not $_.name -or -not $_.next_performance_at -or $null -eq $_.min_price_cents -or -not $_.currency })
Add-Result "Card fields complete" ($badFields.Count -eq 0) "missing fields=$($badFields.Count)"
$multi = @($items | Where-Object { $_.event_id -eq 2 })
Add-Result "Multi-venue label is Multiple venues" ($multi.Count -eq 1 -and $multi[0].venue_name -eq "Multiple venues") "venue_name=$($multi[0].venue_name)"

Write-Step "2/8 Event detail (API-07)"
$r = Invoke-Api "/events/1"
$body = Get-Body $r
Add-Result "Event 1 detail 200" ($r.StatusCode -eq 200) "status=$($r.StatusCode)"
Add-Result "1 cover" (@($body.data.media).Count -eq 1) "media=$(@($body.data.media).Count)"
$perfs = @($body.data.performances)
$badStatus = @($perfs | Where-Object { $_.status -notin @("PUBLISHED", "SALES_PAUSED") })
Add-Result "Detail lists only on-sale performances" ($perfs.Count -ge 1 -and $badStatus.Count -eq 0) "count=$($perfs.Count)"
$r = Invoke-Api "/events/8"
Add-Result "Draft event 404" ($r.StatusCode -eq 404 -and (Get-Body $r).code -eq "NOT_FOUND") "status=$($r.StatusCode)"

Write-Step "3/8 Performance list and filters (API-08)"
$r = Invoke-Api "/performances"
$body = Get-Body $r
$all = @($body.data.items)
Add-Result "15 non-draft performances" ($body.data.total -eq 15 -and $all.Count -eq 15) "total=$($body.data.total)"
$r = Invoke-Api "/performances?sales_status=paused"
$body = Get-Body $r
Add-Result "only 1 paused performance" ($body.data.total -eq 1 -and $body.data.items[0].performance_id -eq 10) "total=$($body.data.total)"
$r = Invoke-Api "/performances?sales_status=on_sale"
$onSale = @((Get-Body $r).data.items)
Add-Result "on_sale performances >= 1" ($onSale.Count -ge 1 -and @($onSale | Where-Object { $_.status -ne "PUBLISHED" }).Count -eq 0) "count=$($onSale.Count)"
$r = Invoke-Api "/performances?sales_status=closed"
$closed = @((Get-Body $r).data.items)
Add-Result "closed includes finished performances" (@($closed | Where-Object { $_.status -eq "FINISHED" }).Count -ge 1) "count=$($closed.Count)"
$p1Date = ([datetime](Get-Body (Invoke-Api "/performances/1")).data.starts_at).ToString("yyyy-MM-dd")
$p2Date = ([datetime](Get-Body (Invoke-Api "/performances/2")).data.starts_at).ToString("yyyy-MM-dd")
$r = Invoke-Api "/performances?date_from=$p1Date&date_to=$p2Date"
$byDate = @((Get-Body $r).data.items)
$dateIds = ($byDate | ForEach-Object { $_.performance_id }) -join ","
Add-Result "Date filter $p1Date-$p2Date two-day window" ($byDate.Count -eq 2 -and $dateIds -eq "1,2") "ids=$dateIds"

Write-Step "4/8 Performance detail (API-09)"
$r = Invoke-Api "/performances/1"
$perfBody = Get-Body $r
$counts = $perfBody.data.seat_counts
$sum = [int]$counts.available + [int]$counts.held + [int]$counts.sold + [int]$counts.blocked
Add-Result "Performance 1 detail 200" ($r.StatusCode -eq 200) "status=$($r.StatusCode)"
Add-Result "Seat counts total 200" ($sum -eq 200) "available=$($counts.available) held=$($counts.held) sold=$($counts.sold) blocked=$($counts.blocked)"
Add-Result "3 price tiers" (@($perfBody.data.price_tiers).Count -eq 3) "tiers=$(@($perfBody.data.price_tiers).Count)"
Add-Result "Purchase limit 4 / refund cutoff 24h" ($perfBody.data.purchase_limit -eq 4 -and $perfBody.data.refund_policy.cutoff_hours_before_start -eq 24) "limit=$($perfBody.data.purchase_limit) cutoff=$($perfBody.data.refund_policy.cutoff_hours_before_start)"
$r = Invoke-Api "/performances/12"
Add-Result "Draft performance 404" ($r.StatusCode -eq 404 -and (Get-Body $r).code -eq "NOT_FOUND") "status=$($r.StatusCode)"

Write-Step "5/8 Seat map (API-10)"
$r = Invoke-Api "/performances/1/seats"
$body = Get-Body $r
$seats = @($body.data.seats)
Add-Result "200 seats" ($seats.Count -eq 200) "seats=$($seats.Count)"
Add-Result "Layout 10 rows x 20 columns" ($body.data.layout.row_count -eq 10 -and $body.data.layout.col_count -eq 20) "layout=$($body.data.layout.row_count)x$($body.data.layout.col_count)"
$badCoord = @($seats | Where-Object { -not $_.coordinates })
Add-Result "Every seat has coordinates" ($badCoord.Count -eq 0) "missing coordinates=$($badCoord.Count)"
$badState = @($seats | Where-Object { $_.status -notin @("AVAILABLE", "HELD", "SOLD", "BLOCKED") })
Add-Result "Seat statuses valid" ($badState.Count -eq 0) "invalid=$($badState.Count)"
$tierMap = @{}
$perfBody.data.price_tiers | ForEach-Object { $tierMap[$_.tier_name] = $_.price_cents }
Write-Info ("Seat map price tiers: " + (($tierMap.Keys | ForEach-Object { "$_=$($tierMap[$_])" }) -join " "))
$badPrice = @($seats | Where-Object { $tierMap.ContainsKey($_.tier_name) -and $tierMap[$_.tier_name] -ne $_.price_cents })
Add-Result "Seat prices match tiers" ($badPrice.Count -eq 0) "mismatches=$($badPrice.Count)"
$badMine = @($seats | Where-Object { $null -eq $_.holder_mine })
Add-Result "holder_mine field present" ($badMine.Count -eq 0) "missing fields=$($badMine.Count)"
$venueSeats = @{}
foreach ($perfId in @(1, 7, 3)) {
    $r2 = Invoke-Api "/performances/$perfId/seats"
    $venueSeats[$perfId] = @((Get-Body $r2).data.seats).Count
}
Add-Result "Three venues: 200/120/350 seats" ($venueSeats[1] -eq 200 -and $venueSeats[7] -eq 120 -and $venueSeats[3] -eq 350) "perf1=$($venueSeats[1]) perf7=$($venueSeats[7]) perf3=$($venueSeats[3])"

Write-Step "6/8 Parameter validation"
$r = Invoke-Api "/events?page_size=1000"
Add-Result "page_size over limit 400" ($r.StatusCode -eq 400 -and (Get-Body $r).code -eq "VALIDATION_ERROR") "status=$($r.StatusCode)"
$r = Invoke-Api "/performances?sales_status=bogus"
Add-Result "Invalid sales_status 400" ($r.StatusCode -eq 400) "status=$($r.StatusCode)"
$r = Invoke-Api "/performances?event_id=abc"
Add-Result "Non-numeric event_id 400" ($r.StatusCode -eq 400) "status=$($r.StatusCode)"
$r = Invoke-Api "/performances?date_from=2026-12-01&date_to=2026-11-01"
Add-Result "Reversed date range 400" ($r.StatusCode -eq 400) "status=$($r.StatusCode)"

Write-Step "7/8 Pagination"
$r = Invoke-Api "/events?page=2&page_size=5"
$body = Get-Body $r
Add-Result "Page 2 returns 2 items" (@($body.data.items).Count -eq 2 -and $body.data.page -eq 2) "items=$(@($body.data.items).Count)"

Write-Step "8/8 Unknown resource"
$r = Invoke-Api "/events/999"
Add-Result "Nonexistent event 404" ($r.StatusCode -eq 404 -and (Get-Body $r).code -eq "NOT_FOUND") "status=$($r.StatusCode)"

$pass = ($results | Where-Object Pass).Count
$fail = ($results | Where-Object { -not $_.Pass }).Count
Write-Host ""
Write-Host ("Catalog API acceptance: PASS $pass / FAIL $fail") -ForegroundColor $(if ($fail -eq 0) { "Green" } else { "Red" })
if ($fail -gt 0) {
    $results | Where-Object { -not $_.Pass } | ForEach-Object { Write-Host "  - $($_.Name)：$($_.Detail)" -ForegroundColor Red }
    exit 1
}
