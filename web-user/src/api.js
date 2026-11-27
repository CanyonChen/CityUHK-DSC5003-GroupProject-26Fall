import { TOKEN_KEY } from './auth';

export const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:3000';

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
  const { method = 'GET', body, headers = {}, anonymous = false, raw = false } = options;
  const init = { method, headers: { ...headers } };
  if (!anonymous) Object.assign(init.headers, authHeaders());
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  const res = await fetch(`${API_BASE}${path}`, init);
  if (raw) {
    if (!res.ok) throw new ApiError(res.status, 'HTTP_ERROR', `HTTP ${res.status}`);
    return res;
  }
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
    if (res.status === 401 && localStorage.getItem(TOKEN_KEY)) {
      window.dispatchEvent(new CustomEvent('cityuhk-events-hub:unauthorized'));
    }
    throw err;
  }
  return payload?.data;
}

export const register = (user_name, password, display_name) =>
  api('/auth/register', {
    method: 'POST',
    body: { user_name, password, display_name: display_name || undefined },
    anonymous: true,
  });

export const login = (user_name, password) =>
  api('/auth/login', { method: 'POST', body: { user_name, password }, anonymous: true });

export const logout = () => api('/auth/logout', { method: 'POST' });

export const me = () => api('/auth/me');

export const listEvents = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return api(`/events${qs ? `?${qs}` : ''}`, { anonymous: true });
};

export const getEvent = (id) => api(`/events/${id}`, { anonymous: true });

export const getPerformance = (id) => api(`/performances/${id}`, { anonymous: true });

export const getSeats = (id) => api(`/performances/${id}/seats`);

export const getSeatRecommendations = (id, { partySize, region, budgetCents, limit = 3 }) => {
  const params = new URLSearchParams({
    party_size: String(partySize),
    region: String(region),
    limit: String(limit),
  });
  if (budgetCents !== null && budgetCents !== undefined && budgetCents !== '') {
    params.set('budget_cents', String(budgetCents));
  }
  return api(`/performances/${id}/seat-recommendations?${params.toString()}`, {
    anonymous: true,
  });
};

export const createOrder = (performanceId, seatIds) =>
  api('/orders', {
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    body: { performance_id: performanceId, session_seat_ids: seatIds },
  });

export const getOrder = (id) => api(`/orders/${id}`);

export const listOrders = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return api(`/orders${qs ? `?${qs}` : ''}`);
};

export const cancelOrder = (id) => api(`/orders/${id}/cancel`, { method: 'POST' });

export const requestRefund = (id, reason = '') =>
  api(`/orders/${id}/refund`, {
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    body: { reason },
  });

export const createPayment = (orderId) => api('/payments', { method: 'POST', body: { order_id: orderId } });

export const simulatePayment = (paymentId, result) =>
  api(`/payments/${paymentId}/simulate`, { method: 'POST', body: { result } });

export const listTickets = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return api(`/tickets${qs ? `?${qs}` : ''}`);
};

export const getTicket = (id) => api(`/tickets/${id}`);

export async function getTicketQrObjectUrl(id) {
  const res = await api(`/tickets/${id}/qr.png`, { raw: true });
  return URL.createObjectURL(await res.blob());
}
