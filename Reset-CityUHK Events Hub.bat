@echo off
setlocal
cd /d "%~dp0"

echo This will drop and rebuild the demo database ticketing_system.
echo Stop the CityUHK Events Hub API / User web / Admin web windows first.
echo.
pause

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\reset_demo.ps1"
if errorlevel 1 (
    echo Reset failed. Read docs\local-run-guide.md for troubleshooting.
    pause
    exit /b 1
)
echo.
echo Done. Demo accounts use password Demo@1234.
pause
