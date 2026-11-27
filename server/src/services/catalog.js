'use strict';

const { query } = require('../db');
const { ApiError } = require('../lib/http');
const cfg = require('../config');

const VISIBLE_SQL = "p.status IN ('PUBLISHED','SALES_PAUSED')";
const FUTURE_SQL = 'p.starts_at >= UTC_TIMESTAMP(3)';

function toIso(value) {
  if (value === null || value === undefined) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function toInt(value) {
  return value === null || value === undefined ? 0 : Number(value);
}

function eventNotFound() {
  return new ApiError(404, 'NOT_FOUND', 'Event not found');
}

function performanceNotFound() {
  return new ApiError(404, 'NOT_FOUND', 'Performance not found');
}

async function listEvents({ keyword = '', page, pageSize, offset }) {
  const params = [];
  let where = '';
  if (keyword) {
    where = "(e.name LIKE ? OR e.organizer LIKE ? OR IFNULL(e.description,'') LIKE ?)";
    const like = `%${keyword}%`;
    params.push(like, like, like);
  }

  const from = `
    FROM events e
    JOIN performances p ON p.event_id = e.event_id AND ${VISIBLE_SQL} AND ${FUTURE_SQL}
    JOIN price_tiers pt ON pt.performance_id = p.performance_id
    ${where ? `WHERE ${where}` : ''}`;

  const countRows = await query(`SELECT COUNT(DISTINCT e.event_id) AS total ${from}`, params);
  const total = toInt(countRows[0] && countRows[0].total);

  const rows = await query(
    `SELECT e.event_id,
            e.name,
            (SELECT m.url FROM event_media m
              WHERE m.event_id = e.event_id AND m.media_type = 'COVER'
              ORDER BY m.sort_order, m.media_id LIMIT 1) AS cover_url,
            (SELECT CASE WHEN COUNT(DISTINCT p2.venue_id) = 1 THEN MIN(v.name)
                          ELSE 'Multiple venues' END
               FROM performances p2
               JOIN venues v ON v.venue_id = p2.venue_id
              WHERE p2.event_id = e.event_id AND p2.status IN ('PUBLISHED','SALES_PAUSED')
                AND p2.starts_at >= UTC_TIMESTAMP(3)) AS venue_name,
            MIN(p.starts_at) AS next_performance_at,
            MIN(pt.current_price) AS min_price_cents,
            MIN(pt.currency) AS currency
       ${from}
      GROUP BY e.event_id, e.name
      ORDER BY next_performance_at ASC, e.event_id ASC
      LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  return {
    items: rows.map((r) => ({
      event_id: toInt(r.event_id),
      name: r.name,
      cover_url: r.cover_url || null,
      venue_name: r.venue_name || null,
      next_performance_at: toIso(r.next_performance_at),
      min_price_cents: r.min_price_cents === null ? null : toInt(r.min_price_cents),
      currency: r.currency || cfg.currency,
    })),
    page,
    page_size: pageSize,
    total,
  };
}

async function getEvent(eventId) {
  const rows = await query(
    `SELECT event_id, name, description, organizer, created_at
       FROM events WHERE event_id = ?`,
    [eventId]
  );
  if (!rows.length) throw eventNotFound();
  const event = rows[0];

  const visible = await query(
    `SELECT 1 FROM performances
      WHERE event_id = ? AND status IN ('PUBLISHED','SALES_PAUSED')
        AND sale_end_at > UTC_TIMESTAMP(3)
      LIMIT 1`,
    [eventId]
  );
  if (!visible.length) throw eventNotFound();

  const media = await query(
    `SELECT media_id, media_type, url, sort_order
       FROM event_media
      WHERE event_id = ? AND media_type = 'COVER'
      ORDER BY sort_order, media_id
      LIMIT 1`,
    [eventId]
  );

  const performances = await query(
    `SELECT p.performance_id, p.starts_at, p.status,
            (SELECT COUNT(*) FROM session_seats ss
              WHERE ss.performance_id = p.performance_id
                AND ss.session_seat_status = 'AVAILABLE') AS available_seats,
            (SELECT MIN(pt.current_price) FROM price_tiers pt
              WHERE pt.performance_id = p.performance_id) AS min_price_cents,
            (SELECT MIN(pt.currency) FROM price_tiers pt
              WHERE pt.performance_id = p.performance_id) AS currency
       FROM performances p
      WHERE p.event_id = ? AND p.status IN ('PUBLISHED','SALES_PAUSED')
        AND p.sale_end_at > UTC_TIMESTAMP(3)
      ORDER BY p.starts_at ASC, p.performance_id ASC`,
    [eventId]
  );

  return {
    event_id: toInt(event.event_id),
    name: event.name,
    description: event.description,
    organizer: event.organizer,
    created_at: toIso(event.created_at),
    media: media.map((m) => ({
      media_id: toInt(m.media_id),
      media_type: m.media_type,
      url: m.url,
      sort_order: toInt(m.sort_order),
    })),
    performances: performances.map((p) => ({
      performance_id: toInt(p.performance_id),
      starts_at: toIso(p.starts_at),
      status: p.status,
      available_seats: toInt(p.available_seats),
      min_price_cents: p.min_price_cents === null ? null : toInt(p.min_price_cents),
      currency: p.currency || cfg.currency,
    })),
  };
}

async function listPerformances({ eventId, dateFrom, dateTo, salesStatus, page, pageSize, offset }) {
  const conds = ["p.status <> 'DRAFT'"];
  const params = [];

  if (eventId !== undefined) {
    conds.push('p.event_id = ?');
    params.push(eventId);
  }
  if (dateFrom) {
    conds.push('DATE(p.starts_at + INTERVAL 8 HOUR) >= ?');
    params.push(dateFrom);
  }
  if (dateTo) {
    conds.push('DATE(p.starts_at + INTERVAL 8 HOUR) <= ?');
    params.push(dateTo);
  }
  if (salesStatus === 'on_sale') {
    conds.push("p.status = 'PUBLISHED' AND UTC_TIMESTAMP(3) >= p.sale_start_at AND UTC_TIMESTAMP(3) < p.sale_end_at");
  } else if (salesStatus === 'paused') {
    conds.push("p.status = 'SALES_PAUSED' AND UTC_TIMESTAMP(3) < p.sale_end_at");
  } else if (salesStatus === 'closed') {
    conds.push("(p.status = 'FINISHED' OR (p.status IN ('PUBLISHED','SALES_PAUSED') AND UTC_TIMESTAMP(3) >= p.sale_end_at))");
  }

  const where = `WHERE ${conds.join(' AND ')}`;
  const from = `
    FROM performances p
    JOIN events e ON e.event_id = p.event_id
    JOIN venues v ON v.venue_id = p.venue_id
    ${where}`;

  const countRows = await query(`SELECT COUNT(*) AS total ${from}`, params);
  const total = toInt(countRows[0] && countRows[0].total);

  const rows = await query(
    `SELECT p.performance_id, p.event_id, e.name AS event_name, v.name AS venue_name,
            p.starts_at, p.sale_end_at AS sales_close_at, p.status,
            (SELECT COUNT(*) FROM session_seats ss
              WHERE ss.performance_id = p.performance_id
                AND ss.session_seat_status = 'AVAILABLE') AS available_seats,
            (SELECT MIN(pt.current_price) FROM price_tiers pt
              WHERE pt.performance_id = p.performance_id) AS min_price_cents,
            (SELECT MIN(pt.currency) FROM price_tiers pt
              WHERE pt.performance_id = p.performance_id) AS currency
       ${from}
      ORDER BY p.starts_at ASC, p.performance_id ASC
      LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  return {
    items: rows.map((r) => ({
      performance_id: toInt(r.performance_id),
      event_id: toInt(r.event_id),
      event_name: r.event_name,
      venue_name: r.venue_name,
      starts_at: toIso(r.starts_at),
      sales_close_at: toIso(r.sales_close_at),
      status: r.status,
      available_seats: toInt(r.available_seats),
      min_price_cents: r.min_price_cents === null ? null : toInt(r.min_price_cents),
      currency: r.currency || cfg.currency,
    })),
    page,
    page_size: pageSize,
    total,
  };
}

async function getPerformance(performanceId) {
  const rows = await query(
    `SELECT p.performance_id, p.event_id, p.venue_id, p.starts_at, p.sale_start_at, p.sale_end_at,
            p.checkin_start_at, p.checkin_end_at, p.status,
            e.name AS event_name, e.organizer,
            v.name AS venue_name
       FROM performances p
       JOIN events e ON e.event_id = p.event_id
       JOIN venues v ON v.venue_id = p.venue_id
      WHERE p.performance_id = ? AND p.status <> 'DRAFT'`,
    [performanceId]
  );
  if (!rows.length) throw performanceNotFound();
  const p = rows[0];

  const tiers = await query(
    `SELECT tier_id, tier_name, current_price, currency
       FROM price_tiers WHERE performance_id = ?
      ORDER BY current_price DESC, tier_id ASC`,
    [performanceId]
  );

  const counts = await query(
    `SELECT session_seat_status AS status, COUNT(*) AS n
       FROM session_seats WHERE performance_id = ?
      GROUP BY session_seat_status`,
    [performanceId]
  );
  const seatCounts = { available: 0, held: 0, sold: 0, blocked: 0 };
  for (const row of counts) {
    const key = String(row.status).toLowerCase();
    if (key in seatCounts) seatCounts[key] = toInt(row.n);
  }

  return {
    performance_id: toInt(p.performance_id),
    event_id: toInt(p.event_id),
    event_name: p.event_name,
    organizer: p.organizer,
    venue: { venue_id: toInt(p.venue_id), name: p.venue_name },
    starts_at: toIso(p.starts_at),
    sale_start_at: toIso(p.sale_start_at),
    sale_end_at: toIso(p.sale_end_at),
    checkin_start_at: toIso(p.checkin_start_at),
    checkin_end_at: toIso(p.checkin_end_at),
    status: p.status,
    price_tiers: tiers.map((t) => ({
      tier_id: toInt(t.tier_id),
      tier_name: t.tier_name,
      price_cents: toInt(t.current_price),
      currency: t.currency || cfg.currency,
    })),
    seat_counts: seatCounts,
    purchase_limit: cfg.limits.purchaseLimit,
    refund_policy: {
      cutoff_hours_before_start: cfg.limits.refundCutoffHours,
      partial_allowed: false,
    },
    currency: (tiers[0] && tiers[0].currency) || cfg.currency,
  };
}

function parseLayout(layoutJson) {
  if (!layoutJson) return {};
  if (typeof layoutJson === 'object') return layoutJson;
  try {
    return JSON.parse(layoutJson);
  } catch (err) {
    return {};
  }
}

async function getSeatMap(performanceId, userId) {
  const rows = await query(
    `SELECT p.performance_id, p.event_id, p.venue_id, p.status,
            v.name AS venue_name, v.row_count, v.col_count, v.layout_json
       FROM performances p
       JOIN venues v ON v.venue_id = p.venue_id
      WHERE p.performance_id = ? AND p.status <> 'DRAFT'`,
    [performanceId]
  );
  if (!rows.length) throw performanceNotFound();
  const p = rows[0];

  const seats = await query(
    `SELECT ss.session_seat_id, s.region, s.row_no, s.seat_no, s.coordinates,
            ss.session_seat_status AS status,
            pt.tier_name, pt.current_price AS price_cents, pt.currency,
            CASE WHEN ss.session_seat_status = 'HELD' AND o.user_id = ? THEN 1 ELSE 0 END AS holder_mine
       FROM session_seats ss
       JOIN seats s ON s.seat_id = ss.seat_id
       JOIN price_tiers pt ON pt.tier_id = ss.tier_id
       LEFT JOIN orders o ON o.order_id = ss.holder_order_id
      WHERE ss.performance_id = ?
      ORDER BY s.region ASC, CAST(s.row_no AS UNSIGNED) ASC, CAST(s.seat_no AS UNSIGNED) ASC`,
    [userId || 0, performanceId]
  );

  const updated = await query(
    'SELECT MAX(updated_at) AS updated_at FROM session_seats WHERE performance_id = ?',
    [performanceId]
  );

  const extra = parseLayout(p.layout_json);
  return {
    performance_id: toInt(p.performance_id),
    event_id: toInt(p.event_id),
    venue: { venue_id: toInt(p.venue_id), name: p.venue_name },
    layout: {
      row_count: toInt(p.row_count),
      col_count: toInt(p.col_count),
      ...extra,
    },
    seats: seats.map((s) => ({
      session_seat_id: toInt(s.session_seat_id),
      region: s.region,
      row_no: String(s.row_no),
      seat_no: String(s.seat_no),
      coordinates: s.coordinates,
      status: s.status,
      price_cents: toInt(s.price_cents),
      tier_name: s.tier_name,
      currency: s.currency || cfg.currency,
      holder_mine: Boolean(s.holder_mine),
    })),
    updated_at: toIso(updated[0] && updated[0].updated_at),
  };
}

module.exports = { listEvents, getEvent, listPerformances, getPerformance, getSeatMap };
