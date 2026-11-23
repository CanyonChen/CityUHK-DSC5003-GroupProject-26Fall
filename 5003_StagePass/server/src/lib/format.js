'use strict';

function toIso(value) {
  if (value === null || value === undefined) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function toInt(value) {
  return value === null || value === undefined ? 0 : Number(value);
}

/** Display order number: TIX-YYYYMMDD-###### (HKT date + 6-digit sequence, not stored) */
function orderNo(orderId, createdAt) {
  const d = createdAt instanceof Date ? createdAt : new Date(createdAt || Date.now());
  const hkt = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  const ymd = hkt.toISOString().slice(0, 10).replace(/-/g, '');
  return `TIX-${ymd}-${String(orderId).padStart(6, '0')}`;
}

function seatLabel(row) {
  return `${row.region}-${row.row_no}-${row.seat_no}`;
}

module.exports = { toIso, toInt, orderNo, seatLabel };
