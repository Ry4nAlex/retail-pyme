# Integración del modelo XGBoost — RetailPyme

Este documento explica **qué se agregó**, **cómo está integrado** y **cómo correrlo**.
No se modificó la lógica existente del sistema: la integración es **aditiva** y se
acopla a los puntos de extensión que el proyecto ya tenía previstos.

---

## 1. Arquitectura (3 servicios)

```
┌──────────────────┐        HTTP         ┌──────────────────┐        HTTP         ┌──────────────────┐
│    FRONTEND      │  ───────────────▶   │   BACKEND        │  ───────────────▶   │   ML-SERVICE     │
│  React + Vite    │   /api/v1/ml/...    │  FastAPI (8000)  │   /analyze /train   │  FastAPI (8001)  │
│   (puerto 3000)  │ ◀───────────────    │  PostgreSQL      │ ◀───────────────    │   XGBoost        │
└──────────────────┘     resultado       └──────────────────┘     resultado       └──────────────────┘
                                                  │
                                                  ▼
                                          guarda en tabla
                                          `stock_analyses`
```

- El **frontend** sube el CSV/Excel del cliente.
- El **backend** lo reenvía al microservicio, **guarda el resultado** y lo devuelve.
- El **ml-service** (XGBoost, separado) hace todo el trabajo de ML.

El microservicio puede caerse o actualizarse sin afectar al backend; si no está
disponible, el backend responde con un error claro (503) en vez de romperse.

---

## 2. Flujo principal: "qué productos tienen sobre-stock y cuándo"

1. El cliente entra a **Análisis de stock** (menú lateral) y sube su Excel/CSV de
   ventas de meses anteriores.
2. Backend → `POST /api/v1/ml/analyze-stock` → reenvía a `POST /analyze` del ml-service.
3. XGBoost entrena, pronostica y clasifica cada producto:
   - **Sobre-stock** → cobertura mayor al umbral (exceso de inventario, capital inmovilizado).
   - **Bajo-stock** → riesgo de quiebre.
   - **Saludable** → alineado con la demanda.
4. El frontend muestra: tarjetas resumen, métricas del modelo, importancia de
   variables, tabla por producto y un gráfico de **demanda histórica vs pronóstico**
   por producto.

---

## 3. El modelo (para la tesis)

| Aspecto | Decisión |
|---------|----------|
| Algoritmo | **XGBoost** (`reg:squarederror`) |
| Granularidad | **Mensual** (a nivel diario el ruido de farmacia degradaba el R²) |
| Enfoque | **Modelo global**: un solo XGBoost para todos los productos (mejor con pocos datos por producto) |
| Variables | lags 1–3 meses, medias móviles 3 y 6 meses, tendencia, mes, estacionalidad (sen/cos), código de producto |
| Validación | *Holdout* cronológico de los últimos 3 meses |
| Métricas | R², MAE, RMSE, MAPE |

**Resultado con `dataset_farma.xlsx`** (15 meses, 8 productos):

```
R² = 0.61 · MAE = 11.4 · RMSE = 14.1 · MAPE = 69%
Variables más importantes: rm_3, rm_6 (medias móviles) y estacionalidad
```

> Nota honesta para la defensa: la demanda de este dataset es bastante
> *mean-reverting* (los promedios móviles son señal fuerte). XGBoost los aprovecha
> correctamente y los reporta como las variables más importantes. El MAPE alto se
> explica por las cantidades pequeñas (un error de 2 unidades sobre una venta de 3
> ya es 66%), no por un mal ajuste absoluto (MAE ≈ 11 u/mes a nivel agregado).

---

## 4. Lógica de detección de sobre-stock

Por producto:

```
demanda_referencia (u/mes) = promedio( pronóstico_próximo_mes , demanda_reciente_3m )
cobertura_días             = stock_actual / (demanda_referencia / 30)
stock_objetivo             = demanda_diaria × cobertura_objetivo (45 días por defecto)
exceso_unidades            = max(0, stock_actual − stock_objetivo)
capital_inmovilizado       = exceso_unidades × precio_unitario
```

Clasificación (umbrales configurables desde la UI):
- `cobertura ≥ 75 días` → **sobre_stock**
- `cobertura ≤ 30 días` → **bajo_stock**
- en otro caso → **saludable**

**Stock actual** se obtiene en este orden de prioridad:
1. Valor enviado manualmente (`current_stock`).
2. Columna `stock_actual` del archivo subido ← *recomendado, da resultados reales*.
3. Estimación a partir de la demanda histórica (etiquetada como `estimado`).

---

## 5. Qué se agregó al código (sin tocar lo existente)

### Nuevo microservicio
```
ml-service/
├── app/
│   ├── main.py          # FastAPI (endpoints /analyze, /train, /health)
│   ├── forecasting.py   # Motor XGBoost (validado con el dataset real)
│   └── schemas.py
├── sample/              # datasets de ejemplo (con y sin columna de stock)
├── train_baseline.py    # CLI para reportar métricas sin levantar el servidor
├── requirements.txt
└── README.md
```

### Backend (cambios aditivos)
- `core/config.py` → nueva variable `ML_SERVICE_URL`.
- `models/models.py` → nueva tabla **`stock_analyses`** (no altera tablas existentes).
- `schemas/schemas.py` → `StockAnalysisResponse`, `StockAnalysisListItem`.
- `api/v1/endpoints/ml.py` → nuevos endpoints:
  - `POST /ml/analyze-stock` (cliente sube archivo y obtiene el análisis)
  - `GET /ml/analyses` · `GET /ml/analyses/{id}` · `DELETE /ml/analyses/{id}`
  - `GET /ml/health-ml` (verifica el microservicio)
  - `POST /ml/training-jobs` ahora **sí entrena** llamando al microservicio.

### Frontend (cambios aditivos)
- `pages/StockAnalysisPage.jsx` → nueva página (subida + resultados + gráficos).
- `services/api.js` → métodos `analyzeStock`, `listAnalyses`, `getAnalysis`, etc.
- `App.jsx` → ruta `/ml/stock-analysis`.
- `components/common/Layout.jsx` → entrada de menú "Análisis de stock" (los 3 roles).

---

## 6. Cómo correr todo

### Paso 1 — Microservicio ML (puerto 8001)
```bash
cd ml-service
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn app.main:app --port 8001 --reload
```

### Paso 2 — Backend (puerto 8000)
```bash
cd backend
source venv/bin/activate
pip install -r requirements.txt
# en tu .env, opcional: ML_SERVICE_URL=http://localhost:8001
python -m uvicorn app.main:app --reload
```

### Paso 3 — Frontend (puerto 3000)
```bash
cd frontend
npm install
npm run dev
```

> Atajo: en la raíz hay `run_all.sh` (Linux/Mac) y `run_all.bat` (Windows) que
> levantan backend + ml-service juntos. El frontend se corre aparte con `npm run dev`.

### Paso 4 — Probar
1. Inicia sesión, ve a **Análisis de stock**.
2. Sube `ml-service/sample/dataset_farma_con_stock.xlsx`.
3. Verás 4 productos en sobre-stock, 2 en bajo-stock y 2 saludables, con métricas
   del modelo y gráficos de pronóstico.

---

## 7. Notas

- Se usa **solo XGBoost** (ningún otro algoritmo), como pediste.
- La integración no modifica la base de datos existente: solo **agrega** una tabla.
- Si el microservicio está apagado, el indicador en la página lo muestra como
  "sin conexión" y el backend devuelve un error legible.
