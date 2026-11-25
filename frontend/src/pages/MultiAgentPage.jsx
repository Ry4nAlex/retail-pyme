
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import toast from "react-hot-toast";

import {
  mlService,
  multiAgentService,
  productsService,
} from "../services/api";


function getAnalysisLabel(analysis) {
  const name = (
    analysis.name ||
    analysis.title ||
    ""
  ).trim();

  const dateValue =
    analysis.created_at ||
    analysis.createdAt ||
    analysis.analysis_date ||
    analysis.analyzed_at;

  let dateLabel = "";

  if (dateValue) {
    const date = new Date(dateValue);

    if (!Number.isNaN(date.getTime())) {
      dateLabel = new Intl.DateTimeFormat("es-PE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "America/Lima",
      }).format(date);
    }
  }

  const baseName = name || "An\u00e1lisis de inventario";

  if (dateLabel) {
    return `${baseName} \u2014 ${dateLabel}`;
  }

  return `${baseName} (${String(analysis.id).slice(0, 8)})`;
}


export default function MultiAgentPage() {
  const [analyses, setAnalyses] = useState([]);
  const [analysisId, setAnalysisId] = useState("");
  const [followups, setFollowups] = useState([]);
  const [followupId, setFollowupId] = useState("");

  const [agent, setAgent] = useState("automatico");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);

  const [actionMessage, setActionMessage] = useState("");
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);

  // Selección de cualquier producto del catálogo, sin obligar a entrenar XGBoost.
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogMatches, setCatalogMatches] = useState([]);
  const [selectedCatalogId, setSelectedCatalogId] = useState("");
  const [stockRule, setStockRule] = useState(null);
  const [stockRulePlanned, setStockRulePlanned] = useState("");
  const [stockRuleBusy, setStockRuleBusy] = useState(false);

  // Los medicamentos se crean desde el módulo Productos existente.
  // Esta sección solo registra seguimientos recomendados por un análisis real.
  const [recommendedProducts, setRecommendedProducts] = useState([]);
  const [recommendationSku, setRecommendationSku] = useState("");
  const [plannedUnits, setPlannedUnits] = useState("");
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [selectedFollowupData, setSelectedFollowupData] = useState(null);
  const [productStock, setProductStock] = useState(null);
  const [receiptArmed, setReceiptArmed] = useState(false);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [receiptResult, setReceiptResult] = useState(null);


  const loadFollowups = async () => {
    const response = await multiAgentService.listFollowups();
    const list = Array.isArray(response.data) ? response.data : [];
    setFollowups(list);
    return list;
  };

  const lookupCatalog = async () => {
    const query = catalogSearch.trim();
    if (!query) return toast.error("Escribe el SKU o nombre del medicamento");
    setStockRuleBusy(true);
    setCatalogMatches([]);
    setSelectedCatalogId("");
    setStockRule(null);
    try {
      const { data } = await productsService.list({ search: query, page: 1, size: 50 });
      const matches = data?.items || [];
      setCatalogMatches(matches);
      if (!matches.length) toast("No se encontraron productos con ese nombre o SKU");
    } catch (error) {
      toast.error(error.response?.data?.detail || "No se pudo consultar el catálogo");
    } finally {
      setStockRuleBusy(false);
    }
  };

  const consultInventoryRule = async () => {
    if (!selectedCatalogId) return;
    setStockRuleBusy(true);
    try {
      const { data } = await multiAgentService.chat({
        agent: "inventario",
        product_id: selectedCatalogId,
        message: "¿Conviene reabastecer este producto según sus niveles actuales de stock?",
      });
      setStockRule(data.recommendation || null);
      setStockRulePlanned(String(data.recommendation?.recommended_units || ""));
      setMessages(prev => [...prev,
        { role: "user", text: `¿Conviene reabastecer ${data.recommendation?.product_name} según sus niveles de stock?` },
        { role: "assistant", text: data.response, selectedAgent: "inventario" },
      ]);
    } catch (error) {
      toast.error(error.response?.data?.detail || "No se pudo generar la recomendación");
    } finally {
      setStockRuleBusy(false);
    }
  };

  const registerStockRuleFollowup = async () => {
    if (!stockRule || Number(stockRule.recommended_units) <= 0) return;
    const planned = Number(stockRulePlanned);
    if (!Number.isInteger(planned) || planned <= 0) {
      return toast.error("Ingresa una cantidad planificada válida");
    }
    if (!window.confirm(
      `¿Registrar reposición de ${planned} unidades para ${stockRule.product_name}? ` +
      "Se guardará como regla de stock, NO como predicción XGBoost."
    )) return;
    setStockRuleBusy(true);
    try {
      const { data } = await multiAgentService.createFromStockRule({
        product_id: selectedCatalogId,
        planned_units: planned,
        notes: "Seguimiento aceptado desde React; recomendación por regla de stock (no XGBoost)",
      });
      await loadFollowups();
      setFollowupId(data.id);
      setPreview(null);
      toast.success("Seguimiento pendiente registrado. Continúa con el agente 2.");
    } catch (error) {
      const detail = error.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "No se pudo registrar el seguimiento");
    } finally {
      setStockRuleBusy(false);
    }
  };

  // Cargar las recomendaciones guardadas. Un producto solo es elegible
  // si el análisis seleccionado recomienda reponer unidades (understock_units > 0).
  useEffect(() => {
    let active = true;
    setRecommendedProducts([]);
    setRecommendationSku("");
    setPlannedUnits("");
    if (!analysisId) return () => { active = false; };
    setRecommendationLoading(true);
    mlService.getAnalysis(analysisId)
      .then(({ data }) => {
        if (!active) return;
        const products = Array.isArray(data?.result?.products)
          ? data.result.products : [];
        setRecommendedProducts(products.filter(p =>
          Number(p.understock_units) > 0 && p.product_id
        ));
      })
      .catch(() => {
        if (active) toast.error("No se pudieron consultar las recomendaciones del análisis");
      })
      .finally(() => {
        if (active) setRecommendationLoading(false);
      });
    return () => { active = false; };
  }, [analysisId]);

  // Mostrar stock actualizado desde el catálogo, no desde un análisis histórico.
  useEffect(() => {
    let active = true;
    setProductStock(null);
    const selected = followups.find(f => String(f.id) === String(followupId));
    setSelectedFollowupData(selected || null);
    if (!selected?.product_id) return () => { active = false; };
    productsService.get(selected.product_id)
      .then(({ data }) => { if (active) setProductStock(data); })
      .catch(() => { if (active) setProductStock(null); });
    return () => { active = false; };
  }, [followupId, followups]);

  useEffect(() => {
    setReceiptResult(null);
    setReceiptArmed(false);
  }, [followupId]);

  const createFollowupFromAnalysis = async (event) => {
    event.preventDefault();
    if (loading || !analysisId || !recommendationSku) return;
    const recommendation = recommendedProducts.find(
      p => String(p.product_id) === String(recommendationSku)
    );
    const qty = Number(plannedUnits);
    if (!Number.isInteger(qty) || qty <= 0) {
      toast.error("Indica una cantidad entera mayor que cero");
      return;
    }
    if (!recommendation) return;
    setLoading(true);
    try {
      // La API de productos usa UUID; el análisis ML usa SKU.
      // Buscamos la coincidencia exacta para evitar crear un seguimiento incorrecto.
      const { data: catalog } = await productsService.list({
        search: recommendationSku,
        page: 1,
        size: 100,
      });
      const product = (catalog?.items || []).find(p =>
        String(p.sku).toLowerCase() === String(recommendationSku).toLowerCase()
      );
      if (!product) {
        toast.error("Ese SKU no existe en Productos. Regístralo primero en el módulo Productos.");
        return;
      }
      const { data } = await multiAgentService.createFollowup({
        analysis_id: analysisId,
        product_id: product.id,
        planned_units: qty,
        notes: "Seguimiento creado desde el asistente multiagente",
      });
      const updated = await loadFollowups();
      const created = updated.find(f => f.id === data.id);
      setFollowupId(data.id);
      setPreview(null);
      toast.success(`Seguimiento creado para ${created?.product_name || product.name}`);
    } catch (error) {
      const detail = error.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "No se pudo crear el seguimiento");
    } finally {
      setLoading(false);
    }
  };

  const receiveFollowup = async () => {
    const selected = selectedFollowupData;
    if (!selected || receiptBusy || !receiptArmed) return;
    if (selected.status !== "pendiente" || Number(selected.received_units) !== 0) {
      toast.error("Solo puedes recibir un seguimiento pendiente sin unidades recibidas");
      return;
    }
    const qty = Number(selected.planned_units);
    if (!Number.isInteger(qty) || qty <= 0) return;
    const confirmed = window.confirm(
      `¿Confirmas que realmente se recibieron ${qty} unidades de ${selected.product_name} (${selected.product_sku})? ` +
      "Esta operación cambiará el stock REAL del producto y registrará un movimiento de inventario."
    );
    if (!confirmed) return;
    setReceiptBusy(true);
    const stockBefore = productStock?.stock ?? null;
    try {
      const { data } = await multiAgentService.receiveFollowup(selected.id, {
        received_units: qty,
        confirmed: true,
        notes: "Recepción confirmada por usuario desde el asistente multiagente",
      });
      const [productResponse] = await Promise.all([
        productsService.get(selected.product_id),
        loadFollowups(),
      ]);
      const stockAfter = productResponse.data.stock;
      setProductStock(productResponse.data);
      setReceiptResult({
        stockBefore,
        stockAfter,
        quantity: qty,
        followupId: data.id,
        status: data.status,
        reference: `REPL-${data.id}`,
      });
      setReceiptArmed(false);
      toast.success("Recepción registrada. Stock actualizado.");
    } catch (error) {
      const detail = error.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "No se pudo confirmar la recepción");
      setReceiptArmed(false);
    } finally {
      setReceiptBusy(false);
    }
  };

  useEffect(() => {
    mlService.listAnalyses()
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : [];
        setAnalyses(list);
        if (list.length) setAnalysisId(String(list[0].id));
      })
      .catch(() => toast.error("No se pudieron cargar los análisis"));

    loadFollowups()
      .catch(() => toast.error("No se pudieron cargar los seguimientos"));
  }, []);

  const sendMessage = async (event) => {
    event.preventDefault();
    const question = message.trim();
    if (!question || loading) return;

    if (agent === "colaboracion" && !analysisId && !selectedCatalogId && !followupId) {
      toast.error("Selecciona un análisis, medicamento o seguimiento para la colaboración");
      return;
    }

    setMessages(prev => [
      ...prev,
      { role: "user", text: question },
    ]);
    setMessage("");
    setLoading(true);

    try {
      const { data } = await multiAgentService.chat({
        message: question,
        agent,
        analysis_id: analysisId || null,
        product_id: agent === "seguimiento" ? null : (selectedCatalogId || null),
        followup_id: followupId || null,
        history: messages.slice(-10).map(item => ({
          role: item.role,
          content: item.text.slice(0, 1500),
        })),
      });

      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          text: data.response,
          selectedAgent: data.selected_agent,
          agentsUsed: data.agents_used,
        },
      ]);
    } catch (error) {
      const detail = error.response?.data?.detail;
      toast.error(
        typeof detail === "string"
          ? detail
          : "No se pudo consultar al asistente"
      );
    } finally {
      setLoading(false);
    }
  };

  const prepareAction = async (event) => {
    event.preventDefault();

    if (!followupId || !actionMessage.trim() || loading) {
      toast.error("Selecciona un seguimiento y escribe la acción");
      return;
    }

    setPreview(null);
    setLoading(true);

    try {
      const { data } = await multiAgentService.previewAction({
        followup_id: followupId,
        message: actionMessage.trim(),
      });

      if (!data.success) {
        toast.error(data.detail || "Acción no válida");
        return;
      }

      if (!data.requires_confirmation) {
        toast(data.message || "No se identificó un cambio");
        return;
      }

      setPreview(data);
    } catch (error) {
      toast.error(
        error.response?.data?.detail ||
        "No se pudo preparar la acción"
      );
    } finally {
      setLoading(false);
    }
  };

  const confirmAction = async () => {
    if (!preview || loading) return;

    setLoading(true);

    try {
      const { data } = await multiAgentService.confirmAction({
        followup_id: preview.followup_id,
        expected_status: preview.current_status,
        proposed_status: preview.proposed_status,
        confirmed: true,
        notes: preview.proposed_action?.body?.notes ?? null,
      });

      toast.success("Seguimiento actualizado correctamente");

      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          text: `Se confirmó el cambio de ${data.status} para el seguimiento seleccionado.`,
          selectedAgent: "seguimiento",
        },
      ]);

      setPreview(null);
      setActionMessage("");
      await loadFollowups();
    } catch (error) {
      const detail = error.response?.data?.detail;
      toast.error(
        typeof detail === "string"
          ? detail
          : "No se pudo confirmar la acción"
      );
      setPreview(null);
      await loadFollowups().catch(() => {});
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "w-full rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-800";

  const buttonClass =
    "rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Asistente multiagente
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Predicción, reabastecimiento y seguimiento con agentes de IA.
        </p>
      </div>

      <section className="rounded-xl border bg-white p-5 space-y-4">
        <h2 className="font-semibold text-slate-900">
          Consulta a los agentes
        </h2>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span>Agente</span>
            <select
              className={inputClass}
              value={agent}
              onChange={e => setAgent(e.target.value)}
            >
              <option value="automatico">Selección automática</option>
              <option value="inventario">Agente 1: Inventario</option>
              <option value="seguimiento">Agente 2: Seguimiento</option>
              <option value="colaboracion">Colaboración de ambos</option>
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span>Análisis de inventario</span>
            <select
              className={inputClass}
              value={analysisId}
              onChange={e => {
                setAnalysisId(e.target.value);
                setMessages([]);
              }}
            >
              <option value="">Sin análisis seleccionado</option>

{analyses.map(a => (
  <option key={a.id} value={a.id}>
    {getAnalysisLabel(a)}
  </option>
))}

            </select>
          </label>
        </div>

        <p className="text-xs text-slate-600">
          {selectedCatalogId
            ? "Consulta vinculada al producto seleccionado en «Del agente 1 al agente 2». Se usa su stock actual de Productos."
            : followupId
              ? "Consulta vinculada al producto del seguimiento seleccionado."
              : "Para consultar el stock vigente de un medicamento concreto, selecciónalo en el buscador inferior o escribe su SKU exacto."}
          {analysisId ? " Los análisis históricos conservan el stock registrado en su fecha." : ""}
        </p>

        <div className="min-h-48 max-h-96 space-y-3 overflow-y-auto rounded-lg bg-slate-50 p-4">
          {messages.length === 0 && (
            <p className="text-sm text-slate-500">
              Pregunta qué medicamentos necesitan reabastecimiento
              o cuáles tienen seguimientos pendientes.
            </p>
          )}

          {messages.map((item, index) => (
            <div
              key={index}
              className={`rounded-lg p-3 text-sm ${
                item.role === "user"
                  ? "ml-8 bg-blue-100"
                  : "mr-8 border bg-white"
              }`}
            >
              <p className="mb-1 font-semibold">
                {item.role === "user"
                  ? "Tú"
                  : `FarmaStock AI · ${item.selectedAgent || "Asistente"}`}
              </p>

{item.role === "assistant" ? (
  <div className="text-sm leading-relaxed text-slate-700 [&_p]:mb-3 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1">
    <ReactMarkdown>
      {item.text || ""}
    </ReactMarkdown>
  </div>
) : (
  <p className="whitespace-pre-wrap">{item.text}</p>
)}

            </div>
          ))}
        </div>

        <form onSubmit={sendMessage} className="space-y-3">
          <textarea
            className={inputClass}
            rows={3}
            maxLength={1000}
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="¿Qué medicamentos debo reabastecer y cuáles siguen pendientes?"
          />
          <button className={buttonClass} disabled={loading || !message.trim()}>
            {loading ? "Procesando..." : "Enviar consulta"}
          </button>
        </form>
      </section>

      <section className="rounded-xl border bg-white p-5 space-y-4">
        <h2 className="font-semibold text-slate-900">Del agente 1 al agente 2 — cualquier producto</h2>
        <p className="text-sm text-slate-600">
          Busca cualquier medicamento del módulo <strong>Productos</strong>. El agente 1 consulta sus
          niveles de stock y, si está bajo el mínimo, propone reponer hasta el máximo.
          Puedes aceptar una cantidad y registrar un seguimiento para el agente 2, sin subir un dataset nuevo.
          <strong> Esta recomendación se calcula con reglas de stock, no con XGBoost.</strong>
          Para utilizar pronósticos XGBoost selecciona un análisis histórico existente en la sección siguiente.
        </p>
        <div className="flex flex-wrap gap-2">
          <input className={`${inputClass} flex-1 min-w-48`} value={catalogSearch}
            onChange={e => setCatalogSearch(e.target.value)} placeholder="SKU o nombre del medicamento" />
          <button type="button" className={buttonClass} disabled={stockRuleBusy}
            onClick={lookupCatalog}>Buscar en Productos</button>
        </div>
        {catalogMatches.length > 0 && (
          <label className="block space-y-1 text-sm">
            <span>Medicamento del catálogo</span>
            <select className={inputClass} value={selectedCatalogId}
              onChange={e => {
                setSelectedCatalogId(e.target.value);
                setStockRule(null);
                setStockRulePlanned("");
              }}>
              <option value="">Seleccionar medicamento</option>
              {catalogMatches.map(p => (
                <option key={p.id} value={p.id}>{p.name} · {p.sku} · stock {p.stock}</option>
              ))}
            </select>
          </label>
        )}
        <button type="button" className={buttonClass}
          disabled={!selectedCatalogId || stockRuleBusy}
          onClick={consultInventoryRule}>Consultar recomendación del agente 1</button>
        {stockRule && (
          <div className="rounded-lg border p-4 space-y-3 text-sm">
            <p><strong>{stockRule.product_name}</strong> · {stockRule.sku}</p>
            <p>Stock actual: <strong>{stockRule.current_stock}</strong> ·
              mínimo: <strong>{stockRule.min_stock}</strong> ·
              máximo: <strong>{stockRule.max_stock}</strong></p>
            <p>Reposición sugerida por regla: <strong>{stockRule.recommended_units}</strong> unidades.</p>
            <p className="text-amber-700">No es una predicción XGBoost. {stockRule.explanation}</p>
            {stockRule.recommended_units > 0 && (
              <div className="flex gap-2 flex-wrap items-end">
                <label className="block space-y-1">
                  <span>Unidades a planificar</span>
                  <input className={inputClass} type="number" min="1" step="1"
                    value={stockRulePlanned} onChange={e => setStockRulePlanned(e.target.value)} />
                </label>
                <button type="button" className={buttonClass} disabled={stockRuleBusy}
                  onClick={registerStockRuleFollowup}>
                  Aceptar y enviar seguimiento al agente 2
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-white p-5 space-y-4">
        <h2 className="font-semibold text-slate-900">Registrar seguimiento desde un análisis</h2>
        <p className="text-sm text-slate-600">
          Primero crea el medicamento en <strong>Productos</strong> y analiza sus ventas en
          <strong> Análisis y reabastecimiento</strong>. Después selecciona aquí el mismo
          análisis y un producto recomendado. No se crean productos ni análisis ficticios automáticamente.
        </p>
        <form onSubmit={createFollowupFromAnalysis} className="space-y-3">
          <label className="block space-y-1 text-sm">
            <span>Producto recomendado en el análisis seleccionado</span>
            <select className={inputClass} value={recommendationSku}
              onChange={e => {
                setRecommendationSku(e.target.value);
                const rec = recommendedProducts.find(p => String(p.product_id) === e.target.value);
                setPlannedUnits(rec ? String(Math.round(Number(rec.understock_units))) : "");
              }}>
              <option value="">Seleccionar medicamento</option>
              {recommendedProducts.map(p => (
                <option key={String(p.product_id)} value={String(p.product_id)}>
                  {`${p.product_name || p.product_id} · ${p.product_id} · ${p.understock_units} recomendadas`}
                </option>
              ))}
            </select>
          </label>
          {!recommendationLoading && analysisId && recommendedProducts.length === 0 && (
            <p className="text-sm text-amber-700">
              El análisis seleccionado no contiene productos con recomendación positiva de reposición.
              Puedes seleccionar otro análisis o utilizar la opción de regla de stock del catálogo sin cargar un dataset.
            </p>
          )}
          <label className="block space-y-1 text-sm">
            <span>Unidades que se planifica reponer</span>
            <input className={inputClass} type="number" min="1" step="1"
              value={plannedUnits} onChange={e => setPlannedUnits(e.target.value)} />
          </label>
          <button type="submit" className={buttonClass}
            disabled={loading || recommendationLoading || !recommendationSku}>
            Registrar seguimiento pendiente
          </button>
        </form>
      </section>

      <section className="rounded-xl border bg-white p-5 space-y-4">
        <h2 className="font-semibold text-slate-900">
          Seguimiento de reposiciones
        </h2>

        <p className="text-sm text-slate-600">
          Selecciona un seguimiento y solicita una acción.
          Ningún cambio se guardará sin confirmación.
        </p>

        <form onSubmit={prepareAction} className="space-y-3">
          <select
            className={inputClass}
            value={followupId}
            onChange={e => {
              setFollowupId(e.target.value);
              setPreview(null);
            }}
          >
            <option value="">Seleccionar seguimiento</option>


{followups.map(f => {
  const createdAt = f.created_at
    ? new Date(f.created_at)
    : null;

  const dateLabel =
    createdAt && !Number.isNaN(createdAt.getTime())
      ? new Intl.DateTimeFormat("es-PE", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          timeZone: "America/Lima",
        }).format(createdAt)
      : "";

  const productLabel =
    f.product_name || "Producto sin nombre";

  const skuLabel =
    f.product_sku || "Sin SKU";

  return (
    <option key={f.id} value={f.id}>
      {`${productLabel} · ${skuLabel} · ${f.status} · ${f.planned_units} unidades${dateLabel ? ` · ${dateLabel}` : ""}`}
    </option>
  );
})}


          </select>

          <textarea
            className={inputClass}
            rows={2}
            maxLength={1000}
            value={actionMessage}
            onChange={e => {
              setActionMessage(e.target.value);
              setPreview(null);
            }}
            placeholder="Por ejemplo: Pospon esta reposición porque el proveedor aún no entregó."
          />

          <button
            className={buttonClass}
            disabled={loading || !followupId || !actionMessage.trim()}
          >
            {loading ? "Procesando..." : "Preparar acción con Gemini"}
          </button>
        </form>

        {preview && (
          <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
            <h3 className="font-semibold text-slate-900">
              Confirmación requerida
            </h3>
            <p className="text-sm">{preview.message}</p>
            <p className="text-sm">
              Estado actual: <strong>{preview.current_status}</strong>
              {" → "}
              Estado propuesto: <strong>{preview.proposed_status}</strong>
            </p>
            <p className="text-xs text-slate-600">
              Esta acción cambia el estado del seguimiento, no el stock.
            </p>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className={buttonClass}
                disabled={loading}
                onClick={confirmAction}
              >
                Confirmar cambio
              </button>
              <button
                type="button"
                className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
                disabled={loading}
                onClick={() => setPreview(null)}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-white p-5 space-y-4">
        <h2 className="font-semibold text-slate-900">Recepción de reabastecimiento</h2>
        <p className="text-sm text-slate-600">
          Utiliza el seguimiento seleccionado arriba, de cualquier medicamento. Confirma la recepción
          <strong> solo cuando las unidades hayan llegado realmente</strong>: esta operación actualiza
          el inventario de la empresa y registra un movimiento. Para ensayos de exposición usa un
          producto ficticio creado en el módulo Productos.
        </p>
        {selectedFollowupData ? (
          <div className="space-y-2 rounded-lg bg-slate-50 p-4 text-sm">
            <p><strong>Medicamento:</strong> {selectedFollowupData.product_name}</p>
            <p><strong>SKU:</strong> {selectedFollowupData.product_sku}</p>
            <p><strong>Estado:</strong> {selectedFollowupData.status}</p>
            <p><strong>Planificadas:</strong> {selectedFollowupData.planned_units}</p>
            <p><strong>Recibidas:</strong> {selectedFollowupData.received_units}</p>
            <p><strong>Stock actual del catálogo:</strong> {productStock?.stock ?? "Cargando..."}</p>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Selecciona un seguimiento en la sección anterior.</p>
        )}
        {selectedFollowupData?.status === "pendiente" &&
         Number(selectedFollowupData.received_units) === 0 && (
          <>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={receiptArmed}
                onChange={e => setReceiptArmed(e.target.checked)} />
              Confirmo que recibí físicamente {selectedFollowupData.planned_units} unidades de
              {" "}{selectedFollowupData.product_name} y autorizo actualizar su stock.
            </label>
            <button type="button" className={buttonClass}
              disabled={!receiptArmed || receiptBusy || loading}
              onClick={receiveFollowup}>
              {receiptBusy ? "Registrando..." : "Confirmar recepción"}
            </button>
          </>
        )}
        {receiptResult && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm space-y-1">
            <p className="font-semibold">Recepción registrada correctamente</p>
            <p>Estado: {receiptResult.status}</p>
            <p>Unidades recibidas: {receiptResult.quantity}</p>
            <p>Stock anterior: {receiptResult.stockBefore ?? "Sin dato previo"}</p>
            <p>Stock actual: {receiptResult.stockAfter}</p>
            <p>Referencia de movimiento esperada: {receiptResult.reference}</p>
          </div>
        )}
      </section>
    </div>
  );
}
