@echo off
setlocal
cd /d "%~dp0"

echo Building Docker image oxidized-core:local...
docker build -t oxidized-core:local .
set "EXIT=%ERRORLEVEL%"
if %EXIT% neq 0 (
  echo.
  echo Docker build failed with exit code %EXIT%.
  exit /b %EXIT%
)
echo.
echo Docker image ready: oxidized-core:local
echo To start: docker compose up -d
exit /b 0
