from pydantic_settings import BaseSettings
from typing import List
import os


class Settings(BaseSettings):
    PROJECT_NAME: str = "RetailPyme Predictive System"
    API_V1_PREFIX: str = "/api/v1"
    DEBUG: bool = False

    DATABASE_URL: str = "postgresql+asyncpg://postgres:password@localhost:5432/retail_pyme_db"
    DATABASE_URL_SYNC: str = "postgresql://postgres:password@localhost:5432/retail_pyme_db"
    
    SECRET_KEY: str = "change-this-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    BACKEND_CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:5173"]

    # Email
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "noreply@retailpyme.com"
    SMTP_FROM_NAME: str = "RetailPyme"

    # File uploads
    UPLOAD_DIR: str = "./uploads"
    MAX_UPLOAD_SIZE_MB: int = 50

    # ML microservice (XGBoost) — corre por separado
    ML_SERVICE_URL: str = "http://127.0.0.1:8001"

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()

# Ensure upload directory exists
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs(f"{settings.UPLOAD_DIR}/datasets", exist_ok=True)
os.makedirs(f"{settings.UPLOAD_DIR}/models", exist_ok=True)
