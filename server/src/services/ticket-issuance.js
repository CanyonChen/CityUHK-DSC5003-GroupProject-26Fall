'use strict';
const crypto = require('node:crypto');
const { toInt } = require('../lib/format');
async function q(conn, sql, params = []) { return (await conn.query(sql, params))[0]; }

async function issueTickets(conn, orderId) {
  const items = await q(
    conn,
    'SELECT order_item_id FROM order_items WHERE order_id = ? ORDER BY order_item_id',
    [orderId]
  );
  const existing = await q(
    conn,
    `SELECT COUNT(*) AS n FROM tickets t
       JOIN order_items oi ON oi.order_item_id = t.order_item_id
      WHERE oi.order_id = ?`,
    [orderId]
  );
  if (toInt(existing[0].n) >= items.length) return toInt(existing[0].n);

  let issued = 0;
  for (const item of items) {
    const code = crypto.randomBytes(24).toString('hex');
    const hash = crypto.createHash('sha256').update(code).digest('hex');
    try {
      await q(
        conn,
        `INSERT INTO tickets (order_item_id, ticket_code_hash, status, issued_at)
         VALUES (?, ?, 'VALID', UTC_TIMESTAMP(3))`,
        [toInt(item.order_item_id), hash]
      );
      issued += 1;
    } catch (err) {
      if (!err || err.code !== 'ER_DUP_ENTRY') throw err;
    }
  }
  return issued;
}

module.exports = { issueTickets };
