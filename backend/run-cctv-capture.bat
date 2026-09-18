@echo off
chcp 65001 >nul
title CCTV Capture - Manual Run
color 0A

echo ============================================
echo   CCTV Capture and Email Report
echo   Manual Run - Double-click version
echo ============================================
echo.

cd /d "%~dp0"
node run-cctv-capture.js

echo.
echo ============================================
echo   Finished. Press any key to close this window.
echo ============================================
pause >nul