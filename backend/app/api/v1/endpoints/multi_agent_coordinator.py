
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.db.database import get_db

from app.api.v1.endpoints.agent import (
    AgentChatRequest,
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
        "automatico",
        "inventario",
        "seguimiento"
    ] = "automatico"
    analysis_id: Optional[UUID] = None


def select_agent(message: str, requested: str) -> str:
    if requested != "automatico":
        return requested

    text = message.lower()

    tracking_keywords = (
        "seguimiento",
        "pendiente",
        "pospuesto",
        "descartado",
        "recibí",
        "recibido",
        "recibieron",
        "recepción",
        "entrega",
        "reposición realizada",
        "reposición completada",
    )

    if any(word in text for word in tracking_keywords):
        return "seguimiento"

    return "inventario"


@router.post("/chat")
async def multi_agent_chat(
    request: MultiAgentChatRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    selected = select_agent(
        request.message,
        request.agent,
    )

    if selected == "seguimiento":
        agent = get_replenishment_tracking_agent()

        result = await agent.chat(
            message=request.message,
            db=db,
            company_id=user["company_id"],
        )

        return {
            "success": True,
            "selected_agent": "seguimiento",
            "response": result["response"],
            "model": result["model"],
            "followups_consulted": result[
                "followups_consulted"
            ],
        }

    result = await chat_with_agent(
        request=AgentChatRequest(
            message=request.message,
            analysis_id=request.analysis_id,
            history=[],
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
