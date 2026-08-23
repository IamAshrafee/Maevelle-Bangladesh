@echo off
setlocal
cd /d "%~dp0"
node scripts\local-environment.mjs reset %*
set "exitCode=%errorlevel%"
if not "%exitCode%"=="0" (
  echo.
  echo Reset failed. Review the message above.
  pause
)
exit /b %exitCode%
