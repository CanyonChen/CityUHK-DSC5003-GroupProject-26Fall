#!/usr/bin/env node
'use strict';

/**
 * Query benchmark / 50 concurrent reservations / index experiment.
 *
 * Usage:
 *   node scripts/benchmark.js baseline     # 5 read request types with baseline indexes + EXPLAIN
 *   node scripts/benchmark.js indexes      # Create candidate indexes and record EXPLAIN
 *   node scripts/benchmark.js tuned        # Same read requests with candidate indexes
 *   node scripts/benchmark.js drop         # Drop candidate indexes and restore the baseline schema
 *   node scripts/benchmark.js reservation  # 50 concurrent reservation attempts
 *
 * Requires a standalone API: DB_NAME=ticketing_bench PORT=3100 REFUND_CUTOFF_HOURS=0.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');

const ROOT = path.join(__dirname, '..');
const serverRequire = createRequire(path.join(ROOT, 'server', 'package.json'));
const mysql = serverRequire('mysql2/promise');

const BASE = process.env.BENCH_BASE_URL || 'http://127.0.0.1:3100';
const DB = process.env.BENCH_DB_NAME || 'ticketing_bench';
const OUT = path.join(ROOT, '.cache', 'benchmarks');
const MODE = process.argv[2] || 'baseline';
const CONCURRENCY = Number.parseInt(process.env.BENCH_CONCURRENCY || '50', 10);
const PER_WORKER = Number.parseInt(process.env.BENCH_PER_WORKER || '10', 10);
const WARMUP = Number.parseInt(process.env.BENCH_WARMUP || '20', 10);

fs.mkdirSync(OUT, { recursive: true });

function dbConfig() {
  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number.parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: DB,
    timezone: 'Z',
  };
}

async function withDb(fn) {
  const conn = await mysql.createConnection(dbConfig());
  try {
    await conn.query("SET SESSION time_zone = '+00:00'");
    return await fn(conn);
  } finally {
    await conn.end();
  }
}

function writeJson(name, value) {
  const file = path.join(OUT, name);
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
  return file;
}

function readJson(name, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(path.join(OUT, name), 'utf8'));
  } catch {
    return fallback;
  }
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, rank))];
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function latencySummary(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const avg = values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
  return {
    count: values.length,
    avg_ms: round2(avg),
    p50_ms: round2(percentile(sorted, 50)),
    p95_ms: round2(percentile(sorted, 95)),
    p99_ms: round2(percentile(sorted, 99)),
    min_ms: round2(sorted[0] ?? 0),
    max_ms: round2(sorted[sorted.length - 1] ?? 0),
  };
}

async function api(pathname, { method = 'GET', token = null, body = null, idempotencyKey = null, timeoutMs = 30000 } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  if (body !== null) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers,
    body: body === null ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* keep text */ }
  return { status: res.status, json, text };
}

async function login(userName) {
  const r = await api('/auth/login', {
    method: 'POST',
    body: { user_name: userName, password: 'Demo@1234' },
  });
  if (r.status !== 200 || !r.json?.data?.token) {
    throw new Error(`login ${userName} failed: ${r.status} ${r.text.slice(0, 200)}`);
  }
  return r.json.data.token;
}

async function waitApi() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await api('/health', { timeoutMs: 3000 });
      if (r.status === 200) return;
    } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`bench API not ready at ${BASE}`);
}

async function metadata() {
  const dataset = readJson('dataset-summary.json', {});
  const db = await withDb(async (conn) => {
    const [version] = await conn.query(
      'SELECT VERSION() AS version, @@version_comment AS version_comment, @@innodb_buffer_pool_size AS buffer_pool, @@max_connections AS max_connections'
    );
    return version[0];
  });
  return {
    captured_at: new Date().toISOString(),
    base_url: BASE,
    database: DB,
    node_version: process.version,
    platform: `${process.platform} ${process.arch}`,
    hostname: os.hostname(),
    cpu: `${os.cpus()[0]?.model || 'unknown'} × ${os.cpus().length}`,
    memory_gb: round2(os.totalmem() / (1024 ** 3)),
    db_version: db.version,
    db_version_comment: db.version_comment,
    innodb_buffer_pool_bytes: Number(db.buffer_pool),
    max_connections: Number(db.max_connections),
    dataset,
    load_profile: {
      concurrency: CONCURRENCY,
      samples_per_query: CONCURRENCY * PER_WORKER,
      warmup_requests_per_query: WARMUP,
      client: 'Node 22 global fetch, HTTP keep-alive',
      pool_default: 'DB_POOL=10 unless overridden by the bench API environment',
    },
    workspace: ROOT,
  };
}

