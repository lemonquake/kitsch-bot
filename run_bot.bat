@echo off
title Kitsch Bot
echo ========================================
echo           Kitsch Bot Launcher
echo ========================================
echo.

cd /d "%~dp0"

echo Checking Node.js...
node --version
if errorlevel 1 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

echo.
echo Starting Kitsch Bot...
echo.

node src/index.js

echo.
echo Bot has stopped.
pause
