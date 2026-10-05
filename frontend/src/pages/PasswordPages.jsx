import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Mail, CheckCircle2, QrCode, Upload } from 'lucide-react'
import { Html5Qrcode } from 'html5-qrcode'
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

  const handleQrFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    try {
      const scanner = new Html5Qrcode('qr-file-reader')
      const decodedText = await scanner.scanFile(file, false)
      let token = ''
      try {
        const decodedUrl = new URL(decodedText)
        token = decodedUrl.searchParams.get('token') || ''
      } catch {
        token = decodedText.startsWith('qr.') ? decodedText : ''
      }
      if (!token || !token.startsWith('qr.')) throw new Error('QR inválido')
      window.location.href = `/reset-password?token=${encodeURIComponent(token)}`
    } catch {
      setError('El código QR de recuperación no es válido o no pudo leerse.')
    } finally {
      e.target.value = ''
    }
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
            <p className="text-slate-500 text-sm mb-8">Elige una opción para recuperar el acceso a tu cuenta.</p>
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

            <div className="flex items-center gap-3 my-6">
              <div className="h-px bg-slate-200 flex-1" />
              <span className="text-xs font-medium text-slate-400 uppercase">o</span>
              <div className="h-px bg-slate-200 flex-1" />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-azure-50 flex items-center justify-center shrink-0">
                  <QrCode className="w-5 h-5 text-azure-500" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Recuperar con código QR</h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Si tienes un código QR de recuperación asignado a tu cuenta, selecciónalo para continuar.
                  </p>
                </div>
              </div>
              <label className="btn-secondary w-full justify-center cursor-pointer">
                <Upload className="w-4 h-4" />
                Cargar código QR
                <input type="file" accept="image/*" onChange={handleQrFile} className="hidden" />
              </label>
              <div id="qr-file-reader" className="hidden" />
            </div>
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
      setError(err.response?.data?.detail || 'El enlace o código de recuperación no es válido o ya expiró.')
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
              {!token && <p className="field-error text-center">El enlace o código de recuperación no es válido. Solicita uno nuevo.</p>}
            </form>
          </>
        )}
      </div>
    </div>
  )
}
