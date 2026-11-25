from typing import Literal, Optional
import re
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.db.database import get_db
from app.models.models import Product, ReplenishmentFollowup, StockAnalysis
from app.api.v1.endpoints.replenishment import calculate_stock_rule
from app.api.v1.endpoints.agent import (
    AgentChatRequest,
    AgentHistoryMessage,
    chat_with_agent,
)
from app.services.replenishment_tracking_agent import (
    get_replenishment_tracking_agent,
)

router = APIRouter(
    prefix="/multi-agent",
    tags=["Coordinador multiagente"],
)


class MultiAgentChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    agent: Literal[
        "automatico", "inventario", "seguimiento",
        "colaboracion", "preparar_accion",
    ] = "automatico"
    analysis_id: Optional[UUID] = None
    followup_id: Optional[UUID] = None
    product_id: Optional[UUID] = None
    history: list[AgentHistoryMessage] = Field(default_factory=list, max_length=10)


def select_agent(message: str, requested: str) -> str:
    if requested != "automatico":
        return requested

    text = message.lower()
    inventory_keywords = (
        "inventario", "stock", "demanda", "predicción", "predecir",
        "reabastecer", "reabastecimiento", "recomendación",
        "recomendaciones", "priorizar", "medicamentos",
    )
    tracking_keywords = (
        "seguimiento", "pendiente", "pendientes", "pospuesto",
        "descartado", "recibí", "recibido", "recibieron",
        "recepción", "entrega", "reposición realizada",
        "reposición completada",
    )
    requires_inventory = any(word in text for word in inventory_keywords)
    requires_tracking = any(word in text for word in tracking_keywords)
    if requires_inventory and requires_tracking:
        return "colaboracion"
    if requires_tracking:
        return "seguimiento"
    return "inventario"