async function runOne(pathname, token) {
  const t0 = process.hrtime.bigint();
  try {
    const r = await api(pathname, { token, timeoutMs: 20000 });
    await r.text;
    return { ok: r.status >= 200 && r.status < 300, status: r.status, ms: Number(process.hrtime.bigint() - t0) / 1e6, error: null };
  } catch (err) {
    return { ok: false, status: 0, ms: Number(process.hrtime.bigint() - t0) / 1e6, error: err.message };
  }
}

async function runLoad({ id, label, pathname, token, targetMs, category, note }) {
  // Run a few serial warm-up requests so the first-request connection cost is not counted in P95.
  for (let i = 0; i < WARMUP; i++) {
    await runOne(pathname, token);
  }
  const latencies = [];
  const codes = {};
  const errors = [];
  const wallStart = process.hrtime.bigint();

  const worker = async (workerId) => {
    for (let n = 0; n < PER_WORKER; n++) {
      const result = await runOne(pathname, token);
      if (result.status) codes[result.status] = (codes[result.status] || 0) + 1;
      if (!result.ok) errors.push({ worker: workerId, n, status: result.status, error: result.error });
      latencies.push(result.ms);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)));
  const wallMs = Number(process.hrtime.bigint() - wallStart) / 1e6;
  const summary = latencySummary(latencies);
  return {
    id,
    label,
    category,
    note,
    method: 'GET',
    endpoint: pathname,
    target_ms: targetMs,
    samples: latencies.length,
    concurrency: CONCURRENCY,
    status_codes: codes,
    errors: errors.length,
    error_samples: errors.slice(0, 5),
    throughput_rps: round2((latencies.length / wallMs) * 1000),
    wall_ms: round2(wallMs),
    latency_ms: summary,
    pass: errors.length === 0 && summary.p95_ms !== null && summary.p95_ms <= targetMs,
  };
}

