# RetailPyme · ML Service (XGBoost)

Microservicio **independiente** de Machine Learning para pronóstico de demanda
mensual y **detección de sobre-stock**. Corre por separado del backend principal
y se comunica con él vía HTTP.

> Modelo: **XGBoost** (regresión sobre demanda mensual agregada).

---

## ¿Qué hace?

A partir de un archivo de ventas históricas (CSV/Excel de meses anteriores):

1. Normaliza los datos a **demanda mensual por producto** (rellena meses sin venta con 0).
2. Genera variables: lags (1–3 meses), medias móviles (3 y 6 meses), tendencia,
   estacionalidad (mes, seno/coseno) y código de producto.
3. Entrena un **XGBoost global** (un modelo para todos los productos) con
   *holdout* cronológico de los últimos 3 meses para reportar métricas.
4. Pronostica la demanda de los próximos N meses (recursivo).
5. Calcula, por producto, la **cobertura de stock** y clasifica en:
   `sobre_stock` · `bajo_stock` · `saludable`, con exceso/faltante en unidades,
   capital inmovilizado y fecha estimada de agotamiento.

---

## Instalación

```bash
cd ml-service
python -m venv venv
# Windows: venv\Scripts\activate   |   Linux/Mac: source venv/bin/activate
pip install -r requirements.txt
```

## Correr el servicio

```bash
# Opción A
python -m uvicorn app.main:app --port 8001 --reload
# Opción B
python app/main.py
```

Disponible en `http://localhost:8001` · Swagger en `http://localhost:8001/docs`

## Probar sin levantar el servidor (útil para la tesis)

```bash
python train_baseline.py                          # usa el dataset de ejemplo
python train_baseline.py sample/dataset_farma.xlsx
python train_baseline.py mi_dataset.csv --horizon 6
python train_baseline.py sample/dataset_farma_con_stock.xlsx --json
```

Imprime R², MAE, RMSE, MAPE, importancia de variables y el detalle por producto.

---

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET  | `/health` | Estado del servicio |
| POST | `/analyze` | Recibe archivo + `params`, devuelve análisis de sobre-stock completo |
| POST | `/train` | Entrena y (opcional) guarda el modelo; devuelve métricas |
| POST | `/jobs/{job_id}/run` | Entrena en segundo plano y notifica al backend (callback) |

### `params` (JSON, opcional) para `/analyze`

```json
{
  "horizon_months": 3,
  "overstock_threshold_days": 75,
  "understock_threshold_days": 30,
  "target_coverage_days": 45,
  "current_stock": { "prod-001": 120, "prod-002": 80 },
  "model_params": { "max_depth": 3, "n_estimators": 300 }
}
```

---

## Formato del archivo de entrada

Columnas (acepta nombres en español o inglés):

| Requerida | Columna | Alias aceptados |
|-----------|---------|-----------------|
| ✅ | fecha    | `date`, `fecha`, `fecha_venta` |
| ✅ | producto | `product_id`, `producto_id`, `sku`, `codigo` |
| ✅ | cantidad | `quantity`, `cantidad`, `qty`, `unidades` |
| ➕ | nombre   | `product_name`, `producto`, `nombre` |
| ➕ | categoría| `category`, `categoria`, `rubro` |
| ➕ | precio   | `unit_price`, `precio` |
| ➕ | **stock**| `stock`, `stock_actual`, `existencias`, `inventario` |

> Si incluyes **stock_actual**, el análisis usa tu inventario real. Si no, se
> estima a partir de la demanda histórica y se marca como `estimado`.

---

## Variables de entorno (`.env`)

| Variable | Default | Descripción |
|----------|---------|-------------|
| `PORT` | `8001` | Puerto del microservicio |
| `MAIN_BACKEND_URL` | `http://localhost:8000` | Backend principal (para callbacks) |
