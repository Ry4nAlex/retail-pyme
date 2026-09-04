# RetailPyme · Carga unificada (unificación de módulos)

Esta entrega unifica los módulos que antes funcionaban por separado. Con **1 o 2
plantillas de Excel/CSV** se deja poblado **todo el sistema** en una sola acción:
Panel (dashboard), Inventario, Ventas, Análisis de stock y Predicciones.

---

## 1. El problema que resuelve

Antes los datos vivían en dos mundos desconectados:

- **Base de datos** (Panel, Productos, Inventario, Ventas): solo muestran lo que
  está físicamente en PostgreSQL. Para llenarlos había que importar productos y,
  aparte, registrar ventas a mano.
- **Archivos / ML** (Análisis de stock, Predicciones, Conjuntos de datos):
  trabajaban sobre archivos subidos y nunca tocaban las tablas de productos/ventas.

Resultado: subir un archivo para el ML **no** encendía el dashboard, e importar
productos **no** generaba predicciones. Nada estaba conectado.

**La solución:** un único punto de carga (`POST /api/v1/ingest/all` + página
"Carga unificada") que con las mismas plantillas:

1. Crea/actualiza **categorías** y **productos** (catálogo + inventario).
2. Inserta el **historial de ventas** (comprobantes + líneas) → enciende el Panel
   (ventas hoy/mes, top productos, ventas por categoría, últimos 7 días) y el
   módulo de Ventas.
3. Llama al **microservicio XGBoost** y guarda el análisis → enciende Análisis de
   stock y Predicciones.

Es **aditivo**: no altera tablas existentes ni rompe los módulos actuales.

---

## 2. Archivos de esta entrega y dónde van

Copia respetando las rutas (sobrescribe los modificados):

| Archivo | Estado | Ruta en tu proyecto |
|---|---|---|
| `backend/app/api/v1/endpoints/ingest.py` | **NUEVO** | `backend/app/api/v1/endpoints/ingest.py` |
| `backend/app/api/v1/router.py` | modificado (1 línea) | `backend/app/api/v1/router.py` |
| `frontend/src/pages/IngestPage.jsx` | **NUEVO** | `frontend/src/pages/IngestPage.jsx` |
| `frontend/src/services/api.js` | modificado (+`ingestService`) | `frontend/src/services/api.js` |
| `frontend/src/App.jsx` | modificado (ruta `/ingest`) | `frontend/src/App.jsx` |
| `frontend/src/components/common/Layout.jsx` | modificado (menú) | `frontend/src/components/common/Layout.jsx` |

No hay migraciones de base de datos: el endpoint reutiliza tus tablas actuales
(`products`, `categories`, `sales`, `sale_items`, `stock_analyses`).

---

## 3. Las plantillas

### Plantilla 1 — Productos (catálogo + inventario) · *opcional*
Columnas (acepta español/inglés, con o sin tildes):

`sku, nombre, categoria, costo, precio, stock_actual, stock_minimo, stock_maximo`

Si la omites, los productos se **derivan automáticamente** de las ventas (nombre,
categoría y precio; el stock se estima a partir de la demanda histórica).

### Plantilla 2 — Ventas (historial) · *requerida*
`fecha, sku, producto, categoria, cantidad, precio`

Solo `fecha`, `sku` (o `producto`) y `cantidad` son obligatorias; el resto es opcional.

### Tres formas de cargar (1 o 2 archivos)
1. **Un solo libro de Excel** con dos hojas llamadas `Productos` y `Ventas`
   (`ejemplo_completo.xlsx`). → 1 archivo lo hace todo.
2. **Dos archivos** separados: productos + ventas (CSV o Excel, en cualquier orden).
3. **Solo ventas** (incluso con una columna `stock_actual`, estilo
   `dataset_farma_con_stock.xlsx`). El catálogo se deriva de las ventas.

El sistema **clasifica cada archivo automáticamente** por sus columnas/hojas.

---

## 4. Archivos de ejemplo para probar (carpeta `plantillas/`)

