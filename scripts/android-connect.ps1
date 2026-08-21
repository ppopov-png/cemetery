param(
    [int]$TimeoutSeconds = 90
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$adb = if ($env:ANDROID_HOME) { Join-Path $env:ANDROID_HOME "platform-tools\adb.exe" } else { "C:\Android\Sdk\platform-tools\adb.exe" }
$apk = Join-Path $repoRoot "android\app\build\outputs\apk\debug\app-debug.apk"
$log = Join-Path $repoRoot "android\adb-connect.log"

if (-not (Test-Path -LiteralPath $adb)) { throw "adb not found: $adb" }
if (-not (Test-Path -LiteralPath $apk)) { throw "APK not found. Build it first." }

"$(Get-Date -Format s) watcher started" | Set-Content -LiteralPath $log
& $adb kill-server | Out-Null
& $adb start-server | Out-Null
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)

Write-Host "Connect the unlocked Android phone now."
Write-Host "No commands are required after connecting it."

while ((Get-Date) -lt $deadline) {
    $lines = @(& $adb devices 2>&1)
    $deviceLine = $lines | Where-Object { $_ -match '^\S+\s+(device|offline|unauthorized)$' } | Select-Object -First 1
    if ($deviceLine) {
        "$(Get-Date -Format s) $deviceLine" | Add-Content -LiteralPath $log
        if ($deviceLine -match '\sdevice$') {
            Write-Host "Device is stable. Installing APK..."
            & $adb install -r $apk
            if ($LASTEXITCODE -eq 0) {
                & $adb shell monkey -p com.cemetery.mapper 1 | Out-Null
                Write-Host "Done: APK installed and launched."
                exit 0
            }
        }
    } else {
        "$(Get-Date -Format s) no-device" | Add-Content -LiteralPath $log
    }
    Start-Sleep -Seconds 1
}

Write-Host "Device did not become stable within $TimeoutSeconds seconds."
Write-Host "Log saved to: $log"
exit 1
