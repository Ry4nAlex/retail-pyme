import { useEffect, useRef, useState } from 'react'
import { mlService } from '../services/api'
import IngestPage from './IngestPage'
import {
  Upload, Database, Trash2, Eye, FileText, CheckCircle2, XCircle, Clock,
  Loader2, Brain, PackageSearch, AlertTriangle, TrendingUp, Boxes,
  Gauge, Timer, Activity, Server, Zap, RefreshCw,
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, BarChart, Bar, Legend, ReferenceLine, ReferenceArea,
  ComposedChart, Area, Cell,
} from 'recharts'

const TYPES = [
  { value: 'sales_history', label: 'Historial de ventas', desc: 'Transacciones historicas de ventas: fecha, producto, cantidad e ingresos' },
  { value: 'inventory_history', label: 'Historial de inventario', desc: 'Registros de movimientos de stock en el tiempo' },
  { value: 'external_demand', label: 'Demanda externa', desc: 'Demanda del mercado o senales externas' },
  { value: 'custom', label: 'Personalizado', desc: 'Cualquier conjunto de datos estructurado para entrenar modelos' },
]

const DATASET_TYPE_LABELS = Object.fromEntries(TYPES.map((type) => [type.value, type.label]))

const StatusBadge = ({ status }) => {
  const map = {
    ready: { cls: 'badge-green', icon: CheckCircle2, label: 'Listo' },
    failed: { cls: 'badge-red', icon: XCircle, label: 'Fallido' },
    pending: { cls: 'badge-yellow', icon: Clock, label: 'Pendiente' },
    processing: { cls: 'badge-blue', icon: Loader2, label: 'Procesando' },
  }
  const { cls, icon: Icon, label } = map[status] || map.pending
  return <span className={cls}><Icon className="w-3 h-3" />{label}</span>
}

const statusLabels = {
  todos: 'Todos',
  sobre_stock: 'Sobre-stock',
  bajo_stock: 'Bajo-stock',
  saludable: 'Saludable',
}

export function DatasetsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900" style={{ fontFamily: "'Sora', sans-serif" }}>Conjunto de datos</h1>
        <p className="text-slate-500 text-sm mt-0.5">Carga unificada de productos, inventario y ventas de la empresa</p>
      </div>

      <IngestPage embedded />
    </div>
  )
}

