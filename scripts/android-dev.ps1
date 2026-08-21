param(
    [switch]$Launch
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$androidRoot = Join-Path $repoRoot "android"
$apk = Join-Path $androidRoot "app\build\outputs\apk\debug\app-debug.apk"
$adb = if ($env:ANDROID_HOME) { Join-Path $env:ANDROID_HOME "platform-tools\adb.exe" } else { "C:\Android\Sdk\platform-tools\adb.exe" }

if (-not (Test-Path $adb)) { throw "adb not found: $adb" }
Push-Location $androidRoot
try { & .\gradlew.bat :app:assembleDebug } finally { Pop-Location }
if (-not (Test-Path $apk)) { throw "Debug APK was not created: $apk" }
& $adb install -r $apk
if ($LASTEXITCODE -ne 0) { throw "adb install failed" }
if ($Launch) { & $adb shell monkey -p com.cemetery.mapper 1 | Out-Null }
Write-Host "Installed: $apk"
