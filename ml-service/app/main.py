"""
Microservicio de Machine Learning — RetailPyme
Modelo: XGBoost (pronóstico de demanda mensual + detección de sobre-stock)

Corre por separado del backend principal (puerto 8001 por defecto).
El backend principal lo consume vía HTTP para entrenar y predecir.
"""
import os
import io
import json
import uuid
import joblib
import pandas as pd
from datetime import datetime
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware

from app.forecasting import (
    run_full_analysis, prepare_monthly, build_training_frame,
    train_and_evaluate, recursive_forecast, analyze_overstock,
)
from app.schemas import TrainResult, AnalyzeResult

MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "models")
os.makedirs(MODELS_DIR, exist_ok=True)

# URL del backend principal (para callbacks de training-jobs)
MAIN_BACKEND_URL = os.getenv("MAIN_BACKEND_URL", "http://localhost:8000")

app = FastAPI(
    title="RetailPyme ML Service",
    description="Microservicio XGBoost para pronóstico de demanda y detección de sobre-stock",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ALLOWED = {".csv", ".xlsx", ".xls"}


def _read_upload(content: bytes, filename: str) -> pd.DataFrame:
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED:
        raise HTTPException(400, f"Extensión no soportada. Use: {ALLOWED}")
    try:
        if ext == ".csv":
            return pd.read_csv(io.BytesIO(content))
        return pd.read_excel(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(400, f"No se pudo leer el archivo: {e}")


@app.get("/health")
def health():
    return {"status": "ok", "service": "ml-service", "model": "xgboost", "time": datetime.utcnow().isoformat()}


@app.post("/analyze", response_model=AnalyzeResult)
async def analyze(
    file: UploadFile = File(...),
    params: str = Form("{}"),
):
    """
    Núcleo del sistema: recibe un CSV/Excel de ventas históricas (meses anteriores),
    entrena XGBoost, pronostica la demanda y detecta qué productos tienen sobre-stock,
    cuánto exceso y cuándo. Devuelve todo en JSON para mostrar en el frontend.
    """
    content = await file.read()
    df = _read_upload(content, file.filename)
    try:
        p = json.loads(params) if params else {}
    except json.JSONDecodeError:
        raise HTTPException(400, "params no es un JSON válido")
    try:
        result = run_full_analysis(df, p)
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception as e:
        raise HTTPException(500, f"Error en el análisis: {e}")
    return result


@app.post("/train", response_model=TrainResult)
async def train(
    file: UploadFile = File(...),
    params: str = Form("{}"),
    persist: bool = Form(True),
):
    """
    Entrena y guarda un modelo XGBoost a partir del dataset. Devuelve métricas e
    importancia de variables. Usado por el flujo de 'training-jobs' del backend.
    """
    content = await file.read()
    df = _read_upload(content, file.filename)
    try:
        p = json.loads(params) if params else {}
    except json.JSONDecodeError:
        raise HTTPException(400, "params no es un JSON válido")

    try:
        series, meta, _ = prepare_monthly(df)
        full, prod_codes = build_training_frame(series)
        model, metrics, importance = train_and_evaluate(full, p.get("model_params"))
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception as e:
        raise HTTPException(500, f"Error entrenando: {e}")

    model_path = None
    if persist:
        model_path = os.path.join(MODELS_DIR, f"xgb_{uuid.uuid4().hex[:12]}.joblib")
        joblib.dump({"model": model, "prod_codes": prod_codes, "meta": meta,
                     "trained_at": datetime.utcnow().isoformat()}, model_path)

    return {"status": "completed", "metrics": metrics,
            "feature_importance": {k: round(v, 4) for k, v in importance.items()},
            "model_path": model_path}


# ─── Flujo asíncrono opcional para training-jobs del backend principal ───
async def _run_job_and_callback(job_id: str, content: bytes, filename: str, params: dict, token: str | None):
    import httpx
    callback = f"{MAIN_BACKEND_URL}/api/v1/ml/training-jobs/{job_id}/result"
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    try:
        df = _read_upload(content, filename)
        series, _, _ = prepare_monthly(df)
        full, _ = build_training_frame(series)
        _, metrics, importance = train_and_evaluate(full, params.get("model_params"))
        payload = {"status": "completed",
                   "metrics": {**metrics, "feature_importance_top": dict(list(importance.items())[:5])}}
    except Exception as e:
        payload = {"status": "failed", "error_log": str(e)}
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            await client.patch(callback, json=payload, headers=headers)
    except Exception:
        pass


@app.post("/jobs/{job_id}/run")
async def run_job(
    job_id: str,
    background: BackgroundTasks,
    file: UploadFile = File(...),
    params: str = Form("{}"),
    token: str = Form(None),
):
    """Dispara un entrenamiento en segundo plano y notifica al backend vía callback."""
    content = await file.read()
    try:
        p = json.loads(params) if params else {}
    except json.JSONDecodeError:
        p = {}
    background.add_task(_run_job_and_callback, job_id, content, file.filename, p, token)
    return {"status": "running", "job_id": job_id}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=int(os.getenv("PORT", 8001)), reload=True)
