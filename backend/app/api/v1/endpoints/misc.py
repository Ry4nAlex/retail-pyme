from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from typing import Optional
from uuid import UUID
from datetime import datetime, date, timedelta
from app.db.database import get_db
from app.models.models import (
    Sale, SaleItem, Product, Category, Customer, User, Company,
    InventoryMovement, RestockRecommendation
)
from app.schemas.schemas import (
    CategoryCreate, CategoryResponse, CustomerCreate, CustomerResponse,
    UserCreate, UserUpdate, UserResponse, CompanyCreate, CompanyUpdate,
    CompanyResponse
)
from app.core.security import get_current_user, require_admin, require_superadmin, hash_password

# ─── Dashboard ───
dashboard_router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

@dashboard_router.get("/kpis")
async def get_kpis(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    if current_user["role"] == "superadmin":
        companies_total = (await db.execute(select(func.count(Company.id)))).scalar() or 0
        companies_active = (await db.execute(select(func.count(Company.id)).where(Company.active == True))).scalar() or 0
        users_total = (await db.execute(select(func.count(User.id)))).scalar() or 0
        users_active = (await db.execute(select(func.count(User.id)).where(User.active == True))).scalar() or 0
        users_with_login = (await db.execute(select(func.count(User.id)).where(User.last_login.is_not(None)))).scalar() or 0
        admins = (await db.execute(select(func.count(User.id)).where(User.role == "admin", User.active == True))).scalar() or 0
        employees = (await db.execute(select(func.count(User.id)).where(User.role == "client", User.active == True))).scalar() or 0
        superadmins = (await db.execute(select(func.count(User.id)).where(User.role == "superadmin", User.active == True))).scalar() or 0
        recent_users = await db.execute(
            select(User.name, User.email, User.role, User.last_login, Company.name.label("company_name"))
            .join(Company, Company.id == User.company_id)
            .order_by(User.created_at.desc())
            .limit(6)
        )
        return {
            "system_scope": True,
            "companies_total": companies_total,
            "companies_active": companies_active,
            "users_total": users_total,
            "users_active": users_active,
            "users_with_login": users_with_login,
            "users_by_role": [
                {"role": "SuperAdmin", "total": superadmins},
                {"role": "Administradores", "total": admins},
                {"role": "Empleados", "total": employees},
            ],
            "recent_users": [
                {
                    "name": row.name,
                    "email": row.email,
                    "role": row.role,
                    "last_login": row.last_login,
                    "company": row.company_name,
                }
                for row in recent_users.all()
            ],
        }

    cid = current_user["company_id"]
    today = date.today()
    start_today = datetime.combine(today, datetime.min.time())
    start_month = datetime.combine(today.replace(day=1), datetime.min.time())

    r = await db.execute(select(func.sum(Sale.total), func.count(Sale.id)).where(
        Sale.company_id == cid, Sale.status == "completed", Sale.sale_date >= start_today))
    total_today, count_today = r.one()

    r2 = await db.execute(select(func.sum(Sale.total), func.count(Sale.id)).where(
        Sale.company_id == cid, Sale.status == "completed", Sale.sale_date >= start_month))
    total_month, count_month = r2.one()

    r3 = await db.execute(select(func.count(Product.id)).where(
        Product.company_id == cid, Product.active == True,
        Product.stock <= Product.min_stock, Product.stock > 0))
    low_stock = r3.scalar()

    r4 = await db.execute(select(func.count(Product.id)).where(
        Product.company_id == cid, Product.active == True, Product.stock == 0))
    out_of_stock = r4.scalar()

    r5 = await db.execute(
        select(Product.name, func.sum(SaleItem.quantity).label("qty"))
        .join(SaleItem, SaleItem.product_id == Product.id)
        .join(Sale, Sale.id == SaleItem.sale_id)
        .where(Sale.company_id == cid, Sale.status == "completed", Sale.sale_date >= start_month)
        .group_by(Product.name).order_by(func.sum(SaleItem.quantity).desc()).limit(5))
    top_products = [{"name": row[0], "quantity": row[1]} for row in r5.all()]

    sales_days = []
    for i in range(6, -1, -1):
        d = today - timedelta(days=i)
        start = datetime.combine(d, datetime.min.time())
        end = datetime.combine(d, datetime.max.time())
        rd = await db.execute(select(func.sum(Sale.total)).where(
            Sale.company_id == cid, Sale.status == "completed",
            Sale.sale_date >= start, Sale.sale_date <= end))
        sales_days.append({"date": d.strftime("%b %d"), "total": float(rd.scalar() or 0)})

    r6 = await db.execute(
        select(Category.name, func.sum(SaleItem.subtotal).label("total"))
        .join(Product, Product.category_id == Category.id)
        .join(SaleItem, SaleItem.product_id == Product.id)
        .join(Sale, Sale.id == SaleItem.sale_id)
        .where(Sale.company_id == cid, Sale.status == "completed", Sale.sale_date >= start_month)
        .group_by(Category.name).order_by(func.sum(SaleItem.subtotal).desc()))
    by_category = [{"category": row[0], "total": float(row[1])} for row in r6.all()]

    r7 = await db.execute(select(func.count(RestockRecommendation.id)).where(
        RestockRecommendation.company_id == cid, RestockRecommendation.acknowledged == False))
    pending_restock = r7.scalar()

    return {
        "total_sales_today": float(total_today or 0),
        "total_sales_month": float(total_month or 0),
        "sales_count_today": count_today or 0,
        "sales_count_month": count_month or 0,
        "products_low_stock": low_stock or 0,
        "products_out_of_stock": out_of_stock or 0,
        "top_products": top_products,
        "sales_last_7_days": sales_days,
        "sales_by_category": by_category,
        "pending_restock": pending_restock or 0,
    }

@dashboard_router.get("/alerts")
async def get_alerts(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    if current_user["role"] == "superadmin":
        return {"alerts": [], "total": 0}

    cid = current_user["company_id"]
    r = await db.execute(select(Product).where(
        Product.company_id == cid, Product.active == True, Product.stock <= Product.min_stock))
    alerts = []
    for p in r.scalars().all():
        alerts.append({
            "type": "out_of_stock" if p.stock == 0 else "low_stock",
            "product": p.name, "sku": p.sku,
            "stock": p.stock, "min_stock": p.min_stock,
        })
    return {"alerts": alerts, "total": len(alerts)}


# ─── Categories ───
categories_router = APIRouter(prefix="/categories", tags=["Categories"])

@categories_router.get("/", response_model=list[CategoryResponse])
async def list_categories(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    r = await db.execute(select(Category).where(Category.company_id == current_user["company_id"], Category.active == True))
    return r.scalars().all()

@categories_router.post("/", response_model=CategoryResponse, status_code=201)
async def create_category(data: CategoryCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    c = Category(company_id=current_user["company_id"], **data.model_dump())
    db.add(c)
    await db.flush()
    await db.refresh(c)
    return c

@categories_router.delete("/{cat_id}")
async def delete_category(cat_id: UUID, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    r = await db.execute(select(Category).where(Category.id == cat_id))
    c = r.scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Category not found")
    c.active = False
    return {"message": "Category removed"}


# ─── Customers ───
customers_router = APIRouter(prefix="/customers", tags=["Customers"])

@customers_router.get("/")
async def list_customers(
    page: int = Query(1, ge=1), size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user),
):
    q = select(Customer).where(Customer.company_id == current_user["company_id"], Customer.active == True)
    if search:
        q = q.where(or_(Customer.name.ilike(f"%{search}%"), Customer.document.ilike(f"%{search}%")))
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar()
    r = await db.execute(q.offset((page - 1) * size).limit(size))
    return {"items": [CustomerResponse.model_validate(c) for c in r.scalars().all()], "total": total, "page": page, "size": size}

@customers_router.post("/", response_model=CustomerResponse, status_code=201)
async def create_customer(data: CustomerCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    c = Customer(company_id=current_user["company_id"], **data.model_dump())
    db.add(c)
    await db.flush()
    await db.refresh(c)
    return c

@customers_router.put("/{cust_id}", response_model=CustomerResponse)
async def update_customer(cust_id: UUID, data: CustomerCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    r = await db.execute(select(Customer).where(Customer.id == cust_id))
    c = r.scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Customer not found")
    for k, v in data.model_dump().items():
        setattr(c, k, v)
    await db.flush()
    await db.refresh(c)
    return c

@customers_router.delete("/{cust_id}")
async def delete_customer(cust_id: UUID, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    r = await db.execute(select(Customer).where(Customer.id == cust_id))
    c = r.scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Customer not found")
    c.active = False
    return {"message": "Customer removed"}


# ─── Users (Admin only) ───
users_router = APIRouter(prefix="/users", tags=["Users"])


def _validate_user_role(role: str):
    if role not in ("admin", "client", "superadmin"):
        raise HTTPException(400, "Invalid role")


def _assert_can_manage_user(current_user: dict, target: User):
    if current_user["role"] == "superadmin":
        return
    if str(target.company_id) != str(current_user["company_id"]):
        raise HTTPException(403, "Cannot manage users from another company")
    if target.role == "superadmin":
        raise HTTPException(403, "Cannot manage a super administrator")


@users_router.get("/", response_model=list[UserResponse])
async def list_users(db: AsyncSession = Depends(get_db), current_user: dict = Depends(require_admin)):
    q = select(User).order_by(User.created_at.desc())
    if current_user["role"] != "superadmin":
        q = q.where(User.company_id == current_user["company_id"])
    r = await db.execute(q)
    return r.scalars().all()


@users_router.post("/", response_model=UserResponse, status_code=201)
async def create_user(data: UserCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(require_admin)):
    _validate_user_role(data.role)
    if len(data.password) < 8:
        raise HTTPException(400, "La contraseña debe contener minimo 8 caracteres")
    if current_user["role"] != "superadmin":
        if str(data.company_id) != str(current_user["company_id"]):
            raise HTTPException(403, "No se pueden crear usuarios para otra empresa")
        if data.role == "superadmin":
            raise HTTPException(403, "Solo super administradores pueden crear este rol")
    ex = await db.execute(select(User).where(User.email == data.email))
    if ex.scalar_one_or_none():
        raise HTTPException(400, "El correo ya esta registrado")
    company = await db.execute(select(Company).where(Company.id == data.company_id, Company.active == True))
    if not company.scalar_one_or_none():
        raise HTTPException(404, "Empresa no encontrada")
    u = User(
        company_id=data.company_id,
        name=data.name, email=data.email,
        password_hash=hash_password(data.password),
        role=data.role,
    )
    db.add(u)
    await db.flush()
    await db.refresh(u)
    return u


@users_router.put("/{user_id}", response_model=UserResponse)
async def update_user(user_id: UUID, data: UserUpdate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(require_admin)):
    r = await db.execute(select(User).where(User.id == user_id))
    u = r.scalar_one_or_none()
    if not u:
        raise HTTPException(404, "User not found")
    _assert_can_manage_user(current_user, u)
    values = data.model_dump(exclude_none=True)
    if "role" in values:
        _validate_user_role(values["role"])
        if values["role"] == "superadmin" and current_user["role"] != "superadmin":
            raise HTTPException(403, "Solo super administradores pueden crear este rol")
    if "company_id" in values:
        if current_user["role"] != "superadmin":
            raise HTTPException(403, "Solo super administradores pueden mover usuarios entre empresas")
        company = await db.execute(select(Company).where(Company.id == values["company_id"], Company.active == True))
        if not company.scalar_one_or_none():
            raise HTTPException(404, "Empresa no encontrada")
    if "email" in values and values["email"] != u.email:
        ex = await db.execute(select(User).where(User.email == values["email"]))
        if ex.scalar_one_or_none():
            raise HTTPException(400, "El correo ya esta registrado")
    for k, v in values.items():
        if k == "password":
            if len(v) < 8:
                raise HTTPException(400, "La contraseña debe tener minimo 8 caracteres")
            u.password_hash = hash_password(v)
        else:
            setattr(u, k, v)
    await db.flush()
    await db.refresh(u)
    return u


@users_router.delete("/{user_id}")
async def delete_user(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_admin)
):
    r = await db.execute(
        select(User).where(User.id == user_id)
    )

    u = r.scalar_one_or_none()

    if not u:
        raise HTTPException(
            status_code=404,
            detail="Usuario no encontrado"
        )

    _assert_can_manage_user(current_user, u)

    if str(u.id) == str(current_user["user_id"]):
        raise HTTPException(
            status_code=400,
            detail="No puedes eliminar tu propio usuario"
        )

    await db.delete(u)
    await db.flush()

    return {
        "message": "Usuario eliminado correctamente"
    }


companies_router = APIRouter(prefix="/companies", tags=["Companies"])


@companies_router.get("/", response_model=list[CompanyResponse])
async def list_companies(include_inactive: bool = False, db: AsyncSession = Depends(get_db), current_user: dict = Depends(require_superadmin)):
    q = select(Company).order_by(Company.created_at.desc())
    if not include_inactive:
        q = q.where(Company.active == True)
    r = await db.execute(q)
    return r.scalars().all()


@companies_router.post("/", response_model=CompanyResponse, status_code=201)
async def create_company(data: CompanyCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(require_superadmin)):
    ex = await db.execute(select(Company).where(Company.tax_id == data.tax_id))
    if ex.scalar_one_or_none():
        raise HTTPException(400, "Tax ID already registered")
    c = Company(**data.model_dump())
    db.add(c)
    await db.flush()
    await db.refresh(c)
    return c


@companies_router.put("/{company_id}", response_model=CompanyResponse)
async def update_company(company_id: UUID, data: CompanyUpdate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(require_superadmin)):
    r = await db.execute(select(Company).where(Company.id == company_id))
    c = r.scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Company not found")
    values = data.model_dump(exclude_none=True)
    if "tax_id" in values:
        ex = await db.execute(select(Company).where(Company.tax_id == values["tax_id"], Company.id != company_id))
        if ex.scalar_one_or_none():
            raise HTTPException(400, "Tax ID already registered")
    for k, v in values.items():
        setattr(c, k, v)
    await db.flush()
    await db.refresh(c)
    return c


@companies_router.delete("/{company_id}")
async def delete_company(company_id: UUID, db: AsyncSession = Depends(get_db), current_user: dict = Depends(require_superadmin)):
    r = await db.execute(select(Company).where(Company.id == company_id))
    c = r.scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Company not found")
    c.active = False
    return {"message": "Company deactivated"}
