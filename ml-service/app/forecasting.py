"""
Motor de pronóstico de demanda mensual y detección de sobre-stock con XGBoost.
Versión final (agregación mensual) — validada contra dataset_farma.xlsx.
"""
from __future__ import annotations
import time
import unicodedata
import numpy as np
import pandas as pd
from xgboost import XGBRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

COL_ALIASES = {
    "date":         ["date", "fecha", "fecha_venta", "dia", "día"],
    "product_id":   ["product_id", "producto_id", "id_producto", "sku", "codigo", "código"],
    "product_name": ["product_name", "producto", "nombre", "nombre_producto", "descripcion", "descripción"],
    "category":     ["category", "categoria", "categoría", "rubro", "linea", "línea"],
    "quantity":     ["quantity", "cantidad", "qty", "unidades", "vendidos"],
    "unit_price":   ["unit_price", "precio", "precio_unitario", "price"],
    "stock":        ["stock", "stock_actual", "existencias", "inventario", "current_stock", "stock_disponible"],
}

FEATURES = ["month", "q_sin", "q_cos", "prod_code", "lag_1", "lag_2", "lag_3",
            "rm_3", "rm_6", "trend"]

DEFAULT_PARAMS = dict(
    n_estimators=300, max_depth=3, learning_rate=0.03, min_child_weight=3,
    subsample=0.8, colsample_bytree=0.9, reg_lambda=3.0,
    objective="reg:squarederror", random_state=42, n_jobs=2,
)


def _resolve_columns(df: pd.DataFrame) -> dict:
    lower = {_norm_column(c): c for c in df.columns}
    found = {}
    for canonical, aliases in COL_ALIASES.items():
        for a in aliases:
            key = _norm_column(a)
            if key in lower:
                found[canonical] = lower[key]
                break
    return found


def _norm_column(value) -> str:
    text = str(value).strip().lower()
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    for sep in (" ", "-", ".", "/"):
        text = text.replace(sep, "_")
    while "__" in text:
        text = text.replace("__", "_")
    return text.strip("_")


def prepare_monthly(df: pd.DataFrame):
    """Normaliza el archivo a demanda MENSUAL por producto (meses sin venta = 0)."""
    cols = _resolve_columns(df)
    missing = [c for c in ("date", "product_id", "quantity") if c not in cols]
    if missing:
        raise ValueError(
            f"Faltan columnas obligatorias: {missing}. "
            "Se requieren al menos: fecha, producto y cantidad."
        )

    d = pd.DataFrame()
    d["date"] = pd.to_datetime(df[cols["date"]], errors="coerce")
    d["product_id"] = df[cols["product_id"]].astype(str)
    d["quantity"] = pd.to_numeric(df[cols["quantity"]], errors="coerce")
    d["product_name"] = df[cols["product_name"]].astype(str) if "product_name" in cols else d["product_id"]
    d["category"] = df[cols["category"]].astype(str) if "category" in cols else "General"
    d["unit_price"] = pd.to_numeric(df[cols["unit_price"]], errors="coerce") if "unit_price" in cols else np.nan

    d = d.dropna(subset=["date", "quantity"])
    d = d[d["quantity"] >= 0]
    if d.empty:
        raise ValueError("No hay filas válidas tras la limpieza (fecha/cantidad).")

    meta = (d.groupby("product_id")
              .agg(product_name=("product_name", "first"),
                   category=("category", "first"),
                   unit_price=("unit_price", "mean"))
              .to_dict("index"))

    stock_in_file = {}
    if "stock" in cols:
        s = pd.to_numeric(df[cols["stock"]], errors="coerce")
        tmp = pd.DataFrame({"product_id": df[cols["product_id"]].astype(str), "stock": s}).dropna()
        stock_in_file = tmp.groupby("product_id")["stock"].last().to_dict()

    d["m"] = d["date"].dt.to_period("M").dt.start_time
    monthly = d.groupby(["product_id", "m"])["quantity"].sum().reset_index()

    rng = pd.date_range(monthly["m"].min(), monthly["m"].max(), freq="MS")
    frames = []
    for pid, g in monthly.groupby("product_id"):
        s = g.set_index("m")["quantity"].reindex(rng, fill_value=0)
        frames.append(pd.DataFrame({"product_id": pid, "m": s.index, "quantity": s.values}))
    series = pd.concat(frames, ignore_index=True)
    return series, meta, stock_in_file


