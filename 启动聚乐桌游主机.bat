@echo off
setlocal
cd /d "%~dp0"
title Tabletop Host Server

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

node scripts/start-host-gui.mjs

if %errorlevel% neq 0 (
    pause
)

