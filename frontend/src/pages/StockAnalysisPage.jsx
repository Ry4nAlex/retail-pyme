import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { mlService, agentService } from '../services/api'
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
const analysisDisplayMetrics = (analysis) => {

  const fullPaper =
    analysis
      ?.metrics
      ?.full_paper

  if (fullPaper) {

    const experiment =
      fullPaper
        ?.experiment
        ?.metrics
      || {}

    return {
      isFullPaper:
        true,

      split:
        `${
          fullPaper
            ?.design
            ?.development_months
          ?? 42
        }+${

          fullPaper
            ?.design
            ?.experiment_months
          ?? 6
        }`,

      wape:
        experiment.wape,

      r2:
        experiment.r2,
    }
  }

  return {
    isFullPaper:
      false,

    split:
      analysis
        ?.metrics
        ?.target_split
      || '80/20',

    wape:
      analysis
        ?.metrics
        ?.wape,

    r2:
      analysis
        ?.metrics
        ?.r2,
  }
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

function ProductRow({ p, onAgentAction }) {
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
                <div className="rounded-xl bg-white border border-slate-200 p-3">
                  <p className="text-xs font-semibold text-slate-500 mb-2">Acciones del asistente</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="px-3 py-2 text-xs border rounded-lg hover:bg-slate-50"
                      onClick={(e) => {
                        e.stopPropagation()
                        onAgentAction?.('product', p)
                      }}
                    >
                      Consultar
                    </button>
                    <button
                      type="button"
                      className="px-3 py-2 text-xs border rounded-lg hover:bg-slate-50"
                      onClick={(e) => {
                        e.stopPropagation()
                        onAgentAction?.('prediction', p)
                      }}
                    >
                      Ver predicción
                    </button>
                    <button
                      type="button"
                      className="px-3 py-2 text-xs border rounded-lg hover:bg-slate-50"
                      onClick={(e) => {
                        e.stopPropagation()
                        onAgentAction?.('simulate_restock', p)
                      }}
                    >
                      Simular reabastecimiento
                    </button>
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

function AblationExperimentCard({ ablation }) {
  if (!ablation || !ablation.results || !ablation.results.length) return null

  const rows = ablation.results

  const bestR2 = rows.reduce((best, row) => {
    if (best == null) return row
    if ((row.r2 ?? -Infinity) > (best.r2 ?? -Infinity)) return row
    return best
  }, null)

  const bestWape = rows.reduce((best, row) => {
    if (best == null) return row
    if ((row.wape ?? Infinity) < (best.wape ?? Infinity)) return row
    return best
  }, null)

  const labelMap = {
    sin_variables_temporales: 'Sin variables temporales',
    lag_1: 'Lag-1',
    lag_1_2_3: 'Lag-1, Lag-2, Lag-3',
    rolling_mean: 'Lags + Rolling Mean',
    modelo_completo: 'Modelo completo',
  }

  const fmtPct = (v) =>
    v == null || v === '-'
      ? '-'
      : `${Number(v).toFixed(2)}%`

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div>
          <h3 className="font-semibold text-slate-800">
            Experimento de ablación de variables
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            Evalúa cómo cambia el rendimiento al incorporar progresivamente
            variables temporales al modelo XGBoost.
          </p>
        </div>

        <span className="badge badge-blue">
          {rows.length} configuraciones
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        <div className="rounded-xl border border-slate-200 p-3">
          <p className="text-xs text-slate-400">Mejor R²</p>
          <p className="text-xl font-bold text-slate-800">
            {bestR2?.r2 ?? '-'}
          </p>
          <p className="text-[11px] text-slate-400">
            {labelMap[bestR2?.configuration] || bestR2?.configuration}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 p-3">
          <p className="text-xs text-slate-400">Menor WAPE</p>
          <p className="text-xl font-bold text-slate-800">
            {fmtPct(bestWape?.wape)}
          </p>
          <p className="text-[11px] text-slate-400">
            {labelMap[bestWape?.configuration] || bestWape?.configuration}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 p-3">
          <p className="text-xs text-slate-400">Split evaluado</p>
          <p className="text-xl font-bold text-slate-800">
            80/20
          </p>
          <p className="text-[11px] text-slate-400">
            Mismos meses y mismos hiperparámetros
          </p>
        </div>
      </div>

      <div className="mb-4 text-xs text-slate-500">
        Train: {ablation.train_period?.from} → {ablation.train_period?.to}
        {' | '}
        Test: {ablation.test_period?.from} → {ablation.test_period?.to}
        {' | '}
        Registros: {ablation.n_train}/{ablation.n_test}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              {[
                'Configuración',
                'N° vars',
                'R²',
                'WAPE',
                'MAE',
                'RMSE',
                'Δ WAPE vs anterior',
                'Δ RMSE vs anterior',
              ].map((h) => (
                <th key={h} className="px-3 py-2 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((row, idx) => {
              const isBest =
                row.configuration === bestWape?.configuration

              return (
                <tr
                  key={row.configuration}
                  className={`border-t border-slate-100 ${
                    isBest ? 'bg-emerald-50/40' : ''
                  }`}
                >
                  <td className="px-3 py-2 font-medium text-slate-800">
                    <div className="flex flex-col">
                      <span>
                        {labelMap[row.configuration] || row.configuration}
                      </span>
                      <span className="text-xs text-slate-400">
                        {row.features?.join(', ')}
                      </span>
                    </div>
                  </td>

                  <td className="px-3 py-2 text-slate-700">
                    {row.n_features}
                  </td>

                  <td className="px-3 py-2 font-semibold text-slate-900">
                    {row.r2 ?? '-'}
                  </td>

                  <td className="px-3 py-2 font-semibold text-slate-900">
                    {fmtPct(row.wape)}
                  </td>

                  <td className="px-3 py-2 text-slate-700">
                    {row.mae ?? '-'}
                  </td>

                  <td className="px-3 py-2 text-slate-700">
                    {row.rmse ?? '-'}
                  </td>

                  <td className="px-3 py-2 text-slate-700">
                    {fmtPct(row.wape_improvement_vs_previous_pct)}
                  </td>

                  <td className="px-3 py-2 text-slate-700">
                    {fmtPct(row.rmse_improvement_vs_previous_pct)}
                  </td>
                </tr>
              )
            })}
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
  const [currentAnalysisId, setCurrentAnalysisId] = useState(null)
  const [agentOpen, setAgentOpen] = useState(false)
  const [agentMessage, setAgentMessage] = useState('')
  const [agentLoading, setAgentLoading] = useState(false)
  const [simulationProduct, setSimulationProduct] = useState(null)
  const [simulationQuantity, setSimulationQuantity] = useState('')
  const [agentMessages, setAgentMessages] = useState([
  {
    role: 'assistant',
    content: 'Hola. Puedo ayudarte a consultar el estado del inventario, predicciones de demanda y recomendaciones de reabastecimiento.'
  }
])
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
      setCurrentAnalysisId(r.data.id)
      toast.success('Análisis completado')
      loadAnalyses()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'No se pudo analizar el archivo')
    } finally { setLoading(false) }
  }

  const openAnalysis = async (id) => {
  try {
    const r = await mlService.getAnalysis(id)

    setResult(r.data.result)
    setCurrentAnalysisId(r.data.id)
  } catch {
    toast.error('No se pudo abrir')
  }
}
const formatDirectActionResult = (action, data) => {
  if (action === 'low_stock') {
    if (!data?.length) return 'No se encontraron productos con bajo stock en este análisis.'

    return [
      `Productos con bajo stock: ${data.length}`,
      '',
      ...data.map((p, index) => {
        const deficit = p.understock_units ?? '-'
        const coverage = p.days_of_coverage ?? '-'
        const target = p.target_stock ?? '-'
        return `${index + 1}. ${p.product_name}\nStock actual: ${p.current_stock ?? '-'} u | Stock objetivo: ${target} u | Faltante: ${deficit} u | Cobertura: ${coverage} días`
      })
    ].join('\n')
  }

  if (action === 'overstock') {
    if (!data?.length) return 'No se encontraron productos con sobrestock en este análisis.'

    return [
      `Productos con sobrestock: ${data.length}`,
      '',
      ...data.map((p, index) => {
        const excess = p.overstock_units ?? '-'
        const coverage = p.days_of_coverage ?? '-'
        const target = p.target_stock ?? '-'
        return `${index + 1}. ${p.product_name}\nStock actual: ${p.current_stock ?? '-'} u | Stock objetivo: ${target} u | Exceso: ${excess} u | Cobertura: ${coverage} días`
      })
    ].join('\n')
  }

  if (!data?.found) {
    return data?.message || 'No se encontró información para el producto seleccionado.'
  }

  if (action === 'product') {
    const statusLabels = {
      bajo_stock: 'Bajo stock',
      sobre_stock: 'Sobrestock',
      saludable: 'Saludable',
    }

    return [
      `Producto: ${data.product_name}`,
      `Estado: ${statusLabels[data.status] || data.status || '-'}`,
      `Stock actual: ${data.current_stock ?? '-'} u`,
      `Stock objetivo: ${data.target_stock ?? '-'} u`,
      `Demanda mensual promedio: ${data.avg_monthly_demand ?? '-'} u`,
      `Cobertura: ${data.days_of_coverage ?? '-'} días`,
      `Predicción (${data.horizon_months ?? '-'} meses): ${data.forecast_demand_horizon ?? '-'} u`,
      `Tendencia: ${data.trend ?? '-'}`,
      data.depletion_date ? `Agotamiento estimado: ${data.depletion_date}` : null,
      data.reasoning ? `Recomendación: ${data.reasoning}` : null,
    ].filter(Boolean).join('\n')
  }

  if (action === 'prediction') {
    return [
      `Predicción de demanda: ${data.product_name}`,
      `Horizonte: ${data.horizon_months ?? '-'} meses`,
      `Demanda pronosticada: ${data.forecast_demand_horizon ?? '-'} u`,
      `Demanda mensual promedio: ${data.avg_monthly_demand ?? '-'} u`,
      `Tendencia: ${data.trend ?? '-'}`,
      '',
      'La predicción corresponde al modelo XGBoost del sistema.',
    ].join('\n')
  }

  if (action === 'simulate_restock') {
    const statusLabels = {
      bajo_stock: 'Bajo stock',
      sobre_stock: 'Sobrestock',
      stock_objetivo: 'Stock objetivo',
    }

    const difference = Number(data.difference_vs_target)
    const differenceText = Number.isFinite(difference)
      ? difference < 0
        ? `Faltan ${Math.abs(difference)} u para alcanzar el stock objetivo`
        : difference > 0
          ? `Supera el stock objetivo por ${difference} u`
          : 'Alcanza exactamente el stock objetivo'
      : 'Diferencia frente al objetivo no disponible'

    return [
      `Simulación de reabastecimiento: ${data.product_name}`,
      `Stock actual: ${data.current_stock ?? '-'} u`,
      `Cantidad simulada: +${data.quantity_to_add ?? '-'} u`,
      `Stock resultante: ${data.simulated_stock ?? '-'} u`,
      `Stock objetivo: ${data.target_stock ?? '-'} u`,
      `Resultado: ${differenceText}`,
      `Estado resultante: ${statusLabels[data.simulated_status] || data.simulated_status || '-'}`,
      '',
      data.note || 'Esta simulación no modifica el inventario real.',
    ].join('\n')
  }

  return 'Consulta completada.'
}

