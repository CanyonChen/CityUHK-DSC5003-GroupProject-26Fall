'use strict';

const { query } = require('../db');
const { ApiError } = require('../lib/http');
const cfg = require('../config');
const { toIso, toInt, seatLabel } = require('../lib/format');

function parseLayout(layoutJson) {
  if (!layoutJson) return {};
  if (typeof layoutJson === 'object') return layoutJson;
  try {
    return JSON.parse(layoutJson);
  } catch (err) {
    return {};
  }
}

function numeric(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function aislePositions(layout) {
  return new Set(
    (Array.isArray(layout.aisles) ? layout.aisles : [])
      .map((value) => numeric(value))
      .filter((value) => value !== null)
  );
}

/**
 * Group seats into physical, aisle-free runs. The explicit adjacent_group is the
 * first boundary; a seat-number gap or an aisle after the previous seat also
 * starts a new run. This keeps older seed data safe even when adjacent_group is
 * still row-wide.
 */
function contiguousRuns(seats, aisles) {
  const byGroup = new Map();
  for (const seat of seats) {
    const group = String(seat.adjacent_group || `${seat.region}-R${seat.row_no}`);
    if (!byGroup.has(group)) byGroup.set(group, []);
    byGroup.get(group).push(seat);
  }

  const runs = [];
  for (const [group, groupSeats] of byGroup) {
    groupSeats.sort(
      (a, b) => numeric(a.row_no) - numeric(b.row_no) || numeric(a.seat_no) - numeric(b.seat_no)
    );
    let run = [];
    let previous = null;
    let previousRow = null;
    for (const seat of groupSeats) {
      const seatNo = numeric(seat.seat_no);
      const rowNo = numeric(seat.row_no);
      if (seatNo === null || rowNo === null) continue;
      const separated =
        previous !== null &&
        (rowNo !== previousRow || seatNo !== previous + 1 || aisles.has(previous));
      if (separated && run.length) {
        runs.push({ group, seats: run });
        run = [];
      }
      run.push(seat);
      previous = seatNo;
      previousRow = rowNo;
    }
    if (run.length) runs.push({ group, seats: run });
  }
  return runs;
}

function regionCenter(seats, region) {
  const inRegion = seats
    .filter((seat) => seat.region === region)
    .map((seat) => ({ row: numeric(seat.row_no), seat: numeric(seat.seat_no) }))
    .filter((seat) => seat.row !== null && seat.seat !== null);
  if (!inRegion.length) return null;
  const total = inRegion.reduce(
    (acc, seat) => ({ row: acc.row + seat.row, seat: acc.seat + seat.seat }),
    { row: 0, seat: 0 }
  );
  return {
    row: total.row / inRegion.length,
    seat: total.seat / inRegion.length,
  };
}

function money(cents, currency) {
  return `${currency} ${(cents / 100).toFixed(2)}`;
}

function recommendationFromWindow({ seats, group, center, currency, partySize }) {
  const first = seats[0];
  const last = seats[seats.length - 1];
  const total = seats.reduce((sum, seat) => sum + toInt(seat.price_cents), 0);
  const avgRow =
    seats.reduce((sum, seat) => sum + numeric(seat.row_no), 0) / seats.length;
  const avgSeat =
    seats.reduce((sum, seat) => sum + numeric(seat.seat_no), 0) / seats.length;
  const distance = center
    ? Math.sqrt((avgRow - center.row) ** 2 + (avgSeat - center.seat) ** 2)
    : Number.POSITIVE_INFINITY;

  return {
    seats: seats.map((seat) => ({
      session_seat_id: toInt(seat.session_seat_id),
      seat_label: seatLabel(seat),
      region: seat.region,
      row_no: String(seat.row_no),
      seat_no: String(seat.seat_no),
      price_cents: toInt(seat.price_cents),
      tier_name: seat.tier_name,
    })),
    total_amount_cents: total,
    currency,
    adjacent_group: group,
    distance_to_region_center: Number.isFinite(distance)
      ? Number(distance.toFixed(2))
      : null,
    reason: `Same row ${first.row_no}, seats ${first.seat_no}-${last.seat_no}: one aisle-free block of ${partySize}; total ${money(total, currency)}.`,
    recommended: true,
  };
}

function rankRecommendations(seats, { partySize, region, budgetCents, limit, layout, currency }) {
  const aisles = aislePositions(layout);
  const center = regionCenter(seats, region);
  const candidates = [];

  for (const run of contiguousRuns(seats, aisles)) {
    if (run.seats.length < partySize) continue;
    for (let i = 0; i <= run.seats.length - partySize; i += 1) {
      const window = run.seats.slice(i, i + partySize);
      if (window.some((seat) => seat.status !== 'AVAILABLE')) continue;
      if (window.some((seat) => String(seat.region) !== String(region))) continue;
      if (budgetCents !== null) {
        const total = window.reduce((sum, seat) => sum + toInt(seat.price_cents), 0);
        if (total > budgetCents) continue;
      }
      candidates.push(
        recommendationFromWindow({
          seats: window,
          group: run.group,
          center,
          currency,
          partySize,
        })
      );
    }
  }

  candidates.sort((a, b) => {
    const da = a.distance_to_region_center === null ? Infinity : a.distance_to_region_center;
    const db = b.distance_to_region_center === null ? Infinity : b.distance_to_region_center;
    if (da !== db) return da - db;
    if (a.total_amount_cents !== b.total_amount_cents) {
      return a.total_amount_cents - b.total_amount_cents;
    }
    const firstA = Number(a.seats[0].seat_no);
    const firstB = Number(b.seats[0].seat_no);
    if (firstA !== firstB) return firstA - firstB;
    return a.adjacent_group.localeCompare(b.adjacent_group);
  });

  return {
    total: candidates.length,
    items: candidates.slice(0, limit),
  };
}

async function recommendAdjacentSeats({ performanceId, partySize, region, budgetCents, limit }) {
  const perfRows = await query(
    `SELECT p.performance_id, p.venue_id, p.status, p.sale_start_at, p.sale_end_at,
            (p.status = 'PUBLISHED'
             AND UTC_TIMESTAMP(3) >= p.sale_start_at
             AND UTC_TIMESTAMP(3) < p.sale_end_at) AS sale_open,
            v.layout_json
       FROM performances p
       JOIN venues v ON v.venue_id = p.venue_id
      WHERE p.performance_id = ? AND p.status <> 'DRAFT'`,
    [performanceId]
  );
  if (!perfRows.length) {
    throw new ApiError(404, 'NOT_FOUND', 'Performance not found');
  }
  const perf = perfRows[0];
  if (!perf.sale_open) {
    throw new ApiError(409, 'SALE_CLOSED', 'This performance is not on sale');
  }

  const seats = await query(
    `SELECT ss.session_seat_id, s.region, s.row_no, s.seat_no, s.coordinates,
            ss.session_seat_status AS status,
            pt.tier_name, pt.current_price AS price_cents, pt.currency,
            COALESCE(NULLIF(s.adjacent_group, ''), CONCAT(s.region, '-R', s.row_no)) AS adjacent_group
       FROM session_seats ss
       JOIN seats s ON s.seat_id = ss.seat_id
       JOIN price_tiers pt ON pt.tier_id = ss.tier_id
      WHERE ss.performance_id = ?
      ORDER BY s.region ASC, CAST(s.row_no AS UNSIGNED) ASC, CAST(s.seat_no AS UNSIGNED) ASC`,
    [performanceId]
  );

  const layout = parseLayout(perf.layout_json);
  const currency = (seats[0] && seats[0].currency) || cfg.currency;
  const ranked = rankRecommendations(seats, {
    partySize,
    region,
    budgetCents,
    limit,
    layout,
    currency,
  });

  return {
    performance_id: toInt(perf.performance_id),
    party_size: partySize,
    region,
    budget_cents: budgetCents,
    currency,
    sale_open: true,
    recommendations: ranked.items,
    total: ranked.total,
    returned: ranked.items.length,
    limit,
    reservation_note: 'Recommendations do not reserve seats; checkout rechecks the whole group atomically.',
    ranking: 'distance to region centre, then total price, then first seat number',
  };
}

module.exports = { recommendAdjacentSeats, contiguousRuns, rankRecommendations };
