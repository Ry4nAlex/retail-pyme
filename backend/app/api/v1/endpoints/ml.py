import os
import uuid
import json
import time
import httpx
import aiofiles
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional
from datetime import datetime
from app.db.database import get_db
from app.models.models import DatasetUpload, TrainingJob, StockAnalysis
from app.schemas.schemas import (
    DatasetUploadResponse, TrainingJobCreate, TrainingJobResponse,
    StockAnalysisResponse, StockAnalysisListItem,
)
from app.core.security import get_current_user, require_admin
from app.core.config import settings
from app.services.cloud_metrics import probe_ml_availability, build_cloud_metrics

router = APIRouter(prefix="/ml", tags=["Machine Learning"])

ALLOWED_EXTENSIONS = {".csv", ".xlsx", ".xls"}
DATASET_TYPES = ["sales_history", "inventory_history", "external_demand", "custom"]


async def _ml_post(path: str, files=None, data=None, timeout: float = 120.0) -> dict:
    """Llama al microservicio ML (XGBoost) que corre por separado."""
    url = f"{settings.ML_SERVICE_URL.rstrip('/')}{path}"
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(url, files=files, data=data)
    except httpx.ConnectError:
        raise HTTPException(
            503,
            "No se pudo conectar con el microservicio de ML. "
            f"¿Está corriendo en {settings.ML_SERVICE_URL}? (ml-service en el puerto 8001)",
        )
    except httpx.ReadTimeout:
        raise HTTPException(504, "El microservicio de ML tardó demasiado en responder.")
    if resp.status_code >= 400:
        detail = resp.json().get("detail", resp.text) if resp.headers.get("content-type", "").startswith("application/json") else resp.text
        raise HTTPException(resp.status_code, f"Error del microservicio ML: {detail}")
    return resp.json()


