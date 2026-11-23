'use strict';

const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const { query } = require('../db');
const { ApiError } = require('../lib/http');
const cfg = require('../config');
const { toIso, toInt, orderNo, seatLabel } = require('../lib/format');

async function listTickets({ userId, status, dateFrom, page, pageSize, offset }) {
  const conds = ['o.user_id = ?'];
  const params = [userId];
  if (status) {
    conds.push('t.status = ?');
    params.push(status);
  }
  if (dateFrom) {
    conds.push('DATE(p.starts_at + INTERVAL 8 HOUR) >= ?');
    params.push(dateFrom);
  }
  const where = `WHERE ${conds.join(' AND ')}`;
  const base = `
    FROM tickets t
    JOIN order_items oi ON oi.order_item_id = t.order_item_id
    JOIN orders o ON o.order_id = oi.order_id
    JOIN performances p ON p.performance_id = o.performance_id
    JOIN events e ON e.event_id = p.event_id
    JOIN venues v ON v.venue_id = p.venue_id
    JOIN session_seats ss ON ss.session_seat_id = oi.session_seat_id
    JOIN seats s ON s.seat_id = ss.seat_id
    ${where}`;

  const countRows = await query(`SELECT COUNT(*) AS total ${base}`, params);
  const rows = await query(
    `SELECT t.ticket_id, t.status, t.issued_at, o.order_id,
            e.name AS event_name, v.name AS venue_name,
            s.region, s.row_no, s.seat_no, p.starts_at
       ${base}
      ORDER BY t.issued_at DESC, t.ticket_id DESC
      LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  return {
    items: rows.map((r) => ({
      ticket_id: toInt(r.ticket_id),
      order_id: toInt(r.order_id),
      event_name: r.event_name,
      venue_name: r.venue_name,
      seat_label: seatLabel(r),
      starts_at: toIso(r.starts_at),
      status: r.status,
      issued_at: toIso(r.issued_at),
    })),
    page,
    page_size: pageSize,
    total: toInt(countRows[0] && countRows[0].total),
  };
}

async function getTicket(ticketId, viewer) {
  const rows = await query(
    `SELECT t.ticket_id, t.status, t.issued_at, o.order_id, o.user_id, o.created_at AS order_created_at,
            oi.price_snapshot, e.name AS event_name, e.description AS event_description,
            v.name AS venue_name, p.starts_at,
            s.region, s.row_no, s.seat_no, pt.tier_name
       FROM tickets t
       JOIN order_items oi ON oi.order_item_id = t.order_item_id
       JOIN orders o ON o.order_id = oi.order_id
       JOIN performances p ON p.performance_id = o.performance_id
       JOIN events e ON e.event_id = p.event_id
       JOIN venues v ON v.venue_id = p.venue_id
       JOIN session_seats ss ON ss.session_seat_id = oi.session_seat_id
       JOIN seats s ON s.seat_id = ss.seat_id
       JOIN price_tiers pt ON pt.tier_id = ss.tier_id
      WHERE t.ticket_id = ?`,
    [ticketId]
  );
  if (!rows.length) throw new ApiError(404, 'NOT_FOUND', 'Ticket not found');
  const t = rows[0];
  const isAdmin = (viewer.roles || []).includes('ADMIN');
  if (!isAdmin && toInt(t.user_id) !== viewer.userId) {
    throw new ApiError(403, 'FORBIDDEN', 'You cannot view this ticket');
  }

  const checkins = await query(
    `SELECT c.checked_in_at, u.display_name, u.user_name
       FROM checkins c JOIN users u ON u.user_id = c.checker_id
      WHERE c.ticket_id = ?`,
    [ticketId]
  );

  return {
    ticket_id: toInt(t.ticket_id),
    order_id: toInt(t.order_id),
    order_no: orderNo(toInt(t.order_id), t.order_created_at),
    status: t.status,
    issued_at: toIso(t.issued_at),
    event_name: t.event_name,
    event_description: t.event_description,
    venue_name: t.venue_name,
    starts_at: toIso(t.starts_at),
    seat_label: seatLabel(t),
    tier_name: t.tier_name,
    price_cents: toInt(t.price_snapshot),
    qr_token: jwt.sign({ typ: 'TICKET_QR', tid: toInt(t.ticket_id) }, cfg.jwt.secret, {
      expiresIn: cfg.limits.ticketQrSeconds,
    }),
    qr_expires_in: cfg.limits.ticketQrSeconds,
    checkin: checkins.length
      ? {
          checked_in_at: toIso(checkins[0].checked_in_at),
          checker_name: checkins[0].display_name || checkins[0].user_name,
        }
      : null,
  };
}

async function getTicketPng(ticketId, viewer) {
  const ticket = await getTicket(ticketId, viewer);
  return QRCode.toBuffer(ticket.qr_token, {
    type: 'png',
    width: 320,
    margin: 1,
    color: { dark: '#12203AFF', light: '#F7F5F0FF' },
  });
}

module.exports = { listTickets, getTicket, getTicketPng };
