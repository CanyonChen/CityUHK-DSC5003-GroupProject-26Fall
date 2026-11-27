'use strict';

// With the local demo database running and server dependencies installed:
// node scripts/export_pages_snapshot.js
const fs = require('node:fs/promises');
const path = require('node:path');
const catalog = require('../server/src/services/catalog');
const { regionOccupancy } = require('../server/src/services/admin');
const db = require('../server/src/db');

const root = path.join(__dirname, '..');
const output = path.join(root, 'pages', 'data', 'snapshot.json');

async function listAll(list) {
  const items = [];
  const pageSize = 100;
  for (let page = 1; ; page += 1) {
    const batch = await list({ page, pageSize, offset: (page - 1) * pageSize });
    items.push(...batch.items);
    if (items.length >= batch.total || !batch.items.length) return items;
  }
}

async function exportEvent(summary) {
  const event = await catalog.getEvent(summary.event_id);
  const localPoster = /^\/media\/([\w-]+\.svg)$/.exec(summary.cover_url || '');
  if (localPoster) await fs.access(path.join(root, 'web-user', 'public', 'media', localPoster[1]));
  return {
    id: event.event_id,
    title: event.name,
    description: event.description,
    organizer: event.organizer,
    poster: localPoster ? './media/' + localPoster[1] : null,
  };
}

async function exportPerformance(performance) {
  const map = await catalog.getSeatMap(performance.performance_id, 0);
  const stats = await regionOccupancy(performance.performance_id);
  return {
    id: performance.performance_id,
    eventId: performance.event_id,
    venue: map.venue.name,
    startsAt: performance.starts_at,
    status: performance.status,
    layout: {
      rows: map.layout.row_count,
      columns: map.layout.col_count,
      aisles: map.layout.aisles || [],
      stage: map.layout.stage || null,
    },
    seats: map.seats.map(s => [
      s.region, Number(s.row_no), Number(s.seat_no), s.status, s.price_cents, s.tier_name,
    ]),
    regions: stats.regions.map(r => ({
      region: r.region,
      totalSeats: r.total_seats,
      blockedSeats: r.blocked_seats,
      sellableSeats: r.sellable_seats,
      ticketsSold: r.tickets_sold,
      checkedIn: r.checked_in,
      occupancyRate: r.sellable_seats ? r.occupancy_rate / 100 : null,
      attendanceRate: r.tickets_sold ? r.attendance_rate / 100 : null,
    })),
  };
}

async function main() {
  const advertised = await listAll(catalog.listEvents);
  if (!advertised.length) throw new Error('No advertised events in the demo database.');
  const events = await Promise.all(advertised.map(exportEvent));
  const eventIds = new Set(events.map(event => event.id));
  const performances = [];
  const currency = advertised[0].currency;
  for (const p of await listAll(catalog.listPerformances)) {
    if (!eventIds.has(p.event_id)) continue;
    if (p.currency !== currency) throw new Error('Snapshot expects a single display currency.');
    performances.push(await exportPerformance(p));
  }
  const snapshot = { capturedAt: new Date().toISOString(), currency, events, performances };
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(snapshot) + '\n', 'utf8');
  console.log(`Exported ${events.length} advertised events and ${performances.length} performances to ${output}`);
}

main().catch(err => { console.error(err.message); process.exitCode = 1; }).finally(() => db.close());
