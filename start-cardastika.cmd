@echo off
setlocal
cd /d "%~dp0"

echo Starting Cardastika Telegram Mini App...
echo Checking PostgreSQL and loading game data...
call npm.cmd run dev:telegram:setup
if errorlevel 1 (
  echo.
  echo Cardastika did not start. See the error above.
  pause
  exit /b 1
)

echo.
echo Cardastika is running at https://app.cardastika.org/
echo You can close this window; the local services continue running.
pause
