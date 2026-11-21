@echo off
setlocal
cd /d "%~dp0"
set "DAYLIGHT_NODE="
for /f "delims=" %%N in ('where node.exe 2^>nul') do if not defined DAYLIGHT_NODE set "DAYLIGHT_NODE=%%N"
if not defined DAYLIGHT_NODE if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "DAYLIGHT_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not defined DAYLIGHT_NODE (
  echo Daylight could not find Node.js 20.9 or newer.
  pause
  exit /b 1
)
"%DAYLIGHT_NODE%" scripts\start-preview.cjs
if errorlevel 1 pause
