import { useCallback, useEffect, useState } from 'react'
import { Brain, Loader2, RefreshCw, AlertTriangle, Boxes } from 'lucide-react'

import { mlService, agentService } from '../services/api'

const formatDate = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('es-PE')
}

function ExperimentalResultsCard({ evaluation }) {
  if (!evaluation) return null

  const partition = evaluation.partition || {}
  const developmentSplit =
  partition.development_split || {}
  const trainPartition =
  developmentSplit.train || {}
  const validationPartition =
  developmentSplit.validation || {}
  const validation = evaluation.validation || {}
  const experiment = evaluation.experiment || {}
const ablation = experiment.ablation || []

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
          Diseño de la evaluación experimental
        </h3>

        <p className="text-xs text-slate-500 mb-4">
          Separación cronológica entre desarrollo del modelo y conjunto de prueba independiente.
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
              PRUEBA INDEPENDIENTE
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
          como resultados finales del evaluación.
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
          Evaluación final — XGBoost
        </h3>

        <p className="text-xs text-slate-500 mb-4">
          Resultados obtenidos exclusivamente sobre los meses reservados
          para el conjunto de prueba independiente.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">

          {[
            ['R²', fmt(experimentMetrics.r2, 4)],
            ['MAE', fmt(experimentMetrics.mae, 3)],
            ['RMSE', fmt(experimentMetrics.rmse, 3)],
            ['WAPE', `${fmt(experimentMetrics.wape, 2)} %`],
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
{/* ABLACIÓN */}
{/* ================================================= */}

<div className="card p-5">
  <h3 className="font-semibold text-slate-800 mb-1">
    Experimento de ablación
  </h3>

  <p className="text-xs text-slate-500 mb-4">
    Evaluación realizada exclusivamente sobre los seis meses
    reservados para el evaluación.
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
          Evaluación — Política de reabastecimiento
        </h3>

        <p className="text-xs text-slate-500 mb-4">
          Indicadores calculados exclusivamente sobre los casos del
          periodo de prueba.
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


function AgentEvaluationCard({ result, loading, error, onRun }) {
  const summary = result?.summary || {}
  const cases = result?.cases || []

  const statusBadge = (value) => {
    if (value === true) {
      return <span className="inline-flex rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">Cumple</span>
    }
    if (value === false) {
      return <span className="inline-flex rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">No cumple</span>
    }
    return <span className="inline-flex rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">No aplica</span>
  }

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="font-semibold text-slate-800 mb-1 flex items-center gap-2">
            <Brain className="w-4 h-4 text-azure-500" />
            Evaluación del agente de IA
          </h3>
          <p className="text-xs text-slate-500">
            Verificación reproducible de las herramientas controladas del agente
            sobre el mismo análisis. Esta prueba no consume Gemini ni modifica el inventario.
          </p>
        </div>
        <button type="button" onClick={onRun} disabled={loading}
          className="btn-secondary flex items-center gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {result ? 'Reevaluar agente' : 'Evaluar agente'}
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50/40 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {!result && !error && (
        <div className="mt-4 rounded-xl border border-slate-200 p-4 text-sm text-slate-500">
          Ejecuta la evaluación para comprobar las funciones que sustentan al agente.
        </div>
      )}

      {result && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
            {[
              ['Cumplimiento', summary.compliance_pct != null ? `${summary.compliance_pct} %` : '-'],
              ['Aplicables', summary.applicable_cases ?? '-'],
              ['Cumplen', summary.passed ?? '-'],
              ['No cumplen', summary.failed ?? '-'],
              ['No aplican', summary.not_applicable ?? '-'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs text-slate-400">{label}</p>
                <p className="text-lg font-bold text-slate-800">{value}</p>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-slate-500">
                  <th className="py-2 pr-3">Caso</th>
                  <th className="pr-3">Resultado</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 align-top">
                    <td className="py-3 pr-3 font-medium text-slate-700">{item.name}</td>
                    <td className="py-3 pr-3">{statusBadge(item.passed)}</td>
                    <td className="py-3 text-slate-500">{item.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-xs text-slate-400">{result.note}</p>
        </>
      )}
    </div>
  )
}


function AgentLanguageEvaluationCard({ result, loading, error, onRun }) {
  const summary = result?.summary || {}
  const cases = result?.cases || []

  const statusBadge = (value) => (
    value
      ? <span className="inline-flex rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">Cumple</span>
      : <span className="inline-flex rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">No cumple</span>
  )

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="font-semibold text-slate-800 mb-1 flex items-center gap-2">
            <Brain className="w-4 h-4 text-azure-500" />
            Evaluación de interpretación con IA
          </h3>
          <p className="text-xs text-slate-500">
            Evalúa bajo demanda si Gemini interpreta consultas predefinidas en lenguaje natural
            y selecciona la herramienta controlada esperada. Esta prueba consume Gemini y no modifica el inventario.
          </p>
        </div>
        <button
          type="button"
          onClick={onRun}
          disabled={loading}
          className="btn-secondary flex items-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
          {result ? 'Reevaluar interpretación' : 'Evaluar interpretación con IA'}
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50/40 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {!result && !error && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/30 p-4 text-sm text-slate-600">
          La evaluación no se ejecuta automáticamente para evitar consumo innecesario de la cuota de Gemini.
        </div>
      )}

      {result && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            {[
              ['Cumplimiento de selección', summary.compliance_pct != null ? `${summary.compliance_pct} %` : '-'],
              ['Casos evaluados', summary.total_cases ?? '-'],
              ['Cumplen', summary.passed ?? '-'],
              ['No cumplen', summary.failed ?? '-'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs text-slate-400">{label}</p>
                <p className="text-lg font-bold text-slate-800">{value}</p>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-slate-500">
                  <th className="py-2 pr-3">Caso</th>
                  <th className="pr-3">Herramienta esperada</th>
                  <th className="pr-3">Herramienta seleccionada</th>
                  <th className="pr-3">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 align-top">
                    <td className="py-3 pr-3 font-medium text-slate-700">{item.name}</td>
                    <td className="py-3 pr-3 text-slate-500">{item.expected_tool || '-'}</td>
                    <td className="py-3 pr-3 text-slate-500">
                      {item.selected_tools?.length ? item.selected_tools.join(', ') : 'Ninguna'}
                    </td>
                    <td className="py-3 pr-3">{statusBadge(item.passed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-xs text-slate-400">{result.note}</p>
        </>
      )}
    </div>
  )
}

export default function ExperimentalEvaluationPage() {
  const [loading, setLoading] = useState(true)
  const [evaluation, setEvaluation] = useState(null)
  const [metadata, setMetadata] = useState(null)
  const [error, setError] = useState(null)
  const [agentEvaluation, setAgentEvaluation] = useState(null)
  const [agentEvaluationLoading, setAgentEvaluationLoading] = useState(false)
  const [agentEvaluationError, setAgentEvaluationError] = useState(null)
  const [agentLanguageEvaluation, setAgentLanguageEvaluation] = useState(null)
  const [agentLanguageEvaluationLoading, setAgentLanguageEvaluationLoading] = useState(false)
  const [agentLanguageEvaluationError, setAgentLanguageEvaluationError] = useState(null)

  const loadLatestExperiment = useCallback(async () => {
    setLoading(true)
    setError(null)
    setAgentEvaluation(null)
    setAgentEvaluationError(null)
    setAgentLanguageEvaluation(null)
    setAgentLanguageEvaluationError(null)

    try {
      const listResponse = await mlService.listAnalyses()
      const analyses = listResponse.data || []

      const experimentalAnalysis = analyses.find(
        (item) => item?.metrics?.full_paper
      )

      if (!experimentalAnalysis) {
        setEvaluation(null)
        setMetadata(null)
        setError(
          'Todavía no existe una evaluación experimental guardada. ' +
          'Ejecuta una desde el módulo Conjunto de datos.'
        )
        return
      }

      const detailResponse = await mlService.getAnalysis(experimentalAnalysis.id)
      const detail = detailResponse.data

      const storedEvaluation =
        detail?.result?.metrics?.full_paper ||
        detail?.metrics?.full_paper

      if (!storedEvaluation) {
        throw new Error(
          'El análisis guardado no contiene resultados de evaluación experimental.'
        )
      }

      setEvaluation(storedEvaluation)
      setMetadata({
        id: detail.id,
        sourceFilename: detail.source_filename,
        createdAt: detail.created_at,
      })
    } catch (err) {
      console.error(err)
      setError(
        err?.response?.data?.detail ||
        err?.message ||
        'No se pudo cargar la evaluación experimental.'
      )
    } finally {
      setLoading(false)
    }
  }, [])


  const runAgentEvaluation = useCallback(async () => {
    if (!metadata?.id) return
    setAgentEvaluationLoading(true)
    setAgentEvaluationError(null)

    try {
      const response = await agentService.evaluate(metadata.id)
      setAgentEvaluation(response.data)
    } catch (err) {
      console.error(err)
      setAgentEvaluationError(
        err?.response?.data?.detail ||
        err?.message ||
        'No se pudo evaluar el agente de IA.'
      )
    } finally {
      setAgentEvaluationLoading(false)
    }
  }, [metadata?.id])

  const runAgentLanguageEvaluation = useCallback(async () => {
    if (!metadata?.id) return

    setAgentLanguageEvaluationLoading(true)
    setAgentLanguageEvaluationError(null)

    try {
      const response = await agentService.evaluateLanguage(metadata.id)
      setAgentLanguageEvaluation(response.data)
    } catch (err) {
      console.error(err)
      setAgentLanguageEvaluationError(
        err?.response?.data?.detail ||
        err?.message ||
        'No se pudo evaluar la interpretación con IA.'
      )
    } finally {
      setAgentLanguageEvaluationLoading(false)
    }
  }, [metadata?.id])

  useEffect(() => {
    loadLatestExperiment()
  }, [loadLatestExperiment])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Cargando evaluación experimental...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1
            className="text-xl font-bold text-slate-900 flex items-center gap-2"
            style={{ fontFamily: "'Sora', sans-serif" }}
          >
            <Brain className="w-5 h-5 text-azure-500" />
            Evaluación experimental
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Validación temporal, evaluación predictiva, comparación con baseline,
            ablación, política de reabastecimiento y agente de IA.
          </p>
        </div>

        <button
          type="button"
          onClick={loadLatestExperiment}
          className="btn-secondary flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Actualizar
        </button>
      </div>

      {error && (
        <div className="card p-5 border border-amber-200 bg-amber-50/40">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-800">
                No hay una evaluación disponible
              </p>
              <p className="text-sm text-slate-500 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {metadata && (
        <div className="card p-4">
          <div className="flex flex-wrap gap-x-8 gap-y-2 text-xs text-slate-500">
            <p>
              Archivo:{' '}
              <b className="text-slate-700">
                {metadata.sourceFilename || '-'}
              </b>
            </p>
            <p>
              Última ejecución:{' '}
              <b className="text-slate-700">
                {formatDate(metadata.createdAt)}
              </b>
            </p>
          </div>
        </div>
      )}

      {evaluation && <ExperimentalResultsCard evaluation={evaluation} />}

      {evaluation && metadata?.id && (
        <AgentEvaluationCard
          result={agentEvaluation}
          loading={agentEvaluationLoading}
          error={agentEvaluationError}
          onRun={runAgentEvaluation}
        />
      )}

      {evaluation && metadata?.id && (
        <AgentLanguageEvaluationCard
          result={agentLanguageEvaluation}
          loading={agentLanguageEvaluationLoading}
          error={agentLanguageEvaluationError}
          onRun={runAgentLanguageEvaluation}
        />
      )}
    </div>
  )
}
