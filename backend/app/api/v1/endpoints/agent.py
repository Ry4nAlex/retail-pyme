from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.db.database import get_db
from app.models.models import StockAnalysis
from app.services.inventory_agent import get_inventory_agent


router = APIRouter(
    prefix="/agent",
    tags=["Agente IA"]
)


class AgentChatRequest(BaseModel):
    message: str = Field(
        ...,
        min_length=1,
        max_length=1000,
        description="Pregunta realizada al agente de inventario",
    )

    analysis_id: Optional[UUID] = Field(
        default=None,
        description="ID del análisis de inventario que utilizará el agente",
    )


class AgentChatResponse(BaseModel):
    success: bool
    model: str
    response: str


@router.get("/test")
def test_agent():
    """
    Comprueba que el backend puede comunicarse
    correctamente con Gemini.
    """

    try:
        agent = get_inventory_agent()
        message = agent.test_connection()

        return {
            "success": True,
            "model": agent.model,
            "message": message,
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Error al conectar con Gemini: {str(exc)}",
        )


@router.post("/chat", response_model=AgentChatResponse)
async def chat_with_agent(
    request: AgentChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Envía una pregunta al agente de inventario.

    Si se proporciona analysis_id, el agente utiliza
    los resultados reales almacenados del análisis.
    """

    try:
        analysis_context = None

        if request.analysis_id:
            result = await db.execute(
                select(StockAnalysis).where(
                    StockAnalysis.id == request.analysis_id,
                    StockAnalysis.company_id == current_user["company_id"],
                )
            )

            analysis = result.scalar_one_or_none()

            if not analysis:
                raise HTTPException(
                    status_code=404,
                    detail="Análisis no encontrado",
                )

            analysis_context = analysis.result

        agent = get_inventory_agent()

        response = agent.chat(
            message=request.message,
            analysis_context=analysis_context,
        )

        return AgentChatResponse(
            success=True,
            model=agent.model,
            response=response,
        )

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Error en el agente de inventario: {str(exc)}",
        )