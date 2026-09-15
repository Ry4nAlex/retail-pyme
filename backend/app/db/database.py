from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_pre_ping=True,

    # Supabase Session Pooler permite 15 conexiones.
    # Dejamos margen para conexiones administrativas y otros servicios.
    pool_size=5,
    max_overflow=5,

    # Si las 10 conexiones están ocupadas, las peticiones esperan
    # una conexión libre en lugar de intentar abrir conexiones
    # ilimitadamente contra Supabase.
    pool_timeout=30,
)

AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
