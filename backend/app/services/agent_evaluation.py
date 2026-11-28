"""Read-only test protocol. No database writes, no fabricated AI results."""
from datetime import datetime, timezone
import json
import re


def build_cases(context):
    cases = []

    def inventory(case_id, name, prompt, tool, args=None):
        cases.append(dict(id=case_id, name=name, agent='inventario', prompt=prompt,
                          expected_tool=tool, expected_args=args or {}, data_source='análisis seleccionado'))

    inventory('low_stock_intent', 'Consulta de bajo stock', 'Lista los productos con bajo stock.', 'listar_productos_bajo_stock')
    inventory('overstock_intent', 'Consulta de sobrestock', '¿Qué productos presentan sobrestock?', 'listar_productos_sobrestock')
    inventory('summary_intent', 'Resumen del inventario', 'Dame un resumen general del estado del inventario.', 'resumir_inventario')
    inventory('prioritization_intent', 'Priorización de reposición', 'Prioriza los 5 productos que requieren reabastecimiento.', 'priorizar_reabastecimiento', {'limit': 5})
    names = list(dict.fromkeys(str(p['product_name']) for p in context.get('products', []) or [] if p.get('product_name')))
    if names:
        name = names[0]
        for case_id, title, prompt, tool, args in [
            ('recommendation_intent', 'Cantidad recomendada', f'¿Cuántas unidades recomiendas reabastecer de {name}?', 'recomendar_reabastecimiento', {'product_name': name}),
            ('explanation_intent', 'Explicación de recomendación', f'¿Por qué se recomienda reabastecer {name}?', 'explicar_reabastecimiento', {'product_name': name}),
            ('prediction_intent', 'Predicción de demanda', f'¿Cuál es la predicción de demanda de {name}?', 'consultar_prediccion', {'product_name': name}),
            ('product_intent', 'Consulta de producto', f'Consulta los datos del producto {name} en el análisis.', 'consultar_producto', {'product_name': name}),
            ('simulation_intent', 'Simulación sin escritura', f'Simula agregar 25 unidades de {name}.', 'simular_reabastecimiento', {'product_name': name, 'quantity': 25}),
        ]:
            inventory(case_id, title, prompt, tool, args)
        if len(names) > 1:
            inventory('comparison_intent', 'Comparación de productos', f'Compara {names[0]} con {names[1]}.', 'comparar_productos', {'product_a': names[0], 'product_b': names[1]})
    for case_id, title, prompt, current, expected in [
        ('postpone_intent', 'Posponer seguimiento', 'Aplaza esta reposición para otra fecha.', 'pendiente', 'pospuesto'),
        ('reactivate_intent', 'Reactivar seguimiento', 'Reactiva este seguimiento que estaba pospuesto.', 'pospuesto', 'pendiente'),
        ('discard_intent', 'Descartar seguimiento', 'Descarta este seguimiento; ya no lo necesitamos.', 'pendiente', 'descartado'),
        ('receipt_guard', 'Recepción requiere confirmación', 'Ya recibí las unidades, confirma la recepción.', 'pendiente', 'ninguna'),
        ('ambiguous_intent', 'Solicitud sin acción explícita', '¿Qué sucede con esta reposición?', 'pendiente', 'ninguna'),
    ]:
        cases.append(dict(id=case_id, name=title, agent='seguimiento', prompt=prompt,
                          expected_tool='interpretar_cambio_estado', expected_args={'status': expected},
                          fixture={'product_name': 'Producto de prueba', 'sku': 'EVAL-001', 'current_status': current},
                          data_source='caso sintético; no modifica registros'))
    # Fixed synthetic records keep expected answers independent of production data.
    records = [
        {"seguimiento_id": "EVAL-A", "producto": "Producto de prueba A", "sku": "EVAL-001", "estado": "pendiente", "cantidad_recomendada": 30, "cantidad_planificada": 25, "cantidad_recibida": 0, "observaciones": None},
        {"seguimiento_id": "EVAL-B", "producto": "Producto de prueba B", "sku": "EVAL-002", "estado": "recibido", "cantidad_recomendada": 15, "cantidad_planificada": 15, "cantidad_recibida": 15, "observaciones": None},
        {"seguimiento_id": "EVAL-C", "producto": "Producto de prueba C", "sku": "EVAL-003", "estado": "pospuesto", "cantidad_recomendada": 20, "cantidad_planificada": 20, "cantidad_recibida": 0, "observaciones": None},
    ]
    for case_id, title, prompt, expected in [
        ('tracking_pending', 'Consulta de seguimiento pendiente', '¿Cuál es el estado de EVAL-001 y cuántas unidades se planificaron y recibieron? Devuelve solo JSON con las claves estado, cantidad_planificada y cantidad_recibida.', {'estado': 'pendiente', 'cantidad_planificada': 25, 'cantidad_recibida': 0}),
        ('tracking_received', 'Diferenciar planificación y recepción', '¿Cuál es el estado de EVAL-002 y cuántas unidades se planificaron y recibieron? Devuelve solo JSON con las claves estado, cantidad_planificada y cantidad_recibida.', {'estado': 'recibido', 'cantidad_planificada': 15, 'cantidad_recibida': 15}),
        ('tracking_missing', 'Seguimiento inexistente', '¿Existe algún seguimiento del SKU EVAL-999? Devuelve solo JSON con la clave existe (booleano). No inventes registros.', {'existe': False}),
    ]:
        cases.append(dict(id=case_id, name=title, agent='seguimiento', prompt=prompt,
                          expected_tool='consultar_seguimientos', expected_args=expected,
                          fixture={'followups': records}, data_source='casos sintéticos; no se consulta ni modifica inventario'))
    return cases


