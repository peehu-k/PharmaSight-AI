@echo off
echo ========================================
echo   PharmaSight Backend Starting...
echo ========================================
echo.
echo Backend will run on: http://localhost:8000
echo API Docs available at: http://localhost:8000/docs
echo.
echo Press Ctrl+C to stop the backend
echo ========================================
echo.

cd /d "%~dp0"
uvicorn backend.main:app --reload --port 8000

pause
