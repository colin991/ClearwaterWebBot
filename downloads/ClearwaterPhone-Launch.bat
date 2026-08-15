@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "APP=%~dp0app"
set "CACHE=%LOCALAPPDATA%\ClearwaterPhone\electron-v33.2.0"
set "EXE=%CACHE%\electron.exe"
set "ELECTRON_URL=https://github.com/electron/electron/releases/download/v33.2.0/electron-v33.2.0-win32-x64.zip"

if not exist "%APP%\main.js" (
  echo Clearwater Phone app files are missing.
  echo Re-download the zip from Clearwater Internet and extract the full folder.
  pause
  exit /b 1
)

if not exist "%EXE%" (
  echo.
  echo Clearwater Phone — first-time setup
  echo Downloading the Electron runtime once. This can take a minute...
  echo.
  mkdir "%CACHE%" 2>nul
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$ErrorActionPreference='Stop'; ^
     $zip = Join-Path $env:TEMP 'clearwater-electron.zip'; ^
     Write-Host 'Fetching runtime...'; ^
     Invoke-WebRequest -Uri '%ELECTRON_URL%' -OutFile $zip; ^
     Write-Host 'Unpacking...'; ^
     Expand-Archive -Path $zip -DestinationPath '%CACHE%' -Force; ^
     Remove-Item $zip -Force"
  if not exist "%EXE%" (
    echo.
    echo Could not download the runtime. Check your connection and try again.
    pause
    exit /b 1
  )
)

echo Starting Clearwater Phone...
echo Press F8 in-game to hide or show the overlay.
start "" "%EXE%" "%APP%"
exit /b 0
