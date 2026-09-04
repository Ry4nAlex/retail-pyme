"""
Carga unificada (onboarding) de RetailPyme.

Con UNA sola acción (1 o 2 archivos) deja TODO el sistema poblado:
  • Productos + Inventario  (tabla products)
  • Ventas + Dashboard      (tablas sales / sale_items -> KPIs, top, categorías, 7 días)
  • Análisis de stock + Predicciones (microservicio XGBoost -> tabla stock_analyses)

Acepta:
  • 1 archivo combinado (Excel con hojas "Productos" y "Ventas"), o
  • 1 archivo de ventas (con o sin columna stock_actual), o
  • 2 archivos: productos + ventas (en cualquier orden / formato CSV o Excel).

Diseño aditivo: NO altera tablas existentes ni rompe los módulos actuales.
"""
import io
import os
import json
import time
import unicodedata
from datetime import datetime, date
from decimal import Decimal

import httpx
import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.models.models import (
    Product, Category, Sale, SaleItem, StockAnalysis,
)
from app.core.security import require_admin
from app.core.config import settings
from app.services.cloud_metrics import probe_ml_availability, build_cloud_metrics

router = APIRouter(prefix="/ingest", tags=["Carga unificada"])

ALLOWED = {".csv", ".xlsx", ".xls"}
TAX_RATE = Decimal("0.18")

# ── Aliases de columnas (acepta español/inglés, con o sin tildes) ──
PROD_ALIASES = {
    "sku":          ["sku", "codigo", "cod", "id_producto", "product_id", "codigo_producto"],
    "name":         ["nombre", "producto", "name", "product_name", "descripcion", "nombre_producto"],
    "category":     ["categoria", "category", "rubro", "linea"],
    "unit_cost":    ["costo", "costo_unitario", "unit_cost", "precio_costo"],
    "unit_price":   ["precio", "precio_unitario", "precio_venta", "unit_price", "price"],
    "stock":        ["stock_actual", "stock", "existencias", "inventario", "current_stock"],
    "min_stock":    ["stock_minimo", "minimo", "min_stock", "min"],
    "max_stock":    ["stock_maximo", "maximo", "max_stock", "max"],
}
SALE_ALIASES = {
    "date":       ["fecha", "date", "fecha_venta", "dia"],
    "sku":        ["sku", "codigo", "cod", "id_producto", "product_id", "codigo_producto"],
    "name":       ["producto", "nombre", "product_name", "name", "descripcion"],
    "category":   ["categoria", "category", "rubro", "linea"],
    "quantity":   ["cantidad", "qty", "unidades", "quantity", "vendidos"],
    "unit_price": ["precio", "precio_unitario", "unit_price", "price"],
    "stock":      ["stock_actual", "stock", "existencias", "inventario", "current_stock"],
}


def _norm(value) -> str:
    text = str(value).strip().lower()
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    for sep in (" ", "-", ".", "/"):
        text = text.replace(sep, "_")
    while "__" in text:
        text = text.replace("__", "_")
    return text.strip("_")


def _resolve(df: pd.DataFrame, aliases: dict) -> dict:
    lower = {_norm(c): c for c in df.columns}
    found = {}
    for canonical, opts in aliases.items():
        for a in opts:
            if _norm(a) in lower:
                found[canonical] = lower[_norm(a)]
                break
    return found


def _as_int(v, default=0):
    try:
        return default if pd.isna(v) else int(round(float(v)))
    except Exception:
        return default


def _as_float(v, default=0.0):
    try:
        return default if pd.isna(v) else float(v)
    except Exception:
        return default


def _looks_like(df: pd.DataFrame, aliases: dict, required: list) -> bool:
    cols = _resolve(df, aliases)
    return all(r in cols for r in required)


