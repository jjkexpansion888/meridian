@echo off
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -File "%~dp0Start-Meridian.ps1"
if errorlevel 1 pause
