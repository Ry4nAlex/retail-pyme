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


class AgentActionRequest(BaseModel):
    analysis_id: UUID
    action: str = Field(
        ...,
        description=(
            "low_stock, overstock, product, prediction, summary, "
            "restock_recommendation, prioritize_restock, "
            "compare_products o simulate_restock"
        ),
    )
    product_name: Optional[str] = None
    second_product_name: Optional[str] = None
    quantity: Optional[int] = None
    limit: Optional[int] = 5


class AgentActionResponse(BaseModel):
    success: bool
    action: str
    data: object


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


async def _get_analysis_context(
    analysis_id: UUID,
    db: AsyncSession,
    company_id,
) -> dict:
    result = await db.execute(
        select(StockAnalysis).where(
            StockAnalysis.id == analysis_id,
            StockAnalysis.company_id == company_id,
        )
    )
    analysis = result.scalar_one_or_none()
    if not analysis:
        raise HTTPException(status_code=404, detail="Análisis no encontrado")
    return analysis.result


@router.post("/action", response_model=AgentActionResponse)
async def execute_agent_action(
    request: AgentActionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Ejecuta acciones deterministas sin consumir Gemini."""
    context = await _get_analysis_context(
        request.analysis_id, db, current_user["company_id"]
    )
    agent = get_inventory_agent()

    if request.action == "low_stock":
        data = agent.list_low_stock_products(context)
    elif request.action == "overstock":
        data = agent.list_overstock_products(context)
    elif request.action == "product":
        if not request.product_name:
            raise HTTPException(status_code=422, detail="Debes indicar product_name.")
        data = agent.get_product_info(context, request.product_name)
    elif request.action == "prediction":
        if not request.product_name:
            raise HTTPException(status_code=422, detail="Debes indicar product_name.")
        data = agent.get_prediction(context, request.product_name)
    elif request.action == "summary":
        data = agent.get_inventory_summary(context)
    elif request.action == "restock_recommendation":
        if not request.product_name:
            raise HTTPException(
                status_code=422,
                detail="Debes indicar product_name.",
            )

        data = agent.get_restock_recommendation(
            context,
            request.product_name,
        )

    elif request.action == "prioritize_restock":
        data = agent.prioritize_restock_products(
            context,
            request.limit or 5,
        )

    elif request.action == "compare_products":
        if not request.product_name:
            raise HTTPException(
                status_code=422,
                detail="Debes indicar product_name.",
            )

        if not request.second_product_name:
            raise HTTPException(
                status_code=422,
                detail="Debes indicar second_product_name.",
            )

        data = agent.compare_products(
            context,
            request.product_name,
            request.second_product_name,
        )

    elif request.action == "simulate_restock":
        if not request.product_name:
            raise HTTPException(
                status_code=422,
                detail="Debes indicar product_name.",
            )

        if request.quantity is None:
            raise HTTPException(
                status_code=422,
                detail="Debes indicar quantity.",
            )

        data = agent.simulate_restock(
            context,
            request.product_name,
            request.quantity,
        )

    else:
        raise HTTPException(
            status_code=422,
            detail="Acción no válida.",
        )

    return AgentActionResponse(success=True, action=request.action, data=data)




class AgentEvaluationRequest(BaseModel):
    analysis_id: UUID


@router.post("/evaluate")
async def evaluate_agent(
    request: AgentEvaluationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Evalúa de forma reproducible las capacidades deterministas que sustentan
    al agente. No consume Gemini y no modifica inventario.
    """
    context = await _get_analysis_context(
        request.analysis_id,
        db,
        current_user["company_id"],
    )
    agent = get_inventory_agent()
    products = context.get("products", []) or []

    cases = []

    def add_case(case_id: str, name: str, passed: bool, detail: str):
        cases.append({
            "id": case_id,
            "name": name,
            "passed": bool(passed),
            "detail": detail,
        })

    low_expected = [p for p in products if p.get("status") == "bajo_stock"]
    low_result = agent.list_low_stock_products(context)
    add_case(
        "low_stock",
        "Identificación de productos con bajo stock",
        len(low_result) == len(low_expected),
        f"Esperados: {len(low_expected)}; obtenidos: {len(low_result)}.",
    )

    over_expected = [p for p in products if p.get("status") == "sobre_stock"]
    over_result = agent.list_overstock_products(context)
    add_case(
        "overstock",
        "Identificación de productos con sobrestock",
        len(over_result) == len(over_expected),
        f"Esperados: {len(over_expected)}; obtenidos: {len(over_result)}.",
    )

    sample = products[0] if products else None
    if sample and sample.get("product_name"):
        name = sample["product_name"]

        info = agent.get_product_info(context, name)
        add_case(
            "product",
            "Consulta exacta de producto",
            info.get("found") is True and info.get("product_name") == name,
            f"Producto evaluado: {name}.",
        )

        prediction = agent.get_prediction(context, name)
        expected_forecast = sample.get("forecast_demand_horizon")
        add_case(
            "prediction",
            "Consulta de predicción almacenada",
            prediction.get("found") is True
            and prediction.get("forecast_demand_horizon") == expected_forecast,
            f"Predicción esperada: {expected_forecast}; obtenida: "
            f"{prediction.get('forecast_demand_horizon')}.",
        )

        stock_before = sample.get("current_stock")
        simulation = agent.simulate_restock(context, name, 1)
        add_case(
            "simulation",
            "Simulación de reabastecimiento sin mutación",
            simulation.get("found") is True
            and simulation.get("quantity_to_add") == 1
            and sample.get("current_stock") == stock_before,
            "Se simuló +1 unidad y se verificó que el contexto original no cambiara.",
        )
    else:
        add_case("product", "Consulta exacta de producto", False, "No hay productos evaluables.")
        add_case("prediction", "Consulta de predicción almacenada", False, "No hay productos evaluables.")
        add_case("simulation", "Simulación de reabastecimiento sin mutación", False, "No hay productos evaluables.")
    # ---------------------------------------------------------
    # Evaluación del resumen general de inventario
    # ---------------------------------------------------------

    summary_result = agent.get_inventory_summary(context)

    expected_low = len(
        [
            product
            for product in products
            if product.get("status") == "bajo_stock"
        ]
    )

    expected_over = len(
        [
            product
            for product in products
            if product.get("status") == "sobre_stock"
        ]
    )

    add_case(
        "inventory_summary",
        "Consistencia del resumen general de inventario",
        summary_result.get("total_products") == len(products)
        and summary_result.get("low_stock_count") == expected_low
        and summary_result.get("overstock_count") == expected_over,
        (
            f"Total: {len(products)}; "
            f"bajo stock: {expected_low}; "
            f"sobrestock: {expected_over}."
        ),
    )
    # ---------------------------------------------------------
    # Evaluación de recomendación de reabastecimiento
    # ---------------------------------------------------------

    if sample and sample.get("product_name"):
        name = sample["product_name"]

        recommendation = agent.get_restock_recommendation(
            context,
            name,
        )

        expected_units = max(
            0,
            int(
                round(
                    float(sample.get("target_stock") or 0)
                    - float(sample.get("current_stock") or 0)
                )
            ),
        )

        add_case(
            "restock_recommendation",
            "Consistencia de recomendación de reabastecimiento",
            recommendation.get("found") is True
            and recommendation.get("recommended_units") == expected_units,
            (
                f"Producto: {name}; "
                f"cantidad esperada: {expected_units}; "
                f"cantidad obtenida: "
                f"{recommendation.get('recommended_units')}."
            ),
        )

    else:
        add_case(
            "restock_recommendation",
            "Consistencia de recomendación de reabastecimiento",
            False,
            "No hay productos evaluables.",
        )

    # ---------------------------------------------------------
    # Evaluación de priorización
    # ---------------------------------------------------------

    prioritized = agent.prioritize_restock_products(
        context,
        limit=5,
    )

    low_stock_count = len(
        [
            product
            for product in products
            if product.get("status") == "bajo_stock"
        ]
    )

    expected_priority_count = min(5, low_stock_count)

    priorities_are_sequential = all(
        item.get("priority") == index
        for index, item in enumerate(prioritized, start=1)
    )

    add_case(
        "prioritization",
        "Priorización determinista de reabastecimiento",
        len(prioritized) == expected_priority_count
        and priorities_are_sequential,
        (
            f"Productos con bajo stock: {low_stock_count}; "
            f"priorizados: {len(prioritized)}."
        ),
    )

    # ---------------------------------------------------------
    # Evaluación de comparación entre productos
    # ---------------------------------------------------------

    if len(products) >= 2:
        first_name = products[0].get("product_name")
        second_name = products[1].get("product_name")

        if first_name and second_name:
            comparison = agent.compare_products(
                context,
                first_name,
                second_name,
            )

            add_case(
                "comparison",
                "Comparación controlada entre productos",
                comparison.get("found") is True
                and comparison.get("product_a", {}).get(
                    "product_name"
                ) == first_name
                and comparison.get("product_b", {}).get(
                    "product_name"
                ) == second_name,
                (
                    f"Productos comparados: "
                    f"{first_name} y {second_name}."
                ),
            )
        else:
            add_case(
                "comparison",
                "Comparación controlada entre productos",
                False,
                "Los productos evaluados no tienen nombre.",
            )
    else:
        cases.append({
            "id": "comparison",
            "name": "Comparación controlada entre productos",
            "passed": None,
            "detail": (
                "Se requieren al menos dos productos "
                "para ejecutar esta prueba."
            ),
        })
    missing = agent.get_product_info(context, "__producto_inexistente_evaluacion__")
    add_case(
        "not_found",
        "Manejo de producto inexistente",
        missing.get("found") is False and missing.get("ambiguous") is False,
        missing.get("message", "Sin mensaje."),
    )

    if sample and sample.get("product_name"):
        invalid = agent.simulate_restock(context, sample["product_name"], 0)
        add_case(
            "invalid_quantity",
            "Rechazo de cantidad inválida",
            invalid.get("found") is False,
            invalid.get("message", "Sin mensaje."),
        )
    else:
        add_case("invalid_quantity", "Rechazo de cantidad inválida", False, "No hay productos evaluables.")

    # Busca de forma automática un fragmento que produzca más de una coincidencia.
    ambiguous_query = None
    names = [str(p.get("product_name") or "").strip() for p in products]
    for name in names:
        tokens = [t for t in name.split() if len(t) >= 3]
        for token in tokens:
            matches = [candidate for candidate in names if token.lower() in candidate.lower()]
            if len(matches) > 1:
                ambiguous_query = token
                break
        if ambiguous_query:
            break

    if ambiguous_query:
        ambiguous = agent.get_product_info(context, ambiguous_query)
        add_case(
            "ambiguity",
            "Manejo de nombres ambiguos",
            ambiguous.get("found") is False
            and ambiguous.get("ambiguous") is True
            and bool(ambiguous.get("candidates")),
            f"Consulta usada: '{ambiguous_query}'. "
            f"Candidatos: {len(ambiguous.get('candidates') or [])}.",
        )
    else:
        cases.append({
            "id": "ambiguity",
            "name": "Manejo de nombres ambiguos",
            "passed": None,
            "detail": "No se encontró automáticamente un nombre ambiguo en este análisis.",
        })

    applicable = [case for case in cases if case["passed"] is not None]
    passed = sum(1 for case in applicable if case["passed"])
    failed = sum(1 for case in applicable if not case["passed"])

    return {
        "analysis_id": str(request.analysis_id),
        "evaluation_type": "deterministic_agent_tools",
        "uses_gemini": False,
        "modifies_inventory": False,
        "summary": {
            "total_cases": len(cases),
            "applicable_cases": len(applicable),
            "passed": passed,
            "failed": failed,
            "not_applicable": len(cases) - len(applicable),
            "compliance_pct": round((passed / len(applicable)) * 100, 2)
            if applicable else None,
        },
        "cases": cases,
        "note": (
            "Esta evaluación valida las herramientas controladas que sustentan "
            "al agente. La evaluación de interpretación en lenguaje natural con "
            "Gemini se realiza por separado."
        ),
    }
@router.post("/evaluate-language")
async def evaluate_agent_language(
    request: AgentEvaluationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Evalúa la capacidad de Gemini para interpretar consultas en lenguaje
    natural y seleccionar la herramienta controlada esperada.

    Esta evaluación consume Gemini, se ejecuta únicamente bajo demanda
    y no modifica el inventario.
    """
    context = await _get_analysis_context(
        request.analysis_id,
        db,
        current_user["company_id"],
    )

    agent = get_inventory_agent()
    products = context.get("products", []) or []

    cases = [
        {
            "id": "low_stock_intent",
            "name": "Interpretación de consulta de bajo stock",
            "prompt": "¿Qué productos necesitan reabastecimiento por bajo stock?",
            "expected_tool": "listar_productos_bajo_stock",
        },
        {
            "id": "overstock_intent",
            "name": "Interpretación de consulta de sobrestock",
            "prompt": "¿Qué productos presentan sobrestock?",
            "expected_tool": "listar_productos_sobrestock",
        },
        {
            "id": "summary_intent",
            "name": "Interpretación de resumen de inventario",
            "prompt": "Dame un resumen general del estado del inventario.",
            "expected_tool": "resumir_inventario",
        },
        {
            "id": "prioritization_intent",
            "name": "Interpretación de priorización de reabastecimiento",
            "prompt": "Prioriza los 5 productos que requieren reabastecimiento.",
            "expected_tool": "priorizar_reabastecimiento",
        },
    ]

    # Se incorpora una consulta dependiente de un producto real del análisis.
    sample = next(
        (
            product
            for product in products
            if product.get("product_name")
        ),
        None,
    )

    if sample:
        product_name = sample["product_name"]

        cases.append({
            "id": "recommendation_intent",
            "name": "Interpretación de recomendación de reabastecimiento",
            "prompt": (
                f"¿Cuál es la recomendación de reabastecimiento "
                f"para {product_name}?"
            ),
            "expected_tool": "recomendar_reabastecimiento",
        })

    results = []

    for case in cases:
        try:
            result = agent.chat(
                message=case["prompt"],
                analysis_context=context,
                return_trace=True,
            )

            selected_tools = result.get("tool_trace", [])
            expected_tool = case["expected_tool"]

            passed = expected_tool in selected_tools

            results.append({
                "id": case["id"],
                "name": case["name"],
                "prompt": case["prompt"],
                "expected_tool": expected_tool,
                "selected_tools": selected_tools,
                "passed": passed,
                "response": result.get("response"),
                "detail": (
                    f"Herramienta esperada: {expected_tool}; "
                    f"seleccionadas: "
                    f"{', '.join(selected_tools) if selected_tools else 'ninguna'}."
                ),
            })

        except RuntimeError as exc:
            results.append({
                "id": case["id"],
                "name": case["name"],
                "prompt": case["prompt"],
                "expected_tool": case["expected_tool"],
                "selected_tools": [],
                "passed": False,
                "response": None,
                "detail": f"No se pudo completar la consulta: {str(exc)}",
            })

    passed = sum(
        1
        for case in results
        if case["passed"]
    )

    failed = len(results) - passed

    compliance_pct = (
        round((passed / len(results)) * 100, 2)
        if results
        else None
    )

    return {
        "analysis_id": str(request.analysis_id),
        "evaluation_type": "natural_language_tool_selection",
        "uses_gemini": True,
        "modifies_inventory": False,
        "summary": {
            "total_cases": len(results),
            "passed": passed,
            "failed": failed,
            "compliance_pct": compliance_pct,
        },
        "cases": results,
        "note": (
            "Esta evaluación mide si Gemini interpreta consultas "
            "predefinidas en lenguaje natural y selecciona la herramienta "
            "controlada esperada. No evalúa el desempeño predictivo de "
            "XGBoost y no modifica el inventario."
        ),
    }

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
            analysis_context = await _get_analysis_context(
                request.analysis_id,
                db,
                current_user["company_id"],
            )

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

    except RuntimeError as exc:
        message = str(exc)
        if "límite de consultas" in message:
            raise HTTPException(status_code=429, detail=message)
        if "no está disponible temporalmente" in message:
            raise HTTPException(status_code=503, detail=message)
        raise HTTPException(status_code=502, detail=message)

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="No se pudo completar la consulta con el agente de inventario.",
        )