Datos de una bodega/minimarket de Lima, 15 meses de historial **anclados a la fecha
de hoy** (incluye ventas de hoy y de la última semana, para que el dashboard se
encienda completo). Escenarios de stock deliberados: 3 productos sobre-stock,
3 bajo-stock, 8 saludables.

| Archivo | Para qué |
|---|---|
| `ejemplo_completo.xlsx` | Un libro con hojas Productos + Ventas. **Empieza por este.** |
| `ejemplo_productos.xlsx` / `.csv` | Solo catálogo |
| `ejemplo_ventas.xlsx` / `.csv` | Solo historial de ventas |
| `plantilla_productos.xlsx` | Plantilla **vacía** para tus datos reales |
| `plantilla_ventas.xlsx` | Plantilla **vacía** para tus datos reales |
| `plantilla_completa.xlsx` | Plantilla vacía con ambas hojas |

Resultado esperado del ejemplo (modelo XGBoost):
**R² ≈ 0.91 · MAPE ≈ 14% · 3 sobre-stock · 3 bajo-stock · ≈ S/ 11,700 inmovilizados.**

> Para regenerar los datos anclados a tu fecha actual, ejecuta
> `python generar_datos_ejemplo.py` (usa `date.today()` por defecto).

---

## 5. Cómo probarlo (paso a paso)

```bash
# 1) Microservicio ML (XGBoost) en :8001
cd ml-service && python -m uvicorn app.main:app --port 8001 --reload

# 2) Backend (FastAPI) en :8000
cd backend && python -m uvicorn app.main:app --port 8000 --reload

# 3) Frontend
cd frontend && npm run dev
```

1. Entra como **administrador** (la carga es solo admin/superadmin).
2. Menú lateral → **Carga unificada**.
3. Arrastra `ejemplo_completo.xlsx` (o los dos archivos por separado).
4. Pulsa **Cargar todo**. Verás el resumen: productos, comprobantes de venta,
   y las métricas del modelo.
5. Revisa **Panel**, **Inventario**, **Ventas**, **Análisis de stock** y
   **Predicciones**: todo queda poblado con la misma carga.

La casilla **Reemplazar carga anterior** desactiva productos/ventas previos de la
empresa antes de cargar (útil para repetir la demo sin duplicar).

---

## 6. Notas para la sustentación

- **Granularidad mensual**: el modelo agrega a demanda mensual por producto
  (rellena meses sin venta con 0) y usa lags, medias móviles y estacionalidad.
- **Se excluye el mes en curso** (incompleto) del entrenamiento/pronóstico para no
  sesgar la tendencia a la baja; ese mes **sí** cuenta en el dashboard.
- **El stock actual del catálogo es la fuente de verdad**: las ventas históricas se
  registran para los reportes pero **no descuentan** el stock actual (evita doble
  conteo y stock negativo).
- **Detección de cobertura**: por producto se calcula días de cobertura =
  stock / demanda diaria de referencia, y se clasifica en sobre-stock
  (≥ umbral), bajo-stock (≤ umbral) o saludable, con exceso/faltante en unidades,
  capital inmovilizado y fecha estimada de agotamiento.

---

## 7. Contrato del endpoint

`POST /api/v1/ingest/all` · multipart/form-data · rol admin

| Campo | Tipo | Default | Descripción |
|---|---|---|---|
| `files` | archivo(s) | — | 1 o 2 archivos (productos y/o ventas) |
| `horizon_months` | int | 3 | Meses a pronosticar |
| `overstock_threshold_days` | float | 75 | Umbral de sobre-stock |
| `understock_threshold_days` | float | 30 | Umbral de bajo-stock |
| `target_coverage_days` | float | 45 | Cobertura objetivo |
| `replace_existing` | bool | false | Desactiva la carga previa antes de insertar |
| `run_ml` | bool | true | Ejecuta el análisis XGBoost |

Respuesta (resumen): productos creados/actualizados, comprobantes/líneas de venta,
rango de fechas, resumen y métricas del ML, e `analysis_id`.
