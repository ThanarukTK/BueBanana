@echo off
rem ============================================================
rem  compile.cmd - build cyd-reader.ino with arduino-cli
rem  Uses your existing Arduino IDE install (ESP32 core + libs).
rem  Temporarily swaps in this repo's TFT_eSPI User_Setup.h, then
rem  restores your installed one afterwards.
rem  Requires the CLI at %LOCALAPPDATA%\arduino-cli\arduino-cli.exe
rem  (installed once by the agent; adjust CLI / CFG if you moved it).
rem ============================================================
setlocal
set "CLI=%LOCALAPPDATA%\arduino-cli\arduino-cli.exe"
set "CFG=%LOCALAPPDATA%\arduino-cli\arduino-cli.yaml"
set "SKETCH=%~dp0"
set "USER_SETUP=%USERPROFILE%\Documents\Arduino\libraries\TFT_eSPI\User_Setup.h"

if not exist "%CLI%" (
  echo arduino-cli not found at %CLI%
  echo Install once: see README, then re-run.
  pause & exit /b 1
)

rem ---- swap in the repo's User_Setup.h (back up the installed one) ----
if exist "%USER_SETUP%.bak" del "%USER_SETUP%.bak"
if exist "%USER_SETUP%" copy /Y "%USER_SETUP%" "%USER_SETUP%.bak" >nul
copy /Y "%~dp0User_Setup.h" "%USER_SETUP%" >nul

echo Building cyd-reader.ino (esp32:esp32:esp32)...
"%CLI%" --config-file "%CFG%" compile --fqbn esp32:esp32:esp32 "%~dp0cyd-reader.ino"
set "RC=%ERRORLEVEL%"

rem ---- restore the installed User_Setup.h ----
if exist "%USER_SETUP%.bak" move /Y "%USER_SETUP%.bak" "%USER_SETUP%" >nul

if %RC%==0 (
  echo.
  echo BUILD OK
) else (
  echo.
  echo BUILD FAILED (exit %RC%)
)
pause
endlocal & exit /b %RC%