def _add_features(g: pd.DataFrame) -> pd.DataFrame:
    g = g.sort_values("m").copy()
    g["month"] = g["m"].dt.month
    g["q_sin"] = np.sin(2 * np.pi * g["month"] / 12)
    g["q_cos"] = np.cos(2 * np.pi * g["month"] / 12)
    for l in (1, 2, 3):
        g[f"lag_{l}"] = g["quantity"].shift(l)
    g["rm_3"] = g["quantity"].shift(1).rolling(3).mean()
    g["rm_6"] = g["quantity"].shift(1).rolling(6, min_periods=3).mean()
    g["trend"] = g["quantity"].shift(1) - g["quantity"].shift(2)
    return g


def build_training_frame(series: pd.DataFrame):
    prod_codes = {pid: i for i, pid in enumerate(sorted(series["product_id"].unique()))}
    parts = []
    for pid, g in series.groupby("product_id"):
        gf = _add_features(g)
        gf["prod_code"] = prod_codes[pid]
        parts.append(gf)
    full = pd.concat(parts, ignore_index=True).dropna(subset=["lag_1", "lag_2", "lag_3", "rm_3", "rm_6"])
    return full, prod_codes


def _regression_metrics(y_true, y_pred):
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    mae = float(mean_absolute_error(y_true, y_pred))
    rmse = float(np.sqrt(mean_squared_error(y_true, y_pred)))
    mask = y_true > 0
    mape = float(np.mean(np.abs((y_true[mask] - y_pred[mask]) / y_true[mask])) * 100) if mask.any() else None
    r2 = float(r2_score(y_true, y_pred)) if len(np.unique(y_true)) > 1 else None
    total_actual = float(np.sum(y_true))
    total_abs_error = float(np.sum(np.abs(y_true - y_pred)))
    wape = float(total_abs_error / total_actual * 100) if total_actual > 0 else None
    bias_pct = float((np.sum(y_pred) - total_actual) / total_actual * 100) if total_actual > 0 else None
    forecast_accuracy = max(0.0, 100.0 - wape) if wape is not None else None
    return {
        "mae": round(mae, 3),
        "rmse": round(rmse, 3),
        "mape": round(mape, 2) if mape is not None else None,
        "r2": round(r2, 4) if r2 is not None else None,
        "wape": round(wape, 2) if wape is not None else None,
        "bias_pct": round(bias_pct, 2) if bias_pct is not None else None,
        "forecast_accuracy_pct": round(forecast_accuracy, 2) if forecast_accuracy is not None else None,
    }


def _metric_gap(train_value, test_value):
    if train_value is None or test_value is None:
        return None
    return round(abs(float(test_value) - float(train_value)), 2)


def _ratio_pct(part, total):
    return round(float(part) / float(total) * 100, 1) if total else 0.0


def _split_70_20_10(n: int, train=0.70, val=0.20):
    """Cuentas exactas para un split cronológico 70/20/10 (por filas)."""
    n_train = int(round(n * train))
    n_val = int(round(n * val))
    # garantiza al menos 1 registro en val y test
    n_train = min(n_train, n - 2) if n >= 3 else max(1, n - 1)
    n_val = min(n_val, n - n_train - 1) if n - n_train - 1 >= 1 else max(0, n - n_train)
    n_test = n - n_train - n_val
    return n_train, n_val, n_test


def _period(part: pd.DataFrame):
    if part is None or len(part) == 0:
        return {"from": None, "to": None}
    return {"from": pd.Timestamp(part["m"].min()).date().isoformat(),
            "to": pd.Timestamp(part["m"].max()).date().isoformat()}


