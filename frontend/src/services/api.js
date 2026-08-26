import axios from 'axios';

const API_BASE = '/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Auth interceptor
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auth API
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
};

// Farmer API
export const farmerAPI = {
  getProfile: () => api.get('/farmers/me'),
  createProfile: (data) => api.post('/farmers', data),
  getProfileById: (id) => api.get(`/farmers/${id}`),
};

// Listing API
export const listingAPI = {
  getAll: () => api.get('/listings'),
  getByCommodity: (commodity) => api.get(`/listings/commodity/${commodity}`),
  getByFarmer: (farmerId) => api.get(`/listings/farmer/${farmerId}`),
  create: (data) => api.post('/listings', data),
  update: (id, data) => api.put(`/listings/${id}`, data),
};

// Buyer API
export const buyerAPI = {
  getProfile: () => api.get('/buyers/me'),
  createProfile: (data) => api.post('/buyers', data),
};

// Demand API
export const demandAPI = {
  getAll: () => api.get('/demands'),
  getByCommodity: (commodity) => api.get(`/demands/commodity/${commodity}`),
  getByBuyer: (buyerId) => api.get(`/demands/buyer/${buyerId}`),
  create: (data) => api.post('/demands', data),
};

// Order API
export const orderAPI = {
  getByBuyer: (buyerId) => api.get(`/orders/buyer/${buyerId}`),
  getByFarmer: (farmerId) => api.get(`/orders/farmer/${farmerId}`),
  create: (data) => api.post('/orders', data),
  updateStatus: (id, status) => api.put(`/orders/${id}/status`, { status }),
};

// Market Price API
export const marketAPI = {
  getPrices: (params) => api.get('/market-prices', { params }),
  getLatest: () => api.get('/market-prices/latest'),
  sync: () => api.post('/market-data/sync'),
};

// Forecast API
export const forecastAPI = {
  getAll: (params) => api.get('/forecasts', { params }),
};

// Impact API
export const impactAPI = {
  getMetrics: () => api.get('/impact'),
  getSummary: () => api.get('/impact/summary'),
};

// Route API
export const routeAPI = {
  getAll: () => api.get('/routes'),
  estimate: (origin, destination) => api.post('/routes/estimate', { origin, destination }),
  create: (data) => api.post('/routes', data),
};

// Dashboard API
export const dashboardAPI = {
  getStats: () => api.get('/dashboard/stats'),
};

// Supply-Demand API
export const supplyDemandAPI = {
  getSummary: () => api.get('/supply-demand/summary'),
  getMatches: (commodity, params) => api.get(`/supply-demand/match/${commodity}`, { params }),
};

// Profiles & Onboarding API
export const profilesAPI = {
  me: () => api.get('/profiles/me'),
  onboard: (data) => api.post('/profiles/onboard', data),
};

// Config Status API
export const configAPI = {
  getStatus: () => api.get('/config/status'),
};

export default api;
