"""
Script de línea de comandos para entrenar/evaluar el modelo XGBoost
sobre un dataset, sin levantar el servidor. Útil para la tesis (reportar métricas).

Uso:
    python train_baseline.py                         # usa sample/dataset_farma_con_stock.xlsx
    python train_baseline.py ruta/a/mi_dataset.csv   # usa tu propio archivo
    python train_baseline.py mi_dataset.xlsx --horizon 6
"""
import os
import sys
import json
import argparse
from app.forecasting import run_full_analysis
import pandas as pd


def main():
    ap = argparse.ArgumentParser(description="Entrena XGBoost y reporta métricas + análisis de stock")
    ap.add_argument("dataset", nargs="?",
                    default=os.path.join("sample", "dataset_farma_con_stock.xlsx"),
                    help="Ruta al CSV/Excel de ventas históricas")
    ap.add_argument("--horizon", type=int, default=3, help="Meses a pronosticar")
    ap.add_argument("--json", action="store_true", help="Imprimir el resultado completo en JSON")
    args = ap.parse_args()

    path = args.dataset
    if not os.path.exists(path):
        print(f"[ERROR] No existe el archivo: {path}")
        sys.exit(1)

    df = pd.read_excel(path) if path.endswith((".xlsx", ".xls")) else pd.read_csv(path)
    res = run_full_analysis(df, {"horizon_months": args.horizon})

    if args.json:
        print(json.dumps(res, indent=2, ensure_ascii=False))
        return

    m = res["metrics"]
    s = res["summary"]
    print("=" * 70)
    print("  MODELO: XGBoost (regresión, demanda mensual)")
    print("=" * 70)
    print(f"  Granularidad : {m['granularity']}")
    print(f"  R²           : {m['r2']}")
    print(f"  MAE          : {m['mae']}")
    print(f"  RMSE         : {m['rmse']}")
    print(f"  MAPE         : {m['mape']} %")
    print(f"  Train / Test : {m['n_train']} / {m['n_test']} registros")
    print(f"  Split        : {m['target_split']}")
    print(f"  Estrategia   : {m['split_strategy']}")
    print(f"  Meses Train  : {m['n_train_months']}")
    print(f"  Meses Test   : {m['n_test_months']}")
    print(f"  % Train      : {m['train_pct']} %")
    print(f"  % Test       : {m['test_pct']} %")
    print(f"  Periodo Train: " f"{m['periods']['train']['from']} -> "f"{m['periods']['train']['to']}")
    print(f"  Periodo Test : "f"{m['periods']['test']['from']} -> "f"{m['periods']['test']['to']}")
    print("-" * 70)
    print("  Importancia de variables (top 6):")
    for k, v in list(res["feature_importance"].items())[:6]:
        print(f"     {k:14} {v}")
    print("-" * 70)
    print(f"  Productos        : {s['total_products']}")
    print(f"  Sobre-stock      : {s['overstock_count']}")
    print(f"  Bajo-stock       : {s['understock_count']}")
    print(f"  Saludables       : {s['healthy_count']}")
    print(f"  Valor inmovilizado (exceso): S/ {s['total_excess_value']:.2f}")
    print(f"  Historia: {s['history_from']} -> {s['history_to']}")
    print("=" * 70)
    print("  DETALLE POR PRODUCTO")
    print("=" * 70)
    for p in res["products"]:
        print(f"  [{p['status']:11}] {p['product_name'][:28]:28} "
            f"stock={p['current_stock']:>4} ({p['stock_source']:8}) "
            f"cobertura={p['days_of_coverage']:>6}d  "
            f"exceso={p['overstock_units']:>4}u  falta={p['understock_units']:>4}u  "
            f"tend={p['trend']}")


if __name__ == "__main__":
    main()