@router.post("/datasets/upload", response_model=DatasetUploadResponse, status_code=201)
async def upload_dataset(
    file: UploadFile = File(...),
    dataset_type: str = Form(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    if dataset_type not in DATASET_TYPES:
        raise HTTPException(400, f"Invalid dataset_type. Must be one of: {DATASET_TYPES}")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"File type not allowed. Use: {ALLOWED_EXTENSIONS}")

    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    content = await file.read()
    if len(content) > max_bytes:
        raise HTTPException(413, f"File too large. Max size: {settings.MAX_UPLOAD_SIZE_MB}MB")

    # Save file
    saved_name = f"{uuid.uuid4()}{ext}"
    save_path = os.path.join(settings.UPLOAD_DIR, "datasets", saved_name)
    async with aiofiles.open(save_path, "wb") as f:
        await f.write(content)

    # Parse to get row counts
    rows_total = rows_valid = rows_invalid = 0
    date_from = date_to = None
    error_log = None
    status_val = "ready"

    try:
        if ext == ".csv":
            df = pd.read_csv(save_path)
        else:
            df = pd.read_excel(save_path)

        rows_total = len(df)
        rows_invalid = int(df.isnull().any(axis=1).sum())
        rows_valid = rows_total - rows_invalid

        # Try to infer date range
        date_cols = [c for c in df.columns if "date" in c.lower() or "fecha" in c.lower()]
        if date_cols:
            try:
                dates = pd.to_datetime(df[date_cols[0]], errors="coerce").dropna()
                if not dates.empty:
                    date_from = dates.min().date()
                    date_to = dates.max().date()
            except Exception:
                pass
    except Exception as e:
        error_log = str(e)
        status_val = "failed"

    record = DatasetUpload(
        company_id=current_user["company_id"],
        uploaded_by=current_user["user_id"],
        filename=saved_name,
        original_name=file.filename,
        file_path=save_path,
        file_size=len(content),
        rows_total=rows_total,
        rows_valid=rows_valid,
        rows_invalid=rows_invalid,
        dataset_type=dataset_type,
        status=status_val,
        error_log=error_log,
        date_from=date_from,
        date_to=date_to,
        processed_at=datetime.utcnow(),
    )
    db.add(record)
    await db.flush()
    await db.refresh(record)
    return record


@router.get("/datasets", response_model=list[DatasetUploadResponse])
async def list_datasets(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    r = await db.execute(
        select(DatasetUpload)
        .where(DatasetUpload.company_id == current_user["company_id"])
        .order_by(DatasetUpload.created_at.desc())
    )
    return r.scalars().all()


@router.delete("/datasets/{dataset_id}")
async def delete_dataset(
    dataset_id,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    r = await db.execute(select(DatasetUpload).where(DatasetUpload.id == dataset_id))
    ds = r.scalar_one_or_none()
    if not ds:
        raise HTTPException(404, "Dataset not found")
    # Remove file
    try:
        if os.path.exists(ds.file_path):
            os.remove(ds.file_path)
    except Exception:
        pass
    await db.delete(ds)
    return {"message": "Dataset deleted"}


@router.get("/datasets/{dataset_id}/preview")
async def preview_dataset(
    dataset_id,
    rows: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    r = await db.execute(select(DatasetUpload).where(DatasetUpload.id == dataset_id))
    ds = r.scalar_one_or_none()
    if not ds:
        raise HTTPException(404, "Dataset not found")
    try:
        ext = os.path.splitext(ds.file_path)[1].lower()
        df = pd.read_csv(ds.file_path) if ext == ".csv" else pd.read_excel(ds.file_path)
        return {
            "columns": list(df.columns),
            "rows": df.head(rows).fillna("").to_dict(orient="records"),
            "total_rows": len(df),
            "dtypes": {c: str(t) for c, t in df.dtypes.items()},
        }
    except Exception as e:
        raise HTTPException(500, f"Error reading file: {e}")


# ─── TRAINING JOBS ───

@router.post("/training-jobs", response_model=TrainingJobResponse, status_code=201)
async def create_training_job(
    data: TrainingJobCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    if data.model_type != "xgboost":
        raise HTTPException(400, "Only XGBoost training is available")

    # Verify dataset belongs to company
    r = await db.execute(select(DatasetUpload).where(
        DatasetUpload.id == data.dataset_id,
        DatasetUpload.company_id == current_user["company_id"],
        DatasetUpload.status == "ready",
    ))
    ds = r.scalar_one_or_none()
    if not ds:
        raise HTTPException(404, "Dataset not found or not ready for training")

    job = TrainingJob(
        company_id=current_user["company_id"],
        dataset_id=data.dataset_id,
        model_type=data.model_type,
        parameters=data.parameters,
        status="running",
        started_at=datetime.utcnow(),
    )
    db.add(job)
    await db.flush()
    await db.refresh(job)

    # Entrenar de verdad llamando al microservicio XGBoost
    try:
        if not os.path.exists(ds.file_path):
            raise HTTPException(404, "Dataset file not found on disk")
        ext = os.path.splitext(ds.file_path)[1].lower()
        mime = "text/csv" if ext == ".csv" else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        with open(ds.file_path, "rb") as fh:
            files = {"file": (ds.original_name, fh.read(), mime)}
        out = await _ml_post(
            "/train",
            files=files,
            data={"params": json.dumps(data.parameters or {}), "persist": "true"},
        )
        job.status = "completed"
        job.metrics = {**out.get("metrics", {}),
                       "feature_importance_top": dict(list((out.get("feature_importance") or {}).items())[:5])}
        job.model_path = out.get("model_path")
        job.completed_at = datetime.utcnow()
    except HTTPException as e:
        job.status = "failed"
        job.error_log = str(e.detail)
        job.completed_at = datetime.utcnow()
    except Exception as e:
        job.status = "failed"
        job.error_log = str(e)
        job.completed_at = datetime.utcnow()

    await db.flush()
    await db.refresh(job)
    return job


@router.get("/training-jobs", response_model=list[TrainingJobResponse])
async def list_training_jobs(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    r = await db.execute(
        select(TrainingJob)
        .where(TrainingJob.company_id == current_user["company_id"])
        .order_by(TrainingJob.created_at.desc())
    )
    return r.scalars().all()


@router.get("/training-jobs/{job_id}", response_model=TrainingJobResponse)
async def get_training_job(
    job_id,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    r = await db.execute(select(TrainingJob).where(TrainingJob.id == job_id))
    job = r.scalar_one_or_none()
    if not job:
        raise HTTPException(404, "Training job not found")
    return job


# This endpoint is called by the ML microservice to update job status + metrics
@router.patch("/training-jobs/{job_id}/result")
async def update_job_result(
    job_id,
    payload: dict,
    db: AsyncSession = Depends(get_db),
):
    """
    Called by the ML service (internal) to update training results.
    Expected payload: { status, metrics, model_path, error_log }
    """
    r = await db.execute(select(TrainingJob).where(TrainingJob.id == job_id))
    job = r.scalar_one_or_none()
    if not job:
        raise HTTPException(404, "Training job not found")

    job.status = payload.get("status", job.status)
    job.metrics = payload.get("metrics", job.metrics)
    job.model_path = payload.get("model_path", job.model_path)
    job.error_log = payload.get("error_log", job.error_log)
    if payload.get("status") == "running" and not job.started_at:
        job.started_at = datetime.utcnow()
    if payload.get("status") in ("completed", "failed"):
        job.completed_at = datetime.utcnow()

    await db.flush()
    return {"message": "Job updated"}


# ─── ANÁLISIS DE SOBRE-STOCK (núcleo: cliente sube CSV/Excel y predice) ───

@router.post("/analyze-stock", response_model=StockAnalysisResponse, status_code=201)
async def analyze_stock(
    file: UploadFile = File(...),
    horizon_months: int = Form(3),
    overstock_threshold_days: float = Form(75),
    understock_threshold_days: float = Form(30),
    target_coverage_days: float = Form(45),
    current_stock: str = Form(None),          # JSON opcional: {"prod-001": 120, ...}
    dataset_id: str = Form(None),             # opcional: enlazar a un dataset ya subido
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """
    El cliente sube su archivo de ventas de meses anteriores. El backend lo envía
    al microservicio XGBoost, que pronostica la demanda y detecta qué productos
    tienen sobre-stock (cuánto exceso y cuándo). El resultado se guarda y se devuelve.
    """
    t_start = time.perf_counter()
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Tipo de archivo no permitido. Use: {ALLOWED_EXTENSIONS}")

    t_recv = time.perf_counter()
    content = await file.read()
    receive_ms = (time.perf_counter() - t_recv) * 1000
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(413, f"Archivo muy grande. Máx: {settings.MAX_UPLOAD_SIZE_MB}MB")

    params = {
        "horizon_months": horizon_months,
        "overstock_threshold_days": overstock_threshold_days,
        "understock_threshold_days": understock_threshold_days,
        "target_coverage_days": target_coverage_days,
    }
    if current_stock:
        try:
            params["current_stock"] = json.loads(current_stock)
        except json.JSONDecodeError:
            raise HTTPException(400, "current_stock debe ser un JSON válido")

    mime = "text/csv" if ext == ".csv" else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    t_ml = time.perf_counter()
    out = await _ml_post(
        "/analyze",
        files={"file": (file.filename, content, mime)},
        data={"params": json.dumps(params)},
    )
    ml_roundtrip_ms = (time.perf_counter() - t_ml) * 1000

    summary = out.get("summary", {})

    # ── Métricas operativas cloud (flujo completo del sistema) ──
    ml_timings = out.get("timings", {}) or {}
    records = ml_timings.get("records_in", 0)
    availability = await probe_ml_availability(settings.ML_SERVICE_URL, n=5)
    t_db = time.perf_counter()
    record = StockAnalysis(
        company_id=current_user["company_id"],
        created_by=current_user["user_id"],
        dataset_id=dataset_id if dataset_id else None,
        source_filename=file.filename,
        horizon_months=horizon_months,
        total_products=summary.get("total_products", 0),
        overstock_count=summary.get("overstock_count", 0),
        understock_count=summary.get("understock_count", 0),
        healthy_count=summary.get("healthy_count", 0),
        excess_value=summary.get("total_excess_value", 0),
        metrics=out.get("metrics", {}),
        result=out,
    )
    db.add(record)
    await db.flush()
    db_ms = (time.perf_counter() - t_db) * 1000

    backend_stages = [
        {"stage": "Recepción de archivo", "ms": round(receive_ms, 1)},
        {"stage": "Llamada al microservicio ML", "ms": round(ml_roundtrip_ms - (ml_timings.get("total_ml_ms") or 0), 1)},
        {"stage": "Guardado en BD", "ms": round(db_ms, 1)},
    ]
    cloud = build_cloud_metrics(
        records=records,
        total_ms=(time.perf_counter() - t_start) * 1000,
        backend_stages=backend_stages,
        ml_timings=ml_timings,
        availability=availability,
    )
    out["cloud_metrics"] = cloud
    record.result = out
    await db.flush()
    await db.refresh(record)
    return record


@router.get("/analyses", response_model=list[StockAnalysisListItem])
async def list_analyses(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    r = await db.execute(
        select(StockAnalysis)
        .where(StockAnalysis.company_id == current_user["company_id"])
        .order_by(StockAnalysis.created_at.desc())
    )
    return r.scalars().all()


@router.get("/analyses/{analysis_id}", response_model=StockAnalysisResponse)
async def get_analysis(
    analysis_id,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    r = await db.execute(select(StockAnalysis).where(
        StockAnalysis.id == analysis_id,
        StockAnalysis.company_id == current_user["company_id"],
    ))
    a = r.scalar_one_or_none()
    if not a:
        raise HTTPException(404, "Análisis no encontrado")
    return a


@router.delete("/analyses/{analysis_id}")
async def delete_analysis(
    analysis_id,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    r = await db.execute(select(StockAnalysis).where(
        StockAnalysis.id == analysis_id,
        StockAnalysis.company_id == current_user["company_id"],
    ))
    a = r.scalar_one_or_none()
    if not a:
        raise HTTPException(404, "Análisis no encontrado")
    await db.delete(a)
    return {"message": "Análisis eliminado"}


@router.get("/health-ml")
async def ml_service_health():
    """Verifica si el microservicio XGBoost está disponible."""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"{settings.ML_SERVICE_URL.rstrip('/')}/health")
        return {"reachable": resp.status_code == 200, "detail": resp.json()}
    except Exception as e:
        return {"reachable": False, "detail": str(e)}


@router.get("/cloud-metrics/live")
async def cloud_metrics_live():
    """Mide en vivo latencia y disponibilidad del microservicio ML (5 health-checks)."""
    av = await probe_ml_availability(settings.ML_SERVICE_URL, n=5)
    return {
        "ml_service_url": settings.ML_SERVICE_URL,
        "api_latency_ms": av.get("api_latency_ms"),
        "availability_pct": av.get("availability_pct"),
        "availability_checks": av.get("availability_checks"),
        "measured_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
    }


# ─── PREDICTIONS ───

@router.get("/predictions")
async def list_predictions(
    product_id: str = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    from app.models.models import DemandPrediction
    q = select(DemandPrediction).where(DemandPrediction.company_id == current_user["company_id"])
    if product_id:
        q = q.where(DemandPrediction.product_id == product_id)
    q = q.order_by(DemandPrediction.prediction_date)
    r = await db.execute(q)
    return r.scalars().all()


@router.get("/restock-recommendations")
async def list_restock(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    from app.models.models import RestockRecommendation
    r = await db.execute(
        select(RestockRecommendation)
        .where(
            RestockRecommendation.company_id == current_user["company_id"],
            RestockRecommendation.acknowledged == False,
        )
        .order_by(RestockRecommendation.urgency)
    )
    return r.scalars().all()


@router.patch("/restock-recommendations/{rec_id}/acknowledge")
async def acknowledge_restock(
    rec_id,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    from app.models.models import RestockRecommendation
    r = await db.execute(select(RestockRecommendation).where(RestockRecommendation.id == rec_id))
    rec = r.scalar_one_or_none()
    if not rec:
        raise HTTPException(404, "Recommendation not found")
    rec.acknowledged = True
    return {"message": "Acknowledged"}
