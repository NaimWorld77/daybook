$ErrorActionPreference = "SilentlyContinue"

$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$url = "https://naimworld77.github.io/daybook/?app=$stamp"

$edgeCandidates = @(
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe"
)

$chromeCandidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)

$browser = $edgeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) {
    $browser = $chromeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}

if ($browser) {
    Start-Process -FilePath $browser -ArgumentList @(
        "--app=$url",
        "--window-size=1480,920",
        "--new-window"
    )
}
else {
    Start-Process $url
}