async function explainQueries(conn) {
  const seatMapSql = `
SELECT ss.session_seat_id, s.region, s.row_no, s.seat_no, s.coordinates,
       ss.session_seat_status AS status,
       pt.tier_name, pt.current_price AS price_cents, pt.currency,
       CASE WHEN ss.session_seat_status = 'HELD' AND o.user_id = ? THEN 1 ELSE 0 END AS holder_mine
  FROM session_seats ss
  JOIN seats s ON s.seat_id = ss.seat_id
  JOIN price_tiers pt ON pt.tier_id = ss.tier_id
  LEFT JOIN orders o ON o.order_id = ss.holder_order_id
 WHERE ss.performance_id = ?
 ORDER BY s.region ASC, CAST(s.row_no AS UNSIGNED) ASC, CAST(s.seat_no AS UNSIGNED) ASC`;

  const adminOrdersSql = `
SELECT o.order_id, o.created_at, o.status, o.total_amount, o.currency,
       o.performance_id, u.user_name, u.display_name,
       e.name AS event_name, v.name AS venue_name, p.starts_at,
       (SELECT pa.result FROM payment_attempts pa WHERE pa.order_id = o.order_id ORDER BY pa.attempt_id DESC LIMIT 1) AS payment_result,
       (SELECT r.status FROM refunds r WHERE r.order_id = o.order_id ORDER BY r.refund_id DESC LIMIT 1) AS refund_status
  FROM orders o
  JOIN users u ON u.user_id = o.user_id
  JOIN performances p ON p.performance_id = o.performance_id
  JOIN events e ON e.event_id = p.event_id
  JOIN venues v ON v.venue_id = p.venue_id
 WHERE o.status = ?
 ORDER BY o.created_at DESC, o.order_id DESC
 LIMIT ? OFFSET ?`;

  const statsSql = `
SELECT p.performance_id, e.name AS event_name, v.name AS venue_name, p.starts_at, p.status,
       (SELECT COUNT(*) FROM session_seats ss WHERE ss.performance_id = p.performance_id AND ss.session_seat_status = 'AVAILABLE') AS available,
       (SELECT COUNT(*) FROM session_seats ss WHERE ss.performance_id = p.performance_id AND ss.session_seat_status = 'HELD') AS held,
       (SELECT COUNT(*) FROM session_seats ss WHERE ss.performance_id = p.performance_id AND ss.session_seat_status = 'SOLD') AS sold,
       (SELECT COUNT(*) FROM session_seats ss WHERE ss.performance_id = p.performance_id AND ss.session_seat_status = 'BLOCKED') AS blocked,
       (SELECT COUNT(*) FROM tickets t JOIN order_items oi ON oi.order_item_id = t.order_item_id
          JOIN orders o ON o.order_id = oi.order_id
         WHERE o.performance_id = p.performance_id AND o.status IN ('PAID','REFUND_PENDING','REFUNDED')
           AND t.status <> 'VOID') AS tickets_sold,
       (SELECT COUNT(*) FROM checkins c JOIN tickets t ON t.ticket_id = c.ticket_id
          JOIN order_items oi ON oi.order_item_id = t.order_item_id
          JOIN orders o ON o.order_id = oi.order_id
         WHERE o.performance_id = p.performance_id) AS checked_in,
       (SELECT IFNULL(SUM(o.total_amount),0) FROM orders o
         WHERE o.performance_id = p.performance_id AND o.status IN ('PAID','REFUND_PENDING','REFUNDED')) AS gross,
       (SELECT IFNULL(SUM(r.amount),0) FROM refunds r JOIN orders o ON o.order_id = r.order_id
         WHERE o.performance_id = p.performance_id AND r.status = 'SUCCEEDED') AS refunded
  FROM performances p
  JOIN events e ON e.event_id = p.event_id
  JOIN venues v ON v.venue_id = p.venue_id
 ORDER BY p.starts_at ASC, p.performance_id ASC`;

  const definitions = [
    { id: 'Q-01', label: 'Performance seat map', sql: seatMapSql, params: [0, 1] },
    { id: 'Q-02', label: 'Admin order search', sql: adminOrdersSql, params: ['PAID', 20, 0] },
    { id: 'Q-03', label: 'Per-performance sales statistics', sql: statsSql, params: [] },
  ];

  const results = [];
  for (const def of definitions) {
    const [jsonRows] = await conn.query(`EXPLAIN FORMAT=JSON ${def.sql}`, def.params);
    const [tableRows] = await conn.query(`EXPLAIN ${def.sql}`, def.params);
    const raw = jsonRows[0] ? Object.values(jsonRows[0])[0] : null;
    results.push({
      id: def.id,
      label: def.label,
      params: def.params,
      explain_json: typeof raw === 'string' ? JSON.parse(raw) : raw,
      explain_table: tableRows,
    });
  }
  return results;
}

async function indexes(conn) {
  const [rows] = await conn.query(`
SELECT TABLE_NAME, INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns,
       NON_UNIQUE, INDEX_TYPE
  FROM information_schema.statistics
 WHERE TABLE_SCHEMA = ?
 GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE, INDEX_TYPE
 ORDER BY TABLE_NAME, INDEX_NAME`, [DB]);
  return rows;
}

// Keep these index names stable so the drop command can undo earlier benchmark runs.
const CANDIDATES = [
  { table: 'orders', name: 'idx_m4_orders_status_created', columns: '(status, created_at, order_id)' },
  { table: 'orders', name: 'idx_m4_orders_perf_status_amount', columns: '(performance_id, status, total_amount)' },
  { table: 'session_seats', name: 'idx_m4_session_seats_perf_status_tier', columns: '(performance_id, session_seat_status, tier_id)' },
  { table: 'refunds', name: 'idx_m4_refunds_status_order', columns: '(status, order_id)' },
];

async function createCandidates(conn) {
  for (const idx of CANDIDATES) {
    const [existing] = await conn.query(
      `SELECT 1 FROM information_schema.statistics
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
      [DB, idx.table, idx.name]
    );
    if (!existing.length) {
      await conn.query(`ALTER TABLE ${idx.table} ADD INDEX ${idx.name} ${idx.columns}`);
    }
  }
}

async function dropCandidates(conn) {
  for (const idx of [...CANDIDATES].reverse()) {
    const [existing] = await conn.query(
      `SELECT 1 FROM information_schema.statistics
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
      [DB, idx.table, idx.name]
    );
    if (existing.length) {
      await conn.query(`ALTER TABLE ${idx.table} DROP INDEX ${idx.name}`);
    }
  }
}

