@echo off
REM Levanta backend (8000) y microservicio ML (8001) en ventanas separadas.
REM El frontend se corre aparte:  cd frontend ^&^& npm run dev
echo Iniciando ML-Service (XGBoost) en :8001 ...
start "ML-Service" cmd /k "cd ml-service && call venv\Scripts\activate && python -m uvicorn app.main:app --port 8001 --reload"
echo Iniciando Backend (FastAPI) en :8000 ...
start "Backend" cmd /k "cd backend && call venv\Scripts\activate && python -m uvicorn app.main:app --port 8000 --reload"
echo.
echo Backend:  http://localhost:8000/docs
echo ML:       http://localhost:8001/docs
echo Frontend: cd frontend ^&^& npm run dev
