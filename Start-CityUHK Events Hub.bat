@echo off
setlocal
cd /d "%~dp0"

echo Starting CityUHK Events Hub...
echo First run may take 2-5 minutes while dependencies install.
echo Keep this window open until the startup summary appears.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\dev.ps1" -Visible
if errorlevel 1 (
    echo.
    echo Startup failed. Read docs\local-run-guide.md for troubleshooting.
    pause
    exit /b 1
)

echo.
echo User web:  http://127.0.0.1:8080
echo Admin web: http://127.0.0.1:8081
echo API:       http://127.0.0.1:3000
echo.
timeout /t 8 /nobreak >nul
start "" "http://127.0.0.1:8080"
start "" "http://127.0.0.1:8081"
echo Close the three CityUHK Events Hub API / User web / Admin web windows to stop the services.
pause
