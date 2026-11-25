
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.db.database import get_db
from app.models.models import (
    Product,
    StockAnalysis,
    ReplenishmentFollowup,
)
from app.schemas.schemas import (
    ReplenishmentCreate,
    ReplenishmentResponse,
)
from app.schemas.schemas import (
    ReplenishmentCreate,
    ReplenishmentResponse,
    ReplenishmentStatusUpdate,
)

from datetime import datetime

from app.models.models import (
    Product,
    StockAnalysis,
    InventoryMovement,
    ReplenishmentFollowup,
)

from app.schemas.schemas import (
    ReplenishmentCreate,
    ReplenishmentResponse,
    ReplenishmentStatusUpdate,
    ReplenishmentReceive,
)

router = APIRouter(
    prefix="/replenishments",
    tags=["Seguimiento de reabastecimiento"],
)


@router.get("/", response_model=list[ReplenishmentResponse])
async def list_followups(
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    if status and status not in (
        "pendiente", "pospuesto", "descartado", "recibido"
    ):
        raise HTTPException(422, "Estado no válido")

    query = select(ReplenishmentFollowup).where(
        ReplenishmentFollowup.company_id == user["company_id"]
    )

    if status:
        query = query.where(
            ReplenishmentFollowup.status == status
        )

    query = query.order_by(
        ReplenishmentFollowup.created_at.desc()
    )

    result = await db.execute(query)
    return result.scalars().all()


@router.post(
    "/",
    response_model=ReplenishmentResponse,
    status_code=201,
)
async def create_followup(
    data: ReplenishmentCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    company_id = user["company_id"]

    product = (
        await db.execute(
            select(Product).where(
                Product.id == data.product_id,
                Product.company_id == company_id,
                Product.active.is_(True),
            )
        )
    ).scalar_one_or_none()

    if not product:
        raise HTTPException(404, "Producto no encontrado")

    analysis = (
        await db.execute(
            select(StockAnalysis).where(
                StockAnalysis.id == data.analysis_id,
                StockAnalysis.company_id == company_id,
            )
        )
    ).scalar_one_or_none()

    if not analysis:
        raise HTTPException(404, "Análisis no encontrado")

    existing = (
        await db.execute(
            select(ReplenishmentFollowup).where(
                ReplenishmentFollowup.company_id == company_id,
                ReplenishmentFollowup.analysis_id == data.analysis_id,
                ReplenishmentFollowup.product_id == data.product_id,
            )
        )
    ).scalar_one_or_none()

    if existing:
        raise HTTPException(
            409,
            "Ya existe un seguimiento para este producto y análisis",
        )

    products = (analysis.result or {}).get("products", [])

    snapshot = next(
        (
            item for item in products
            if item.get("product_id") == product.sku
        ),
        None,
    )

    if not snapshot:
        raise HTTPException(
            400,
            "El producto no figura en el análisis seleccionado",
        )

    recommended_units = int(
        snapshot.get("understock_units") or 0
    )

    if recommended_units <= 0:
        raise HTTPException(
            400,
            "El análisis no recomienda reponer este producto",
        )

    followup = ReplenishmentFollowup(
        company_id=company_id,
        analysis_id=data.analysis_id,
        product_id=product.id,
        recommended_units=recommended_units,
        planned_units=data.planned_units,
        received_units=0,
        status="pendiente",
        notes=data.notes,
        created_by=user["user_id"],
    )

    db.add(followup)
    await db.flush()
    await db.refresh(followup)

    return followup


@router.get(
    "/{followup_id}",
    response_model=ReplenishmentResponse,
)
async def get_followup(
    followup_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    followup = (
        await db.execute(
            select(ReplenishmentFollowup).where(
                ReplenishmentFollowup.id == followup_id,
                ReplenishmentFollowup.company_id == user["company_id"],
            )
        )
    ).scalar_one_or_none()

    if not followup:
        raise HTTPException(404, "Seguimiento no encontrado")

    return followup


@router.patch(
    "/{followup_id}/status",
    response_model=ReplenishmentResponse,
)
async def update_followup_status(
    followup_id: UUID,
    data: ReplenishmentStatusUpdate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    followup = await db.scalar(
        select(ReplenishmentFollowup)
        .where(
            ReplenishmentFollowup.id == followup_id,
            ReplenishmentFollowup.company_id == user["company_id"],
        )
        .with_for_update()
    )

    if not followup:
        raise HTTPException(
            status_code=404,
            detail="Seguimiento no encontrado",
        )

    allowed_transitions = {
        "pendiente": {"pospuesto", "descartado"},
        "pospuesto": {"pendiente", "descartado"},
        "descartado": set(),
        "recibido": set(),
    }

    allowed = allowed_transitions.get(followup.status, set())

    if data.status not in allowed:
        raise HTTPException(
            status_code=409,
            detail="No se permite esta transición de estado",
        )

    followup.status = data.status

    if data.notes is not None:
        followup.notes = data.notes

    await db.flush()
    await db.refresh(followup)

    return followup


@router.post(
    "/{followup_id}/receive",
    response_model=ReplenishmentResponse,
)
async def confirm_replenishment_receipt(
    followup_id: UUID,
    data: ReplenishmentReceive,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    company_id = user["company_id"]

    # Bloquear el seguimiento durante la recepción.
    followup = await db.scalar(
        select(ReplenishmentFollowup)
        .where(
            ReplenishmentFollowup.id == followup_id,
            ReplenishmentFollowup.company_id == company_id,
        )
        .with_for_update()
    )

    if not followup:
        raise HTTPException(
            status_code=404,
            detail="Seguimiento no encontrado",
        )

    # Impedir recepciones duplicadas o no autorizadas
    # por el estado del seguimiento.
    if followup.status != "pendiente":
        raise HTTPException(
            status_code=409,
            detail="Solo se pueden recibir reposiciones pendientes",
        )

    if followup.received_units != 0:
        raise HTTPException(
            status_code=409,
            detail="Este seguimiento ya registra unidades recibidas",
        )

    if data.received_units != followup.planned_units:
        raise HTTPException(
            status_code=422,
            detail=(
                "La cantidad recibida debe coincidir con "
                "la cantidad planificada"
            ),
        )

    # Bloquear el producto para evitar actualizaciones
    # simultáneas sobre su stock.
    product = await db.scalar(
        select(Product)
        .where(
            Product.id == followup.product_id,
            Product.company_id == company_id,
            Product.active.is_(True),
        )
        .with_for_update()
    )

    if not product:
        raise HTTPException(
            status_code=404,
            detail="Producto no encontrado o inactivo",
        )

    stock_before = product.stock

    if stock_before is None or stock_before < 0:
        raise HTTPException(
            status_code=409,
            detail="El producto tiene un stock inválido",
        )

    stock_after = stock_before + data.received_units

    # Actualizar las existencias.
    product.stock = stock_after
    product.updated_at = datetime.utcnow()

    # Registrar el movimiento de inventario.
    movement = InventoryMovement(
        company_id=company_id,
        product_id=product.id,
        type="in",
        quantity=data.received_units,
        stock_before=stock_before,
        stock_after=stock_after,
        reference=f"REPL-{followup.id}",
        reason="Recepción confirmada de reabastecimiento",
    )

    db.add(movement)

    # Actualizar el seguimiento.
    followup.received_units = data.received_units
    followup.status = "recibido"
    followup.confirmed_by = user["user_id"]
    followup.received_at = datetime.utcnow()
    followup.updated_at = datetime.utcnow()

    if data.notes is not None:
        followup.notes = data.notes

    # Los cambios se confirman conjuntamente
    # mediante la transacción de get_db.
    await db.flush()
    await db.refresh(followup)

    return followup