async function runQueries(phase) {
  await waitApi();
  const admin = await login('bench_admin');
  const buyer = await login('bench_buyer01');
  const queries = [];
  queries.push(await runLoad({
    id: 'Q-01', label: 'Performance seat map', pathname: '/performances/1/seats', token: null,
    targetMs: 500, category: 'Core read', note: '200 seats, including price_tiers and holder_mine',
  }));
  queries.push(await runLoad({
    id: 'Q-02', label: 'Admin order search', pathname: '/admin/orders?status=PAID&page_size=20', token: admin,
    targetMs: 2000, category: 'Representative query', note: 'Filter by PAID and order by created_at DESC in a 10,000-order database',
  }));
  queries.push(await runLoad({
    id: 'Q-03', label: 'Per-performance sales statistics', pathname: '/admin/stats', token: admin,
    targetMs: 2000, category: 'Sales statistics', note: '100 performances x 7 correlated subqueries',
  }));
  queries.push(await runLoad({
    id: 'Q-04', label: 'User order progress', pathname: '/orders?page_size=20', token: buyer,
    targetMs: 1000, category: 'Representative query', note: 'buyer01 order list with ticket aggregation',
  }));
  queries.push(await runLoad({
    id: 'Q-05', label: 'Event list', pathname: '/events?page_size=20', token: null,
    targetMs: 500, category: 'Representative query', note: 'Public list of 10 BENCH events',
  }));

  const explain = await withDb((conn) => explainQueries(conn));
  const indexState = await withDb((conn) => indexes(conn));
  const meta = await metadata();
  const payload = {
    phase,
    meta,
    queries,
    explain,
    indexes: indexState,
    summary: {
      all_pass: queries.every((q) => q.pass),
      failed: queries.filter((q) => !q.pass).map((q) => q.id),
    },
  };
  writeJson(`bench-${phase}.json`, payload);
  writeJson(`explain-${phase}.json`, { phase, captured_at: payload.meta.captured_at, explain });
  writeJson(`indexes-${phase}.json`, { phase, captured_at: payload.meta.captured_at, indexes: indexState });
  console.log(`[${phase}] queries=${queries.length} all_pass=${payload.summary.all_pass}`);
  for (const q of queries) {
    console.log(`  ${q.id} ${q.label}: p95=${q.latency_ms.p95_ms}ms avg=${q.latency_ms.avg_ms}ms errors=${q.errors} target=${q.target_ms} pass=${q.pass}`);
  }
  return payload;
}