def parse_tracking_answer(text):
    """Accept raw JSON or a single fenced JSON object; never extract an invented value."""
    text = (text or '').strip()
    match = re.fullmatch(r'```(?:json)?\s*(.*?)\s*```', text, flags=re.DOTALL | re.IGNORECASE)
    if match:
        text = match.group(1)
    result = json.loads(text)
    if not isinstance(result, dict):
        raise ValueError('Se esperaba un objeto JSON')
    return result


def summarize(cases):
    evaluated = [c for c in cases if isinstance(c.get('passed'), bool)]
    passed = sum(c['passed'] is True for c in evaluated)
    return dict(total_cases=len(cases), evaluated_cases=len(evaluated),
                not_evaluated=len(cases)-len(evaluated), passed=passed,
                failed=len(evaluated)-passed,
                compliance_pct=round(passed/len(evaluated)*100, 2) if evaluated else None)


def normalize(value):
    return ' '.join(value.split()).casefold() if isinstance(value, str) else value


def matches_tool(case, calls):
    # No credit for extra tools or wrong/missing arguments. Comparison order is immaterial.
    if len(calls) != 1 or calls[0].get('name') != case['expected_tool']:
        return False
    actual = calls[0].get('args') or {}
    expected = case['expected_args']
    if set(actual) != set(expected):
        return False
    if case['expected_tool'] == 'comparar_productos':
        return all(isinstance(v, str) for v in actual.values()) and sorted(normalize(v) for v in actual.values()) == sorted(normalize(v) for v in expected.values())
    def same(a, e):
        # A whole numeric value may arrive as 5.0 in the provider response; booleans are not quantities.
        if type(e) is int:
            return type(a) in (int, float) and a == e
        return type(a) is type(e) and normalize(a) == normalize(e)
    return all(same(actual[k], v) for k,v in expected.items())


def provider_error(exc):
    """Return safe error category without disclosing credentials or provider payload."""
    chain = [exc]
    while getattr(chain[-1], '__cause__', None) and chain[-1].__cause__ not in chain:
        chain.append(chain[-1].__cause__)
    msg = ' '.join(str(e).lower() for e in chain)
    code = next((str(getattr(e, 'code', '') or getattr(e, 'status_code', '')) for e in chain if getattr(e, 'code', None) or getattr(e, 'status_code', None)), '')
    if code == '429' or any(x in msg for x in ('429', 'quota', 'resource_exhausted', 'límite de consultas')):
        return 'quota', 'Cuota de Gemini agotada o límite de frecuencia alcanzado.'
    if code in ('500','502','503','504') or any(x in msg for x in ('503', 'unavailable', 'no está disponible temporalmente')):
        return 'unavailable', 'Gemini no está disponible temporalmente.'
    if any('timeout' in type(e).__name__.lower() for e in chain) or 'tiempo de espera' in msg or 'timed out' in msg:
        return 'timeout', 'Tiempo de espera agotado en Gemini.'
    if 'gemini_api_key' in msg or 'no está configurada' in msg or code in ('401','403','404') or any(f'http {n}' in msg for n in ('401','403','404')):
        return 'configuration', 'Revisar GEMINI_API_KEY, GEMINI_MODEL y permisos del backend.'
    if code == '400' or 'http 400' in msg:
        return 'request', 'Gemini rechazó la configuración de la solicitud (HTTP 400). Revisar SDK/modelo.'
    return 'provider_error', 'No se pudo ejecutar la consulta de Gemini; revisar logs del backend.'


def response_payload(analysis_id, model, cases):
    return dict(analysis_id=str(analysis_id), model=model, evaluated_at=datetime.now(timezone.utc).isoformat(),
                protocol_version='2.0', evaluation_type='agent_interpretation_read_only', uses_gemini=True,
                modifies_inventory=False, summary=summarize(cases), cases=cases,
                by_agent={a:summarize([c for c in cases if c['agent']==a]) for a in ('inventario','seguimiento')},
                note='Cumplimiento sobre casos ejecutados. El Analista evalúa selección y argumentos; el Gestor evalúa intención de cambio de estado y consistencia de consultas estructuradas con casos sintéticos. No evalúa la calidad completa de las respuestas ni modifica inventario.')
