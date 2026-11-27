param(
    [string]$BaseUrl = "http://localhost:3000",
    [int]$Runs = 5
)

# Response-time smoke test for five read endpoints.

. "$PSScriptRoot\_common.ps1"
$ErrorActionPreference = "Stop"

function Login([string]$Username) {
    $body = @{ user_name = $Username; password = "Demo@1234" } | ConvertTo-Json -Compress
    $r = Invoke-RestMethod -Method POST -Uri "$BaseUrl/auth/login" -ContentType "application/json" -Body $body
    $r.data.token
}

function Timed-Get([string]$Path, [string]$Token) {
    $cargs = @("-s", "-o", "NUL", "-w", "%{time_total}", "$BaseUrl$Path")
    if ($Token) { $cargs = @("-s", "-o", "NUL", "-w", "%{time_total}", "-H", "Authorization: Bearer $Token", "$BaseUrl$Path") }
    $seconds = & curl.exe @cargs
    [math]::Round(([double]$seconds) * 1000, 1)
}

if (-not (Test-TcpPort ([uri]$BaseUrl).Port)) { throw "API is not listening: $BaseUrl" }
$admin = Login "admin"
$buyer = Login "buyer01"

$targets = @(
    @{ Name = "public event list"; Path = "/events?page_size=20"; Token = $null },
    @{ Name = "seat map P13 (120 seats)"; Path = "/performances/13/seats"; Token = $null },
    @{ Name = "my orders"; Path = "/orders?page_size=20"; Token = $buyer },
    @{ Name = "admin order search"; Path = "/admin/orders?page_size=20"; Token = $admin },
    @{ Name = "admin sales stats"; Path = "/admin/stats"; Token = $admin }
)

Write-Step "API read timing ($Runs runs each)"
"{0,-30} {1,8} {2,8} {3,8}" -f "endpoint", "min_ms", "median_ms", "max_ms"
foreach ($t in $targets) {
    $values = @()
    for ($i = 0; $i -lt $Runs; $i++) {
        $values += Timed-Get -Path $t.Path -Token $t.Token
    }
    $sorted = @($values | Sort-Object)
    $median = $sorted[[int]([math]::Floor($sorted.Count / 2))]
    "{0,-30} {1,8:N1} {2,8:N1} {3,8:N1}" -f $t.Name, $sorted[0], $median, $sorted[-1]
}
Write-Info "Use benchmark.js for execution plans, P95 timings and concurrency tests."
