from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.db.database import get_db
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
            "response": tracking_result["response"],
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
        "response": result.response,
        "model": result.model,
        "tools_used": result.tools_used,
    }
