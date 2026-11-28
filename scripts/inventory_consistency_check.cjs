'use strict';
// Read-only, history-aware checks. VOID tickets from a prior sale are intentionally excluded.
const fs = require('node:fs'), path = require('node:path');
const { createRequire } = require('node:module');
const serverRequire = createRequire(path.resolve(__dirname, '../server/package.json'));
const mysql = serverRequire('mysql2/promise');
const checks = {
  pending_inventory: `SELECT oi.order_item_id AS id FROM orders o JOIN order_items oi ON oi.order_id=o.order_id
    JOIN session_seats ss ON ss.session_seat_id=oi.session_seat_id WHERE o.status='PENDING_PAYMENT'
      AND (ss.session_seat_status<>'HELD' OR ss.holder_order_id IS NULL OR ss.holder_order_id<>o.order_id)`,
  hold_owner: `SELECT ss.session_seat_id AS id FROM session_seats ss LEFT JOIN orders o ON o.order_id=ss.holder_order_id
    WHERE (ss.session_seat_status='HELD' AND (o.order_id IS NULL OR o.status<>'PENDING_PAYMENT' OR ss.hold_expires_at<>o.expires_at))
      OR (ss.session_seat_status<>'HELD' AND ss.holder_order_id IS NOT NULL)`,
  sold_owner: `SELECT ss.session_seat_id AS id FROM session_seats ss
    LEFT JOIN order_items oi ON oi.session_seat_id=ss.session_seat_id
    LEFT JOIN tickets t ON t.order_item_id=oi.order_item_id AND t.status IN ('VALID','USED','REFUND_PENDING')
    GROUP BY ss.session_seat_id, ss.session_seat_status
    HAVING (ss.session_seat_status='SOLD' AND COUNT(t.ticket_id)<>1)
      OR (ss.session_seat_status<>'SOLD' AND COUNT(t.ticket_id)<>0)`,
  ticket_order: `SELECT t.ticket_id AS id FROM tickets t JOIN order_items oi ON oi.order_item_id=t.order_item_id JOIN orders o ON o.order_id=oi.order_id
    WHERE (t.status IN ('VALID','USED') AND o.status<>'PAID')
      OR (t.status='REFUND_PENDING' AND o.status<>'REFUND_PENDING')
      OR (o.status IN ('CANCELLED','EXPIRED','REFUNDED') AND t.status<>'VOID')`,
  fulfilment: `SELECT o.order_id AS id FROM orders o LEFT JOIN order_items oi ON oi.order_id=o.order_id
    LEFT JOIN tickets t ON t.order_item_id=oi.order_item_id
    WHERE o.status IN ('PAID','REFUND_PENDING','REFUNDED')
    GROUP BY o.order_id HAVING COUNT(oi.order_item_id)=0 OR COUNT(t.ticket_id)<>COUNT(oi.order_item_id)`,
  checkin: `SELECT t.ticket_id AS id FROM tickets t LEFT JOIN checkins c ON c.ticket_id=t.ticket_id
    WHERE (t.status='USED' AND c.checkin_id IS NULL) OR (t.status<>'USED' AND c.checkin_id IS NOT NULL)`,
  refund_limit: `SELECT pa.attempt_id AS id FROM payment_attempts pa JOIN refunds r ON r.payment_attempt_id=pa.attempt_id AND r.status='SUCCEEDED'
    GROUP BY pa.attempt_id, pa.amount HAVING SUM(r.amount)>pa.amount`,
};
async function inspect(conn) {
  await conn.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
  await conn.query('SET TRANSACTION READ ONLY');
  await conn.query('START TRANSACTION WITH CONSISTENT SNAPSHOT');
  try {
    const result = {};
    for (const [name, sql] of Object.entries(checks)) {
      const [rows] = await conn.query(sql);
      result[name] = { count: rows.length, sample_ids: rows.slice(0,20).map(r => Number(r.id)) };
    }
    await conn.commit();
    return { ok: Object.values(result).every(x => x.count===0), checks: result };
  } catch (error) { await conn.rollback(); throw error; }
}
async function main() {
  const conn = await mysql.createConnection({ host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', database: process.env.DB_NAME || 'ticketing_system' });
  try {
    const report = await inspect(conn);
    const out = path.join(__dirname, '../.cache/checks/inventory-consistency.json');
    fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(report,null,2));
    console.log(JSON.stringify(report)); if (!report.ok) process.exitCode=1;
  } finally { await conn.end(); }
}
if (require.main===module) main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports = { inspect };
