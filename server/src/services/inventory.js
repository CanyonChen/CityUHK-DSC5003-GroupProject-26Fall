'use strict';
const { ApiError } = require('../lib/http');
const q = async (conn, sql, params = []) => (await conn.query(sql, params))[0];
function conflict() { return new ApiError(409, 'INVENTORY_INCONSISTENT', 'The order and current seat ownership do not agree; no tickets or seats were changed'); }
async function orderSeats(conn, orderId) {
  const seats = await q(conn, `SELECT ss.session_seat_id, ss.session_seat_status, ss.holder_order_id
    FROM order_items oi JOIN session_seats ss ON ss.session_seat_id = oi.session_seat_id
    WHERE oi.order_id = ? ORDER BY ss.session_seat_id FOR UPDATE`, [orderId]);
  if (!seats.length) throw conflict();
  return seats;
}
async function sellHeldSeats(conn, orderId) {
  const seats = await orderSeats(conn, orderId);
  if (seats.some(s => s.session_seat_status !== 'HELD' || Number(s.holder_order_id) !== Number(orderId))) throw conflict();
  const result = await q(conn, `UPDATE session_seats SET session_seat_status = 'SOLD', holder_order_id = NULL, hold_expires_at = NULL
    WHERE holder_order_id = ? AND session_seat_status = 'HELD'`, [orderId]);
  if (result.affectedRows !== seats.length) throw conflict();
  return seats.length;
}
// A SOLD seat's current owner is its one non-VOID ticket, not any historical order_item.
// Call before voiding the current tickets, inside the same transaction as the order update.
async function releaseSoldSeats(conn, orderId) {
  const seats = await orderSeats(conn, orderId);
  if (seats.some(s => s.session_seat_status !== 'SOLD')) throw conflict();
  const ids = seats.map(s => s.session_seat_id);
  const active = await q(conn, `SELECT oi.session_seat_id, oi.order_id, t.status FROM tickets t
    JOIN order_items oi ON oi.order_item_id = t.order_item_id
    WHERE oi.session_seat_id IN (${ids.map(() => '?').join(',')})
      AND t.status IN ('VALID','USED','REFUND_PENDING')
    ORDER BY oi.session_seat_id, t.ticket_id FOR UPDATE`, ids);
  if (active.length !== seats.length || seats.some(s => {
    const owners = active.filter(t => Number(t.session_seat_id) === Number(s.session_seat_id));
    return owners.length !== 1 || Number(owners[0].order_id) !== Number(orderId) ||
      !['VALID','REFUND_PENDING'].includes(owners[0].status);
  })) throw conflict();
  const result = await q(conn, `UPDATE session_seats ss
    JOIN order_items oi ON oi.session_seat_id = ss.session_seat_id
    JOIN tickets current_ticket ON current_ticket.order_item_id = oi.order_item_id
    SET ss.session_seat_status = 'AVAILABLE', ss.holder_order_id = NULL, ss.hold_expires_at = NULL
    WHERE oi.order_id = ? AND ss.session_seat_status = 'SOLD'
      AND current_ticket.status IN ('VALID','REFUND_PENDING')
      AND NOT EXISTS (SELECT 1 FROM order_items other_item JOIN tickets other_ticket ON other_ticket.order_item_id = other_item.order_item_id
        WHERE other_item.session_seat_id = ss.session_seat_id AND other_item.order_id <> ?
          AND other_ticket.status IN ('VALID','USED','REFUND_PENDING'))`, [orderId, orderId]);
  if (result.affectedRows !== seats.length) throw conflict();
  return result.affectedRows;
}
module.exports = { sellHeldSeats, releaseSoldSeats };
