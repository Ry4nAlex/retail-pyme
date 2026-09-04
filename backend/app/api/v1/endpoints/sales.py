from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import Optional
from uuid import UUID
from datetime import datetime, date
from decimal import Decimal
from app.db.database import get_db
from app.models.models import Sale, SaleItem, Product, InventoryMovement
from app.schemas.schemas import SaleCreate, SaleResponse
from app.core.security import get_current_user

router = APIRouter(prefix="/sales", tags=["Sales"])
TAX_RATE = Decimal("0.18")


async def _gen_sale_number(db: AsyncSession, company_id: str) -> str:
    r = await db.execute(select(func.count(Sale.id)).where(Sale.company_id == company_id))
    n = r.scalar() + 1
    return f"S-{datetime.now().year}{datetime.now().month:02d}-{n:05d}"


def _sale_opts():
    return [
        selectinload(Sale.items).selectinload(SaleItem.product).selectinload(Product.category),
        selectinload(Sale.customer),
    ]


@router.get("/")
async def list_sales(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    cid = current_user["company_id"]
    q = select(Sale).options(*_sale_opts()).where(Sale.company_id == cid)
    if date_from:
        q = q.where(Sale.sale_date >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        q = q.where(Sale.sale_date <= datetime.combine(date_to, datetime.max.time()))
    if status:
        q = q.where(Sale.status == status)
    q = q.order_by(Sale.sale_date.desc())
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar()
    result = await db.execute(q.offset((page - 1) * size).limit(size))
    return {
        "items": [SaleResponse.model_validate(s) for s in result.scalars().all()],
        "total": total, "page": page, "size": size,
        "pages": (total + size - 1) // size,
    }


@router.post("/", response_model=SaleResponse, status_code=201)
async def create_sale(data: SaleCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    cid = current_user["company_id"]
    sale_number = await _gen_sale_number(db, cid)
    subtotal = Decimal("0")
    items_to_add = []

    for item in data.items:
        r = await db.execute(select(Product).where(Product.id == item.product_id, Product.active == True))
        product = r.scalar_one_or_none()
        if not product:
            raise HTTPException(404, f"Product {item.product_id} not found")
        if product.stock < item.quantity:
            raise HTTPException(400, f"Insufficient stock for '{product.name}'. Available: {product.stock}")
        sub = (item.unit_price * item.quantity) - item.discount
        subtotal += sub
        before = product.stock
        product.stock -= item.quantity
        db.add(InventoryMovement(
            company_id=cid, product_id=item.product_id,
            type="out", quantity=item.quantity,
            stock_before=before, stock_after=product.stock,
            reference=sale_number, reason="Sale",
        ))
        items_to_add.append(SaleItem(
            product_id=item.product_id, quantity=item.quantity,
            unit_price=item.unit_price, discount=item.discount, subtotal=sub,
        ))

    tax = subtotal * TAX_RATE
    sale = Sale(
        company_id=cid, customer_id=data.customer_id,
        sale_number=sale_number, payment_method=data.payment_method,
        notes=data.notes, subtotal=subtotal, tax=tax, total=subtotal + tax,
    )
    db.add(sale)
    await db.flush()
    for it in items_to_add:
        it.sale_id = sale.id
        db.add(it)
    await db.flush()

    # Reload with relationships
    result = await db.execute(
        select(Sale).options(*_sale_opts()).where(Sale.id == sale.id)
    )
    return result.scalar_one()


@router.patch("/{sale_id}/cancel")
async def cancel_sale(sale_id: UUID, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    r = await db.execute(select(Sale).where(Sale.id == sale_id))
    sale = r.scalar_one_or_none()
    if not sale:
        raise HTTPException(404, "Sale not found")
    if sale.status == "cancelled":
        raise HTTPException(400, "Sale is already cancelled")
    items_r = await db.execute(select(SaleItem).where(SaleItem.sale_id == sale_id))
    for item in items_r.scalars().all():
        pr = await db.execute(select(Product).where(Product.id == item.product_id))
        prod = pr.scalar_one()
        before = prod.stock
        prod.stock += item.quantity
        db.add(InventoryMovement(
            company_id=current_user["company_id"], product_id=item.product_id,
            type="return", quantity=item.quantity,
            stock_before=before, stock_after=prod.stock,
            reference=sale.sale_number, reason="Sale cancellation",
        ))
    sale.status = "cancelled"
    return {"message": "Sale cancelled and stock restored"}