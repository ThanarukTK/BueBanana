@echo off
title NFC local test - backend + staff demo
echo Starting backend on port 3010 ...
start "backend" cmd /k "cd /d D:\Project\NFC_boardgame_reader\backend && set "STORE=postgres" && set "PORT=3010" && set "DEVICE_API_KEY=dev-device-key" && bun src/server.ts"
echo Starting staff demo on port 8080 ...
start "staff-demo" cmd /k "cd /d D:\Project\NFC_boardgame_reader\Demo && python -m http.server 8080 --bind 0.0.0.0"
echo.
echo Backend : http://192.168.4.106:3010
echo Staff   : http://192.168.4.106:8080
echo Device key : dev-device-key
echo Staff token: dev-staff-token
echo.
echo Keep BOTH windows open while testing. Close them to stop.
echo Note: data persists in Supabase (Postgres) - card UIDs survive restarts.
pause
