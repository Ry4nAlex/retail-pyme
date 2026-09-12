import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import {
  LayoutDashboard, Package, ShoppingCart, Tag,
  Brain, LogOut, Menu, X, TrendingUp, Database, UserCog,
  Building2, ShieldCheck, PackageSearch,
} from 'lucide-react'

const NAV = {
  superadmin: [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Panel' },
    { divider: true, label: 'Gestion' },
    { to: '/companies', icon: Building2, label: 'Empresas' },
    { to: '/users', icon: ShieldCheck, label: 'Usuarios' },
  ],
  admin: [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Panel' },
    { to: '/sales', icon: ShoppingCart, label: 'Historial de Ventas' },
    { to: '/products', icon: Package, label: 'Productos' },
    { to: '/inventory', icon: TrendingUp, label: 'Inventario' },
    { to: '/categories', icon: Tag, label: 'Categorias' },
    { divider: true, label: 'Aprendizaje automatico' },
    { to: '/ml/datasets', icon: Database, label: 'Conjunto de datos' },
    { to: '/ml/predictions', icon: Brain, label: 'Predicciones' },
    { to: '/ml/stock-analysis', icon: PackageSearch, label: 'Analisis de stock' },
    { divider: true, label: 'Administracion' },
    { to: '/users', icon: UserCog, label: 'Usuarios' },
  ],
  client: [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Panel' },
    { to: '/sales', icon: ShoppingCart, label: 'Ventas' },
    { to: '/products', icon: Package, label: 'Productos' },
    { to: '/inventory', icon: TrendingUp, label: 'Inventario' },
    { to: '/ml/predictions', icon: Brain, label: 'Predicciones' },
    { to: '/ml/stock-analysis', icon: PackageSearch, label: 'Analisis de stock' },
  ],
}

const ROLE_LABELS = {
  superadmin: 'SuperAdmin',
  admin: 'Administrador',
  client: 'Empleado',
}

function NavItem({ item }) {
  if (item.divider) {
    return (
      <div className="pt-4 pb-1.5 px-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-600">{item.label}</p>
      </div>
    )
  }
  const { to, icon: Icon, label } = item
  return (
    <NavLink to={to}>
      {({ isActive }) => (
        <span className={isActive ? 'nav-item-active' : 'nav-item'}>
          <Icon className="w-[18px] h-[18px] flex-shrink-0" />
          {label}
        </span>
      )}
    </NavLink>
  )
}

function Sidebar({ onClose }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const items = NAV[user?.role] || NAV.client

  const handleLogout = () => { logout(); navigate('/login') }

  return (
    <div className="flex flex-col h-full"
      style={{ background: 'linear-gradient(180deg, #0d1829 0%, #080f1a 100%)' }}>
      <div className="flex items-center justify-between px-5 py-5 border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }}>
            <TrendingUp className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-sm" style={{ fontFamily: "'Sora', sans-serif" }}>RetailPyme</p>
            <p className="text-slate-500 text-xs">Sistema predictivo</p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors lg:hidden">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {items.map((item, i) => <NavItem key={i} item={item} />)}
      </nav>

      <div className="p-3 border-t border-white/5">
        <div className="flex items-center gap-3 px-3 py-2 rounded-xl mb-1">
          <div className="w-8 h-8 rounded-lg bg-azure-500/20 text-azure-300 flex items-center justify-center font-bold text-sm flex-shrink-0"
            style={{ fontFamily: "'Sora', sans-serif" }}>
            {user?.name?.[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium truncate">{user?.name}</p>
            <p className="text-slate-500 text-xs">{ROLE_LABELS[user?.role] || user?.role}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2.5 w-full px-3 py-2 text-slate-500 hover:text-red-400 text-sm rounded-xl transition-colors"
        >
          <LogOut className="w-4 h-4" /> Cerrar sesion
        </button>
      </div>
    </div>
  )
}

export default function Layout({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex h-screen bg-slate-50">
      <aside className="hidden lg:flex w-60 flex-col flex-shrink-0">
        <Sidebar />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-60 h-full flex flex-col">
            <Sidebar onClose={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-slate-100 h-14 flex items-center px-5 gap-4 flex-shrink-0">
          <button onClick={() => setMobileOpen(true)} className="lg:hidden p-1.5 text-slate-500 hover:text-slate-800 transition-colors">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1" />
          <span className="text-xs text-slate-400 hidden sm:block">
            {new Date().toLocaleDateString('es-PE', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </span>
        </header>

        <main className="flex-1 overflow-y-auto p-5 lg:p-7">
          <div className="page-enter">{children}</div>
        </main>
      </div>
    </div>
  )
}
