'use strict';

const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { pool, query } = require('../db');
const { ApiError } = require('../lib/http');
const cfg = require('../config');
const { toIso, toInt, orderNo, seatLabel } = require('../lib/format');
const { writeAudit } = require('../lib/audit');

async function q(exec, sql, params = []) {
  if (typeof exec === 'function') return exec(sql, params);
  const [rows] = await exec.query(sql, params);
  return rows;
}

function bad(field, detail = '') {
  return new ApiError(400, 'VALIDATION_ERROR', `${field}${detail ? ': ' + detail : ' is invalid'}`);
}

function parseDateTime(value, field, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw bad(field, 'required');
    return null;
  }
  let text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}$/.test(text)) text += ':00';
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}$/.test(text)) {
    // Admin datetime-local values are interpreted as Hong Kong time by default
    text = text.replace(' ', 'T') + '+08:00';
  }
  const d = new Date(text);
  if (Number.isNaN(d.getTime())) throw bad(field, 'Invalid date/time format');
  return d;
}

function utcSql(d) {
  return d.toISOString().replace('T', ' ').replace('Z', '');
}

function isoOrNull(v) {
  return toIso(v);
}

function text(value, field, { min = 1, max = 255, optional = false } = {}) {
  if (value === undefined || value === null) {
    if (optional) return null;
    throw bad(field, 'required');
  }
  const s = String(value).trim();
  if ((!optional && s.length < min) || s.length > max) throw bad(field, `length must be between ${min} and ${max}`);
  return s;
}

function intField(value, field, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw bad(field, `must be an integer between ${min} and ${max}`);
  return n;
}

// ---------------------------------------------------------------- events

async function listAdminEvents({ keyword, status, page, pageSize, offset }) {
  const conds = [];
  const params = [];
  if (keyword) {
    conds.push("(e.name LIKE ? OR e.organizer LIKE ? OR IFNULL(e.description,'') LIKE ?)");
    const like = `%${keyword}%`;
    params.push(like, like, like);
  }
  if (status === 'DRAFT') {
    conds.push("NOT EXISTS (SELECT 1 FROM performances p WHERE p.event_id = e.event_id AND p.status <> 'DRAFT')");
  } else if (status === 'PUBLISHED') {
    conds.push("EXISTS (SELECT 1 FROM performances p WHERE p.event_id = e.event_id AND p.status IN ('PUBLISHED','SALES_PAUSED'))");
  } else if (status === 'FINISHED') {
    conds.push("EXISTS (SELECT 1 FROM performances p WHERE p.event_id = e.event_id AND p.status = 'FINISHED')");
  } else if (status) {
    throw bad('status');
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const count = await q(query, `SELECT COUNT(*) AS total FROM events e ${where}`, params);
  const rows = await q(
    query,
    `SELECT e.event_id, e.name, e.description, e.organizer, e.created_at,
            (SELECT m.url FROM event_media m WHERE m.event_id = e.event_id AND m.media_type = 'COVER'
              ORDER BY m.sort_order, m.media_id LIMIT 1) AS cover_url,
            (SELECT COUNT(*) FROM performances p WHERE p.event_id = e.event_id) AS performance_count,
            (SELECT COUNT(*) FROM performances p WHERE p.event_id = e.event_id AND p.status = 'PUBLISHED') AS published_count,
            (SELECT COUNT(*) FROM performances p WHERE p.event_id = e.event_id AND p.status = 'SALES_PAUSED') AS paused_count
       FROM events e ${where}
      ORDER BY e.event_id DESC
      LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  return {
    items: rows.map((r) => ({
      event_id: toInt(r.event_id),
      title: r.name,
      name: r.name,
      description: r.description,
      organizer_name: r.organizer,
      organizer: r.organizer,
      cover_url: r.cover_url || null,
      performance_count: toInt(r.performance_count),
      published_count: toInt(r.published_count),
      paused_count: toInt(r.paused_count),
      created_at: isoOrNull(r.created_at),
    })),
    page,
    page_size: pageSize,
    total: toInt(count[0] && count[0].total),
  };
}

async function setCover(conn, eventId, coverUrl) {
  if (coverUrl === undefined) return;
  await q(conn, "DELETE FROM event_media WHERE event_id = ? AND media_type = 'COVER'", [eventId]);
  if (coverUrl !== null && String(coverUrl).trim() !== '') {
    await q(
      conn,
      "INSERT INTO event_media (event_id, media_type, url, sort_order) VALUES (?, 'COVER', ?, 0)",
      [eventId, String(coverUrl).trim()]
    );
  }
}

async function createEvent({ body, requestId }) {
  const title = text(body.title ?? body.name, 'title', { max: 100 });
  const organizer = text(body.organizer_name ?? body.organizer, 'organizer_name', { max: 200 });
  const description = body.description === undefined || body.description === null
    ? null
    : text(body.description, 'description', { max: 5000, optional: true });
  const cover = body.cover_url === undefined ? null : body.cover_url;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const ins = await q(
      conn,
      'INSERT INTO events (name, description, organizer) VALUES (?, ?, ?)',
      [title, description, organizer]
    );
    const eventId = toInt(ins.insertId);
    await setCover(conn, eventId, cover);
    await writeAudit(conn, {
      actorType: 'ADMIN',
      actorId: body.actorId,
      objectType: 'EVENT',
      objectId: eventId,
      action: 'EVENT_CREATED',
      summary: `event ${eventId} created`,
      requestId,
    });
    await conn.commit();
    return { event_id: eventId, title, name: title, description, organizer_name: organizer, cover_url: cover || null };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function updateEvent({ eventId, body, requestId, actorId }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const rows = await q(conn, 'SELECT * FROM events WHERE event_id = ? FOR UPDATE', [eventId]);
    if (!rows.length) throw new ApiError(404, 'NOT_FOUND', 'Event not found');
    const sets = [];
    const params = [];
    if (body.title !== undefined || body.name !== undefined) {
      sets.push('name = ?');
      params.push(text(body.title ?? body.name, 'title', { max: 100 }));
    }
    if (body.description !== undefined) {
      const desc = body.description === null || body.description === ''
        ? null
        : text(body.description, 'description', { max: 5000, optional: true });
      sets.push('description = ?');
      params.push(desc);
    }
    if (body.organizer_name !== undefined || body.organizer !== undefined) {
      sets.push('organizer = ?');
      params.push(text(body.organizer_name ?? body.organizer, 'organizer_name', { max: 200 }));
    }
    if (sets.length) {
      await q(conn, `UPDATE events SET ${sets.join(', ')} WHERE event_id = ?`, [...params, eventId]);
    }
    await setCover(conn, eventId, body.cover_url);
    await writeAudit(conn, {
      actorType: 'ADMIN',
      actorId,
      objectType: 'EVENT',
      objectId: eventId,
      action: 'EVENT_UPDATED',
      summary: `fields: ${sets.map((s) => s.split(' =')[0]).join(',') || (body.cover_url !== undefined ? 'cover' : 'none')}`,
      requestId,
    });
    await conn.commit();
    return { event_id: eventId };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ---------------------------------------------------------------- venues
async function listVenues() {
  const rows = await q(
    query,
    `SELECT venue_id, name, row_count, col_count, layout_json,
            (SELECT COUNT(*) FROM seats s WHERE s.venue_id = v.venue_id) AS seat_count
       FROM venues v ORDER BY venue_id`
  );
  return {
    items: rows.map((r) => ({
      venue_id: toInt(r.venue_id),
      name: r.name,
      row_count: r.row_count === null ? null : toInt(r.row_count),
      col_count: r.col_count === null ? null : toInt(r.col_count),
      layout: r.layout_json ? JSON.parse(r.layout_json) : {},
      seat_count: toInt(r.seat_count),
    })),
  };
}

// ---------------------------------------------------------------- performances

function validateWindows({ startsAt, saleStartAt, saleEndAt, checkinStartAt, checkinEndAt }) {
  if (!(saleStartAt < saleEndAt)) throw bad('sale_start_at', 'Sales must start before they end');
  if (!(saleEndAt < startsAt)) throw bad('sale_end_at', 'Sales must end before the performance starts');
  if (!(checkinStartAt < checkinEndAt)) throw bad('checkin_start_at', 'Check-in must start before it ends');
}

async function listAdminPerformances({ eventId, status, dateFrom, dateTo, page, pageSize, offset }) {
  const conds = [];
  const params = [];
  if (eventId !== undefined) {
    conds.push('p.event_id = ?');
    params.push(eventId);
  }
  if (status) {
    if (!['DRAFT', 'PUBLISHED', 'SALES_PAUSED', 'FINISHED'].includes(status)) throw bad('status');
    conds.push('p.status = ?');
    params.push(status);
  }
  if (dateFrom) {
    conds.push('DATE(p.starts_at + INTERVAL 8 HOUR) >= ?');
    params.push(dateFrom);
  }
  if (dateTo) {
    conds.push('DATE(p.starts_at + INTERVAL 8 HOUR) <= ?');
    params.push(dateTo);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const from = `
    FROM performances p
    JOIN events e ON e.event_id = p.event_id
    JOIN venues v ON v.venue_id = p.venue_id
    ${where}`;
  const count = await q(query, `SELECT COUNT(*) AS total ${from}`, params);
  const rows = await q(
    query,
    `SELECT p.performance_id, p.event_id, p.venue_id, e.name AS event_name, v.name AS venue_name,
            p.starts_at, p.sale_start_at, p.sale_end_at, p.checkin_start_at, p.checkin_end_at,
            p.status, p.created_at, p.published_at,
            (SELECT COUNT(*) FROM session_seats ss WHERE ss.performance_id = p.performance_id AND ss.session_seat_status = 'AVAILABLE') AS available,
            (SELECT COUNT(*) FROM session_seats ss WHERE ss.performance_id = p.performance_id AND ss.session_seat_status = 'HELD') AS held,
            (SELECT COUNT(*) FROM session_seats ss WHERE ss.performance_id = p.performance_id AND ss.session_seat_status = 'SOLD') AS sold,
            (SELECT COUNT(*) FROM session_seats ss WHERE ss.performance_id = p.performance_id AND ss.session_seat_status = 'BLOCKED') AS blocked,
            (SELECT COUNT(*) FROM checkins c JOIN tickets t ON t.ticket_id = c.ticket_id
              JOIN order_items oi ON oi.order_item_id = t.order_item_id
              JOIN orders o ON o.order_id = oi.order_id
             WHERE o.performance_id = p.performance_id) AS checked_in,
            (SELECT MIN(pt.current_price) FROM price_tiers pt WHERE pt.performance_id = p.performance_id) AS min_price
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
      venue_id: toInt(r.venue_id),
      venue_name: r.venue_name,
      starts_at: isoOrNull(r.starts_at),
      sale_start_at: isoOrNull(r.sale_start_at),
      sale_end_at: isoOrNull(r.sale_end_at),
      checkin_start_at: isoOrNull(r.checkin_start_at),
      checkin_end_at: isoOrNull(r.checkin_end_at),
      status: r.status,
      seat_counts: {
        available: toInt(r.available),
        held: toInt(r.held),
        sold: toInt(r.sold),
        blocked: toInt(r.blocked),
      },
      checked_in_count: toInt(r.checked_in),
      min_price_cents: r.min_price === null ? null : toInt(r.min_price),
      created_at: isoOrNull(r.created_at),
      published_at: isoOrNull(r.published_at),
    })),
    page,
    page_size: pageSize,
    total: toInt(count[0] && count[0].total),
  };
}