def _eval_series(part: pd.DataFrame, pred):
    """Serie agregada por mes: demanda real vs predicha (para graficar la validación)."""
    if part is None or len(part) == 0:
        return []
    tmp = part[["m", "quantity"]].copy()
    tmp["pred"] = np.clip(pred, 0, None)
    g = tmp.groupby("m").agg(real=("quantity", "sum"), pred=("pred", "sum")).reset_index()
    return [{"month": pd.Timestamp(r["m"]).date().isoformat(),
             "real": round(float(r["real"]), 1),
             "pred": round(float(r["pred"]), 1)} for _, r in g.iterrows()]


def train_and_evaluate(full: pd.DataFrame, params: dict | None = None):
    """
    Entrena XGBoost global con split cronológico 70/20/10 (train/validación/test).
    Solo se reportan métricas de VALIDACIÓN y TEST (del train no se reportan
    resultados, se usa únicamente para ajustar el modelo).
    El corte es por fila sobre la secuencia temporal (orden por mes), así las
    cuentas 70/20/10 son exactas e idénticas para datasets del mismo tamaño.
    """
    full = full.sort_values(["m", "prod_code"]).reset_index(drop=True)
    n = int(len(full))
    n_train, n_val, n_test = _split_70_20_10(n)

    train = full.iloc[:n_train]
    val = full.iloc[n_train:n_train + n_val]
    test = full.iloc[n_train + n_val:]

    cfg = dict(DEFAULT_PARAMS)
    if params:
        cfg.update({k: v for k, v in params.items() if k in cfg})

    model = XGBRegressor(**cfg)
    model.fit(train[FEATURES], train["quantity"])   # se ajusta SOLO con train

    def _pred(part):
        return np.clip(model.predict(part[FEATURES]), 0, None) if len(part) else np.array([])

    train_pred, val_pred, test_pred = _pred(train), _pred(val), _pred(test)
    train_metrics = _regression_metrics(train["quantity"].values, train_pred) if len(train) else None
    val_metrics = _regression_metrics(val["quantity"].values, val_pred) if len(val) else None
    test_metrics = _regression_metrics(test["quantity"].values, test_pred) if len(test) else None

    importance = dict(sorted(zip(FEATURES, model.feature_importances_.astype(float)),
                             key=lambda x: x[1], reverse=True))

    headline = test_metrics or val_metrics or {}
    metrics = {
        # Titular = TEST (mantiene compatibilidad con la UI existente)
        **headline,
        "n_train": n_train, "n_val": n_val, "n_test": n_test, "n_total": n,
        "train_pct": _ratio_pct(n_train, n), "val_pct": _ratio_pct(n_val, n), "test_pct": _ratio_pct(n_test, n),
        "target_split": "70/20/10",
        "split_strategy": "chronological_70_20_10",
        "split_note": "Split cronologico 70/20/10 (train/validacion/test) por orden temporal. "
                      "Del train no se reportan resultados; solo validacion y test.",
        "granularity": "monthly",
        "evaluated_on": ["validation", "test"],
        # Bloques que SI se reportan
        "validation": val_metrics,
        "test": test_metrics,
        # Train solo de referencia interna (no es un resultado evaluado)
        "train_reference": train_metrics,
        "periods": {
            "train": _period(train),
            "validation": _period(val),
            "test": _period(test),
        },
        # Series real vs predicho para graficar (lo mas explicable del modelo)
        "eval_series": {
            "validation": _eval_series(val, val_pred),
            "test": _eval_series(test, test_pred),
        },
    }
    return model, metrics, importance


def recursive_forecast(model, series, prod_codes, horizon_months=3):
    out = {}
    for pid, g in series.groupby("product_id"):
        hist = g.sort_values("m")[["m", "quantity"]].copy()
        last = hist["m"].max()
        future = pd.date_range(last + pd.offsets.MonthBegin(1), periods=horizon_months, freq="MS")
        work = hist.copy()
        rows = []
        for fm in future:
            tmp = pd.concat([work, pd.DataFrame({"m": [fm], "quantity": [np.nan]})], ignore_index=True)
            feat = _add_features(tmp).iloc[-1:].copy()
            feat["prod_code"] = prod_codes[pid]
            yhat = float(np.clip(model.predict(feat[FEATURES])[0], 0, None))
            rows.append((fm, yhat))
            work = pd.concat([work, pd.DataFrame({"m": [fm], "quantity": [yhat]})], ignore_index=True)
        out[pid] = pd.DataFrame(rows, columns=["m", "forecast"])
    return out


