@echo off
setlocal
cd /d "%~dp0"
node scripts\local-environment.mjs prepare %*
set "exitCode=%errorlevel%"
if not "%exitCode%"=="0" (
  echo.
  echo Prepare failed. Review the message above.
  pause
)
exit /b %exitCode%