def _read_file(content: bytes, filename: str):
    """Devuelve dict con posibles dataframes {'productos': df|None, 'ventas': df|None}."""
    ext = os.path.splitext(filename or "")[1].lower()
    if ext not in ALLOWED:
        raise HTTPException(400, f"'{filename}': tipo no permitido. Use CSV, XLSX o XLS.")

    out = {"productos": None, "ventas": None}
    if ext == ".csv":
        df = pd.read_csv(io.BytesIO(content))
        _classify_single(df, out)
        return out

    # Excel: puede traer varias hojas (p. ej. "Productos" y "Ventas")
    xls = pd.ExcelFile(io.BytesIO(content))
    if len(xls.sheet_names) == 1:
        _classify_single(pd.read_excel(xls, sheet_name=0), out)
        return out

    for sheet in xls.sheet_names:
        s = _norm(sheet)
        df = pd.read_excel(xls, sheet_name=sheet)
        if df.empty:
            continue
        if s in ("productos", "products", "catalogo", "inventario") or \
           (_looks_like(df, PROD_ALIASES, ["sku", "name"]) and not _looks_like(df, SALE_ALIASES, ["date", "quantity"])):
            out["productos"] = df
        elif s in ("ventas", "sales", "historial") or _looks_like(df, SALE_ALIASES, ["date", "quantity"]):
            out["ventas"] = df
    # Fallback: si solo se reconoció una, intenta clasificar la primera hoja
    if out["productos"] is None and out["ventas"] is None:
        _classify_single(pd.read_excel(xls, sheet_name=0), out)
    return out


def _classify_single(df: pd.DataFrame, out: dict):
    if df is None or df.empty:
        return
    if _looks_like(df, SALE_ALIASES, ["date", "quantity"]):
        out["ventas"] = df            # un archivo de ventas (puede traer stock)
    elif _looks_like(df, PROD_ALIASES, ["sku", "name"]):
        out["productos"] = df


def _build_catalog(prod_df, ventas_std):
    """Catálogo normalizado por SKU. Si no hay hoja de productos, se deriva de ventas."""
    catalog = {}  # sku -> dict
    if prod_df is not None and not prod_df.empty:
        c = _resolve(prod_df, PROD_ALIASES)
        if "sku" not in c or "name" not in c:
            raise HTTPException(400, "La hoja de productos necesita al menos columnas SKU y nombre.")
        for _, row in prod_df.iterrows():
            sku = str(row[c["sku"]]).strip()
            if not sku or sku.lower() == "nan":
                continue
            catalog[sku] = {
                "name": str(row[c["name"]]).strip() or sku,
                "category": str(row[c["category"]]).strip() if "category" in c and pd.notna(row[c["category"]]) else "General",
                "unit_cost": _as_float(row[c["unit_cost"]]) if "unit_cost" in c else 0.0,
                "unit_price": _as_float(row[c["unit_price"]]) if "unit_price" in c else 0.0,
                "stock": _as_int(row[c["stock"]]) if "stock" in c else None,
                "min_stock": _as_int(row[c["min_stock"]]) if "min_stock" in c else None,
                "max_stock": _as_int(row[c["max_stock"]]) if "max_stock" in c else None,
            }

    # Demanda mensual promedio por SKU (para precio/stock derivados)
    dem = (ventas_std.assign(_m=ventas_std["date"].dt.to_period("M"))
                     .groupby(["sku", "_m"])["quantity"].sum()
                     .groupby("sku").mean())

    for sku, g in ventas_std.groupby("sku"):
        sku = str(sku)
        dm = float(dem.get(sku, g["quantity"].sum()))
        if sku not in catalog:
            catalog[sku] = {
                "name": str(g["name"].iloc[0]) if "name" in g and g["name"].notna().any() else sku,
                "category": str(g["category"].iloc[0]) if "category" in g and g["category"].notna().any() else "General",
                "unit_cost": 0.0,
                "unit_price": float(np.nanmean(g["unit_price"])) if "unit_price" in g and g["unit_price"].notna().any() else 0.0,
                "stock": None, "min_stock": None, "max_stock": None,
            }
        info = catalog[sku]
        if not info.get("unit_price"):
            info["unit_price"] = float(np.nanmean(g["unit_price"])) if "unit_price" in g and g["unit_price"].notna().any() else 0.0
        # Si no vino stock, estímalo (≈1.4 meses de demanda) para que inventario/dashboard tengan valor
        if info.get("stock") is None:
            info["stock"] = int(round(dm * 1.4))
            info["_stock_estimado"] = True
        if not info.get("min_stock"):
            info["min_stock"] = int(round(dm * 0.5))
        if not info.get("max_stock"):
            info["max_stock"] = int(round(dm * 3.0))
    return catalog


