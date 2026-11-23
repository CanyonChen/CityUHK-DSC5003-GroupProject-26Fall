@echo off
setlocal
cd /d "%~dp0"

echo This will drop and rebuild the demo database ticketing_system.
echo Stop the StagePass API / User web / Admin web windows first.
echo.
pause

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\reset_demo.ps1"
echo.
echo Done. Demo accounts use password Demo@1234.
pause