const runDirectAgentAction = async (action, userLabel, payload = {}) => {
  if (!currentAnalysisId || agentLoading) return

  setAgentMessages(prev => [
    ...prev,
    { role: 'user', content: userLabel }
  ])
  setAgentLoading(true)

  try {
    const response = await agentService.action({
      analysis_id: currentAnalysisId,
      action,
      ...payload
    })

    setAgentMessages(prev => [
      ...prev,
      {
        role: 'assistant',
        content: formatDirectActionResult(action, response.data.data)
      }
    ])
  } catch (error) {
    console.error('Error al ejecutar acción de inventario:', error)

    const detail =
      error.response?.data?.detail ||
      'No se pudo consultar la información del inventario.'

    setAgentMessages(prev => [
      ...prev,
      { role: 'assistant', content: `Error: ${detail}` }
    ])
  } finally {
    setAgentLoading(false)
  }
}


const handleProductAgentAction = (action, product) => {
  if (!product?.product_name) return

  if (action === 'simulate_restock') {
    setSimulationProduct(product)
    setSimulationQuantity('')
    setAgentOpen(true)
    return
  }

  setAgentOpen(true)

  if (action === 'product') {
    runDirectAgentAction(
      'product',
      `Consultar ${product.product_name}`,
      { product_name: product.product_name }
    )
    return
  }

  if (action === 'prediction') {
    runDirectAgentAction(
      'prediction',
      `Ver predicción de ${product.product_name}`,
      { product_name: product.product_name }
    )
  }
}

