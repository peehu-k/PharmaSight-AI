@echo off
echo ========================================
echo   PharmaSight - Starting System
echo ========================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.8+ from https://www.python.org/
    pause
    exit /b 1
)

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js 16+ from https://nodejs.org/
    pause
    exit /b 1
)

echo [1/4] Checking Python dependencies...
pip show fastapi >nul 2>&1
if errorlevel 1 (
    echo Installing Python dependencies...
    pip install -r requirements.txt
)

echo [2/4] Checking frontend dependencies...
if not exist "frontend\node_modules" (
    echo Installing frontend dependencies...
    cd frontend
    call npm install
    cd ..
)

echo [3/4] Starting backend server...
start "PharmaSight Backend" cmd /k "uvicorn backend.main:app --reload --port 8000"
timeout /t 3 >nul

echo [4/4] Starting frontend server...
start "PharmaSight Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo ========================================
echo   PharmaSight Started Successfully!
echo ========================================
echo.
echo Backend:  http://localhost:8000
echo Frontend: http://localhost:5173
echo API Docs: http://localhost:8000/docs
echo.
echo Press any key to stop all servers...
pause >nul

echo Stopping servers...
taskkill /FI "WindowTitle eq PharmaSight Backend*" /T /F >nul 2>&1
taskkill /FI "WindowTitle eq PharmaSight Frontend*" /T /F >nul 2>&1

echo Servers stopped.