async function createPerformance({ body, requestId, actorId }) {
  if (!body || typeof body !== 'object') throw bad('body');
  const eventId = intField(body.event_id, 'event_id');
  const venueId = intField(body.venue_id, 'venue_id');
  const startsAt = parseDateTime(body.starts_at, 'starts_at', { required: true });
  const saleStartAt = parseDateTime(body.sale_start_at, 'sale_start_at', { required: true });
  const saleEndAt = parseDateTime(body.sale_end_at, 'sale_end_at', { required: true });
  const checkinStartAt = parseDateTime(body.checkin_start_at, 'checkin_start_at', { required: true });
  const checkinEndAt = parseDateTime(body.checkin_end_at, 'checkin_end_at', { required: true });
  validateWindows({ startsAt, saleStartAt, saleEndAt, checkinStartAt, checkinEndAt });

  if (!Array.isArray(body.price_tiers) || body.price_tiers.length < 1 || body.price_tiers.length > 10) {
    throw bad('price_tiers', 'must be an array of 1–10 items');
  }
  const tiers = body.price_tiers.map((t, i) => ({
    name: text(t.tier_name ?? t.name, `price_tiers[${i}].tier_name`, { max: 50 }),
    price: intField(t.price_cents ?? t.price, `price_tiers[${i}].price_cents`, { min: 0 }),
  }));
  if (new Set(tiers.map((t) => t.name)).size !== tiers.length) throw bad('price_tiers', 'Price tier names must be unique');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const event = await q(conn, 'SELECT event_id FROM events WHERE event_id = ?', [eventId]);
    if (!event.length) throw new ApiError(404, 'NOT_FOUND', 'Event not found');
    const venue = await q(conn, 'SELECT venue_id, name FROM venues WHERE venue_id = ?', [venueId]);
    if (!venue.length) throw new ApiError(404, 'NOT_FOUND', 'Venue not found');

    const ins = await q(
      conn,
      `INSERT INTO performances
        (event_id, venue_id, starts_at, sale_start_at, sale_end_at, checkin_start_at, checkin_end_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'DRAFT')`,
      [eventId, venueId, utcSql(startsAt), utcSql(saleStartAt), utcSql(saleEndAt), utcSql(checkinStartAt), utcSql(checkinEndAt)]
    );
    const performanceId = toInt(ins.insertId);

    const tierIds = [];
    for (const t of tiers) {
      const row = await q(
        conn,
        'INSERT INTO price_tiers (performance_id, tier_name, current_price, currency) VALUES (?, ?, ?, ?)',
        [performanceId, t.name, t.price, cfg.currency]
      );
      tierIds.push({ tier_id: toInt(row.insertId), name: t.name });
    }

    const seats = await q(
      conn,
      `SELECT seat_id, region FROM seats WHERE venue_id = ? ORDER BY region, CAST(row_no AS UNSIGNED), CAST(seat_no AS UNSIGNED)`,
      [venueId]
    );
    if (!seats.length) throw bad('venue_id', 'The venue has no seats');
    const regions = [...new Set(seats.map((s) => String(s.region)))].sort();
    const tierByRegion = new Map();
    regions.forEach((region, idx) => tierByRegion.set(region, tierIds[Math.min(idx, tierIds.length - 1)].tier_id));

    await q(
      conn,
      `INSERT INTO session_seats (performance_id, seat_id, tier_id, session_seat_status)
       VALUES ${seats.map(() => "(?, ?, ?, 'AVAILABLE')").join(', ')}`,
      seats.flatMap((s) => [performanceId, toInt(s.seat_id), tierByRegion.get(String(s.region))])
    );

    await writeAudit(conn, {
      actorType: 'ADMIN',
      actorId,
      objectType: 'PERFORMANCE',
      objectId: performanceId,
      action: 'PERFORMANCE_CREATED',
      summary: `event ${eventId}, venue ${venueId}, ${seats.length} seats, ${tiers.length} tiers`,
      requestId,
    });
    await conn.commit();
    return { performance_id: performanceId, status: 'DRAFT', seat_count: seats.length, price_tiers: tiers };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function getAdminPerformance(performanceId) {
  const rows = await q(
    query,
    `SELECT p.performance_id, p.event_id, p.venue_id, e.name AS event_name, v.name AS venue_name,
            p.starts_at, p.sale_start_at, p.sale_end_at, p.checkin_start_at, p.checkin_end_at,
            p.status, p.created_at, p.published_at
       FROM performances p
       JOIN events e ON e.event_id = p.event_id
       JOIN venues v ON v.venue_id = p.venue_id
      WHERE p.performance_id = ?`,
    [performanceId]
  );
  if (!rows.length) throw new ApiError(404, 'NOT_FOUND', 'Performance not found');
  const r = rows[0];
  const tiers = await q(
    query,
    `SELECT tier_id, tier_name, current_price, currency FROM price_tiers
      WHERE performance_id = ? ORDER BY current_price DESC, tier_id ASC`,
    [performanceId]
  );
  return {
    performance_id: toInt(r.performance_id),
    event_id: toInt(r.event_id),
    event_name: r.event_name,
    venue_id: toInt(r.venue_id),
    venue_name: r.venue_name,
    starts_at: isoOrNull(r.starts_at),
    sale_start_at: isoOrNull(r.sale_start_at),
    sale_end_at: isoOrNull(r.sale_end_at),
    checkin_start_at: isoOrNull(r.checkin_start_at),
    checkin_end_at: isoOrNull(r.checkin_end_at),
    status: r.status,
    created_at: isoOrNull(r.created_at),
    published_at: isoOrNull(r.published_at),
    price_tiers: tiers.map((t) => ({
      tier_id: toInt(t.tier_id),
      tier_name: t.tier_name,
      price_cents: toInt(t.current_price),
      currency: t.currency,
    })),
  };
}

async function updatePerformance({ performanceId, body, requestId, actorId }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const rows = await q(
      conn,
      `SELECT performance_id, event_id, venue_id, starts_at, sale_start_at, sale_end_at,
              checkin_start_at, checkin_end_at, status
         FROM performances WHERE performance_id = ? FOR UPDATE`,
      [performanceId]
    );
    if (!rows.length) throw new ApiError(404, 'NOT_FOUND', 'Performance not found');
    const cur = rows[0];

    const next = {
      venueId: cur.venue_id,
      startsAt: cur.starts_at,
      saleStartAt: cur.sale_start_at,
      saleEndAt: cur.sale_end_at,
      checkinStartAt: cur.checkin_start_at,
      checkinEndAt: cur.checkin_end_at,
    };
    if (body.venue_id !== undefined) next.venueId = intField(body.venue_id, 'venue_id');
    for (const key of ['starts_at', 'sale_start_at', 'sale_end_at', 'checkin_start_at', 'checkin_end_at']) {
      if (body[key] !== undefined) next[{
        starts_at: 'startsAt', sale_start_at: 'saleStartAt', sale_end_at: 'saleEndAt',
        checkin_start_at: 'checkinStartAt', checkin_end_at: 'checkinEndAt',
      }[key]] = parseDateTime(body[key], key, { required: true });
    }
    validateWindows(next);

    const orderCount = await q(conn, 'SELECT COUNT(*) AS n FROM orders WHERE performance_id = ?', [performanceId]);
    const hasOrders = toInt(orderCount[0].n) > 0;
    const venueChanged = String(next.venueId) !== String(cur.venue_id);
    const startsChanged = new Date(next.startsAt).getTime() !== new Date(cur.starts_at).getTime();
    if (cur.status !== 'DRAFT' && (venueChanged || startsChanged)) {
      throw new ApiError(409, 'PERFORMANCE_LOCKED', 'Venue and start time cannot be changed after publishing');
    }
    const windowChanged = ['saleStartAt', 'saleEndAt', 'checkinStartAt', 'checkinEndAt']
      .some((k) => new Date(next[k]).getTime() !== new Date(cur[{
        saleStartAt: 'sale_start_at', saleEndAt: 'sale_end_at',
        checkinStartAt: 'checkin_start_at', checkinEndAt: 'checkin_end_at',
      }[k]]).getTime());
    if (hasOrders && windowChanged) {
      throw new ApiError(409, 'PERFORMANCE_LOCKED', 'Sales and check-in windows cannot be changed after orders exist');
    }

    await q(
      conn,
      `UPDATE performances
          SET venue_id = ?, starts_at = ?, sale_start_at = ?, sale_end_at = ?,
              checkin_start_at = ?, checkin_end_at = ?
        WHERE performance_id = ?`,
      [next.venueId, utcSql(next.startsAt), utcSql(next.saleStartAt), utcSql(next.saleEndAt), utcSql(next.checkinStartAt), utcSql(next.checkinEndAt), performanceId]
    );
    await writeAudit(conn, {
      actorType: 'ADMIN',
      actorId,
      objectType: 'PERFORMANCE',
      objectId: performanceId,
      action: 'PERFORMANCE_UPDATED',
      summary: `venue ${cur.venue_id}→${next.venueId}, windows updated`,
      requestId,
    });
    await conn.commit();
    return { performance_id: performanceId };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function publishPerformance({ performanceId, requestId, actorId }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const rows = await q(conn, 'SELECT performance_id, status FROM performances WHERE performance_id = ? FOR UPDATE', [performanceId]);
    if (!rows.length) throw new ApiError(404, 'NOT_FOUND', 'Performance not found');
    const p = rows[0];
    if (p.status === 'PUBLISHED') {
      await conn.commit();
      return { performance_id: performanceId, status: 'PUBLISHED' };
    }
    const tiers = await q(conn, 'SELECT COUNT(*) AS n FROM price_tiers WHERE performance_id = ?', [performanceId]);
    const seats = await q(conn, 'SELECT COUNT(*) AS n FROM session_seats WHERE performance_id = ?', [performanceId]);
    if (!toInt(tiers[0].n)) throw bad('price_tiers', 'At least one price tier is required before publishing');
    if (!toInt(seats[0].n)) throw bad('session_seats', 'Seats must be initialized before publishing');
    await q(
      conn,
      "UPDATE performances SET status = 'PUBLISHED', published_at = IFNULL(published_at, UTC_TIMESTAMP(3)) WHERE performance_id = ?",
      [performanceId]
    );
    await writeAudit(conn, {
      actorType: 'ADMIN',
      actorId,
      objectType: 'PERFORMANCE',
      objectId: performanceId,
      action: 'PERFORMANCE_PUBLISHED',
      summary: 'status DRAFT→PUBLISHED',
      requestId,
    });
    await conn.commit();
    return { performance_id: performanceId, status: 'PUBLISHED' };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function setSales({ performanceId, action, requestId, actorId }) {
  if (!['pause', 'resume'].includes(action)) throw bad('action', 'must be pause or resume');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const rows = await q(
      conn,
      'SELECT performance_id, status, sale_end_at FROM performances WHERE performance_id = ? FOR UPDATE',
      [performanceId]
    );
    if (!rows.length) throw new ApiError(404, 'NOT_FOUND', 'Performance not found');
    const p = rows[0];
    let next;
    if (action === 'pause') {
      if (p.status !== 'PUBLISHED') throw bad('action', 'Only PUBLISHED performances can be paused');
      next = 'SALES_PAUSED';
    } else {
      if (p.status !== 'SALES_PAUSED') throw bad('action', 'Only SALES_PAUSED performances can be resumed');
      const nowRows = await q(conn, 'SELECT UTC_TIMESTAMP(3) AS now');
      if (!(nowRows[0].now < p.sale_end_at)) throw bad('action', 'Sales have closed; the performance cannot be resumed');
      next = 'PUBLISHED';
    }
    await q(conn, 'UPDATE performances SET status = ? WHERE performance_id = ?', [next, performanceId]);
    await writeAudit(conn, {
      actorType: 'ADMIN',
      actorId,
      objectType: 'PERFORMANCE',
      objectId: performanceId,
      action: action === 'pause' ? 'SALES_PAUSED' : 'SALES_RESUMED',
      summary: `${p.status}→${next}`,
      requestId,
    });
    await conn.commit();
    return { performance_id: performanceId, status: next };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function updatePriceTiers({ performanceId, tiers, requestId, actorId }) {
  if (!Array.isArray(tiers) || tiers.length < 1 || tiers.length > 10) throw bad('tiers', 'must be an array of 1–10 items');
  const normalized = tiers.map((t, i) => ({
    tier_id: t.tier_id === undefined ? null : intField(t.tier_id, `tiers[${i}].tier_id`),
    name: text(t.tier_name ?? t.name, `tiers[${i}].tier_name`, { max: 50 }),
    price: intField(t.price_cents ?? t.price, `tiers[${i}].price_cents`, { min: 0 }),
  }));
  if (new Set(normalized.map((t) => t.name)).size !== normalized.length) throw bad('tiers', 'Price tier names must be unique');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const rows = await q(conn, 'SELECT performance_id, status FROM performances WHERE performance_id = ? FOR UPDATE', [performanceId]);
    if (!rows.length) throw new ApiError(404, 'NOT_FOUND', 'Performance not found');
    const existing = await q(conn, 'SELECT tier_id, tier_name FROM price_tiers WHERE performance_id = ?', [performanceId]);
    const byId = new Map(existing.map((r) => [toInt(r.tier_id), r]));
    const byName = new Map(existing.map((r) => [r.tier_name, r]));
    for (const t of normalized) {
      if (t.tier_id) {
        if (!byId.has(t.tier_id)) throw bad('tiers', `Unknown tier_id ${t.tier_id}`);
        await q(conn, 'UPDATE price_tiers SET tier_name = ?, current_price = ? WHERE tier_id = ?', [t.name, t.price, t.tier_id]);
      } else if (byName.has(t.name)) {
        await q(conn, 'UPDATE price_tiers SET current_price = ? WHERE tier_id = ?', [t.price, toInt(byName.get(t.name).tier_id)]);
      } else {
        await q(conn, 'INSERT INTO price_tiers (performance_id, tier_name, current_price, currency) VALUES (?, ?, ?, ?)', [performanceId, t.name, t.price, cfg.currency]);
      }
    }
    // Only update existing tiers or append new ones; do not delete tiers still referenced by seats
    const finalRows = await q(
      conn,
      'SELECT tier_id, tier_name, current_price, currency FROM price_tiers WHERE performance_id = ? ORDER BY current_price DESC, tier_id ASC',
      [performanceId]
    );
    await writeAudit(conn, {
      actorType: 'ADMIN',
      actorId,
      objectType: 'PERFORMANCE',
      objectId: performanceId,
      action: 'PRICE_TIERS_UPDATED',
      summary: `${normalized.length} tiers submitted`,
      requestId,
    });
    await conn.commit();
    return {
      performance_id: performanceId,
      price_tiers: finalRows.map((r) => ({
        tier_id: toInt(r.tier_id), tier_name: r.tier_name,
        price_cents: toInt(r.current_price), currency: r.currency,
      })),
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function setSessionSeatStatus({ sessionSeatId, status, requestId, actorId }) {
  if (!['BLOCKED', 'AVAILABLE'].includes(status)) throw bad('status', 'must be BLOCKED or AVAILABLE');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const rows = await q(conn, 'SELECT session_seat_id, performance_id, session_seat_status FROM session_seats WHERE session_seat_id = ? FOR UPDATE', [sessionSeatId]);
    if (!rows.length) throw new ApiError(404, 'NOT_FOUND', 'Performance seat not found');
    const seat = rows[0];
    if (!['AVAILABLE', 'BLOCKED'].includes(seat.session_seat_status)) {
      throw new ApiError(409, 'SEAT_NOT_EDITABLE', 'HELD or SOLD seats cannot be blocked or restored');
    }
    await q(conn, 'UPDATE session_seats SET session_seat_status = ? WHERE session_seat_id = ?', [status, sessionSeatId]);
    await writeAudit(conn, {
      actorType: 'ADMIN', actorId, objectType: 'SEAT', objectId: sessionSeatId,
      action: status === 'BLOCKED' ? 'SEAT_BLOCKED' : 'SEAT_AVAILABLE',
      summary: `${seat.session_seat_status}→${status}, performance ${seat.performance_id}`,
      requestId,
    });
    await conn.commit();
    return { session_seat_id: sessionSeatId, status };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function seatCountsFor(conn, performanceId) {
  const rows = await q(
    conn,
    `SELECT
       SUM(session_seat_status = 'AVAILABLE') AS available,
       SUM(session_seat_status = 'HELD') AS held,
       SUM(session_seat_status = 'SOLD') AS sold,
       SUM(session_seat_status = 'BLOCKED') AS blocked
     FROM session_seats WHERE performance_id = ?`,
    [performanceId]
  );
  const r = rows[0] || {};
  return {
    available: toInt(r.available), held: toInt(r.held),
    sold: toInt(r.sold), blocked: toInt(r.blocked),
  };
}

/**
 * API-42 bulk/region block or restore seats.
 * Provide either session_seat_ids[] or region (+row_no).
 * Only AVAILABLE/BLOCKED change; HELD/SOLD are skipped. Run in one transaction and write an audit entry.
 */
async function bulkSetSeatStatus({ performanceId, status, sessionSeatIds, region, rowNo, requestId, actorId }) {
  if (!['BLOCKED', 'AVAILABLE'].includes(status)) throw bad('status', 'must be BLOCKED or AVAILABLE');
  const hasIds = sessionSeatIds !== undefined && sessionSeatIds !== null;
  const hasRegion = region !== undefined && region !== null && String(region).trim() !== '';
  if (hasIds === hasRegion) throw bad('selector', 'provide either session_seat_ids or region, not both');

  let ids = null;
  let regionText = null;
  let rowText = null;
  if (hasIds) {
    if (!Array.isArray(sessionSeatIds) || sessionSeatIds.length < 1 || sessionSeatIds.length > 1000) {
      throw bad('session_seat_ids', 'must be an array of 1–1000 items');
    }
    ids = [...new Set(sessionSeatIds.map((v, i) => intField(v, `session_seat_ids[${i}]`)))];
  } else {
    regionText = text(region, 'region', { max: 50 });
    if (rowNo !== undefined && rowNo !== null && String(rowNo).trim() !== '') {
      rowText = text(rowNo, 'row_no', { max: 10 });
    }
  }

  const targetOld = status === 'BLOCKED' ? 'AVAILABLE' : 'BLOCKED';
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const perf = await q(conn, 'SELECT performance_id FROM performances WHERE performance_id = ? FOR UPDATE', [performanceId]);
    if (!perf.length) throw new ApiError(404, 'NOT_FOUND', 'Performance not found');

    let rows;
    if (ids) {
      rows = await q(
        conn,
        `SELECT session_seat_id, session_seat_status FROM session_seats
          WHERE performance_id = ? AND session_seat_id IN (${ids.map(() => '?').join(',')})
          FOR UPDATE`,
        [performanceId, ...ids]
      );
      if (rows.length !== ids.length) throw bad('session_seat_ids', 'Contains seats that do not belong to this performance');
    } else {
      rows = await q(
        conn,
        `SELECT ss.session_seat_id, ss.session_seat_status
           FROM session_seats ss
           JOIN seats s ON s.seat_id = ss.seat_id
          WHERE ss.performance_id = ? AND s.region = ? ${rowText ? 'AND s.row_no = ?' : ''}
          FOR UPDATE`,
        [performanceId, regionText, ...(rowText ? [rowText] : [])]
      );
      if (!rows.length) throw bad('region', 'No seats in this region');
    }

    const changed = rows.filter((r) => r.session_seat_status === targetOld).map((r) => toInt(r.session_seat_id));
    if (changed.length) {
      await q(
        conn,
        `UPDATE session_seats SET session_seat_status = ?
          WHERE session_seat_id IN (${changed.map(() => '?').join(',')})`,
        [status, ...changed]
      );
      await writeAudit(conn, {
        actorType: 'ADMIN', actorId, objectType: 'PERFORMANCE', objectId: performanceId,
        action: status === 'BLOCKED' ? 'SEATS_BLOCKED' : 'SEATS_AVAILABLE',
        summary: `${changed.length} seats → ${status}${regionText ? `, region ${regionText}${rowText ? ` row ${rowText}` : ''}` : ''}`,
        requestId,
      });
    }
    const counts = await seatCountsFor(conn, performanceId);
    await conn.commit();
    return {
      performance_id: performanceId,
      status,
      updated: changed.length,
      skipped: rows.length - changed.length,
      requested: rows.length,
      seat_counts: counts,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ---------------------------------------------------------------- check-in

async function isAdmin(roles) {
  return (roles || []).includes('ADMIN');
}

async function assertPerformanceAccess(userId, roles, performanceId) {
  if (await isAdmin(roles)) return true;
  const rows = await q(
    query,
    `SELECT 1 FROM role_assignments
      WHERE user_id = ? AND role = 'CHECKER' AND performance_id = ? AND revoked_at IS NULL LIMIT 1`,
    [userId, performanceId]
  );
  if (!rows.length) throw new ApiError(403, 'FORBIDDEN', 'You are not authorized to check in this performance');
  return true;
}

async function checkerPerformances({ userId, roles }) {
  const admin = await isAdmin(roles);
  const params = [];
  let where = "p.status <> 'DRAFT'";
  if (!admin) {
    where += ' AND EXISTS (SELECT 1 FROM role_assignments ra WHERE ra.user_id = ? AND ra.role = \'CHECKER\' AND ra.performance_id = p.performance_id AND ra.revoked_at IS NULL)';
    params.push(userId);
  }
  const rows = await q(
    query,
    `SELECT p.performance_id, e.name AS event_name, v.name AS venue_name, p.starts_at,
            p.checkin_start_at, p.checkin_end_at, p.status,
            (SELECT COUNT(*) FROM checkins c JOIN tickets t ON t.ticket_id = c.ticket_id
              JOIN order_items oi ON oi.order_item_id = t.order_item_id
              JOIN orders o ON o.order_id = oi.order_id
             WHERE o.performance_id = p.performance_id) AS checked_in_count
       FROM performances p
       JOIN events e ON e.event_id = p.event_id
       JOIN venues v ON v.venue_id = p.venue_id
      WHERE ${where}
      ORDER BY p.starts_at ASC, p.performance_id ASC`,
    params
  );
  return {
    items: rows.map((r) => ({
      performance_id: toInt(r.performance_id),
      event_name: r.event_name,
      venue_name: r.venue_name,
      starts_at: isoOrNull(r.starts_at),
      checkin_start_at: isoOrNull(r.checkin_start_at),
      checkin_end_at: isoOrNull(r.checkin_end_at),
      status: r.status,
      checked_in_count: toInt(r.checked_in_count),
    })),
    total: rows.length,
  };
}

function resolveTicketCode(code) {
  const raw = String(code || '').trim();
  if (!raw) throw new ApiError(400, 'VALIDATION_ERROR', 'ticket_code is required');
  if (/^[0-9a-f]{64}$/i.test(raw)) return { hash: raw.toLowerCase() };
  try {
    const payload = jwt.verify(raw, cfg.jwt.secret);
    if (payload.typ !== 'TICKET_QR' || !payload.tid) throw new Error('wrong token');
    return { ticketId: toInt(payload.tid) };
  } catch {
    throw new ApiError(404, 'TICKET_INVALID', 'Invalid ticket code or expired QR code');
  }
}

async function checkin({ ticketCode, performanceId, userId, roles, requestId }) {
  await assertPerformanceAccess(userId, roles, performanceId);
  const resolved = resolveTicketCode(ticketCode);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const perfRows = await q(
      conn,
      'SELECT performance_id, checkin_start_at, checkin_end_at, status FROM performances WHERE performance_id = ? FOR UPDATE',
      [performanceId]
    );
    if (!perfRows.length) throw new ApiError(404, 'NOT_FOUND', 'Performance not found');
    const perf = perfRows[0];
    const nowRows = await q(conn, 'SELECT UTC_TIMESTAMP(3) AS now');
    const now = nowRows[0].now;
    if (!(now >= perf.checkin_start_at && now < perf.checkin_end_at)) {
      throw new ApiError(409, 'OUT_OF_WINDOW', 'Outside the check-in window for this performance', {
        checkin_start_at: isoOrNull(perf.checkin_start_at),
        checkin_end_at: isoOrNull(perf.checkin_end_at),
      });
    }

    const ticketRows = resolved.hash
      ? await q(conn, 'SELECT ticket_id FROM tickets WHERE ticket_code_hash = ?', [resolved.hash])
      : await q(conn, 'SELECT ticket_id FROM tickets WHERE ticket_id = ?', [resolved.ticketId]);
    if (!ticketRows.length) throw new ApiError(404, 'TICKET_INVALID', 'Ticket not found');
    const ticket = await q(
      conn,
      `SELECT t.ticket_id, t.status, oi.order_id, o.status AS order_status, o.performance_id,
              s.region, s.row_no, s.seat_no, p.starts_at
         FROM tickets t
         JOIN order_items oi ON oi.order_item_id = t.order_item_id
         JOIN orders o ON o.order_id = oi.order_id
         JOIN session_seats ss ON ss.session_seat_id = oi.session_seat_id
         JOIN seats s ON s.seat_id = ss.seat_id
         JOIN performances p ON p.performance_id = o.performance_id
        WHERE t.ticket_id = ? FOR UPDATE`,
      [toInt(ticketRows[0].ticket_id)]
    );
    const t = ticket[0];
    if (toInt(t.performance_id) !== Number(performanceId)) {
      throw new ApiError(409, 'WRONG_PERFORMANCE', 'This ticket does not belong to the current performance');
    }
    if (t.status === 'USED') {
      const prior = await q(
        conn,
        `SELECT c.checked_in_at, u.display_name, u.user_name
           FROM checkins c JOIN users u ON u.user_id = c.checker_id
          WHERE c.ticket_id = ?`,
        [toInt(t.ticket_id)]
      );
      throw new ApiError(409, 'TICKET_ALREADY_USED', 'This ticket has already been checked in', {
        checked_in_at: prior.length ? isoOrNull(prior[0].checked_in_at) : null,
        checker_name: prior.length ? (prior[0].display_name || prior[0].user_name) : null,
      });
    }
    if (t.status !== 'VALID' || ['REFUND_PENDING', 'REFUNDED'].includes(t.order_status)) {
      throw new ApiError(409, 'TICKET_INVALID', 'The ticket is not in a check-in-eligible state');
    }

    await q(conn, "UPDATE tickets SET status = 'USED' WHERE ticket_id = ?", [toInt(t.ticket_id)]);
    await q(conn, 'INSERT INTO checkins (ticket_id, checker_id) VALUES (?, ?)', [toInt(t.ticket_id), userId]);
    const checkedAt = (await q(conn, 'SELECT checked_in_at FROM checkins WHERE ticket_id = ?', [toInt(t.ticket_id)]))[0];
    await writeAudit(conn, {
      actorType: (roles || []).includes('ADMIN') ? 'ADMIN' : 'CHECKER',
      actorId: userId,
      objectType: 'TICKET',
      objectId: toInt(t.ticket_id),
      action: 'TICKET_CHECKED_IN',
      summary: `VALID→USED, performance ${performanceId}, seat ${seatLabel(t)}`,
      requestId,
    });
    await conn.commit();
    return {
      result: 'OK',
      ticket_id: toInt(t.ticket_id),
      seat_label: seatLabel(t),
      checked_at: isoOrNull(checkedAt.checked_in_at),
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function listCheckins({ userId, roles, performanceId, dateFrom, dateTo, page, pageSize, offset }) {
  const conds = [];
  const params = [];
  if (!(await isAdmin(roles))) {
    conds.push(`EXISTS (SELECT 1 FROM role_assignments ra
      WHERE ra.user_id = ? AND ra.role = 'CHECKER' AND ra.performance_id = o.performance_id AND ra.revoked_at IS NULL)`);
    params.push(userId);
  }
  if (performanceId !== undefined) {
    conds.push('o.performance_id = ?');
    params.push(performanceId);
  }
  if (dateFrom) {
    conds.push('DATE(c.checked_in_at + INTERVAL 8 HOUR) >= ?');
    params.push(dateFrom);
  }
  if (dateTo) {
    conds.push('DATE(c.checked_in_at + INTERVAL 8 HOUR) <= ?');
    params.push(dateTo);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const base = `
    FROM checkins c
    JOIN tickets t ON t.ticket_id = c.ticket_id
    JOIN order_items oi ON oi.order_item_id = t.order_item_id
    JOIN orders o ON o.order_id = oi.order_id
    JOIN performances p ON p.performance_id = o.performance_id
    JOIN events e ON e.event_id = p.event_id
    JOIN session_seats ss ON ss.session_seat_id = oi.session_seat_id
    JOIN seats s ON s.seat_id = ss.seat_id
    JOIN users u ON u.user_id = c.checker_id
    ${where}`;
  const count = await q(query, `SELECT COUNT(*) AS total ${base}`, params);
  const rows = await q(
    query,
    `SELECT c.checkin_id, c.ticket_id, c.checked_in_at, u.display_name, u.user_name,
            e.name AS event_name, p.performance_id, s.region, s.row_no, s.seat_no
       ${base}
      ORDER BY c.checked_in_at DESC, c.checkin_id DESC
      LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  return {
    items: rows.map((r) => ({
      checkin_id: toInt(r.checkin_id),
      ticket_id: toInt(r.ticket_id),
     performance_id: toInt(r.performance_id),
      event_name: r.event_name,
      seat_label: seatLabel(r),
      checked_at: isoOrNull(r.checked_in_at),
      checked_by: r.display_name || r.user_name,
      result: 'OK',
    })),
    page,
    page_size: pageSize,
    total: toInt(count[0] && count[0].total),
  };
}

// ---------------------------------------------------------------- stats & finance

async function salesStats({ performanceId, dateFrom, dateTo }) {
  const conds = [];
  const params = [];
  if (performanceId !== undefined) {
    conds.push('p.performance_id = ?');
    params.push(performanceId);
  }
  if (dateFrom) {
    conds.push('DATE(p.starts_at + INTERVAL 8 HOUR) >= ?');
    params.push(dateFrom);
  }
  if (dateTo) {
    conds.push('DATE(p.starts_at + INTERVAL 8 HOUR) <= ?');
    params.push(dateTo);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const rows = await q(
    query,
    `SELECT p.performance_id, e.name AS event_name, v.name AS venue_name, p.starts_at, p.status,
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
       ${where}
      ORDER BY p.starts_at ASC, p.performance_id ASC`,
    params
  );
  const items = rows.map((r) => ({
    performance_id: toInt(r.performance_id),
    event_name: r.event_name,
    venue_name: r.venue_name,
    starts_at: isoOrNull(r.starts_at),
    status: r.status,
    seats: {
      available: toInt(r.available), held: toInt(r.held),
      sold: toInt(r.sold), blocked: toInt(r.blocked),
    },
    tickets_sold: toInt(r.tickets_sold),
    checked_in: toInt(r.checked_in),
    gross_cents: toInt(r.gross),
    refunded_cents: toInt(r.refunded),
    net_cents: toInt(r.gross) - toInt(r.refunded),
  }));
  const total = items.reduce((acc, x) => ({
    available: acc.available + x.seats.available,
    held: acc.held + x.seats.held,
    sold: acc.sold + x.seats.sold,
    blocked: acc.blocked + x.seats.blocked,
    tickets_sold: acc.tickets_sold + x.tickets_sold,
    checked_in: acc.checked_in + x.checked_in,
    gross_cents: acc.gross_cents + x.gross_cents,
    refunded_cents: acc.refunded_cents + x.refunded_cents,
    net_cents: acc.net_cents + x.net_cents,
  }), { available: 0, held: 0, sold: 0, blocked: 0, tickets_sold: 0, checked_in: 0, gross_cents: 0, refunded_cents: 0, net_cents: 0 });
  return { items, total };
}

async function adminOrders({ status, performanceId, dateFrom, dateTo, keyword, page, pageSize, offset }) {
  const conds = [];
  const params = [];
  if (status) {
    if (!['PENDING_PAYMENT','PAID','CANCELLED','EXPIRED','REFUND_PENDING','REFUNDED'].includes(status)) throw bad('status');
    conds.push('o.status = ?');
    params.push(status);
  }
  if (performanceId !== undefined) { conds.push('o.performance_id = ?'); params.push(performanceId); }
  if (dateFrom) { conds.push('DATE(p.starts_at + INTERVAL 8 HOUR) >= ?'); params.push(dateFrom); }
  if (dateTo) { conds.push('DATE(p.starts_at + INTERVAL 8 HOUR) <= ?'); params.push(dateTo); }
  if (keyword) {
    const tix = /^TIX-\d{8}-(\d{6})$/.exec(keyword);
    if (tix) {
      conds.push('o.order_id = ?');
      params.push(Number(tix[1]));
    } else {
      conds.push('(u.user_name LIKE ? OR IFNULL(u.display_name,\'\') LIKE ?)');
      const like = `%${keyword}%`;
      params.push(like, like);
    }
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const base = `
    FROM orders o
    JOIN users u ON u.user_id = o.user_id
    JOIN performances p ON p.performance_id = o.performance_id
    JOIN events e ON e.event_id = p.event_id
    JOIN venues v ON v.venue_id = p.venue_id
    ${where}`;
  const count = await q(query, `SELECT COUNT(*) AS total ${base}`, params);
  const rows = await q(
    query,
    `SELECT o.order_id, o.created_at, o.status, o.total_amount, o.currency,
            o.performance_id, u.user_name, u.display_name,
            e.name AS event_name, v.name AS venue_name, p.starts_at,
            (SELECT pa.result FROM payment_attempts pa WHERE pa.order_id = o.order_id ORDER BY pa.attempt_id DESC LIMIT 1) AS payment_result,
            (SELECT r.status FROM refunds r WHERE r.order_id = o.order_id ORDER BY r.refund_id DESC LIMIT 1) AS refund_status
       ${base}
      ORDER BY o.created_at DESC, o.order_id DESC
      LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  return {
    items: rows.map((r) => ({
      order_id: toInt(r.order_id),
      order_no: orderNo(toInt(r.order_id), r.created_at),
      buyer: r.display_name || r.user_name,
      user_name: r.user_name,
      performance_id: toInt(r.performance_id),
      event_name: r.event_name,
      venue_name: r.venue_name,
      starts_at: isoOrNull(r.starts_at),
      status: r.status,
      total_amount_cents: toInt(r.total_amount),
      currency: r.currency,
      payment_status: r.payment_result || 'NONE',
      refund_status: r.refund_status || null,
      created_at: isoOrNull(r.created_at),
    })),
    page, page_size: pageSize, total: toInt(count[0] && count[0].total),
  };
}

async function listRefunds({ status, orderId, page, pageSize, offset }) {
  const conds = [];
  const params = [];
  if (status) {
    if (!['PENDING','SUCCEEDED','FAILED'].includes(status)) throw bad('status');
    conds.push('r.status = ?'); params.push(status);
  }
  if (orderId !== undefined) { conds.push('r.order_id = ?'); params.push(orderId); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const base = `
    FROM refunds r
    JOIN orders o ON o.order_id = r.order_id
    JOIN payment_attempts pa ON pa.attempt_id = r.payment_attempt_id
    ${where}`;
  const count = await q(query, `SELECT COUNT(*) AS total ${base}`, params);
  const rows = await q(
    query,
    `SELECT r.refund_id, r.order_id, o.created_at, r.amount, pa.currency, r.status, r.reason, r.created_at AS refund_created_at, r.updated_at
       ${base}
      ORDER BY r.created_at DESC, r.refund_id DESC
      LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  return {
    items: rows.map((r) => ({
      refund_id: toInt(r.refund_id), order_id: toInt(r.order_id),
      order_no: orderNo(toInt(r.order_id), r.created_at),
      amount_cents: toInt(r.amount), status: r.status, reason: r.reason,
      created_at: isoOrNull(r.refund_created_at), updated_at: isoOrNull(r.updated_at),
    })),
    page, page_size: pageSize, total: toInt(count[0] && count[0].total),
  };
}

async function paymentExceptions({ type, page, pageSize, offset }) {
  const attemptRows = await q(
    query,
    `SELECT pa.attempt_id, pa.amount, pa.currency, pa.result, pa.handling_category,
            pa.created_at, pa.updated_at, o.order_id, o.created_at AS order_created_at, o.status AS order_status
       FROM payment_attempts pa JOIN orders o ON o.order_id = pa.order_id`
  );
  const noticeRows = await q(
    query,
    `SELECT pn.notice_id, pn.notification_id, pn.processed_result, pn.processed_at, pn.received_at AS created_at,
            pa.attempt_id, pa.amount, o.order_id, o.created_at AS order_created_at
       FROM payment_notifications pn
       JOIN payment_attempts pa ON pa.attempt_id = pn.payment_attempt_id
       JOIN orders o ON o.order_id = pa.order_id`
  );
  const items = [];
  for (const a of attemptRows) {
    if (a.handling_category === 'AWAITING_REFUND') {
      items.push({
        type: 'late', payment_id: toInt(a.attempt_id),
        order_no: orderNo(toInt(a.order_id), a.order_created_at),
        amount_cents: toInt(a.amount), reason: 'LATE_PAYMENT',
        created_at: isoOrNull(a.created_at), last_checked_at: isoOrNull(a.updated_at),
      });
    }
    if (a.result === 'FAILED') {
      items.push({
        type: 'unknown', payment_id: toInt(a.attempt_id),
        order_no: orderNo(toInt(a.order_id), a.order_created_at),
        amount_cents: toInt(a.amount), reason: 'PAYMENT_FAILED_OR_UNKNOWN',
        created_at: isoOrNull(a.created_at), last_checked_at: isoOrNull(a.updated_at),
      });
    }
  }
  for (const n of noticeRows) {
    if (n.processed_result === 'REJECTED') {
      items.push({
        type: 'mismatch', payment_id: toInt(n.attempt_id),
        order_no: orderNo(toInt(n.order_id), n.order_created_at),
        amount_cents: toInt(n.amount), reason: `NOTIFICATION_${n.notification_id}_REJECTED`,
        created_at: isoOrNull(n.created_at), last_checked_at: isoOrNull(n.processed_at),
      });
    } else if (n.processed_result === 'PENDING') {
      items.push({
        type: 'unprocessed', payment_id: toInt(n.attempt_id),
        order_no: orderNo(toInt(n.order_id), n.order_created_at),
        amount_cents: toInt(n.amount), reason: `NOTIFICATION_${n.notification_id}_PENDING`,
        created_at: isoOrNull(n.created_at), last_checked_at: isoOrNull(n.processed_at),
      });
    }
  }
  const filtered = type ? items.filter((x) => x.type === type) : items;
  filtered.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const total = filtered.length;
  return { items: filtered.slice(offset, offset + pageSize), page, page_size: pageSize, total };
}

async function reconcilePayment({ paymentId, requestId, actorId }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const rows = await q(
      conn,
      `SELECT pa.attempt_id, pa.result, pa.handling_category, o.status AS order_status
         FROM payment_attempts pa JOIN orders o ON o.order_id = pa.order_id
        WHERE pa.attempt_id = ? FOR UPDATE`,
      [paymentId]
    );
    if (!rows.length) throw new ApiError(404, 'NOT_FOUND', 'Payment attempt not found');
    const p = rows[0];
    const result = p.result === 'SUCCEEDED' ? 'APPLIED' : (p.result === 'FAILED' ? 'FAILED' : 'STILL_UNKNOWN');
    await writeAudit(conn, {
      actorType: 'ADMIN', actorId, objectType: 'PAYMENT', objectId: paymentId,
      action: 'PAYMENT_RECONCILED', summary: `result=${p.result}, order=${p.order_status}, reconcile=${result}`,
      requestId,
    });
    await conn.commit();
    return { result, payment_status: p.result };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function auditLogs({ objectType, objectId, action, dateFrom, dateTo, page, pageSize, offset }) {
  const conds = [];
  const params = [];
  if (objectType) {
    if (!['ORDER','PAYMENT','REFUND','TICKET','ROLE','USER','SEAT','EVENT','PERFORMANCE'].includes(objectType)) throw bad('object_type');
    conds.push('a.object_type = ?'); params.push(objectType);
  }
  if (objectId !== undefined) { conds.push('a.object_id = ?'); params.push(objectId); }
  if (action) { conds.push('a.action = ?'); params.push(action); }
  if (dateFrom) { conds.push('DATE(a.occurred_at + INTERVAL 8 HOUR) >= ?'); params.push(dateFrom); }
  if (dateTo) { conds.push('DATE(a.occurred_at + INTERVAL 8 HOUR) <= ?'); params.push(dateTo); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const base = `FROM audit_logs a LEFT JOIN users u ON u.user_id = a.actor_id ${where}`;
  const count = await q(query, `SELECT COUNT(*) AS total ${base}`, params);
  const rows = await q(
    query,
    `SELECT a.log_id, a.occurred_at, a.actor_type, a.actor_id, u.display_name, u.user_name,
            a.object_type, a.object_id, a.action, a.state_summary, a.request_id
       ${base}
      ORDER BY a.occurred_at DESC, a.log_id DESC
      LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  return {
    items: rows.map((r) => ({
      log_id: toInt(r.log_id),
      occurred_at: isoOrNull(r.occurred_at),
      actor_type: r.actor_type,
      actor_display: r.actor_type === 'SYSTEM' ? 'SYSTEM' : (r.display_name || r.user_name || `#${r.actor_id}`),
      object_type: r.object_type,
      object_id: r.object_id === null ? null : toInt(r.object_id),
      action: r.action,
      result: r.state_summary,
      request_id: r.request_id,
    })),
    page, page_size: pageSize, total: toInt(count[0] && count[0].total),
  };
}

module.exports = {
  listVenues,
  listAdminEvents, createEvent, updateEvent,
  listAdminPerformances, getAdminPerformance, createPerformance, updatePerformance, publishPerformance, setSales,
  updatePriceTiers, setSessionSeatStatus, bulkSetSeatStatus,
  checkerPerformances, checkin, listCheckins,
  salesStats, adminOrders, listRefunds, paymentExceptions, reconcilePayment, auditLogs,
};