const submitRestockSimulation = async () => {
  if (!simulationProduct || agentLoading) return

  const quantity = Number(simulationQuantity)

  if (!Number.isInteger(quantity) || quantity <= 0) {
    toast.error('Ingresa una cantidad entera mayor que cero')
    return
  }

  const product = simulationProduct
  setSimulationProduct(null)
  setSimulationQuantity('')

  await runDirectAgentAction(
    'simulate_restock',
    `Simular +${quantity} unidades de ${product.product_name}`,
    {
      product_name: product.product_name,
      quantity
    }
  )
}

const getAgentErrorMessage = (error) => {
  const status = error.response?.status
  const detail = error.response?.data?.detail

  if (status === 429) {
    return detail || 'El servicio de IA alcanzó temporalmente su límite de consultas. Las acciones directas de inventario siguen disponibles.'
  }

  if (status === 503 || status === 502) {
    return detail || 'El servicio de IA no está disponible temporalmente. Las acciones directas de inventario siguen disponibles.'
  }

  return detail || 'No se pudo consultar al agente de inventario.'
}

const sendAgentMessage = async (customMessage = null) => {
  const message = customMessage || agentMessage.trim()

  if (!message || !currentAnalysisId || agentLoading) return

  setAgentMessages(prev => [
    ...prev,
    {
      role: 'user',
      content: message
    }
  ])

  setAgentMessage('')
  setAgentLoading(true)

  try {
    const response = await agentService.chat({
      message,
      analysis_id: currentAnalysisId
    })

    setAgentMessages(prev => [
      ...prev,
      {
        role: 'assistant',
        content: response.data.response
      }
    ])
  } catch (error) {
    console.error('Error al consultar agente:', error)

    const message = getAgentErrorMessage(error)

    setAgentMessages(prev => [
      ...prev,
      {
        role: 'assistant',
        content: message
      }
    ])
  } finally {
    setAgentLoading(false)
  }
}
  const removeAnalysis = async (id, e) => {
    e.stopPropagation()
    if (!confirm('¿Eliminar este análisis?')) return
    try { await mlService.deleteAnalysis(id); toast.success('Eliminado'); loadAnalyses() } catch { toast.error('Error') }
  }

  const summary = result?.summary
  const hasFullPaper =
  Boolean(
    result
      ?.metrics
      ?.full_paper
  )
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
{currentAnalysisId && (
  <div className="flex justify-end mt-4 mb-4">
    <button
      type="button"
      className="btn-primary flex items-center gap-2"
      onClick={() => setAgentOpen(true)}
    >
      <Brain className="w-4 h-4" />
      Asistente de inventario
    </button>
  </div>
)}
          {hasFullPaper ? (

  <div className="card p-5 border border-blue-200 bg-blue-50/30">

    <div className="flex items-start justify-between gap-4 flex-wrap">

      <div>

        <p className="font-semibold text-slate-800">
          Evaluación experimental disponible
        </p>

        <p className="text-sm text-slate-500 mt-1">
          Las métricas de validación, experimento,
          ablación y gestión se encuentran en el
          módulo Evaluación experimental.
        </p>

      </div>


      <Link
        to="/ml/evaluation"
        className="btn-primary"
      >
        Ver evaluación experimental
      </Link>

    </div>

  </div>

) : (

  <RetailMetricsCard
    metrics={result.metrics}
    importance={result.feature_importance}
  />

)}
          <AblationExperimentCard ablation={result?.metrics?.ablation} />
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
                ) : products.map((p) => <ProductRow key={p.product_id} p={p} onAgentAction={handleProductAgentAction} />)}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Panel del agente de inventario */}
      {agentOpen && currentAnalysisId && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30 sm:p-3">
          <div className="w-full max-w-lg h-[100dvh] sm:h-[calc(100dvh-1.5rem)] bg-white shadow-xl flex flex-col overflow-hidden sm:rounded-2xl">
            <div className="p-4 border-b flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Brain className="w-5 h-5" />
                <div>
                  <h3 className="font-semibold">Asistente de inventario</h3>
                  <p className="text-xs text-gray-500">Agente IA para análisis y reabastecimiento</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAgentOpen(false)}
                className="text-gray-500 hover:text-gray-800"
              >
                ✕
              </button>
            </div>

            <div className="p-3 border-b flex flex-wrap gap-2 shrink-0">
              <button
                type="button"
                className="px-3 py-2 text-xs border rounded-lg hover:bg-gray-50"
                disabled={agentLoading}
                onClick={() => runDirectAgentAction('low_stock', '¿Qué productos necesitan reabastecimiento?')}
              >
                Bajo stock
              </button>
              <button
                type="button"
                className="px-3 py-2 text-xs border rounded-lg hover:bg-gray-50"
                disabled={agentLoading}
                onClick={() => runDirectAgentAction('overstock', '¿Qué productos tienen sobrestock?')}
              >
                Sobrestock
              </button>
            </div>

            {simulationProduct && (
              <div className="p-3 border-b bg-slate-50 shrink-0">
                <p className="text-xs font-semibold text-slate-700">Simular reabastecimiento</p>
                <p className="text-xs text-slate-500 mt-1 truncate">{simulationProduct.product_name}</p>
                <div className="flex gap-2 mt-3">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={simulationQuantity}
                    onChange={(e) => setSimulationQuantity(e.target.value)}
                    placeholder="Unidades a agregar"
                    disabled={agentLoading}
                    className="flex-1 border rounded-lg px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={submitRestockSimulation}
                    disabled={agentLoading || !simulationQuantity}
                    className="btn-primary px-3"
                  >
                    Simular
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSimulationProduct(null)
                      setSimulationQuantity('')
                    }}
                    disabled={agentLoading}
                    className="px-3 py-2 text-xs border rounded-lg hover:bg-white"
                  >
                    Cancelar
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-2">La simulación no modifica el inventario real.</p>
              </div>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
              {agentMessages.map((msg, index) => (
                <div
                  key={index}
                  className={msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
                >
                  <div
                    className={
                      msg.role === 'user'
                        ? 'max-w-[85%] bg-gray-900 text-white rounded-xl px-3 py-2 text-sm'
                        : 'max-w-[85%] bg-gray-100 text-gray-800 rounded-xl px-3 py-2 text-sm'
                    }
                  >
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                </div>
              ))}

              {agentLoading && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 rounded-xl px-3 py-2 text-sm text-gray-500">
                    Analizando inventario...
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t bg-white shrink-0">
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  sendAgentMessage()
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={agentMessage}
                  onChange={(e) => setAgentMessage(e.target.value)}
                  placeholder="Pregunta sobre tu inventario..."
                  disabled={agentLoading}
                  className="flex-1 border rounded-lg px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  disabled={agentLoading || !agentMessage.trim()}
                  className="btn-primary px-4"
                >
                  Enviar
                </button>
              </form>
              <p className="text-xs text-gray-400 mt-2">
                Las recomendaciones son de apoyo. La decisión final corresponde al usuario.
              </p>
            </div>
          </div>
        </div>
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
            ) : analyses.map((a) => {

  const display =
    analysisDisplayMetrics(a)

  return (

    <tr
      key={a.id}
      className="table-row cursor-pointer"
      onClick={() =>
        openAnalysis(a.id)
      }
    >

      <td className="table-td text-sm font-medium text-slate-700">
        {a.source_filename}
      </td>

      <td className="table-td text-xs text-slate-400">
        {
          formatDateTimePE(
            a.created_at
          )
        }
      </td>

      <td className="table-td text-sm text-slate-600">
        {a.total_products}
      </td>

      <td className="table-td">
        <span
          className={
            a.overstock_count > 0
              ? 'badge-red'
              : 'badge-slate'
          }
        >
          {a.overstock_count}
        </span>
      </td>

      <td className="table-td text-sm text-slate-600">

        {display.isFullPaper ? (

          <span className="badge-blue">
            {display.split} meses
          </span>

        ) : (

          display.split

        )}

      </td>

      <td className="table-td text-sm text-slate-600">
        {
          display.wape != null
            ? `${display.wape}%`
            : '-'
        }
      </td>

      <td className="table-td text-sm text-slate-600">
        {
          display.r2
          ?? '-'
        }
      </td>

      <td className="table-td text-sm text-slate-600">
        {money(a.excess_value)}
      </td>

      <td className="table-td">

        <button
          onClick={(e) =>
            removeAnalysis(
              a.id,
              e
            )
          }
          className="btn-ghost py-1 px-2 text-red-500 hover:bg-red-50"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>

      </td>

    </tr>

  )
})}
          </tbody>
        </table>
      </div>
    </div>
  )
}
