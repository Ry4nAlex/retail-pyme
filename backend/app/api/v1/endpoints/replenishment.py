
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.db.database import get_db

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

from app.services.replenishment_tracking_agent import (
    get_replenishment_tracking_agent,
)

from typing import Literal

def calculate_stock_rule(product: Product) -> dict:
    """Regla del catálogo para cualquier producto; no sustituye un pronóstico XGBoost."""
    current = int(product.stock or 0)
    minimum = int(product.min_stock or 0)
    maximum = int(product.max_stock or 0)
    if current < 0 or minimum < 0 or maximum < 0:
        raise HTTPException(422, "El stock o los límites del producto son inválidos")
    if maximum < minimum:
        raise HTTPException(422, "El stock máximo no puede ser menor que el mínimo")
    target = maximum if maximum > 0 else minimum
    recommended = max(0, target - current) if current < minimum else 0
    return {
        "product_id": str(product.id),
        "sku": product.sku,
        "product_name": product.name,
        "current_stock": current,
        "min_stock": minimum,
        "max_stock": maximum,
        "target_stock": target,
        "recommended_units": recommended,
        "method": "regla_stock_catalogo",
        "uses_xgboost": False,
        "explanation": (
            "El stock está por debajo del mínimo; se sugiere reponer hasta "
            "el máximo configurado. Esto NO es una predicción de XGBoost."
            if recommended > 0
            else "El stock no está por debajo del mínimo; no se propone reposición."
        ),
    }


router = APIRouter(
    prefix="/replenishments",
    tags=["Seguimiento de reabastecimiento"],
)



class ReplenishmentListResponse(ReplenishmentResponse):
    product_name: str
    product_sku: str


