from pydantic import BaseModel, Field
from typing import Optional, Any


class AnalyzeParams(BaseModel):
    horizon_months: int = Field(3, ge=1, le=12, description="Meses a pronosticar")
    overstock_threshold_days: float = Field(75, description="Cobertura (días) sobre la cual se considera sobre-stock")
    understock_threshold_days: float = Field(30, description="Cobertura (días) bajo la cual se considera bajo-stock")
    target_coverage_days: float = Field(45, description="Cobertura objetivo para calcular exceso/faltante")
    current_stock: Optional[dict] = Field(default=None, description="Mapa product_id -> stock actual (opcional)")
    model_params: Optional[dict] = Field(default=None, description="Hiperparámetros XGBoost (opcional)")


class TrainResult(BaseModel):
    status: str
    metrics: dict
    feature_importance: dict
    model_path: Optional[str] = None
    timings: Optional[dict] = None


class AnalyzeResult(BaseModel):
    summary: dict
    metrics: dict
    feature_importance: dict
    products: list[Any]
    timings: Optional[dict] = None
