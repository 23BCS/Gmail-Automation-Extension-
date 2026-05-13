/**
 * Axios API utility with interceptors
 */
import axios from 'axios';
import toast from 'react-hot-toast';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
});

// Response interceptor - handle errors globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.message || error.message || 'Request failed';
    if (error.response?.status !== 404) {
      toast.error(message);
    }
    return Promise.reject(error);
  }
);

// ─── Email API ────────────────────────────────────────────────────────────────
export const emailAPI = {
  sendBulk: (formData) => api.post('/email/send-bulk', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  sendSingle: (formData) => api.post('/email/send', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  getStatus: (queueId) => api.get(`/email/status/${queueId}`),
  getQueues: () => api.get('/email/queues'),
  stop: (queueId) => api.post(`/email/stop/${queueId}`),
  pause: (queueId) => api.post(`/email/pause/${queueId}`),
  resume: (queueId) => api.post(`/email/resume/${queueId}`),
  retry: (queueId) => api.post(`/email/retry/${queueId}`),
  parseCSV: (formData) => api.post('/email/parse-csv', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  verifySMTP: (data) => api.post('/email/verify-smtp', data)
};

// ─── Template API ─────────────────────────────────────────────────────────────
export const templateAPI = {
  list: () => api.get('/template/list'),
  save: (data) => api.post('/template/save', data),
  update: (id, data) => api.put(`/template/${id}`, data),
  delete: (id) => api.delete(`/template/${id}`)
};

// ─── Schedule API ─────────────────────────────────────────────────────────────
export const scheduleAPI = {
  list: () => api.get('/schedule/list'),
  create: (data) => api.post('/schedule/create', data),
  cancel: (id) => api.delete(`/schedule/${id}`)
};

// ─── Report API ───────────────────────────────────────────────────────────────
export const reportAPI = {
  summary: () => api.get('/report/summary'),
  exportCSV: (queueId) => {
    const url = queueId
      ? `${API_URL}/report/export?queueId=${queueId}`
      : `${API_URL}/report/export`;
    window.open(url, '_blank');
  }
};

// ─── Settings API ─────────────────────────────────────────────────────────────
export const settingsAPI = {
  get: () => api.get('/settings'),
  update: (data) => api.put('/settings', data),
  verify: (data) => api.post('/settings/verify', data)
};

export default api;