@router.post("/chat")
async def multi_agent_chat(
    request: MultiAgentChatRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    selected = select_agent(request.message, request.agent)
    history = [entry.model_dump() for entry in request.history]

    # Resolver el medicamento desde el catálogo ACTUAL, no desde el análisis.
    # Prioridad: producto seleccionado en React > SKU escrito en la pregunta >
    # seguimiento seleccionado > nombre inequívoco. Si el SKU es explícito,
    # NUNCA responder con datos históricos cuando no se logra resolver.
    selected_product = None
    company_id = user["company_id"]

    if request.product_id is not None:
        selected_product = await db.scalar(select(Product).where(
            Product.id == request.product_id,
            Product.company_id == company_id,
            Product.active.is_(True),
        ))
        if selected_product is None:
            raise HTTPException(404, "El producto seleccionado no existe en el catálogo vigente")

    # Identificar SKU escrito por el usuario (ej. DEMO-FAR-001 o FAR-202),
    # incluso después de recargar React y perder la selección del buscador.
    # Solo se reconocen SKU explícitos conocidos de la propia compañía.
    if selected_product is None and selected != "preparar_accion":
        products = (await db.scalars(select(Product).where(
            Product.company_id == company_id,
            Product.active.is_(True),
        ))).all()
        query = request.message.casefold()
        sku_matches = [p for p in products if p.sku and re.search(
            rf"(?<![\w-]){re.escape(p.sku.casefold())}(?![\w-])", query
        )]
        if len(sku_matches) == 1:
            selected_product = sku_matches[0]
        elif len(sku_matches) > 1:
            raise HTTPException(422, "La consulta contiene varios SKU. Selecciona un medicamento")

        # Una referencia SKU: X que no coincide con el catálogo NO debe
        # caer en el análisis histórico y entregar existencias obsoletas.
        if selected_product is None:
            explicit_sku = re.search(r"\bsku\s*:\s*([\w-]+)", query)
            if explicit_sku:
                raise HTTPException(
                    404,
                    f"No se encontró el SKU '{explicit_sku.group(1)}' en Productos. "
                    "No se utilizará un análisis histórico como stock actual.",
                )

    if selected_product is None and request.followup_id is not None:
        followup = await db.scalar(select(ReplenishmentFollowup).where(
            ReplenishmentFollowup.id == request.followup_id,
            ReplenishmentFollowup.company_id == company_id,
        ))
        if followup is not None:
            selected_product = await db.scalar(select(Product).where(
                Product.id == followup.product_id,
                Product.company_id == company_id,
            ))

    # Cuando no aparece el SKU, permitir nombre inequívoco. No escoger el
    # primero de varios medicamentos similares ni mezclar sus respuestas.
    if selected_product is None and selected != "preparar_accion":
        products = (await db.scalars(select(Product).where(
            Product.company_id == company_id,
            Product.active.is_(True),
        ))).all()
        query = request.message.casefold()
        name_matches = [p for p in products if p.name and (
            p.name.casefold() in query or
            (len(p.name.split()) >= 2 and " ".join(p.name.casefold().split()[:2]) in query)
        )]
        if len(name_matches) == 1:
            selected_product = name_matches[0]
        elif len(name_matches) > 1 and selected in ("inventario", "colaboracion"):
            raise HTTPException(422, "Se encontraron varios medicamentos similares. Indica el SKU exacto")

    # Cuando se selecciona un producto del catálogo, el Agente 1 utiliza una herramienta
    # determinista de reglas de stock sobre el catálogo vigente.
    # No atribuye a XGBoost predicciones que no existen.
    if selected_product is not None and selected in ("inventario", "colaboracion"):
        product = selected_product
        recommendation = calculate_stock_rule(product)
        historical_note = ""
        # El análisis es una instantánea: se añade como referencia histórica,
        # jamás en sustitución del stock vigente del catálogo.
        if request.analysis_id is not None:
            analysis = await db.scalar(select(StockAnalysis).where(
                StockAnalysis.id == request.analysis_id,
                StockAnalysis.company_id == company_id,
            ))
            if analysis and (analysis.metrics or {}).get("uses_xgboost") is not False:
                for item in (analysis.result or {}).get("products", []):
                    if str(item.get("product_id", "")).casefold() == str(product.sku).casefold():
                        historical_note = (
                            "\n\n**Análisis histórico seleccionado** (no es stock actual):\n"
                            f"- Stock registrado al analizar: {item.get('current_stock', 'no disponible')}.\n"
                            f"- Demanda pronosticada para el horizonte: {item.get('forecast_demand_horizon', 'no disponible')}.\n"
                            f"- Unidades de déficit calculadas entonces: {item.get('understock_units', 'no disponible')}.\n"
                            "Revisa el stock vigente antes de aceptar una recomendación histórica."
                        )
                        break
        inventory_answer = (
            f"**{product.name}** (SKU: {product.sku})\n\n"
            f"- Stock actual: **{recommendation['current_stock']}** unidades.\n"
            f"- Stock mínimo: **{recommendation['min_stock']}**.\n"
            f"- Stock máximo: **{recommendation['max_stock']}**.\n"
            f"- Reposición sugerida según regla: **{recommendation['recommended_units']}** unidades.\n"
            f"- ¿Necesita reposición por mínimos?: **{'Sí' if recommendation['recommended_units'] > 0 else 'No'}**.\n\n"
            f"**Origen:** catálogo de Productos (existencias actuales). "
            f"El análisis histórico, si existe, conserva sus valores de la fecha en que se generó. "
            f"Esta regla **no es una predicción de XGBoost**."
            + historical_note
        )
        if selected == "inventario":
            return {
                "success": True, "selected_agent": "inventario",
                "response": inventory_answer,
                "model": "herramienta_regla_stock_catalogo",
                "tools_used": ["recomendacion_por_regla_stock"],
                "recommendation": recommendation,
            }
        tracking_agent = get_replenishment_tracking_agent()
        tracking = await tracking_agent.chat(
            message=(
                f"Consulta del usuario: {request.message}\n"
                f"Resultado del agente de inventario: {inventory_answer}\n"
                "Compara la propuesta con seguimientos existentes. "
                "No afirmes que se creó una reposición si todavía no se confirmó."
            ),
            db=db, company_id=user["company_id"], history=history,
            product_id=product.id,
        )
        return {
            "success": True, "selected_agent": "colaboracion",
            "agents_used": ["inventario", "seguimiento"],
            "response": inventory_answer + "\n\n**Seguimiento de reabastecimiento**\n\n" + tracking["response"],
            "agent_results": {"inventario": inventory_answer, "seguimiento": tracking["response"]},
            "tools_used": ["recomendacion_por_regla_stock"],
            "followups_consulted": tracking["followups_consulted"],
            "recommendation": recommendation,
        }

    if selected == "preparar_accion":
        if request.followup_id is None:
            raise HTTPException(
                status_code=422,
                detail="Debes proporcionar followup_id para preparar una acción.",
            )
        tracking_agent = get_replenishment_tracking_agent()
        result = await tracking_agent.prepare_status_action(
            message=request.message,
            followup_id=request.followup_id,
            db=db,
            company_id=user["company_id"],
        )
        return {
            "selected_agent": "seguimiento",
            "operation": "preparar_accion",
            **result,
        }

    if selected_product is None and selected in ("inventario", "colaboracion") and (
        "stock actual" in request.message.casefold() or
        "inventario actual" in request.message.casefold() or
        "stock vigente" in request.message.casefold()
    ):
        raise HTTPException(422, "Para consultar el stock vigente, selecciona un medicamento del catálogo o indica su SKU exacto")

    if selected == "colaboracion":
        if request.analysis_id is None:
            raise HTTPException(
                status_code=422,
                detail=(
                    "Para colaborar, ambos agentes necesitan un analysis_id "
                    "que identifique el análisis de inventario seleccionado."
                ),
            )

        inventory_result = await chat_with_agent(
            request=AgentChatRequest(
                message=request.message,
                analysis_id=request.analysis_id,
                history=request.history,
            ),
            db=db,
            current_user=user,
        )

        tracking_agent = get_replenishment_tracking_agent()
        tracking_message = (
            "El usuario realizó esta consulta:\n"
            f"{request.message}\n\n"
            "El agente de inventario respondió:\n"
            f"{inventory_result.response[:5000]}\n\n"
            "Contrasta las recomendaciones anteriores con los seguimientos "
            "registrados en el sistema. Identifica cuáles tienen una "
            "reposición pendiente, pospuesta o recibida. "
            "Si un medicamento no tiene seguimiento, indícalo claramente. "
            "No confundas una recomendación con una recepción confirmada. "
            "No inventes estados ni cantidades. No modifiques el inventario."
        )
        tracking_result = await tracking_agent.chat(
            message=tracking_message,
            db=db,
            company_id=user["company_id"],
            history=history,
        )
        return {
            "success": True,
            "selected_agent": "colaboracion",
            "agents_used": ["inventario", "seguimiento"],
            "response": (
                "**Consulta analítica histórica (no equivale al stock vigente)**\n\n"
                + inventory_result.response + "\n\n**Seguimiento**\n\n"
                + tracking_result["response"]
            ),
            "agent_results": {
                "inventario": inventory_result.response,
                "seguimiento": tracking_result["response"],
            },
            "tools_used": inventory_result.tools_used,
            "followups_consulted": tracking_result["followups_consulted"],
        }

    if selected == "seguimiento":
        tracking_agent = get_replenishment_tracking_agent()
        result = await tracking_agent.chat(
            message=request.message,
            db=db,
            company_id=user["company_id"],
            history=history,
            product_id=selected_product.id if selected_product is not None else None,
        )
        return {
            "success": True,
            "selected_agent": "seguimiento",
            "response": result["response"],
            "model": result["model"],
            "followups_consulted": result["followups_consulted"],
        }

    result = await chat_with_agent(
        request=AgentChatRequest(
            message=request.message,
            analysis_id=request.analysis_id,
            history=request.history,
        ),
        db=db,
        current_user=user,
    )
    return {
        "success": True,
        "selected_agent": "inventario",
        "response": (
            "**Resultado del análisis histórico seleccionado.** "
            "Para conocer el stock vigente, selecciona un producto del catálogo o escribe su SKU exacto.\n\n"
            + result.response
        ),
        "model": result.model,
        "tools_used": result.tools_used,
    }
