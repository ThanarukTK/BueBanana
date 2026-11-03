@echo off
rem Register an NFC card UID against the local backend.
rem Usage:  register-card <UID>     e.g.  register-card 04A3B2C1D4
if "%~1"=="" (
  echo Usage: register-card ^<UID^>
  echo   - get the UID from the CYD Serial Monitor:  Tap UID: 04A3B2C1D4
  echo   - then run:  register-card 04A3B2C1D4
  pause
  exit /b 1
)
curl -s -X POST http://192.168.4.106:3010/api/v1/nfc-tags -H "Content-Type: application/json" -H "Authorization: Bearer dev-staff-token" -d "{\"rawTagUid\":\"%~1\",\"label\":\"Card %~1\"}"
echo.
pause
