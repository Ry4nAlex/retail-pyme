from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from contextlib import asynccontextmanager
from app.core.config import settings
from app.api.v1.router import api_router
from app.db.database import engine, Base
from app.models import models  # noqa


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(text("""
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check'
                ) THEN
                    ALTER TABLE users DROP CONSTRAINT users_role_check;
                END IF;
                ALTER TABLE users
                    ADD CONSTRAINT users_role_check
                    CHECK (role IN ('admin', 'client', 'superadmin'));
            EXCEPTION
                WHEN duplicate_object THEN NULL;
                WHEN undefined_table THEN NULL;
            END $$;
        """))
    yield
    await engine.dispose()


app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Predictive Sales & Inventory Management System for Retail SMEs",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_V1_PREFIX)


@app.get("/", tags=["Health"])
async def root():
    return {"system": settings.PROJECT_NAME, "version": "2.0.0", "status": "operational", "docs": "/docs"}

@app.get("/health", tags=["Health"])
async def health():
    return {"status": "ok"}
