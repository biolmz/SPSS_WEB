@echo off
setlocal
cd /d "%~dp0"
title SPSS Web - Deploy to Windows Server

net session >nul 2>&1
if errorlevel 1 (
  echo.
  echo   [ERROR] Administrator privileges required.
  echo           Right-click this file and choose "Run as administrator".
  echo.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install_service.ps1" %*
if errorlevel 1 (
  echo.
  echo   [ERROR] Deployment failed. See the messages above.
  echo.
  pause
  exit /b 1
)

pause
