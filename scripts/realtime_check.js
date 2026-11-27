'use strict';

const fs = require('fs');
const path = require('path');

const { createRequire } = require('node:module');
const serverRequire = createRequire(path.resolve(__dirname, '..', 'server', 'package.json'));
const WebSocket = serverRequire('ws');

const API = process.env.API_BASE || 'http://127.0.0.1:3000';
const WS_URL = `${API.replace(/^http/, 'ws')}/ws`;
const OUTPUT_DIR = path.resolve(__dirname, '..', '.cache', 'checks');

const checks = [];
const startedAt = new Date().toISOString();

function record(name, pass, detail) {
  checks.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name} — ${detail}`);
}

async function api(pathname, options = {}) {
  const res = await fetch(`${API}${pathname}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  return { status: res.status, ok: res.ok, data: payload?.data, code: payload?.code, message: payload?.message };
}

function waitFor(predicate, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer);
        resolve(Date.now() - started);
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error(`timeout after ${timeoutMs}ms`));
      }
    }, 20);
  });
}

function openSocket(options = {}) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(WS_URL, options);
    const messages = [];
    socket.on('message', (raw) => {
      try {
        messages.push(JSON.parse(raw.toString()));
      } catch {
        messages.push({ raw: raw.toString() });
      }
    });
    socket.once('open', () => resolve({ socket, messages }));
    socket.once('unexpected-response', (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
    socket.once('error', (err) => reject(err));
  });
}

async function main() {
  const buyer = `live${Date.now().toString().slice(-8)}`;
  let token = null;
  let orderId = null;
  let socket = null;
  let messages = [];

  try {
    const opened = await openSocket();
    socket = opened.socket;
    messages = opened.messages;
    await waitFor(() => messages.some((m) => m.type === 'connected'), 2000);
    const connected = messages.find((m) => m.type === 'connected');
    record('WS-01 connect and greeting', Boolean(connected), `type=${connected?.type} path=${connected?.path}`);

    const register = await api('/auth/register', {
      method: 'POST',
      body: { user_name: buyer, password: 'Demo@1234' },
    });
    const login = await api('/auth/login', {
      method: 'POST',
      body: { user_name: buyer, password: 'Demo@1234' },
    });
    token = login.data?.token;
    record('WS-02 test account ready', register.status === 201 && Boolean(token), `register=${register.status} login=${login.status}`);

    const performances = await api('/performances?page_size=100');
    const candidates = performances.data?.items || [];
    const ordered = [
      ...candidates.filter((p) => Number(p.performance_id) === 1),
      ...candidates.filter((p) => Number(p.performance_id) !== 1),
    ];
    let target = null;
    for (const item of ordered) {
      const detail = await api(`/performances/${item.performance_id}`);
      if (
        detail.status === 200 &&
        detail.data?.status === 'PUBLISHED' &&
        Number(detail.data?.seat_counts?.available) > 0 &&
        new Date(detail.data.starts_at).getTime() > Date.now()
      ) {
        target = detail.data;
        break;
      }
    }
    if (!target) throw new Error('no performance with available seats');

    const seats = await api(`/performances/${target.performance_id}/seats`, { token });
    const seat = (seats.data?.seats || []).find((s) => s.status === 'AVAILABLE');
    if (!seat) throw new Error('no available seat');

    messages.length = 0;
    const order = await api('/orders', {
      method: 'POST',
      token,
      headers: { 'Idempotency-Key': `realtime-${buyer}` },
      body: { performance_id: target.performance_id, session_seat_ids: [seat.session_seat_id] },
    });
    orderId = order.data?.order_id;
    record('WS-03 create order succeeds', order.status === 201 && Boolean(orderId), `HTTP ${order.status} code=${order.code} message=${order.message || ''} order=${orderId}`);

    const latency = await waitFor(() => messages.some((m) => m.type === 'data.changed' && String(m.path).startsWith('/orders')));
    const event = messages.find((m) => m.type === 'data.changed' && String(m.path).startsWith('/orders'));
    const keys = Object.keys(event || {}).sort().join(',');
    const allowedKeys = ['at', 'order_id', 'path', 'performance_id', 'type'];
    const scoped = Boolean(event)
      && Number(event.order_id) === Number(orderId)
      && Number(event.performance_id) === Number(target.performance_id);
    record('WS-04 mutation broadcast', Boolean(event), `path=${event?.path} latency=${latency}ms keys=${keys} order=${event?.order_id} performance=${event?.performance_id}`);
    record(
      'WS-05 signal carries no business data',
      Boolean(event)
        && keys.split(',').every((key) => allowedKeys.includes(key))
        && scoped,
      `keys=${keys} scoped=${scoped}`
    );

    messages.length = 0;
    const cancelled = await api(`/orders/${orderId}/cancel`, { method: 'POST', token, body: { reason: 'realtime test cleanup' } });
    orderId = null;
    const cancelLatency = await waitFor(() => messages.some((m) => m.type === 'data.changed' && String(m.path).startsWith('/orders')));
    const cancelEvent = messages.find((m) => m.type === 'data.changed' && String(m.path).startsWith('/orders'));
    const cancelScoped = Boolean(cancelEvent)
      && Number(cancelEvent.order_id) === Number(cancelEvent.path.split('/')[2])
      && Number(cancelEvent.performance_id) === Number(target.performance_id);
    record('WS-06 release broadcast', cancelled.status < 300 && cancelLatency < 3000 && cancelScoped, `HTTP ${cancelled.status} latency=${cancelLatency}ms order=${cancelEvent?.order_id} performance=${cancelEvent?.performance_id}`);

    socket.close();
    socket = null;

    const fallback = await api(`/performances/${target.performance_id}/seats`);
    record('WS-07 REST fallback after disconnect', fallback.status === 200, `HTTP ${fallback.status}`);

    await new Promise((resolve, reject) => {
      const bad = new WebSocket(WS_URL, { headers: { Origin: 'http://evil.example' } });
      bad.once('open', () => {
        bad.close();
        reject(new Error('non-local origin accepted'));
      });
      bad.once('unexpected-response', (_req, res) => {
        if (res.statusCode === 403) resolve();
        else reject(new Error(`HTTP ${res.statusCode}`));
      });
      bad.once('error', (err) => reject(err));
    });
    record('WS-08 non-local origin rejected', true, 'HTTP 403');
  } catch (err) {
    record('WS-00 unexpected failure', false, err.message);
    if (orderId && token) {
      try {
        await api(`/orders/${orderId}/cancel`, { method: 'POST', token, body: { reason: 'realtime test cleanup' } });
      } catch {
        // best effort
      }
    }
  } finally {
    socket?.close();
  }

  const passed = checks.filter((c) => c.pass).length;
  const summary = {
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    api: API,
    ws: WS_URL,
    passed,
    total: checks.length,
    checks,
  };
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const out = path.join(OUTPUT_DIR, 'realtime-check.json');
  fs.writeFileSync(out, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log(`\n${passed}/${checks.length} checks passed; results: ${out}`);
  process.exit(passed === checks.length ? 0 : 1);
}

main();