def analyze_overstock(series, meta, forecasts, stock_in_file, params):
    horizon_months = int(params.get("horizon_months", 3))
    overstock_days = float(params.get("overstock_threshold_days", 75))
    understock_days = float(params.get("understock_threshold_days", 30))
    target_days = float(params.get("target_coverage_days", 45))
    stock_override = params.get("current_stock") or {}
    override_keys = {str(k): v for k, v in stock_override.items()}

    today = series["m"].max()
    results = []
    for pid, fc in forecasts.items():
        hist = series[series["product_id"] == pid].sort_values("m")
        monthly_hist = hist["quantity"]
        avg_month_hist = float(monthly_hist.mean())
        recent_month = float(monthly_hist.tail(3).mean()) if len(monthly_hist) >= 1 else avg_month_hist
        peak_month = float(monthly_hist.max())
        fc_month = float(fc["forecast"].mean())
        fc_total = float(fc["forecast"].sum())

        ref_month = max(0.1, (fc_month + recent_month) / 2)
        ref_daily = ref_month / 30.0

        # Stock actual: 1) override cliente, 2) columna archivo, 3) estimado (pico histórico)
        if str(pid) in override_keys:
            cur_stock = float(override_keys[str(pid)]); stock_source = "provisto"
        elif pid in stock_in_file:
            cur_stock = float(stock_in_file[pid]); stock_source = "archivo"
        else:
            # asume que el negocio aprovisionó para cubrir un mes fuerte
            cur_stock = round(max(peak_month, recent_month))
            stock_source = "estimado"

        coverage_days = round(cur_stock / ref_daily, 1) if ref_daily > 0 else 999.0
        coverage_days = min(coverage_days, 999.0)
        target_stock = int(round(ref_daily * target_days))
        overstock_units = max(0, int(round(cur_stock - target_stock)))
        understock_units = max(0, int(round(target_stock - cur_stock)))
        up = meta.get(pid, {}).get("unit_price")
        unit_price = None if up is None or (isinstance(up, float) and np.isnan(up)) else round(float(up), 2)
        excess_value = round(overstock_units * unit_price, 2) if unit_price else None

        if coverage_days >= overstock_days:
            status = "sobre_stock"
            urgency = "alta" if coverage_days >= overstock_days * 1.8 else "media"
        elif coverage_days <= understock_days:
            status = "bajo_stock"
            urgency = "alta" if coverage_days <= understock_days / 2 else "media"
        else:
            status, urgency = "saludable", "baja"

        depletion = (today + pd.Timedelta(days=int(coverage_days))).date().isoformat()
        if fc_month > recent_month * 1.12:
            trend = "creciente"
        elif fc_month < recent_month * 0.88:
            trend = "decreciente"
        else:
            trend = "estable"

        if status == "sobre_stock":
            reasoning = (f"Tienes stock para ~{int(coverage_days)} días pero la demanda proyectada "
                         f"es de {ref_month:.0f} u/mes ({trend}). Exceso estimado: {overstock_units} u"
                         + (f" (≈ S/ {excess_value:.0f} inmovilizados)." if excess_value else "."))
        elif status == "bajo_stock":
            reasoning = (f"Solo ~{int(coverage_days)} días de cobertura frente a {ref_month:.0f} u/mes "
                         f"proyectadas. Reabastecer {understock_units} u para llegar a {target_days:.0f} días.")
        else:
            reasoning = (f"Cobertura de ~{int(coverage_days)} días, alineada con la demanda "
                         f"proyectada ({ref_month:.0f} u/mes, {trend}).")

        results.append({
            "product_id": pid,
            "product_name": meta.get(pid, {}).get("product_name", pid),
            "category": meta.get(pid, {}).get("category", "General"),
            "unit_price": unit_price,
            "current_stock": int(cur_stock),
            "stock_source": stock_source,
            "avg_monthly_demand": round(ref_month, 1),
            "avg_daily_demand": round(ref_daily, 2),
            "forecast_demand_horizon": round(fc_total, 1),
            "horizon_months": horizon_months,
            "days_of_coverage": coverage_days,
            "target_stock": target_stock,
            "overstock_units": overstock_units,
            "understock_units": understock_units,
            "excess_value": excess_value,
            "depletion_date": depletion,
            "status": status,
            "urgency": urgency,
            "trend": trend,
            "reasoning": reasoning,
            "forecast_series": [
                {"month": r["m"].date().isoformat(), "forecast": round(float(r["forecast"]), 1)}
                for _, r in fc.iterrows()
            ],
            "history_series": [
                {"month": r["m"].date().isoformat(), "quantity": int(r["quantity"])}
                for _, r in hist.iterrows()
            ],
        })

    order = {"sobre_stock": 0, "bajo_stock": 1, "saludable": 2}
    results.sort(key=lambda x: (order[x["status"]], -x["days_of_coverage"]))
    return results


