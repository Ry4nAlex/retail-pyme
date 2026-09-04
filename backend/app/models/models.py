import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, Numeric, Integer, Text, ForeignKey, UniqueConstraint, Date, BigInteger, JSON
from sqlalchemy.dialects.postgresql import UUID, ARRAY, JSONB
from sqlalchemy.orm import relationship
from app.db.database import Base


class Company(Base):
    __tablename__ = "companies"
    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name       = Column(String(200), nullable=False)
    tax_id     = Column(String(11), unique=True, nullable=False)
    address    = Column(Text)
    phone      = Column(String(20))
    email      = Column(String(100))
    industry   = Column(String(100), default="retail")
    city       = Column(String(100), default="Lima")
    country    = Column(String(100), default="Peru")
    logo_url   = Column(Text)
    active     = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    users      = relationship("User", back_populates="company")
    products   = relationship("Product", back_populates="company")
    sales      = relationship("Sale", back_populates="company")
    categories = relationship("Category", back_populates="company")
    datasets   = relationship("DatasetUpload", back_populates="company")


class User(Base):
    __tablename__ = "users"
    id                     = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id             = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False)
    name                   = Column(String(200), nullable=False)
    email                  = Column(String(100), unique=True, nullable=False)
    password_hash          = Column(String(255), nullable=False)
    role                   = Column(String(20), default="client")
    active                 = Column(Boolean, default=True)
    email_verified         = Column(Boolean, default=False)
    password_reset_token   = Column(String(255))
    password_reset_expires = Column(DateTime)
    last_login             = Column(DateTime)
    created_at             = Column(DateTime, default=datetime.utcnow)
    updated_at             = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    company = relationship("Company", back_populates="users")


class Category(Base):
    __tablename__ = "categories"
    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id  = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False)
    name        = Column(String(100), nullable=False)
    description = Column(Text)
    active      = Column(Boolean, default=True)
    created_at  = Column(DateTime, default=datetime.utcnow)

    company  = relationship("Company", back_populates="categories")
    products = relationship("Product", back_populates="category")


class Product(Base):
    __tablename__ = "products"
    __table_args__ = (UniqueConstraint("company_id", "sku"),)

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id  = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False)
    category_id = Column(UUID(as_uuid=True), ForeignKey("categories.id"))
    sku         = Column(String(50), nullable=False)
    name        = Column(String(200), nullable=False)
    description = Column(Text)
    unit_cost   = Column(Numeric(12,2), default=0)
    unit_price  = Column(Numeric(12,2), default=0)
    stock       = Column(Integer, default=0)
    min_stock   = Column(Integer, default=0)
    max_stock   = Column(Integer, default=0)
    unit        = Column(String(30), default="unit")
    active      = Column(Boolean, default=True)
    created_at  = Column(DateTime, default=datetime.utcnow)
    updated_at  = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    company   = relationship("Company", back_populates="products")
    category  = relationship("Category", back_populates="products")
    sale_items = relationship("SaleItem", back_populates="product")
    movements  = relationship("InventoryMovement", back_populates="product")
    predictions = relationship("DemandPrediction", back_populates="product")
    restock_recs = relationship("RestockRecommendation", back_populates="product")


class Customer(Base):
    __tablename__ = "customers"
    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False)
    name       = Column(String(200), nullable=False)
    document   = Column(String(12))
    email      = Column(String(100))
    phone      = Column(String(20))
    address    = Column(Text)
    type       = Column(String(20), default="individual")
    active     = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    sales = relationship("Sale", back_populates="customer")


class Sale(Base):
    __tablename__ = "sales"
    __table_args__ = (UniqueConstraint("company_id", "sale_number"),)

    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id     = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False)
    customer_id    = Column(UUID(as_uuid=True), ForeignKey("customers.id"))
    sale_number    = Column(String(50), nullable=False)
    sale_date      = Column(DateTime, default=datetime.utcnow)
    subtotal       = Column(Numeric(12,2), default=0)
    tax            = Column(Numeric(12,2), default=0)
    total          = Column(Numeric(12,2), default=0)
    payment_method = Column(String(30), default="cash")
    status         = Column(String(20), default="completed")
    notes          = Column(Text)
    created_at     = Column(DateTime, default=datetime.utcnow)

    company  = relationship("Company", back_populates="sales")
    customer = relationship("Customer", back_populates="sales")
    items    = relationship("SaleItem", back_populates="sale", cascade="all, delete-orphan")


