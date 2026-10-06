import json
import time
from typing import Optional

from google import genai
from google.genai import types

from app.core.config import settings


SYSTEM_INSTRUCTION = """
Eres el asistente de inventario del sistema RetailPyme.

Tu función es apoyar al usuario en la interpretación de información
relacionada con inventario, predicción de demanda y recomendaciones
de reabastecimiento.

Reglas importantes:

1. Responde en español.
2. Sé claro, breve y profesional.
3. No inventes cantidades de stock, demanda, predicciones o
   reabastecimiento.
4. Si no dispones de los datos necesarios para responder una pregunta,
   indícalo claramente.
5. No afirmes haber consultado datos del sistema si esos datos no han
   sido proporcionados.
6. La predicción de demanda corresponde al modelo XGBoost del sistema.
7. Tu función es interpretar los resultados y apoyar la toma de
   decisiones, no sustituir el modelo predictivo.
8. No realices compras ni afirmes haber modificado el inventario.
9. Las recomendaciones son de apoyo para el usuario, quien mantiene
   la decisión final.
"""


class InventoryAgent:
    """
    Agente de IA para apoyar el análisis de inventario
    y las recomendaciones de reabastecimiento.
    """

    def __init__(self):
        # Las operaciones deterministas del agente (bajo stock, sobrestock,
        # consulta de producto, predicción y simulación) no deben depender
        # de Gemini. El cliente se crea de forma diferida únicamente cuando
        # se necesita lenguaje natural o se prueba la conexión con Gemini.
        self.client = None
        self.model = settings.GEMINI_MODEL

    def _get_client(self):
        if self.client is not None:
            return self.client

        if not settings.GEMINI_API_KEY:
            raise ValueError(
                "No se encontró GEMINI_API_KEY en las variables de entorno."
            )

        self.client = genai.Client(api_key=settings.GEMINI_API_KEY)
        return self.client

    def _generate_with_retry(
        self,
        contents,
        config=None,
        max_attempts: int = 3,
    ):
        """
        Realiza una petición a Gemini.

        Si Gemini devuelve temporalmente un error 503,
        realiza hasta 3 intentos.
        """

        for attempt in range(1, max_attempts + 1):
            try:
                client = self._get_client()
                return client.models.generate_content(
                    model=self.model,
                    contents=contents,
                    config=config,
                )

            except Exception as exc:
                error_message = str(exc)

                is_temporary_error = (
                    "503" in error_message
                    or "UNAVAILABLE" in error_message
                    or "high demand" in error_message.lower()
                )

                is_quota_error = (
                    "429" in error_message
                    or "RESOURCE_EXHAUSTED" in error_message
                    or "quota exceeded" in error_message.lower()
                )

                if is_quota_error:
                    raise RuntimeError(
                        "Se alcanzó temporalmente el límite de consultas del servicio de IA. "
                        "Inténtalo nuevamente más tarde."
                    ) from exc

                if is_temporary_error and attempt < max_attempts:
                    wait_seconds = attempt * 2

                    print(
                        f"Gemini no disponible temporalmente. "
                        f"Reintento {attempt + 1}/{max_attempts} "
                        f"en {wait_seconds} segundos..."
                    )

                    time.sleep(wait_seconds)
                    continue

                if is_temporary_error:
                    raise RuntimeError(
                        "El servicio de IA no está disponible temporalmente. "
                        "Inténtalo nuevamente en unos minutos."
                    ) from exc

                raise RuntimeError(
                    "No se pudo completar la consulta con el servicio de IA."
                ) from exc

    def test_connection(self) -> str:
        """
        Comprueba la conexión básica con Gemini.
        """

        response = self._generate_with_retry(
            contents=(
                "Responde únicamente con esta frase: "
                "Agente de inventario conectado correctamente."
            )
        )

        return response.text
    def list_low_stock_products(
        self,
        analysis_context: dict,
    ) -> list:
        """
        Obtiene únicamente los datos necesarios de los productos
        que presentan bajo stock.
        """

        products = analysis_context.get("products", [])

        low_stock_products = []

        for product in products:
            if product.get("status") != "bajo_stock":
                continue

            low_stock_products.append({
                "product_id": product.get("product_id"),
                "product_name": product.get("product_name"),
                "category": product.get("category"),
                "current_stock": product.get("current_stock"),
                "avg_monthly_demand": product.get(
                    "avg_monthly_demand"
                ),
                "days_of_coverage": product.get(
                    "days_of_coverage"
                ),
                "target_stock": product.get("target_stock"),
                "understock_units": product.get(
                    "understock_units"
                ),
                "depletion_date": product.get(
                    "depletion_date"
                ),
                "forecast_demand_horizon": product.get(
                    "forecast_demand_horizon"
                ),
                "horizon_months": product.get(
                    "horizon_months"
                ),
                "trend": product.get("trend"),
            })

        return low_stock_products
    
    def list_overstock_products(
        self,
        analysis_context: dict,
    ) -> list:
        """
        Obtiene únicamente los productos que presentan sobrestock.
        """

        products = analysis_context.get("products", [])

        overstock_products = []

        for product in products:
            if product.get("status") != "sobre_stock":
                continue

            overstock_products.append({
                "product_id": product.get("product_id"),
                "product_name": product.get("product_name"),
                "category": product.get("category"),
                "current_stock": product.get("current_stock"),
                "avg_monthly_demand": product.get("avg_monthly_demand"),
                "days_of_coverage": product.get("days_of_coverage"),
                "target_stock": product.get("target_stock"),
                "overstock_units": product.get("overstock_units"),
                "forecast_demand_horizon": product.get(
                    "forecast_demand_horizon"
                ),
                "horizon_months": product.get("horizon_months"),
                "trend": product.get("trend"),
            })

        return overstock_products

    def _find_product(
        self,
        analysis_context: dict,
        product_name: str,
    ) -> dict:
        """
        Busca un producto de forma segura.

        Prioriza coincidencia exacta. Si no existe, acepta una
        coincidencia parcial únicamente cuando sea única. Si hay varias
        coincidencias, devuelve las opciones para evitar seleccionar un
        producto incorrecto silenciosamente.
        """

        products = analysis_context.get("products", [])
        search_name = str(product_name or "").strip().lower()

        if not search_name:
            return {
                "found": False,
                "ambiguous": False,
                "message": "Debes indicar el nombre del producto.",
            }

        exact_matches = []
        partial_matches = []

        for product in products:
            current_name = str(
                product.get("product_name", "")
            ).strip().lower()

            if current_name == search_name:
                exact_matches.append(product)
            elif search_name in current_name:
                partial_matches.append(product)

        if exact_matches:
            return {
                "found": True,
                "ambiguous": False,
                "product": exact_matches[0],
            }

        if len(partial_matches) == 1:
            return {
                "found": True,
                "ambiguous": False,
                "product": partial_matches[0],
            }

        if len(partial_matches) > 1:
            candidates = [
                str(product.get("product_name", ""))
                for product in partial_matches[:10]
            ]

            return {
                "found": False,
                "ambiguous": True,
                "message": (
                    f"Se encontraron varios productos que coinciden con "
                    f"'{product_name}'. Indica cuál deseas consultar."
                ),
                "candidates": candidates,
            }

        return {
            "found": False,
            "ambiguous": False,
            "message": (
                f"No se encontró el producto '{product_name}' "
                "en el análisis seleccionado."
            ),
        }

    def get_product_info(
        self,
        analysis_context: dict,
        product_name: str,
    ) -> dict:
        """
        Obtiene la información relevante de un producto.
        """

        lookup = self._find_product(
            analysis_context,
            product_name,
        )

        if not lookup.get("found"):
            return lookup

        product = lookup["product"]

        return {
            "found": True,
            "product_id": product.get("product_id"),
            "product_name": product.get("product_name"),
            "category": product.get("category"),
            "status": product.get("status"),
            "current_stock": product.get("current_stock"),
            "avg_monthly_demand": product.get("avg_monthly_demand"),
            "days_of_coverage": product.get("days_of_coverage"),
            "target_stock": product.get("target_stock"),
            "understock_units": product.get("understock_units"),
            "overstock_units": product.get("overstock_units"),
            "depletion_date": product.get("depletion_date"),
            "forecast_demand_horizon": product.get(
                "forecast_demand_horizon"
            ),
            "horizon_months": product.get("horizon_months"),
            "trend": product.get("trend"),
            "reasoning": product.get("reasoning"),
        }

    def get_prediction(
        self,
        analysis_context: dict,
        product_name: str,
    ) -> dict:
        """
        Obtiene únicamente los datos de predicción de demanda
        de un producto.
        """

        product = self.get_product_info(
            analysis_context,
            product_name,
        )

        if not product.get("found"):
            return product

        return {
            "found": True,
            "product_name": product.get("product_name"),
            "avg_monthly_demand": product.get("avg_monthly_demand"),
            "forecast_demand_horizon": product.get(
                "forecast_demand_horizon"
            ),
            "horizon_months": product.get("horizon_months"),
            "trend": product.get("trend"),
        }


    def simulate_restock(
        self,
        analysis_context: dict,
        product_name: str,
        quantity: int,
    ) -> dict:
        """
        Simula el efecto de agregar una cantidad al stock actual
        de un producto. No modifica el inventario real.
        """

        lookup = self._find_product(
            analysis_context,
            product_name,
        )

        if not lookup.get("found"):
            return lookup

        product = lookup["product"]

        if isinstance(quantity, bool) or not isinstance(quantity, int) or quantity <= 0:
            return {
                "found": False,
                "message": "La cantidad a simular debe ser un número entero mayor que cero.",
            }

        current_stock = float(product.get("current_stock") or 0)
        target_stock = float(product.get("target_stock") or 0)

        simulated_stock = current_stock + quantity
        difference = simulated_stock - target_stock

        if difference < 0:
            simulated_status = "bajo_stock"
        elif difference > 0:
            simulated_status = "sobre_stock"
        else:
            simulated_status = "stock_objetivo"

        return {
            "found": True,
            "product_name": product.get("product_name"),
            "current_stock": current_stock,
            "quantity_to_add": quantity,
            "simulated_stock": simulated_stock,
            "target_stock": target_stock,
            "difference_vs_target": difference,
            "simulated_status": simulated_status,
            "note": (
                "Esta es una simulación. "
                "No se modificó el inventario real."
            ),
        }
    def get_inventory_summary(
        self,
        analysis_context: dict,
    ) -> dict:
        """
        Genera un resumen determinista del estado del inventario.
        No utiliza Gemini.
        """

        products = analysis_context.get("products", []) or []

        low_stock = [
            product
            for product in products
            if product.get("status") == "bajo_stock"
        ]

        overstock = [
            product
            for product in products
            if product.get("status") == "sobre_stock"
        ]

        normal_stock = [
            product
            for product in products
            if product.get("status")
            not in ("bajo_stock", "sobre_stock")
        ]

        prioritized = self.prioritize_restock_products(
            analysis_context,
            limit=5,
        )

        return {
            "total_products": len(products),
            "low_stock_count": len(low_stock),
            "overstock_count": len(overstock),
            "normal_stock_count": len(normal_stock),
            "critical_products": prioritized,
            "note": (
                "Resumen calculado directamente a partir del "
                "análisis de inventario almacenado."
            ),
        }
    def get_restock_recommendation(
        self,
        analysis_context: dict,
        product_name: str,
    ) -> dict:
        """
        Obtiene una recomendación determinista de reabastecimiento.
        Gemini no calcula la cantidad recomendada.
        """

        product = self.get_product_info(
            analysis_context,
            product_name,
        )

        if not product.get("found"):
            return product

        current_stock = float(product.get("current_stock") or 0)
        target_stock = float(product.get("target_stock") or 0)
        status = product.get("status")

        recommended_units = max(
            0,
            int(round(target_stock - current_stock))
        )

        if status == "bajo_stock" and recommended_units > 0:
            action = "reabastecer"
        elif status == "sobre_stock":
            action = "no_reabastecer"
            recommended_units = 0
        else:
            action = "mantener"

        return {
            "found": True,
            "product_name": product.get("product_name"),
            "status": status,
            "action": action,
            "recommended_units": recommended_units,
            "current_stock": current_stock,
            "target_stock": target_stock,
            "understock_units": product.get("understock_units"),
            "overstock_units": product.get("overstock_units"),
            "days_of_coverage": product.get("days_of_coverage"),
            "depletion_date": product.get("depletion_date"),
            "forecast_demand_horizon": product.get(
                "forecast_demand_horizon"
            ),
            "horizon_months": product.get("horizon_months"),
            "trend": product.get("trend"),
            "reasoning": product.get("reasoning"),
            "note": (
                "La cantidad recomendada se calcula a partir del stock "
                "objetivo y el stock actual. El agente de IA no inventa "
                "esta cantidad."
            ),
        }

    def prioritize_restock_products(
        self,
        analysis_context: dict,
        limit: int = 5,
    ) -> list:
        """
        Prioriza productos con bajo stock mediante criterios
        deterministas del análisis de inventario.
        """

        products = self.list_low_stock_products(analysis_context)

        if isinstance(limit, bool) or not isinstance(limit, int):
            limit = 5

        limit = max(1, min(limit, 20))

        def priority_key(product):
            coverage = product.get("days_of_coverage")
            understock = product.get("understock_units")

            try:
                coverage_value = float(coverage)
            except (TypeError, ValueError):
                coverage_value = float("inf")

            try:
                understock_value = float(understock)
            except (TypeError, ValueError):
                understock_value = 0.0

            # Menor cobertura = mayor prioridad.
            # En empate, mayor faltante = mayor prioridad.
            return (
                coverage_value,
                -understock_value,
            )

        ordered = sorted(products, key=priority_key)

        result = []

        for position, product in enumerate(ordered[:limit], start=1):
            result.append({
                "priority": position,
                **product,
                "recommended_units": max(
                    0,
                    int(
                        round(
                            float(product.get("target_stock") or 0)
                            - float(product.get("current_stock") or 0)
                        )
                    ),
                ),
            })

        return result

    def compare_products(
        self,
        analysis_context: dict,
        product_a: str,
        product_b: str,
    ) -> dict:
        """
        Compara dos productos utilizando exclusivamente
        los resultados almacenados del análisis.
        """

        first = self.get_product_info(
            analysis_context,
            product_a,
        )
        second = self.get_product_info(
            analysis_context,
            product_b,
        )

        if not first.get("found"):
            return {
                "found": False,
                "product": "product_a",
                "detail": first,
            }

        if not second.get("found"):
            return {
                "found": False,
                "product": "product_b",
                "detail": second,
            }

        def coverage(product):
            value = product.get("days_of_coverage")
            try:
                return float(value)
            except (TypeError, ValueError):
                return float("inf")

        first_coverage = coverage(first)
        second_coverage = coverage(second)

        if first_coverage < second_coverage:
            higher_priority = first.get("product_name")
        elif second_coverage < first_coverage:
            higher_priority = second.get("product_name")
        else:
            first_missing = float(first.get("understock_units") or 0)
            second_missing = float(second.get("understock_units") or 0)

            if first_missing > second_missing:
                higher_priority = first.get("product_name")
            elif second_missing > first_missing:
                higher_priority = second.get("product_name")
            else:
                higher_priority = None

        return {
            "found": True,
            "product_a": first,
            "product_b": second,
            "higher_priority": higher_priority,
            "comparison_criteria": (
                "Se prioriza menor cobertura de inventario y, "
                "en caso de empate, mayor cantidad faltante."
            ),
        }
    def chat(
        self,
        message: str,
        analysis_context: Optional[dict] = None,
        return_trace: bool = False,
    ):
        """
        Procesa una consulta utilizando herramientas controladas
        sobre los resultados del análisis de inventario.
        """

        if not analysis_context:
            return (
                "Necesitas generar o seleccionar primero un análisis "
                "de inventario para poder realizar esta consulta."
            )

        tool_trace = []

        def trace_tool(tool_name: str, payload):
            tool_trace.append(tool_name)
            return payload

        # ---------------------------------------------------------
        # Herramientas disponibles para Gemini.
        # Estas funciones trabajan sobre analysis_context en el
        # backend. El análisis completo NO se envía al modelo.
        # ---------------------------------------------------------

        def listar_productos_bajo_stock() -> list:
            """
            Lista los productos que necesitan reabastecimiento
            porque presentan bajo stock.
            """
            return trace_tool(
                "listar_productos_bajo_stock",
                self.list_low_stock_products(analysis_context),
            )

        def listar_productos_sobrestock() -> list:
            """
            Lista los productos que presentan sobrestock.
            """
            return trace_tool(
                "listar_productos_sobrestock",
                self.list_overstock_products(analysis_context),
            )

        def consultar_producto(product_name: str) -> dict:
            """
            Consulta el estado, stock, demanda, cobertura,
            predicción y recomendación de un producto.

            Args:
                product_name: Nombre del producto que se desea consultar.
            """
            return trace_tool(
                "consultar_producto",
                self.get_product_info(analysis_context, product_name),
            )

        def consultar_prediccion(product_name: str) -> dict:
            """
            Consulta la predicción de demanda de un producto.

            Args:
                product_name: Nombre del producto que se desea consultar.
            """
            return trace_tool(
                "consultar_prediccion",
                self.get_prediction(analysis_context, product_name),
            )

        def simular_reabastecimiento(
            product_name: str,
            quantity: int,
        ) -> dict:
            """
            Simula qué ocurriría con el stock si se agregara una
            determinada cantidad de unidades. No modifica datos.

            Args:
                product_name: Nombre del producto.
                quantity: Cantidad de unidades que se desea simular.
            """
            return trace_tool(
                "simular_reabastecimiento",
                self.simulate_restock(analysis_context, product_name, quantity),
            )
        def resumir_inventario() -> dict:
            """
            Obtiene un resumen general del análisis de inventario,
            incluyendo cantidad de productos con bajo stock,
            sobrestock y productos prioritarios.
            """
            return trace_tool(
                "resumir_inventario",
                self.get_inventory_summary(analysis_context),
            )
        def recomendar_reabastecimiento(
            product_name: str,
        ) -> dict:
            """
            Obtiene la recomendación calculada de reabastecimiento
            para un producto.

            Args:
                product_name: Nombre del producto.
            """
            return trace_tool(
                "recomendar_reabastecimiento",
                self.get_restock_recommendation(analysis_context, product_name),
            )

        def priorizar_reabastecimiento(
            limit: int = 5,
        ) -> list:
            """
            Lista los productos con bajo stock ordenados por prioridad.

            Args:
                limit: Número máximo de productos a devolver.
            """
            return trace_tool(
                "priorizar_reabastecimiento",
                self.prioritize_restock_products(analysis_context, limit),
            )

        def comparar_productos(
            product_a: str,
            product_b: str,
        ) -> dict:
            """
            Compara dos productos para determinar cuál requiere
            mayor atención de inventario.

            Args:
                product_a: Nombre del primer producto.
                product_b: Nombre del segundo producto.
            """
            return trace_tool(
                "comparar_productos",
                self.compare_products(analysis_context, product_a, product_b),
            )
        tools = [
            listar_productos_bajo_stock,
            listar_productos_sobrestock,
            consultar_producto,
            consultar_prediccion,
            resumir_inventario,
            recomendar_reabastecimiento,
            priorizar_reabastecimiento,
            comparar_productos,
            simular_reabastecimiento,
        ]

        prompt = f"""
Consulta del usuario:

{message}

Utiliza las herramientas disponibles cuando necesites información
del inventario.

No inventes productos, cantidades, niveles de stock, predicciones
ni recomendaciones numéricas.

Los datos obtenidos mediante las herramientas provienen del
análisis realizado por el sistema.

Si una herramienta indica que el nombre de un producto es ambiguo y
devuelve candidatos, no elijas uno por tu cuenta. Muestra las opciones
al usuario y pídele que especifique cuál desea consultar.

Explica los resultados de forma breve y clara en español.
Responde en texto plano; no uses Markdown ni asteriscos para dar formato.

No realices compras ni modificaciones en el inventario.
La decisión final corresponde al usuario.
"""

        response = self._generate_with_retry(
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_INSTRUCTION,
                temperature=0.2,
                tools=tools,
            ),
        )

        if return_trace:
            return {
                "response": response.text,
                "tool_trace": tool_trace,
            }

        return response.text


def get_inventory_agent() -> InventoryAgent:
    return InventoryAgent()