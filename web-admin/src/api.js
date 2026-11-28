import { TOKEN_KEY } from './auth';
import { resolveApiBase } from '../../shared/api-config.mjs';

export const API_BASE = resolveApiBase(import.meta.env.VITE_API_BASE, window.location);

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message || code || 'Request failed');
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function authHeaders() {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function api(path, options = {}) {
  const { method = 'GET', body, headers = {}, anonymous = false } = options;
  const init = { method, headers: { ...headers } };
  if (!anonymous) Object.assign(init.headers, authHeaders());
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`${API_BASE}${path}`, init);
  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  if (!res.ok) {
    const err = new ApiError(
      res.status,
      payload?.code || 'HTTP_ERROR',
      payload?.message || `HTTP ${res.status}`,
      payload?.details
    );
    if (res.status === 401) window.dispatchEvent(new CustomEvent('cityuhk-events-hub.admin:unauthorized'));
    throw err;
  }
  return payload?.data;
}

const qs = (params = {}) => {
  const s = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') s.set(k, v);
  });
  const out = s.toString();
  return out ? `?${out}` : '';
};

export const login = (user_name, password) =>
  api('/auth/login', { method: 'POST', body: { user_name, password }, anonymous: true });

export const logout = () => api('/auth/logout', { method: 'POST' });

export const me = () => api('/auth/me');

// users & roles
export const listUsers = (params) => api(`/admin/users${qs(params)}`);
export const grantRole = (userId, body) => api(`/admin/users/${userId}/roles`, { method: 'POST', body });
export const revokeRole = (userId, assignmentId) =>
  api(`/admin/users/${userId}/roles/${assignmentId}`, { method: 'DELETE' });

// events
export const listEvents = (params) => api(`/admin/events${qs(params)}`);
export const createEvent = (body) => api('/admin/events', { method: 'POST', body });
export const updateEvent = (id, body) => api(`/admin/events/${id}`, { method: 'PATCH', body });

// venues (extra admin helper, same database)
export const listVenues = () => api('/admin/venues');

// performances
export const listPerformances = (params) => api(`/admin/performances${qs(params)}`);
export const getPerformance = (id) => api(`/admin/performances/${id}`);
export const performanceOccupancy = (id) => api(`/admin/performances/${id}/occupancy`);
export const createPerformance = (body) => api('/admin/performances', { method: 'POST', body });
export const updatePerformance = (id, body) => api(`/admin/performances/${id}`, { method: 'PATCH', body });
export const publishPerformance = (id) => api(`/admin/performances/${id}/publish`, { method: 'POST' });
export const setSales = (id, action) => api(`/admin/performances/${id}/sales`, { method: 'POST', body: { action } });
export const updateTiers = (id, tiers) => api(`/admin/performances/${id}/price-tiers`, { method: 'PATCH', body: { tiers } });
export const setSeatStatus = (id, status) => api(`/admin/session-seats/${id}`, { method: 'PATCH', body: { status } });
export const bulkSetSeatStatus = (performanceId, body) =>
  api(`/admin/performances/${performanceId}/seat-status`, { method: 'PATCH', body });
export const getSeatMap = (id) => api(`/admin/performances/${id}/seats`);

// check-in
export const checkerPerformances = () => api('/admin/checker/performances');
export const checkin = (performanceId, ticketCode) =>
  api('/admin/checkins', {
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    body: { performance_id: performanceId, ticket_code: ticketCode },
  });
export const listCheckins = (params) => api(`/admin/checkins${qs(params)}`);

// stats & finance
export const stats = (params) => api(`/admin/stats${qs(params)}`);
export const adminOrders = (params) => api(`/admin/orders${qs(params)}`);
export const adminRefunds = (params) => api(`/admin/refunds${qs(params)}`);
export const retryRefund = (id, key = crypto.randomUUID()) => api(`/admin/refunds/${id}/retry`, { method: 'POST', headers: { 'Idempotency-Key': key } });
export const resolveRefund = (id, result) => api(`/admin/refunds/${id}/resolve`, { method: 'POST', body: { result } });
export const paymentExceptions = (params) => api(`/admin/payments/exceptions${qs(params)}`);
export const reconcilePayment = (id) => api(`/admin/payments/${id}/reconcile`, { method: 'POST' });
export const reconciliationStatus = () => api('/admin/reconciliation/status');
export const runReconciliation = () => api('/admin/reconciliation/run', { method: 'POST' });
export const auditLogs = (params) => api(`/admin/audit-logs${qs(params)}`);
