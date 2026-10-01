from __future__ import annotations

import itertools
import random

import numpy as np
import pandas as pd
from xgboost import XGBRegressor

from app.forecasting import (
    FEATURES,
    ABLATION_CONFIGS,
    DEFAULT_PARAMS,
    _eval_series,
    _regression_metrics,
    _resolve_columns,
    build_training_frame,
    prepare_monthly,
)


def _period(part: pd.DataFrame):
    if part is None or part.empty:
        return {"from": None, "to": None}

    return {
        "from": pd.Timestamp(part["m"].min()).date().isoformat(),
        "to": pd.Timestamp(part["m"].max()).date().isoformat(),
    }


# =========================================================
# 1. DESARROLLO vs EXPERIMENTO
# =========================================================

def _split_development_experiment(
    full: pd.DataFrame,
    experiment_months: int = 6,
):
    """
    Separa los últimos N meses como experimento independiente.

    Ejemplo:
    Jul-2022 ... Dic-2025 -> desarrollo
    Ene-2026 ... Jun-2026 -> experimento
    """

    full = (
        full
        .sort_values(["m", "prod_code"])
        .reset_index(drop=True)
    )

    months = sorted(
        pd.to_datetime(full["m"]).dropna().unique()
    )

    if len(months) <= experiment_months:
        raise ValueError(
            "No existen suficientes meses para separar "
            "desarrollo y experimento."
        )

    experiment_target_months = months[-experiment_months:]

    experiment_start = pd.Timestamp(
        experiment_target_months[0]
    )

    development = full[
        full["m"] < experiment_start
    ].copy()

    experiment = full[
        full["m"] >= experiment_start
    ].copy()

    return (
        development,
        experiment,
        experiment_target_months,
    )


# =========================================================
# 2. TRAIN / VALIDACIÓN DENTRO DEL DESARROLLO
# =========================================================

def _development_train_validation_months(
    development: pd.DataFrame,
    train_ratio: float = 0.80,
):
    months = sorted(
        pd.to_datetime(
            development["m"]
        ).dropna().unique()
    )

    if len(months) < 2:
        raise ValueError(
            "Se requieren al menos 2 meses supervisados."
        )

    n_train_months = int(
        round(len(months) * train_ratio)
    )

    n_train_months = max(
        1,
        min(
            n_train_months,
            len(months) - 1
        )
    )

    train_months = months[:n_train_months]
    validation_months = months[n_train_months:]

    return train_months, validation_months


# =========================================================
# 3. WALK-FORWARD SOLO SOBRE VALIDACIÓN
# =========================================================

def _walk_forward_validation(
    development: pd.DataFrame,
    params: dict | None = None,
    train_ratio: float = 0.80,
):
    development = (
        development
        .sort_values(["m", "prod_code"])
        .reset_index(drop=True)
    )

    train_months, validation_months = (
        _development_train_validation_months(
            development,
            train_ratio=train_ratio,
        )
    )

    cfg = dict(DEFAULT_PARAMS)

    if params:
        cfg.update({
            k: v
            for k, v in params.items()
            if k in cfg
        })

    folds = []

    for validation_month in validation_months:

        validation_month = pd.Timestamp(
            validation_month
        )

        fold_train = development[
            development["m"] < validation_month
        ].copy()

        fold_val = development[
            development["m"] == validation_month
        ].copy()

        model = XGBRegressor(**cfg)

        model.fit(
            fold_train[FEATURES],
            fold_train["quantity"]
        )

        pred = np.clip(
            model.predict(
                fold_val[FEATURES]
            ),
            0,
            None,
        )

        metrics = _regression_metrics(
            fold_val["quantity"].values,
            pred,
        )

        folds.append({
            "fold": len(folds) + 1,

            "train_from":
                pd.Timestamp(
                    fold_train["m"].min()
                ).date().isoformat(),

            "train_to":
                pd.Timestamp(
                    fold_train["m"].max()
                ).date().isoformat(),

            "validation_month":
                validation_month.date().isoformat(),

            "n_train":
                int(len(fold_train)),

            "n_validation":
                int(len(fold_val)),

            "metrics":
                metrics,
        })

    def summarize(metric):

        values = [
            float(
                f["metrics"][metric]
            )
            for f in folds
            if f["metrics"].get(metric)
            is not None
        ]

        if not values:
            return {
                "mean": None,
                "std": None,
            }

        return {
            "mean": round(
                float(np.mean(values)),
                4,
            ),

            "std": round(
                float(
                    np.std(
                        values,
                        ddof=1,
                    )
                )
                if len(values) > 1
                else 0.0,
                4,
            ),
        }

    return {
        "strategy":
            "expanding_window_validation",

        "target_split":
            "80/20",

        "n_initial_train_months":
            len(train_months),

        "n_validation_months":
            len(validation_months),

        "n_folds":
            len(folds),

        "train_period_initial": {
            "from":
                pd.Timestamp(
                    train_months[0]
                ).date().isoformat(),

            "to":
                pd.Timestamp(
                    train_months[-1]
                ).date().isoformat(),
        },

        "validation_period": {
            "from":
                pd.Timestamp(
                    validation_months[0]
                ).date().isoformat(),

            "to":
                pd.Timestamp(
                    validation_months[-1]
                ).date().isoformat(),
        },

        "folds":
            folds,

        "summary": {
            "r2":
                summarize("r2"),

            "mae":
                summarize("mae"),

            "rmse":
                summarize("rmse"),

            "wape":
                summarize("wape"),
        },
    }


