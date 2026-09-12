import json
import pandas as pd

from forecasting import run_full_analysis


DATASET = (
    r"C:\Users\ALVARO\Desktop\TESIS 2 PROYECTO"
    r"\retail-pyme-v2 (1)\retail-pyme-v2"
    r"\plantillas\dataset_farmacia_48m.csv"
)


df = pd.read_csv(DATASET)

resultados = []


for target_days in [30, 45, 60]:

    result = run_full_analysis(
        df,
        {
            "horizon_months": 3,
            "target_coverage_days": target_days,
            "overstock_threshold_days": 75,
        }
    )

    b = result["inventory_backtest"]

    resultados.append({
        "target_days": target_days,

        "baseline": {
            "stockout_units":
                b["baseline"]["stockout_units"],

            "stockout_events":
                b["baseline"]["stockout_events"],

            "service_level_pct":
                b["baseline"]["service_level_pct"],

            "excess_units":
                b["baseline"]["excess_units"],

            "avg_inventory":
                b["baseline"][
                    "avg_month_end_inventory_units"
                ],
        },

        "xgboost": {
            "stockout_units":
                b["xgboost_policy"]["stockout_units"],

            "stockout_events":
                b["xgboost_policy"]["stockout_events"],

            "service_level_pct":
                b["xgboost_policy"]["service_level_pct"],

            "excess_units":
                b["xgboost_policy"]["excess_units"],

            "avg_inventory":
                b["xgboost_policy"][
                    "avg_month_end_inventory_units"
                ],
        },

        "comparison":
            b["comparison"],
    })


print(
    json.dumps(
        resultados,
        indent=2,
        ensure_ascii=False
    )
)