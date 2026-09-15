"""
Métricas operativas de la arquitectura cloud.

No mide "lo almacenado en cada nube" sino el FLUJO completo del sistema:
  Usuario sube CSV/Excel → Backend recibe → ETL procesa → BD guarda →
  Modelo predice → Dashboard muestra.

Se registra cuánto demora cada etapa y se derivan 4 indicadores clave:
  • Tiempo total de procesamiento
  • Latencia promedio de la API (ping al microservicio ML)
  • Throughput (registros por segundo)
  • Disponibilidad durante las pruebas (% de health-checks OK)
"""
import time
from datetime import datetime

import httpx


async def probe_ml_availability(
    base_url: str,
    n: int = 5,
    timeout: float = 4.0,
) -> dict:
    """Verifica disponibilidad puntual del microservicio ML."""
    url = f"{base_url.rstrip('/')}/health"

    ok = 0

    async with httpx.AsyncClient(timeout=timeout) as client:
        for _ in range(max(1, n)):
            try:
                r = await client.get(url)

                if r.status_code == 200:
                    ok += 1

            except Exception:
                pass

    checks = max(1, n)

    return {
        "availability_pct": round(ok / checks * 100, 1),
        "availability_checks": checks,
        "availability_ok": ok,
    }


class StageTimer:
    """Cronómetro de etapas. Uso:  with timer.stage('ETL'): ...  """
    def __init__(self):
        self._t0 = time.perf_counter()
        self.stages = []   # [{"stage": nombre, "ms": ...}]

    def mark(self, name: str, seconds: float):
        self.stages.append({"stage": name, "ms": round(seconds * 1000, 1)})

    def total_ms(self) -> float:
        return round((time.perf_counter() - self._t0) * 1000, 1)

    class _Ctx:
        def __init__(self, timer, name):
            self.timer, self.name = timer, name
        def __enter__(self):
            self.t = time.perf_counter(); return self
        def __exit__(self, *exc):
            self.timer.mark(self.name, time.perf_counter() - self.t)

    def stage(self, name: str):
        return StageTimer._Ctx(self, name)


def build_cloud_metrics(*, records: int, total_ms: float, backend_stages: list,
                        ml_timings: dict | None, availability: dict | None) -> dict:
    """Ensambla el bloque de métricas operativas cloud que verá el frontend."""
    ml_timings = ml_timings or {}
    availability = availability or {}

    # Detalle de etapas (backend) + etapas internas del ML (ETL/entrenamiento/pronóstico)
    stages = list(backend_stages)
    ml_stage_map = [
        ("ETL (limpieza + features)", "etl_ms"),
        ("Entrenamiento del modelo", "train_ms"),
        ("Pronóstico", "forecast_ms"),
    ]
    for label, key in ml_stage_map:
        if ml_timings.get(key) is not None:
            stages.append({"stage": label, "ms": ml_timings[key]})

    total_s = total_ms / 1000 if total_ms else None
    throughput = round(records / total_s, 1) if total_s and total_s > 0 and records else None

    return {
        "records_processed": int(records),
        "total_processing_ms": round(total_ms, 1),
        "total_processing_s": round(total_ms / 1000, 2) if total_ms else None,
        "ml_total_ms": ml_timings.get("total_ml_ms"),
        "throughput_rps": throughput,
        "availability_pct": availability.get("availability_pct"),
        "availability_checks": availability.get("availability_checks"),
        "stages_ms": stages,
        "measured_at": datetime.utcnow().isoformat() + "Z",
    }

API_PERFORMANCE_BENCHMARK = {
    "tool": "k6",
    "endpoint": "/api/v1/ml/analyses",
    "duration_seconds": 60,
    "test_date": "2026-09-15",
    "description": (
        "Prueba externa cliente-servidor sobre la API pública "
        "desplegada en Railway."
    ),
    "scenarios": [
        {
            "vus": 1,
            "p50_ms": 633.62,
            "p95_ms": 799.42,
            "p99_ms": 1094.43,
            "requests_per_second": 1.50,
            "error_pct": 0.0,
            "requests": 91,
        },
        {
            "vus": 10,
            "p50_ms": 654.74,
            "p95_ms": 1339.30,
            "p99_ms": 1923.14,
            "requests_per_second": 13.02,
            "error_pct": 0.0,
            "requests": 788,
        },
        {
            "vus": 25,
            "p50_ms": 1366.41,
            "p95_ms": 2252.13,
            "p99_ms": 3890.79,
            "requests_per_second": 17.13,
            "error_pct": 0.0,
            "requests": 1046,
        },
        {
            "vus": 50,
            "p50_ms": 2734.46,
            "p95_ms": 5072.96,
            "p99_ms": 8258.53,
            "requests_per_second": 17.19,
            "error_pct": 0.0,
            "requests": 1080,
        },
    ],
}


def get_api_performance_benchmark() -> dict:
    return API_PERFORMANCE_BENCHMARK
