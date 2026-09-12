@echo off
title RetailPyme Launcher

echo ========================================
echo       RETAIL PYME - INICIANDO
echo ========================================
echo.

echo [1/4] Iniciando ML-Service...
start "ML-Service" /D "%~dp0ml-service" cmd /k ".\venv\Scripts\python.exe -m uvicorn app.main:app --port 8001 --reload"

timeout /t 1 /nobreak >nul

echo [2/4] Iniciando Backend...
start "Backend" /D "%~dp0backend" cmd /k ".\venv\Scripts\python.exe -m uvicorn app.main:app --port 8000 --reload"

timeout /t 1 /nobreak >nul

echo [3/4] Iniciando Frontend...
start "Frontend" /D "%~dp0frontend" cmd /k "npm run dev"

timeout /t 3 /nobreak >nul

echo [4/4] Iniciando ngrok...
start "ngrok" cmd /k "ngrok http 3000"

echo.
echo ========================================
echo       RETAIL PYME INICIADO
echo ========================================
echo.
echo Local:
echo http://localhost:3000
echo.
echo Backend:
echo http://localhost:8000/docs
echo.
echo ML:
echo http://localhost:8001/docs
echo.
echo Publico:
echo https://vegan-buddhism-storage.ngrok-free.dev
echo.
echo Deben quedar abiertas 4 ventanas:
echo - Backend
echo - ML-Service
echo - Frontend
echo - ngrok
echo.
pause