from io import BytesIO
import os
import unicodedata
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from sqlalchemy.orm import selectinload
from typing import Optional
from uuid import UUID
from app.db.database import get_db
from app.models.models import Product, Category, InventoryMovement
from app.schemas.schemas import (
    ProductCreate,
    ProductUpdate,
    ProductResponse,
    StockAdjustRequest,
)
from app.core.security import get_current_user, require_admin
from app.core.config import settings

router = APIRouter(prefix="/products", tags=["Products"])

ALLOWED_IMPORT_EXTENSIONS = {".csv", ".xlsx", ".xls"}
PRODUCT_COLUMN_ALIASES = {
    "sku": ["sku", "codigo", "código", "cod_producto", "codigo_producto"],
    "name": ["name", "nombre", "producto", "descripcion_producto"],
    "description": ["description", "descripcion", "descripción", "detalle"],
    "unit_cost": ["unit_cost", "costo", "costo_unitario", "precio_costo"],
    "unit_price": ["unit_price", "precio", "precio_unitario", "precio_venta"],
    "stock": ["stock", "inventario", "cantidad", "existencias"],
    "min_stock": ["min_stock", "stock_minimo", "stock_mínimo", "minimo", "mínimo"],
    "max_stock": ["max_stock", "stock_maximo", "stock_máximo", "maximo", "máximo"],
    "unit": ["unit", "unidad", "medida"],
    "category": ["category", "categoria", "categoría", "rubro"],
}

PRODUCT_COLUMN_ALIASES["sku"].extend(["código", "id_producto", "product_id"])
PRODUCT_COLUMN_ALIASES["name"].extend(["product_name", "nombre_producto"])
PRODUCT_COLUMN_ALIASES["description"].append("descripción")
PRODUCT_COLUMN_ALIASES["unit_price"].append("price")
PRODUCT_COLUMN_ALIASES["stock"].extend(["stock_actual", "current_stock"])
PRODUCT_COLUMN_ALIASES["min_stock"].extend(["stock_mínimo", "mínimo"])
PRODUCT_COLUMN_ALIASES["max_stock"].extend(["stock_máximo", "máximo"])
PRODUCT_COLUMN_ALIASES["category"].append("categoría")


def _norm_column(value):
    text = str(value).strip().lower()
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    for sep in (" ", "-", ".", "/"):
        text = text.replace(sep, "_")
    while "__" in text:
        text = text.replace("__", "_")
    return text.strip("_")


def _pick(row, columns, field, default=None):
    for alias in PRODUCT_COLUMN_ALIASES[field]:
        key = columns.get(_norm_column(alias))
        if key is not None:
            value = row.get(key)
            if pd.notna(value) and str(value).strip() != "":
                return value
    return default


def _as_int(value, default=0):
    try:
        if pd.isna(value):
            return default
        return int(float(value))
    except Exception:
        return default


def _as_decimalish(value, default=0):
    try:
        if pd.isna(value):
            return default
        return float(value)
    except Exception:
        return default


def _product_opts():
    return [selectinload(Product.category)]


@router.get("/")
async def list_products(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=500),
    search: Optional[str] = None,
    category_id: Optional[UUID] = None,
    low_stock: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    cid = current_user["company_id"]
    q = select(Product).where(Product.company_id == cid, Product.active == True)
    if search:
        q = q.where(
            or_(Product.name.ilike(f"%{search}%"), Product.sku.ilike(f"%{search}%"))
        )
    if category_id:
        q = q.where(Product.category_id == category_id)
    if low_stock:
        q = q.where(Product.stock <= Product.min_stock)

    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar()
    result = await db.execute(
        q.options(*_product_opts()).offset((page - 1) * size).limit(size)
    )
    items = result.scalars().all()

    return {
        "items": [ProductResponse.model_validate(p) for p in items],
        "total": total,
        "page": page,
        "size": size,
        "pages": (total + size - 1) // size,
    }


