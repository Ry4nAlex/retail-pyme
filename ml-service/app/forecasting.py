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

ABLATION_CONFIGS = {
    "sin_variables_temporales": [
        "prod_code",
    ],

    "lag_1": [
        "prod_code",
        "lag_1",
    ],

    "lag_1_2_3": [
        "prod_code",
        "lag_1",
        "lag_2",
        "lag_3",
    ],

    "rolling_mean": [
        "prod_code",
        "lag_1",
        "lag_2",
        "lag_3",
        "rm_3",
        "rm_6",
    ],

    "modelo_completo": FEATURES,
}

DEFAULT_PARAMS = dict(
    n_estimators=300, max_depth=3, learning_rate=0.03, min_child_weight=3,
    subsample=0.8, colsample_bytree=0.9, reg_alpha=0.0, reg_lambda=3.0,
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
def run_ablation_experiment(
    full: pd.DataFrame,
    params: dict | None = None,
):
    """
    Experimento de ablación de características.

    Todos los modelos utilizan:
    - el mismo split cronológico 80/20;
    - los mismos meses de entrenamiento y prueba;
    - los mismos hiperparámetros;
    - la misma variable objetivo.

    Solo cambia el conjunto de características.
    """

    full = (
        full
        .sort_values(["m", "prod_code"])
        .reset_index(drop=True)
    )

    train, test, train_months, test_months = (
        _split_80_20_by_month(
            full,
            train_ratio=0.80
        )
    )

    cfg = dict(DEFAULT_PARAMS)

    if params:
        cfg.update({
            k: v
            for k, v in params.items()
            if k in cfg
        })

    results = []

    for config_name, features in ABLATION_CONFIGS.items():

        model = XGBRegressor(**cfg)

        model.fit(
            train[features],
            train["quantity"]
        )

        pred = np.clip(
            model.predict(test[features]),
            0,
            None
        )

        metrics = _regression_metrics(
            test["quantity"].values,
            pred
        )

        results.append({
            "configuration": config_name,
            "features": list(features),
            "n_features": len(features),
            "wape": metrics["wape"],
            "rmse": metrics["rmse"],
            "mae": metrics["mae"],
            "r2": metrics["r2"],
        })

    for i, result in enumerate(results):

        if i == 0:
            result["wape_improvement_vs_previous_pct"] = None
            result["rmse_improvement_vs_previous_pct"] = None
            continue

        previous = results[i - 1]

        prev_wape = previous["wape"]
        curr_wape = result["wape"]

        prev_rmse = previous["rmse"]
        curr_rmse = result["rmse"]

        result["wape_improvement_vs_previous_pct"] = (
            round(
                (prev_wape - curr_wape)
                / prev_wape
                * 100,
                2
            )
            if prev_wape not in (None, 0)
            and curr_wape is not None
            else None
        )

        result["rmse_improvement_vs_previous_pct"] = (
            round(
                (prev_rmse - curr_rmse)
                / prev_rmse
                * 100,
                2
            )
            if prev_rmse not in (None, 0)
            and curr_rmse is not None
            else None
        )

    return {
        "split_strategy":
            "chronological_80_20_complete_months",

        "train_period": _period(train),
        "test_period": _period(test),

        "n_train": int(len(train)),
        "n_test": int(len(test)),

        "n_train_months": len(train_months),
        "n_test_months": len(test_months),

        "results": results,
    }

def _metric_gap(train_value, test_value):
    if train_value is None or test_value is None:
        return None
    return round(abs(float(test_value) - float(train_value)), 2)


def _ratio_pct(part, total):
    return round(float(part) / float(total) * 100, 1) if total else 0.0


# def _split_70_20_10(n: int, train=0.70, val=0.20):
#     """Cuentas exactas para un split cronológico 70/20/10 (por filas)."""
#     n_train = int(round(n * train))
#     n_val = int(round(n * val))
#     # garantiza al menos 1 registro en val y test
#     n_train = min(n_train, n - 2) if n >= 3 else max(1, n - 1)
#     n_val = min(n_val, n - n_train - 1) if n - n_train - 1 >= 1 else max(0, n - n_train)
#     n_test = n - n_train - n_val
#     return n_train, n_val, n_test

def _split_80_20_by_month(full: pd.DataFrame, train_ratio: float = 0.80):
    """
    Realiza un split cronológico aproximado 80/20 utilizando meses completos.

    Los meses más antiguos se destinan al entrenamiento y los meses más
    recientes a la prueba. Ningún mes puede aparecer en ambos conjuntos.
    """
    months = sorted(pd.to_datetime(full["m"]).dropna().unique())

    if len(months) < 2:
        raise ValueError(
            "Se requieren al menos 2 meses utilizables para realizar el split 80/20."
        )

    # Se aproxima al 80 %, pero sin dividir meses
    n_train_months = int(round(len(months) * train_ratio))
    n_train_months = max(1, min(n_train_months, len(months) - 1))

    train_months = months[:n_train_months]
    test_months = months[n_train_months:]

    cutoff = pd.Timestamp(train_months[-1])

    train = full[full["m"] <= cutoff].copy()
    test = full[full["m"] > cutoff].copy()

    if train.empty or test.empty:
        raise ValueError("El split 80/20 produjo un conjunto vacío.")

    # Verificación: ningún mes puede estar en ambos conjuntos
    overlap = set(pd.to_datetime(train["m"]).unique()).intersection(
        set(pd.to_datetime(test["m"]).unique())
    )

    if overlap:
        raise RuntimeError(
            f"Hay meses compartidos entre train y test: {sorted(overlap)}"
        )

    # Verificación adicional del orden temporal
    if pd.Timestamp(train["m"].max()) >= pd.Timestamp(test["m"].min()):
        raise RuntimeError(
            "El orden temporal train -> test no se preservó."
        )

    return train, test, train_months, test_months

def _walk_forward_evaluation(
    data: pd.DataFrame,
    params: dict | None = None,
    min_train_months: int = 24
):
    """
    Evaluación walk-forward con ventana expansiva.

    Empieza entrenando con min_train_months y después evalúa
    un mes futuro por fold. En cada fold se incorporan todos
    los meses anteriores al entrenamiento.

    También compara XGBoost contra el baseline Naive t-1.
    """

    data = data.sort_values(
        ["m", "prod_code"]
    ).reset_index(drop=True)

    months = sorted(
        pd.to_datetime(data["m"]).dropna().unique()
    )

    if len(months) <= min_train_months:
        return {
            "strategy": "expanding_window_one_month_ahead",
            "min_train_months": min_train_months,
            "n_folds": 0,
            "folds": [],
            "summary": None,
            "note": (
                "No existen suficientes meses para ejecutar "
                "walk-forward con el mínimo configurado."
            ),
        }

    cfg = dict(DEFAULT_PARAMS)

    if params:
        cfg.update({
            k: v
            for k, v in params.items()
            if k in cfg
        })

    folds = []

    for i in range(min_train_months, len(months)):

        train_end = pd.Timestamp(months[i - 1])
        test_month = pd.Timestamp(months[i])

        fold_train = data[
            data["m"] <= train_end
        ].copy()

        fold_test = data[
            data["m"] == test_month
        ].copy()

        if fold_train.empty or fold_test.empty:
            continue

        model = XGBRegressor(**cfg)

        model.fit(
            fold_train[FEATURES],
            fold_train["quantity"]
        )

        # XGBoost
        xgb_pred = np.clip(
            model.predict(fold_test[FEATURES]),
            0,
            None
        )

        xgb_metrics = _regression_metrics(
            fold_test["quantity"].values,
            xgb_pred
        )

        # Baseline Naive t-1
        naive_pred = np.clip(
            fold_test["lag_1"].to_numpy(dtype=float),
            0,
            None
        )

        naive_metrics = _regression_metrics(
            fold_test["quantity"].values,
            naive_pred
        )

        folds.append({
            "fold": len(folds) + 1,

            "train_from": pd.Timestamp(
                fold_train["m"].min()
            ).date().isoformat(),

            "train_to": train_end.date().isoformat(),

            "test_month": test_month.date().isoformat(),

            "n_train": int(len(fold_train)),
            "n_test": int(len(fold_test)),

            "xgboost": xgb_metrics,
            "naive": naive_metrics,
        })

    def _summary(model_key):

        result = {}

        for metric in ("r2", "mae", "rmse", "wape"):

            values = [
                f[model_key][metric]
                for f in folds
                if f[model_key].get(metric) is not None
            ]

            if not values:
                result[metric] = {
                    "mean": None,
                    "std": None
                }
                continue

            result[metric] = {
                "mean": round(
                    float(np.mean(values)),
                    4
                ),
                "std": round(
                    float(
                        np.std(
                            values,
                            ddof=1
                        )
                    ) if len(values) > 1 else 0.0,
                    4
                ),
            }

        return result

    return {
        "strategy": "expanding_window_one_month_ahead",
        "min_train_months": min_train_months,
        "n_folds": len(folds),

        "folds": folds,

        "summary": {
            "xgboost": _summary("xgboost"),
            "naive": _summary("naive"),
        },
    }

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

def _eval_series_by_product(part: pd.DataFrame, pred):
    """
    Demanda real vs predicha por producto y mes
    utilizando exclusivamente el conjunto de prueba.
    """
    if part is None or len(part) == 0:
        return []

    tmp = part[
        [
            "product_id",
            "product_name",
            "category",
            "m",
            "quantity"
        ]
    ].copy()

    tmp["pred"] = np.clip(pred, 0, None)

    products = []

    for pid, g in tmp.groupby("product_id"):
        g = g.sort_values("m")

        products.append({
            "product_id": str(pid),
            "product_name": str(
                g["product_name"].iloc[0]
            ),
            "category": str(
                g["category"].iloc[0]
            ),

            "series": [
                {
                    "month": pd.Timestamp(
                        row["m"]
                    ).date().isoformat(),

                    "real": round(
                        float(row["quantity"]),
                        2
                    ),

                    "pred": round(
                        float(row["pred"]),
                        2
                    ),
                }
                for _, row in g.iterrows()
            ],
        })

    return products


def _error_by_category(part: pd.DataFrame, pred):
    """
    Calcula métricas de error de XGBoost por categoría
    sobre el conjunto de prueba.
    """
    if part is None or len(part) == 0:
        return []

    tmp = part[
        [
            "category",
            "quantity"
        ]
    ].copy()

    tmp["pred"] = np.clip(
        pred,
        0,
        None
    )

    results = []

    for category, g in tmp.groupby("category"):

        category_metrics = _regression_metrics(
            g["quantity"].values,
            g["pred"].values
        )

        results.append({
            "category": str(category),

            "n": int(len(g)),

            "mae": category_metrics["mae"],

            "rmse": category_metrics["rmse"],

            "wape": category_metrics["wape"],

            "mape": category_metrics["mape"],
        })

    # Ordenar desde menor hasta mayor WAPE
    results.sort(
        key=lambda x: (
            x["wape"] is None,
            x["wape"]
            if x["wape"] is not None
            else 999999
        )
    )

    return results

def train_and_evaluate(full: pd.DataFrame, params: dict | None = None, run_walk_forward: bool = False):
    """
    Entrena XGBoost global con split cronológico aproximado 80/20
    utilizando meses completos.

    Los meses más antiguos se utilizan para entrenamiento y los
    meses más recientes para prueba. Ningún mes puede aparecer
    simultáneamente en ambos conjuntos.
    """
    full = full.sort_values(["m", "prod_code"]).reset_index(drop=True)

    train, test, train_months, test_months = _split_80_20_by_month(
        full,
        train_ratio=0.80
        
    )

    walk_forward = None

    if run_walk_forward:
        walk_forward = _walk_forward_evaluation(
            train,
            params=params,
            min_train_months=24
        )

    
    n = int(len(full))
    n_train = int(len(train))
    n_test = int(len(test))

    cfg = dict(DEFAULT_PARAMS)

    if params:
        cfg.update({k: v for k, v in params.items() if k in cfg})

    model = XGBRegressor(**cfg)

    # El modelo aprende exclusivamente con los meses de entrenamiento
    model.fit(
        train[FEATURES],
        train["quantity"]
    )

    def _pred(part):
        if len(part) == 0:
            return np.array([])

        return np.clip(
            model.predict(part[FEATURES]),
            0,
            None
        )

    train_pred = _pred(train)
    test_pred = _pred(test)

    # Baseline Naive t-1

    naive_pred = np.clip(
        test["lag_1"].to_numpy(dtype=float),
        0,
        None
    )


    train_metrics = (
        _regression_metrics(
            train["quantity"].values,
            train_pred
        )
        if len(train)
        else None
    )

    test_metrics = (
        _regression_metrics(
            test["quantity"].values,
            test_pred
        )
        if len(test)
        else None
    )

    naive_metrics=(
        _regression_metrics(
            test["quantity"].values,
            naive_pred
        )
        if len(test)
        else None
    )

    comparison = {}
    if test_metrics and naive_metrics:
        comparison = {
        "r2_gain": round(
            float(test_metrics["r2"]) - float(naive_metrics["r2"]),
            4
        ) if (
            test_metrics.get("r2") is not None
            and naive_metrics.get("r2") is not None
        ) else None,

        "mae_reduction_pct": round(
            (
                (naive_metrics["mae"] - test_metrics["mae"])
                / naive_metrics["mae"]
            ) * 100,
            2
        ) if naive_metrics.get("mae", 0) > 0 else None,

        "rmse_reduction_pct": round(
            (
                (naive_metrics["rmse"] - test_metrics["rmse"])
                / naive_metrics["rmse"]
            ) * 100,
            2
        ) if naive_metrics.get("rmse", 0) > 0 else None,

        "wape_reduction_pct": round(
            (
                (naive_metrics["wape"] - test_metrics["wape"])
                / naive_metrics["wape"]
            ) * 100,
            2
        ) if naive_metrics.get("wape", 0) > 0 else None,
    }

    importance = dict(
        sorted(
            zip(
                FEATURES,
                model.feature_importances_.astype(float)
            ),
            key=lambda x: x[1],
            reverse=True
        )
    )

    # Las métricas principales corresponden únicamente al TEST
    headline = test_metrics or {}

    metrics = {
        **headline,

        "n_train": n_train,
        "n_test": n_test,
        "n_total": n,

        "train_pct": _ratio_pct(n_train, n),
        "test_pct": _ratio_pct(n_test, n),

        "n_train_months": len(train_months),
        "n_test_months": len(test_months),
        "n_total_months": len(train_months) + len(test_months),

        "target_split": "80/20",

        "split_strategy": "chronological_80_20_complete_months",

        "split_note": (
            "Split cronologico aproximado 80/20 por meses completos. "
            "Los meses mas antiguos se usan para entrenamiento y los "
            "mas recientes para prueba; ningun mes aparece en ambos conjuntos."
        ),

        "split_cutoff": pd.Timestamp(
            train_months[-1]
        ).date().isoformat(),

        "granularity": "monthly",

        "evaluated_on": ["test"],

        # Resultado realmente evaluado
        "test": test_metrics,

        "walk_forward": walk_forward,

        "baselines": {
            "naive_t_minus_1": naive_metrics,
        },

        "comparison_vs_naive": comparison,

        # Solo referencia interna
        "train_reference": train_metrics,

        "periods": {
            "train": _period(train),
            "test": _period(test),
        },

        "eval_series": {
            "test": _eval_series(
                test,
                test_pred
            ),
            "naive": _eval_series(
                test,
                naive_pred
            ),
        },
        "eval_series_by_product": _eval_series_by_product(
            test,
            test_pred
        ),

        "error_by_category": _error_by_category(
            test,
            test_pred
        ),
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

        if status == "bajo_stock":
         reasoning = (
        f"El stock actual alcanzaría para ~{int(coverage_days)} días "
        f"considerando una demanda proyectada de {ref_month:.0f} u/mes "
        f"({trend}). Se recomienda reabastecer aproximadamente "
        f"{understock_units} u para alcanzar la cobertura objetivo." )
            
        elif status == "sobre_stock":
          reasoning = (
        f"El stock actual alcanzaría para ~{int(coverage_days)} días "
        f"considerando una demanda proyectada de {ref_month:.0f} u/mes "
        f"({trend}). Se estima un exceso aproximado de "
        f"{overstock_units} u respecto al nivel objetivo.")

        else:
         reasoning = (
        f"El stock actual alcanzaría para ~{int(coverage_days)} días, "
        f"un nivel adecuado considerando una demanda proyectada de "
        f"{ref_month:.0f} u/mes ({trend})."
    )

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

def inventory_backtest(
    full: pd.DataFrame,
    model,
    meta: dict,
    params: dict | None = None,
):
    """
    Backtesting de inventario sobre el conjunto TEST.

    Compara:
    1. Baseline histórico:
       media de los últimos 3 meses.

    2. Propuesta:
       promedio entre XGBoost y media de los últimos 3 meses.

    Ambas políticas usan la misma cobertura objetivo
    y parten del mismo inventario inicial.
    """

    params = params or {}

    target_days = float(
        params.get("target_coverage_days", 45)
    )

    overstock_days = float(
        params.get("overstock_threshold_days", 75)
    )

    # Mismo TEST cronológico usado para evaluar el modelo
    _, test, _, test_months = _split_80_20_by_month(
        full,
        train_ratio=0.80
    )

    test = (
        test
        .sort_values(["m", "product_id"])
        .reset_index(drop=True)
        .copy()
    )

    if test.empty:
        return {
            "baseline": None,
            "xgboost_policy": None,
            "comparison": None,
            "details": [],
        }

    # Predicción XGBoost para TEST
    test["xgb_pred"] = np.clip(
        model.predict(test[FEATURES]),
        0,
        None
    )

    # rm_3 ya utiliza shift(1), por lo que solo usa pasado
    test["historical_mean_3m"] = np.clip(
        test["rm_3"].to_numpy(dtype=float),
        0,
        None
    )

    # Política propuesta
    test["xgb_policy_demand"] = np.maximum(
        0.1,
        (
            test["xgb_pred"]
            + test["historical_mean_3m"]
        ) / 2.0
    )

    # Baseline
    test["baseline_demand"] = np.maximum(
        0.1,
        test["historical_mean_3m"]
    )

    def _simulate(demand_column: str, strategy_name: str):

        rows = []

        for pid, g in test.groupby("product_id"):

            g = g.sort_values("m").copy()

            # Ambas estrategias comienzan con
            # exactamente el mismo inventario
            initial_reference = max(
                0.1,
                float(g.iloc[0]["historical_mean_3m"])
            )

            stock = (
                initial_reference
                / 30.0
                * target_days
            )

            product_meta = meta.get(pid, {})

            unit_price = product_meta.get("unit_price")

            if (
                unit_price is None
                or (
                    isinstance(unit_price, float)
                    and np.isnan(unit_price)
                )
            ):
                unit_price = None
            else:
                unit_price = float(unit_price)

            for _, row in g.iterrows():

                month = pd.Timestamp(row["m"])

                expected_demand = max(
                    0.1,
                    float(row[demand_column])
                )

                actual_demand = max(
                    0.0,
                    float(row["quantity"])
                )

                # Stock objetivo
                target_stock = (
                    expected_demand
                    / 30.0
                    * target_days
                )

                # Reposición al inicio del mes
                reorder_units = max(
                    0.0,
                    target_stock - stock
                )

                available_stock = (
                    stock + reorder_units
                )

                # La demanda real solo se usa
                # para evaluar el resultado
                actual_daily = max(
                    0.1,
                    actual_demand / 30.0
                )

                ideal_stock_actual = (
                    actual_daily
                    * target_days
                )

                overstock_limit_actual = (
                    actual_daily
                    * overstock_days
                )

                excess_units = max(
                    0.0,
                    available_stock
                    - ideal_stock_actual
                )

                overstock_units = max(
                    0.0,
                    available_stock
                    - overstock_limit_actual
                )

                fulfilled_units = min(
                    available_stock,
                    actual_demand
                )

                stockout_units = max(
                    0.0,
                    actual_demand
                    - available_stock
                )

                ending_stock = max(
                    0.0,
                    available_stock
                    - actual_demand
                )

                excess_value_proxy = (
                    excess_units * unit_price
                    if unit_price is not None
                    else None
                )

                rows.append({
                    "strategy": strategy_name,

                    "product_id": str(pid),

                    "product_name": str(
                        product_meta.get(
                            "product_name",
                            pid
                        )
                    ),

                    "category": str(
                        product_meta.get(
                            "category",
                            "General"
                        )
                    ),

                    "month":
                        month.date().isoformat(),

                    "expected_demand":
                        round(expected_demand, 2),

                    "actual_demand":
                        round(actual_demand, 2),

                    "starting_stock":
                        round(stock, 2),

                    "target_stock":
                        round(target_stock, 2),

                    "reorder_units":
                        round(reorder_units, 2),

                    "available_stock":
                        round(available_stock, 2),

                    "fulfilled_units":
                        round(fulfilled_units, 2),

                    "stockout_units":
                        round(stockout_units, 2),

                    "excess_units":
                        round(excess_units, 2),

                    "overstock_units_75d":
                        round(overstock_units, 2),

                    "ending_stock":
                        round(ending_stock, 2),

                    "excess_value_proxy":
                        (
                            round(
                                excess_value_proxy,
                                2
                            )
                            if excess_value_proxy is not None
                            else None
                        ),
                })

                stock = ending_stock

        detail = pd.DataFrame(rows)

        total_demand = float(
            detail["actual_demand"].sum()
        )

        fulfilled = float(
            detail["fulfilled_units"].sum()
        )

        stockout_units = float(
            detail["stockout_units"].sum()
        )

        stockout_events = int(
            (
                detail["stockout_units"] > 0
            ).sum()
        )

        excess_units = float(
            detail["excess_units"].sum()
        )

        overstock_units = float(
            detail["overstock_units_75d"].sum()
        )

        overstock_events = int(
            (
                detail["overstock_units_75d"] > 0
            ).sum()
        )

        total_reorder = float(
            detail["reorder_units"].sum()
        )

        service_level = (
            fulfilled
            / total_demand
            * 100
            if total_demand > 0
            else None
        )

        monthly_inventory = (
            detail
            .groupby("month")["ending_stock"]
            .sum()
        )

        avg_month_end_inventory = float(
            monthly_inventory.mean()
        )

        valid_values = detail[
            "excess_value_proxy"
        ].dropna()

        excess_value_proxy = (
            float(valid_values.sum())
            if len(valid_values)
            else None
        )

        monthly = (
            detail
            .groupby("month")
            .agg(
                demand=("actual_demand", "sum"),
                fulfilled=("fulfilled_units", "sum"),
                stockout_units=(
                    "stockout_units",
                    "sum"
                ),
                excess_units=(
                    "excess_units",
                    "sum"
                ),
                overstock_units_75d=(
                    "overstock_units_75d",
                    "sum"
                ),
                reorder_units=(
                    "reorder_units",
                    "sum"
                ),
                ending_inventory=(
                    "ending_stock",
                    "sum"
                ),
            )
            .reset_index()
        )

        monthly_results = []

        for _, r in monthly.iterrows():

            month_service = (
                float(r["fulfilled"])
                / float(r["demand"])
                * 100
                if float(r["demand"]) > 0
                else None
            )

            monthly_results.append({
                "month": r["month"],

                "demand":
                    round(float(r["demand"]), 2),

                "stockout_units":
                    round(
                        float(r["stockout_units"]),
                        2
                    ),

                "excess_units":
                    round(
                        float(r["excess_units"]),
                        2
                    ),

                "overstock_units_75d":
                    round(
                        float(
                            r["overstock_units_75d"]
                        ),
                        2
                    ),

                "reorder_units":
                    round(
                        float(r["reorder_units"]),
                        2
                    ),

                "ending_inventory":
                    round(
                        float(r["ending_inventory"]),
                        2
                    ),

                "service_level_pct":
                    (
                        round(month_service, 2)
                        if month_service is not None
                        else None
                    ),
            })

        summary = {
            "strategy": strategy_name,

            "total_demand":
                round(total_demand, 2),

            "fulfilled_units":
                round(fulfilled, 2),

            "stockout_units":
                round(stockout_units, 2),

            "stockout_events":
                stockout_events,

            "service_level_pct":
                (
                    round(service_level, 2)
                    if service_level is not None
                    else None
                ),

            "excess_units":
                round(excess_units, 2),

            "overstock_units_75d":
                round(overstock_units, 2),

            "overstock_events_75d":
                overstock_events,

            "total_reorder_units":
                round(total_reorder, 2),

            "avg_month_end_inventory_units":
                round(
                    avg_month_end_inventory,
                    2
                ),

            "excess_value_proxy":
                (
                    round(
                        excess_value_proxy,
                        2
                    )
                    if excess_value_proxy is not None
                    else None
                ),
        }

        return summary, monthly_results, rows

    # Baseline
    baseline_summary, baseline_monthly, baseline_details = (
        _simulate(
            "baseline_demand",
            "historical_mean_3m"
        )
    )

    # Propuesta
    xgb_summary, xgb_monthly, xgb_details = (
        _simulate(
            "xgb_policy_demand",
            "xgboost_plus_policy"
        )
    )

    def _reduction_pct(
        baseline_value,
        proposed_value
    ):

        if (
            baseline_value is None
            or proposed_value is None
            or baseline_value == 0
        ):
            return None

        return round(
            (
                baseline_value
                - proposed_value
            )
            / baseline_value
            * 100,
            2
        )

    comparison = {
        "stockout_units_reduction_pct":
            _reduction_pct(
                baseline_summary["stockout_units"],
                xgb_summary["stockout_units"],
            ),

        "stockout_events_reduction_pct":
            _reduction_pct(
                baseline_summary["stockout_events"],
                xgb_summary["stockout_events"],
            ),

        "excess_units_reduction_pct":
            _reduction_pct(
                baseline_summary["excess_units"],
                xgb_summary["excess_units"],
            ),

        "overstock_units_75d_reduction_pct":
            _reduction_pct(
                baseline_summary[
                    "overstock_units_75d"
                ],
                xgb_summary[
                    "overstock_units_75d"
                ],
            ),

        "avg_inventory_reduction_pct":
            _reduction_pct(
                baseline_summary[
                    "avg_month_end_inventory_units"
                ],
                xgb_summary[
                    "avg_month_end_inventory_units"
                ],
            ),

        "excess_value_proxy_reduction_pct":
            _reduction_pct(
                baseline_summary[
                    "excess_value_proxy"
                ],
                xgb_summary[
                    "excess_value_proxy"
                ],
            ),

        "service_level_gain_pp":
            (
                round(
                    xgb_summary[
                        "service_level_pct"
                    ]
                    - baseline_summary[
                        "service_level_pct"
                    ],
                    2
                )
                if (
                    xgb_summary[
                        "service_level_pct"
                    ] is not None
                    and baseline_summary[
                        "service_level_pct"
                    ] is not None
                )
                else None
            ),
    }

    return {
        "period": {
            "from":
                pd.Timestamp(
                    test["m"].min()
                ).date().isoformat(),

            "to":
                pd.Timestamp(
                    test["m"].max()
                ).date().isoformat(),

            "months":
                len(test_months),

            "observations":
                int(len(test)),
        },

        "policy": {
            "target_coverage_days":
                target_days,

            "overstock_threshold_days":
                overstock_days,

            "baseline":
                "historical_mean_last_3_months",

            "proposed":
                "mean_xgboost_and_last_3_months",

            "initial_stock":
                "same_for_both_strategies_based_on_previous_history",

            "replenishment_assumption":
                "monthly_periodic_review_replenishment_available_at_start_of_month",
        },

        "baseline":
            baseline_summary,

        "xgboost_policy":
            xgb_summary,

        "comparison":
            comparison,

        "monthly": {
            "baseline":
                baseline_monthly,

            "xgboost_policy":
                xgb_monthly,
        },

        "details": {
            "baseline":
                baseline_details,

            "xgboost_policy":
                xgb_details,
        },
    }

def run_full_analysis(df: pd.DataFrame, params: dict | None = None):
    params = params or {}
    t0 = time.perf_counter()
    series, meta, stock_in_file = prepare_monthly(df)
    full, prod_codes = build_training_frame(series)
    full["product_name"] = full["product_id"].map(
    lambda pid: meta.get(pid, {}).get("product_name", pid)
)
    full["category"] = full["product_id"].map(
    lambda pid: meta.get(pid, {}).get("category", "General")
)
    t_etl = time.perf_counter() - t0

    t1 = time.perf_counter()
    model, metrics, importance = train_and_evaluate(
        full, 
        params.get("model_params"),
        run_walk_forward=params.get(
            "run_walk_forward",
            False
        )
    )
    run_ablation = params.get("run_ablation", False)
    ablation_results = (
    run_ablation_experiment(full, params.get("model_params"))
    if run_ablation
    else None
    )
    t_train = time.perf_counter() - t1

    t2 = time.perf_counter()
    horizon = int(params.get("horizon_months", 3))
    forecasts = recursive_forecast(model, series, prod_codes, horizon)
    products = analyze_overstock(series, meta, forecasts, stock_in_file, params)
    inventory_backtesting = inventory_backtest( full, model, meta, params)
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
    "metrics": {
        **metrics,
        "ablation": ablation_results,
    },
    "feature_importance": {k: round(v, 4) for k, v in importance.items()},
    "products": products,
    "inventory_backtest": inventory_backtesting,
    "timings": timings,
}


if __name__ == "__main__":
    import json, sys, os
    _default = os.path.join(os.path.dirname(__file__), "..", "sample", "dataset_farma_con_stock.xlsx")
    p = sys.argv[1] if len(sys.argv) > 1 else _default
    df = pd.read_excel(p) if p.endswith((".xlsx", ".xls")) else pd.read_csv(p)
    res = run_full_analysis(df, {"horizon_months": 3,  "run_walk_forward": False})
    print("SUMMARY:", json.dumps(res["summary"], indent=2, ensure_ascii=False))
    print("METRICS:", json.dumps(res["metrics"], indent=2, ensure_ascii=False))
    print("\nPRODUCTS:")
    for x in res["products"]:
        print(f"  [{x['status']:11}] {x['product_name'][:26]:26} stock={x['current_stock']:4} "
            f"({x['stock_source']:8}) cob={x['days_of_coverage']:6}d  exceso={x['overstock_units']:4}u  "
            f"falta={x['understock_units']:4}u  {x['trend']}")
