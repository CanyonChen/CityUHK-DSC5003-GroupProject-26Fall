#!/usr/bin/env node
'use strict';

/**
 * M4 scale-data generator (separate ticketing_bench database; does not affect ticketing_system)
 *
 * Target scale:
 *   - 100 performances
 *   - 20,000 session_seats rows
 *   - 10,000 orders in different states
 *
 * Synthetic data uses the BENCH prefix to distinguish it from real demo data.
 * Re-running drops ticketing_bench first, then recreates it from AI/schema.sql.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');

const ROOT = path.join(__dirname, '..');
const serverRequire = createRequire(path.join(ROOT, 'ticketing-app', 'server', 'package.json'));
const mysql = serverRequire('mysql2/promise');
const BENCH_DB = 'ticketing_bench';
const DEMO_DB = 'ticketing_system';
const HOST = process.env.DB_HOST || '127.0.0.1';
const PORT = Number.parseInt(process.env.DB_PORT || '3306', 10);
const USER = process.env.DB_USER || 'root';
const PASSWORD = process.env.DB_PASSWORD || '';
const SQL_MODE =
  'STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

const NOW = new Date();
const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;

function addMs(date, ms) {
  return new Date(date.getTime() + ms);
}

function utc3(date) {
  return date.toISOString().replace('T', ' ').replace('Z', '');
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function pad(n, width = 2) {
  return String(n).padStart(width, '0');
}

async function insertMany(conn, table, columns, rows, batchSize = 500) {
  if (!rows.length) return;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    await conn.query(`INSERT INTO ${table} (${columns.join(',')}) VALUES ?`, [batch]);
  }
}

async function main() {
  // 1. Read the bcrypt hash from the demo database so bench accounts can log in with Demo@1234
  const demo = await mysql.createConnection({
    host: HOST,
    port: PORT,
    user: USER,
    password: PASSWORD,
    database: DEMO_DB,
    timezone: 'Z',
    multipleStatements: true,
  });
  let passwordHash;
  try {
    const [rows] = await demo.query(
      "SELECT password_hash FROM users WHERE user_name = 'buyer01' LIMIT 1"
    );
    if (!rows.length) throw new Error('Demo database is missing buyer01; cannot reuse the password hash');
    passwordHash = rows[0].password_hash;
  } finally {
    await demo.end();
  }

  // 2. Rebuild the bench database
  const admin = await mysql.createConnection({
    host: HOST,
    port: PORT,
    user: USER,
    password: PASSWORD,
    multipleStatements: true,
  });
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${BENCH_DB}`);
    let schema = fs.readFileSync(path.join(ROOT, 'AI', 'schema.sql'), 'utf8');
    schema = schema.split(DEMO_DB).join(BENCH_DB);
    await admin.query(schema);
  } finally {
    await admin.end();
  }

  const conn = await mysql.createConnection({
    host: HOST,
    port: PORT,
    user: USER,
    password: PASSWORD,
    database: BENCH_DB,
    timezone: 'Z',
    multipleStatements: false,
  });

  try {
    await conn.query(`SET SESSION sql_mode = '${SQL_MODE}'`);
    await conn.query("SET SESSION time_zone = '+00:00'");

    // 3. Users: 1 admin, 1 checker, 50 historical buyers, 50 concurrent test users
    const users = [];
    users.push([1, 'bench_admin', passwordHash, 'BENCH Admin', 0, utc3(addMs(NOW, -30 * DAY))]);
    users.push([2, 'bench_checker', passwordHash, 'BENCH Checker', 0, utc3(addMs(NOW, -30 * DAY))]);
    for (let i = 1; i <= 50; i++) {
      users.push([2 + i, `bench_buyer${pad(i)}`, passwordHash, `BENCH Buyer ${pad(i)}`, 0,
        utc3(addMs(NOW, -(20 - (i % 10)) * DAY))]);
    }
    for (let i = 1; i <= 50; i++) {
      users.push([52 + i, `bench_load${pad(i)}`, passwordHash, `BENCH Load ${pad(i)}`, 0,
        utc3(addMs(NOW, -1 * DAY))]);
    }
    await insertMany(conn, 'users',
      ['user_id', 'user_name', 'password_hash', 'display_name', 'token_version', 'created_at'], users);

    const roles = [[1, 'ADMIN', null, utc3(addMs(NOW, -29 * DAY))]];
    roles.push([2, 'CHECKER', 100, utc3(addMs(NOW, -29 * DAY))]);
    for (let uid = 3; uid <= 102; uid++) roles.push([uid, 'USER', null, utc3(addMs(NOW, -29 * DAY))]);

    // 4. Venue with 200 seats: zones A/B, each 10 rows x 10 seats
    await conn.query(
      `INSERT INTO venues (venue_id, name, row_count, col_count, layout_json, created_at)
       VALUES (1, 'BENCH Hall 200', 10, 20, ?, ?)`,
      [
        JSON.stringify({
          bench: true,
          regions: [
            { name: 'A', rows: 10, cols: 10, x: 1 },
            { name: 'B', rows: 10, cols: 10, x: 12 },
          ],
          aisle_after: 'A',
        }),
        utc3(addMs(NOW, -60 * DAY)),
      ]
    );

    const seatRows = [];
    for (let i = 0; i < 200; i++) {
      const region = i < 100 ? 'A' : 'B';
      const local = i % 100;
      const row = Math.floor(local / 10) + 1;
      const seat = (local % 10) + 1;
      const x = (region === 'A' ? 0 : 11) + seat;
      seatRows.push([
        i + 1, 1, region, pad(row), pad(seat), `${x},${row}`,
        `${region}-R${pad(row)}`,
      ]);
    }
    await insertMany(conn, 'seats',
      ['seat_id', 'venue_id', 'region', 'row_no', 'seat_no', 'coordinates', 'adjacent_group'], seatRows);

    // 5. 10 events x 10 performances = 100 performances
    const eventRows = [];
    for (let e = 1; e <= 10; e++) {
      eventRows.push([
        e, `BENCH Series ${pad(e)}`, `Synthetic scale event ${pad(e)}`, 'BENCH Synthetic Data',
        utc3(addMs(NOW, -70 * DAY)),
      ]);
    }
    await insertMany(conn, 'events',
      ['event_id', 'name', 'description', 'organizer', 'created_at'], eventRows);

    const performanceRows = [];
    const tierRows = [];
    for (let p = 1; p <= 100; p++) {
      const eventId = Math.floor((p - 1) / 10) + 1;
      const future = p <= 60;
      const starts = future
        ? addMs(NOW, p * 3 * DAY + (p % 4) * 60 * MINUTE)
        : addMs(NOW, -(p - 60) * 2 * DAY);
      const saleStart = addMs(starts, -30 * DAY);
      const saleEnd = addMs(starts, -1 * DAY);
      const checkinStart = addMs(starts, -60 * MINUTE);
      const checkinEnd = addMs(starts, 3 * 60 * MINUTE);
      performanceRows.push([
        p, eventId, 1,
        utc3(starts), utc3(saleStart), utc3(saleEnd), utc3(checkinStart), utc3(checkinEnd),
        future ? 'PUBLISHED' : 'FINISHED',
        utc3(addMs(NOW, -60 * DAY)),
        utc3(addMs(NOW, -59 * DAY)),
      ]);
      tierRows.push([p * 2 - 1, p, 'A-Reserve', 48000, 'HKD']);
      tierRows.push([p * 2, p, 'B-Reserve', 32000, 'HKD']);
    }
    await insertMany(conn, 'performances',
      ['performance_id', 'event_id', 'venue_id', 'starts_at', 'sale_start_at', 'sale_end_at',
        'checkin_start_at', 'checkin_end_at', 'status', 'created_at', 'published_at'], performanceRows);
    await insertMany(conn, 'price_tiers',
      ['tier_id', 'performance_id', 'tier_name', 'current_price', 'currency'], tierRows);

    await insertMany(conn, 'role_assignments',
      ['user_id', 'role', 'performance_id', 'assigned_at'], roles);

    // 6. 10,000 orders + 14,000 order items + 11,200 tickets + 9,300 payments + 8,000 notifications + 2,000 refunds
    const orderRows = [];
    const itemRows = [];
    const sessionRows = [];
    const ticketRows = [];
    const attemptRows = [];
    const noticeRows = [];
    const refundRows = [];
    const checkinRows = [];
    let itemId = 0;
    let ticketId = 0;
    let attemptId = 0;
    let noticeId = 0;
    let refundId = 0;
    let checkinId = 0;
    const attemptByOrder = new Map();

    for (let p = 1; p <= 100; p++) {
      const starts = new Date(performanceRows[p - 1][3].replace(' ', 'T') + 'Z');
      const future = p <= 60;
      const seatsForPerf = Array.from({ length: 200 }, (_, idx) => ({
        status: 'AVAILABLE',
        holder: null,
        holdExpires: null,
      }));
      let seatCursor = 0;
      const statusCounts = {};

      for (let j = 0; j < 100; j++) {
        const orderId = (p - 1) * 100 + j + 1;
        let status;
        if (future) {
          if (j < 60) status = 'PAID';
          else if (j < 75) status = 'REFUNDED';
          else if (j < 80) status = 'REFUND_PENDING';
          else if (j < 90) status = 'EXPIRED';
          else if (j < 95) status = 'CANCELLED';
          else status = 'PENDING_PAYMENT';
        } else {
          if (j < 60) status = 'PAID';
          else if (j < 75) status = 'REFUNDED';
          else if (j < 80) status = 'REFUND_PENDING';
          else if (j < 95) status = 'EXPIRED';
          else status = 'CANCELLED';
        }
        statusCounts[status] = (statusCounts[status] || 0) + 1;

        let createdAt;
        let expiresAt;
        let paidAt = null;
        let closedAt = null;
        if (status === 'PENDING_PAYMENT') {
          createdAt = addMs(NOW, -1 * MINUTE);
          expiresAt = addMs(NOW, 4 * MINUTE);
        } else if (status === 'PAID' || status === 'REFUND_PENDING') {
          createdAt = addMs(starts, -10 * DAY);
          expiresAt = addMs(createdAt, 5 * MINUTE);
          paidAt = addMs(createdAt, 3 * MINUTE);
        } else if (status === 'REFUNDED') {
          createdAt = addMs(starts, -10 * DAY);
          expiresAt = addMs(createdAt, 5 * MINUTE);
          paidAt = addMs(createdAt, 3 * MINUTE);
          closedAt = addMs(paidAt, 1 * DAY);
        } else if (status === 'EXPIRED') {
          createdAt = addMs(starts, -15 * DAY);
          expiresAt = addMs(createdAt, 5 * MINUTE);
          closedAt = expiresAt;
        } else {
          createdAt = addMs(starts, -20 * DAY);
          expiresAt = addMs(createdAt, 5 * MINUTE);
          closedAt = addMs(createdAt, 2 * MINUTE);
        }

        const itemCount = (j % 5 === 0 || j % 5 === 1) ? 2 : 1;
        const items = [];
        let total = 0;
        for (let k = 0; k < itemCount; k++) {
          const seatIndex = seatCursor++;
          const isA = seatIndex < 100;
          const price = isA ? 48000 : 32000;
          total += price;
          const sessionSeatId = (p - 1) * 200 + seatIndex + 1;
          const tierId = p * 2 - 1 + (isA ? 0 : 1);
          itemId += 1;
          itemRows.push([itemId, orderId, sessionSeatId, price, utc3(addMs(createdAt, 1 * MINUTE))]);
          items.push({ itemId, sessionSeatId, price, ticketId: null });

          if (status === 'PAID' || status === 'REFUND_PENDING') {
            seatsForPerf[seatIndex].status = 'SOLD';
          } else if (status === 'PENDING_PAYMENT') {
            seatsForPerf[seatIndex].status = 'HELD';
            seatsForPerf[seatIndex].holder = orderId;
            seatsForPerf[seatIndex].holdExpires = expiresAt;
          }
        }

        orderRows.push([
          orderId, 3 + ((p * 100 + j) % 50), p, status, total, 'HKD',
          utc3(expiresAt), `BENCH-P${pad(p)}-O${pad(j + 1, 3)}`,
          sha256(`BENCH-ORDER-${orderId}`), utc3(createdAt),
          paidAt ? utc3(paidAt) : null,
          closedAt ? utc3(closedAt) : null,
        ]);

        let attempt = null;
        if (status === 'PAID' || status === 'REFUNDED' || status === 'REFUND_PENDING' ||
            status === 'EXPIRED' || status === 'PENDING_PAYMENT') {
          attemptId += 1;
          const result = status === 'EXPIRED' ? 'FAILED'
            : status === 'PENDING_PAYMENT' ? 'PENDING' : 'SUCCEEDED';
          const attemptCreated = addMs(createdAt, 2 * MINUTE);
          const attemptUpdated = paidAt || addMs(attemptCreated, 1 * MINUTE);
          attemptRows.push([
            attemptId, orderId, `BENCH-PAY-${pad(attemptId, 6)}`, total, 'HKD', result, null,
            utc3(attemptCreated), utc3(attemptUpdated),
          ]);
          attempt = { id: attemptId, result };
          attemptByOrder.set(orderId, attempt);

          if (result === 'SUCCEEDED') {
            noticeId += 1;
            noticeRows.push([
              noticeId, 'BENCH_GATEWAY', `BENCH-NOTICE-${pad(noticeId, 6)}`, attemptId,
              utc3(addMs(attemptCreated, 30 * 1000)), utc3(addMs(attemptUpdated, 30 * 1000)),
              'APPLIED', sha256(`BENCH-NOTICE-${noticeId}`),
              JSON.stringify({ bench: true, order_id: orderId, attempt_id: attemptId, amount: total }),
            ]);
          }
        }

        if (status === 'PAID' || status === 'REFUNDED' || status === 'REFUND_PENDING') {
          for (const item of items) {
            ticketId += 1;
            let ticketStatus = 'VALID';
            if (status === 'REFUNDED') ticketStatus = 'VOID';
            else if (status === 'REFUND_PENDING') ticketStatus = 'REFUND_PENDING';
            else if (!future && ((j + item.itemId) % 5) < 3) ticketStatus = 'USED';

            ticketRows.push([
              ticketId, item.itemId, sha256(`BENCH-TICKET-${ticketId}`), ticketStatus,
              utc3(addMs(paidAt, 10 * 1000)),
            ]);
            item.ticketId = ticketId;

            if (ticketStatus === 'USED') {
              checkinId += 1;
              checkinRows.push([
                checkinId, ticketId, 2, utc3(addMs(starts, 30 * MINUTE)),
              ]);
            }
          }
        }

        if (status === 'REFUNDED' || status === 'REFUND_PENDING') {
          refundId += 1;
          const refundStatus = status === 'REFUNDED' ? 'SUCCEEDED' : 'PENDING';
          const refundCreated = addMs(paidAt, 6 * 60 * MINUTE);
          refundRows.push([
            refundId, orderId, attempt.id, 'BENCH synthetic refund', total,
            `BENCH-REF-${pad(orderId, 6)}`, refundStatus,
            utc3(refundCreated), utc3(addMs(refundCreated, 2 * 60 * MINUTE)),
          ]);
        }
      }

      // Orders cannot fill the entire venue: 140 seats per performance go into order items, and the remaining 60 stay AVAILABLE
      for (let seatIndex = 0; seatIndex < 200; seatIndex++) {
        const s = seatsForPerf[seatIndex];
        const sessionSeatId = (p - 1) * 200 + seatIndex + 1;
        const tierId = p * 2 - 1 + (seatIndex < 100 ? 0 : 1);
        sessionRows.push([
          sessionSeatId, p, seatIndex + 1, tierId, s.status, s.holder,
          s.holdExpires ? utc3(s.holdExpires) : null,
        ]);
      }

      const statusText = Object.entries(statusCounts)
        .map(([k, v]) => `${k}:${v}`).join(' ');
      if (p % 10 === 0) process.stdout.write(`  performances ${p}/100  ${statusText}\n`);
    }

    await insertMany(conn, 'orders',
      ['order_id', 'user_id', 'performance_id', 'status', 'total_amount', 'currency',
        'expires_at', 'idempotency_key', 'request_hash', 'created_at', 'paid_at', 'closed_at'],
      orderRows);
    await insertMany(conn, 'session_seats',
      ['session_seat_id', 'performance_id', 'seat_id', 'tier_id', 'session_seat_status',
        'holder_order_id', 'hold_expires_at'], sessionRows);
    await insertMany(conn, 'order_items',
      ['order_item_id', 'order_id', 'session_seat_id', 'price_snapshot', 'created_at'], itemRows);
    await insertMany(conn, 'tickets',
      ['ticket_id', 'order_item_id', 'ticket_code_hash', 'status', 'issued_at'], ticketRows);
    await insertMany(conn, 'payment_attempts',
      ['attempt_id', 'order_id', 'payment_ref', 'amount', 'currency', 'result',
        'handling_category', 'created_at', 'updated_at'], attemptRows);
    await insertMany(conn, 'payment_notifications',
      ['notice_id', 'source', 'notification_id', 'payment_attempt_id', 'received_at',
        'processed_at', 'processed_result', 'payload_digest', 'payload_json'], noticeRows);
    await insertMany(conn, 'refunds',
      ['refund_id', 'order_id', 'payment_attempt_id', 'reason', 'amount',
        'idempotency_key', 'status', 'created_at', 'updated_at'], refundRows);
    await insertMany(conn, 'checkins',
      ['checkin_id', 'ticket_id', 'checker_id', 'checked_in_at'], checkinRows);

    // 7. Self-check: counts, states, and inventory invariants
    const [counts] = await conn.query(`
      SELECT
        (SELECT COUNT(*) FROM performances) AS performances,
        (SELECT COUNT(*) FROM session_seats) AS session_seats,
        (SELECT COUNT(*) FROM orders) AS orders,
        (SELECT COUNT(*) FROM order_items) AS order_items,
        (SELECT COUNT(*) FROM tickets) AS tickets,
        (SELECT COUNT(*) FROM payment_attempts) AS payment_attempts,
        (SELECT COUNT(*) FROM payment_notifications) AS payment_notifications,
        (SELECT COUNT(*) FROM refunds) AS refunds,
        (SELECT COUNT(*) FROM checkins) AS checkins
    `);
    const [seatTotals] = await conn.query(`
      SELECT performance_id, COUNT(*) AS n, SUM(session_seat_status = 'AVAILABLE') AS available,
             SUM(session_seat_status = 'HELD') AS held, SUM(session_seat_status = 'SOLD') AS sold,
             SUM(session_seat_status = 'BLOCKED') AS blocked
        FROM session_seats GROUP BY performance_id
    `);
    const [orderStatus] = await conn.query(
      'SELECT status, COUNT(*) AS n FROM orders GROUP BY status ORDER BY status'
    );
    const badSeatTotals = seatTotals.filter((r) =>
      Number(r.n) !== 200 || Number(r.available) + Number(r.held) + Number(r.sold) + Number(r.blocked) !== 200
    );
    const [amountCheck] = await conn.query(`
      SELECT COUNT(*) AS bad
        FROM orders o
        JOIN (SELECT order_id, SUM(price_snapshot) AS total FROM order_items GROUP BY order_id) x
          ON x.order_id = o.order_id
       WHERE x.total <> o.total_amount
    `);
    const [ticketCheck] = await conn.query(`
      SELECT COUNT(*) AS bad
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.order_id
        LEFT JOIN tickets t ON t.order_item_id = oi.order_item_id
       WHERE o.status IN ('PAID','REFUNDED','REFUND_PENDING') AND t.ticket_id IS NULL
    `);

    const summary = {
      database: BENCH_DB,
      generated_at: new Date().toISOString(),
      counts: counts[0],
      order_status: Object.fromEntries(orderStatus.map((r) => [r.status, Number(r.n)])),
      seat_status_by_performance_ok: badSeatTotals.length === 0,
      order_amount_mismatch: Number(amountCheck[0].bad),
      paid_order_without_ticket: Number(ticketCheck[0].bad),
    };
    if (summary.order_amount_mismatch || summary.paid_order_without_ticket || badSeatTotals.length) {
      throw new Error(`Scale-data self-check failed: ${JSON.stringify(summary)}`);
    }

    const out = path.join(ROOT, 'delivery', 'evidence', 'M4', 'dataset-summary.json');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(summary, null, 2) + '\n', 'utf8');
    console.log(JSON.stringify(summary, null, 2));
    console.log(`\n[OK] Scale data written to ${BENCH_DB}; demo database ${DEMO_DB} unchanged.`);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('[FAIL]', err.stack || err.message);
  process.exit(1);
});