class SaleItem(Base):
    __tablename__ = "sale_items"
    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sale_id    = Column(UUID(as_uuid=True), ForeignKey("sales.id"), nullable=False)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=False)
    quantity   = Column(Integer, nullable=False)
    unit_price = Column(Numeric(12,2), nullable=False)
    discount   = Column(Numeric(12,2), default=0)
    subtotal   = Column(Numeric(12,2), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    sale    = relationship("Sale", back_populates="items")
    product = relationship("Product", back_populates="sale_items")


class InventoryMovement(Base):
    __tablename__ = "inventory_movements"
    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id   = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False)
    product_id   = Column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=False)
    type         = Column(String(30), nullable=False)
    quantity     = Column(Integer, nullable=False)
    stock_before = Column(Integer, nullable=False)
    stock_after  = Column(Integer, nullable=False)
    reference    = Column(String(100))
    reason       = Column(Text)
    created_at   = Column(DateTime, default=datetime.utcnow)

    product = relationship("Product", back_populates="movements")


class StockAlert(Base):
    __tablename__ = "stock_alerts"
    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"))
    type       = Column(String(50), nullable=False)
    message    = Column(Text, nullable=False)
    read       = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class DatasetUpload(Base):
    __tablename__ = "dataset_uploads"
    id            = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id    = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False)
    uploaded_by   = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    filename      = Column(String(255), nullable=False)
    original_name = Column(String(255), nullable=False)
    file_path     = Column(Text, nullable=False)
    file_size     = Column(BigInteger)
    rows_total    = Column(Integer)
    rows_valid    = Column(Integer)
    rows_invalid  = Column(Integer)
    dataset_type  = Column(String(50), nullable=False)
    status        = Column(String(30), default="pending")
    error_log     = Column(Text)
    date_from     = Column(Date)
    date_to       = Column(Date)
    created_at    = Column(DateTime, default=datetime.utcnow)
    processed_at  = Column(DateTime)

    company       = relationship("Company", back_populates="datasets")
    training_jobs = relationship("TrainingJob", back_populates="dataset")


class TrainingJob(Base):
    __tablename__ = "training_jobs"
    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id      = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False)
    dataset_id      = Column(UUID(as_uuid=True), ForeignKey("dataset_uploads.id"))
    model_type      = Column(String(50), nullable=False)
    status          = Column(String(30), default="queued")
    parameters      = Column(JSONB, default={})
    metrics         = Column(JSONB, default={})
    model_path      = Column(Text)
    feature_columns = Column(ARRAY(String))
    target_column   = Column(String(100))
    error_log       = Column(Text)
    started_at      = Column(DateTime)
    completed_at    = Column(DateTime)
    created_at      = Column(DateTime, default=datetime.utcnow)

    dataset      = relationship("DatasetUpload", back_populates="training_jobs")
    predictions  = relationship("DemandPrediction", back_populates="training_job")
    restock_recs = relationship("RestockRecommendation", back_populates="training_job")


class DemandPrediction(Base):
    __tablename__ = "demand_predictions"
    id               = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id       = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False)
    product_id       = Column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=False)
    training_job_id  = Column(UUID(as_uuid=True), ForeignKey("training_jobs.id"))
    prediction_date  = Column(Date, nullable=False)
    predicted_demand = Column(Numeric(12,2), nullable=False)
    lower_bound      = Column(Numeric(12,2))
    upper_bound      = Column(Numeric(12,2))
    confidence       = Column(Numeric(5,4))
    horizon_days     = Column(Integer, default=30)
    actual_demand    = Column(Numeric(12,2))
    created_at       = Column(DateTime, default=datetime.utcnow)

    product      = relationship("Product", back_populates="predictions")
    training_job = relationship("TrainingJob", back_populates="predictions")


class RestockRecommendation(Base):
    __tablename__ = "restock_recommendations"
    id               = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id       = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False)
    product_id       = Column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=False)
    training_job_id  = Column(UUID(as_uuid=True), ForeignKey("training_jobs.id"))
    recommended_qty  = Column(Integer, nullable=False)
    current_stock    = Column(Integer, nullable=False)
    days_of_coverage = Column(Integer)
    urgency          = Column(String(20), default="normal")
    reasoning        = Column(Text)
    acknowledged     = Column(Boolean, default=False)
    created_at       = Column(DateTime, default=datetime.utcnow)

    product      = relationship("Product", back_populates="restock_recs")
    training_job = relationship("TrainingJob", back_populates="restock_recs")


class StockAnalysis(Base):
    """Resultado de un análisis de sobre-stock generado por el microservicio XGBoost.
    Se guarda el JSON completo para poder revisarlo luego desde el frontend."""
    __tablename__ = "stock_analyses"
    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id      = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False)
    created_by      = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    dataset_id      = Column(UUID(as_uuid=True), ForeignKey("dataset_uploads.id"), nullable=True)
    source_filename = Column(String(255))
    horizon_months  = Column(Integer, default=3)
    total_products  = Column(Integer, default=0)
    overstock_count = Column(Integer, default=0)
    understock_count= Column(Integer, default=0)
    healthy_count   = Column(Integer, default=0)
    excess_value    = Column(Numeric(14, 2), default=0)
    metrics         = Column(JSONB, default={})
    result          = Column(JSONB, default={})   # análisis completo (summary, products, etc.)
    created_at      = Column(DateTime, default=datetime.utcnow)
