
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

import {
  mlService,
  multiAgentService,
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

  const baseName = name || "AnÃ¡lisis de inventario";

  if (dateLabel) {
    return `${baseName} â€” ${dateLabel}`;
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

  const loadFollowups = async () => {
    const response = await multiAgentService.listFollowups();
    setFollowups(response.data);
  };

  useEffect(() => {
    mlService.listAnalyses()
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : [];
        setAnalyses(list);
        if (list.length) setAnalysisId(String(list[0].id));
      })
      .catch(() => toast.error("No se pudieron cargar los anÃ¡lisis"));

    loadFollowups()
      .catch(() => toast.error("No se pudieron cargar los seguimientos"));
  }, []);

  const sendMessage = async (event) => {
    event.preventDefault();
    const question = message.trim();
    if (!question || loading) return;

    if (agent === "colaboracion" && !analysisId) {
      toast.error("Selecciona un anÃ¡lisis para la colaboraciÃ³n");
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
      toast.error("Selecciona un seguimiento y escribe la acciÃ³n");
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
        toast.error(data.detail || "AcciÃ³n no vÃ¡lida");
        return;
      }

      if (!data.requires_confirmation) {
        toast(data.message || "No se identificÃ³ un cambio");
        return;
      }

      setPreview(data);
    } catch (error) {
      toast.error(
        error.response?.data?.detail ||
        "No se pudo preparar la acciÃ³n"
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
          text: `Se confirmÃ³ el cambio de ${data.status} para el seguimiento seleccionado.`,
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
          : "No se pudo confirmar la acciÃ³n"
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
          PredicciÃ³n, reabastecimiento y seguimiento con agentes de IA.
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
              <option value="automatico">SelecciÃ³n automÃ¡tica</option>
              <option value="inventario">Agente 1: Inventario</option>
              <option value="seguimiento">Agente 2: Seguimiento</option>
              <option value="colaboracion">ColaboraciÃ³n de ambos</option>
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span>AnÃ¡lisis de inventario</span>
            <select
              className={inputClass}
              value={analysisId}
              onChange={e => {
                setAnalysisId(e.target.value);
                setMessages([]);
              }}
            >
              <option value="">Sin anÃ¡lisis seleccionado</option>

{analyses.map(a => (
  <option key={a.id} value={a.id}>
    {getAnalysisLabel(a)}
  </option>
))}

            </select>
          </label>
        </div>

        <div className="min-h-48 max-h-96 space-y-3 overflow-y-auto rounded-lg bg-slate-50 p-4">
          {messages.length === 0 && (
            <p className="text-sm text-slate-500">
              Pregunta quÃ© medicamentos necesitan reabastecimiento
              o cuÃ¡les tienen seguimientos pendientes.
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
                  ? "TÃº"
                  : `FarmaStock AI Â· ${item.selectedAgent || "Asistente"}`}
              </p>
              <p className="whitespace-pre-wrap">{item.text}</p>
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
            placeholder="Â¿QuÃ© medicamentos debo reabastecer y cuÃ¡les siguen pendientes?"
          />
          <button className={buttonClass} disabled={loading || !message.trim()}>
            {loading ? "Procesando..." : "Enviar consulta"}
          </button>
        </form>
      </section>

      <section className="rounded-xl border bg-white p-5 space-y-4">
        <h2 className="font-semibold text-slate-900">
          Seguimiento de reposiciones
        </h2>

        <p className="text-sm text-slate-600">
          Selecciona un seguimiento y solicita una acciÃ³n.
          NingÃºn cambio se guardarÃ¡ sin confirmaciÃ³n.
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
      {`${productLabel} Â· ${skuLabel} Â· ${f.status} Â· ${f.planned_units} unidades${dateLabel ? ` Â· ${dateLabel}` : ""}`}
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
            placeholder="Por ejemplo: Pospon esta reposiciÃ³n porque el proveedor aÃºn no entregÃ³."
          />

          <button
            className={buttonClass}
            disabled={loading || !followupId || !actionMessage.trim()}
          >
            {loading ? "Procesando..." : "Preparar acciÃ³n con Gemini"}
          </button>
        </form>

        {preview && (
          <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
            <h3 className="font-semibold text-slate-900">
              ConfirmaciÃ³n requerida
            </h3>
            <p className="text-sm">{preview.message}</p>
            <p className="text-sm">
              Estado actual: <strong>{preview.current_status}</strong>
              {" â†’ "}
              Estado propuesto: <strong>{preview.proposed_status}</strong>
            </p>
            <p className="text-xs text-slate-600">
              Esta acciÃ³n cambia el estado del seguimiento, no el stock.
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
    </div>
  );
}
