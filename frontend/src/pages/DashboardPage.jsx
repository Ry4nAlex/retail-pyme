import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { dashboardService, productsService } from '../services/api'

import {
  AlertTriangle,
  Package,
  Brain,
  Building2,
  Users,
  ShieldCheck,
  Boxes,
  CheckCircle2,
  PackageX,
  History,
  ArrowRight,
} from 'lucide-react'

import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'


const StatCard = ({
  icon: Icon,
  label,
  value,
  sub,
  accent,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    className="stat-card text-left hover:-translate-y-0.5 hover:shadow-md transition-all"
  >
    <div className="flex items-start justify-between">
      <div>
        <p className="text-sm text-slate-500 font-medium">
          {label}
        </p>

        <p
          className="text-2xl font-bold text-slate-900 mt-1"
          style={{ fontFamily: "'Sora', sans-serif" }}
        >
          {value}
        </p>

        {sub && (
          <p className="text-xs text-slate-400 mt-1">
            {sub}
          </p>
        )}
      </div>

      <div
        className="p-2.5 rounded-xl"
        style={{ background: accent + '15' }}
      >
        <Icon
          className="w-5 h-5"
          style={{ color: accent }}
        />
      </div>
    </div>
  </button>
)


const getInventoryStatus = (product) => {
  const stock = Number(product.stock ?? 0)
  const minStock = Number(product.min_stock ?? 0)
  const maxStock = Number(product.max_stock ?? 0)

  if (stock <= 0) {
    return {
      key: 'low',
      label: 'Sin stock',
      priority: 0,
      action: 'Reabastecer',
      detail: `Stock 0 u · mínimo ${minStock} u`,
      badgeClass: 'bg-red-50 text-red-600 border-red-100',
    }
  }

  if (stock <= minStock) {
    return {
      key: 'low',
      label: 'Bajo stock',
      priority: 1,
      action: 'Revisar reposición',
      detail: `Stock ${stock} u · mínimo ${minStock} u`,
      badgeClass: 'bg-amber-50 text-amber-600 border-amber-100',
    }
  }

  if (maxStock > 0 && stock > maxStock) {
    return {
      key: 'over',
      label: 'Sobrestock',
      priority: 2,
      action: 'Revisar exceso',
      detail: `${stock - maxStock} u sobre el máximo`,
      badgeClass: 'bg-violet-50 text-violet-600 border-violet-100',
    }
  }

  return {
    key: 'healthy',
    label: 'Saludable',
    priority: 3,
    action: 'Sin acción',
    detail: `Stock ${stock} u`,
    badgeClass: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  }
}


async function loadAllProducts() {
  const pageSize = 100

  const firstResponse = await productsService.list({
    page: 1,
    size: pageSize,
  })

  const firstItems = firstResponse.data.items || []
  const total = Number(
    firstResponse.data.total ?? firstItems.length
  )

  const totalPages = Math.ceil(total / pageSize)

  if (totalPages <= 1) {
    return firstItems
  }

  const requests = []

  for (let page = 2; page <= totalPages; page += 1) {
    requests.push(
      productsService.list({
        page,
        size: pageSize,
      })
    )
  }

  const responses = await Promise.all(requests)

  const remainingItems = responses.flatMap(
    (response) => response.data.items || []
  )

  return [...firstItems, ...remainingItems]
}


export default function DashboardPage() {
  const navigate = useNavigate()

  const [kpis, setKpis] = useState(null)
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    const loadDashboard = async () => {
      try {
        // Primero verificamos qué tipo de usuario abrió el panel.
        const kpiResponse = await dashboardService.kpis()

        if (!mounted) return

        setKpis(kpiResponse.data)

        // El SuperAdmin mantiene su panel administrativo.
        if (kpiResponse.data?.system_scope) {
          return
        }

        // Para empresa/administrador cargamos el inventario real.
        const productItems = await loadAllProducts()

        if (!mounted) return

        setProducts(productItems)
      } catch (error) {
        console.error('No se pudo cargar el panel:', error)
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    loadDashboard()

    return () => {
      mounted = false
    }
  }, [])


  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-azure-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }


  /*
   * =========================================================
   * PANEL SUPERADMIN
   * =========================================================
   */
  if (kpis?.system_scope) {
    return (
      <div className="space-y-6">

        <div>
          <h1
            className="text-xl font-bold text-slate-900"
            style={{ fontFamily: "'Sora', sans-serif" }}
          >
            Panel SuperAdmin
          </h1>

          <p className="text-slate-500 text-sm mt-0.5">
            Gestión de empresas, usuarios y uso del sistema
          </p>
        </div>


        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">

          <StatCard
            icon={Building2}
            label="Empresas activas"
            value={kpis.companies_active ?? 0}
            sub={`${kpis.companies_total ?? 0} empresas registradas`}
            accent="#2563eb"
            onClick={() => navigate('/companies')}
          />

          <StatCard
            icon={Users}
            label="Usuarios activos"
            value={kpis.users_active ?? 0}
            sub={`${kpis.users_total ?? 0} usuarios registrados`}
            accent="#10b981"
            onClick={() => navigate('/users')}
          />

          <StatCard
            icon={ShieldCheck}
            label="Usuarios que usan el sistema"
            value={kpis.users_with_login ?? 0}
            sub="Con al menos un ingreso"
            accent="#8b5cf6"
            onClick={() => navigate('/users')}
          />

          <StatCard
            icon={Brain}
            label="Gestión"
            value="Empresas"
            sub="Usuarios y cuentas"
            accent="#f59e0b"
            onClick={() => navigate('/companies')}
          />

        </div>


        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          <div className="card p-5">

            <h3 className="font-semibold text-slate-800 mb-4 text-sm">
              Usuarios por rol
            </h3>

            <ResponsiveContainer width="100%" height={220}>

              <BarChart
                data={kpis.users_by_role || []}
                barSize={28}
              >

                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#f1f5f9"
                />

                <XAxis
                  dataKey="role"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                />

                <YAxis
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />

                <Tooltip
                  contentStyle={{
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0',
                    fontSize: 12,
                  }}
                />

                <Bar
                  dataKey="total"
                  fill="#2563eb"
                  radius={[6, 6, 0, 0]}
                />

              </BarChart>

            </ResponsiveContainer>

          </div>


          <div className="card p-5">

            <h3 className="font-semibold text-slate-800 mb-4 text-sm">
              Usuarios recientes
            </h3>

            <div className="space-y-2">

              {(kpis.recent_users || []).map((u, i) => (

                <div
                  key={`${u.email}-${i}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2"
                >

                  <div className="min-w-0">

                    <p className="truncate text-sm font-semibold text-slate-800">
                      {u.name}
                    </p>

                    <p className="truncate text-xs text-slate-400">
                      {u.company} - {u.email}
                    </p>

                  </div>

                  <span
                    className={
                      u.role === 'superadmin'
                        ? 'badge-yellow'
                        : u.role === 'admin'
                          ? 'badge-blue'
                          : 'badge-slate'
                    }
                  >
                    {u.role === 'client'
                      ? 'Empleado'
                      : u.role}
                  </span>

                </div>

              ))}

            </div>

          </div>

        </div>

      </div>
    )
  }


  /*
   * =========================================================
   * PANEL OPERATIVO DE LA EMPRESA
   * =========================================================
   */

  const enrichedProducts = products.map((product) => ({
    ...product,
    inventoryStatus: getInventoryStatus(product),
  }))


  const totalProducts = enrichedProducts.length

  const lowStockProducts = enrichedProducts.filter(
    (product) =>
      product.inventoryStatus.key === 'low'
  )

  const overstockProducts = enrichedProducts.filter(
    (product) =>
      product.inventoryStatus.key === 'over'
  )

  const healthyProducts = enrichedProducts.filter(
    (product) =>
      product.inventoryStatus.key === 'healthy'
  )


  const attentionProducts = enrichedProducts
    .filter(
      (product) =>
        product.inventoryStatus.key !== 'healthy'
    )
    .sort(
      (a, b) =>
        a.inventoryStatus.priority -
        b.inventoryStatus.priority
    )


  const inventoryDistribution = [
    {
      name: 'Saludables',
      value: healthyProducts.length,
      color: '#10b981',
    },
    {
      name: 'Bajo stock',
      value: lowStockProducts.length,
      color: '#f59e0b',
    },
    {
      name: 'Sobrestock',
      value: overstockProducts.length,
      color: '#8b5cf6',
    },
  ]


  return (
    <div className="space-y-6">

      {/* Encabezado */}
      <div>

        <h1
          className="text-xl font-bold text-slate-900"
          style={{ fontFamily: "'Sora', sans-serif" }}
        >
          Panel
        </h1>

        <p className="text-slate-500 text-sm mt-0.5">
          Resumen operativo para la gestión de inventario
        </p>

      </div>


      {/* =====================================================
          INDICADORES PRINCIPALES
      ====================================================== */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">

        <StatCard
          icon={Boxes}
          label="Productos"
          value={totalProducts}
          sub="productos registrados"
          accent="#2563eb"
          onClick={() => navigate('/products')}
        />

        <StatCard
          icon={AlertTriangle}
          label="Bajo stock"
          value={lowStockProducts.length}
          sub="requieren atención"
          accent="#f59e0b"
          onClick={() => navigate('/inventory')}
        />

        <StatCard
          icon={PackageX}
          label="Sobrestock"
          value={overstockProducts.length}
          sub="revisar exceso de inventario"
          accent="#8b5cf6"
          onClick={() => navigate('/inventory')}
        />

        <StatCard
          icon={CheckCircle2}
          label="Saludables"
          value={healthyProducts.length}
          sub="nivel de stock adecuado"
          accent="#10b981"
          onClick={() => navigate('/inventory')}
        />

      </div>


      {/* =====================================================
          RESUMEN + PRODUCTOS QUE REQUIEREN ATENCIÓN
      ====================================================== */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">


        {/* Estado general */}
        <div className="card p-5">

          <div className="mb-3">

            <h3 className="font-semibold text-slate-800 text-sm">
              Estado general del inventario
            </h3>

            <p className="text-xs text-slate-400 mt-1">
              Distribución según los niveles actuales de stock
            </p>

          </div>


          {totalProducts > 0 ? (
            <>

              <ResponsiveContainer
                width="100%"
                height={210}
              >

                <PieChart>

                  <Pie
                    data={inventoryDistribution}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={82}
                    paddingAngle={3}
                  >

                    {inventoryDistribution.map(
                      (item, index) => (
                        <Cell
                          key={index}
                          fill={item.color}
                        />
                      )
                    )}

                  </Pie>

                  <Tooltip
                    formatter={(value, name) => [
                      `${value} productos`,
                      name,
                    ]}
                    contentStyle={{
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      fontSize: 12,
                    }}
                  />

                </PieChart>

              </ResponsiveContainer>


              <div className="space-y-2 mt-2">

                {inventoryDistribution.map(
                  (item) => (

                    <div
                      key={item.name}
                      className="flex items-center justify-between text-xs"
                    >

                      <div className="flex items-center gap-2">

                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{
                            backgroundColor:
                              item.color,
                          }}
                        />

                        <span className="text-slate-600">
                          {item.name}
                        </span>

                      </div>

                      <span className="font-semibold text-slate-800">
                        {item.value}
                      </span>

                    </div>

                  )
                )}

              </div>

            </>
          ) : (

            <div className="h-56 flex flex-col items-center justify-center text-slate-400">

              <Package className="w-8 h-8 opacity-40 mb-2" />

              <p className="text-sm">
                No hay productos registrados
              </p>

            </div>

          )}

        </div>


        {/* Productos críticos */}
        <div className="card p-5 xl:col-span-2">

          <div className="flex items-start justify-between gap-4 mb-4">

            <div>

              <h3 className="font-semibold text-slate-800 text-sm">
                Productos que requieren atención
              </h3>

              <p className="text-xs text-slate-400 mt-1">
                Prioridad según los niveles actuales de inventario
              </p>

            </div>


            <button
              type="button"
              onClick={() => navigate('/inventory')}
              className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              Ver inventario

              <ArrowRight className="w-3.5 h-3.5" />

            </button>

          </div>


          {attentionProducts.length === 0 ? (

            <div className="h-52 flex flex-col items-center justify-center gap-2 text-slate-400">

              <CheckCircle2 className="w-9 h-9 text-emerald-400 opacity-70" />

              <p className="text-sm font-medium text-slate-500">
                No hay productos que requieran atención
              </p>

              <p className="text-xs">
                Todos los niveles de stock se encuentran dentro de los rangos establecidos.
              </p>

            </div>

          ) : (

            <div className="divide-y divide-slate-100">

              {attentionProducts
                .slice(0, 7)
                .map((product) => {

                  const status =
                    product.inventoryStatus

                  const stock = Number(
                    product.stock ?? 0
                  )

                  const minStock = Number(
                    product.min_stock ?? 0
                  )

                  const maxStock = Number(
                    product.max_stock ?? 0
                  )

                  return (

                    <div
                      key={product.id}
                      className="py-3 flex items-center gap-4"
                    >

                      <div
                        className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center flex-shrink-0"
                      >

                        <Package className="w-4 h-4 text-slate-400" />

                      </div>


                      <div className="min-w-0 flex-1">

                        <p className="text-sm font-semibold text-slate-800 truncate">
                          {product.name}
                        </p>

                        <p className="text-xs text-slate-400 mt-0.5">
                          {product.sku
                            ? `${product.sku} · `
                            : ''}
                          {status.detail}
                        </p>

                      </div>


                      <div className="hidden md:block text-right text-xs text-slate-500">

                        <p>
                          Stock:{' '}
                          <span className="font-semibold text-slate-700">
                            {stock}
                          </span>
                        </p>

                        <p className="mt-0.5">
                          Min: {minStock}
                          {maxStock > 0
                            ? ` · Max: ${maxStock}`
                            : ''}
                        </p>

                      </div>


                      <div className="flex flex-col items-end gap-1.5">

                        <span
                          className={`text-xs px-2.5 py-1 rounded-lg border font-medium ${status.badgeClass}`}
                        >
                          {status.label}
                        </span>

                        <span className="text-[11px] text-slate-400">
                          {status.action}
                        </span>

                      </div>

                    </div>

                  )
                })}


              {attentionProducts.length > 7 && (

                <button
                  type="button"
                  onClick={() =>
                    navigate('/inventory')
                  }
                  className="w-full text-center text-xs text-blue-600 font-medium pt-4 hover:text-blue-700"
                >
                  Ver los {attentionProducts.length} productos que requieren atención
                </button>

              )}

            </div>

          )}

        </div>

      </div>


      {/* =====================================================
          ACCESOS RÁPIDOS
      ====================================================== */}
      <div className="card p-5">

        <div className="mb-4">

          <h3 className="font-semibold text-slate-800 text-sm">
            Accesos rápidos
          </h3>

          <p className="text-xs text-slate-400 mt-1">
            Consulta y administra la información operativa del sistema
          </p>

        </div>


        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

          <button
            type="button"
            onClick={() =>
              navigate('/inventory')
            }
            className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 hover:border-blue-200 hover:bg-blue-50/40 transition text-left"
          >

            <div className="p-2.5 rounded-xl bg-blue-50">

              <Package className="w-5 h-5 text-blue-600" />

            </div>

            <div className="flex-1">

              <p className="text-sm font-semibold text-slate-800">
                Revisar inventario
              </p>

              <p className="text-xs text-slate-400 mt-0.5">
                Consulta y ajusta niveles de stock
              </p>

            </div>

            <ArrowRight className="w-4 h-4 text-slate-300" />

          </button>


          <button
            type="button"
            onClick={() =>
              navigate('/products')
            }
            className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 hover:border-blue-200 hover:bg-blue-50/40 transition text-left"
          >

            <div className="p-2.5 rounded-xl bg-violet-50">

              <Boxes className="w-5 h-5 text-violet-600" />

            </div>

            <div className="flex-1">

              <p className="text-sm font-semibold text-slate-800">
                Gestionar productos
              </p>

              <p className="text-xs text-slate-400 mt-0.5">
                Revisa el catálogo de productos
              </p>

            </div>

            <ArrowRight className="w-4 h-4 text-slate-300" />

          </button>


          <button
            type="button"
            onClick={() =>
              navigate('/sales')
            }
            className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 hover:border-blue-200 hover:bg-blue-50/40 transition text-left"
          >

            <div className="p-2.5 rounded-xl bg-emerald-50">

              <History className="w-5 h-5 text-emerald-600" />

            </div>

            <div className="flex-1">

              <p className="text-sm font-semibold text-slate-800">
                Historial de ventas
              </p>

              <p className="text-xs text-slate-400 mt-0.5">
                Consulta los registros históricos
              </p>

            </div>

            <ArrowRight className="w-4 h-4 text-slate-300" />

          </button>

        </div>

      </div>

    </div>
  )
}