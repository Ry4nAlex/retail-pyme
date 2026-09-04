#!/usr/bin/env bash
# Levanta el backend (8000) y el microservicio ML (8001) juntos.
# El frontend se corre aparte:  cd frontend && npm run dev
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "▶ Iniciando ML-Service (XGBoost) en :8001 ..."
( cd "$ROOT/ml-service" && \
  [ -d venv ] && source venv/bin/activate 2>/dev/null; \
  python -m uvicorn app.main:app --port 8001 ) &
ML_PID=$!

echo "▶ Iniciando Backend (FastAPI) en :8000 ..."
( cd "$ROOT/backend" && \
  [ -d venv ] && source venv/bin/activate 2>/dev/null; \
  python -m uvicorn app.main:app --port 8000 ) &
BK_PID=$!

trap "echo '⏹ Deteniendo...'; kill $ML_PID $BK_PID 2>/dev/null" INT TERM
echo "✔ Backend:  http://localhost:8000/docs"
echo "✔ ML:       http://localhost:8001/docs"
echo "→ Frontend: cd frontend && npm run dev  (http://localhost:3000)"
wait