# =========================================================
# 4. RANDOM SEARCH
# =========================================================

def _random_search_candidates(
    n_trials=30,
    seed=42,
):
    space = {
        "n_estimators":
            [200, 300, 400],

        "max_depth":
            [2, 3, 4],

        "learning_rate":
            [0.02, 0.03, 0.05],

        "min_child_weight":
            [1, 3, 5],

        "subsample":
            [0.8, 1.0],

        "colsample_bytree":
            [0.8, 0.9, 1.0],

        "reg_alpha":
            [0.0, 0.1],

        "reg_lambda":
            [1.0, 3.0, 5.0],
    }

    keys = list(space.keys())

    combinations = [
        dict(zip(keys, values))
        for values in itertools.product(
            *(space[k] for k in keys)
        )
    ]

    current = {
        k: DEFAULT_PARAMS[k]
        for k in keys
    }

    others = [
        c
        for c in combinations
        if c != current
    ]

    rng = random.Random(seed)

    selected = rng.sample(
        others,
        min(
            n_trials - 1,
            len(others)
        ),
    )

    # Siempre incluye la configuración actual
    return [
        current,
        *selected,
    ]


def _random_search_on_development(
    development: pd.DataFrame,
    n_trials=30,
    seed=42,
    train_ratio=0.80,
):
    rows = []

    candidates = _random_search_candidates(
        n_trials=n_trials,
        seed=seed,
    )

    for index, candidate in enumerate(
        candidates,
        start=1,
    ):

        validation = (
            _walk_forward_validation(
                development,
                params=candidate,
                train_ratio=train_ratio,
            )
        )

        summary = validation["summary"]

        rows.append({
            "trial":
                index,

            "label":
                (
                    "CURRENT"
                    if index == 1
                    else f"TRIAL_{index - 1:02d}"
                ),

            "params":
                candidate,

            "r2_mean":
                summary["r2"]["mean"],

            "mae_mean":
                summary["mae"]["mean"],

            "rmse_mean":
                summary["rmse"]["mean"],

            "wape_mean":
                summary["wape"]["mean"],

            "wape_std":
                summary["wape"]["std"],

            "n_folds":
                validation["n_folds"],
        })

    ranked = sorted(
        rows,
        key=lambda r: (
            float(r["wape_mean"]),
            float(r["rmse_mean"]),
        )
    )

    for rank, row in enumerate(
        ranked,
        start=1,
    ):
        row["rank"] = rank

    return {
        "seed":
            seed,

        "n_trials":
            len(rows),

        "selection_metric":
            (
                "Menor WAPE promedio de validación; "
                "RMSE promedio como criterio secundario"
            ),

        "best":
            ranked[0],

        "current":
            next(
                x
                for x in rows
                if x["label"] == "CURRENT"
            ),

        "top5":
            ranked[:5],

        "all_trials":
            rows,
    }


# =========================================================
# 5. COMPARACIÓN XGBOOST vs NAIVE
# =========================================================

