@echo off
setlocal
cd /d "%~dp0"
title SPSS Web - Statistics Platform

rem ===================================================================
rem  SPSS Web - Statistical Analysis Platform
rem  Fully self-contained launcher (embedded Python, no install needed)
rem  NOTE: this file must keep CRLF line endings and stay ASCII-only,
rem        otherwise cmd.exe may fail to parse it.
rem ===================================================================

set "PY=%~dp0runtime\python\python.exe"
set "SPSS_WEB_PORT=8300"
set "SPSS_WEB_HOST=127.0.0.1"

echo.
echo  ============================================================
echo    SPSS Web - Statistical Analysis Platform
echo    http://127.0.0.1:8300
echo  ============================================================
echo.

if not exist "%PY%" (
    echo  [ERROR] Embedded Python runtime not found:
    echo          %PY%
    echo.
    echo  Make sure the "runtime" folder sits next to this file.
    echo.
    pause
    exit /b 1
)

echo  [1/2] Checking embedded runtime ...
"%PY%" -c "import fastapi,uvicorn,pandas,numpy,scipy,statsmodels,openpyxl,multipart,pyreadstat" >nul 2>nul
if errorlevel 1 (
    echo.
    echo  [ERROR] The embedded runtime is incomplete or damaged.
    echo          Please re-extract the whole package folder.
    echo.
    pause
    exit /b 1
)
echo        OK

echo.
echo  [2/2] Starting server, please wait ...
echo        The browser will open automatically.
echo        Close this window to stop the server.
echo.

"%PY%" start.py

echo.
echo  Server stopped.
pause
