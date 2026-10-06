@echo off
rem ---------------------------------------------------------------------------------------------
rem  supabase.cmd - one word to run the API against Supabase/PostgreSQL.
rem
rem  Applies any pending migrations (backend\migrations\*.sql) and then starts the API with the
rem  Postgres store. Requires DATABASE_URL in backend\.env - copy backend\.env.example if you have
rem  not created that file yet. See docs/supabase-migration-plan.md.
rem ---------------------------------------------------------------------------------------------
cd /d "%~dp0"
set STORE=postgres

echo Applying migrations...
bun run migrate
if errorlevel 1 (
  echo.
  echo Migrations failed.
  echo   - Is DATABASE_URL set in backend\.env?
  echo   - Use the "Shared pooler, session mode" string from Supabase, not "Direct connection":
  echo     the direct host is IPv6-only on free projects and will not connect from most home networks.
  echo   - Is the project awake? Free projects pause after a week of inactivity.
  echo.
  pause
  exit /b 1
)

echo.
echo Starting the API on the Postgres store (Ctrl+C to stop)...
echo   health:  http://localhost:3000/health   ->  should report store: postgres
echo   demo:    run "python -m http.server 8080" in the Demo folder, then open group-demo.html
echo.
bun src/server.ts
