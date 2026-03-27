@echo off
chcp 65001 >nul
title Personal Knowledge Base
echo.
echo ============================================
echo    个人知识库 - 一键启动
echo ============================================
echo.

cd /d "%~dp0"

:: Kill stale processes on ports 3001 and 5173
echo Cleaning up old processes...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001" ^| findstr "LISTENING"') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173" ^| findstr "LISTENING"') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5174" ^| findstr "LISTENING"') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5175" ^| findstr "LISTENING"') do taskkill /PID %%a /F >nul 2>&1

:: Check and install dependencies
if not exist "node_modules" (
    echo Installing dependencies...
    call pnpm install
    if errorlevel 1 (
        echo Dependencies installation failed!
        pause
        exit /b 1
    )
    echo Dependencies installed.
)

if not exist "server\node_modules" (
    echo Installing server dependencies...
    cd server && call pnpm install && cd ..
)
if not exist "client\node_modules" (
    echo Installing client dependencies...
    cd client && call pnpm install && cd ..
)

echo.
echo Starting services...
echo.
echo   Frontend: http://localhost:5173
echo   Backend:  http://localhost:3001
echo.
echo Press Ctrl+C to stop all services.
echo ============================================
echo.

call pnpm dev
