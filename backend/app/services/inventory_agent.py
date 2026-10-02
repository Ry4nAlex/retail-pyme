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
        if not settings.GEMINI_API_KEY:
            raise ValueError(
                "No se encontró GEMINI_API_KEY en el archivo .env"
            )

        self.client = genai.Client(
            api_key=settings.GEMINI_API_KEY
        )

        self.model = settings.GEMINI_MODEL

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
                return self.client.models.generate_content(
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

                if is_temporary_error and attempt < max_attempts:
                    wait_seconds = attempt * 2

                    print(
                        f"Gemini no disponible temporalmente. "
                        f"Reintento {attempt + 1}/{max_attempts} "
                        f"en {wait_seconds} segundos..."
                    )

                    time.sleep(wait_seconds)
                    continue

                raise

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

    def chat(
        self,
        message: str,
        analysis_context: Optional[dict] = None,
    ) -> str:
        """
        Envía una pregunta al asistente de inventario.

        Si existe un análisis, proporciona sus resultados
        reales como contexto para Gemini.
        """

        if analysis_context:
            context_json = json.dumps(
                analysis_context,
                ensure_ascii=False,
                default=str,
            )

            prompt = f"""
El usuario está consultando un análisis real de inventario
generado previamente por el sistema RetailPyme.

DATOS DEL ANÁLISIS:
{context_json}

PREGUNTA DEL USUARIO:
{message}

Responde utilizando únicamente los datos disponibles en el análisis.

No inventes productos, cantidades, predicciones ni indicadores.
Si la información necesaria no está disponible en los datos,
indícalo claramente.

Cuando menciones cantidades o predicciones, utiliza exactamente
los valores proporcionados por el sistema.
"""
        else:
            prompt = message

        response = self._generate_with_retry(
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_INSTRUCTION,
                temperature=0.2,
            ),
        )

        if not response.text:
            raise ValueError(
                "Gemini no devolvió una respuesta de texto."
            )

        return response.text.strip()


def get_inventory_agent() -> InventoryAgent:
    return InventoryAgent()