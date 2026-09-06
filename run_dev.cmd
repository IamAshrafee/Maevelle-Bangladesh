@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"

:: Check if Docker is available
docker compose version >nul 2>&1
if %errorlevel% neq 0 (
  echo Docker Compose v2 is required. Start Docker Desktop, then try again.
  pause
  exit /b 1
)

:: Create .env if it doesn't exist
if not exist .env (
  copy .env.example .env >nul
  echo Created .env from .env.example.
)

:: Ensure BETTER_AUTH_URL points to the local Node.js server instead of Caddy
findstr /C:"BETTER_AUTH_URL=http://localhost:8080" .env >nul
if %errorlevel% equ 0 (
  powershell -Command "(Get-Content .env) -replace 'BETTER_AUTH_URL=http://localhost:8080', 'BETTER_AUTH_URL=http://localhost:3000' | Set-Content .env"
  echo Updated BETTER_AUTH_URL in .env to use port 3000.
)

echo Starting database in Docker and running local dev servers...
pnpm dev
