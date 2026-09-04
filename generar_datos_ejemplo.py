"""
Generador de plantillas y datos de ejemplo unificados para RetailPyme.
Produce 2 plantillas que alimentan TODO el sistema (dashboard + inventario +
ventas + ML): una de PRODUCTOS (catálogo/inventario) y una de VENTAS (historial).

- Datos pensados para una bodega/minimarket en Lima.
- 15 meses de historial que terminan HOY (incluye ventas de hoy y de los
  últimos 7 días) -> el dashboard se enciende completo.
- Stocks deliberados -> el modelo XGBoost detecta sobre-stock y bajo-stock.
"""
import os
import numpy as np
import pandas as pd
from datetime import date, timedelta

np.random.seed(42)
OUT = "/home/claude/work/plantillas"
os.makedirs(OUT, exist_ok=True)

HOY = date.today()   # se ancla a HOY automáticamente al ejecutar
MESES = 15
inicio = (HOY.replace(day=1) - pd.DateOffset(months=MESES - 1)).date()

# ── Catálogo: (sku, nombre, categoria, costo, precio, base_demanda_dia,
#               estacionalidad_mes_pico, tendencia, escenario_stock) ──
# escenario: "sobre" = mucho stock, "bajo" = poco stock, "ok" = saludable
PRODUCTOS = [
    ("BEB-001", "Agua Cielo 625ml",            "Bebidas",      0.80, 1.50, 18, 1,  0.000, "ok"),
    ("BEB-002", "Gaseosa Inca Kola 500ml",     "Bebidas",      1.60, 2.50, 22, 1,  0.002, "bajo"),
    ("BEB-003", "Cerveza Pilsen 355ml",        "Bebidas",      2.40, 4.00, 14, 12, 0.001, "ok"),
    ("ABA-001", "Arroz Costeño 1kg",           "Abarrotes",    3.20, 4.50, 12, 7,  0.000, "sobre"),
    ("ABA-002", "Aceite Primor 1L",            "Abarrotes",    7.50, 9.90,  8, 7,  0.000, "ok"),
    ("ABA-003", "Atún Florida lata",           "Abarrotes",    3.80, 5.50,  9, 3, -0.001, "sobre"),
    ("ABA-004", "Fideos Don Vittorio 500g",    "Abarrotes",    2.10, 3.20, 11, 6,  0.000, "ok"),
    ("LAC-001", "Leche Gloria tarro",          "Lácteos",      3.00, 4.20, 16, 7,  0.001, "bajo"),
    ("LAC-002", "Yogurt Gloria 1L",            "Lácteos",      4.50, 6.50,  7, 1,  0.000, "ok"),
    ("SNK-001", "Galleta Soda Field",          "Snacks",       0.60, 1.00, 20, 7,  0.000, "ok"),
    ("SNK-002", "Chocolate Sublime",           "Snacks",       1.20, 2.00, 13, 6,  0.002, "sobre"),
    ("LIM-001", "Detergente Bolívar 520g",     "Limpieza",     3.50, 5.00,  6, 1,  0.000, "ok"),
    ("LIM-002", "Papel higiénico Suave x4",    "Limpieza",     4.20, 6.00, 10, 1,  0.001, "bajo"),
    ("CUI-001", "Jabón Bolívar barra",         "Cuidado",      1.10, 1.80,  9, 1,  0.000, "ok"),
]

# ── Genera historial de ventas diario por producto ──
filas = []
dias = pd.date_range(inicio, HOY, freq="D")
for sku, nombre, cat, costo, precio, base, mes_pico, tend, _esc in PRODUCTOS:
    for i, dia in enumerate(dias):
        # estacionalidad: pico suave alrededor del mes_pico
        m = dia.month
        dist = min((m - mes_pico) % 12, (mes_pico - m) % 12)
        season = 1.0 + 0.35 * np.cos(np.pi * dist / 6.0)
        # tendencia diaria acumulada
        trend = 1.0 + tend * i
        # fin de semana un poco más alto
        weekend = 1.18 if dia.weekday() >= 5 else 1.0
        lam = max(0.1, base * season * trend * weekend)
        qty = int(np.random.poisson(lam))
        if qty <= 0:
            continue
        filas.append({
            "fecha": dia.date().isoformat(),
            "sku": sku,
            "producto": nombre,
            "categoria": cat,
            "cantidad": qty,
            "precio": precio,
        })

