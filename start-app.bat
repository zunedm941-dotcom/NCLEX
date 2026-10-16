@echo off
title NCLEX Exam Simulator Pro
cd /d "%~dp0"

echo =======================================================
echo    NCLEX Exam Simulator Pro - Web Application Launcher
echo =======================================================
echo.

where agy-node >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo Starting local web server with agy-node...
    agy-node server.js
    goto end
)

where node >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo Starting local web server with node...
    node server.js
    goto end
)

echo Starting standalone in default browser...
start "" "%~dp0index.html"

:end
