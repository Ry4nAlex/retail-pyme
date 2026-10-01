import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ingestService, mlService } from '../services/api'
import {
  Upload, FileText, Loader2, X, CheckCircle2, AlertTriangle, Boxes,
  DollarSign, Package, ShoppingCart, Brain, PackageSearch, LayoutDashboard,
  Wifi, WifiOff, ChevronDown, ChevronUp, Info, Sparkles,
} from 'lucide-react'
import toast from 'react-hot-toast'

const money = (v) => `S/ ${Number(v || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function ResultStat({ icon: Icon, label, value, sub, color }) {
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

function QuickLink({ icon: Icon, label, to }) {
  const navigate = useNavigate()
  return (
    <button onClick={() => navigate(to)} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 hover:border-azure-400 hover:bg-azure-50/50 text-sm text-slate-700 font-medium transition">
      <Icon className="w-4 h-4 text-azure-500" /> {label}
    </button>
  )
}
export function FullPaperResultsCard({ fullPaper }) {
  if (!fullPaper) return null

  const partition = fullPaper.partition || {}
  const developmentSplit =
  partition.development_split || {}
  const trainPartition =
  developmentSplit.train || {}
  const validationPartition =
  developmentSplit.validation || {}
  const validation = fullPaper.validation || {}
  const experiment = fullPaper.experiment || {}
const ablation = experiment.ablation || []
const search = fullPaper.hyperparameter_search || {}
const bestSearch = search.best || {}

const inventorySensitivity =
  experiment.inventory_management?.sensitivity_30_45_60 || []

const inventoryBaseline =
  experiment.inventory_management?.baseline || {}

const inventoryComparison =
  experiment.inventory_management?.comparison || {}
  const validationSummary = validation.summary || {}
  const experimentMetrics = experiment.metrics || {}
  const naive = experiment.naive || {}
  const comparison = experiment.comparison_vs_naive || {}

  const inventory =
    experiment.inventory_management || {}

  const inventoryProposed =
    inventory.xgboost_policy || {}

  const fmt = (value, digits = 2) => {
    if (value === null || value === undefined) return '-'

    const number = Number(value)

    if (Number.isNaN(number)) return value

    return number.toFixed(digits)
  }

  const fmtInt = (value) => {
    if (value === null || value === undefined) return '-'

    return Number(value).toLocaleString('es-PE')
  }

  const meanStd = (metric, digits = 4) => {
    const data = validationSummary?.[metric]

    if (
      !data ||
      data.mean === null ||
      data.mean === undefined
    ) {
      return '-'
    }

    return `${fmt(data.mean, digits)} ± ${fmt(data.std, digits)}`
  }

  const periodLabel = (block) => {
    if (!block?.period?.from) return '-'

    return `${block.period.from} → ${block.period.to}`
  }

  return (
    <div className="space-y-5">

      {/* ================================================= */}
      {/* DISEÑO EXPERIMENTAL */}
      {/* ================================================= */}

      <div className="card p-5">
        <h3 className="font-semibold text-slate-800 mb-1 flex items-center gap-2">
          <Brain className="w-4 h-4 text-azure-500" />
          Diseño experimental del Full Paper
        </h3>

        <p className="text-xs text-slate-500 mb-4">
          Separación cronológica entre desarrollo del modelo y experimento independiente.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-400">
              Dataset completo
            </p>

            <p className="font-semibold text-slate-800 mt-1">
              {periodLabel(partition.complete_dataset)}
            </p>

            <div className="mt-2 text-xs text-slate-500 space-y-1">
              <p>
                Meses: <b>{partition.complete_dataset?.months ?? '-'}</b>
              </p>

              <p>
                Transacciones:{' '}
                <b>
                  {fmtInt(
                    partition.complete_dataset?.transactions
                  )}
                </b>
              </p>

              <p>
                Productos:{' '}
                <b>{partition.complete_dataset?.products ?? '-'}</b>
              </p>

              <p>
                Producto-mes:{' '}
                <b>
                  {fmtInt(
                    partition.complete_dataset?.product_month
                  )}
                </b>
              </p>

              <p>
                Observaciones supervisadas:{' '}
                <b>
                  {fmtInt(
                    partition.complete_dataset
                      ?.supervised_observations
                  )}
                </b>
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-azure-200 bg-azure-50/40 p-4">
            <p className="text-xs text-azure-600 font-semibold">
              DESARROLLO
            </p>

            <p className="font-semibold text-slate-800 mt-1">
              {periodLabel(partition.development)}
            </p>

            <div className="mt-2 text-xs text-slate-500 space-y-1">
              <p>
                Meses:{' '}
                <b>{partition.development?.months ?? '-'}</b>
              </p>

              <p>
                Transacciones:{' '}
                <b>
                  {fmtInt(
                    partition.development?.transactions
                  )}
                </b>
              </p>

              <p>
                Productos:{' '}
                <b>{partition.development?.products ?? '-'}</b>
              </p>

              <p>
                Producto-mes:{' '}
                <b>
                  {fmtInt(
                    partition.development?.product_month
                  )}
                </b>
              </p>

              <p>
                Observaciones supervisadas:{' '}
                <b>
                  {fmtInt(
                    partition.development
                      ?.supervised_observations
                  )}
                </b>
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
            <p className="text-xs text-emerald-600 font-semibold">
              EXPERIMENTO INDEPENDIENTE
            </p>

            <p className="font-semibold text-slate-800 mt-1">
              {periodLabel(partition.experiment)}
            </p>

            <div className="mt-2 text-xs text-slate-500 space-y-1">
              <p>
                Meses:{' '}
                <b>{partition.experiment?.months ?? '-'}</b>
              </p>

              <p>
                Transacciones:{' '}
                <b>
                  {fmtInt(
                    partition.experiment?.transactions
                  )}
                </b>
              </p>

              <p>
                Productos:{' '}
                <b>{partition.experiment?.products ?? '-'}</b>
              </p>

              <p>
                Producto-mes:{' '}
                <b>
                  {fmtInt(
                    partition.experiment?.product_month
                  )}
                </b>
              </p>

              <p>
                Casos evaluados:{' '}
                <b>
                  {fmtInt(
                    partition.experiment
                      ?.effective_evaluation_cases
                  )}
                </b>
              </p>
            </div>
          </div>

        </div>
      </div>

      {/* ================================================= */}
      {/* VALIDACIÓN */}
      {/* ================================================= */}

      <div className="card p-5">
        <h3 className="font-semibold text-slate-800 mb-1">
          Validación del modelo
        </h3>

        <p className="text-xs text-slate-500 mb-4">
          Walk-forward realizado únicamente dentro del periodo de desarrollo.
          Estos valores se utilizan para seleccionar y validar el modelo, no
          como resultados finales del experimento.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">

  {/* TRAIN */}
  <div className="rounded-xl border border-blue-200 bg-blue-50/30 p-4">

    <p className="text-xs font-semibold text-blue-600">
      TRAIN — Entrenamiento
    </p>

    <p className="font-semibold text-slate-800 mt-1">
      {periodLabel(trainPartition)}
    </p>

    <div className="mt-3 text-xs text-slate-500 space-y-1">

      <p>
        Meses históricos:{' '}
        <b>
          {trainPartition.historical_months ?? '-'}
        </b>
      </p>

      <p>
        Meses supervisados:{' '}
        <b>
          {trainPartition.supervised_months ?? '-'}
        </b>
      </p>

      <p>
        Meses usados solo como historial:{' '}
        <b>
          {trainPartition.history_only_months ?? '-'}
        </b>
      </p>

      <p>
        Transacciones reales:{' '}
        <b>
          {fmtInt(
            trainPartition.transactions
          )}
        </b>
      </p>

      <p>
        Productos:{' '}
        <b>
          {trainPartition.products ?? '-'}
        </b>
      </p>

      <p>
        Producto-mes:{' '}
        <b>
          {fmtInt(
            trainPartition.product_month
          )}
        </b>
      </p>

      <p>
        Casos supervisados:{' '}
        <b>
          {fmtInt(
            trainPartition
              .supervised_observations
          )}
        </b>
      </p>

      <p className="pt-2 text-slate-400">
        Targets supervisados:{' '}
        <b>
          {
            trainPartition
              .supervised_target_period
              ?.from ?? '-'
          }
          {' → '}
          {
            trainPartition
              .supervised_target_period
              ?.to ?? '-'
          }
        </b>
      </p>

    </div>
  </div>


  {/* VALIDACIÓN */}
  <div className="rounded-xl border border-amber-200 bg-amber-50/30 p-4">

    <p className="text-xs font-semibold text-amber-600">
      VALIDACIÓN
    </p>

    <p className="font-semibold text-slate-800 mt-1">
      {periodLabel(validationPartition)}
    </p>

    <div className="mt-3 text-xs text-slate-500 space-y-1">

      <p>
        Meses:{' '}
        <b>
          {validationPartition.historical_months ?? '-'}
        </b>
      </p>

      <p>
        Transacciones reales:{' '}
        <b>
          {fmtInt(
            validationPartition.transactions
          )}
        </b>
      </p>

      <p>
        Productos:{' '}
        <b>
          {validationPartition.products ?? '-'}
        </b>
      </p>

      <p>
        Producto-mes:{' '}
        <b>
          {fmtInt(
            validationPartition.product_month
          )}
        </b>
      </p>

      <p>
        Casos supervisados:{' '}
        <b>
          {fmtInt(
            validationPartition
              .supervised_observations
          )}
        </b>
      </p>

      <p className="pt-2 text-slate-400">
        Participación sobre casos supervisados:{' '}
        <b>
          {
            developmentSplit
              .effective_validation_pct ?? '-'
          } %
        </b>
      </p>

    </div>
  </div>

</div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">

          <div className="rounded-xl border border-slate-200 p-3">
            <p className="text-xs text-slate-400">
              R²
            </p>
            <p className="text-lg font-bold text-slate-800">
              {meanStd('r2', 4)}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 p-3">
            <p className="text-xs text-slate-400">
              MAE
            </p>
            <p className="text-lg font-bold text-slate-800">
              {meanStd('mae', 4)}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 p-3">
            <p className="text-xs text-slate-400">
              RMSE
            </p>
            <p className="text-lg font-bold text-slate-800">
              {meanStd('rmse', 4)}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 p-3">
            <p className="text-xs text-slate-400">
              WAPE
            </p>
            <p className="text-lg font-bold text-slate-800">
              {meanStd('wape', 4)} %
            </p>
          </div>

        </div>

        <div className="mt-4 text-xs text-slate-500 space-y-1">
          <p>
            Meses supervisados iniciales de Train:{' '}
<b>{validation.n_initial_train_months ?? '-'} meses</b>
          </p>
<p>
  División supervisada efectiva:{' '}
  <b>
    {developmentSplit.effective_train_pct ?? '-'} %
    {' / '}
    {developmentSplit.effective_validation_pct ?? '-'} %
  </b>
</p>
          <p>
            Meses de validación:{' '}
            <b>{validation.n_validation_months ?? '-'}</b>
          </p>

          <p>
            Ventanas walk-forward:{' '}
            <b>{validation.n_folds ?? '-'}</b>
          </p>

          <p>
            Periodo de validación:{' '}
            <b>
              {validation.validation_period?.from ?? '-'}
              {' → '}
              {validation.validation_period?.to ?? '-'}
            </b>
          </p>
        </div>
      </div>

      {/* ================================================= */}
      {/* EXPERIMENTO ML */}
      {/* ================================================= */}

      <div className="card p-5">
        <h3 className="font-semibold text-slate-800 mb-1">
          Experimento final — Machine Learning
        </h3>

        <p className="text-xs text-slate-500 mb-4">
          Resultados obtenidos exclusivamente sobre los meses reservados
          para el experimento independiente.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">

          {[
            ['R²', fmt(experimentMetrics.r2, 4)],
            ['MAE', fmt(experimentMetrics.mae, 3)],
            ['RMSE', fmt(experimentMetrics.rmse, 3)],
            ['WAPE', `${fmt(experimentMetrics.wape, 2)} %`],
            ['MAPE', `${fmt(experimentMetrics.mape, 2)} %`],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-3"
            >
              <p className="text-xs text-slate-400">
                {label}
              </p>

              <p className="text-xl font-bold text-slate-800">
                {value}
              </p>
            </div>
          ))}

        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">

          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-500 mb-3">
              Baseline Naive
            </p>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <p>R²: <b>{fmt(naive.r2, 4)}</b></p>
              <p>MAE: <b>{fmt(naive.mae, 3)}</b></p>
              <p>RMSE: <b>{fmt(naive.rmse, 3)}</b></p>
              <p>WAPE: <b>{fmt(naive.wape, 2)} %</b></p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-500 mb-3">
              Mejora de XGBoost frente al Naive
            </p>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <p>
                Δ R²:{' '}
                <b>{fmt(comparison.r2_gain, 4)}</b>
              </p>

              <p>
                ↓ MAE:{' '}
                <b>
                  {fmt(
                    comparison.mae_reduction_pct,
                    2
                  )} %
                </b>
              </p>

              <p>
                ↓ RMSE:{' '}
                <b>
                  {fmt(
                    comparison.rmse_reduction_pct,
                    2
                  )} %
                </b>
              </p>

              <p>
                ↓ WAPE:{' '}
                <b>
                  {fmt(
                    comparison.wape_reduction_pct,
                    2
                  )} %
                </b>
              </p>
            </div>
          </div>

        </div>
      </div>

{/* ================================================= */}
{/* RANDOM SEARCH */}
{/* ================================================= */}

<div className="card p-5">
  <h3 className="font-semibold text-slate-800 mb-1">
    Selección de hiperparámetros
  </h3>

  <p className="text-xs text-slate-500 mb-4">
    Random Search realizado únicamente sobre el periodo de desarrollo
    mediante validación walk-forward.
  </p>

  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
    <div className="rounded-xl border border-slate-200 p-3">
      <p className="text-xs text-slate-400">Configuraciones</p>
      <p className="text-lg font-bold">
        {search.n_trials ?? '-'}
      </p>
    </div>

    <div className="rounded-xl border border-slate-200 p-3">
      <p className="text-xs text-slate-400">WAPE validación</p>
      <p className="text-lg font-bold">
        {fmt(bestSearch.wape_mean, 4)} %
      </p>
    </div>

    <div className="rounded-xl border border-slate-200 p-3">
      <p className="text-xs text-slate-400">RMSE validación</p>
      <p className="text-lg font-bold">
        {fmt(bestSearch.rmse_mean, 4)}
      </p>
    </div>

    <div className="rounded-xl border border-slate-200 p-3">
      <p className="text-xs text-slate-400">R² validación</p>
      <p className="text-lg font-bold">
        {fmt(bestSearch.r2_mean, 4)}
      </p>
    </div>
  </div>

  <div className="text-xs text-slate-600 space-y-1">
    <p>
      n_estimators: <b>{bestSearch.params?.n_estimators ?? '-'}</b>
    </p>
    <p>
      max_depth: <b>{bestSearch.params?.max_depth ?? '-'}</b>
    </p>
    <p>
      learning_rate: <b>{bestSearch.params?.learning_rate ?? '-'}</b>
    </p>
    <p>
      min_child_weight: <b>{bestSearch.params?.min_child_weight ?? '-'}</b>
    </p>
    <p>
      subsample: <b>{bestSearch.params?.subsample ?? '-'}</b>
    </p>
    <p>
      colsample_bytree: <b>{bestSearch.params?.colsample_bytree ?? '-'}</b>
    </p>
    <p>
      reg_alpha: <b>{bestSearch.params?.reg_alpha ?? '-'}</b>
    </p>
    <p>
      reg_lambda: <b>{bestSearch.params?.reg_lambda ?? '-'}</b>
    </p>
  </div>
</div>

{/* ================================================= */}
{/* ABLACIÓN */}
{/* ================================================= */}

<div className="card p-5">
  <h3 className="font-semibold text-slate-800 mb-1">
    Experimento de ablación
  </h3>

  <p className="text-xs text-slate-500 mb-4">
    Evaluación realizada exclusivamente sobre los seis meses
    reservados para el experimento.
  </p>

  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left text-xs text-slate-500">
          <th className="py-2">Configuración</th>
          <th>Variables</th>
          <th>R²</th>
          <th>MAE</th>
          <th>RMSE</th>
          <th>WAPE</th>
        </tr>
      </thead>

      <tbody>
        {ablation.map((row) => (
          <tr
            key={row.configuration}
            className="border-b border-slate-100"
          >
            <td className="py-2 font-medium">
              {row.configuration}
            </td>
            <td>{row.n_features}</td>
            <td>{fmt(row.r2, 4)}</td>
            <td>{fmt(row.mae, 3)}</td>
            <td>{fmt(row.rmse, 3)}</td>
            <td>{fmt(row.wape, 2)} %</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
</div>

      {/* ================================================= */}
      {/* GESTIÓN DE INVENTARIO */}
      {/* ================================================= */}

      <div className="card p-5">
        <h3 className="font-semibold text-slate-800 mb-1 flex items-center gap-2">
          <Boxes className="w-4 h-4 text-azure-500" />
          Experimento final — Gestión de inventario
        </h3>

        <p className="text-xs text-slate-500 mb-4">
          Indicadores calculados exclusivamente sobre los casos del
          periodo experimental.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">

          {[
            [
              'Nivel de servicio',
              `${fmt(
                inventoryProposed.service_level_pct,
                3
              )} %`
            ],

            [
              'Demanda no atendida',
              `${fmt(
                inventoryProposed.stockout_units,
                2
              )} u`
            ],

            [
              'Eventos de quiebre',
              fmtInt(
                inventoryProposed.stockout_events
              )
            ],

            [
              'Tasa de quiebre',
              `${fmt(
                inventoryProposed.stockout_rate_pct,
                3
              )} %`
            ],

            [
              'Cobertura saludable',
              `${fmt(
                inventoryProposed
                  .healthy_coverage_rate_pct,
                3
              )} %`
            ],

            [
              'Sobrestock >75 días',
              `${fmt(
                inventoryProposed.overstock_rate_pct,
                3
              )} %`
            ],

            [
              'Reposición sugerida',
              `${fmt(
                inventoryProposed.total_reorder_units,
                2
              )} u`
            ],

            [
              'Inventario promedio',
              `${fmt(
                inventoryProposed
                  .avg_month_end_inventory_units,
                2
              )} u`
            ],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-xl border border-slate-200 p-3"
            >
              <p className="text-xs text-slate-400">
                {label}
              </p>

              <p className="text-lg font-bold text-slate-800">
                {value}
              </p>
            </div>
          ))}

        </div>

        <div className="mt-3 text-xs text-slate-500">
          <p>
            Exceso sobre cobertura objetivo:{' '}
            <b>
              {fmt(
                inventoryProposed.excess_units,
                2
              )} unidades
            </b>
          </p>

          <p>
            Cobertura promedio:{' '}
            <b>
              {fmt(
                inventoryProposed.avg_coverage_days,
                2
              )} días
            </b>
          </p>

          <p>
            Casos evaluados:{' '}
            <b>
              {fmtInt(
                inventoryProposed.evaluation_cases
              )}
            </b>
          </p>
        </div>
      </div>
      {/* ================================================= */}
{/* SENSIBILIDAD DE INVENTARIO */}
{/* ================================================= */}

<div className="card p-5">
  <h3 className="font-semibold text-slate-800 mb-1">
    Sensibilidad de la cobertura objetivo
  </h3>

  <p className="text-xs text-slate-500 mb-4">
    Comparación experimental de coberturas objetivo de 30, 45 y 60 días.
    El umbral de sobrestock permanece en 75 días.
  </p>

  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left text-xs text-slate-500">
          <th className="py-2">Cobertura</th>
          <th>Servicio</th>
          <th>Quiebres</th>
          <th>Tasa quiebre</th>
          <th>Sobrestock</th>
          <th>Inventario prom.</th>
        </tr>
      </thead>

      <tbody>
        {inventorySensitivity.map((row) => (
          <tr
            key={row.target_coverage_days}
            className="border-b border-slate-100"
          >
            <td className="py-2 font-medium">
              {fmt(row.target_coverage_days, 0)} días
            </td>

            <td>
              {fmt(row.service_level_pct, 3)} %
            </td>

            <td>
              {fmtInt(row.stockout_events)}
            </td>

            <td>
              {fmt(row.stockout_rate_pct, 3)} %
            </td>

            <td>
              {fmtInt(row.overstock_events_75d)}
            </td>

            <td>
              {fmt(
                row.avg_month_end_inventory_units,
                2
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>

  <div className="mt-4 rounded-xl border border-slate-200 p-4">
    <p className="text-xs font-semibold text-slate-500 mb-2">
      Política propuesta vs. referencia histórica
    </p>

    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
      <p>
        Quiebres baseline:{' '}
        <b>{fmtInt(inventoryBaseline.stockout_events)}</b>
      </p>

      <p>
        Reducción de eventos:{' '}
        <b>
          {fmt(
            inventoryComparison.stockout_events_reduction_pct,
            2
          )} %
        </b>
      </p>

      <p>
        Reducción de demanda no atendida:{' '}
        <b>
          {fmt(
            inventoryComparison.stockout_units_reduction_pct,
            2
          )} %
        </b>
      </p>
    </div>
  </div>
</div>
    </div>
  )
}
export default function IngestPage({ embedded = false }) {
  const [files, setFiles] = useState([])           // hasta 2
  const [horizon, setHorizon] = useState(3)
  const [advanced, setAdvanced] = useState(false)
  const [thresholds, setThresholds] = useState({ over: 75, under: 30, target: 45 })
  const [replaceExisting, setReplaceExisting] = useState(false)
  const [runMl, setRunMl] = useState(true)
  const [runWalkForward, setRunWalkForward] = useState(false)
  const [runAblation, setRunAblation] = useState(false)
  const [runFullPaperExperiment, setRunFullPaperExperiment] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [mlOnline, setMlOnline] = useState(null)
  const fileRef = useRef()

  useEffect(() => {
    mlService.mlHealth().then((r) => setMlOnline(r.data.reachable)).catch(() => setMlOnline(false))
  }, [])

  const addFiles = (list) => {
    const incoming = Array.from(list || [])
    setFiles((prev) => [...prev, ...incoming].slice(0, 2))
    if (fileRef.current) fileRef.current.value = ''
  }
  const removeFile = (i) => setFiles((prev) => prev.filter((_, idx) => idx !== i))

  const handleIngest = async () => {
    if (files.length === 0) { toast.error('Selecciona al menos un archivo'); return }
    const fd = new FormData()
    files.forEach((f) => fd.append('files', f))
    fd.append('horizon_months', horizon)
    fd.append('overstock_threshold_days', thresholds.over)
    fd.append('understock_threshold_days', thresholds.under)
    fd.append('target_coverage_days', thresholds.target)
    fd.append('replace_existing', replaceExisting)
    fd.append('run_ml', runMl)
    fd.append('run_walk_forward',runFullPaperExperiment ? false : runWalkForward)
    fd.append('run_ablation',runFullPaperExperiment ? false : runAblation)
    fd.append('run_full_paper_experiment',runFullPaperExperiment)
    setLoading(true)
    setResult(null)
    try {
      const r = await ingestService.all(fd)
      setResult(r.data)
      toast.success('Carga completada')
      if (r.data.ml_error) toast('ML omitido: ' + r.data.ml_error, { icon: '⚠️' })
    } catch (e) {
      toast.error(e.response?.data?.detail || 'No se pudo procesar la carga')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className={`flex items-start justify-between gap-4 flex-wrap ${embedded ? 'sr-only' : ''}`}>
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2" style={{ fontFamily: "'Sora', sans-serif" }}>
            <Sparkles className="w-5 h-5 text-azure-500" /> Carga unificada
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">Sube 1 o 2 plantillas y deja todo el sistema poblado: Panel, Inventario, Ventas y Predicciones</p>
        </div>
        {mlOnline !== null && (
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg ${mlOnline ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
            {mlOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            Microservicio ML {mlOnline ? 'conectado' : 'sin conexión'}
          </span>
        )}
      </div>

      {/* Explicación de plantillas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <h3 className="font-semibold text-slate-800 mb-2 flex items-center gap-2"><Package className="w-4 h-4 text-azure-500" /> Plantilla 1 · Productos <span className="badge-slate">opcional</span></h3>
          <p className="text-xs text-slate-500 mb-3">Catálogo e inventario actual. Si la omites, se deriva de las ventas.</p>
          <div className="flex flex-wrap gap-1.5">
            {['sku', 'nombre', 'categoria', 'costo', 'precio', 'stock_actual', 'stock_minimo', 'stock_maximo'].map((c) => (
              <code key={c} className="text-[11px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{c}</code>
            ))}
          </div>
        </div>
        <div className="card p-5">
          <h3 className="font-semibold text-slate-800 mb-2 flex items-center gap-2"><ShoppingCart className="w-4 h-4 text-azure-500" /> Plantilla 2 · Ventas <span className="badge-blue">requerida</span></h3>
          <p className="text-xs text-slate-500 mb-3">Historial de ventas. Alimenta el dashboard y el modelo XGBoost.</p>
          <div className="flex flex-wrap gap-1.5">
            {['fecha', 'sku', 'producto', 'categoria', 'cantidad', 'precio'].map((c) => (
              <code key={c} className="text-[11px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{c}</code>
            ))}
          </div>
        </div>
      </div>

      {/* Subida */}
      <div className="card p-6">
        <h3 className="font-semibold text-slate-800 mb-5 flex items-center gap-2"><Upload className="w-4 h-4 text-azure-500" /> Subir archivos <span className="text-xs font-normal text-slate-400">(1 o 2 · CSV o Excel)</span></h3>

        <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center cursor-pointer hover:border-azure-400 hover:bg-azure-50/50 transition-all"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files) }}>
          <FileText className="w-7 h-7 text-slate-400 mx-auto mb-2" />
          <p className="text-sm text-slate-600 font-medium">Arrastra aquí o haz clic para seleccionar</p>
          <p className="text-xs text-slate-400 mt-1">Un libro con hojas Productos + Ventas, o dos archivos por separado · Máx. 50 MB c/u</p>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
        </div>

        {files.length > 0 && (
          <div className="mt-4 space-y-2">
            {files.map((f, i) => (
              <div key={i} className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-4 h-4 text-azure-500 shrink-0" />
                  <span className="text-sm text-slate-700 truncate">{f.name}</span>
                  <span className="text-xs text-slate-400">{(f.size / 1024 / 1024).toFixed(2)} MB</span>
                </div>
                <button onClick={() => removeFile(i)} className="text-slate-400 hover:text-red-500"><X className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mt-5">
          <div>
            <label className="field-label">Meses a pronosticar</label>
            <select className="field-input" value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}>
              {[1, 2, 3, 4, 6].map((m) => <option key={m} value={m}>{m} {m === 1 ? 'mes' : 'meses'}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 mt-6 text-sm text-slate-600 cursor-pointer">
            <input type="checkbox" checked={runMl} onChange={(e) => setRunMl(e.target.checked)} className="rounded" />
            Ejecutar análisis ML (XGBoost)
          </label>
          <label className="flex items-center gap-2 mt-6 text-sm text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={runWalkForward}
            onChange={(e) => setRunWalkForward(e.target.checked)}
            disabled={!runMl || runFullPaperExperiment}
            className="rounded"
          />
            Validación temporal (Walk-forward)
          </label>
          <label className="flex items-center gap-2 mt-6 text-sm text-slate-600 cursor-pointer">
  <input
    type="checkbox"
    checked={runAblation}
    onChange={(e) => setRunAblation(e.target.checked)}
    disabled={!runMl || runFullPaperExperiment}
    className="rounded"
  />
  Experimento de ablación
</label>
<label className="flex items-center gap-2 mt-6 text-sm text-slate-600 cursor-pointer">
  <input
  type="checkbox"
  checked={runFullPaperExperiment}
  onChange={(e) => {
    const checked = e.target.checked

    setRunFullPaperExperiment(checked)

    if (checked) {
      setRunWalkForward(false)
      setRunAblation(false)
    }
  }}
  disabled={!runMl}
  className="rounded"
/>
  Evaluación Full Paper (42 + 6)
</label>
          <label className="flex items-center gap-2 mt-6 text-sm text-slate-600 cursor-pointer">
            <input type="checkbox" checked={replaceExisting} onChange={(e) => setReplaceExisting(e.target.checked)} className="rounded" />
            Reemplazar carga anterior
          </label>
        </div>

        <button onClick={() => setAdvanced((a) => !a)} className="text-xs text-azure-600 mt-3 flex items-center gap-1">
          {advanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />} Umbrales avanzados
        </button>
        {advanced && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3 p-4 bg-slate-50 rounded-xl">
            <div><label className="field-label">Sobre-stock (días)</label><input type="number" className="field-input" value={thresholds.over} onChange={(e) => setThresholds({ ...thresholds, over: Number(e.target.value) })} /></div>
            <div><label className="field-label">Bajo-stock (días)</label><input type="number" className="field-input" value={thresholds.under} onChange={(e) => setThresholds({ ...thresholds, under: Number(e.target.value) })} /></div>
            <div><label className="field-label">Cobertura objetivo (días)</label><input type="number" className="field-input" value={thresholds.target} onChange={(e) => setThresholds({ ...thresholds, target: Number(e.target.value) })} /></div>
          </div>
        )}

        <div className="mt-3 flex items-start gap-2 text-xs text-slate-400">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>El mes en curso (incompleto) se excluye del modelo para no sesgar la tendencia, pero sí cuenta en el dashboard. Las ventas históricas no descuentan el stock actual del catálogo.</span>
        </div>

        <div className="mt-5">
          <button onClick={handleIngest} disabled={loading || files.length === 0} className="btn-primary">
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Procesando todo...</> : <><Upload className="w-4 h-4" /> Cargar todo</>}
          </button>
        </div>
      </div>

      {/* Resultado */}
      {result && (
        <div className="space-y-5">
          <div className="flex items-center gap-2 text-emerald-600">
            <CheckCircle2 className="w-5 h-5" />
            <p className="font-semibold">{result.mensaje}</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            <ResultStat icon={Package} label="Productos" value={result.productos?.total ?? 0}
              sub={`${result.productos?.creados ?? 0} nuevos · ${result.productos?.actualizados ?? 0} actualizados`} color="#2563eb" />
            <ResultStat icon={ShoppingCart} label="Comprobantes" value={result.ventas?.comprobantes ?? 0}
              sub={`${result.ventas?.lineas ?? 0} líneas`} color="#10b981" />
            <ResultStat icon={FileText} label="Rango de ventas" value={result.ventas?.rango ? '✓' : '-'}
              sub={result.ventas?.rango ? `${result.ventas.rango[0]} → ${result.ventas.rango[1]}` : ''} color="#64748b" />
            {result.ml ? (
              <>
                <ResultStat icon={AlertTriangle} label="Sobre-stock" value={result.ml.overstock_count} color="#ef4444" />
                <ResultStat icon={Boxes} label="Bajo-stock" value={result.ml.understock_count} color="#f59e0b" />
                <ResultStat icon={DollarSign} label="Capital inmovilizado" value={money(result.ml.total_excess_value)} color="#8b5cf6" />
              </>
            ) : (
              <div className="card p-4 md:col-span-3 flex items-center gap-2 text-sm text-slate-500">
                <Brain className="w-4 h-4 text-slate-400" />
                {result.ml_error ? `ML no ejecutado: ${result.ml_error}` : 'Análisis ML no solicitado'}
              </div>
            )}
          </div>

          {result.ml?.metrics && !result.ml.metrics.full_paper && (
            <div className="card p-5">
              <h3 className="font-semibold text-slate-800 text-sm mb-3 flex items-center gap-2"><Brain className="w-4 h-4 text-azure-500" /> Calidad del modelo XGBoost</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[
                  ['Split objetivo', result.ml.metrics.target_split || '80/20'],
                  ['Split efectivo', result.ml.metrics.effective_train_pct != null ? `${result.ml.metrics.effective_train_pct}/${result.ml.metrics.effective_val_pct ?? result.ml.metrics.val_pct ?? '-'}/${result.ml.metrics.effective_test_pct}` : '-'],
                  ['R²', result.ml.metrics.r2],
                  ['MAE', result.ml.metrics.mae],
                  ['RMSE', result.ml.metrics.rmse],
                  ['MAPE', result.ml.metrics.mape != null ? `${result.ml.metrics.mape}%` : '-'],
                  ['WAPE', result.ml.metrics.wape != null ? `${result.ml.metrics.wape}%` : '-'],
                  ['Precisión forecast', result.ml.metrics.forecast_accuracy_pct != null ? `${result.ml.metrics.forecast_accuracy_pct}%` : '-'],
                  ['Sesgo', result.ml.metrics.bias_pct != null ? `${result.ml.metrics.bias_pct}%` : '-'],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-xl border border-slate-200 p-3">
                    <p className="text-xs text-slate-400">{k}</p>
                    <p className="text-xl font-bold text-slate-800" style={{ fontFamily: "'Sora', sans-serif" }}>{v ?? '-'}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-400">
                Corte cronológico 80/20 por meses completos · Train/Test: {result.ml.metrics.n_train}/{result.ml.metrics.n_test} registros
              </p>
            </div>
          )}

          {result.ml?.metrics?.full_paper && (
  <div className="card p-5 border border-emerald-200 bg-emerald-50/30">
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <p className="font-semibold text-slate-800">
          Evaluación experimental completada
        </p>

        <p className="text-sm text-slate-500 mt-1">
          Los resultados de desarrollo, validación, experimento,
          ablación e inventario fueron guardados correctamente.
        </p>
      </div>

      <QuickLink
        icon={Brain}
        label="Ver evaluación experimental"
        to="/ml/evaluation"
      />
    </div>
  </div>
)}

          <div className="card p-5">
            <h3 className="font-semibold text-slate-800 text-sm mb-3">Ya puedes revisar</h3>
            <div className="flex flex-wrap gap-2">
              <QuickLink icon={LayoutDashboard} label="Panel" to="/dashboard" />
              <QuickLink icon={Package} label="Inventario" to="/inventory" />
              <QuickLink icon={ShoppingCart} label="Ventas" to="/sales" />
              <QuickLink icon={PackageSearch} label="Análisis de stock" to="/ml/stock-analysis" />
              <QuickLink icon={Brain} label="Predicciones" to="/ml/predictions" />
              <QuickLink icon={Brain} label="Evaluación experimental" to="/ml/evaluation"/>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
