@echo off
title Push NCLEX to GitHub
cd /d "%~dp0"
set "PATH=C:\Users\LEGION\AppData\Local\MinGit\cmd;%PATH%"

echo ========================================================
echo    Pushing Fresh NCLEX Simulator to GitHub
echo    Target: https://github.com/zunedm941-dotcom/NCLEX.git
echo    Commit: "first commit" (Fresh Single Root Commit)
echo ========================================================
echo.
git push -f -u origin main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================================
    echo  [SUCCESS] Fresh repository pushed to GitHub!
    echo ========================================================
) else (
    echo.
    echo [NOTE] If prompted for credentials, sign in with GitHub or enter a Personal Access Token (PAT).
)
echo.
pause