// ───────── Helpers de formato ─────────
const fmtMs = (ms) => (ms == null ? '-' : ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`)
const pctTxt = (v) => (v == null ? '-' : `${v}%`)
const monthLbl = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('es-PE', { month: 'short', year: '2-digit' })

// ───────── Calidad del modelo (split 70/20/10, solo val + test) ─────────
function ModelQualityCard({ metrics }) {
  if (!metrics) return null
  const val = metrics.validation || {}
  const test = metrics.test || {}
  const rows = [
    ['R²', val.r2, test.r2, 'Varianza explicada (1 = perfecto)'],
    ['WAPE', pctTxt(val.wape), pctTxt(test.wape), 'Error ponderado por volumen (retail)'],
    ['Precisión', pctTxt(val.forecast_accuracy_pct), pctTxt(test.forecast_accuracy_pct), '100 − WAPE'],
    ['MAE', val.mae, test.mae, 'Error medio absoluto (u)'],
    ['RMSE', val.rmse, test.rmse, 'Penaliza errores grandes'],
    ['MAPE', pctTxt(val.mape), pctTxt(test.mape), 'Error porcentual medio'],
  ]
  const split = metrics.target_split || '70/20/10'
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2"><Brain className="w-4 h-4 text-blue-500" />Calidad del modelo</h3>
        <span className="badge-blue">Split {split}</span>
      </div>
      <p className="text-xs text-slate-400 mb-4">
        Entrenamiento <b>{metrics.n_train}</b> ({metrics.train_pct}%) · Validación <b>{metrics.n_val}</b> ({metrics.val_pct}%) · Test <b>{metrics.n_test}</b> ({metrics.test_pct}%).
        Del train no se reportan resultados: solo validación y test.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
              <th className="py-2">Métrica</th>
              <th className="py-2 text-right">Validación (20%)</th>
              <th className="py-2 text-right">Test (10%)</th>
              <th className="py-2 pl-3 hidden sm:table-cell">Qué mide</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([k, v, t, desc]) => (
              <tr key={k} className="border-b border-slate-50">
                <td className="py-2 font-medium text-slate-700">{k}</td>
                <td className="py-2 text-right tabular-nums text-slate-800">{v ?? '-'}</td>
                <td className="py-2 text-right tabular-nums font-semibold text-slate-900">{t ?? '-'}</td>
                <td className="py-2 pl-3 text-xs text-slate-400 hidden sm:table-cell">{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ───────── Gráfica de validación: demanda real vs predicha ─────────
function ValidationChart({ evalSeries }) {
  if (!evalSeries) return null
  const v = evalSeries.validation || []
  const t = evalSeries.test || []
  if (!v.length && !t.length) return null
  const data = [
    ...v.map((d) => ({ label: monthLbl(d.month), real: d.real, pred: d.pred, set: 'Validación' })),
    ...t.map((d) => ({ label: monthLbl(d.month), real: d.real, pred: d.pred, set: 'Test' })),
  ]
  const testFrom = t.length ? monthLbl(t[0].month) : null
  const testTo = t.length ? monthLbl(t[t.length - 1].month) : null
  return (
    <div className="card p-5">
      <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2 mb-1"><Activity className="w-4 h-4 text-emerald-500" />Validación del modelo: demanda real vs predicha</h3>
      <p className="text-xs text-slate-400 mb-4">
        Comparación mes a mes en los datos que el modelo <b>no vio al entrenar</b> (validación + test). Mientras más juntas las líneas, mejor pronostica.
      </p>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 5, right: 14, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          {testFrom && <ReferenceArea x1={testFrom} x2={testTo} fill="#f59e0b" fillOpacity={0.07} label={{ value: 'Test', position: 'insideTopRight', fontSize: 10, fill: '#d97706' }} />}
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} />
          <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
          <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12, border: '1px solid #e2e8f0' }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line name="Real" type="monotone" dataKey="real" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 3 }} />
          <Line name="Predicho" type="monotone" dataKey="pred" stroke="#10b981" strokeWidth={2.5} strokeDasharray="5 4" dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ───────── Métricas operativas cloud ─────────
function CloudMetricsCard({ cloud, onRefresh, refreshing }) {
  if (!cloud) return null
  const big = [
    { icon: Timer, color: 'text-blue-500', label: 'Tiempo total de procesamiento', value: fmtMs(cloud.total_processing_ms), sub: `${cloud.records_processed?.toLocaleString('es-PE') || '-'} registros` },
    { icon: Gauge, color: 'text-violet-500', label: 'Latencia promedio API', value: fmtMs(cloud.api_latency_ms), sub: `${cloud.availability_checks || 0} mediciones` },
    { icon: Zap, color: 'text-amber-500', label: 'Throughput', value: cloud.throughput_rps != null ? `${cloud.throughput_rps.toLocaleString('es-PE')}` : '-', sub: 'registros / segundo' },
    { icon: Server, color: 'text-emerald-500', label: 'Disponibilidad en pruebas', value: cloud.availability_pct != null ? `${cloud.availability_pct}%` : '-', sub: 'health-checks OK' },
  ]
  const stages = (cloud.stages_ms || []).map((s) => ({ name: s.stage, ms: s.ms }))
  const palette = ['#3b82f6', '#6366f1', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444']
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2"><Activity className="w-4 h-4 text-violet-500" />Métricas operativas cloud</h3>
        {onRefresh && (
          <button onClick={onRefresh} disabled={refreshing} className="text-xs flex items-center gap-1 text-slate-500 hover:text-slate-800 disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />Medir en vivo
          </button>
        )}
      </div>
      <p className="text-xs text-slate-400 mb-4">
        Evaluación operativa del flujo: subir dataset → backend → ETL → BD → modelo → dashboard. Procesamiento bajo demanda y respuesta del sistema.
      </p>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
        {big.map((m) => (
          <div key={m.label} className="rounded-xl border border-slate-200 p-3">
            <m.icon className={`w-4 h-4 ${m.color}`} />
            <p className="text-[11px] text-slate-400 mt-1 leading-tight">{m.label}</p>
            <p className="text-xl font-bold text-slate-900 mt-0.5">{m.value}</p>
            <p className="text-[11px] text-slate-400">{m.sub}</p>
          </div>
        ))}
      </div>
      {stages.length > 0 && (
        <>
          <p className="text-xs font-medium text-slate-500 mb-2">Tiempo por etapa (ms)</p>
          <ResponsiveContainer width="100%" height={Math.max(160, stages.length * 34)}>
            <BarChart data={stages} layout="vertical" barSize={16} margin={{ left: 12, right: 24 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} unit=" ms" />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} width={190} />
              <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} formatter={(v) => [`${v} ms`, 'Duración']} />
              <Bar dataKey="ms" radius={[0, 6, 6, 0]}>
                {stages.map((s, i) => <Cell key={i} fill={palette[i % palette.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </>
      )}
      {cloud.measured_at && <p className="text-[11px] text-slate-300 mt-3">Medido: {new Date(cloud.measured_at).toLocaleString('es-PE')}</p>}
    </div>
  )
}

export function PredictionsPage() {
  const [analyses, setAnalyses] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [result, setResult] = useState(null)
  const [status, setStatus] = useState('todos')
  const [selectedProductId, setSelectedProductId] = useState('')
  const [loading, setLoading] = useState(true)
  const [liveCloud, setLiveCloud] = useState(null)
  const [refreshingCloud, setRefreshingCloud] = useState(false)

  const refreshCloud = async () => {
    setRefreshingCloud(true)
    try {
      const r = await mlService.cloudMetricsLive()
      setLiveCloud(r.data)
      toast.success('Latencia y disponibilidad actualizadas')
    } catch {
      toast.error('No se pudo medir el servicio en vivo')
    } finally {
      setRefreshingCloud(false)
    }
  }

  const openAnalysis = async (id) => {
    setSelectedId(id)
    setSelectedProductId('')
    setLiveCloud(null)
    try {
      const r = await mlService.getAnalysis(id)
      setResult(r.data.result)
    } catch {
      toast.error('No se pudo abrir el analisis')
    }
  }

  useEffect(() => {
    mlService.listAnalyses()
      .then((r) => {
        setAnalyses(r.data)
        if (r.data[0]) openAnalysis(r.data[0].id)
      })
      .catch(() => toast.error('No se pudieron cargar las predicciones'))
      .finally(() => setLoading(false))
  }, [])

  const summary = result?.summary
  const metrics = result?.metrics
  const cloud = result?.cloud_metrics
  // Si se midió en vivo, sobreescribe latencia/disponibilidad sobre las del análisis guardado
  const cloudMerged = cloud ? {
    ...cloud,
    api_latency_ms: liveCloud?.api_latency_ms ?? cloud.api_latency_ms,
    availability_pct: liveCloud?.availability_pct ?? cloud.availability_pct,
    availability_checks: liveCloud?.availability_checks ?? cloud.availability_checks,
    measured_at: liveCloud?.measured_at ?? cloud.measured_at,
  } : null
  const products = result?.products || []
  const filtered = products.filter((p) => status === 'todos' || p.status === status)
  const selectedProduct = filtered.find((p) => p.product_id === selectedProductId) || filtered[0]
  const histPts = (selectedProduct?.history_series || []).map((h) => ({
    label: monthLbl(h.month), real: h.quantity, pred: null,
  }))
  const fcPts = (selectedProduct?.forecast_series || []).map((f) => ({
    label: monthLbl(f.month), real: null, pred: f.forecast,
  }))
  // Puente: el último punto real también ancla el inicio del pronóstico (líneas conectadas)
  if (histPts.length && fcPts.length) histPts[histPts.length - 1].pred = histPts[histPts.length - 1].real
  const chartData = [...histPts, ...fcPts]
  const boundaryLabel = histPts.length ? histPts[histPts.length - 1].label : null
  const fcStart = fcPts.length ? fcPts[0].label : null
  const fcEnd = fcPts.length ? fcPts[fcPts.length - 1].label : null
  const ranking = filtered.slice(0, 10).map((p) => ({ name: p.product_name, demand: Number(p.forecast_demand_horizon || 0) }))

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-7 h-7 text-azure-500 animate-spin" /></div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900" style={{ fontFamily: "'Sora', sans-serif" }}>Predicciones</h1>
        <p className="text-slate-500 text-sm mt-0.5">Consulta pronosticos de demanda, cobertura y alertas por producto</p>
      </div>

      {analyses.length === 0 ? (
        <div className="card p-10 text-center">
          <PackageSearch className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="font-semibold text-slate-700">Aun no hay predicciones disponibles</p>
          <p className="text-sm text-slate-400 mt-1">Un administrador debe generar un analisis de stock para que aparezcan aqui.</p>
        </div>
      ) : (
        <>
          <div className="card p-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="field-label">Analisis base</label>
                <select className="field-input" value={selectedId} onChange={(e) => openAnalysis(e.target.value)}>
                  {analyses.map((a) => <option key={a.id} value={a.id}>{a.source_filename} - {new Date(a.created_at).toLocaleDateString('es-PE')}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label">Estado</label>
                <div className="grid grid-cols-4 gap-1 rounded-xl bg-slate-100 p-1">
                  {Object.entries(statusLabels).map(([key, label]) => (
                    <button key={key} onClick={() => setStatus(key)} className={`text-xs rounded-lg px-2 py-2 font-medium transition ${status === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="field-label">Producto</label>
                <select className="field-input" value={selectedProduct?.product_id || ''} onChange={(e) => setSelectedProductId(e.target.value)}>
                  {filtered.map((p) => <option key={p.product_id} value={p.product_id}>{p.product_name}</option>)}
                </select>
              </div>
            </div>
          </div>

          {summary && (
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="stat-card"><Brain className="w-5 h-5 text-blue-500" /><p className="text-sm text-slate-500">Productos pronosticados</p><p className="text-2xl font-bold">{summary.total_products}</p></div>
              <div className="stat-card"><AlertTriangle className="w-5 h-5 text-red-500" /><p className="text-sm text-slate-500">Sobre-stock</p><p className="text-2xl font-bold">{summary.overstock_count}</p></div>
              <div className="stat-card"><Boxes className="w-5 h-5 text-amber-500" /><p className="text-sm text-slate-500">Bajo-stock</p><p className="text-2xl font-bold">{summary.understock_count}</p></div>
              <div className="stat-card"><TrendingUp className="w-5 h-5 text-emerald-500" /><p className="text-sm text-slate-500">Horizonte</p><p className="text-2xl font-bold">{summary.horizon_months}m</p></div>
            </div>
          )}

          {(metrics || cloudMerged) && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              <ModelQualityCard metrics={metrics} />
              <ValidationChart evalSeries={metrics?.eval_series} />
            </div>
          )}

          <CloudMetricsCard cloud={cloudMerged} onRefresh={refreshCloud} refreshing={refreshingCloud} />

          {selectedProduct && (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
              <div className="card p-5 xl:col-span-2">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <h3 className="font-semibold text-slate-800 text-sm">{selectedProduct.product_name}</h3>
                    <p className="text-xs text-slate-400">{selectedProduct.category} - stock {selectedProduct.current_stock} u</p>
                  </div>
                  <span className={selectedProduct.status === 'sobre_stock' ? 'badge-red' : selectedProduct.status === 'bajo_stock' ? 'badge-yellow' : 'badge-green'}>
                    {statusLabels[selectedProduct.status]}
                  </span>
                </div>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={chartData} margin={{ top: 5, right: 12, left: -14, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    {fcStart && <ReferenceArea x1={fcStart} x2={fcEnd} fill="#10b981" fillOpacity={0.06} label={{ value: 'Pronóstico', position: 'insideTopRight', fontSize: 10, fill: '#059669' }} />}
                    {boundaryLabel && <ReferenceLine x={boundaryLabel} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: 'Hoy', position: 'top', fontSize: 10, fill: '#64748b' }} />}
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                    <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12, border: '1px solid #e2e8f0' }} formatter={(v, n) => [v == null ? '-' : `${v} u`, n]} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line name="Demanda real" type="monotone" dataKey="real" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 2 }} connectNulls />
                    <Line name="Pronóstico XGBoost" type="monotone" dataKey="pred" stroke="#10b981" strokeWidth={2.5} strokeDasharray="5 4" dot={{ r: 3 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
                <p className="text-xs text-slate-400 mt-2">
                  Línea azul: ventas reales por mes. Línea verde punteada (zona sombreada): demanda que el modelo proyecta para los próximos {summary?.horizon_months || 3} meses.
                </p>
              </div>

              <div className="card p-5">
                <h3 className="font-semibold text-slate-800 text-sm mb-4">Lectura rapida</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-slate-200 p-3"><p className="text-xs text-slate-400">Demanda mensual</p><p className="font-bold text-slate-800">{selectedProduct.avg_monthly_demand} u</p></div>
                  <div className="rounded-xl border border-slate-200 p-3"><p className="text-xs text-slate-400">Cobertura</p><p className="font-bold text-slate-800">{selectedProduct.days_of_coverage} d</p></div>
                  <div className="rounded-xl border border-slate-200 p-3"><p className="text-xs text-slate-400">Faltante</p><p className="font-bold text-amber-600">{selectedProduct.understock_units} u</p></div>
                  <div className="rounded-xl border border-slate-200 p-3"><p className="text-xs text-slate-400">Exceso</p><p className="font-bold text-red-600">{selectedProduct.overstock_units} u</p></div>
                </div>
                <p className="mt-4 text-sm text-slate-600 leading-relaxed">{selectedProduct.reasoning}</p>
              </div>
            </div>
          )}

          <div className="card p-5">
            <h3 className="font-semibold text-slate-800 text-sm mb-4">Mayor demanda proyectada</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={ranking} layout="vertical" barSize={18} margin={{ left: 12, right: 18 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} width={150} />
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="demand" fill="#2563eb" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  )
}