def _comparison_vs_naive(
    xgb_metrics,
    naive_metrics,
):

    return {
        "r2_gain":
            round(
                xgb_metrics["r2"]
                - naive_metrics["r2"],
                4,
            ),

        "mae_reduction_pct":
            round(
                (
                    naive_metrics["mae"]
                    - xgb_metrics["mae"]
                )
                / naive_metrics["mae"]
                * 100,
                2,
            ),

        "rmse_reduction_pct":
            round(
                (
                    naive_metrics["rmse"]
                    - xgb_metrics["rmse"]
                )
                / naive_metrics["rmse"]
                * 100,
                2,
            ),

        "wape_reduction_pct":
            round(
                (
                    naive_metrics["wape"]
                    - xgb_metrics["wape"]
                )
                / naive_metrics["wape"]
                * 100,
                2,
            ),
    }


# =========================================================
# 6. ABLACIÓN SOBRE EXPERIMENTO
# =========================================================

def _ablation_on_experiment(
    development,
    experiment,
    params,
):
    cfg = dict(DEFAULT_PARAMS)

    cfg.update({
        k: v
        for k, v in params.items()
        if k in cfg
    })

    results = []

    for name, features in (
        ABLATION_CONFIGS.items()
    ):

        model = XGBRegressor(**cfg)

        model.fit(
            development[features],
            development["quantity"],
        )

        pred = np.clip(
            model.predict(
                experiment[features]
            ),
            0,
            None,
        )

        metrics = _regression_metrics(
            experiment["quantity"].values,
            pred,
        )

        results.append({
            "configuration":
                name,

            "n_features":
                len(features),

            "features":
                list(features),

            "r2":
                metrics["r2"],

            "mae":
                metrics["mae"],

            "rmse":
                metrics["rmse"],

            "wape":
                metrics["wape"],
        })

    return results


