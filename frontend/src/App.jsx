import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './hooks/useAuth'
import Layout from './components/common/Layout'
import LoginPage from './pages/LoginPage'
import { ForgotPasswordPage, ResetPasswordPage } from './pages/PasswordPages'
import DashboardPage from './pages/DashboardPage'
import { DatasetsPage, PredictionsPage } from './pages/MLPages'
import StockAnalysisPage from './pages/StockAnalysisPage'
import { ProductsPage, SalesPage, InventoryPage, CategoriesPage, UsersPage, CompaniesPage } from './pages/AppPages'

function Private({ children, adminOnly, superOnly, blockSuper }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (superOnly && user.role !== 'superadmin') return <Navigate to="/dashboard" replace />
  if (blockSuper && user.role === 'superadmin') return <Navigate to="/dashboard" replace />
  if (adminOnly && !['admin', 'superadmin'].includes(user.role)) return <Navigate to="/dashboard" replace />
  return <Layout>{children}</Layout>
}

function Public({ children }) {
  const { user } = useAuth()
  return user ? <Navigate to="/dashboard" replace /> : children
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Public><LoginPage /></Public>} />
      <Route path="/forgot-password" element={<Public><ForgotPasswordPage /></Public>} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route path="/dashboard"    element={<Private><DashboardPage /></Private>} />
      <Route path="/ingest"       element={<Navigate to="/ml/datasets" replace />} />
      <Route path="/products"     element={<Private blockSuper><ProductsPage /></Private>} />
      <Route path="/sales"        element={<Private blockSuper><SalesPage /></Private>} />
      <Route path="/inventory"    element={<Private blockSuper><InventoryPage /></Private>} />
      <Route path="/customers"    element={<Navigate to="/dashboard" replace />} />
      <Route path="/categories"   element={<Private blockSuper><CategoriesPage /></Private>} />
      <Route path="/ml/datasets"  element={<Private adminOnly blockSuper><DatasetsPage /></Private>} />
      <Route path="/ml/predictions" element={<Private blockSuper><PredictionsPage /></Private>} />
      <Route path="/ml/stock-analysis" element={<Private adminOnly blockSuper><StockAnalysisPage /></Private>} />
      <Route path="/users"        element={<Private adminOnly><UsersPage /></Private>} />
      <Route path="/companies"    element={<Private superOnly><CompaniesPage /></Private>} />

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3500,
            style: { borderRadius: '12px', fontSize: '13px', fontFamily: "'DM Sans', sans-serif" },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  )
}