@router.get("/{product_id}", response_model=ProductResponse)
async def get_product(
    product_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    r = await db.execute(
        select(Product).options(*_product_opts()).where(Product.id == product_id)
    )
    p = r.scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Product not found")
    return p


@router.post("/", response_model=ProductResponse, status_code=201)
async def create_product(
    data: ProductCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    cid = current_user["company_id"]
    ex = await db.execute(
        select(Product).where(Product.company_id == cid, Product.sku == data.sku)
    )
    if ex.scalar_one_or_none():
        raise HTTPException(400, "SKU already exists for this company")
    p = Product(company_id=cid, **data.model_dump())
    db.add(p)
    await db.flush()
    result = await db.execute(
        select(Product).options(*_product_opts()).where(Product.id == p.id)
    )
    return result.scalar_one()


@router.post("/import")
async def import_products(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_IMPORT_EXTENSIONS:
        raise HTTPException(400, "Use a CSV, XLSX or XLS file")

    content = await file.read()
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(413, f"File too large. Max size: {settings.MAX_UPLOAD_SIZE_MB}MB")

    try:
        if ext == ".csv":
            df = pd.read_csv(BytesIO(content))
        else:
            df = pd.read_excel(BytesIO(content), sheet_name=0)
    except Exception as exc:
        raise HTTPException(400, f"Could not read file: {exc}")

    if df.empty:
        raise HTTPException(400, "The file has no rows")

    df.columns = [str(c).strip() for c in df.columns]
    cid = current_user["company_id"]
    columns = {_norm_column(c): c for c in df.columns}
    missing = [
        field for field in ("sku", "name")
        if not any(_norm_column(alias) in columns for alias in PRODUCT_COLUMN_ALIASES[field])
    ]
    if missing:
        raise HTTPException(
            400,
            "No se pudieron identificar las columnas obligatorias. "
            "Incluye columnas equivalentes a SKU/codigo y nombre/producto.",
        )
    created = updated = skipped = 0
    errors = []

    for index, row in df.iterrows():
        sku = str(_pick(row, columns, "sku", "")).strip()
        name = str(_pick(row, columns, "name", "")).strip()
        if not sku or not name:
            skipped += 1
            errors.append({"row": int(index) + 2, "detail": "Missing SKU or product name"})
            continue

        category_id = None
        category_name = _pick(row, columns, "category")
        if category_name is not None:
            category_name = str(category_name).strip()
            if category_name:
                category_row = await db.execute(
                    select(Category).where(
                        Category.company_id == cid,
                        Category.name.ilike(category_name),
                    )
                )
                category = category_row.scalar_one_or_none()
                if not category:
                    category = Category(company_id=cid, name=category_name)
                    db.add(category)
                    await db.flush()
                category_id = category.id

        payload = {
            "name": name,
            "description": str(_pick(row, columns, "description", "") or ""),
            "unit_cost": _as_decimalish(_pick(row, columns, "unit_cost", 0)),
            "unit_price": _as_decimalish(_pick(row, columns, "unit_price", 0)),
            "stock": _as_int(_pick(row, columns, "stock", 0)),
            "min_stock": _as_int(_pick(row, columns, "min_stock", 0)),
            "max_stock": _as_int(_pick(row, columns, "max_stock", 0)),
            "unit": str(_pick(row, columns, "unit", "unit") or "unit").strip() or "unit",
            "category_id": category_id,
        }

        existing_row = await db.execute(
            select(Product).where(Product.company_id == cid, Product.sku == sku)
        )
        product = existing_row.scalar_one_or_none()
        if product:
            before = product.stock
            for key, value in payload.items():
                setattr(product, key, value)
            product.active = True
            if before != product.stock:
                db.add(InventoryMovement(
                    company_id=cid,
                    product_id=product.id,
                    type="adjustment",
                    quantity=product.stock,
                    stock_before=before,
                    stock_after=product.stock,
                    reason=f"Importacion desde {file.filename}",
                ))
            updated += 1
        else:
            product = Product(company_id=cid, sku=sku, active=True, **payload)
            db.add(product)
            await db.flush()
            db.add(InventoryMovement(
                company_id=cid,
                product_id=product.id,
                type="adjustment",
                quantity=product.stock,
                stock_before=0,
                stock_after=product.stock,
                reason=f"Importacion desde {file.filename}",
            ))
            created += 1

    await db.flush()
    return {
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "errors": errors[:25],
        "total_rows": len(df),
    }


@router.put("/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: UUID,
    data: ProductUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    r = await db.execute(
        select(Product).options(*_product_opts()).where(
            Product.id == product_id,
            Product.company_id == current_user["company_id"],
        )
    )
    p = r.scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Product not found")
    before = p.stock
    values = data.model_dump(exclude_unset=True)
    if "sku" in values and values["sku"] != p.sku:
        ex = await db.execute(
            select(Product).where(
                Product.company_id == current_user["company_id"],
                Product.sku == values["sku"],
                Product.id != product_id,
            )
        )
        if ex.scalar_one_or_none():
            raise HTTPException(400, "SKU already exists for this company")
    for k, v in values.items():
        setattr(p, k, v)
    if p.stock < 0:
        raise HTTPException(400, "Stock cannot be negative")
    if p.stock != before:
        db.add(InventoryMovement(
            company_id=current_user["company_id"],
            product_id=product_id,
            type="adjustment",
            quantity=p.stock,
            stock_before=before,
            stock_after=p.stock,
            reason="Actualizacion desde productos",
        ))
    await db.commit()
    result = await db.execute(
        select(Product).options(*_product_opts()).where(Product.id == product_id)
    )
    return result.scalar_one()


@router.post("/{product_id}/adjust-stock")
async def adjust_stock(
    product_id: UUID,
    data: StockAdjustRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    r = await db.execute(select(Product).where(
        Product.id == product_id,
        Product.company_id == current_user["company_id"],
    ))
    p = r.scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Product not found")
    before = p.stock
    if data.quantity < 0:
        raise HTTPException(400, "Quantity cannot be negative")
    if data.type == "in":
        p.stock += data.quantity
    elif data.type == "out":
        p.stock -= data.quantity
    elif data.type == "adjustment":
        p.stock = data.quantity
    elif data.type == "return":
        p.stock += data.quantity
    else:
        raise HTTPException(400, "Invalid type. Use: in, out, adjustment, return")
    if p.stock < 0:
        raise HTTPException(400, "Stock cannot be negative")
    mov = InventoryMovement(
        company_id=current_user["company_id"],
        product_id=product_id,
        type=data.type,
        quantity=data.quantity,
        stock_before=before,
        stock_after=p.stock,
        reason=data.reason,
    )
    db.add(mov)
    await db.commit()
    await db.refresh(p)
    return {"message": "Stock updated", "stock_before": before, "stock_after": p.stock}


@router.delete("/{product_id}")
async def delete_product(
    product_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    r = await db.execute(select(Product).where(Product.id == product_id))
    p = r.scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Product not found")
    p.active = False
    return {"message": "Product deactivated"}
