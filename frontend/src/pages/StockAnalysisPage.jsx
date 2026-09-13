import { useEffect, useState } from 'react'
import { mlService } from '../services/api'
import {
  Upload, FileText, Loader2, PackageSearch, AlertTriangle, TrendingUp,
  TrendingDown, Minus, DollarSign, CheckCircle2, Boxes, Activity,
  ChevronDown, ChevronUp, Trash2, History, Wifi, WifiOff, Brain, Info,
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, BarChart, Bar, ReferenceLine, Legend,
} from 'recharts'

const STATUS = {
  sobre_stock: { label: 'Sobre-stock', badge: 'badge-red', dot: '#ef4444', icon: AlertTriangle },
  bajo_stock:  { label: 'Bajo-stock',  badge: 'badge-yellow', dot: '#f59e0b', icon: Boxes },
  saludable:   { label: 'Saludable',   badge: 'badge-green', dot: '#10b981', icon: CheckCircle2 },
}
const TREND = {
  creciente:   { label: 'Creciente',   icon: TrendingUp,   cls: 'text-emerald-600' },
  decreciente: { label: 'Decreciente', icon: TrendingDown, cls: 'text-red-500' },
  estable:     { label: 'Estable',     icon: Minus,        cls: 'text-slate-400' },
}
const money = (v) => (v == null ? '-' : `S/ ${Number(v).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
const formatDateTimePE = (value) => {
  if (!value) return '-'

  const hasTimezone = /Z$|[+-]\d{2}:\d{2}$/.test(value)
  const date = new Date(hasTimezone ? value : `${value}Z`)

  if (Number.isNaN(date.getTime())) return '-'

  return date.toLocaleString('es-PE', {
    timeZone: 'America/Lima',
  })
}
const monthLabel = (iso) => {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('es-PE', { month: 'short', year: '2-digit' })
}

function SummaryCard({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <p className="text-2xl font-bold text-slate-900 mt-1" style={{ fontFamily: "'Sora', sans-serif" }}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function ProductRow({ p }) {
  const [open, setOpen] = useState(false)
  const st = STATUS[p.status] || STATUS.saludable
  const tr = TREND[p.trend] || TREND.estable
  const TrendIcon = tr.icon
  const chartData = [
    ...(p.history_series || []).map((h) => ({ m: monthLabel(h.month), real: h.quantity, pred: null })),
    ...(p.forecast_series || []).map((f) => ({ m: monthLabel(f.month), real: null, pred: f.forecast })),
  ]
  return (
    <>
      <tr className="table-row cursor-pointer" onClick={() => setOpen((o) => !o)}>
        <td className="table-td">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ background: st.dot }} />
            <div>
              <p className="font-medium text-slate-800 text-sm">{p.product_name}</p>
              <p className="text-xs text-slate-400">{p.category}</p>
            </div>
          </div>
        </td>
        <td className="table-td"><span className={st.badge}>{st.label}</span></td>
        <td className="table-td text-sm">
          <span className="font-semibold text-slate-700">{p.current_stock}</span>
          <span className="text-xs text-slate-400 ml-1">({p.stock_source})</span>
        </td>
        <td className="table-td text-sm text-slate-600">{p.avg_monthly_demand} <span className="text-xs text-slate-400">u/mes</span></td>
        <td className="table-td text-sm">
          <span className={p.days_of_coverage >= 75 ? 'text-red-600 font-semibold' : p.days_of_coverage <= 30 ? 'text-amber-600 font-semibold' : 'text-slate-600'}>
            {p.days_of_coverage} d
          </span>
        </td>
        <td className="table-td text-sm">
          {p.overstock_units > 0 && <span className="text-red-600 font-medium">+{p.overstock_units} u</span>}
          {p.understock_units > 0 && <span className="text-amber-600 font-medium">-{p.understock_units} u</span>}
          {p.overstock_units === 0 && p.understock_units === 0 && <span className="text-slate-400">-</span>}
        </td>
        <td className="table-td text-sm text-slate-600">{p.excess_value ? money(p.excess_value) : '-'}</td>
        <td className="table-td">
          <span className={`inline-flex items-center gap-1 text-xs font-medium ${tr.cls}`}>
            <TrendIcon className="w-3.5 h-3.5" />{tr.label}
          </span>
        </td>
        <td className="table-td text-slate-400">{open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={9} className="bg-slate-50/60 px-6 py-5">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2">
                <p className="text-xs font-semibold text-slate-500 mb-2">Demanda histórica y pronóstico XGBoost</p>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={chartData} margin={{ top: 5, right: 10, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="m" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                    <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12, border: '1px solid #e2e8f0' }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line name="Real" type="monotone" dataKey="real" stroke="#3b82f6" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                    <Line name="Pronóstico" type="monotone" dataKey="pred" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col gap-3">
                <div className="rounded-xl bg-white border border-slate-200 p-3">
                  <p className="text-xs text-slate-400">Recomendación</p>
                  <p className="text-sm text-slate-700 mt-1 leading-snug">{p.reasoning}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl bg-white border border-slate-200 p-3">
                    <p className="text-xs text-slate-400">Stock objetivo</p>
                    <p className="font-semibold text-slate-700">{p.target_stock} u</p>
                  </div>
                  <div className="rounded-xl bg-white border border-slate-200 p-3">
                    <p className="text-xs text-slate-400">Se agota aprox.</p>
                    <p className="font-semibold text-slate-700">{p.depletion_date}</p>
                  </div>
                  <div className="rounded-xl bg-white border border-slate-200 p-3">
                    <p className="text-xs text-slate-400">Demanda {p.horizon_months}m</p>
                    <p className="font-semibold text-slate-700">{p.forecast_demand_horizon} u</p>
                  </div>
                  <div className="rounded-xl bg-white border border-slate-200 p-3">
                    <p className="text-xs text-slate-400">Precio unit.</p>
                    <p className="font-semibold text-slate-700">{p.unit_price ? money(p.unit_price) : '-'}</p>
                  </div>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}


// function RetailMetricsCard({ metrics, importance }) {
//   if (!metrics) return null
//   const impData = Object.entries(importance || {}).slice(0, 8).map(([k, v]) => ({ feature: k, value: Number((v * 100).toFixed(1)) }))
//   const pct = (v) => v == null || v === '-' ? '-' : `${Number(v).toFixed(2)}%`
//   const splitLabel = metrics.target_split || '70/20/10'
//   const val = metrics.validation || {}
//   const test = metrics.test || metrics
//   const periods = metrics.periods || {}
//   const fmtP = (p) => p && p.from ? `${p.from} -> ${p.to}` : '-'
//   const metricRows = [
//     ['Split temporal', splitLabel, `${metrics.n_val ?? '-'} reg. (${metrics.val_pct ?? '-'}%)`, `${metrics.n_test ?? '-'} reg. (${metrics.test_pct ?? '-'}%)`, `train ${metrics.n_train ?? '-'} (${metrics.train_pct ?? '-'}%)`, 'Split cronologico 70/20/10. Del train no se reportan resultados, solo validacion y test.'],
//     ['R2', '', val.r2 ?? '-', test.r2 ?? '-', '', 'Capacidad para explicar la variacion de demanda (1 = perfecto).'],
//     ['WAPE', '', pct(val.wape), pct(test.wape), '', 'Error ponderado por volumen; metrica clave en retail.'],
//     ['Precision forecast', '', pct(val.forecast_accuracy_pct), pct(test.forecast_accuracy_pct), '', 'Precision global aproximada: 100 - WAPE.'],
//     ['MAPE', '', pct(val.mape), pct(test.mape), '', 'Error porcentual medio; sensible a productos con baja demanda.'],
//     ['MAE', '', val.mae ?? '-', test.mae ?? '-', '', 'Error promedio en unidades vendidas.'],
//     ['RMSE', '', val.rmse ?? '-', test.rmse ?? '-', '', 'Penaliza errores grandes y picos mal pronosticados.'],
//     ['Sesgo', '', pct(val.bias_pct), pct(test.bias_pct), '', 'Negativo subestima demanda; positivo sobreestima.'],
//   ]
//   const cards = [
//     ['Split', splitLabel, 'train / validacion / test'],
//     ['Registros', `${metrics.n_train ?? '-'}/${metrics.n_val ?? '-'}/${metrics.n_test ?? '-'}`, 'train/val/test'],
//     ['R2 validacion', val.r2 ?? '-', 'desempeno en validacion'],
//     ['R2 test', test.r2 ?? '-', 'desempeno fuera de muestra'],
//     ['WAPE test', pct(test.wape), 'error retail ponderado'],
//     ['Precision forecast', pct(test.forecast_accuracy_pct), '100 - WAPE'],
//   ]
//   return (
//     <div className="card p-6">
//       <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
//         <Brain className="w-4 h-4 text-azure-500" /> Calidad del modelo XGBoost
//       </h3>
//       <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
//         <div>
//           <div className="grid grid-cols-2 gap-3">
//             {cards.map(([k, v, s]) => (
//               <div key={k} className="rounded-xl border border-slate-200 p-3">
//                 <p className="text-xs text-slate-400">{k}</p>
//                 <p className="text-xl font-bold text-slate-800" style={{ fontFamily: "'Sora', sans-serif" }}>{v}</p>
//                 <p className="text-[11px] text-slate-400">{s}</p>
//               </div>
//             ))}
//           </div>
//           <p className="mt-3 text-xs text-slate-400">
//             Granularidad: <b className="text-slate-600">{metrics.granularity || 'monthly'}</b> | Train/Val/Test: {metrics.n_train}/{metrics.n_val}/{metrics.n_test} registros
//           </p>
//           <p className="mt-1 text-xs text-slate-400">Val: {fmtP(periods.validation)} | Test: {fmtP(periods.test)}</p>
//           {metrics.split_note && <p className="mt-1 text-xs text-slate-400">{metrics.split_note}</p>}
//         </div>
//         <div>
//           <p className="text-xs font-semibold text-slate-500 mb-2">Importancia de variables (%)</p>
//           <ResponsiveContainer width="100%" height={230}>
//             <BarChart data={impData} layout="vertical" margin={{ top: 0, right: 12, left: 12, bottom: 0 }}>
//               <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} />
//               <YAxis type="category" dataKey="feature" tick={{ fontSize: 10, fill: '#64748b' }} width={70} />
//               <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
//               <Bar dataKey="value" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
//             </BarChart>
//           </ResponsiveContainer>
//         </div>
//       </div>
//       <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200">
//         <table className="w-full text-sm">
//           <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
//             <tr>{['Metrica', 'Validacion (20%)', 'Test (10%)', 'Interpretacion'].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr>
//           </thead>
//           <tbody>
//             {metricRows.map(([name, _t, valValue, testValue, _g, interpretation]) => (
//               <tr key={name} className="border-t border-slate-100">
//                 <td className="px-3 py-2 font-semibold text-slate-800">{name}</td>
//                 <td className="px-3 py-2 text-slate-700">{valValue}</td>
//                 <td className="px-3 py-2 font-semibold text-slate-900">{testValue}</td>
//                 <td className="px-3 py-2 text-slate-500">{interpretation}</td>
//               </tr>
//             ))}
//           </tbody>
//         </table>
//       </div>
//     </div>
//   )
// }

function RetailMetricsCard({ metrics, importance }) {
  if (!metrics) return null

  const impData = Object.entries(importance || {})
    .slice(0, 8)
    .map(([k, v]) => ({
      feature: k,
      value: Number((v * 100).toFixed(1))
    }))

  const pct = (v) =>
    v == null || v === '-'
      ? '-'
      : `${Number(v).toFixed(2)}%`

  const splitLabel = metrics.target_split || '80/20'
  const test = metrics.test || metrics
  const periods = metrics.periods || {}

  const fmtP = (p) =>
    p && p.from
      ? `${p.from} -> ${p.to}`
      : '-'

  const metricRows = [
    [
      'R²',
      test.r2 ?? '-',
      'Capacidad para explicar la variación de demanda.'
    ],
    [
      'WAPE',
      pct(test.wape),
      'Error ponderado por volumen.'
    ],
    [
      'Precisión forecast',
      pct(test.forecast_accuracy_pct),
      'Precisión global aproximada: 100 - WAPE.'
    ],
    [
      'MAPE',
      pct(test.mape),
      'Error porcentual medio.'
    ],
    [
      'MAE',
      test.mae ?? '-',
      'Error promedio en unidades vendidas.'
    ],
    [
      'RMSE',
      test.rmse ?? '-',
      'Penaliza errores de mayor magnitud.'
    ],
    [
      'Sesgo',
      pct(test.bias_pct),
      'Negativo subestima demanda; positivo sobreestima.'
    ],
  ]

  const cards = [
    [
      'Split',
      splitLabel,
      'entrenamiento / prueba'
    ],
    [
      'Registros',
      `${metrics.n_train ?? '-'}/${metrics.n_test ?? '-'}`,
      'train / test'
    ],
    [
      'Meses',
      `${metrics.n_train_months ?? '-'}/${metrics.n_test_months ?? '-'}`,
      'train / test'
    ],
    [
      'R² test',
      test.r2 ?? '-',
      'desempeño fuera de muestra'
    ],
    [
      'WAPE test',
      pct(test.wape),
      'error ponderado'
    ],
    [
      'Precisión forecast',
      pct(test.forecast_accuracy_pct),
      '100 - WAPE'
    ],
  ]

  return (
    <div className="card p-6">
      <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
        <Brain className="w-4 h-4 text-azure-500" />
        Calidad del modelo XGBoost
      </h3>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div>
          <div className="grid grid-cols-2 gap-3">
            {cards.map(([k, v, s]) => (
              <div
                key={k}
                className="rounded-xl border border-slate-200 p-3"
              >
                <p className="text-xs text-slate-400">
                  {k}
                </p>

                <p
                  className="text-xl font-bold text-slate-800"
                  style={{ fontFamily: "'Sora', sans-serif" }}
                >
                  {v}
                </p>

                <p className="text-[11px] text-slate-400">
                  {s}
                </p>
              </div>
            ))}
          </div>

          <p className="mt-3 text-xs text-slate-400">
            Granularidad:{' '}
            <b className="text-slate-600">
              {metrics.granularity || 'monthly'}
            </b>
            {' | '}
            Train/Test: {metrics.n_train}/{metrics.n_test} registros
          </p>

          <p className="mt-1 text-xs text-slate-400">
            Train: {fmtP(periods.train)}
            {' | '}
            Test: {fmtP(periods.test)}
          </p>

          {metrics.split_note && (
            <p className="mt-1 text-xs text-slate-400">
              {metrics.split_note}
            </p>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold text-slate-500 mb-2">
            Importancia de variables (%)
          </p>

          <ResponsiveContainer width="100%" height={230}>
            <BarChart
              data={impData}
              layout="vertical"
              margin={{
                top: 0,
                right: 12,
                left: 12,
                bottom: 0
              }}
            >
              <XAxis
                type="number"
                tick={{ fontSize: 10, fill: '#94a3b8' }}
              />

              <YAxis
                type="category"
                dataKey="feature"
                tick={{ fontSize: 10, fill: '#64748b' }}
                width={70}
              />

              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  fontSize: 12
                }}
              />

              <Bar
                dataKey="value"
                fill="#8b5cf6"
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              {[
                'Métrica',
                'Test (20%)',
                'Interpretación'
              ].map((h) => (
                <th
                  key={h}
                  className="px-3 py-2 font-semibold"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {metricRows.map(([name, value, interpretation]) => (
              <tr
                key={name}
                className="border-t border-slate-100"
              >
                <td className="px-3 py-2 font-semibold text-slate-800">
                  {name}
                </td>

                <td className="px-3 py-2 font-semibold text-slate-900">
                  {value}
                </td>

                <td className="px-3 py-2 text-slate-500">
                  {interpretation}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function StockAnalysisPage() {
  const [result, setResult] = useState(null)
  const [analyses, setAnalyses] = useState([])
  const [mlOnline, setMlOnline] = useState(null)
  const [filter, setFilter] = useState('todos')

  const loadAnalyses = () => mlService.listAnalyses().then((r) => setAnalyses(r.data)).catch(() => {})
  useEffect(() => {
    loadAnalyses()
    mlService.mlHealth().then((r) => setMlOnline(r.data.reachable)).catch(() => setMlOnline(false))
  }, [])

  const handleAnalyze = async () => {
    if (!file) { toast.error('Selecciona un archivo primero'); return }
    const fd = new FormData()
    fd.append('file', file)
    fd.append('horizon_months', horizon)
    fd.append('overstock_threshold_days', thresholds.over)
    fd.append('understock_threshold_days', thresholds.under)
    fd.append('target_coverage_days', thresholds.target)
    setLoading(true)
    try {
      const r = await mlService.analyzeStock(fd)
      setResult(r.data.result)
      toast.success('Análisis completado')
      loadAnalyses()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'No se pudo analizar el archivo')
    } finally { setLoading(false) }
  }

  const openAnalysis = async (id) => {
    try { const r = await mlService.getAnalysis(id); setResult(r.data.result) } catch { toast.error('No se pudo abrir') }
  }
  const removeAnalysis = async (id, e) => {
    e.stopPropagation()
    if (!confirm('¿Eliminar este análisis?')) return
    try { await mlService.deleteAnalysis(id); toast.success('Eliminado'); loadAnalyses() } catch { toast.error('Error') }
  }

  const summary = result?.summary
  const products = (result?.products || []).filter((p) => filter === 'todos' || p.status === filter)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900" style={{ fontFamily: "'Sora', sans-serif" }}>Análisis de stock con IA</h1>
          <p className="text-slate-500 text-sm mt-0.5">Revisa los análisis generados desde la carga unificada</p>
        </div>
        {mlOnline !== null && (
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg ${mlOnline ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
            {mlOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            Microservicio ML {mlOnline ? 'conectado' : 'sin conexión'}
          </span>
        )}
      </div>

      {false && (
      /* Upload */
      <div className="card p-6 hidden">
        <h3 className="font-semibold text-slate-800 mb-5 flex items-center gap-2"><PackageSearch className="w-4 h-4 text-azure-500" /> Subir historial de ventas</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="md:col-span-2">
            <label className="field-label">Archivo <span className="text-slate-400 font-normal">(CSV, XLSX, XLS)</span></label>
            <div className="border-2 border-dashed border-slate-200 rounded-xl p-5 text-center cursor-pointer hover:border-azure-400 hover:bg-azure-50/50 transition-all" onClick={() => fileRef.current?.click()}>
              <FileText className="w-6 h-6 text-slate-400 mx-auto mb-2" />
              <p className="text-sm text-slate-600 font-medium">{file ? file.name : 'Haz clic para seleccionar un archivo'}</p>
              <p className="text-xs text-slate-400 mt-1">Columnas: fecha, producto, cantidad (opcional: stock_actual, precio)</p>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => setFile(e.target.files[0])} />
            </div>
          </div>
          <div>
            <label className="field-label">Meses a pronosticar</label>
            <select className="field-input" value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}>
              {[1, 2, 3, 4, 6].map((m) => <option key={m} value={m}>{m} {m === 1 ? 'mes' : 'meses'}</option>)}
            </select>
            <button onClick={() => setAdvanced((a) => !a)} className="text-xs text-azure-600 mt-3 flex items-center gap-1">
              {advanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />} Opciones avanzadas
            </button>
          </div>
        </div>

        {advanced && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 p-4 bg-slate-50 rounded-xl">
            <div>
              <label className="field-label">Umbral sobre-stock (días)</label>
              <input type="number" className="field-input" value={thresholds.over} onChange={(e) => setThresholds({ ...thresholds, over: Number(e.target.value) })} />
            </div>
            <div>
              <label className="field-label">Umbral bajo-stock (días)</label>
              <input type="number" className="field-input" value={thresholds.under} onChange={(e) => setThresholds({ ...thresholds, under: Number(e.target.value) })} />
            </div>
            <div>
              <label className="field-label">Cobertura objetivo (días)</label>
              <input type="number" className="field-input" value={thresholds.target} onChange={(e) => setThresholds({ ...thresholds, target: Number(e.target.value) })} />
            </div>
          </div>
        )}

        <div className="mt-3 flex items-start gap-2 text-xs text-slate-400">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>Si tu archivo incluye una columna <b>stock_actual</b>, el análisis usa tu inventario real. Si no, se estima a partir de la demanda histórica (marcado como "estimado").</span>
        </div>

        <div className="mt-5">
          <button onClick={handleAnalyze} disabled={loading || !file} className="btn-primary">
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Analizando con XGBoost...</> : <><Activity className="w-4 h-4" /> Analizar stock</>}
          </button>
        </div>
      </div>
      )}

      {/* Results */}
      {summary && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <SummaryCard icon={Boxes} label="Productos" value={summary.total_products} color="#3b82f6" />
            <SummaryCard icon={AlertTriangle} label="Sobre-stock" value={summary.overstock_count} sub="exceso de inventario" color="#ef4444" />
            <SummaryCard icon={Boxes} label="Bajo-stock" value={summary.understock_count} sub="riesgo de quiebre" color="#f59e0b" />
            <SummaryCard icon={CheckCircle2} label="Saludables" value={summary.healthy_count} color="#10b981" />
            <SummaryCard icon={DollarSign} label="Capital inmovilizado" value={money(summary.total_excess_value)} sub="en exceso de stock" color="#8b5cf6" />
          </div>

          <RetailMetricsCard metrics={result.metrics} importance={result.feature_importance} />

          <div className="table-wrapper">
            <div className="card-header">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2"><PackageSearch className="w-4 h-4 text-slate-400" /> Resultado por producto</h3>
              <div className="flex gap-1">
                {['todos', 'sobre_stock', 'bajo_stock', 'saludable'].map((f) => (
                  <button key={f} onClick={() => setFilter(f)} className={`text-xs px-2.5 py-1 rounded-lg font-medium transition ${filter === f ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                    {f === 'todos' ? 'Todos' : STATUS[f].label}
                  </button>
                ))}
              </div>
            </div>
            <table className="w-full">
              <thead className="table-head">
                <tr>{['Producto', 'Estado', 'Stock', 'Demanda', 'Cobertura', 'Exceso/Falta', 'Capital', 'Tendencia', ''].map((h) => <th key={h} className="table-th">{h}</th>)}</tr>
              </thead>
              <tbody>
                {products.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-12 text-slate-400 text-sm">Sin productos en esta categoría</td></tr>
                ) : products.map((p) => <ProductRow key={p.product_id} p={p} />)}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* History */}
      <div className="table-wrapper">
        <div className="card-header">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2"><History className="w-4 h-4 text-slate-400" /> Análisis anteriores</h3>
          <span className="badge-slate">{analyses.length}</span>
        </div>
        <table className="w-full">
          <thead className="table-head">
            <tr>{['Archivo', 'Fecha', 'Productos', 'Sobre-stock', 'Split', 'WAPE', 'R²', 'Capital exceso', ''].map((h) => <th key={h} className="table-th">{h}</th>)}</tr>
          </thead>
          <tbody>
            {analyses.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-10 text-slate-400 text-sm">Aún no hay análisis</td></tr>
            ) : analyses.map((a) => (
              <tr key={a.id} className="table-row cursor-pointer" onClick={() => openAnalysis(a.id)}>
                <td className="table-td text-sm font-medium text-slate-700">{a.source_filename}</td>
                <td className="table-td text-xs text-slate-400">{formatDateTimePE(a.created_at)}</td>
                <td className="table-td text-sm text-slate-600">{a.total_products}</td>
                <td className="table-td"><span className={a.overstock_count > 0 ? 'badge-red' : 'badge-slate'}>{a.overstock_count}</span></td>
                <td className="table-td text-sm text-slate-600">{a.metrics?.target_split || '80/20'}</td>
                <td className="table-td text-sm text-slate-600">{a.metrics?.wape != null ? `${a.metrics.wape}%` : '-'}</td>
                <td className="table-td text-sm text-slate-600">{a.metrics?.r2 ?? '-'}</td>
                <td className="table-td text-sm text-slate-600">{money(a.excess_value)}</td>
                <td className="table-td"><button onClick={(e) => removeAnalysis(a.id, e)} className="btn-ghost py-1 px-2 text-red-500 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
