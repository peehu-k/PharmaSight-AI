@echo off
echo ========================================
echo   PharmaSight Frontend Starting...
echo ========================================
echo.
echo Frontend will run on: http://localhost:5173
echo Open this URL in your browser
echo.
echo Press Ctrl+C to stop the frontend
echo ========================================
echo.

cd /d "%~dp0"
npm run dev

pause
