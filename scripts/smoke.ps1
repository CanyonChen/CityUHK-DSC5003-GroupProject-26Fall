param(
    [string]$BaseUrl = "http://localhost:3000",
    [string]$User    = "buyer01",
    [string]$Password = "Demo@1234"
)

# Smoke test: call each T1 acceptance endpoint, output PASS / FAIL and a summary
# If the API is not running, do not mark failure; list the pending checks. Endpoint paths are centralized in $Cases; update here if the T1 contract changes

. "$PSScriptRoot\_common.ps1"
$ErrorActionPreference = "Stop"

# Endpoint paths and assertions follow API contract API-02 / API-04 / API-05
$Paths = @{
    Health = "/health"      # API-05
    Login  = "/auth/login"  # API-02
    Me     = "/auth/me"     # API-04
}

function Invoke-Api([string]$Method, [string]$Path, $Body, [string]$Token) {
    $uri = $BaseUrl.TrimEnd('/') + $Path
    $headers = @{}
    if ($Token) { $headers["Authorization"] = "Bearer $Token" }
    $params = @{
        Uri = $uri; Method = $Method; Headers = $headers
        SkipHttpErrorCheck = $true; TimeoutSec = 10
    }
    if ($Body) {
        $params["Body"] = ($Body | ConvertTo-Json -Compress)
        $params["ContentType"] = "application/json"
    }
    try { Invoke-WebRequest @params }
    catch { $null }
}

$results = @()
function Add-Result([string]$Name, [bool]$Pass, [string]$Detail) {
    $script:results += [pscustomobject]@{ Name = $Name; Pass = $Pass; Detail = $Detail }
    if ($Pass) { Write-Ok "$Name — $Detail" } else { Write-Fail2 "$Name — $Detail" }
}

Write-Step "0/4 Check whether the API is running"
if (-not (Test-TcpPort $Cfg.ApiPort)) {
    Write-Warn2 "$BaseUrl is not listening: T1 is not implemented or not started"
    Write-Info "Run again after starting: .\scripts\smoke.ps1"
    Write-Info "5 pending checks: health 200 / valid login returns token / token returns roles / wrong password 401 / no token 401"
    exit 0
}
Write-Ok "API port $($Cfg.ApiPort) is listening"

Write-Step "1/4 Health check"
$r = Invoke-Api "GET" $Paths.Health
Add-Result "GET $($Paths.Health)" ($r -and $r.StatusCode -eq 200) "status=$($r.StatusCode)"

Write-Step "2/4 Valid account login"
$r = Invoke-Api "POST" $Paths.Login @{ user_name = $User; password = $Password }
$token = $null
if ($r -and $r.StatusCode -eq 200) {
    try {
        $j = $r.Content | ConvertFrom-Json
        # Contract: token and user.roles are inside data; also accept top-level fields from the old mock
        $token = $j.data.token
        if (-not $token) { $token = $j.token }
        if (-not $token) { $token = $j.accessToken }
    } catch { }
}
Add-Result "POST $($Paths.Login) valid credentials" ([bool]$token) $(if ($token) { "token received" } else { "status=$($r.StatusCode) but no token field" })

# Use the token to access a protected endpoint and verify that roles come from the server
$roleText = ""
if ($token) {
    $rMe = Invoke-Api "GET" $Paths.Me $null $token
    if ($rMe -and $rMe.StatusCode -eq 200) {
        try {
            $me = $rMe.Content | ConvertFrom-Json
            if ($me.data.user -and $me.data.user.roles) { $roleText = ($me.data.user.roles -join ",") }
            elseif ($me.data.roles) { $roleText = ($me.data.roles -join ",") }
        } catch { }
    }
    Add-Result "GET $($Paths.Me) with token" ([bool]$roleText) "status=$($rMe.StatusCode) roles=$roleText"
} else {
    Add-Result "GET $($Paths.Me) with token" $false "no token; cannot continue"
}

Write-Step "3/4 Wrong password"
$r = Invoke-Api "POST" $Paths.Login @{ user_name = $User; password = "wrong-password" }
Add-Result "POST $($Paths.Login) wrong password" ($r -and $r.StatusCode -eq 401) "status=$($r.StatusCode)"

Write-Step "4/4 Access protected endpoint without token"
$r = Invoke-Api "GET" $Paths.Me
Add-Result "GET $($Paths.Me) without token" ($r -and $r.StatusCode -eq 401) "status=$($r.StatusCode)"

$pass = ($results | Where-Object Pass).Count
$fail = ($results | Where-Object { -not $_.Pass }).Count
Write-Host ""
Write-Host ("Smoke result: PASS $pass / FAIL $fail") -ForegroundColor $(if ($fail -eq 0) { "Green" } else { "Red" })
if ($fail -gt 0) {
    $results | Where-Object { -not $_.Pass } | ForEach-Object { Write-Host "  - $($_.Name): $($_.Detail)" -ForegroundColor Red }
    exit 1
}