async function runReservation() {
  await waitApi();
  const tokens = await Promise.all(
    Array.from({ length: CONCURRENCY }, (_, i) => login(`bench_load${String(i + 1).padStart(2, '0')}`))
  );
  const seatRes = await api('/performances/1/seats');
  if (seatRes.status !== 200) throw new Error(`seat map failed: ${seatRes.status}`);
  const available = seatRes.json.data.seats.filter((s) => s.status === 'AVAILABLE').slice(0, CONCURRENCY);
  if (available.length < CONCURRENCY) throw new Error(`only ${available.length} available seats`);

  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const latencies = [];
  const results = [];
  const wallStart = process.hrtime.bigint();
  const worker = async (i) => {
    const t0 = process.hrtime.bigint();
    try {
      const r = await api('/orders', {
        method: 'POST',
        token: tokens[i],
        idempotencyKey: `BENCH-LOAD-${stamp}-${String(i + 1).padStart(2, '0')}`,
        body: { performance_id: 1, session_seat_ids: [available[i].session_seat_id] },
        timeoutMs: 30000,
      });
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      latencies.push(ms);
      results.push({
        worker: i + 1,
        seat: available[i].session_seat_id,
        status: r.status,
        code: r.json?.code || null,
        order_id: r.json?.data?.order_id || null,
        ms: round2(ms),
      });
    } catch (err) {
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      latencies.push(ms);
      results.push({ worker: i + 1, seat: available[i].session_seat_id, status: 0, error: err.message, ms: round2(ms) });
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)));
  const wallMs = Number(process.hrtime.bigint() - wallStart) / 1e6;
  const summary = latencySummary(latencies);
  const statusCodes = {};
  for (const r of results) statusCodes[r.status] = (statusCodes[r.status] || 0) + 1;

  const postState = await withDb(async (conn) => {
    const [newOrders] = await conn.query(
      `SELECT COUNT(*) AS total, SUM(status = 'PENDING_PAYMENT') AS pending
         FROM orders WHERE idempotency_key LIKE ?`,
      [`BENCH-LOAD-${stamp}-%`]
    );
    const [heldSeats] = await conn.query(
      `SELECT COUNT(*) AS total, COUNT(DISTINCT holder_order_id) AS distinct_holders
         FROM session_seats
        WHERE session_seat_id IN (${available.map((s) => s.session_seat_id).join(',')})
          AND session_seat_status = 'HELD'`
    );
    const [global] = await conn.query(
      `SELECT
         (SELECT COUNT(*) FROM orders) AS orders,
         (SELECT COUNT(*) FROM session_seats) AS session_seats,
         (SELECT COUNT(*) FROM session_seats WHERE session_seat_status = 'HELD') AS held_total,
         (SELECT COUNT(*) FROM session_seats WHERE session_seat_status = 'SOLD') AS sold_total`
    );
    return { new_orders: newOrders[0], held_seats: heldSeats[0], global: global[0] };
  });

  const passSeats = Number(postState.held_seats.total) === CONCURRENCY &&
    Number(postState.held_seats.distinct_holders) === CONCURRENCY;
  const passOrders = Number(postState.new_orders.total) === CONCURRENCY &&
    Number(postState.new_orders.pending) === CONCURRENCY;
  const passHttp = results.every((r) => r.status === 201);
  const passLatency = summary.p95_ms !== null && summary.p95_ms <= 1000;
  const payload = {
    phase: 'reservation',
    captured_at: new Date().toISOString(),
    meta: await metadata(),
    endpoint: 'POST /orders',
    target_ms: 1000,
    samples: CONCURRENCY,
    concurrency: CONCURRENCY,
    status_codes: statusCodes,
    errors: results.filter((r) => r.status !== 201).length,
    results,
    post_state: postState,
    checks: {
      http_201_all: passHttp,
      new_orders_50_all_pending: passOrders,
      selected_seats_50_held_unique: passSeats,
      p95_le_1000ms: passLatency,
      no_oversell: passSeats && passOrders,
    },
    latency_ms: summary,
    wall_ms: round2(wallMs),
    throughput_rps: round2((CONCURRENCY / wallMs) * 1000),
    pass: passHttp && passOrders && passSeats && passLatency,
  };
  writeJson('reservation.json', payload);
  console.log(`[reservation] samples=${CONCURRENCY} p95=${summary.p95_ms}ms avg=${summary.avg_ms}ms statuses=${JSON.stringify(statusCodes)} pass=${payload.pass}`);
  console.log(`  orders ${postState.new_orders.total}/${postState.new_orders.pending} pending; held ${postState.held_seats.total} distinct=${postState.held_seats.distinct_holders}`);
  return payload;
}

async function main() {
  if (MODE === 'baseline' || MODE === 'tuned') {
    await runQueries(MODE);
  } else if (MODE === 'reservation') {
    await runReservation();
  } else if (MODE === 'indexes') {
    await withDb(async (conn) => {
      await createCandidates(conn);
      const after = await indexes(conn);
      const explain = await explainQueries(conn);
      const meta = await metadata();
      writeJson('indexes-candidates.json', {
        captured_at: meta.captured_at,
        candidates: CANDIDATES,
        indexes: after,
      });
      writeJson('explain-tuned.json', { phase: 'tuned', captured_at: meta.captured_at, explain });
      console.log(`[indexes] created ${CANDIDATES.length} candidate indexes`);
      console.log(after.filter((x) => x.INDEX_NAME.startsWith('idx_m4_')).map((x) => `${x.TABLE_NAME}.${x.INDEX_NAME}(${x.columns})`).join('\n'));
    });
  } else if (MODE === 'drop') {
    await withDb(async (conn) => {
      await dropCandidates(conn);
      const after = await indexes(conn);
      writeJson('indexes-restored.json', {
        captured_at: new Date().toISOString(),
        candidates: CANDIDATES,
        indexes: after,
      });
      console.log(`[drop] candidate indexes removed; total indexes=${after.length}`);
    });
  } else {
    throw new Error(`unknown mode: ${MODE}`);
  }
}

main().catch((err) => {
  console.error('[FAIL]', err.stack || err.message);
  process.exit(1);
});
