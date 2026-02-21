@echo off
REM Cleanup script for OneDrive file conflicts

echo Stopping Node.js processes...
taskkill /F /IM node.exe >nul 2>&1

echo Waiting for processes to terminate...
timeout /t 3 /nobreak >nul

echo Removing cached directories...
rmdir /s /q ".react-router" >nul 2>&1
rmdir /s /q "node_modules\.vite" >nul 2>&1
rmdir /s /q "build" >nul 2>&1

echo Clearing temporary files...
if exist "%TEMP%\hardReset-build" rmdir /s /q "%TEMP%\hardReset-build" >nul 2>&1
if exist "%TEMP%\hardReset-react-router" rmdir /s /q "%TEMP%\hardReset-react-router" >nul 2>&1

echo Starting development server...
npm run dev