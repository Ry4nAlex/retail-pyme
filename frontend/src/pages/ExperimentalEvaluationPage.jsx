import { useCallback, useEffect, useState } from 'react'
import {
  Brain,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Server,
  Wifi,
} from 'lucide-react'

import { mlService } from '../services/api'
import { FullPaperResultsCard } from './IngestPage'


const fmtMs = (value) => {
  if (value === null || value === undefined) return '-'

  const number = Number(value)

  if (Number.isNaN(number)) return '-'

  if (number >= 1000) {
    return `${(number / 1000).toFixed(2)} s`
  }

  return `${number.toFixed(0)} ms`
}


const formatDate = (value) => {
  if (!value) return '-'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString('es-PE')
}


export default function ExperimentalEvaluationPage() {

  const [loading, setLoading] = useState(true)

  const [fullPaper, setFullPaper] = useState(null)

  const [metadata, setMetadata] = useState(null)

  const [error, setError] = useState(null)

  const [cloudBenchmark, setCloudBenchmark] =
    useState(null)

  const [liveCloud, setLiveCloud] =
    useState(null)

  const [cloudError, setCloudError] =
    useState(null)


  const loadLatestExperiment = useCallback(async () => {

    setLoading(true)

    setError(null)

    setCloudError(null)


    // =============================================
    // 1. ÚLTIMO EXPERIMENTO FULL PAPER GUARDADO
    // =============================================

    try {

      const listResponse =
        await mlService.listAnalyses()

      const analyses =
        listResponse.data || []

      const fullPaperAnalysis =
        analyses.find(
          (item) =>
            item?.metrics?.full_paper
        )

      if (!fullPaperAnalysis) {

        setFullPaper(null)

        setMetadata(null)

        setError(
          'Todavía no existe una evaluación Full Paper guardada. ' +
          'Ejecuta una desde el módulo Conjunto de datos.'
        )

      } else {

        const detailResponse =
          await mlService.getAnalysis(
            fullPaperAnalysis.id
          )

        const detail =
          detailResponse.data

        const storedFullPaper =
          detail?.result
            ?.metrics
            ?.full_paper
          ||
          detail?.metrics
            ?.full_paper

        if (!storedFullPaper) {

          throw new Error(
            'El análisis guardado no contiene resultados Full Paper.'
          )
        }

        setFullPaper(
          storedFullPaper
        )

        setMetadata({
          id:
            detail.id,

          sourceFilename:
            detail.source_filename,

          createdAt:
            detail.created_at,
        })
      }

    } catch (err) {

      console.error(err)

      setError(
        err?.response
          ?.data
          ?.detail
        ||
        err?.message
        ||
        'No se pudo cargar la evaluación experimental.'
      )
    }


    // =============================================
    // 2. BENCHMARK CLOUD K6
    // =============================================

    try {

      const benchmarkResponse =
        await mlService.cloudBenchmark()

      setCloudBenchmark(
        benchmarkResponse.data
      )

    } catch (err) {

      console.error(err)

      setCloudError(
        'No se pudo cargar el benchmark de rendimiento cloud.'
      )
    }


    // =============================================
    // 3. DISPONIBILIDAD ACTUAL
    // =============================================

    try {

      const liveResponse =
        await mlService.cloudMetricsLive()

      setLiveCloud(
        liveResponse.data
      )

    } catch (err) {

      console.error(err)

      setLiveCloud(null)
    }


    setLoading(false)

  }, [])


  useEffect(() => {

    loadLatestExperiment()

  }, [loadLatestExperiment])


  if (loading) {

    return (
      <div className="flex items-center justify-center py-20">

        <div className="flex items-center gap-3 text-slate-500">

          <Loader2 className="w-5 h-5 animate-spin" />

          <span className="text-sm">
            Cargando evaluación experimental...
          </span>

        </div>

      </div>
    )
  }


  const scenarios =
    cloudBenchmark?.scenarios || []


  return (
    <div className="space-y-6">

      {/* ================================================= */}
      {/* CABECERA */}
      {/* ================================================= */}

      <div className="flex items-start justify-between gap-4 flex-wrap">

        <div>

          <h1
            className="text-xl font-bold text-slate-900 flex items-center gap-2"
            style={{
              fontFamily: "'Sora', sans-serif",
            }}
          >
            <Brain className="w-5 h-5 text-azure-500" />

            Evaluación experimental
          </h1>

          <p className="text-sm text-slate-500 mt-1">
            Resultados de validación, experimento independiente,
            gestión de inventario y rendimiento cloud.
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


      {/* ================================================= */}
      {/* SIN EXPERIMENTO */}
      {/* ================================================= */}

      {error && (

        <div className="card p-5 border border-amber-200 bg-amber-50/40">

          <div className="flex items-start gap-3">

            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />

            <div>

              <p className="font-semibold text-slate-800">
                No hay una evaluación disponible
              </p>

              <p className="text-sm text-slate-500 mt-1">
                {error}
              </p>

            </div>

          </div>

        </div>
      )}


      {/* ================================================= */}
      {/* METADATOS */}
      {/* ================================================= */}

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
                {formatDate(
                  metadata.createdAt
                )}
              </b>
            </p>

          </div>

        </div>
      )}


      {/* ================================================= */}
      {/* RESULTADOS FULL PAPER */}
      {/* ================================================= */}

      {fullPaper && (

        <FullPaperResultsCard
          fullPaper={fullPaper}
        />

      )}


      {/* ================================================= */}
      {/* CLOUD COMPUTING */}
      {/* ================================================= */}

      {cloudBenchmark && (

        <div className="card p-5">

          <div className="flex items-start justify-between gap-3 flex-wrap mb-4">

            <div>

              <h3 className="font-semibold text-slate-800 flex items-center gap-2">

                <Server className="w-4 h-4 text-azure-500" />

                Experimento — Rendimiento cloud
              </h3>

              <p className="text-xs text-slate-500 mt-1">
                Benchmark cliente-servidor realizado con k6 sobre
                la API desplegada.
              </p>

            </div>


            <span className="badge-blue">
              {cloudBenchmark.tool || 'k6'}
            </span>

          </div>


          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-5">

            <div className="rounded-xl border border-slate-200 p-3">

              <p className="text-xs text-slate-400">
                Endpoint
              </p>

              <p className="text-sm font-semibold text-slate-800 mt-1 break-all">
                {cloudBenchmark.endpoint || '-'}
              </p>

            </div>


            <div className="rounded-xl border border-slate-200 p-3">

              <p className="text-xs text-slate-400">
                Duración por escenario
              </p>

              <p className="text-lg font-bold text-slate-800">
                {cloudBenchmark.duration_seconds ?? '-'} s
              </p>

            </div>


            <div className="rounded-xl border border-slate-200 p-3">

              <p className="text-xs text-slate-400">
                Fecha benchmark
              </p>

              <p className="text-lg font-bold text-slate-800">
                {cloudBenchmark.test_date || '-'}
              </p>

            </div>


            <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-3">

              <div className="flex items-center gap-1.5">

                <Wifi className="w-4 h-4 text-emerald-500" />

                <p className="text-xs text-slate-400">
                  Disponibilidad puntual
                </p>

              </div>

              <p className="text-lg font-bold text-slate-800 mt-1">
                {
                  liveCloud?.availability_pct
                  ?? '-'
                } %
              </p>

              <p className="text-xs text-slate-400">
                {
                  liveCloud?.availability_ok
                  ?? '-'
                }
                /
                {
                  liveCloud?.availability_checks
                  ?? '-'
                }
                {' '}checks
              </p>

            </div>

          </div>


          <div className="overflow-x-auto">

            <table className="w-full text-sm">

              <thead>

                <tr className="border-b text-left text-xs text-slate-500">

                  <th className="py-2">
                    Usuarios
                  </th>

                  <th>
                    p50
                  </th>

                  <th>
                    p95
                  </th>

                  <th>
                    p99
                  </th>

                  <th>
                    Solicitudes/s
                  </th>

                  <th>
                    Error
                  </th>

                  <th>
                    Requests
                  </th>

                </tr>

              </thead>


              <tbody>

                {scenarios.map((row) => (

                  <tr
                    key={row.vus}
                    className="border-b border-slate-100"
                  >

                    <td className="py-2 font-medium text-slate-700">
                      {row.vus}
                    </td>

                    <td>
                      {fmtMs(row.p50_ms)}
                    </td>

                    <td>
                      {fmtMs(row.p95_ms)}
                    </td>

                    <td>
                      {fmtMs(row.p99_ms)}
                    </td>

                    <td>
                      {
                        row.requests_per_second
                        ?.toFixed?.(2)
                        ?? '-'
                      }
                    </td>

                    <td>
                      {
                        row.error_pct
                        ?? '-'
                      } %
                    </td>

                    <td>
                      {
                        row.requests
                        ?? '-'
                      }
                    </td>

                  </tr>

                ))}

              </tbody>

            </table>

          </div>


          <div className="mt-4 rounded-xl bg-slate-50 p-3">

            <p className="text-xs text-slate-500">
              El benchmark de rendimiento se mantiene separado del
              proceso de Random Search y de la validación walk-forward.
              El tiempo total de ejecución del experimento Full Paper
              no se interpreta como latencia operativa del sistema.
            </p>

          </div>

        </div>
      )}


      {cloudError && (

        <div className="text-xs text-amber-600">
          {cloudError}
        </div>

      )}

    </div>
  )
}