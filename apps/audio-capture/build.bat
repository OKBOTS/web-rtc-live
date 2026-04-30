@echo off
echo ========================================
echo Airwave Audio Host - Build Script
echo ========================================
echo.

cd /d "%~dp0"

echo [1/4] Installing Python dependencies...
pip install -r requirements.txt

if errorlevel 1 (
    echo ERROR: Failed to install dependencies
    pause
    exit /b 1
)

echo.
echo [2/4] Building with PyInstaller...
pyinstaller build.spec --clean

if errorlevel 1 (
    echo ERROR: Build failed
    pause
    exit /b 1
)

echo.
echo [3/4] Cleaning up...
if exist build rmdir /s /q build
if exist __pycache__ rmdir /s /q __pycache__
for /d %%i in (*) do if "%%i" neq "dist" if "%%i" neq "venv" rmdir /s /q "%%i"

echo.
echo ========================================
echo BUILD COMPLETE!
echo ========================================
echo.
echo Output: dist\airwave-audio-host\airwave-audio-host.exe
echo.
pause