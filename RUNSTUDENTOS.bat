@echo off
REM Student OS System Launcher (Windows Batch Wrapper)
REM Simply run this file to start everything

cls
echo.
echo ================================================================================
echo                    Student OS System Launcher
echo ================================================================================
echo.

REM Check if Python is installed
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: Python is not installed or not in PATH
    echo Please install Python 3.8+ from https://www.python.org
    pause
    exit /b 1
)

REM Check if required packages are available
python -m pip show requests >nul 2>nul
if %errorlevel% neq 0 (
    echo Installing required Python packages...
    python -m pip install requests --quiet
)

REM Run the launcher
echo Starting Student OS...
echo.
python RUNSTUDENTOS.py

REM Keep window open if there's an error
if %errorlevel% neq 0 (
    echo.
    echo Press any key to exit...
    pause
)