def _inventory_experiment_metrics(
    experiment: pd.DataFrame,
    model,
    meta: dict,
    params: dict | None = None,
):
    """
    Evalúa la política de inventario exclusivamente
    sobre los meses reservados para el experimento.

    Los datos reales del periodo experimental se utilizan
    únicamente para evaluar el resultado de la política.
    """

    params = params or {}

    understock_days = float(
        params.get(
            "understock_threshold_days",
            30,
        )
    )

    target_days = float(
        params.get(
            "target_coverage_days",
            45,
        )
    )

    overstock_days = float(
        params.get(
            "overstock_threshold_days",
            75,
        )
    )

    evaluation = (
        experiment
        .sort_values(
            ["m", "product_id"]
        )
        .reset_index(drop=True)
        .copy()
    )

    if evaluation.empty:
        raise ValueError(
            "El conjunto experimental está vacío."
        )

    # -------------------------------------------------
    # Predicción XGBoost del periodo experimental
    # -------------------------------------------------

    evaluation["xgb_pred"] = np.clip(
        model.predict(
            evaluation[FEATURES]
        ),
        0,
        None,
    )

    # rm_3 fue construido utilizando exclusivamente
    # información de meses anteriores.
    evaluation["historical_mean_3m"] = (
        np.maximum(
            0.1,
            evaluation[
                "rm_3"
            ].to_numpy(dtype=float),
        )
    )

    # Política propuesta:
    # promedio entre predicción XGBoost
    # y demanda reciente de tres meses.
    evaluation["xgb_policy_demand"] = (
        np.maximum(
            0.1,
            (
                evaluation["xgb_pred"]
                + evaluation[
                    "historical_mean_3m"
                ]
            )
            / 2.0,
        )
    )

    # Política de referencia de inventario:
    # únicamente promedio histórico de 3 meses.
    evaluation["historical_policy_demand"] = (
        evaluation["historical_mean_3m"]
    )

    # =================================================
    # SIMULACIÓN DE UNA POLÍTICA
    # =================================================

    def _simulate(
        demand_column: str,
        strategy_name: str,
        target_coverage_days: float,
    ):

        rows = []

        for pid, g in evaluation.groupby(
            "product_id"
        ):

            g = (
                g
                .sort_values("m")
                .copy()
            )

            # Inventario inicial idéntico
            # para todas las estrategias.
            initial_reference = max(
                0.1,
                float(
                    g.iloc[0][
                        "historical_mean_3m"
                    ]
                ),
            )

            stock = (
                initial_reference
                / 30.0
                * target_coverage_days
            )

            for _, row in g.iterrows():

                month = pd.Timestamp(
                    row["m"]
                )

                expected_demand = max(
                    0.1,
                    float(
                        row[demand_column]
                    ),
                )

                actual_demand = max(
                    0.0,
                    float(
                        row["quantity"]
                    ),
                )

                # Stock objetivo para el mes
                target_stock = (
                    expected_demand
                    / 30.0
                    * target_coverage_days
                )

                # Reposición realizada
                # al inicio del periodo.
                reorder_units = max(
                    0.0,
                    target_stock - stock,
                )

                available_stock = (
                    stock
                    + reorder_units
                )

                # La demanda REAL se utiliza aquí
                # únicamente para evaluar qué ocurrió.
                actual_daily = max(
                    0.1,
                    actual_demand / 30.0,
                )

                # Cobertura que realmente habría tenido
                # el inventario frente a la demanda real.
                coverage_days = (
                    available_stock
                    / actual_daily
                )

                # Inventario correspondiente
                # a la cobertura objetivo.
                ideal_stock_actual = (
                    actual_daily
                    * target_coverage_days
                )

                # Límite de sobrestock:
                # actualmente 75 días.
                overstock_limit_actual = (
                    actual_daily
                    * overstock_days
                )

                fulfilled_units = min(
                    available_stock,
                    actual_demand,
                )

                stockout_units = max(
                    0.0,
                    actual_demand
                    - available_stock,
                )

                ending_stock = max(
                    0.0,
                    available_stock
                    - actual_demand,
                )

                # Exceso respecto a la
                # cobertura objetivo.
                excess_units = max(
                    0.0,
                    available_stock
                    - ideal_stock_actual,
                )

                # Sobrestock real respecto
                # al umbral de 75 días.
                overstock_units = max(
                    0.0,
                    available_stock
                    - overstock_limit_actual,
                )

                low_stock_coverage = (
                    coverage_days
                    <= understock_days
                )

                overstock_coverage = (
                    coverage_days
                    >= overstock_days
                )

                healthy_coverage = (
                    coverage_days
                    > understock_days
                    and coverage_days
                    < overstock_days
                )

                rows.append({
                    "product_id":
                        str(pid),

                    "month":
                        month.date().isoformat(),

                    "expected_demand":
                        round(
                            expected_demand,
                            2,
                        ),

                    "actual_demand":
                        round(
                            actual_demand,
                            2,
                        ),

                    "starting_stock":
                        round(
                            stock,
                            2,
                        ),

                    "target_stock":
                        round(
                            target_stock,
                            2,
                        ),

                    "reorder_units":
                        round(
                            reorder_units,
                            2,
                        ),

                    "available_stock":
                        round(
                            available_stock,
                            2,
                        ),

                    "fulfilled_units":
                        round(
                            fulfilled_units,
                            2,
                        ),

                    "stockout_units":
                        round(
                            stockout_units,
                            2,
                        ),

                    "ending_stock":
                        round(
                            ending_stock,
                            2,
                        ),

                    "coverage_days":
                        round(
                            coverage_days,
                            2,
                        ),

                    "excess_units":
                        round(
                            excess_units,
                            2,
                        ),

                    "overstock_units_75d":
                        round(
                            overstock_units,
                            2,
                        ),

                    "low_stock_coverage":
                        low_stock_coverage,

                    "healthy_coverage":
                        healthy_coverage,

                    "overstock_coverage":
                        overstock_coverage,
                })

                # El inventario final del mes
                # pasa a ser el inicial del siguiente.
                stock = ending_stock

        detail = pd.DataFrame(rows)

        total_cases = int(
            len(detail)
        )

        total_demand = float(
            detail[
                "actual_demand"
            ].sum()
        )

        fulfilled = float(
            detail[
                "fulfilled_units"
            ].sum()
        )

        stockout_units = float(
            detail[
                "stockout_units"
            ].sum()
        )

        stockout_events = int(
            (
                detail[
                    "stockout_units"
                ] > 0
            ).sum()
        )

        low_stock_events = int(
            detail[
                "low_stock_coverage"
            ].sum()
        )

        healthy_events = int(
            detail[
                "healthy_coverage"
            ].sum()
        )

        overstock_events = int(
            detail[
                "overstock_coverage"
            ].sum()
        )

        overstock_units = float(
            detail[
                "overstock_units_75d"
            ].sum()
        )

        excess_units = float(
            detail[
                "excess_units"
            ].sum()
        )

        total_reorder = float(
            detail[
                "reorder_units"
            ].sum()
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
            .groupby("month")[
                "ending_stock"
            ]
            .sum()
        )

        avg_month_end_inventory = float(
            monthly_inventory.mean()
        )

        avg_coverage_days = float(
            detail[
                "coverage_days"
            ].mean()
        )

        return {
            "strategy":
                strategy_name,

            "target_coverage_days":
                target_coverage_days,

            "evaluation_cases":
                total_cases,

            "total_demand":
                round(
                    total_demand,
                    2,
                ),

            "fulfilled_units":
                round(
                    fulfilled,
                    2,
                ),

            "service_level_pct":
                (
                    round(
                        service_level,
                        3,
                    )
                    if service_level
                    is not None
                    else None
                ),

            "stockout_units":
                round(
                    stockout_units,
                    2,
                ),

            "stockout_events":
                stockout_events,

            "stockout_rate_pct":
                round(
                    stockout_events
                    / total_cases
                    * 100,
                    3,
                ),

            "low_stock_coverage_events":
                low_stock_events,

            "low_stock_coverage_rate_pct":
                round(
                    low_stock_events
                    / total_cases
                    * 100,
                    3,
                ),

            "healthy_coverage_events":
                healthy_events,

            "healthy_coverage_rate_pct":
                round(
                    healthy_events
                    / total_cases
                    * 100,
                    3,
                ),

            "overstock_units_75d":
                round(
                    overstock_units,
                    2,
                ),

            "overstock_events_75d":
                overstock_events,

            "overstock_rate_pct":
                round(
                    overstock_events
                    / total_cases
                    * 100,
                    3,
                ),

            "excess_units":
                round(
                    excess_units,
                    2,
                ),

            "total_reorder_units":
                round(
                    total_reorder,
                    2,
                ),

            "avg_month_end_inventory_units":
                round(
                    avg_month_end_inventory,
                    2,
                ),

            "avg_coverage_days":
                round(
                    avg_coverage_days,
                    2,
                ),
        }

    # =================================================
    # POLÍTICA HISTÓRICA DE REFERENCIA
    # =================================================

    baseline = _simulate(
        "historical_policy_demand",
        "historical_mean_last_3_months",
        target_days,
    )

    # =================================================
    # POLÍTICA PROPUESTA CON XGBOOST
    # =================================================

    proposed = _simulate(
        "xgb_policy_demand",
        "xgboost_plus_recent_mean",
        target_days,
    )

    # =================================================
    # ANÁLISIS DE SENSIBILIDAD
    # 30 / 45 / 60 días
    # =================================================

    sensitivity = []

    for scenario_days in (
        30,
        45,
        60,
    ):

        sensitivity.append(
            _simulate(
                "xgb_policy_demand",
                (
                    "xgboost_target_"
                    f"{scenario_days}d"
                ),
                float(
                    scenario_days
                ),
            )
        )

    def _reduction_pct(
        baseline_value,
        proposed_value,
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
            2,
        )

    comparison = {
        "stockout_units_reduction_pct":
            _reduction_pct(
                baseline[
                    "stockout_units"
                ],
                proposed[
                    "stockout_units"
                ],
            ),

        "stockout_events_reduction_pct":
            _reduction_pct(
                baseline[
                    "stockout_events"
                ],
                proposed[
                    "stockout_events"
                ],
            ),

        "stockout_rate_reduction_pct":
            _reduction_pct(
                baseline[
                    "stockout_rate_pct"
                ],
                proposed[
                    "stockout_rate_pct"
                ],
            ),

        "service_level_gain_pp":
            (
                round(
                    proposed[
                        "service_level_pct"
                    ]
                    - baseline[
                        "service_level_pct"
                    ],
                    3,
                )
                if (
                    proposed[
                        "service_level_pct"
                    ] is not None
                    and baseline[
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
                    evaluation[
                        "m"
                    ].min()
                ).date().isoformat(),

            "to":
                pd.Timestamp(
                    evaluation[
                        "m"
                    ].max()
                ).date().isoformat(),

            "months":
                int(
                    evaluation[
                        "m"
                    ].nunique()
                ),

            "cases":
                int(
                    len(
                        evaluation
                    )
                ),
        },

        "policy": {
            "understock_threshold_days":
                understock_days,

            "target_coverage_days":
                target_days,

            "overstock_threshold_days":
                overstock_days,
        },

        "baseline":
            baseline,

        "xgboost_policy":
            proposed,

        "comparison":
            comparison,

        "sensitivity_30_45_60":
            sensitivity,
    }


# =========================================================
# 7. RESUMEN REAL DEL DATASET
# =========================================================

def _partition_summary(
    raw_df,
    series,
    full,
    experiment_months=6,
):

    cols = _resolve_columns(raw_df)

    date_col = cols["date"]
    product_col = cols["product_id"]

    raw = pd.DataFrame({
        "date":
            pd.to_datetime(
                raw_df[date_col],
                errors="coerce",
            ),

        "product_id":
            raw_df[
                product_col
            ].astype(str),
    })

    raw = raw.dropna(
        subset=["date"]
    )

    raw["m"] = (
        raw["date"]
        .dt.to_period("M")
        .dt.start_time
    )

    months = sorted(
        raw["m"].unique()
    )

    experiment_start = pd.Timestamp(
        months[-experiment_months]
    )

    raw_dev = raw[
        raw["m"]
        < experiment_start
    ]

    raw_exp = raw[
        raw["m"]
        >= experiment_start
    ]

    series_dev = series[
        series["m"]
        < experiment_start
    ]

    series_exp = series[
        series["m"]
        >= experiment_start
    ]

    full_dev = full[
        full["m"]
        < experiment_start
    ]

    full_exp = full[
        full["m"]
        >= experiment_start
    ]

    return {
        "complete_dataset": {
            "period": {
                "from":
                    pd.Timestamp(
                        raw["m"].min()
                    ).date().isoformat(),

                "to":
                    pd.Timestamp(
                        raw["m"].max()
                    ).date().isoformat(),
            },

            "months":
                int(
                    raw["m"].nunique()
                ),

            "transactions":
                int(len(raw)),

            "products":
                int(
                    raw[
                        "product_id"
                    ].nunique()
                ),

            "product_month":
                int(len(series)),

            "supervised_observations":
                int(len(full)),
        },

        "development": {
            "period": {
                "from":
                    pd.Timestamp(
                        raw_dev["m"].min()
                    ).date().isoformat(),

                "to":
                    pd.Timestamp(
                        raw_dev["m"].max()
                    ).date().isoformat(),
            },

            "months":
                int(
                    raw_dev[
                        "m"
                    ].nunique()
                ),

            "transactions":
                int(len(raw_dev)),

            "products":
                int(
                    raw_dev[
                        "product_id"
                    ].nunique()
                ),

            "product_month":
                int(len(series_dev)),

            "supervised_observations":
                int(len(full_dev)),
        },

        "experiment": {
            "period": {
                "from":
                    pd.Timestamp(
                        raw_exp["m"].min()
                    ).date().isoformat(),

                "to":
                    pd.Timestamp(
                        raw_exp["m"].max()
                    ).date().isoformat(),
            },

            "months":
                int(
                    raw_exp[
                        "m"
                    ].nunique()
                ),

            "transactions":
                int(len(raw_exp)),

            "products":
                int(
                    raw_exp[
                        "product_id"
                    ].nunique()
                ),

            "product_month":
                int(len(series_exp)),

            "effective_evaluation_cases":
                int(len(full_exp)),
        },
    }


# =========================================================
# 8. PIPELINE FULL PAPER
# =========================================================

def run_full_paper_experiment(
    df: pd.DataFrame,
    params: dict | None = None,
):

    params = params or {}

    experiment_months = int(
        params.get(
            "experiment_months",
            6,
        )
    )

    validation_train_ratio = float(
        params.get(
            "validation_train_ratio",
            0.80,
        )
    )

    random_search_trials = int(
        params.get(
            "random_search_trials",
            30,
        )
    )

    random_search_seed = int(
        params.get(
            "random_search_seed",
            42,
        )
    )

    # -----------------------------------------
    # Preparación completa
    # -----------------------------------------

    series, meta, stock_in_file = (
        prepare_monthly(df)
    )

    full, prod_codes = (
        build_training_frame(series)
    )

    # -----------------------------------------
    # Desarrollo / experimento
    # -----------------------------------------

    development, experiment, experiment_months_list = (
        _split_development_experiment(
            full,
            experiment_months=
                experiment_months,
        )
    )

    partition = _partition_summary(
        df,
        series,
        full,
        experiment_months=
            experiment_months,
    )

    # -----------------------------------------
    # Random Search SOLO sobre desarrollo
    # -----------------------------------------

    search = (
        _random_search_on_development(
            development,

            n_trials=
                random_search_trials,

            seed=
                random_search_seed,

            train_ratio=
                validation_train_ratio,
        )
    )

    selected_params = (
        search["best"]["params"]
    )

    # -----------------------------------------
    # Validación final del desarrollo
    # -----------------------------------------

    validation = (
        _walk_forward_validation(
            development,

            params=
                selected_params,

            train_ratio=
                validation_train_ratio,
        )
    )

    # -----------------------------------------
    # Modelo definitivo
    # Se entrena con TODO el desarrollo
    # -----------------------------------------

    cfg = dict(DEFAULT_PARAMS)

    cfg.update({
        k: v
        for k, v in selected_params.items()
        if k in cfg
    })

    final_model = XGBRegressor(**cfg)

    final_model.fit(
        development[FEATURES],
        development["quantity"],
    )

    # -----------------------------------------
    # EXPERIMENTO INDEPENDIENTE
    # -----------------------------------------

    experiment_pred = np.clip(
        final_model.predict(
            experiment[FEATURES]
        ),
        0,
        None,
    )

    experiment_metrics = (
        _regression_metrics(
            experiment[
                "quantity"
            ].values,
            experiment_pred,
        )
    )

    # -----------------------------------------
    # Baseline Naive
    # -----------------------------------------

    naive_pred = np.clip(
        experiment[
            "lag_1"
        ].to_numpy(dtype=float),
        0,
        None,
    )

    naive_metrics = (
        _regression_metrics(
            experiment[
                "quantity"
            ].values,
            naive_pred,
        )
    )

    # -----------------------------------------
    # Importancia de variables
    # -----------------------------------------

    importance = dict(
        sorted(
            zip(
                FEATURES,
                final_model
                .feature_importances_
                .astype(float),
            ),

            key=lambda x: x[1],

            reverse=True,
        )
    )

    # -----------------------------------------
    # Ablación
    # -----------------------------------------

    ablation = (
        _ablation_on_experiment(
            development,
            experiment,
            selected_params,
        )
    )

        # -----------------------------------------
    # Métricas de gestión de inventario
    # SOLO sobre los 6 meses experimentales
    # -----------------------------------------

    inventory_experiment = (
        _inventory_experiment_metrics(
            experiment,
            final_model,
            meta,
            params,
        )
    )

    return {
        "design": {
            "development_months":
                partition[
                    "development"
                ]["months"],

            "experiment_months":
                partition[
                    "experiment"
                ]["months"],

            "development_validation_split":
                "80/20",

            "experiment_isolated":
                True,

            "experiment_evaluation_mode":
                (
                    "rolling_one_step_ahead_"
                    "without_model_refit"
                ),
        },

        "partition":
            partition,

        "hyperparameter_search":
            search,

        "selected_params":
            selected_params,

        "validation":
            validation,

        "experiment": {
            "period":
                _period(experiment),

            "n_months":
                len(
                    experiment_months_list
                ),

            "n_cases":
                int(
                    len(experiment)
                ),

            "metrics":
                experiment_metrics,

            "naive":
                naive_metrics,

            "comparison_vs_naive":
                _comparison_vs_naive(
                    experiment_metrics,
                    naive_metrics,
                ),

            "eval_series":
                _eval_series(
                    experiment,
                    experiment_pred,
                ),

            "ablation":
                ablation,

            "inventory_management":
                inventory_experiment,
                
            "feature_importance": {
                k:
                    round(
                        float(v),
                        6,
                    )

                for k, v
                in importance.items()
            },
        },
    }