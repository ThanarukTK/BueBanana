@echo off
setlocal
title Bue Banana - staff console
cd /d "%~dp0frontend"
if errorlevel 1 (
  echo [x] frontend folder not found next to this file.
  pause
  exit /b 1
)

set "OPENPATH=/login"
if /i "%~1"=="preview" set "OPENPATH=/?preview=admin"

netstat -ano | findstr /c:":3001 " | findstr /c:"LISTENING" >nul 2>&1
if not errorlevel 1 (
  echo Staff console is already running on http://localhost:3001
  start "" "http://localhost:3001%OPENPATH%"
  exit /b 0
)

if not exist "node_modules" (
  echo Installing frontend dependencies...
  call npm install
  if errorlevel 1 (
    echo [x] npm install failed.
    pause
    exit /b 1
  )
)

echo Starting Next.js on http://localhost:3001 - keep this window open.
start "" cmd /c "timeout /t 12 >nul & explorer http://localhost:3001%OPENPATH%"
call npm run dev
