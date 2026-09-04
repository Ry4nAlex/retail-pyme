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

export default function IngestPage({ embedded = false }) {
  const [files, setFiles] = useState([])           // hasta 2
  const [horizon, setHorizon] = useState(3)
  const [advanced, setAdvanced] = useState(false)
  const [thresholds, setThresholds] = useState({ over: 75, under: 30, target: 45 })
  const [replaceExisting, setReplaceExisting] = useState(false)
  const [runMl, setRunMl] = useState(true)
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5">
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

          {result.ml?.metrics && (
            <div className="card p-5">
              <h3 className="font-semibold text-slate-800 text-sm mb-3 flex items-center gap-2"><Brain className="w-4 h-4 text-azure-500" /> Calidad del modelo XGBoost</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  ['Split objetivo', result.ml.metrics.target_split || `${result.ml.metrics.target_train_pct || result.ml.metrics.train_pct || 70}/${result.ml.metrics.target_val_pct || result.ml.metrics.val_pct || 20}/${result.ml.metrics.target_test_pct || result.ml.metrics.test_pct || 10}`],
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
                Validación cronológica 70/20/10 · Train/Validación/Test: {result.ml.metrics.n_train}/{result.ml.metrics.n_val ?? '-'}/{result.ml.metrics.n_test} registros
              </p>
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
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
