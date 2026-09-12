import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  productsService,
  salesService,
  customersService,
  categoriesService,
  usersService,
  companiesService,
} from "../services/api";
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Package,
  ShoppingCart,
  Users,
  Tag,
  X,
  UserCog,
  ArrowUpDown,
  Building2,
  ShieldCheck,
} from "lucide-react";
import toast from "react-hot-toast";

const UNIT_LABELS = {
  unit: "unidad",
  box: "caja",
  blister: "blíster",
  bottle: "botella",
  kg: "kg",
  g: "g",
  ml: "ml",
  liter: "litro",
};

const CUSTOMER_TYPE_LABELS = {
  individual: "Persona natural",
  business: "Empresa",
};

const PAYMENT_METHOD_LABELS = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
  digital_wallet: "Billetera digital",
};

const ROLE_LABELS = {
  superadmin: "SuperAdmin",
  admin: "Administrador",
  client: "Empleado",
};

// Shared helpers
const Pagination = ({ page, size, total, setPage }) => {
  const pages = Math.ceil(total / size);
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50/50">
      <span className="text-xs text-slate-400">
        {Math.min((page - 1) * size + 1, total)}-{Math.min(page * size, total)}{" "}
        de {total}
      </span>
      <div className="flex gap-2">
        <button
          disabled={page === 1}
          onClick={() => setPage((p) => p - 1)}
          className="btn-secondary py-1 px-3 text-xs disabled:opacity-40"
        >
          Anterior
        </button>
        <button
          disabled={page * size >= total}
          onClick={() => setPage((p) => p + 1)}
          className="btn-secondary py-1 px-3 text-xs disabled:opacity-40"
        >
          Siguiente
        </button>
      </div>
    </div>
  );
};

const Modal = ({ title, onClose, children, footer }) => createPortal(
  <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-6">
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] flex flex-col overflow-hidden">
      <div className="card-header shrink-0">
        <h2 className="font-semibold text-slate-800">{title}</h2>
        <button onClick={onClose} className="btn-ghost p-1.5">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-6 space-y-4">{children}</div>
      {footer && (
        <div className="shrink-0 flex gap-3 px-6 py-4 border-t border-slate-100 justify-end">
          {footer}
        </div>
      )}
    </div>
  </div>,
  document.body,
);

// Products
const PROD_EMPTY = {
  sku: "",
  name: "",
  description: "",
  unit_cost: "0",
  unit_price: "0",
  stock: 0,
  min_stock: 0,
  max_stock: 0,
  unit: "unit",
  category_id: "",
};