def run_full_analysis(df: pd.DataFrame, params: dict | None = None):
    params = params or {}
    t0 = time.perf_counter()
    series, meta, stock_in_file = prepare_monthly(df)
    full, prod_codes = build_training_frame(series)
    t_etl = time.perf_counter() - t0

    t1 = time.perf_counter()
    model, metrics, importance = train_and_evaluate(full, params.get("model_params"))
    t_train = time.perf_counter() - t1

    t2 = time.perf_counter()
    horizon = int(params.get("horizon_months", 3))
    forecasts = recursive_forecast(model, series, prod_codes, horizon)
    products = analyze_overstock(series, meta, forecasts, stock_in_file, params)
    t_forecast = time.perf_counter() - t2
    total = time.perf_counter() - t0

    n_over = sum(1 for p in products if p["status"] == "sobre_stock")
    n_under = sum(1 for p in products if p["status"] == "bajo_stock")
    total_excess = round(sum(p["excess_value"] or 0 for p in products), 2)
    summary = {
        "total_products": len(products),
        "overstock_count": n_over,
        "understock_count": n_under,
        "healthy_count": len(products) - n_over - n_under,
        "total_excess_value": total_excess,
        "horizon_months": horizon,
        "history_from": series["m"].min().date().isoformat(),
        "history_to": series["m"].max().date().isoformat(),
    }

    records_in = int(len(df))
    timings = {
        "etl_ms": round(t_etl * 1000, 1),
        "train_ms": round(t_train * 1000, 1),
        "forecast_ms": round(t_forecast * 1000, 1),
        "total_ml_ms": round(total * 1000, 1),
        "records_in": records_in,
        "monthly_samples": int(len(full)),
        "throughput_rps": round(records_in / total, 1) if total > 0 else None,
    }

    return {
        "summary": summary,
        "metrics": metrics,
        "feature_importance": {k: round(v, 4) for k, v in importance.items()},
        "products": products,
        "timings": timings,
    }


if __name__ == "__main__":
    import json, sys, os
    _default = os.path.join(os.path.dirname(__file__), "..", "sample", "dataset_farma_con_stock.xlsx")
    p = sys.argv[1] if len(sys.argv) > 1 else _default
    df = pd.read_excel(p) if p.endswith((".xlsx", ".xls")) else pd.read_csv(p)
    res = run_full_analysis(df, {"horizon_months": 3})
    print("SUMMARY:", json.dumps(res["summary"], indent=2, ensure_ascii=False))
    print("METRICS:", json.dumps(res["metrics"], indent=2, ensure_ascii=False))
    print("\nPRODUCTS:")
    for x in res["products"]:
        print(f"  [{x['status']:11}] {x['product_name'][:26]:26} stock={x['current_stock']:4} "
              f"({x['stock_source']:8}) cob={x['days_of_coverage']:6}d  exceso={x['overstock_units']:4}u  "
              f"falta={x['understock_units']:4}u  {x['trend']}")
