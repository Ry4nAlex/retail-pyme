import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Mail, CheckCircle2 } from 'lucide-react'
import { authService } from '../services/api'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email) { setError('El correo es obligatorio'); return }
    setLoading(true)
    try {
      await authService.forgotPassword(email)
      setSent(true)
    } catch (err) {
      setError(err.response?.data?.detail || 'Algo salió mal')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-[400px]">
        <Link to="/login" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Volver al inicio de sesión
        </Link>

        {sent ? (
          <div className="text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-3" style={{ fontFamily: "'Sora', sans-serif" }}>Revisa tu bandeja de entrada</h2>
            <p className="text-slate-500 text-sm leading-relaxed mb-6">
              Si existe una cuenta para <strong>{email}</strong>, enviamos un enlace para restablecer la contraseña. Revisa tu carpeta de spam si no lo ves.
            </p>
            <Link to="/login" className="btn-primary w-full justify-center">Volver a iniciar sesión</Link>
          </div>
        ) : (
          <>
            <div className="w-14 h-14 bg-azure-50 rounded-2xl flex items-center justify-center mb-6 border border-azure-100">
              <Mail className="w-7 h-7 text-azure-500" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2" style={{ fontFamily: "'Sora', sans-serif" }}>Restablece tu contraseña</h2>
            <p className="text-slate-500 text-sm mb-8">Ingresa tu correo y te enviaremos un enlace de restablecimiento.</p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="field-label">Correo electrónico</label>
                <input
                  type="email" value={email}
                  onChange={(e) => { setEmail(e.target.value); setError('') }}
                  className={`field-input ${error ? 'border-red-400' : ''}`}
                  placeholder="tu@empresa.com"
                />
                {error && <p className="field-error">{error}</p>}
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full py-3">
                {loading ? <span className="spinner" /> : 'Enviar enlace'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}


export function ResetPasswordPage() {
  const [form, setForm] = useState({ password: '', confirm: '' })
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const token = new URLSearchParams(window.location.search).get('token')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (form.password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres'); return }
    if (form.password !== form.confirm) { setError('Las contraseñas no coinciden'); return }
    setLoading(true)
    try {
      await authService.resetPassword({ token, new_password: form.password })
      setDone(true)
    } catch (err) {
      setError(err.response?.data?.detail || 'Enlace inválido o vencido')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-[400px]">
        {done ? (
          <div className="text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-3" style={{ fontFamily: "'Sora', sans-serif" }}>Contraseña actualizada</h2>
            <p className="text-slate-500 text-sm mb-6">Tu contraseña se restableció correctamente.</p>
            <Link to="/login" className="btn-primary w-full justify-center">Iniciar sesión</Link>
          </div>
        ) : (
          <>
            <h2 className="text-2xl font-bold text-slate-900 mb-2" style={{ fontFamily: "'Sora', sans-serif" }}>Define una nueva contraseña</h2>
            <p className="text-slate-500 text-sm mb-8">Elige una contraseña segura de al menos 8 caracteres.</p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="field-label">Nueva contraseña</label>
                <input type="password" value={form.password}
                  onChange={(e) => { setForm({ ...form, password: e.target.value }); setError('') }}
                  className="field-input" placeholder="Mín. 8 caracteres" />
              </div>
              <div>
                <label className="field-label">Confirmar contraseña</label>
                <input type="password" value={form.confirm}
                  onChange={(e) => { setForm({ ...form, confirm: e.target.value }); setError('') }}
                  className={`field-input ${error ? 'border-red-400' : ''}`} placeholder="Repite la contraseña" />
                {error && <p className="field-error">{error}</p>}
              </div>
              <button type="submit" disabled={loading || !token} className="btn-primary w-full py-3">
                {loading ? <span className="spinner" /> : 'Restablecer contraseña'}
              </button>
              {!token && <p className="field-error text-center">Enlace de restablecimiento inválido. Solicita uno nuevo.</p>}
            </form>
          </>
        )}
      </div>
    </div>
  )
}
