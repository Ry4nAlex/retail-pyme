from fastapi import APIRouter
from app.api.v1.endpoints.auth import router as auth_router
from app.api.v1.endpoints.products import router as products_router
from app.api.v1.endpoints.sales import router as sales_router
from app.api.v1.endpoints.ml import router as ml_router
from app.api.v1.endpoints.ingest import router as ingest_router
from app.api.v1.endpoints.misc import (
    dashboard_router, categories_router, customers_router, users_router,
    companies_router
)

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(products_router)
api_router.include_router(sales_router)
api_router.include_router(ml_router)
api_router.include_router(ingest_router)
api_router.include_router(dashboard_router)
api_router.include_router(categories_router)
api_router.include_router(customers_router)
api_router.include_router(users_router)
api_router.include_router(companies_router)