ventas = pd.DataFrame(filas).sort_values(["fecha", "sku"]).reset_index(drop=True)

# ── Calcula stock actual según escenario, anclado a la demanda mensual real ──
demanda_mensual = (
    ventas.assign(mes=lambda d: pd.to_datetime(d["fecha"]).dt.to_period("M"))
          .groupby(["sku", "mes"])["cantidad"].sum()
          .groupby("sku").mean()
)
catalogo = []
FACTOR = {"sobre": 4.5, "bajo": 0.35, "ok": 1.4}  # meses de cobertura aprox.
for sku, nombre, cat, costo, precio, base, mes_pico, tend, esc in PRODUCTOS:
    dm = float(demanda_mensual.get(sku, base * 30))
    stock_actual = int(round(dm * FACTOR[esc]))
    catalogo.append({
        "sku": sku,
        "nombre": nombre,
        "categoria": cat,
        "costo": costo,
        "precio": precio,
        "stock_actual": stock_actual,
        "stock_minimo": int(round(dm * 0.5)),
        "stock_maximo": int(round(dm * 3.0)),
    })
productos = pd.DataFrame(catalogo)

# ── Plantillas VACÍAS (solo encabezados + 1 fila de ejemplo) ──
plantilla_productos = pd.DataFrame([{
    "sku": "ABC-001", "nombre": "Ejemplo Producto", "categoria": "Abarrotes",
    "costo": 3.20, "precio": 4.50, "stock_actual": 120,
    "stock_minimo": 30, "stock_maximo": 300,
}])
plantilla_ventas = pd.DataFrame([
    {"fecha": "2025-01-15", "sku": "ABC-001", "producto": "Ejemplo Producto",
     "categoria": "Abarrotes", "cantidad": 8, "precio": 4.50},
    {"fecha": "2025-01-16", "sku": "ABC-001", "producto": "Ejemplo Producto",
     "categoria": "Abarrotes", "cantidad": 5, "precio": 4.50},
])

# ── Escribe archivos ──
# 1) Datos de ejemplo (listos para probar)
productos.to_excel(f"{OUT}/ejemplo_productos.xlsx", index=False)
ventas.to_excel(f"{OUT}/ejemplo_ventas.xlsx", index=False)
productos.to_csv(f"{OUT}/ejemplo_productos.csv", index=False)
ventas.to_csv(f"{OUT}/ejemplo_ventas.csv", index=False)

# 2) Un solo libro con 2 hojas (opción "1 archivo lo hace todo")
with pd.ExcelWriter(f"{OUT}/ejemplo_completo.xlsx") as xl:
    productos.to_excel(xl, sheet_name="Productos", index=False)
    ventas.to_excel(xl, sheet_name="Ventas", index=False)

# 3) Plantillas vacías para datos reales
plantilla_productos.to_excel(f"{OUT}/plantilla_productos.xlsx", index=False)
plantilla_ventas.to_excel(f"{OUT}/plantilla_ventas.xlsx", index=False)
with pd.ExcelWriter(f"{OUT}/plantilla_completa.xlsx") as xl:
    plantilla_productos.to_excel(xl, sheet_name="Productos", index=False)
    plantilla_ventas.to_excel(xl, sheet_name="Ventas", index=False)

print("Rango de fechas:", ventas["fecha"].min(), "->", ventas["fecha"].max())
print("Filas de ventas:", len(ventas), "| Productos:", len(productos))
print("Ventas en el mes actual:",
      (pd.to_datetime(ventas["fecha"]).dt.to_period("M") ==
       pd.Period(HOY, "M")).sum())
print("\nEscenarios de stock:")
for r, p in zip(catalogo, PRODUCTOS):
    dm = float(demanda_mensual.get(r["sku"], 0))
    print(f"  {r['sku']:8} {r['nombre'][:26]:26} dem~{dm:5.0f}/mes  "
          f"stock={r['stock_actual']:4}  -> {p[8]}")
print("\nArchivos en", OUT)
for f in sorted(os.listdir(OUT)):
    print("  ", f)
