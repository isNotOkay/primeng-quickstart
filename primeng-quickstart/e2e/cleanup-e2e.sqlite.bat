@echo off
setlocal EnableExtensions

:: --- args ---
set "DB=%~1"
set "PREFIX=%~2"
if not defined PREFIX set "PREFIX=E2E"

:: --- prerequisites ---
where sqlite3 >nul 2>&1
if errorlevel 1 (
  echo [WARN] sqlite3 CLI not found in PATH. Skipping SQLite cleanup.
  endlocal & exit /b 0
)

:: --- resolve DB path ---
if defined DB if not exist "%DB%" (
  echo [INFO] Provided DB not found: "%DB%". Trying fallbacks...
  set "DB="
)

if not defined DB if defined OPEN_WEB_UI_DATA_DIRECTORY (
  set "DB=%OPEN_WEB_UI_DATA_DIRECTORY%\database.db"
)

if not defined DB (
  set "DB=C:\sql_tool_server_data\database.db"
)

if not exist "%DB%" (
  echo [INFO] No SQLite database found. Nothing to clean.
  endlocal & exit /b 0
)

echo [INFO] Database : "%DB%"
echo [INFO] Prefix   : "%PREFIX%"  (LIKE "%PREFIX%%%")

:: --- temp files ---
set "TMP_SCRIPT=%TEMP%\gen_drop_%RANDOM%_%RANDOM%.sql"
set "TMP_LIST=%TEMP%\drop_list_%RANDOM%_%RANDOM%.sql"

> "%TMP_SCRIPT%"  echo .mode list
>>"%TMP_SCRIPT%"  echo .headers off
>>"%TMP_SCRIPT%"  echo SELECT printf('DROP VIEW IF EXISTS "%%s";',  replace(name,'"','""')) FROM sqlite_master WHERE type='view'  AND name LIKE '%PREFIX%%%' ;
>>"%TMP_SCRIPT%"  echo SELECT printf('DROP TABLE IF EXISTS "%%s";', replace(name,'"','""')) FROM sqlite_master WHERE type='table' AND name LIKE '%PREFIX%%%' ;

echo [INFO] Generating DROP statements...
sqlite3 -batch "%DB%" < "%TMP_SCRIPT%" > "%TMP_LIST%"
if errorlevel 1 (
  echo [WARN] Failed to enumerate objects. Skipping SQLite cleanup.
  del /q "%TMP_SCRIPT%" 2>nul
  del /q "%TMP_LIST%" 2>nul
  endlocal & exit /b 0
)

for /f %%A in ('type "%TMP_LIST%" ^| find /c /v ""') do set "COUNT=%%A"
if "%COUNT%"=="0" (
  echo [INFO] Nothing to drop.
  del /q "%TMP_SCRIPT%" 2>nul
  del /q "%TMP_LIST%" 2>nul
  endlocal & exit /b 0
)

echo [INFO] Found %COUNT% object^(s^) to drop:
type "%TMP_LIST%"

echo [INFO] Dropping...
sqlite3 -batch "%DB%" < "%TMP_LIST%"
if errorlevel 1 (
  echo [WARN] DROP failed. Continuing.
  del /q "%TMP_SCRIPT%" 2>nul
  del /q "%TMP_LIST%" 2>nul
  endlocal & exit /b 0
)

echo [OK] Cleanup complete.
del /q "%TMP_SCRIPT%" 2>nul
del /q "%TMP_LIST%" 2>nul
endlocal
exit /b 0
