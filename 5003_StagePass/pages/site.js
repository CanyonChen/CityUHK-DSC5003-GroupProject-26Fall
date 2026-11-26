const get = (id) => document.getElementById(id);
const date = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Hong_Kong', day: 'numeric', month: 'short', year: 'numeric',
});
const dateTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Hong_Kong', day: 'numeric', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hour12: false,
});
const percentage = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 2 });
const currency = new Intl.NumberFormat('en-HK', {
  style: 'currency', currency: 'HKD', minimumFractionDigits: 0, maximumFractionDigits: 2,
});
const seatStatus = { AVAILABLE: 'Available', HELD: 'On hold', SOLD: 'Sold', BLOCKED: 'Blocked' };
const performanceStatus = { SALES_PAUSED: 'Sales paused', FINISHED: 'Finished', PUBLISHED: 'Published' };
let snapshot;
let performances = [];
let performance;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderProgramme() {
  get('snapshot-note').textContent = 'Read-only demo snapshot · ' + date.format(new Date(snapshot.capturedAt));
  for (const event of snapshot.events) {
    const button = element('button', 'event-card');
    button.type = 'button';
    button.dataset.id = event.id;
    button.setAttribute('aria-controls', 'seating');
    const img = element('img');
    img.src = event.poster;
    img.alt = '';
    img.loading = 'lazy';
    img.width = 1600;
    img.height = 900;
    const count = snapshot.performances.filter((show) => show.eventId === event.id).length;
    const text = element('span', 'card-text');
    text.append(element('span', 'card-title', event.title),
      element('span', 'card-meta', count === 1 ? '1 performance' : count + ' performances'));
    button.append(img, text);
    button.addEventListener('click', () => {
      selectEvent(event);
      get('detail-title').focus({ preventScroll: true });
      get('seating').scrollIntoView({ block: 'start' });
    });
    get('event-list').append(button);
  }
  if (snapshot.events.length) selectEvent(snapshot.events[0]);
}

function selectEvent(event) {
  get('seating').hidden = false;
  for (const card of get('event-list').children) {
    card.setAttribute('aria-pressed', String(card.dataset.id === String(event.id)));
  }
  get('detail-title').textContent = event.title;
  get('description').textContent = event.description;
  performances = snapshot.performances.filter((show) => show.eventId === event.id)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  get('no-performance').hidden = performances.length > 0;
  get('performance-detail').hidden = !performances.length;
  if (!performances.length) return;
  const select = get('performance-select');
  select.replaceChildren();
  for (const show of performances) {
    const label = [dateTime.format(new Date(show.startsAt)), show.venue, performanceStatus[show.status]].join(' · ');
    select.add(new Option(label, show.id));
  }
  const first = performances.find((show) => show.startsAt >= snapshot.capturedAt) || performances.at(-1);
  select.value = first.id;
  selectPerformance();
}

function selectPerformance() {
  performance = performances.find((show) => String(show.id) === get('performance-select').value);
  const regions = get('section-select');
  regions.replaceChildren();
  for (const { region } of performance.regions) regions.add(new Option('Section ' + region, region));
  renderSeats();
  renderOccupancy();
}

function renderOccupancy() {
  const container = get('occupancy');
  container.replaceChildren();
  for (const region of performance.regions) {
    const entry = element('div', 'region-item');
    const head = element('div', 'region-head');
    const rate = region.occupancyRate;
    head.append(element('strong', '', 'Section ' + region.region),
      element('span', '', rate == null ? '—' : percentage.format(rate)));
    const meter = element('div', 'meter');
    meter.setAttribute('aria-hidden', 'true');
    const fill = element('span');
    fill.style.width = Math.max(0, Math.min(rate ?? 0, 1)) * 100 + '%';
    meter.append(fill);
    const text = region.ticketsSold + ' sold / ' + region.sellableSeats + ' sellable · '
      + region.checkedIn + ' checked in';
    entry.append(head, meter, element('p', 'region-detail', text));
    container.append(entry);
  }
}

function seatLabel([region, row, number, status, cents, tier]) {
  return ['Section ' + region, 'row ' + row, 'seat ' + number, seatStatus[status], tier,
    currency.format(cents / 100)].join(' · ');
}

function inspectSeat(button) {
  const seatMap = get('seat-map');
  const previous = seatMap.querySelector('button[tabindex="0"]');
  if (previous) {
    previous.tabIndex = -1;
    previous.setAttribute('aria-pressed', 'false');
  }
  button.tabIndex = 0;
  button.setAttribute('aria-pressed', 'true');
  get('seat-detail').textContent = button.title;
}

function renderSeats() {
  const seats = performance.seats.filter(([region]) => region === get('section-select').value)
    .sort((a, b) => a[1] - b[1] || a[2] - b[2]);
  const seatMap = get('seat-map');
  seatMap.replaceChildren();
  let row, lastRow;
  seats.forEach((seat, index) => {
    const [, rowNo, number, status] = seat;
    if (rowNo !== lastRow) {
      row = element('div', 'seat-row');
      row.append(element('span', 'row-no', 'Row ' + rowNo));
      seatMap.append(row);
      lastRow = rowNo;
    }
    const button = element('button', 'seat ' + status.toLowerCase(), number);
    button.type = 'button';
    button.title = seatLabel(seat);
    button.setAttribute('aria-label', button.title);
    button.setAttribute('aria-pressed', 'false');
    button.tabIndex = index ? -1 : 0;
    row.append(button);
  });
  get('seat-count').textContent = seats.length + ' seats';
  get('seat-detail').textContent = seats.length
    ? 'Select a seat to inspect its status and ticket price. Use arrow keys to move between seats.'
    : 'No seats in this section.';
}

get('seat-map').addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (button) inspectSeat(button);
});
get('seat-map').addEventListener('keydown', (event) => {
  const button = event.target.closest('button');
  if (!button || !event.key.startsWith('Arrow')) return;
  const row = button.parentElement;
  const col = [...row.children].indexOf(button);
  let next;
  switch (event.key) {
    case 'ArrowRight': next = button.nextElementSibling; break;
    case 'ArrowLeft': next = button.previousElementSibling; break;
    case 'ArrowUp': next = row.previousElementSibling?.children[col]; break;
    case 'ArrowDown': next = row.nextElementSibling?.children[col]; break;
  }
  event.preventDefault();
  if (next?.matches('button')) {
    inspectSeat(next);
    next.focus();
  }
});
get('performance-select').addEventListener('change', selectPerformance);
get('section-select').addEventListener('change', renderSeats);

async function load() {
  const response = await fetch('./data/snapshot.json');
  if (!response.ok) throw new Error('HTTP ' + response.status);
  snapshot = await response.json();
  renderProgramme();
  get('load-status').hidden = true;
  if (location.hash === '#seating') get('seating').scrollIntoView();
}
load().catch((error) => {
  get('load-status').textContent = 'The catalogue could not be loaded. Reload this page to try again.';
  console.error('StagePass catalogue:', error);
});