def _standardize_sales(ventas_df: pd.DataFrame) -> pd.DataFrame:
    c = _resolve(ventas_df, SALE_ALIASES)
    for r in ("date", "sku", "quantity"):
        if r not in c:
            raise HTTPException(400, "La hoja de ventas necesita columnas: fecha, producto/sku y cantidad.")
    d = pd.DataFrame()
    d["date"] = pd.to_datetime(ventas_df[c["date"]], errors="coerce")
    d["sku"] = ventas_df[c["sku"]].astype(str).str.strip()
    d["quantity"] = pd.to_numeric(ventas_df[c["quantity"]], errors="coerce")
    d["name"] = ventas_df[c["name"]].astype(str) if "name" in c else d["sku"]
    d["category"] = ventas_df[c["category"]].astype(str) if "category" in c else "General"
    d["unit_price"] = pd.to_numeric(ventas_df[c["unit_price"]], errors="coerce") if "unit_price" in c else np.nan
    d = d.dropna(subset=["date", "quantity"])
    d = d[d["quantity"] > 0]
    if d.empty:
        raise HTTPException(400, "No hay filas de ventas válidas tras la limpieza (revisa fecha/cantidad).")
    return d


async def _ml_analyze(ventas_std: pd.DataFrame, current_stock: dict, params: dict) -> dict | None:
    """Llama al microservicio XGBoost excluyendo el mes en curso (incompleto)."""
    cur = ventas_std["date"].max().to_period("M")
    complete = ventas_std[ventas_std["date"].dt.to_period("M") != cur] \
        if cur == pd.Timestamp.today().to_period("M") else ventas_std

    payload = complete.rename(columns={
        "date": "fecha", "sku": "product_id", "name": "product_name",
        "category": "category", "quantity": "quantity", "unit_price": "unit_price",
    }).copy()
    payload["fecha"] = payload["fecha"].dt.date.astype(str)
    csv_bytes = payload.to_csv(index=False).encode("utf-8")

    body = {**params, "current_stock": current_stock}
    url = f"{settings.ML_SERVICE_URL.rstrip('/')}/analyze"
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                url,
                files={"file": ("ventas.csv", csv_bytes, "text/csv")},
                data={"params": json.dumps(body)},
            )
        if resp.status_code >= 400:
            return {"_error": f"ML {resp.status_code}: {resp.text[:200]}"}
        return resp.json()
    except httpx.ConnectError:
        return {"_error": f"No se pudo conectar al microservicio ML en {settings.ML_SERVICE_URL}."}
    except Exception as e:  # noqa
        return {"_error": str(e)}


