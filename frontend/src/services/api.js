import axios from "axios";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "/api/v1";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("access_token");
    if (token) config.headers["Authorization"] = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error),
);

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.clear();
      window.location.href = "/login";
    }
    return Promise.reject(err);
  },
);

export default api;

export const authService = {
  login: (d) => api.post("/auth/login", d),
  me: () => api.get("/auth/me"),
  forgotPassword: (email) => api.post("/auth/forgot-password", { email }),
  resetPassword: (d) => api.post("/auth/reset-password", d),
  changePassword: (d) => api.post("/auth/change-password", d),
};

export const dashboardService = {
  kpis: () => api.get("/dashboard/kpis"),
  alerts: () => api.get("/dashboard/alerts"),
};

export const productsService = {
  list: (p) => api.get("/products/", { params: p }),
  get: (id) => api.get(`/products/${id}`),
  create: (d) => api.post("/products/", d),
  update: (id, d) => api.put(`/products/${id}`, d),
  delete: (id) => api.delete(`/products/${id}`),
  adjustStock: (id, d) => api.post(`/products/${id}/adjust-stock`, d),
  importFile: (formData) =>
    api.post("/products/import", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
};

export const salesService = {
  list: (p) => api.get("/sales/", { params: p }),
  create: (d) => api.post("/sales/", d),
  cancel: (id) => api.patch(`/sales/${id}/cancel`),
};

export const customersService = {
  list: (p) => api.get("/customers/", { params: p }),
  create: (d) => api.post("/customers/", d),
  update: (id, d) => api.put(`/customers/${id}`, d),
  delete: (id) => api.delete(`/customers/${id}`),
};

export const categoriesService = {
  list: () => api.get("/categories/"),
  create: (d) => api.post("/categories/", d),
  delete: (id) => api.delete(`/categories/${id}`),
};

export const usersService = {
  list: () => api.get("/users/"),
  create: (d) => api.post("/users/", d),
  update: (id, d) => api.put(`/users/${id}`, d),
  delete: (id) => api.delete(`/users/${id}`),
};

export const companiesService = {
  list: (p) => api.get("/companies/", { params: p }),
  create: (d) => api.post("/companies/", d),
  update: (id, d) => api.put(`/companies/${id}`, d),
  delete: (id) => api.delete(`/companies/${id}`),
};

export const ingestService = {
  all: (formData) =>
    api.post("/ingest/all", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
};

export const mlService = {
  uploadDataset: (formData) =>
    api.post("/ml/datasets/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  listDatasets: () => api.get("/ml/datasets"),
  deleteDataset: (id) => api.delete(`/ml/datasets/${id}`),
  previewDataset: (id, rows) =>
    api.get(`/ml/datasets/${id}/preview`, { params: { rows } }),
  createJob: (d) => api.post("/ml/training-jobs", d),
  listJobs: () => api.get("/ml/training-jobs"),
  getJob: (id) => api.get(`/ml/training-jobs/${id}`),
  predictions: (p) => api.get("/ml/predictions", { params: p }),
  restock: () => api.get("/ml/restock-recommendations"),
  acknowledgeRestock: (id) =>
    api.patch(`/ml/restock-recommendations/${id}/acknowledge`),
  // ── Análisis de sobre-stock (microservicio XGBoost) ──
  analyzeStock: (formData) =>
    api.post("/ml/analyze-stock", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  listAnalyses: () => api.get("/ml/analyses"),
  getAnalysis: (id) => api.get(`/ml/analyses/${id}`),
  deleteAnalysis: (id) => api.delete(`/ml/analyses/${id}`),
  mlHealth: () => api.get("/ml/health-ml"),
  cloudMetricsLive: () => api.get("/ml/cloud-metrics/live"),
  cloudBenchmark: () =>api.get("/ml/cloud-metrics/benchmark"),
};
