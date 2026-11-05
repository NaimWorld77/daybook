$url = "https://NaimWorld77.github.io/daybook/"

$candidates = @(
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
)
$browser = $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

if (-not $browser) {
  Start-Process $url
  exit 0
}

Start-Process -FilePath $browser -ArgumentList @(
  "--app=$url",
  "--window-size=1180,840",
  "--new-window"
)
