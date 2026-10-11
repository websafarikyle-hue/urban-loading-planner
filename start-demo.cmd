@echo off
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
 echo Python 3.10 or later is required. Install it from python.org.
 pause
 exit /b 1
)
python server.py --open
pause
