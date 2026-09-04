from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional, List, Any
from datetime import datetime, date
from uuid import UUID
from decimal import Decimal


# ─── AUTH ───
class LoginRequest(BaseModel):
    email: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

class BootstrapSuperAdminRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    company_name: str = "RetailPyme Central"
    company_tax_id: str = "00000000000"


# ─── COMPANY ───
class CompanyBase(BaseModel):
    name: str
    tax_id: str
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    industry: str = "retail"
    city: str = "Lima"
    country: str = "Peru"

    @field_validator("tax_id")
    @classmethod
    def validate_tax_id(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized.isdigit() or len(normalized) != 11:
            raise ValueError("El RUC debe tener exactamente 11 digitos")
        return normalized

class CompanyCreate(CompanyBase):
    pass

class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    tax_id: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    industry: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    active: Optional[bool] = None

    @field_validator("tax_id")
    @classmethod
    def validate_tax_id(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        normalized = value.strip()
        if not normalized.isdigit() or len(normalized) != 11:
            raise ValueError("El RUC debe tener exactamente 11 digitos")
        return normalized

class CompanyResponse(CompanyBase):
    id: UUID
    logo_url: Optional[str] = None
    active: bool
    created_at: datetime
    class Config:
        from_attributes = True


# ─── USER ───
class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    role: str = "client"
    company_id: UUID

class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    active: Optional[bool] = None
    company_id: Optional[UUID] = None

class UserResponse(BaseModel):
    id: UUID
    company_id: UUID
    name: str
    email: str
    role: str
    active: bool
    email_verified: bool
    last_login: Optional[datetime] = None
    created_at: datetime
    class Config:
        from_attributes = True


# ─── CATEGORY ───
class CategoryCreate(BaseModel):
    name: str
    description: Optional[str] = None

class CategoryResponse(BaseModel):
    id: UUID
    company_id: UUID
    name: str
    description: Optional[str] = None
    active: bool
    created_at: datetime
    class Config:
        from_attributes = True


# ─── PRODUCT ───
class ProductCreate(BaseModel):
    sku: str
    name: str
    description: Optional[str] = None
    unit_cost: Decimal = Decimal("0")
    unit_price: Decimal = Decimal("0")
    stock: int = 0
    min_stock: int = 0
    max_stock: int = 0
    unit: str = "unit"
    category_id: Optional[UUID] = None

class ProductUpdate(BaseModel):
    sku: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    unit_cost: Optional[Decimal] = None
    unit_price: Optional[Decimal] = None
    stock: Optional[int] = None
    min_stock: Optional[int] = None
    max_stock: Optional[int] = None
    unit: Optional[str] = None
    category_id: Optional[UUID] = None
    active: Optional[bool] = None

class ProductResponse(ProductCreate):
    id: UUID
    company_id: UUID
    active: bool
    created_at: datetime
    updated_at: datetime
    category: Optional[CategoryResponse] = None
    class Config:
        from_attributes = True


# ─── CUSTOMER ───
class CustomerCreate(BaseModel):
    name: str
    document: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    type: str = "individual"

class CustomerResponse(CustomerCreate):
    id: UUID
    company_id: UUID
    active: bool
    created_at: datetime
    class Config:
        from_attributes = True


# ─── SALES ───
class SaleItemCreate(BaseModel):
    product_id: UUID
    quantity: int
    unit_price: Decimal
    discount: Decimal = Decimal("0")

class SaleCreate(BaseModel):
    customer_id: Optional[UUID] = None
    payment_method: str = "cash"
    notes: Optional[str] = None
    items: List[SaleItemCreate]

class SaleItemResponse(BaseModel):
    id: UUID
    product_id: UUID
    quantity: int
    unit_price: Decimal
    discount: Decimal
    subtotal: Decimal
    product: Optional[ProductResponse] = None
    class Config:
        from_attributes = True

class SaleResponse(BaseModel):
    id: UUID
    company_id: UUID
    customer_id: Optional[UUID]
    sale_number: str
    sale_date: datetime
    subtotal: Decimal
    tax: Decimal
    total: Decimal
    payment_method: str
    status: str
    notes: Optional[str]
    items: List[SaleItemResponse] = []
    customer: Optional[CustomerResponse] = None
    class Config:
        from_attributes = True


# ─── INVENTORY ───
class StockAdjustRequest(BaseModel):
    product_id: UUID
    quantity: int
    type: str
    reason: Optional[str] = None

class MovementResponse(BaseModel):
    id: UUID
    product_id: UUID
    type: str
    quantity: int
    stock_before: int
    stock_after: int
    reference: Optional[str]
    reason: Optional[str]
    created_at: datetime
    class Config:
        from_attributes = True


# ─── ML: DATASET ───
class DatasetUploadResponse(BaseModel):
    id: UUID
    company_id: UUID
    filename: str
    original_name: str
    file_size: Optional[int]
    rows_total: Optional[int]
    rows_valid: Optional[int]
    rows_invalid: Optional[int]
    dataset_type: str
    status: str
    error_log: Optional[str]
    date_from: Optional[date]
    date_to: Optional[date]
    created_at: datetime
    processed_at: Optional[datetime]
    class Config:
        from_attributes = True


# ─── ML: TRAINING JOB ───
class TrainingJobCreate(BaseModel):
    dataset_id: UUID
    model_type: str = "xgboost"
    parameters: dict = {}

class TrainingJobResponse(BaseModel):
    id: UUID
    company_id: UUID
    dataset_id: Optional[UUID]
    model_type: str
    status: str
    parameters: Optional[dict]
    metrics: Optional[dict]
    error_log: Optional[str]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    created_at: datetime
    class Config:
        from_attributes = True


# ─── ML: PREDICTIONS ───
class PredictionResponse(BaseModel):
    id: UUID
    product_id: UUID
    prediction_date: date
    predicted_demand: Decimal
    lower_bound: Optional[Decimal]
    upper_bound: Optional[Decimal]
    confidence: Optional[Decimal]
    actual_demand: Optional[Decimal]
    class Config:
        from_attributes = True


# ─── ML: RESTOCK ───
class RestockResponse(BaseModel):
    id: UUID
    product_id: UUID
    recommended_qty: int
    current_stock: int
    days_of_coverage: Optional[int]
    urgency: str
    reasoning: Optional[str]
    acknowledged: bool
    created_at: datetime
    product: Optional[ProductResponse] = None
    class Config:
        from_attributes = True


# ─── DASHBOARD ───
class DashboardKPIs(BaseModel):
    total_sales_today: float
    total_sales_month: float
    sales_count_today: int
    sales_count_month: int
    products_low_stock: int
    products_out_of_stock: int
    top_products: List[dict]
    sales_last_7_days: List[dict]
    sales_by_category: List[dict]
    pending_restock: int


# ─── GENERIC ───
class PaginatedResponse(BaseModel):
    items: List[Any]
    total: int
    page: int
    size: int
    pages: int

class MessageResponse(BaseModel):
    message: str


# ─── ML: ANÁLISIS DE SOBRE-STOCK ───
class StockAnalysisResponse(BaseModel):
    id: UUID
    company_id: UUID
    dataset_id: Optional[UUID] = None
    source_filename: Optional[str] = None
    horizon_months: Optional[int] = None
    total_products: Optional[int] = None
    overstock_count: Optional[int] = None
    understock_count: Optional[int] = None
    healthy_count: Optional[int] = None
    excess_value: Optional[Decimal] = None
    metrics: Optional[dict] = None
    result: Optional[dict] = None
    created_at: datetime
    class Config:
        from_attributes = True


class StockAnalysisListItem(BaseModel):
    id: UUID
    source_filename: Optional[str] = None
    horizon_months: Optional[int] = None
    total_products: Optional[int] = None
    overstock_count: Optional[int] = None
    understock_count: Optional[int] = None
    healthy_count: Optional[int] = None
    excess_value: Optional[Decimal] = None
    metrics: Optional[dict] = None
    created_at: datetime
    class Config:
        from_attributes = True
