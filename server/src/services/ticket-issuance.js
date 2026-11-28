'use strict';
const crypto = require('node:crypto');
const { ApiError } = require('../lib/http');
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
  if (!items.length || toInt(existing[0].n) !== 0) throw new ApiError(409, 'INVENTORY_INCONSISTENT', 'Unconfirmed order already has tickets or no seats');

  let issued = 0;
  for (const item of items) {
    const code = crypto.randomBytes(24).toString('hex');
    const hash = crypto.createHash('sha256').update(code).digest('hex');
    await q(
        conn,
        `INSERT INTO tickets (order_item_id, ticket_code_hash, status, issued_at)
         VALUES (?, ?, 'VALID', UTC_TIMESTAMP(3))`,
        [toInt(item.order_item_id), hash]
      );
    issued += 1;
  }
  return issued;
}

module.exports = { issueTickets };