export function ProductsPage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [cats, setCats] = useState([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(PROD_EMPTY);
  const [saving, setSaving] = useState(false);
  const SIZE = 15;

  const load = () =>
    productsService
      .list({ page, size: SIZE, search: search || undefined })
      .then((r) => {
        setItems(r.data.items);
        setTotal(r.data.total);
      });
  useEffect(() => {
    load();
  }, [page, search]);
  useEffect(() => {
    categoriesService.list().then((r) => setCats(r.data));
  }, []);

  const openCreate = () => {
    setForm(PROD_EMPTY);
    setEditing(null);
    setModal(true);
  };
  const openEdit = (p) => {
    setForm({
      sku: p.sku,
      name: p.name,
      description: p.description || "",
      unit_cost: p.unit_cost,
      unit_price: p.unit_price,
      stock: p.stock,
      min_stock: p.min_stock,
      max_stock: p.max_stock,
      unit: p.unit,
      category_id: p.category_id || "",
    });
    setEditing(p.id);
    setModal(true);
  };
  const save = async () => {
    setSaving(true);
    try {
      const d = { ...form, category_id: form.category_id || null };
      editing
        ? await productsService.update(editing, d)
        : await productsService.create(d);
      toast.success(editing ? "Producto actualizado" : "Producto creado");
      setModal(false);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Error");
    } finally {
      setSaving(false);
    }
  };
  const del = async (id, name) => {
    if (!confirm(`¿Eliminar "${name}"?`)) return;
    await productsService.delete(id);
    toast.success("Eliminado");
    load();
  };

  const stockBadge = (p) =>
    p.stock === 0 ? (
      <span className="badge-red">Sin stock</span>
    ) : p.stock <= p.min_stock ? (
      <span className="badge-yellow">Bajo</span>
    ) : (
      <span className="badge-green">OK</span>
    );
  const F = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-xl font-bold text-slate-900"
            style={{ fontFamily: "'Sora',sans-serif" }}
          >
            Productos
          </h1>
          <p className="text-slate-500 text-sm">{total} productos</p>
        </div>
        <div className="flex gap-2">
          <button onClick={openCreate} className="btn-primary">
            <Plus className="w-4 h-4" />
            Nuevo producto
          </button>
        </div>
      </div>
      <div className="card p-4 flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            className="field-input pl-10"
            placeholder="Buscar por nombre o SKU..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>
      <div className="table-wrapper">
        <table className="w-full">
          <thead className="table-head">
            <tr>
              {["SKU", "Nombre", "Categoría", "Precio", "Stock actual", "Estado", ""].map(
                (h) => (
                  <th key={h} className="table-th">
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="text-center py-12 text-slate-400 text-sm"
                >
                  <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No hay productos
                </td>
              </tr>
            ) : (
              items.map((p) => (
                <tr key={p.id} className="table-row">
                  <td className="table-td font-mono text-xs text-slate-500">
                    {p.sku}
                  </td>
                  <td className="table-td font-medium text-slate-800">
                    {p.name}
                  </td>
                  <td className="table-td text-slate-500 text-xs">
                    {p.category?.name || "-"}
                  </td>
                  <td className="table-td font-semibold text-slate-700">
                    S/ {Number(p.unit_price).toFixed(2)}
                  </td>
                  <td className="table-td text-slate-700">
                    {p.stock}{" "}
                    <span className="text-xs text-slate-400">{UNIT_LABELS[p.unit] || p.unit}</span>
                  </td>
                  <td className="table-td">{stockBadge(p)}</td>
                  <td className="table-td">
                    <div className="flex gap-1">
                      <button
                        onClick={() => openEdit(p)}
                        className="btn-ghost p-1.5"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => del(p.id, p.name)}
                        className="btn-ghost p-1.5 text-red-500 hover:bg-red-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <Pagination page={page} size={SIZE} total={total} setPage={setPage} />
      </div>
      {modal && (
        <Modal
          title={editing ? "Editar producto" : "Nuevo producto"}
          onClose={() => setModal(false)}
          footer={
            <>
              <button onClick={() => setModal(false)} className="btn-secondary">
                Cancelar
              </button>
              <button
                onClick={save}
                disabled={saving || !form.sku || !form.name}
                className="btn-primary"
              >
                {saving ? "Guardando..." : "Guardar"}
              </button>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label">SKU *</label>
              <input
                className="field-input"
                value={form.sku}
                onChange={(e) => F("sku", e.target.value)}
              />
            </div>
            <div>
              <label className="field-label">Categoría</label>
              <select
                className="field-input"
                value={form.category_id}
                onChange={(e) => F("category_id", e.target.value)}
              >
                <option value="">Ninguna</option>
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="field-label">Nombre *</label>
            <input
              className="field-input"
              value={form.name}
              onChange={(e) => F("name", e.target.value)}
            />
          </div>
          <div>
            <label className="field-label">Descripción</label>
            <textarea
              className="field-input"
              rows={2}
              value={form.description}
              onChange={(e) => F("description", e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label">Costo unitario</label>
              <input
                type="number"
                step="0.01"
                className="field-input"
                value={form.unit_cost}
                onChange={(e) => F("unit_cost", e.target.value)}
              />
            </div>
            <div>
              <label className="field-label">Precio unitario</label>
              <input
                type="number"
                step="0.01"
                className="field-input"
                value={form.unit_price}
                onChange={(e) => F("unit_price", e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="field-label">Stock actual</label>
              <input
                type="number"
                className="field-input"
                value={form.stock}
                onChange={(e) => F("stock", +e.target.value)}
              />
            </div>
            <div>
              <label className="field-label">Stock mínimo</label>
              <input
                type="number"
                className="field-input"
                value={form.min_stock}
                onChange={(e) => F("min_stock", +e.target.value)}
              />
            </div>
            <div>
              <label className="field-label">Stock máximo</label>
              <input
                type="number"
                className="field-input"
                value={form.max_stock}
                onChange={(e) => F("max_stock", +e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="field-label">Unidad</label>
            <select
              className="field-input"
              value={form.unit}
              onChange={(e) => F("unit", e.target.value)}
            >
              {[
                "unit",
                "box",
                "blister",
                "bottle",
                "kg",
                "g",
                "ml",
                "liter",
              ].map((u) => (
                <option key={u} value={u}>{UNIT_LABELS[u] || u}</option>
              ))}
            </select>
          </div>
        </Modal>
      )}
    </div>
  );
}

// Inventory
export function InventoryPage() {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [ajuste, setAjuste] = useState({ type: "in", quantity: 1, reason: "" });
  const [saving, setSaving] = useState(false);
  const load = () =>
    productsService
      .list({ page: 1, size: 100, search: search || undefined })
      .then((r) => setItems(r.data.items));
  useEffect(() => {
    load();
  }, [search]);
  const apply = async () => {
    setSaving(true);
    try {
      await productsService.adjustStock(selected.id, {
        product_id: selected.id,
        ...ajuste,
      });
      toast.success("Stock actualizado");
      setSelected(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Error");
    } finally {
      setSaving(false);
    }
  };
  const badge = (p) =>
    p.stock === 0 ? (
      <span className="badge-red">Sin stock</span>
    ) : p.stock <= p.min_stock ? (
      <span className="badge-yellow">Bajo</span>
    ) : (
      <span className="badge-green">Normal</span>
    );

  return (
    <div className="space-y-5">
      <div>
        <h1
          className="text-xl font-bold text-slate-900"
          style={{ fontFamily: "'Sora',sans-serif" }}
        >
          Inventario
        </h1>
        <p className="text-slate-500 text-sm">
          Monitorea y ajusta los niveles de stock
        </p>
      </div>
      <div className="card p-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            className="field-input pl-10"
            placeholder="Buscar producto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="table-wrapper">
        <table className="w-full">
          <thead className="table-head">
            <tr>
              {[
                "SKU",
                "Producto",
                "Stock",
                "Min",
                "Max",
                "Estado",
                "Ajustar",
              ].map((h) => (
                <th key={h} className="table-th">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} className="table-row">
                <td className="table-td font-mono text-xs text-slate-400">
                  {p.sku}
                </td>
                <td className="table-td font-medium text-slate-800">
                  {p.name}
                </td>
                <td className="table-td font-bold text-slate-900">
                  {p.stock}{" "}
                  <span className="text-xs font-normal text-slate-400">
                    {UNIT_LABELS[p.unit] || p.unit}
                  </span>
                </td>
                <td className="table-td text-slate-500">{p.min_stock}</td>
                <td className="table-td text-slate-500">{p.max_stock}</td>
                <td className="table-td">{badge(p)}</td>
                <td className="table-td">
                  <button
                    onClick={() => {
                      setSelected(p);
                      setAjuste({ type: "in", quantity: 1, reason: "" });
                    }}
                    className="btn-ghost p-1.5"
                  >
                    <ArrowUpDown className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected && (
        <Modal
          title="Ajustar stock"
          onClose={() => setSelected(null)}
          footer={
            <>
              <button
                onClick={() => setSelected(null)}
                className="btn-secondary"
              >
                Cancelar
              </button>
              <button onClick={apply} disabled={saving} className="btn-primary">
                {saving ? "Aplicando..." : "Aplicar"}
              </button>
            </>
          }
        >
          <div className="bg-azure-50 border border-azure-100 rounded-xl p-4">
            <p className="font-semibold text-slate-800">{selected.name}</p>
            <p className="text-sm text-slate-500 mt-1">
              Stock actual: <strong>{selected.stock}</strong> {UNIT_LABELS[selected.unit] || selected.unit}
            </p>
          </div>
          <div>
            <label className="field-label">Tipo</label>
            <select
              className="field-input"
              value={ajuste.type}
              onChange={(e) =>
                setAjuste((a) => ({ ...a, type: e.target.value }))
              }
            >
              <option value="in">Entrada de stock (sumar)</option>
              <option value="out">Salida de stock (restar)</option>
              <option value="adjustment">Ajuste exacto</option>
              <option value="return">Devolución</option>
            </select>
          </div>
          <div>
            <label className="field-label">Cantidad</label>
            <input
              type="number"
              min={0}
              className="field-input"
              value={ajuste.quantity}
              onChange={(e) =>
                setAjuste((a) => ({ ...a, quantity: +e.target.value }))
              }
            />
            <p className="text-xs text-slate-400 mt-1">
              {ajuste.type === "adjustment"
                ? `El stock quedará exactamente en: ${ajuste.quantity}`
                : `Stock resultante: ${selected.stock + (ajuste.type === "out" ? -ajuste.quantity : ajuste.quantity)}`}
            </p>
          </div>
          <div>
            <label className="field-label">Motivo</label>
            <input
              className="field-input"
              placeholder="Ej. entrega de proveedor, conteo físico..."
              value={ajuste.reason}
              onChange={(e) =>
                setAjuste((a) => ({ ...a, reason: e.target.value }))
              }
            />
          </div>
        </Modal>
      )}
    </div>
  );
}

// Sales
export function SalesPage() {
  const [sales, setSales] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(false);
  const [prods, setProds] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState({
    customer_id: "",
    payment_method: "cash",
    items: [],
  });
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const SIZE = 15;

  const load = () =>
    salesService.list({ page, size: SIZE }).then((r) => {
      setSales(r.data.items);
      setTotal(r.data.total);
    });
  useEffect(() => {
    load();
  }, [page]);

  const openNew = async () => {
    const [p, c] = await Promise.all([
      productsService.list({ size: 100 }),
      customersService.list({ size: 100 }),
    ]);
    setProds(p.data.items);
    setCustomers(c.data.items);
    setForm({ customer_id: "", payment_method: "cash", items: [] });
    setSearch("");
    setModal(true);
  };
  const addProd = (p) =>
    setForm((f) => ({
      ...f,
      items: f.items.find((i) => i.product_id === p.id)
        ? f.items.map((i) =>
            i.product_id === p.id ? { ...i, quantity: i.quantity + 1 } : i,
          )
        : [
            ...f.items,
            {
              product_id: p.id,
              name: p.name,
              quantity: 1,
              unit_price: +p.unit_price,
              discount: 0,
            },
          ],
    }));
  const remove = (id) =>
    setForm((f) => ({
      ...f,
      items: f.items.filter((i) => i.product_id !== id),
    }));
  const upd = (id, k, v) =>
    setForm((f) => ({
      ...f,
      items: f.items.map((i) => (i.product_id === id ? { ...i, [k]: v } : i)),
    }));
  const sub = form.items.reduce(
    (s, i) => s + i.quantity * i.unit_price - (i.discount || 0),
    0,
  );
  const igv = sub * 0.18;

  const doSave = async () => {
    if (!form.items.length) {
      toast.error("Agrega al menos un producto");
      return;
    }
    setSaving(true);
    try {
      await salesService.create({
        ...form,
        customer_id: form.customer_id || null,
        items: form.items.map((i) => ({
          product_id: i.product_id,
          quantity: i.quantity,
          unit_price: i.unit_price,
          discount: i.discount || 0,
        })),
      });
      toast.success("Venta registrada");
      setModal(false);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Error");
    } finally {
      setSaving(false);
    }
  };
  const cancel = async (id, num) => {
    if (!confirm(`¿Cancelarar venta ${num}?`)) return;
    try {
      await salesService.cancel(id);
      toast.success("Cancelarado");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Error");
    }
  };
  const fp = prods
    .filter(
      (p) =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.sku.toLowerCase().includes(search.toLowerCase()),
    )
    .slice(0, 15);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-xl font-bold text-slate-900"
            style={{ fontFamily: "'Sora',sans-serif" }}
          >
            Ventas
          </h1>
          <p className="text-slate-500 text-sm">{total} registros</p>
        </div>
      </div>
      <div className="table-wrapper">
        <table className="w-full">
          <thead className="table-head">
            <tr>
              {[
                "Venta #",
                "Fecha",
                "Cliente",
                "Total",
                "Pago",
                "Estado",
                "",
              ].map((h) => (
                <th key={h} className="table-th">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sales.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="text-center py-12 text-slate-400 text-sm"
                >
                  <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No hay ventas
                </td>
              </tr>
            ) : (
              sales.map((s) => (
                <tr key={s.id} className="table-row">
                  <td className="table-td font-mono text-xs font-semibold text-azure-600">
                    {s.sale_number}
                  </td>
                  <td className="table-td text-slate-500 text-xs">
                    {new Date(s.sale_date).toLocaleDateString("es-PE")}
                  </td>
                  <td className="table-td text-slate-600">
                    {s.customer?.name || "Cliente eventual"}
                  </td>
                  <td className="table-td font-bold text-slate-900">
                    S/ {Number(s.total).toFixed(2)}
                  </td>
                  <td className="table-td text-slate-500 text-xs">
                    {PAYMENT_METHOD_LABELS[s.payment_method] || s.payment_method}
                  </td>
                  <td className="table-td">
                    {s.status === "completed" ? (
                      <span className="badge-green">Completada</span>
                    ) : (
                      <span className="badge-red">Cancelada</span>
                    )}
                  </td>
                  <td className="table-td">
                    {s.status === "completed" && (
                      <button
                        onClick={() => cancel(s.id, s.sale_number)}
                        className="btn-ghost p-1.5 text-red-500 hover:bg-red-50"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <Pagination page={page} size={SIZE} total={total} setPage={setPage} />
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[94vh] flex flex-col">
            <div className="card-header">
              <h2 className="font-semibold text-slate-800">Nueva venta</h2>
              <button
                onClick={() => setModal(false)}
                className="btn-ghost p-1.5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold text-slate-700 mb-3 text-sm">
                  Agregar productos
                </h3>
                <div className="relative mb-3">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    className="field-input pl-10"
                    placeholder="Buscar producto..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <div className="space-y-1 max-h-56 overflow-y-auto">
                  {fp.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => addProd(p)}
                      className="w-full flex justify-between items-center px-3 py-2.5 rounded-xl text-sm hover:bg-azure-50 border border-transparent hover:border-azure-100 transition-all text-left"
                    >
                      <div>
                        <p className="font-medium text-slate-800">{p.name}</p>
                        <p className="text-xs text-slate-400">
                          Stock: {p.stock}
                        </p>
                      </div>
                      <span className="text-azure-600 font-semibold">
                        S/ {Number(p.unit_price).toFixed(2)}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="mt-4 space-y-3">
                  <div>
                    <label className="field-label">Cliente</label>
                    <select
                      className="field-input"
                      value={form.customer_id}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, customer_id: e.target.value }))
                      }
                    >
                      <option value="">Cliente eventual</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Método de pago</label>
                    <select
                      className="field-input"
                      value={form.payment_method}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          payment_method: e.target.value,
                        }))
                      }
                    >
                      <option value="cash">Efectivo</option>
                      <option value="card">Tarjeta</option>
                      <option value="transfer">Transferencia</option>
                      <option value="digital_wallet">Billetera digital</option>
                    </select>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-slate-700 mb-3 text-sm">
                  Carrito
                </h3>
                {form.items.length === 0 ? (
                  <div className="h-40 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center text-slate-400 text-sm">
                    Agrega productos al carrito
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {form.items.map((i) => (
                      <div
                        key={i.product_id}
                        className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl text-sm"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-800 truncate">
                            {i.name}
                          </p>
                          <div className="flex gap-2 mt-1">
                            <input
                              type="number"
                              min={1}
                              value={i.quantity}
                              onChange={(e) =>
                                upd(i.product_id, "quantity", +e.target.value)
                              }
                              className="w-14 border border-slate-200 rounded-lg px-2 py-1 text-xs"
                            />
                            <span className="text-slate-400 self-center">
                              ×
                            </span>
                            <input
                              type="number"
                              step="0.01"
                              value={i.unit_price}
                              onChange={(e) =>
                                upd(i.product_id, "unit_price", +e.target.value)
                              }
                              className="w-20 border border-slate-200 rounded-lg px-2 py-1 text-xs"
                            />
                          </div>
                        </div>
                        <span className="font-bold text-slate-900 w-20 text-right">
                          S/ {(i.quantity * i.unit_price).toFixed(2)}
                        </span>
                        <button
                          onClick={() => remove(i.product_id)}
                          className="text-red-400 hover:text-red-600"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-4 border-t pt-4 space-y-2 text-sm">
                  <div className="flex justify-between text-slate-500">
                    <span>Subtotal</span>
                    <span>S/ {sub.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>IGV (18%)</span>
                    <span>S/ {igv.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-lg text-slate-900 border-t pt-2">
                    <span>TOTAL</span>
                    <span>S/ {(sub + igv).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-slate-100 justify-end">
              <button onClick={() => setModal(false)} className="btn-secondary">
                Cancelar
              </button>
              <button
                onClick={doSave}
                disabled={saving || !form.items.length}
                className="btn-primary"
              >
                <ShoppingCart className="w-4 h-4" />
                {saving ? "Procesando..." : "Registrar venta"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Customers
const CUST_EMPTY = {
  name: "",
  document: "",
  email: "",
  phone: "",
  address: "",
  type: "individual",
};
export function CustomersPage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(CUST_EMPTY);
  const [saving, setSaving] = useState(false);
  const SIZE = 15;
  const load = () =>
    customersService
      .list({ page, size: SIZE, search: search || undefined })
      .then((r) => {
        setItems(r.data.items);
        setTotal(r.data.total);
      });
  useEffect(() => {
    load();
  }, [page, search]);
  const openCreate = () => {
    setForm(CUST_EMPTY);
    setEditing(null);
    setModal(true);
  };
  const openEdit = (c) => {
    setForm({
      name: c.name,
      document: c.document || "",
      email: c.email || "",
      phone: c.phone || "",
      address: c.address || "",
      type: c.type,
    });
    setEditing(c.id);
    setModal(true);
  };
  const save = async () => {
    setSaving(true);
    try {
      editing
        ? await customersService.update(editing, form)
        : await customersService.create(form);
      toast.success(editing ? "Actualizado" : "Creado");
      setModal(false);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Error");
    } finally {
      setSaving(false);
    }
  };
  const del = async (id, name) => {
    if (!confirm(`¿Eliminar "${name}"?`)) return;
    await customersService.delete(id);
    toast.success("Eliminado");
    load();
  };
  const F = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-xl font-bold text-slate-900"
            style={{ fontFamily: "'Sora',sans-serif" }}
          >
            Clientes
          </h1>
          <p className="text-slate-500 text-sm">{total} registros</p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <Plus className="w-4 h-4" />
          Nuevo cliente
        </button>
      </div>
      <div className="card p-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            className="field-input pl-10"
            placeholder="Buscar por nombre o documento..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>
      <div className="table-wrapper">
        <table className="w-full">
          <thead className="table-head">
            <tr>
              {["Nombre", "Documento", "Email", "Teléfono", "Tipo", ""].map((h) => (
                <th key={h} className="table-th">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="text-center py-12 text-slate-400 text-sm"
                >
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No hay clientes
                </td>
              </tr>
            ) : (
              items.map((c) => (
                <tr key={c.id} className="table-row">
                  <td className="table-td font-medium text-slate-800">
                    {c.name}
                  </td>
                  <td className="table-td font-mono text-xs text-slate-400">
                    {c.document || "-"}
                  </td>
                  <td className="table-td text-slate-500 text-xs">
                    {c.email || "-"}
                  </td>
                  <td className="table-td text-slate-500 text-xs">
                    {c.phone || "-"}
                  </td>
                  <td className="table-td">
                    <span className="badge-slate">{CUSTOMER_TYPE_LABELS[c.type] || c.type}</span>
                  </td>
                  <td className="table-td">
                    <div className="flex gap-1">
                      <button
                        onClick={() => openEdit(c)}
                        className="btn-ghost p-1.5"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => del(c.id, c.name)}
                        className="btn-ghost p-1.5 text-red-500 hover:bg-red-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <Pagination page={page} size={SIZE} total={total} setPage={setPage} />
      </div>
      {modal && (
        <Modal
          title={editing ? "Editar cliente" : "Nuevo cliente"}
          onClose={() => setModal(false)}
          footer={
            <>
              <button onClick={() => setModal(false)} className="btn-secondary">
                Cancelar
              </button>
              <button
                onClick={save}
                disabled={saving || !form.name}
                className="btn-primary"
              >
                {saving ? "Guardando..." : "Guardar"}
              </button>
            </>
          }
        >
          <div>
            <label className="field-label">Nombre *</label>
            <input
              className="field-input"
              value={form.name}
              onChange={(e) => F("name", e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label">DNI/RUC</label>
              <input
                className="field-input"
                value={form.document}
                onChange={(e) => F("document", e.target.value)}
              />
            </div>
            <div>
              <label className="field-label">Tipo</label>
              <select
                className="field-input"
                value={form.type}
                onChange={(e) => F("type", e.target.value)}
              >
                <option value="individual">Persona natural</option>
                <option value="business">Empresa</option>
              </select>
            </div>
          </div>
          <div>
            <label className="field-label">Correo electrónico</label>
            <input
              type="email"
              className="field-input"
              value={form.email}
              onChange={(e) => F("email", e.target.value)}
            />
          </div>
          <div>
            <label className="field-label">Phone</label>
            <input
              className="field-input"
              value={form.phone}
              onChange={(e) => F("phone", e.target.value)}
            />
          </div>
          <div>
            <label className="field-label">Dirección</label>
            <input
              className="field-input"
              value={form.address}
              onChange={(e) => F("address", e.target.value)}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}

// Categories
export function CategoriesPage() {
  const [cats, setCats] = useState([]);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const load = () => categoriesService.list().then((r) => setCats(r.data));
  useEffect(() => {
    load();
  }, []);
  const create = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await categoriesService.create({ name, description: desc });
      toast.success("Categoría creada");
      setName("");
      setDesc("");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Error");
    } finally {
      setSaving(false);
    }
  };
  const del = async (id, n) => {
    if (!confirm(`¿Eliminar "${n}"?`)) return;
    await categoriesService.delete(id);
    toast.success("Eliminado");
    load();
  };
  return (
    <div className="space-y-5 max-w-xl">
      <div>
        <h1
          className="text-xl font-bold text-slate-900"
          style={{ fontFamily: "'Sora',sans-serif" }}
        >
          Categorías
        </h1>
        <p className="text-slate-500 text-sm">
          Organize products into categories
        </p>
      </div>
      <div className="card p-6 space-y-4">
        <h3 className="font-semibold text-slate-700 text-sm">Nueva categoría</h3>
        <div>
          <label className="field-label">Nombre *</label>
          <input
            className="field-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej. Medicamentos, cuidado personal..."
          />
        </div>
        <div>
          <label className="field-label">Descripción</label>
          <input
            className="field-input"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
        </div>
        <button
          onClick={create}
          disabled={saving || !name.trim()}
          className="btn-primary"
        >
          <Plus className="w-4 h-4" />
          {saving ? "Guardando..." : "Agregar categoría"}
        </button>
      </div>
      <div className="table-wrapper">
        {cats.length === 0 ? (
          <div className="text-center py-10 text-slate-400 text-sm">
            <Tag className="w-8 h-8 mx-auto mb-2 opacity-30" />
            No hay categorías
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {cats.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between px-5 py-4 hover:bg-slate-50"
              >
                <div>
                  <p className="font-medium text-slate-800">{c.name}</p>
                  {c.description && (
                    <p className="text-xs text-slate-400 mt-0.5">
                      {c.description}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => del(c.id, c.name)}
                  className="btn-ghost p-1.5 text-red-400 hover:bg-red-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Users
function LegacyUsersPage() {
  const [users, setUsers] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "client",
  });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const r = await usersService.list();
      setUsers(r.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Error al cargar usuarios");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const save = async () => {
    setSaving(true);
    try {
      await usersService.create({ ...form, company_id: user.company_id });
      toast.success("Usuario creado");
      setModal(false);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Error");
    } finally {
      setSaving(false);
    }
  };

  const F = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-xl font-bold text-slate-900"
            style={{ fontFamily: "'Sora',sans-serif" }}
          >
            Usuarios
          </h1>
          <p className="text-slate-500 text-sm">{users.length} miembros</p>
        </div>
        <button
          onClick={() => {
            setForm({ name: "", email: "", password: "", role: "client" });
            setModal(true);
          }}
          className="btn-primary"
        >
          <Plus className="w-4 h-4" />
          Agregar usuario
        </button>
      </div>
      <div className="table-wrapper">
        <table className="w-full">
          <thead className="table-head">
            <tr>
              {["Nombre", "Email", "Rol", "Estado", "Último ingreso"].map((h) => (
                <th key={h} className="table-th">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="text-center py-12 text-slate-400 text-sm"
                >
                  <UserCog className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No hay usuarios
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="table-row">
                  <td className="table-td font-medium text-slate-800">
                    {u.name}
                  </td>
                  <td className="table-td text-slate-500 text-sm">{u.email}</td>
                  <td className="table-td">
                    <span
                      className={
                        u.role === "admin" ? "badge-blue" : "badge-slate"
                      }
                    >
                      {ROLE_LABELS[u.role] || u.role}
                    </span>
                  </td>
                  <td className="table-td">
                    {u.active ? (
                      <span className="badge-green">Activo</span>
                    ) : (
                      <span className="badge-red">Inactivo</span>
                    )}
                  </td>
                  <td className="table-td text-xs text-slate-400">
                    {u.last_login
                      ? new Date(u.last_login).toLocaleDateString("es-PE")
                      : "Nunca"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {modal && (
        <Modal
          title="Nuevo usuario"
          onClose={() => setModal(false)}
          footer={
            <>
              <button onClick={() => setModal(false)} className="btn-secondary">
                Cancelar
              </button>
              <button
                onClick={save}
                disabled={saving || !form.name || !form.email || !form.password}
                className="btn-primary"
              >
                {saving ? "Creando..." : "Crear usuario"}
              </button>
            </>
          }
        >
          <div>
            <label className="field-label">Nombre completo *</label>
            <input
              className="field-input"
              value={form.name}
              onChange={(e) => F("name", e.target.value)}
            />
          </div>
          <div>
            <label className="field-label">Correo electrónico *</label>
            <input
              type="email"
              className="field-input"
              value={form.email}
              onChange={(e) => F("email", e.target.value)}
            />
          </div>
          <div>
            <label className="field-label">Contraseña *</label>
            <input
              type="password"
              className="field-input"
              value={form.password}
              onChange={(e) => F("password", e.target.value)}
              placeholder="Mín. 8 caracteres"
            />
          </div>
          <div>
            <label className="field-label">Rol</label>
            <select
              className="field-input"
              value={form.role}
              onChange={(e) => F("role", e.target.value)}
            >
              <option value="client">Cliente</option>
              <option value="admin">Administrador</option>
            </select>
          </div>
        </Modal>
      )}
    </div>
  );
}

const COMPANY_EMPTY = {
  name: "",
  tax_id: "",
  address: "",
  phone: "",
  email: "",
  industry: "retail",
  city: "Lima",
  country: "Peru",
  active: true,
};

export function CompaniesPage() {
  const [companies, setCompanies] = useState([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(COMPANY_EMPTY);
  const [saving, setSaving] = useState(false);

  const load = () =>
    companiesService
      .list({ include_inactive: true })
      .then((r) => setCompanies(r.data))
      .catch((e) => toast.error(e.response?.data?.detail || "Error al cargar empresas"));

  useEffect(() => {
    load();
  }, []);

  const activeCount = companies.filter((c) => c.active).length;
  const openCreate = () => {
    setEditing(null);
    setForm(COMPANY_EMPTY);
    setModal(true);
  };
  const openEdit = (company) => {
    setEditing(company.id);
    setForm({
      name: company.name || "",
      tax_id: company.tax_id || "",
      address: company.address || "",
      phone: company.phone || "",
      email: company.email || "",
      industry: company.industry || "retail",
      city: company.city || "Lima",
      country: company.country || "Peru",
      active: company.active,
    });
    setModal(true);
  };
  const save = async () => {
    if (!/^\d{11}$/.test(form.tax_id)) {
      toast.error("El RUC debe tener exactamente 11 digitos");
      return;
    }
    setSaving(true);
    try {
      editing
        ? await companiesService.update(editing, form)
        : await companiesService.create(form);
      toast.success(editing ? "Empresa actualizada" : "Empresa creada");
      setModal(false);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Error");
    } finally {
      setSaving(false);
    }
  };
  const del = async (company) => {
    if (!confirm(`Desactivar empresa "${company.name}"?`)) return;
    await companiesService.delete(company.id);
    toast.success("Empresa desactivada");
    load();
  };
  const F = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl bg-slate-950 px-6 py-7 text-white shadow-sm">
        <div className="relative z-10 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-blue-100 ring-1 ring-white/15">
              <ShieldCheck className="h-3.5 w-3.5" />
              SuperAdmin
            </div>
            <h1 className="mt-4 text-2xl font-bold">Gestión de empresas PYME</h1>
            <p className="mt-1 text-sm text-slate-300">
              Administra cuentas, datos fiscales y estado operativo de cada empresa.
            </p>
          </div>
          <div className="flex gap-3">
            <div className="rounded-xl bg-white/10 px-4 py-3 ring-1 ring-white/10">
              <p className="text-xs text-slate-300">Activas</p>
              <p className="text-2xl font-bold">{activeCount}</p>
            </div>
            <div className="rounded-xl bg-white/10 px-4 py-3 ring-1 ring-white/10">
              <p className="text-xs text-slate-300">Total</p>
              <p className="text-2xl font-bold">{companies.length}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={openCreate} className="btn-primary">
          <Plus className="w-4 h-4" />
          Nueva empresa
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {companies.map((company) => (
          <div key={company.id} className="card p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{company.name}</p>
                  <p className="text-xs text-slate-400">RUC {company.tax_id}</p>
                </div>
              </div>
              {company.active ? <span className="badge-green">Activa</span> : <span className="badge-red">Inactiva</span>}
            </div>
            <div className="mt-4 space-y-2 text-sm text-slate-500">
              <p>{company.email || "Sin correo registrado"}</p>
              <p>{company.city || "Lima"} · {company.industry || "retail"}</p>
            </div>
            <div className="mt-5 flex gap-2">
              <button onClick={() => openEdit(company)} className="btn-secondary py-2 px-3">
                <Edit className="w-4 h-4" />
                Editar
              </button>
              <button onClick={() => del(company)} className="btn-ghost py-2 px-3 text-red-500 hover:bg-red-50">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <Modal
          title={editing ? "Editar empresa" : "Nueva empresa"}
          onClose={() => setModal(false)}
          footer={
            <>
              <button onClick={() => setModal(false)} className="btn-secondary">Cancelar</button>
              <button onClick={save} disabled={saving || !form.name || !form.tax_id} className="btn-primary">
                {saving ? "Guardando..." : "Guardar"}
              </button>
            </>
          }
        >
          <div>
            <label className="field-label">Nombre *</label>
            <input className="field-input" value={form.name} onChange={(e) => F("name", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label">RUC *</label>
              <input
                className="field-input"
                inputMode="numeric"
                maxLength={11}
                value={form.tax_id}
                onChange={(e) => F("tax_id", e.target.value.replace(/\D/g, "").slice(0, 11))}
              />
            </div>
            <div>
              <label className="field-label">Rubro</label>
              <input className="field-input" value={form.industry} onChange={(e) => F("industry", e.target.value)} />
            </div>
          </div>
          <div>
            <label className="field-label">Correo</label>
            <input type="email" className="field-input" value={form.email} onChange={(e) => F("email", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label">Teléfono</label>
              <input className="field-input" value={form.phone} onChange={(e) => F("phone", e.target.value)} />
            </div>
            <div>
              <label className="field-label">Ciudad</label>
              <input className="field-input" value={form.city} onChange={(e) => F("city", e.target.value)} />
            </div>
          </div>
          <div>
            <label className="field-label">Dirección</label>
            <input className="field-input" value={form.address} onChange={(e) => F("address", e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={form.active} onChange={(e) => F("active", e.target.checked)} />
            Empresa activa
          </label>
        </Modal>
      )}
    </div>
  );
}

const USER_EMPTY = {
  name: "",
  email: "",
  password: "",
  role: "client",
  company_id: "",
  active: true,
};

export function UsersPage() {
  const currentUser = JSON.parse(localStorage.getItem("user") || "{}");
  const isSuperAdmin = currentUser.role === "superadmin";
  const [users, setUsers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...USER_EMPTY, company_id: currentUser.company_id || "" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const [usersRes, companiesRes] = await Promise.all([
        usersService.list(),
        isSuperAdmin ? companiesService.list({ include_inactive: false }) : Promise.resolve({ data: [] }),
      ]);
      setUsers(usersRes.data);
      setCompanies(companiesRes.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Error al cargar usuarios");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...USER_EMPTY, company_id: isSuperAdmin ? companies[0]?.id || "" : currentUser.company_id || "" });
    setModal(true);
  };
  const openEdit = (u) => {
    setEditing(u.id);
    setForm({
      name: u.name || "",
      email: u.email || "",
      password: "",
      role: u.role || "client",
      company_id: u.company_id || currentUser.company_id || "",
      active: u.active,
    });
    setModal(true);
  };
  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...form };
      if (editing && !payload.password) delete payload.password;
      editing ? await usersService.update(editing, payload) : await usersService.create(payload);
      toast.success(editing ? "Usuario actualizado" : "Usuario creado");
      setModal(false);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Error");
    } finally {
      setSaving(false);
    }
  };
  const del = async (u) => {
    if (!confirm(`Desactivar usuario "${u.name}"?`)) return;
    await usersService.delete(u.id);
    toast.success("Usuario desactivado");
    load();
  };
  const F = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const companyName = (id) => companies.find((c) => c.id === id)?.name || "-";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900" style={{ fontFamily: "'Sora',sans-serif" }}>Usuarios</h1>
          <p className="text-slate-500 text-sm">{users.length} miembros</p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <Plus className="w-4 h-4" />
          Agregar usuario
        </button>
      </div>
      <div className="table-wrapper">
        <table className="w-full">
          <thead className="table-head">
            <tr>
              {["Nombre", "Email", isSuperAdmin ? "Empresa" : null, "Rol", "Estado", "Último ingreso", ""].filter(Boolean).map((h) => (
                <th key={h} className="table-th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={isSuperAdmin ? 7 : 6} className="text-center py-12 text-slate-400 text-sm">
                  <UserCog className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No hay usuarios
                </td>
              </tr>
            ) : users.map((u) => (
              <tr key={u.id} className="table-row">
                <td className="table-td font-medium text-slate-800">{u.name}</td>
                <td className="table-td text-slate-500 text-sm">{u.email}</td>
                {isSuperAdmin && <td className="table-td text-xs text-slate-500">{companyName(u.company_id)}</td>}
                <td className="table-td">
                  <span className={u.role === "superadmin" ? "badge-yellow" : u.role === "admin" ? "badge-blue" : "badge-slate"}>
                    {ROLE_LABELS[u.role] || u.role}
                  </span>
                </td>
                <td className="table-td">{u.active ? <span className="badge-green">Activo</span> : <span className="badge-red">Inactivo</span>}</td>
                <td className="table-td text-xs text-slate-400">{u.last_login ? new Date(u.last_login).toLocaleDateString("es-PE") : "Nunca"}</td>
                <td className="table-td">
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(u)} className="btn-ghost p-1.5"><Edit className="w-3.5 h-3.5" /></button>
                    <button onClick={() => del(u)} className="btn-ghost p-1.5 text-red-500 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal && (
        <Modal
          title={editing ? "Editar usuario" : "Nuevo usuario"}
          onClose={() => setModal(false)}
          footer={
            <>
              <button onClick={() => setModal(false)} className="btn-secondary">Cancelar</button>
              <button onClick={save} disabled={saving || !form.name || !form.email || (!editing && !form.password)} className="btn-primary">
                {saving ? "Guardando..." : "Guardar usuario"}
              </button>
            </>
          }
        >
          <div>
            <label className="field-label">Nombre completo *</label>
            <input className="field-input" value={form.name} onChange={(e) => F("name", e.target.value)} />
          </div>
          <div>
            <label className="field-label">Correo electrónico *</label>
            <input type="email" className="field-input" value={form.email} onChange={(e) => F("email", e.target.value)} />
          </div>
          <div>
            <label className="field-label">{editing ? "Nueva contraseña" : "Contraseña *"}</label>
            <input type="password" className="field-input" value={form.password} onChange={(e) => F("password", e.target.value)} placeholder={editing ? "Dejar en blanco para mantener" : "Mín. 8 caracteres"} />
          </div>
          {isSuperAdmin && (
            <div>
              <label className="field-label">Empresa</label>
              <select className="field-input" value={form.company_id} onChange={(e) => F("company_id", e.target.value)}>
                <option value="">Selecciona una empresa</option>
                {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label">Rol</label>
              <select className="field-input" value={form.role} onChange={(e) => F("role", e.target.value)}>
                <option value="client">Empleado</option>
                <option value="admin">Administrador</option>
                {isSuperAdmin && <option value="superadmin">SuperAdmin</option>}
              </select>
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-600">
              <input type="checkbox" checked={form.active} onChange={(e) => F("active", e.target.checked)} />
              Activo
            </label>
          </div>
        </Modal>
      )}
    </div>
  );
}
