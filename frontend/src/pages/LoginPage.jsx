import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Eye, EyeOff, ArrowRight, BarChart3, TrendingUp, Package } from 'lucide-react'
import toast from 'react-hot-toast'

const FEATURE_ITEMS = [
  { icon: BarChart3, title: 'Analítica en tiempo real', desc: 'Monitorea el rendimiento de ventas con paneles en vivo e indicadores clave.' },
  { icon: TrendingUp, title: 'Pronóstico de demanda', desc: 'Predicciones con aprendizaje automático para optimizar niveles de inventario.' },
  { icon: Package, title: 'Inventario inteligente', desc: 'Alertas automáticas y recomendaciones de reposición.' },
]

export default function LoginPage() {
  const { login, loading } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPass, setShowPass] = useState(false)
  const [errors, setErrors] = useState({})

  const validate = () => {
    const e = {}
    if (!form.email) e.email = 'El correo es obligatorio'
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Correo electrónico inválido'
    if (!form.password) e.password = 'La contraseña es obligatoria'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    const result = await login(form.email, form.password)
    if (result.ok) {
      navigate('/dashboard')
    } else {
      toast.error(result.error, {
  duration: 7000,
})
    }
  }

  return (
    <div className="min-h-screen flex" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* Left panel - branding */}
      <div
        className="hidden lg:flex lg:w-[52%] flex-col justify-between p-14 relative overflow-hidden"
        style={{ background: 'linear-gradient(145deg, #080f1a 0%, #0d1829 40%, #132035 70%, #1e3a5f 100%)' }}
      >
        {/* Grid pattern */}
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }} />

        {/* Glow orbs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #2563eb, transparent 70%)', filter: 'blur(60px)' }} />
        <div className="absolute bottom-1/3 right-1/4 w-64 h-64 rounded-full opacity-8"
          style={{ background: 'radial-gradient(circle, #1d4ed8, transparent 70%)', filter: 'blur(40px)' }} />

        {/* Logo */}
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }}>
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-display font-700 text-white text-xl tracking-tight">RetailPyme</span>
              <span className="ml-2 text-xs font-medium text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded-full border border-blue-400/20">Predictivo</span>
            </div>
          </div>
        </div>

        {/* Center content */}
        <div className="relative z-10 flex-1 flex flex-col justify-center py-16">
          <h1 className="font-display text-5xl font-bold text-white leading-tight mb-6"
            style={{ fontFamily: "'Sora', sans-serif", letterSpacing: '-1.5px' }}>
            Inteligencia de retail<br />
            <span style={{ background: 'linear-gradient(90deg, #60a5fa, #93c5fd)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              basada en datos
            </span>
          </h1>
          <p className="text-slate-400 text-lg leading-relaxed mb-12 max-w-md">
            Centraliza tus ventas, predice la demanda y toma mejores decisiones de inventario en una sola plataforma.
          </p>

          <div className="space-y-5">
            {FEATURE_ITEMS.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-4">
                <div className="w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Icon className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">{title}</p>
                  <p className="text-slate-500 text-sm mt-0.5 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom */}
        <div className="relative z-10">
          <p className="text-slate-600 text-xs">
            © {new Date().getFullYear()} RetailPyme - Proyecto de investigación UPC
          </p>
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-slate-50">
        <div className="w-full max-w-[400px]">

          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-10">
            <div className="w-8 h-8 rounded-lg bg-azure-500 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
            <span className="font-display font-bold text-slate-900 text-lg">RetailPyme</span>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-2" style={{ fontFamily: "'Sora', sans-serif", letterSpacing: '-0.5px' }}>
              Inicia sesión en tu cuenta
            </h2>
            <p className="text-slate-500 text-sm">Ingresa tus credenciales para acceder a la plataforma.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="field-label">Correo electrónico</label>
              <input
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(e) => { setForm({ ...form, email: e.target.value }); setErrors({ ...errors, email: '' }) }}
                className={`field-input ${errors.email ? 'border-red-400 focus:ring-red-400 focus:border-red-400' : ''}`}
                placeholder="tu@empresa.com"
              />
              {errors.email && <p className="field-error">{errors.email}</p>}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="field-label mb-0">Contraseña</label>
                <Link to="/forgot-password" className="text-xs text-azure-500 hover:text-azure-600 font-medium transition-colors">
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={form.password}
                  onChange={(e) => { setForm({ ...form, password: e.target.value }); setErrors({ ...errors, password: '' }) }}
                  className={`field-input pr-12 ${errors.password ? 'border-red-400 focus:ring-red-400 focus:border-red-400' : ''}`}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <p className="field-error">{errors.password}</p>}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 text-base mt-2"
              style={{ background: loading ? '' : 'linear-gradient(135deg, #2563eb, #1d4ed8)', boxShadow: '0 4px 20px rgba(37,99,235,0.3)' }}
            >
              {loading ? <span className="spinner" /> : <>Iniciar sesión <ArrowRight className="w-4 h-4" /></>}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