@router.get("/", response_model=list[ReplenishmentListResponse])
async def list_followups(
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    if status and status not in (
        "pendiente", "pospuesto", "descartado", "recibido"
    ):
        raise HTTPException(422, "Estado no válido")

    query = (
        select(ReplenishmentFollowup, Product)
        .join(
            Product,
            Product.id == ReplenishmentFollowup.product_id,
        )
        .where(
            ReplenishmentFollowup.company_id == user["company_id"],
            Product.company_id == user["company_id"],
        )
    )

    if status:
        query = query.where(
            ReplenishmentFollowup.status == status
        )

    query = query.order_by(
        ReplenishmentFollowup.created_at.desc()
    )

    result = await db.execute(query)

    followups = []

    for followup, product in result.all():
        data = ReplenishmentResponse.model_validate(
            followup,
            from_attributes=True,
        ).model_dump()

        data["product_name"] = product.name
        data["product_sku"] = product.sku

        followups.append(data)

    return followups



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


# Chat del Agente 2: Seguimiento de reabastecimiento

class ReplenishmentChatRequest(BaseModel):
    message: str = Field(
        ...,
        min_length=1,
        max_length=1000,
    )


@router.post("/chat")
async def chat_with_tracking_agent(
    request: ReplenishmentChatRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    agent = get_replenishment_tracking_agent()

    try:
        return await agent.chat(
            message=request.message,
            db=db,
            company_id=user["company_id"],
        )

    except RuntimeError as exc:
        raise HTTPException(
            status_code=503,
            detail=str(exc),
        )

    except Exception:
        raise HTTPException(
            status_code=502,
            detail="No se pudo completar la consulta con Gemini.",
        )


class ReplenishmentActionPreviewRequest(BaseModel):
    followup_id: UUID
    message: str = Field(
        min_length=1,
        max_length=1000,
    )


@router.post("/action-preview")
async def preview_tracking_action(
    request: ReplenishmentActionPreviewRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    agent = get_replenishment_tracking_agent()

    try:
        return await agent.prepare_status_action(
            message=request.message,
            followup_id=request.followup_id,
            db=db,
            company_id=user["company_id"],
        )

    except RuntimeError:
        raise HTTPException(
            status_code=502,
            detail="No se pudo interpretar la acción con Gemini.",
        )

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="No se pudo preparar la acción.",
        )


# Confirmar una acción propuesta por el agente 2

class ReplenishmentActionConfirmRequest(BaseModel):
    followup_id: UUID
    expected_status: Literal[
        "pendiente", "pospuesto", "descartado", "recibido"
    ]
    proposed_status: Literal[
        "pendiente", "pospuesto", "descartado"
    ]
    confirmed: Literal[True]
    notes: Optional[str] = Field(
        default=None,
        max_length=500,
    )


@router.post(
    "/action-confirm",
    response_model=ReplenishmentResponse,
)
async def confirm_tracking_action(
    request: ReplenishmentActionConfirmRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    # Bloquear el seguimiento para evitar
    # modificaciones simultáneas.
    followup = await db.scalar(
        select(ReplenishmentFollowup)
        .where(
            ReplenishmentFollowup.id == request.followup_id,
            ReplenishmentFollowup.company_id == user["company_id"],
        )
        .with_for_update()
    )

    if followup is None:
        raise HTTPException(
            status_code=404,
            detail="Seguimiento no encontrado",
        )

    # Evitar ejecutar propuestas antiguas.
    if followup.status != request.expected_status:
        raise HTTPException(
            status_code=409,
            detail=(
                "El estado del seguimiento ha cambiado. "
                "Debes generar una nueva propuesta."
            ),
        )

    allowed_transitions = {
        "pendiente": {"pospuesto", "descartado"},
        "pospuesto": {"pendiente", "descartado"},
        "descartado": set(),
        "recibido": set(),
    }

    allowed = allowed_transitions.get(
        followup.status, set()
    )

    if request.proposed_status not in allowed:
        raise HTTPException(
            status_code=409,
            detail="Transición de estado no permitida",
        )

    # Ejecutar únicamente la acción confirmada.
    followup.status = request.proposed_status

    if request.notes is not None:
        followup.notes = request.notes

    followup.updated_at = datetime.utcnow()

    await db.flush()
    await db.refresh(followup)

    return followup


# Flujo general: consultar cualquier producto y registrar seguimiento desde React.
class StockRuleFollowupCreate(BaseModel):
    product_id: UUID
    planned_units: int = Field(gt=0, le=1000000)
    notes: Optional[str] = Field(default=None, max_length=500)


@router.get("/product-recommendation/{product_id}")
async def get_product_stock_rule(
    product_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    product = await db.scalar(
        select(Product).where(
            Product.id == product_id,
            Product.company_id == user["company_id"],
            Product.active.is_(True),
        )
    )
    if not product:
        raise HTTPException(404, "Producto no encontrado")
    return calculate_stock_rule(product)


@router.post("/from-stock-rule", response_model=ReplenishmentResponse, status_code=201)
async def create_followup_from_stock_rule(
    data: StockRuleFollowupCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    company_id = user["company_id"]
    product = await db.scalar(
        select(Product)
        .where(
            Product.id == data.product_id,
            Product.company_id == company_id,
            Product.active.is_(True),
        )
        .with_for_update()
    )
    if product is None:
        raise HTTPException(404, "Producto no encontrado")

    recommendation = calculate_stock_rule(product)
    if recommendation["recommended_units"] <= 0:
        raise HTTPException(409, "El producto ya no requiere reposición por la regla de stock")

    # Evita crear varios seguimientos abiertos para el mismo producto.
    existing = await db.scalar(
        select(ReplenishmentFollowup.id).where(
            ReplenishmentFollowup.company_id == company_id,
            ReplenishmentFollowup.product_id == product.id,
            ReplenishmentFollowup.status.in_(["pendiente", "pospuesto"]),
        )
    )
    if existing is not None:
        raise HTTPException(409, "Ya existe una reposición abierta para este producto")

    # La FK analysis_id es obligatoria: registramos una instantánea explícita
    # de la regla de stock. NO es un análisis generado por XGBoost.
    rule_analysis = StockAnalysis(
        company_id=company_id,
        created_by=user["user_id"],
        dataset_id=None,
        source_filename=f"REGLA_STOCK_SIN_XGBOOST_{product.sku}",
        horizon_months=0,
        total_products=1,
        understock_count=1,
        overstock_count=0,
        healthy_count=0,
        excess_value=0,
        metrics={"source": "stock_rule", "uses_xgboost": False},
        result={
            "source": "stock_rule",
            "uses_xgboost": False,
            "summary": {"total_products": 1, "understock_count": 1},
            "products": [{
                "product_id": product.sku,
                "product_name": product.name,
                "status": "bajo_stock",
                "current_stock": recommendation["current_stock"],
                "target_stock": recommendation["target_stock"],
                "understock_units": recommendation["recommended_units"],
                "recommendation_method": "regla_stock_catalogo",
            }],
        },
    )
    db.add(rule_analysis)
    await db.flush()

    followup = ReplenishmentFollowup(
        company_id=company_id,
        analysis_id=rule_analysis.id,
        product_id=product.id,
        recommended_units=recommendation["recommended_units"],
        planned_units=data.planned_units,
        received_units=0,
        status="pendiente",
        notes=(data.notes or "Seguimiento por regla de stock; no es predicción XGBoost"),
        created_by=user["user_id"],
    )
    db.add(followup)
    await db.flush()
    await db.refresh(followup)
    return followup
