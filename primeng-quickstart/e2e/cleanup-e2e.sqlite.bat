@echo off
setlocal

:: --- args ---
if "%~1"=="" (
  echo Usage: %~nx0 "C:\Users\kayod\RiderProjects\OpenWebUiSqlToolServerApi\OpenWebUiSqlToolServerApi\MockData\database.db" [Prefix]
  exit /b 1
)
set "DB=%~1"
set "PREFIX=%~2"
if not defined PREFIX set "PREFIX=E2E"

:: --- prerequisites ---
where sqlite3 >nul 2>&1
if errorlevel 1 (
  echo [ERROR] sqlite3 CLI not found in PATH.
  echo         Install it or add it to PATH, then retry.
  exit /b 2
)

if not exist "%DB%" (
  echo [ERROR] Database not found: "%DB%"
  exit /b 3
)

echo [INFO] Database : "%DB%"
echo [INFO] Prefix   : "%PREFIX%"  (LIKE "%PREFIX%%%")

:: --- temp files ---
set "TMP_SCRIPT=%TEMP%\gen_drop_%RANDOM%_%RANDOM%.sql"
set "TMP_LIST=%TEMP%\drop_list_%RANDOM%_%RANDOM%.sql"

:: Build a small SQLite script that PRINTFs DROP statements.
:: Note: '%%s' becomes '%s' inside the SQL file; we escape % for cmd.
> "%TMP_SCRIPT%"  echo .mode list
>> "%TMP_SCRIPT%" echo .headers off
>> "%TMP_SCRIPT%" echo SELECT printf('DROP VIEW IF EXISTS "%%s";',  replace(name,'"','""')) FROM sqlite_master WHERE type='view'  AND name LIKE '%PREFIX%%%' ;
>> "%TMP_SCRIPT%" echo SELECT printf('DROP TABLE IF EXISTS "%%s";', replace(name,'"','""')) FROM sqlite_master WHERE type='table' AND name LIKE '%PREFIX%%%' ;

echo [INFO] Generating DROP statements...
:: Execute generator, capture its stdout into TMP_LIST
sqlite3 -batch "%DB%" < "%TMP_SCRIPT%" > "%TMP_LIST%"
if errorlevel 1 (
  echo [ERROR] Failed to enumerate objects. Aborting.
  del /q "%TMP_SCRIPT%" 2>nul
  del /q "%TMP_LIST%" 2>nul
  exit /b 4
)

if not exist "%TMP_LIST%" (
  echo [INFO] Nothing to drop.
  del /q "%TMP_SCRIPT%" 2>nul
  exit /b 0
)

for /f %%A in ('type "%TMP_LIST%" ^| find /c /v ""') do set "COUNT=%%A"
if "%COUNT%"=="0" (
  echo [INFO] Nothing to drop.
  del /q "%TMP_SCRIPT%" 2>nul
  del /q "%TMP_LIST%" 2>nul
  exit /b 0
)

echo [INFO] Found %COUNT% object^(s^) to drop:
type "%TMP_LIST%"

echo [INFO] Dropping...
sqlite3 -batch "%DB%" < "%TMP_LIST%"
if errorlevel 1 (
  echo [ERROR] DROP failed. See statements above.
  del /q "%TMP_SCRIPT%" 2>nul
  del /q "%TMP_LIST%" 2>nul
  exit /b 5
)

echo [OK] Cleanup complete.

del /q "%TMP_SCRIPT%" 2>nul
del /q "%TMP_LIST%" 2>nul
endlocal
exit /b 0