@router.post("/all")
async def ingest_all(
    files: list[UploadFile] = File(...),
    horizon_months: int = Form(3),
    overstock_threshold_days: float = Form(75),
    understock_threshold_days: float = Form(30),
    target_coverage_days: float = Form(45),
    replace_existing: bool = Form(False),
    run_ml: bool = Form(True),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """
    Procesa 1 o 2 archivos y deja poblado todo el sistema.
    `replace_existing=True` desactiva productos/ventas previos de la empresa antes de cargar.
    """
    if not files:
        raise HTTPException(400, "Sube al menos un archivo (ventas, o productos + ventas).")
    if len(files) > 2:
        raise HTTPException(400, "Máximo 2 archivos (productos y ventas).")

    t_start = time.perf_counter()
    cid = current_user["company_id"]

    # 1) Leer y clasificar archivos
    prod_df = None
    ventas_df = None
    nombres = []
    for f in files:
        nombres.append(f.filename)
        content = await f.read()
        if len(content) > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
            raise HTTPException(413, f"'{f.filename}' supera {settings.MAX_UPLOAD_SIZE_MB}MB.")
        parsed = _read_file(content, f.filename)
        if parsed["productos"] is not None:
            prod_df = parsed["productos"]
        if parsed["ventas"] is not None:
            ventas_df = parsed["ventas"]

    if ventas_df is None:
        raise HTTPException(
            400,
            "No se encontró una hoja/archivo de VENTAS (necesita columnas fecha, producto y cantidad). "
            "Las ventas son obligatorias; los productos son opcionales.",
        )

    ventas_std = _standardize_sales(ventas_df)
    catalog = _build_catalog(prod_df, ventas_std)

    # 2) (Opcional) limpiar carga previa de la empresa
    if replace_existing:
        existing = (await db.execute(select(Product).where(Product.company_id == cid))).scalars().all()
        for p in existing:
            p.active = False

    # 3) Upsert de categorías
    cats = {}  # nombre_norm -> Category
    rows = (await db.execute(select(Category).where(Category.company_id == cid))).scalars().all()
    for c in rows:
        cats[_norm(c.name)] = c

    async def _get_cat(name: str):
        key = _norm(name or "General")
        if key in cats:
            return cats[key]
        cat = Category(company_id=cid, name=(name or "General").strip(), active=True)
        db.add(cat)
        await db.flush()
        cats[key] = cat
        return cat

    # 4) Upsert de productos
    prod_by_sku = {}
    existing_prod = (await db.execute(select(Product).where(Product.company_id == cid))).scalars().all()
    existing_by_sku = {p.sku: p for p in existing_prod}
    prod_created = prod_updated = 0
    for sku, info in catalog.items():
        cat = await _get_cat(info["category"])
        if sku in existing_by_sku:
            p = existing_by_sku[sku]
            p.name = info["name"]
            p.category_id = cat.id
            p.unit_cost = info["unit_cost"]
            p.unit_price = info["unit_price"]
            p.stock = int(info["stock"])
            p.min_stock = int(info["min_stock"])
            p.max_stock = int(info["max_stock"])
            p.active = True
            prod_updated += 1
        else:
            p = Product(
                company_id=cid, sku=sku, name=info["name"], category_id=cat.id,
                unit_cost=info["unit_cost"], unit_price=info["unit_price"],
                stock=int(info["stock"]), min_stock=int(info["min_stock"]),
                max_stock=int(info["max_stock"]), unit="unit", active=True,
            )
            db.add(p)
            prod_created += 1
        prod_by_sku[sku] = p
    await db.flush()

    # 5) Insertar ventas (una venta por fecha; ítems por producto) -> enciende Dashboard
    base_n = (await db.execute(select(func.count(Sale.id)).where(Sale.company_id == cid))).scalar() or 0
    sales_created = items_created = 0
    n = base_n
    skus_validos = set(prod_by_sku.keys())

    # precio de venta efectivo por línea (usa el del archivo o el del catálogo)
    grouped = ventas_std.groupby(ventas_std["date"].dt.date)
    nuevas_sales, nuevos_items = [], []
    for dia, g in grouped:
        sub = Decimal("0")
        items = []
        for _, r in g.iterrows():
            sku = str(r["sku"])
            if sku not in skus_validos:
                continue
            prod = prod_by_sku[sku]
            qty = int(r["quantity"])
            price = r["unit_price"]
            if pd.isna(price) or float(price) <= 0:
                price = float(prod.unit_price or 0)
            price = Decimal(str(round(float(price), 2)))
            line = price * qty
            sub += line
            items.append((prod.id, qty, price, line))
        if not items:
            continue
        n += 1
        tax = (sub * TAX_RATE).quantize(Decimal("0.01"))
        sale = Sale(
            company_id=cid, customer_id=None,
            sale_number=f"S-{dia.year}{dia.month:02d}-{n:05d}",
            sale_date=datetime.combine(dia, datetime.min.time()),
            subtotal=sub, tax=tax, total=sub + tax,
            payment_method="cash", status="completed",
            notes=f"Carga unificada {datetime.utcnow():%Y-%m-%d}",
        )
        nuevas_sales.append(sale)
        for (pid, qty, price, line) in items:
            nuevos_items.append((sale, SaleItem(
                product_id=pid, quantity=qty, unit_price=price,
                discount=Decimal("0"), subtotal=line,
            )))
        sales_created += 1
        items_created += len(items)

    db.add_all(nuevas_sales)
    await db.flush()
    for sale, item in nuevos_items:
        item.sale_id = sale.id
        db.add(item)
    await db.flush()

    # 6) Análisis ML (XGBoost) -> enciende Análisis de stock + Predicciones
    ml_summary = None
    ml_error = None
    analysis_id = None
    cloud = None
    if run_ml:
        current_stock = {sku: int(info["stock"]) for sku, info in catalog.items()}
        params = {
            "horizon_months": horizon_months,
            "overstock_threshold_days": overstock_threshold_days,
            "understock_threshold_days": understock_threshold_days,
            "target_coverage_days": target_coverage_days,
        }
        t_ml = time.perf_counter()
        out = await _ml_analyze(ventas_std, current_stock, params)
        ml_roundtrip_ms = (time.perf_counter() - t_ml) * 1000
        if out and "_error" not in out:
            s = out.get("summary", {})
            # ── Métricas operativas cloud ──
            ml_timings = out.get("timings", {}) or {}
            availability = await probe_ml_availability(settings.ML_SERVICE_URL, n=5)
            backend_stages = [
                {"stage": "Recepción + ETL ingestión", "ms": round((t_ml - t_start) * 1000, 1)},
                {"stage": "Llamada al microservicio ML", "ms": round(ml_roundtrip_ms - (ml_timings.get("total_ml_ms") or 0), 1)},
            ]
            cloud = build_cloud_metrics(
                records=ml_timings.get("records_in", len(ventas_std)),
                total_ms=(time.perf_counter() - t_start) * 1000,
                backend_stages=backend_stages,
                ml_timings=ml_timings,
                availability=availability,
            )
            out["cloud_metrics"] = cloud
            rec = StockAnalysis(
                company_id=cid, created_by=current_user["user_id"], dataset_id=None,
                source_filename=" + ".join([x for x in nombres if x]) or "carga_unificada",
                horizon_months=horizon_months,
                total_products=s.get("total_products", 0),
                overstock_count=s.get("overstock_count", 0),
                understock_count=s.get("understock_count", 0),
                healthy_count=s.get("healthy_count", 0),
                excess_value=s.get("total_excess_value", 0),
                metrics=out.get("metrics", {}),
                result=out,
            )
            db.add(rec)
            await db.flush()
            await db.refresh(rec)
            analysis_id = str(rec.id)
            ml_summary = {**s, "metrics": out.get("metrics", {})}
        elif out:
            ml_error = out.get("_error")

    return {
        "ok": True,
        "archivos": nombres,
        "productos": {"creados": prod_created, "actualizados": prod_updated, "total": len(catalog)},
        "ventas": {"comprobantes": sales_created, "lineas": items_created,
                   "rango": [ventas_std["date"].min().date().isoformat(),
                             ventas_std["date"].max().date().isoformat()]},
        "ml": ml_summary,
        "ml_error": ml_error,
        "analysis_id": analysis_id,
        "cloud_metrics": cloud,
        "mensaje": "Carga completada. Revisa el Panel, Inventario, Ventas y Predicciones.",
    }
