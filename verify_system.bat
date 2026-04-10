@echo off
echo ========================================
echo   PharmaSight System Verification
echo ========================================
echo.

echo Checking model file...
if exist "runs\detect\train\weights\best_final.pt" (
    echo [OK] Model file found: best_final.pt
) else (
    echo [ERROR] Model file NOT found!
    echo Expected: runs\detect\train\weights\best_final.pt
    pause
    exit /b 1
)

echo.
echo Checking backend files...
if exist "backend\main.py" (
    echo [OK] backend\main.py
) else (
    echo [ERROR] backend\main.py NOT found!
)

if exist "backend\quality_analyzer.py" (
    echo [OK] backend\quality_analyzer.py
) else (
    echo [ERROR] backend\quality_analyzer.py NOT found!
)

if exist "backend\trust_engine.py" (
    echo [OK] backend\trust_engine.py
) else (
    echo [ERROR] backend\trust_engine.py NOT found!
)

echo.
echo Checking frontend files...
if exist "frontend\package.json" (
    echo [OK] frontend\package.json
) else (
    echo [ERROR] frontend\package.json NOT found!
)

if exist "frontend\node_modules" (
    echo [OK] frontend\node_modules (dependencies installed)
) else (
    echo [WARNING] frontend\node_modules NOT found!
    echo Run: cd frontend && npm install
)

echo.
echo Checking Python...
python --version >nul 2>&1
if %errorlevel% equ 0 (
    python --version
    echo [OK] Python is installed
) else (
    echo [ERROR] Python NOT found!
)

echo.
echo Checking Node.js...
node --version >nul 2>&1
if %errorlevel% equ 0 (
    node --version
    echo [OK] Node.js is installed
) else (
    echo [ERROR] Node.js NOT found!
)

echo.
echo ========================================
echo   Verification Complete
echo ========================================
echo.
echo If all checks passed, you can start:
echo   1. start_backend.bat
echo   2. frontend\start_frontend.bat
echo   3. Open http://localhost:5173
echo.
pause
