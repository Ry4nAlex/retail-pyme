import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { dashboardService } from '../services/api'
import { DollarSign, TrendingUp, AlertTriangle, Package, Brain, Building2, Users, ShieldCheck } from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']

const StatCard = ({ icon: Icon, label, value, sub, accent, onClick }) => (
  <button type="button" onClick={onClick} className="stat-card text-left hover:-translate-y-0.5 hover:shadow-md transition-all">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-sm text-slate-500 font-medium">{label}</p>
        <p className="text-2xl font-bold text-slate-900 mt-1" style={{ fontFamily: "'Sora', sans-serif" }}>{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
      </div>
      <div className="p-2.5 rounded-xl" style={{ background: accent + '15' }}>
        <Icon className="w-5 h-5" style={{ color: accent }} />
      </div>
    </div>
  </button>
)

export default function DashboardPage() {
  const navigate = useNavigate()
  const [kpis, setKpis] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([dashboardService.kpis(), dashboardService.alerts()]).then(([k, a]) => {
      setKpis(k.data); setAlerts(a.data.alerts)
    }).finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-azure-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const fmt = (n) => `S/ ${Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}`

  if (kpis?.system_scope) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900" style={{ fontFamily: "'Sora', sans-serif" }}>Panel SuperAdmin</h1>
          <p className="text-slate-500 text-sm mt-0.5">Gestion de empresas, usuarios y uso del sistema</p>
        </div>

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard icon={Building2} label="Empresas activas" value={kpis.companies_active ?? 0} sub={`${kpis.companies_total ?? 0} empresas registradas`} accent="#2563eb" onClick={() => navigate('/companies')} />
          <StatCard icon={Users} label="Usuarios activos" value={kpis.users_active ?? 0} sub={`${kpis.users_total ?? 0} usuarios registrados`} accent="#10b981" onClick={() => navigate('/users')} />
          <StatCard icon={ShieldCheck} label="Usuarios que usan el sistema" value={kpis.users_with_login ?? 0} sub="Con al menos un ingreso" accent="#8b5cf6" onClick={() => navigate('/users')} />
          <StatCard icon={Brain} label="Gestion" value="Empresas" sub="Usuarios y cuentas" accent="#f59e0b" onClick={() => navigate('/companies')} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="card p-5">
            <h3 className="font-semibold text-slate-800 mb-4 text-sm">Usuarios por rol</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={kpis.users_by_role || []} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="role" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: 12 }} />
                <Bar dataKey="total" fill="#2563eb" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card p-5">
            <h3 className="font-semibold text-slate-800 mb-4 text-sm">Usuarios recientes</h3>
            <div className="space-y-2">
              {(kpis.recent_users || []).map((u, i) => (
                <div key={`${u.email}-${i}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800">{u.name}</p>
                    <p className="truncate text-xs text-slate-400">{u.company} - {u.email}</p>
                  </div>
                  <span className={u.role === 'superadmin' ? 'badge-yellow' : u.role === 'admin' ? 'badge-blue' : 'badge-slate'}>
                    {u.role === 'client' ? 'Empleado' : u.role}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900" style={{ fontFamily: "'Sora', sans-serif" }}>Panel</h1>
        <p className="text-slate-500 text-sm mt-0.5">Resumen operativo en tiempo real</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon={DollarSign} label="Ventas de hoy" value={fmt(kpis?.total_sales_today)} sub={`${kpis?.sales_count_today} transacciones`} accent="#2563eb" onClick={() => navigate('/sales')} />
        <StatCard icon={TrendingUp} label="Ventas del mes" value={fmt(kpis?.total_sales_month)} sub={`${kpis?.sales_count_month} transacciones`} accent="#10b981" onClick={() => navigate('/sales')} />
        <StatCard icon={AlertTriangle} label="Stock bajo" value={kpis?.products_low_stock ?? 0} sub="Productos bajo el minimo" accent="#f59e0b" onClick={() => navigate('/inventory')} />
        <StatCard icon={Package} label="Sin stock" value={kpis?.products_out_of_stock ?? 0} sub="Productos sin existencias" accent="#ef4444" onClick={() => navigate('/inventory')} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="card lg:col-span-2 p-5">
          <h3 className="font-semibold text-slate-800 mb-4 text-sm">Ventas - últimos 7 días</h3>
          <ResponsiveContainer width="100%" height={210}>
            <AreaChart data={kpis?.sales_last_7_days || []}>
              <defs>
                <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563eb" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `S/${v}`} />
              <Tooltip formatter={v => [`S/ ${v.toFixed(2)}`, 'Total']} contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: 13 }} />
              <Area type="monotone" dataKey="total" stroke="#2563eb" strokeWidth={2.5} fill="url(#g1)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-slate-800 mb-4 text-sm">Ingresos por categoría</h3>
          {kpis?.sales_by_category?.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={kpis.sales_by_category} dataKey="total" nameKey="category" cx="50%" cy="50%" innerRadius={48} outerRadius={72}>
                    {kpis.sales_by_category.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={v => `S/ ${v.toFixed(2)}`} contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-3 space-y-1.5">
                {kpis.sales_by_category.slice(0, 4).map((d, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="text-slate-600">{d.category}</span>
                    </div>
                    <span className="font-semibold text-slate-700">S/ {Number(d.total).toFixed(0)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-40 flex items-center justify-center text-slate-400 text-sm">Sin datos este mes</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Top products */}
        <div className="card p-5">
          <h3 className="font-semibold text-slate-800 mb-4 text-sm">Productos principales - este mes</h3>
          {kpis?.top_products?.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={kpis.top_products} layout="vertical" barSize={16}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} width={110} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: 12 }} />
                <Bar dataKey="quantity" fill="#2563eb" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-44 flex items-center justify-center text-slate-400 text-sm">Sin ventas este mes</div>
          )}
        </div>

        {/* Alerts */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <h3 className="font-semibold text-slate-800 text-sm">Alertas de inventario</h3>
          </div>
          {alerts.length === 0 ? (
            <div className="h-44 flex flex-col items-center justify-center gap-2 text-slate-400">
              <Package className="w-8 h-8 opacity-40" />
              <p className="text-sm">Todos los niveles de stock están saludables</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {alerts.map((a, i) => (
                <div key={i} className={`flex items-start gap-3 p-3 rounded-xl text-sm ${a.type === 'out_of_stock' ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-amber-50 text-amber-700 border border-amber-100'}`}>
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">{a.product}</p>
                    <p className="text-xs opacity-80 mt-0.5">
                      {a.type === 'out_of_stock' ? 'Sin stock' : `Stock: ${a.stock} / Min: ${a.min_stock}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
